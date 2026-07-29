-- Legal numbering hardening.
-- Named series and the official no-series namespace "0" are independent.
-- All sequence writes are monotonic and number allocation is attached to the
-- legal document in the same database transaction.

CREATE OR REPLACE FUNCTION public.normalize_legal_series(p_series text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT translate(
    upper(COALESCE(NULLIF(btrim(p_series), ''), '0')),
    'ΑΒΔΕΖΗΙΚΜΝΟΠΡΣΤΥΧ',
    'ABDEZHIKMNOPPSTYX'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.normalize_legal_series(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.normalize_legal_series(text) TO authenticated;

ALTER TABLE public.legal_documents
  DROP CONSTRAINT IF EXISTS legal_documents_series_aa_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_legal_documents_number_namespace_unique
  ON public.legal_documents (
    document_kind,
    aade_document_type,
    public.normalize_legal_series(series),
    (
      CASE
        WHEN btrim(aa) ~ '^[0-9]{1,18}$'
          THEN (btrim(aa)::bigint)::text
        ELSE btrim(aa)
      END
    )
  )
  WHERE aa IS NOT NULL;

ALTER TABLE public.legal_numbering_sequences
  DROP CONSTRAINT IF EXISTS legal_numbering_sequences_document_kind_series_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_legal_numbering_sequences_normalized_unique
  ON public.legal_numbering_sequences (
    document_kind,
    aade_document_type,
    public.normalize_legal_series(series)
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_legal_numbering_sequences_one_active_kind
  ON public.legal_numbering_sequences (document_kind, aade_document_type)
  WHERE is_active;

CREATE OR REPLACE FUNCTION public.enforce_legal_numbering_sequence_safety()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_has_history boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.legal_documents AS document
      WHERE document.document_kind = OLD.document_kind
        AND document.aade_document_type = OLD.aade_document_type
        AND public.normalize_legal_series(document.series)
            = public.normalize_legal_series(OLD.series)
        AND document.aa IS NOT NULL
    )
    INTO v_has_history;

    IF OLD.next_aa > 1 OR v_has_history THEN
      RAISE EXCEPTION
        'Η χρησιμοποιημένη σειρά «%» δεν μπορεί να διαγραφεί. Διατηρεί ιστορικό αρίθμησης.',
        OLD.series
        USING ERRCODE = '23514';
    END IF;

    RETURN OLD;
  END IF;

  IF NEW.next_aa < OLD.next_aa THEN
    RAISE EXCEPTION
      'Το «Επόμενο» δεν μπορεί να μειωθεί (% -> %). Για νέα αρχή δημιουργήστε νέα σειρά.',
      OLD.next_aa,
      NEW.next_aa
      USING ERRCODE = '23514';
  END IF;

  IF NEW.document_kind IS DISTINCT FROM OLD.document_kind
     OR NEW.aade_document_type IS DISTINCT FROM OLD.aade_document_type
     OR public.normalize_legal_series(NEW.series)
        IS DISTINCT FROM public.normalize_legal_series(OLD.series) THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.legal_documents AS document
      WHERE document.document_kind = OLD.document_kind
        AND document.aade_document_type = OLD.aade_document_type
        AND public.normalize_legal_series(document.series)
            = public.normalize_legal_series(OLD.series)
        AND document.aa IS NOT NULL
    )
    INTO v_has_history;

    IF OLD.next_aa > 1 OR v_has_history THEN
      RAISE EXCEPTION
        'Η χρησιμοποιημένη σειρά «%» δεν μπορεί να μετονομαστεί. Δημιουργήστε νέα σειρά.',
        OLD.series
        USING ERRCODE = '23514';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_legal_numbering_sequence_safety
  ON public.legal_numbering_sequences;
CREATE TRIGGER trg_legal_numbering_sequence_safety
BEFORE UPDATE OR DELETE ON public.legal_numbering_sequences
FOR EACH ROW
EXECUTE FUNCTION public.enforce_legal_numbering_sequence_safety();

CREATE OR REPLACE FUNCTION public.protect_legal_document_number_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF OLD.series IS NOT NULL AND OLD.aa IS NOT NULL THEN
    IF NEW.series IS DISTINCT FROM OLD.series OR NEW.aa IS DISTINCT FROM OLD.aa THEN
      RAISE EXCEPTION
        'Η σειρά και ο Α/Α δεσμευμένου παραστατικού δεν μπορούν να αλλάξουν.'
        USING ERRCODE = '23514';
    END IF;

    IF NEW.issuer IS DISTINCT FROM OLD.issuer THEN
      RAISE EXCEPTION
        'Τα στοιχεία εκδότη έχουν αποθηκευτεί ως στιγμιότυπο έκδοσης και δεν μπορούν να αλλάξουν.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_legal_document_number_snapshot
  ON public.legal_documents;
CREATE TRIGGER trg_protect_legal_document_number_snapshot
BEFORE UPDATE ON public.legal_documents
FOR EACH ROW
EXECUTE FUNCTION public.protect_legal_document_number_snapshot();

CREATE OR REPLACE FUNCTION public.preview_legal_numbering_alignment()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_sequence public.legal_numbering_sequences%ROWTYPE;
  v_matching_count bigint;
  v_max_aa bigint;
  v_proposed_next bigint;
  v_sequence_snapshot jsonb;
  v_document_snapshot jsonb;
  v_changes jsonb := '[]'::jsonb;
  v_already_safe jsonb := '[]'::jsonb;
  v_new_namespaces jsonb := '[]'::jsonb;
  v_historical_series jsonb := '[]'::jsonb;
  v_historical record;
  v_entry jsonb;
  v_preview_token text;
BEGIN
  IF NOT public.is_legal_module_admin() THEN
    RAISE EXCEPTION 'Μόνο διαχειριστής μπορεί να ελέγξει την αρίθμηση.'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', sequence.id,
        'document_kind', sequence.document_kind,
        'aade_document_type', sequence.aade_document_type,
        'series_key', public.normalize_legal_series(sequence.series),
        'series', sequence.series,
        'next_aa', sequence.next_aa,
        'is_active', sequence.is_active
      )
      ORDER BY sequence.document_kind, sequence.aade_document_type, sequence.id
    ),
    '[]'::jsonb
  )
  INTO v_sequence_snapshot
  FROM public.legal_numbering_sequences AS sequence
  WHERE sequence.is_active;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', document.id,
        'document_kind', document.document_kind,
        'aade_document_type', document.aade_document_type,
        'series_key', public.normalize_legal_series(document.series),
        'aa', document.aa,
        'status', document.status
      )
      ORDER BY document.document_kind, document.aade_document_type, document.id
    ),
    '[]'::jsonb
  )
  INTO v_document_snapshot
  FROM public.legal_documents AS document
  WHERE document.status IN ('issued', 'cancelled', 'submitted', 'failed')
     OR (
       document.status = 'draft'
       AND NULLIF(btrim(document.series), '') IS NOT NULL
       AND NULLIF(btrim(document.aa), '') IS NOT NULL
     );

  v_preview_token := md5(
    jsonb_build_object(
      'sequences', v_sequence_snapshot,
      'documents', v_document_snapshot
    )::text
  );

  FOR v_sequence IN
    SELECT *
    FROM public.legal_numbering_sequences
    WHERE is_active
    ORDER BY document_kind, aade_document_type, id
  LOOP
    SELECT
      count(*),
      max(
        CASE
          WHEN btrim(document.aa) ~ '^[0-9]{1,18}$'
               AND btrim(document.aa)::bigint > 0
            THEN btrim(document.aa)::bigint
          ELSE NULL
        END
      )
    INTO v_matching_count, v_max_aa
    FROM public.legal_documents AS document
    WHERE document.document_kind = v_sequence.document_kind
      AND document.aade_document_type = v_sequence.aade_document_type
      AND public.normalize_legal_series(document.series)
          = public.normalize_legal_series(v_sequence.series)
      AND (
        document.status IN ('issued', 'cancelled', 'submitted', 'failed')
        OR (
          document.status = 'draft'
          AND NULLIF(btrim(document.series), '') IS NOT NULL
          AND NULLIF(btrim(document.aa), '') IS NOT NULL
        )
      );

    v_proposed_next := COALESCE(v_max_aa, 0) + 1;
    v_entry := jsonb_build_object(
      'sequence_id', v_sequence.id,
      'document_kind', v_sequence.document_kind,
      'aade_document_type', v_sequence.aade_document_type,
      'series', v_sequence.series,
      'series_key', public.normalize_legal_series(v_sequence.series),
      'current_next_aa', v_sequence.next_aa,
      'max_aa', v_max_aa,
      'proposed_next_aa', greatest(v_sequence.next_aa, v_proposed_next),
      'document_count', v_matching_count
    );

    IF v_matching_count = 0 THEN
      v_new_namespaces := v_new_namespaces || jsonb_build_array(v_entry);
    ELSIF v_proposed_next > v_sequence.next_aa THEN
      v_changes := v_changes || jsonb_build_array(v_entry);
    ELSE
      v_already_safe := v_already_safe || jsonb_build_array(v_entry);
    END IF;

    FOR v_historical IN
      WITH status_groups AS (
        SELECT
          public.normalize_legal_series(document.series) AS series_key,
          min(COALESCE(NULLIF(btrim(document.series), ''), '0')) AS series,
          document.status,
          count(*) AS status_count,
          max(
            CASE
              WHEN btrim(document.aa) ~ '^[0-9]{1,18}$'
                   AND btrim(document.aa)::bigint > 0
                THEN btrim(document.aa)::bigint
              ELSE NULL
            END
          ) AS max_aa
        FROM public.legal_documents AS document
        WHERE document.document_kind = v_sequence.document_kind
          AND document.aade_document_type = v_sequence.aade_document_type
          AND public.normalize_legal_series(document.series)
              <> public.normalize_legal_series(v_sequence.series)
          AND (
            document.status IN ('issued', 'cancelled', 'submitted', 'failed')
            OR (
              document.status = 'draft'
              AND NULLIF(btrim(document.series), '') IS NOT NULL
              AND NULLIF(btrim(document.aa), '') IS NOT NULL
            )
          )
        GROUP BY
          public.normalize_legal_series(document.series),
          document.status
      )
      SELECT
        status_groups.series_key,
        min(status_groups.series) AS series,
        sum(status_groups.status_count) AS document_count,
        max(status_groups.max_aa) AS max_aa,
        jsonb_object_agg(
          status_groups.status,
          status_groups.status_count
          ORDER BY status_groups.status
        ) AS status_counts
      FROM status_groups
      GROUP BY status_groups.series_key
      ORDER BY status_groups.series_key
    LOOP
      v_historical_series := v_historical_series || jsonb_build_array(
        jsonb_build_object(
          'active_sequence_id', v_sequence.id,
          'document_kind', v_sequence.document_kind,
          'aade_document_type', v_sequence.aade_document_type,
          'active_series', v_sequence.series,
          'series', v_historical.series,
          'series_key', v_historical.series_key,
          'document_count', v_historical.document_count,
          'max_aa', v_historical.max_aa,
          'status_counts', v_historical.status_counts,
          'is_no_series_namespace', v_historical.series_key = '0'
        )
      );
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'preview_token', v_preview_token,
    'generated_at', now(),
    'changes', v_changes,
    'already_safe', v_already_safe,
    'new_namespaces', v_new_namespaces,
    'historical_series', v_historical_series
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.preview_legal_numbering_alignment()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_legal_numbering_alignment()
  TO authenticated;

CREATE OR REPLACE FUNCTION public.apply_legal_numbering_alignment(
  p_expected_preview_token text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_preview jsonb;
  v_result_preview jsonb;
  v_item jsonb;
  v_applied jsonb := '[]'::jsonb;
  v_sequence_id uuid;
  v_old_next bigint;
  v_new_next bigint;
  v_actor_name text;
BEGIN
  IF NOT public.is_legal_module_admin() THEN
    RAISE EXCEPTION 'Μόνο διαχειριστής μπορεί να εφαρμόσει ευθυγράμμιση.'
      USING ERRCODE = '42501';
  END IF;

  IF NULLIF(btrim(p_expected_preview_token), '') IS NULL THEN
    RAISE EXCEPTION 'Λείπει το αναγνωριστικό προεπισκόπησης.'
      USING ERRCODE = '22023';
  END IF;

  PERFORM sequence.id
  FROM public.legal_numbering_sequences AS sequence
  WHERE sequence.is_active
  ORDER BY sequence.id
  FOR UPDATE;

  -- Freeze number-bearing archive rows while the confirmed preview is
  -- recomputed and applied. This closes the gap with concurrent issuance.
  LOCK TABLE public.legal_documents IN SHARE MODE;

  v_preview := public.preview_legal_numbering_alignment();
  IF v_preview->>'preview_token' IS DISTINCT FROM p_expected_preview_token THEN
    RAISE EXCEPTION
      'Η αρίθμηση ή το Αρχείο άλλαξαν μετά την προεπισκόπηση. Ελέγξτε ξανά πριν την εφαρμογή.'
      USING ERRCODE = '40001';
  END IF;

  SELECT profile.full_name
  INTO v_actor_name
  FROM public.profiles AS profile
  WHERE profile.id = (SELECT auth.uid());

  FOR v_item IN
    SELECT value
    FROM jsonb_array_elements(v_preview->'changes')
  LOOP
    v_sequence_id := (v_item->>'sequence_id')::uuid;

    SELECT sequence.next_aa
    INTO v_old_next
    FROM public.legal_numbering_sequences AS sequence
    WHERE sequence.id = v_sequence_id
    FOR UPDATE;

    UPDATE public.legal_numbering_sequences AS sequence
    SET next_aa = greatest(
          sequence.next_aa,
          (v_item->>'proposed_next_aa')::bigint
        ),
        updated_at = now()
    WHERE sequence.id = v_sequence_id
    RETURNING sequence.next_aa INTO v_new_next;

    INSERT INTO public.legal_audit_log (
      document_id,
      action,
      user_name,
      details
    )
    VALUES (
      NULL,
      'numbering_alignment_applied',
      v_actor_name,
      jsonb_build_object(
        'sequence_id', v_sequence_id,
        'document_kind', v_item->>'document_kind',
        'aade_document_type', v_item->>'aade_document_type',
        'series', v_item->>'series',
        'old_next_aa', v_old_next,
        'new_next_aa', v_new_next,
        'archive_max_aa', (v_item->>'max_aa')::bigint,
        'document_count', (v_item->>'document_count')::bigint
      )
    );

    v_applied := v_applied || jsonb_build_array(
      jsonb_build_object(
        'sequence_id', v_sequence_id,
        'series', v_item->>'series',
        'old_next_aa', v_old_next,
        'new_next_aa', v_new_next
      )
    );
  END LOOP;

  v_result_preview := public.preview_legal_numbering_alignment();
  RETURN jsonb_build_object(
    'applied', v_applied,
    'preview', v_result_preview
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_legal_numbering_alignment(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_legal_numbering_alignment(text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.prepare_legal_document_submission(
  p_document_id uuid
)
RETURNS public.legal_documents
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_document public.legal_documents%ROWTYPE;
  v_sequence public.legal_numbering_sequences%ROWTYPE;
  v_issuer jsonb;
  v_actor_name text;
BEGIN
  IF NOT public.is_legal_module_admin() THEN
    RAISE EXCEPTION 'Μόνο διαχειριστής μπορεί να εκδώσει παραστατικό.'
      USING ERRCODE = '42501';
  END IF;

  SELECT document.*
  INTO v_document
  FROM public.legal_documents AS document
  WHERE document.id = p_document_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Το παραστατικό δεν βρέθηκε.'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_document.status = 'issued' THEN
    RETURN v_document;
  END IF;

  IF v_document.status = 'cancelled' THEN
    RAISE EXCEPTION 'Το παραστατικό έχει ακυρωθεί.'
      USING ERRCODE = '23514';
  END IF;

  IF v_document.status NOT IN ('draft', 'failed', 'submitted') THEN
    RAISE EXCEPTION 'Η κατάσταση του παραστατικού δεν επιτρέπει έκδοση.'
      USING ERRCODE = '23514';
  END IF;

  IF (v_document.series IS NULL) <> (v_document.aa IS NULL) THEN
    RAISE EXCEPTION 'Το παραστατικό έχει ελλιπή σειρά ή Α/Α και χρειάζεται έλεγχο.'
      USING ERRCODE = '23514';
  END IF;

  IF v_document.series IS NOT NULL AND v_document.aa IS NOT NULL THEN
    RETURN v_document;
  END IF;

  SELECT sequence.*
  INTO v_sequence
  FROM public.legal_numbering_sequences AS sequence
  WHERE sequence.is_active
    AND sequence.document_kind = v_document.document_kind
    AND sequence.aade_document_type = v_document.aade_document_type
  ORDER BY sequence.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Δεν υπάρχει ενεργή σειρά για αυτόν τον τύπο παραστατικού.'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT settings.issuer
  INTO v_issuer
  FROM public.legal_settings AS settings
  ORDER BY settings.updated_at DESC
  LIMIT 1;

  UPDATE public.legal_numbering_sequences AS sequence
  SET next_aa = sequence.next_aa + 1,
      updated_at = now()
  WHERE sequence.id = v_sequence.id;

  UPDATE public.legal_documents AS document
  SET series = COALESCE(NULLIF(btrim(v_sequence.series), ''), '0'),
      aa = v_sequence.next_aa::text,
      issuer = COALESCE(v_issuer, document.issuer),
      updated_at = now()
  WHERE document.id = v_document.id
  RETURNING document.* INTO v_document;

  SELECT profile.full_name
  INTO v_actor_name
  FROM public.profiles AS profile
  WHERE profile.id = (SELECT auth.uid());

  INSERT INTO public.legal_audit_log (
    document_id,
    action,
    user_name,
    details
  )
  VALUES (
    v_document.id,
    'number_allocated',
    v_actor_name,
    jsonb_build_object(
      'sequence_id', v_sequence.id,
      'document_kind', v_document.document_kind,
      'aade_document_type', v_document.aade_document_type,
      'series', v_document.series,
      'aa', v_document.aa
    )
  );

  RETURN v_document;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.prepare_legal_document_submission(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prepare_legal_document_submission(uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.apply_legal_archive_reindex_batch(
  p_documents jsonb,
  p_lines jsonb
)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_updated integer := 0;
BEGIN
  IF NOT public.is_legal_module_admin() THEN
    RAISE EXCEPTION 'Μόνο διαχειριστής μπορεί να επανευρετηριάσει το Αρχείο.'
      USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(COALESCE(p_documents, '[]'::jsonb)) <> 'array'
     OR jsonb_typeof(COALESCE(p_lines, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Μη έγκυρο batch επανευρετηρίασης.'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.legal_document_lines AS target
  SET line_number = source.line_number,
      sku = source.sku,
      variant_suffix = source.variant_suffix,
      description = source.description,
      quantity = source.quantity,
      unit_price = source.unit_price,
      net_value = source.net_value,
      vat_category = source.vat_category,
      vat_amount = source.vat_amount,
      gross_value = source.gross_value,
      measurement_unit = source.measurement_unit,
      item_code = source.item_code,
      income_classification = source.income_classification,
      source_order_line_key = source.source_order_line_key,
      line_id = source.line_id,
      source_metadata = COALESCE(source.source_metadata, '{}'::jsonb)
  FROM jsonb_to_recordset(COALESCE(p_lines, '[]'::jsonb)) AS source(
    id uuid,
    document_id uuid,
    line_number integer,
    sku text,
    variant_suffix text,
    description text,
    quantity numeric,
    unit_price numeric,
    net_value numeric,
    vat_category integer,
    vat_amount numeric,
    gross_value numeric,
    measurement_unit integer,
    item_code text,
    income_classification jsonb,
    source_order_line_key text,
    line_id text,
    source_metadata jsonb
  )
  WHERE target.id = source.id
    AND target.document_id = source.document_id;

  UPDATE public.legal_documents AS target
  SET counterpart = source.counterpart,
      archive_parse_version = source.archive_parse_version,
      updated_at = now()
  FROM jsonb_to_recordset(COALESCE(p_documents, '[]'::jsonb)) AS source(
    id uuid,
    counterpart jsonb,
    archive_parse_version integer
  )
  WHERE target.id = source.id
    AND target.external_source = 'aade_sync'
    AND target.raw_xml IS NOT NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_legal_archive_reindex_batch(jsonb, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_legal_archive_reindex_batch(jsonb, jsonb)
  TO authenticated;

COMMENT ON FUNCTION public.preview_legal_numbering_alignment() IS
  'Live, read-only numbering alignment preview grouped by kind, AADE type and normalized series namespace.';
COMMENT ON FUNCTION public.apply_legal_numbering_alignment(text) IS
  'Applies only monotonic numbering changes after locking and revalidating the preview token.';
COMMENT ON FUNCTION public.prepare_legal_document_submission(uuid) IS
  'Idempotently allocates a number and snapshots the issuer on the legal document in one transaction.';
COMMENT ON FUNCTION public.apply_legal_archive_reindex_batch(jsonb, jsonb) IS
  'Idempotently applies parser-only archive enrichment in bounded batches without replacing official AADE snapshots or user links.';

-- The legacy allocator remains executable during the compatible frontend
-- rollout. Its authenticated grant is removed only after every deployed client
-- uses prepare_legal_document_submission(document_id).
