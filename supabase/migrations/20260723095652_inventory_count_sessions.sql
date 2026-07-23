-- Server-backed inventory count sessions.
--
-- A session is intentionally lightweight when it starts: it stores only its
-- warehouse scope and a stable catalog target total. Targets and exact count
-- entries are persisted incrementally in atomic batches. The existing
-- post_inventory_entries_v1 command remains the single balance-posting
-- boundary, so balance locks, audit events, idempotency and the temporary
-- legacy projection stay consistent.

CREATE TABLE public.inventory_count_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_code text NOT NULL UNIQUE,
  name text NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  warehouse_ids uuid[] NOT NULL,
  total_target_count integer NOT NULL,
  counted_target_count integer NOT NULL DEFAULT 0,
  counted_line_count integer NOT NULL DEFAULT 0,
  counted_zero_count integer NOT NULL DEFAULT 0,
  changed_line_count integer NOT NULL DEFAULT 0,
  posted_batch_count integer NOT NULL DEFAULT 0,
  version bigint NOT NULL DEFAULT 1,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_by uuid,
  completed_at timestamptz,
  allow_partial_completion boolean NOT NULL DEFAULT false,
  abandoned_by uuid,
  abandoned_at timestamptz,
  abandonment_reason text,
  CONSTRAINT inventory_count_sessions_name_check
    CHECK (BTRIM(name) <> '' AND char_length(BTRIM(name)) <= 120),
  CONSTRAINT inventory_count_sessions_reason_check
    CHECK (BTRIM(reason) <> '' AND char_length(BTRIM(reason)) <= 500),
  CONSTRAINT inventory_count_sessions_status_check
    CHECK (status IN ('active', 'completed', 'abandoned')),
  CONSTRAINT inventory_count_sessions_warehouses_check
    CHECK (cardinality(warehouse_ids) BETWEEN 1 AND 20),
  CONSTRAINT inventory_count_sessions_totals_check
    CHECK (
      total_target_count >= 0
      AND counted_target_count BETWEEN 0 AND total_target_count
      AND counted_line_count >= 0
      AND counted_zero_count BETWEEN 0 AND counted_line_count
      AND changed_line_count BETWEEN 0 AND counted_line_count
      AND posted_batch_count >= 0
    ),
  CONSTRAINT inventory_count_sessions_lifecycle_check
    CHECK (
      (
        status = 'active'
        AND completed_by IS NULL AND completed_at IS NULL
        AND abandoned_by IS NULL AND abandoned_at IS NULL
        AND abandonment_reason IS NULL
      )
      OR (
        status = 'completed'
        AND completed_by IS NOT NULL AND completed_at IS NOT NULL
        AND abandoned_by IS NULL AND abandoned_at IS NULL
        AND abandonment_reason IS NULL
      )
      OR (
        status = 'abandoned'
        AND completed_by IS NULL AND completed_at IS NULL
        AND abandoned_by IS NOT NULL AND abandoned_at IS NOT NULL
        AND BTRIM(COALESCE(abandonment_reason, '')) <> ''
      )
    )
);

CREATE INDEX inventory_count_sessions_status_created_idx
  ON public.inventory_count_sessions (status, created_at DESC);

CREATE TABLE public.inventory_count_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL
    REFERENCES public.inventory_count_sessions(id) ON DELETE RESTRICT,
  batch_number integer NOT NULL,
  idempotency_key text NOT NULL,
  posting_idempotency_key text NOT NULL UNIQUE,
  target_count integer NOT NULL,
  line_count integer NOT NULL,
  changed_line_count integer NOT NULL DEFAULT 0,
  counted_zero_count integer NOT NULL DEFAULT 0,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  posted_by uuid NOT NULL,
  posted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_count_batches_session_number_unique
    UNIQUE (session_id, batch_number),
  CONSTRAINT inventory_count_batches_session_key_unique
    UNIQUE (session_id, idempotency_key),
  CONSTRAINT inventory_count_batches_id_session_unique
    UNIQUE (id, session_id),
  CONSTRAINT inventory_count_batches_counts_check
    CHECK (
      batch_number > 0
      AND target_count BETWEEN 1 AND 200
      AND line_count BETWEEN 1 AND 500
      AND changed_line_count BETWEEN 0 AND line_count
      AND counted_zero_count BETWEEN 0 AND line_count
    ),
  CONSTRAINT inventory_count_batches_key_check
    CHECK (
      BTRIM(idempotency_key) <> ''
      AND char_length(idempotency_key) <= 200
      AND BTRIM(posting_idempotency_key) <> ''
      AND char_length(posting_idempotency_key) <= 200
    )
);

CREATE INDEX inventory_count_batches_session_posted_idx
  ON public.inventory_count_batches (session_id, posted_at DESC);

CREATE TABLE public.inventory_count_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL
    REFERENCES public.inventory_count_sessions(id) ON DELETE RESTRICT,
  batch_id uuid NOT NULL,
  product_sku text NOT NULL,
  variant_suffix text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'counted',
  line_count integer NOT NULL,
  counted_zero_count integer NOT NULL DEFAULT 0,
  changed_line_count integer NOT NULL DEFAULT 0,
  counted_by uuid NOT NULL,
  counted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_count_targets_session_identity_unique
    UNIQUE (session_id, product_sku, variant_suffix),
  CONSTRAINT inventory_count_targets_id_session_unique
    UNIQUE (id, session_id),
  CONSTRAINT inventory_count_targets_batch_session_fk
    FOREIGN KEY (batch_id, session_id)
    REFERENCES public.inventory_count_batches(id, session_id)
    ON DELETE RESTRICT,
  CONSTRAINT inventory_count_targets_product_fk
    FOREIGN KEY (product_sku)
    REFERENCES public.products(sku)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT inventory_count_targets_status_check
    CHECK (status = 'counted'),
  CONSTRAINT inventory_count_targets_counts_check
    CHECK (
      BTRIM(product_sku) <> ''
      AND line_count BETWEEN 1 AND 500
      AND counted_zero_count BETWEEN 0 AND line_count
      AND changed_line_count BETWEEN 0 AND line_count
    )
);

CREATE INDEX inventory_count_targets_session_counted_idx
  ON public.inventory_count_targets (session_id, counted_at DESC);

CREATE INDEX inventory_count_targets_catalog_identity_idx
  ON public.inventory_count_targets (product_sku, variant_suffix, session_id);

CREATE TABLE public.inventory_count_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL
    REFERENCES public.inventory_count_sessions(id) ON DELETE RESTRICT,
  target_id uuid NOT NULL,
  batch_id uuid NOT NULL,
  product_sku text NOT NULL,
  variant_suffix text NOT NULL DEFAULT '',
  size_info text NOT NULL DEFAULT '',
  warehouse_id uuid NOT NULL
    REFERENCES public.warehouses(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  counted_quantity integer NOT NULL,
  on_hand_before integer NOT NULL,
  on_hand_after integer NOT NULL,
  on_hand_delta integer NOT NULL,
  reserved_after integer NOT NULL,
  source_event_id uuid NOT NULL UNIQUE
    REFERENCES public.inventory_events(id) ON DELETE RESTRICT,
  posting_idempotency_key text NOT NULL,
  counted_by uuid NOT NULL,
  counted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_count_entries_session_identity_unique
    UNIQUE (
      session_id, product_sku, variant_suffix, size_info, warehouse_id
    ),
  CONSTRAINT inventory_count_entries_target_session_fk
    FOREIGN KEY (target_id, session_id)
    REFERENCES public.inventory_count_targets(id, session_id)
    ON DELETE RESTRICT,
  CONSTRAINT inventory_count_entries_batch_session_fk
    FOREIGN KEY (batch_id, session_id)
    REFERENCES public.inventory_count_batches(id, session_id)
    ON DELETE RESTRICT,
  CONSTRAINT inventory_count_entries_quantities_check
    CHECK (
      counted_quantity >= 0
      AND on_hand_before >= 0
      AND on_hand_after >= 0
      AND reserved_after >= 0
      AND reserved_after <= on_hand_after
      AND on_hand_after = on_hand_before + on_hand_delta
    )
);

CREATE INDEX inventory_count_entries_session_target_idx
  ON public.inventory_count_entries (session_id, target_id, counted_at);

CREATE INDEX inventory_count_entries_inventory_identity_idx
  ON public.inventory_count_entries (
    product_sku, variant_suffix, size_info, warehouse_id, counted_at DESC
  );

CREATE OR REPLACE VIEW public.inventory_count_session_progress_v
WITH (security_invoker = true)
AS
SELECT
  session_row.id,
  session_row.session_code,
  session_row.name,
  session_row.reason,
  session_row.status,
  session_row.warehouse_ids,
  session_row.total_target_count,
  session_row.counted_target_count,
  GREATEST(
    session_row.total_target_count - session_row.counted_target_count,
    0
  ) AS remaining_target_count,
  CASE
    WHEN session_row.total_target_count = 0 THEN 0::numeric
    ELSE ROUND(
      session_row.counted_target_count::numeric
      * 100
      / session_row.total_target_count,
      2
    )
  END AS progress_percent,
  session_row.counted_line_count,
  session_row.counted_zero_count,
  session_row.changed_line_count,
  session_row.posted_batch_count,
  session_row.version,
  session_row.created_by,
  session_row.created_at,
  session_row.updated_at,
  session_row.completed_by,
  session_row.completed_at,
  session_row.allow_partial_completion,
  session_row.abandoned_by,
  session_row.abandoned_at,
  session_row.abandonment_reason
FROM public.inventory_count_sessions session_row;

CREATE OR REPLACE FUNCTION private.inventory_count_session_summary(
  p_session_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', session_row.id,
    'session_code', session_row.session_code,
    'name', session_row.name,
    'reason', session_row.reason,
    'status', session_row.status,
    'warehouse_ids', to_jsonb(session_row.warehouse_ids),
    'warehouses', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', warehouse.id,
          'name', warehouse.name,
          'type', warehouse.type
        )
        ORDER BY scope.ordinality
      )
      FROM unnest(session_row.warehouse_ids)
        WITH ORDINALITY AS scope(warehouse_id, ordinality)
      JOIN public.warehouses warehouse ON warehouse.id = scope.warehouse_id
    ), '[]'::jsonb),
    'total_target_count', session_row.total_target_count,
    'counted_target_count', session_row.counted_target_count,
    'remaining_target_count', GREATEST(
      session_row.total_target_count - session_row.counted_target_count,
      0
    ),
    'progress_percent', CASE
      WHEN session_row.total_target_count = 0 THEN 0
      ELSE ROUND(
        session_row.counted_target_count::numeric
        * 100
        / session_row.total_target_count,
        2
      )
    END,
    'counted_line_count', session_row.counted_line_count,
    'counted_zero_count', session_row.counted_zero_count,
    'changed_line_count', session_row.changed_line_count,
    'posted_batch_count', session_row.posted_batch_count,
    'version', session_row.version,
    'created_by', session_row.created_by,
    'created_at', session_row.created_at,
    'updated_at', session_row.updated_at,
    'completed_by', session_row.completed_by,
    'completed_at', session_row.completed_at,
    'allow_partial_completion', session_row.allow_partial_completion,
    'abandoned_by', session_row.abandoned_by,
    'abandoned_at', session_row.abandoned_at,
    'abandonment_reason', session_row.abandonment_reason
  )
  FROM public.inventory_count_sessions session_row
  WHERE session_row.id = p_session_id;
$$;

REVOKE ALL ON FUNCTION private.inventory_count_session_summary(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.inventory_count_session_summary(uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.start_inventory_count_session_v1(
  p_name text,
  p_reason text,
  p_warehouse_ids uuid[],
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_command_key text;
  v_command public.inventory_command_results%ROWTYPE;
  v_session_id uuid := gen_random_uuid();
  v_warehouse_ids uuid[];
  v_total_target_count integer;
  v_result jsonb;
BEGIN
  PERFORM private.assert_inventory_role(ARRAY['admin']);

  IF BTRIM(COALESCE(p_name, '')) = ''
     OR char_length(BTRIM(p_name)) > 120 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Η Συνεδρία Απογραφής δεν δημιουργήθηκε. Ο τίτλος είναι υποχρεωτικός και πρέπει να περιέχει έως 120 χαρακτήρες. Δεν πραγματοποιήθηκε καμία μεταβολή. Συμπληρώστε έναν σαφή τίτλο και δοκιμάστε ξανά.';
  END IF;

  IF BTRIM(COALESCE(p_reason, '')) = ''
     OR char_length(BTRIM(p_reason)) > 500 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Η Συνεδρία Απογραφής δεν δημιουργήθηκε. Η αιτιολογία είναι υποχρεωτική και πρέπει να περιέχει έως 500 χαρακτήρες. Δεν πραγματοποιήθηκε καμία μεταβολή. Συμπληρώστε την αιτιολογία της απογραφής και δοκιμάστε ξανά.';
  END IF;

  IF p_warehouse_ids IS NULL
     OR cardinality(p_warehouse_ids) NOT BETWEEN 1 AND 20
     OR array_position(p_warehouse_ids, NULL) IS NOT NULL
     OR (
       SELECT COUNT(DISTINCT warehouse_id)
       FROM unnest(p_warehouse_ids) warehouse_id
     ) <> cardinality(p_warehouse_ids) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Η Συνεδρία Απογραφής δεν δημιουργήθηκε. Επιλέξτε από 1 έως 20 διαφορετικές αποθήκες. Δεν πραγματοποιήθηκε καμία μεταβολή. Ελέγξτε τις επιλεγμένες αποθήκες και δοκιμάστε ξανά.';
  END IF;

  SELECT array_agg(warehouse_id ORDER BY warehouse_id)
  INTO v_warehouse_ids
  FROM unnest(p_warehouse_ids) warehouse_id;

  IF EXISTS (
    SELECT 1
    FROM unnest(v_warehouse_ids) requested(warehouse_id)
    LEFT JOIN public.warehouses warehouse
      ON warehouse.id = requested.warehouse_id
    WHERE warehouse.id IS NULL
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Η Συνεδρία Απογραφής δεν δημιουργήθηκε. Μία ή περισσότερες επιλεγμένες αποθήκες δεν υπάρχουν πλέον. Δεν πραγματοποιήθηκε καμία μεταβολή. Ανανεώστε τη λίστα αποθηκών και δοκιμάστε ξανά.';
  END IF;

  IF BTRIM(COALESCE(p_idempotency_key, '')) = ''
     OR char_length(BTRIM(p_idempotency_key)) > 200 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Η Συνεδρία Απογραφής δεν δημιουργήθηκε επειδή λείπει το ασφαλές αναγνωριστικό υποβολής. Δεν πραγματοποιήθηκε καμία μεταβολή. Δοκιμάστε ξανά.';
  END IF;

  v_command_key :=
    'inventory-count-start:' || md5(BTRIM(p_idempotency_key));

  PERFORM pg_advisory_xact_lock(hashtextextended(v_command_key, 0));

  SELECT *
  INTO v_command
  FROM public.inventory_command_results command_result
  WHERE command_result.idempotency_key = v_command_key;

  IF FOUND THEN
    IF v_command.operation_type <> 'inventory_count_session_start' THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'Η Συνεδρία Απογραφής δεν δημιουργήθηκε. Το ασφαλές αναγνωριστικό έχει ήδη χρησιμοποιηθεί σε διαφορετική ενέργεια. Δεν πραγματοποιήθηκε καμία μεταβολή. Ξεκινήστε νέα υποβολή.';
    END IF;
    RETURN jsonb_set(v_command.result, '{idempotent}', 'true'::jsonb, true);
  END IF;

  -- Serialize starts so two operators cannot create overlapping active
  -- sessions for the same warehouse scope.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('inventory-count-session-start', 0)
  );

  IF EXISTS (
    SELECT 1
    FROM public.inventory_count_sessions active_session
    WHERE active_session.status = 'active'
      AND active_session.warehouse_ids && v_warehouse_ids
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Η Συνεδρία Απογραφής δεν δημιουργήθηκε. Υπάρχει ήδη ενεργή συνεδρία που περιλαμβάνει μία από τις επιλεγμένες αποθήκες. Δεν πραγματοποιήθηκε καμία μεταβολή. Συνεχίστε την ενεργή συνεδρία ή ολοκληρώστε την πριν ξεκινήσετε νέα.';
  END IF;

  SELECT COUNT(*)::integer
  INTO v_total_target_count
  FROM (
    SELECT product.sku, ''::text AS variant_suffix
    FROM public.products product
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.product_variants variant
      WHERE variant.product_sku = product.sku
    )
    UNION ALL
    SELECT variant.product_sku, COALESCE(variant.suffix, '')
    FROM public.product_variants variant
  ) catalog;

  INSERT INTO public.inventory_count_sessions (
    id,
    session_code,
    name,
    reason,
    warehouse_ids,
    total_target_count,
    created_by
  )
  VALUES (
    v_session_id,
    'ΑΠΟ-' || to_char(CURRENT_DATE, 'YYYYMMDD')
      || '-' || upper(substr(replace(v_session_id::text, '-', ''), 1, 8)),
    BTRIM(p_name),
    BTRIM(p_reason),
    v_warehouse_ids,
    v_total_target_count,
    v_actor
  );

  v_result := jsonb_build_object(
    'session', private.inventory_count_session_summary(v_session_id),
    'idempotent', false
  );

  INSERT INTO public.inventory_command_results (
    idempotency_key,
    operation_type,
    result,
    actor_user_id
  )
  VALUES (
    v_command_key,
    'inventory_count_session_start',
    v_result,
    v_actor
  );

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_inventory_count_session_v1(
  p_session_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_summary jsonb;
  v_batches jsonb;
BEGIN
  PERFORM private.assert_inventory_role(ARRAY['admin']);

  v_summary := private.inventory_count_session_summary(p_session_id);
  IF v_summary IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'Η Συνεδρία Απογραφής δεν βρέθηκε. Δεν πραγματοποιήθηκε καμία μεταβολή. Ανανεώστε τη λίστα συνεδριών και επιλέξτε ξανά.';
  END IF;

  SELECT COALESCE(jsonb_agg(batch_row.payload ORDER BY batch_row.batch_number DESC), '[]'::jsonb)
  INTO v_batches
  FROM (
    SELECT
      batch.batch_number,
      jsonb_build_object(
        'id', batch.id,
        'batch_number', batch.batch_number,
        'target_count', batch.target_count,
        'line_count', batch.line_count,
        'changed_line_count', batch.changed_line_count,
        'counted_zero_count', batch.counted_zero_count,
        'posted_by', batch.posted_by,
        'posted_at', batch.posted_at
      ) AS payload
    FROM public.inventory_count_batches batch
    WHERE batch.session_id = p_session_id
    ORDER BY batch.batch_number DESC
    LIMIT 20
  ) batch_row;

  RETURN jsonb_build_object(
    'session', v_summary,
    'recent_batches', v_batches
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.search_inventory_count_targets_v1(
  p_session_id uuid,
  p_search text DEFAULT '',
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_only_uncounted boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_session public.inventory_count_sessions%ROWTYPE;
  v_search text := upper(BTRIM(COALESCE(p_search, '')));
  v_result jsonb;
BEGIN
  PERFORM private.assert_inventory_role(ARRAY['admin']);

  IF p_limit IS NULL
     OR p_limit NOT BETWEEN 1 AND 100
     OR p_offset IS NULL
     OR p_offset < 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Η αναζήτηση της Συνεδρίας Απογραφής δεν ολοκληρώθηκε. Το μέγεθος σελίδας πρέπει να είναι από 1 έως 100 και η μετατόπιση μη αρνητική. Δεν πραγματοποιήθηκε καμία μεταβολή. Επαναφέρετε τα φίλτρα και δοκιμάστε ξανά.';
  END IF;

  IF char_length(BTRIM(COALESCE(p_search, ''))) > 120 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Η αναζήτηση της Συνεδρίας Απογραφής δεν ολοκληρώθηκε επειδή το κείμενο αναζήτησης είναι υπερβολικά μεγάλο. Δεν πραγματοποιήθηκε καμία μεταβολή. Χρησιμοποιήστε έως 120 χαρακτήρες και δοκιμάστε ξανά.';
  END IF;

  SELECT *
  INTO v_session
  FROM public.inventory_count_sessions session_row
  WHERE session_row.id = p_session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'Η Συνεδρία Απογραφής δεν βρέθηκε. Δεν πραγματοποιήθηκε καμία μεταβολή. Ανανεώστε τη λίστα συνεδριών και επιλέξτε ξανά.';
  END IF;

  WITH catalog AS (
    SELECT
      product.sku AS product_sku,
      ''::text AS variant_suffix,
      product.sku AS full_sku,
      COALESCE(product.description, '') AS product_description,
      ''::text AS variant_description,
      COALESCE(product.category, '') AS category,
      product.image_url
    FROM public.products product
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.product_variants variant
      WHERE variant.product_sku = product.sku
    )
    UNION ALL
    SELECT
      variant.product_sku,
      COALESCE(variant.suffix, ''),
      variant.product_sku || COALESCE(variant.suffix, ''),
      COALESCE(product.description, ''),
      COALESCE(variant.description, ''),
      COALESCE(product.category, ''),
      product.image_url
    FROM public.product_variants variant
    JOIN public.products product ON product.sku = variant.product_sku
  ),
  enriched AS (
    SELECT
      catalog.*,
      counted_target.id AS target_id,
      counted_target.counted_at,
      counted_target.line_count,
      counted_target.counted_zero_count,
      counted_target.changed_line_count,
      counted_target.id IS NOT NULL AS is_counted,
      COALESCE(stock.on_hand, 0) AS on_hand,
      COALESCE(stock.reserved, 0) AS reserved,
      COALESCE(stock.on_hand, 0) - COALESCE(stock.reserved, 0) AS available
    FROM catalog
    LEFT JOIN public.inventory_count_targets counted_target
      ON counted_target.session_id = v_session.id
     AND counted_target.product_sku = catalog.product_sku
     AND counted_target.variant_suffix = catalog.variant_suffix
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(SUM(balance.on_hand), 0)::integer AS on_hand,
        COALESCE(SUM(balance.reserved), 0)::integer AS reserved
      FROM public.inventory_balances balance
      WHERE balance.product_sku = catalog.product_sku
        AND balance.variant_suffix = catalog.variant_suffix
        AND balance.warehouse_id = ANY(v_session.warehouse_ids)
    ) stock ON true
  ),
  filtered AS (
    SELECT
      enriched.*,
      CASE
        WHEN v_search <> '' AND upper(enriched.full_sku) = v_search THEN 0
        WHEN v_search <> '' AND upper(enriched.product_sku) = v_search THEN 1
        WHEN v_search <> '' AND upper(enriched.full_sku) LIKE v_search || '%' THEN 2
        ELSE 3
      END AS search_rank
    FROM enriched
    WHERE (
      v_search = ''
      OR upper(enriched.full_sku) LIKE '%' || v_search || '%'
      OR upper(enriched.product_sku) LIKE '%' || v_search || '%'
      OR upper(enriched.product_description) LIKE '%' || v_search || '%'
      OR upper(enriched.variant_description) LIKE '%' || v_search || '%'
      OR upper(enriched.category) LIKE '%' || v_search || '%'
    )
      AND (
        NOT COALESCE(p_only_uncounted, false)
        OR NOT enriched.is_counted
      )
  ),
  page AS (
    SELECT *
    FROM filtered
    ORDER BY search_rank, full_sku, product_sku, variant_suffix
    LIMIT p_limit
    OFFSET p_offset
  )
  SELECT jsonb_build_object(
    'session_id', v_session.id,
    'status', v_session.status,
    'query', BTRIM(COALESCE(p_search, '')),
    'limit', p_limit,
    'offset', p_offset,
    'total_matches', (SELECT COUNT(*) FROM filtered),
    'items', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'target_id', page.target_id,
          'product_sku', page.product_sku,
          'variant_suffix', page.variant_suffix,
          'full_sku', page.full_sku,
          'product_description', page.product_description,
          'variant_description', page.variant_description,
          'category', page.category,
          'image_url', page.image_url,
          'is_counted', page.is_counted,
          'counted_at', page.counted_at,
          'line_count', page.line_count,
          'counted_zero_count', page.counted_zero_count,
          'changed_line_count', page.changed_line_count,
          'on_hand', page.on_hand,
          'reserved', page.reserved,
          'available', page.available
        )
        ORDER BY page.search_rank, page.full_sku,
                 page.product_sku, page.variant_suffix
      )
      FROM page
    ), '[]'::jsonb)
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_inventory_count_target_v1(
  p_session_id uuid,
  p_product_sku text,
  p_variant_suffix text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_session public.inventory_count_sessions%ROWTYPE;
  v_sku text := upper(BTRIM(COALESCE(p_product_sku, '')));
  v_variant text := upper(BTRIM(COALESCE(p_variant_suffix, '')));
  v_catalog jsonb;
  v_target jsonb;
  v_entries jsonb;
  v_current_balances jsonb;
BEGIN
  PERFORM private.assert_inventory_role(ARRAY['admin']);

  SELECT *
  INTO v_session
  FROM public.inventory_count_sessions session_row
  WHERE session_row.id = p_session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'Η Συνεδρία Απογραφής δεν βρέθηκε. Δεν πραγματοποιήθηκε καμία μεταβολή. Ανανεώστε τη λίστα συνεδριών και επιλέξτε ξανά.';
  END IF;

  SELECT jsonb_build_object(
    'product_sku', product.sku,
    'variant_suffix', v_variant,
    'full_sku', product.sku || v_variant,
    'product_description', COALESCE(product.description, ''),
    'variant_description', COALESCE(variant.description, ''),
    'category', COALESCE(product.category, ''),
    'image_url', product.image_url
  )
  INTO v_catalog
  FROM public.products product
  LEFT JOIN public.product_variants variant
    ON variant.product_sku = product.sku
   AND COALESCE(variant.suffix, '') = v_variant
  WHERE product.sku = v_sku
    AND (
      (
        EXISTS (
          SELECT 1
          FROM public.product_variants product_variant
          WHERE product_variant.product_sku = product.sku
        )
        AND variant.product_sku IS NOT NULL
      )
      OR (
        NOT EXISTS (
          SELECT 1
          FROM public.product_variants product_variant
          WHERE product_variant.product_sku = product.sku
        )
        AND v_variant = ''
      )
    );

  IF v_catalog IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = format(
        'Ο στόχος απογραφής %s%s δεν βρέθηκε στο Μητρώο Προϊόντων. Δεν πραγματοποιήθηκε καμία μεταβολή. Ελέγξτε το SKU ή την παραλλαγή και δοκιμάστε ξανά.',
        v_sku,
        v_variant
      );
  END IF;

  SELECT jsonb_build_object(
    'id', target.id,
    'status', target.status,
    'batch_id', target.batch_id,
    'line_count', target.line_count,
    'counted_zero_count', target.counted_zero_count,
    'changed_line_count', target.changed_line_count,
    'counted_by', target.counted_by,
    'counted_at', target.counted_at
  )
  INTO v_target
  FROM public.inventory_count_targets target
  WHERE target.session_id = p_session_id
    AND target.product_sku = v_sku
    AND target.variant_suffix = v_variant;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', entry.id,
      'size_info', entry.size_info,
      'warehouse_id', entry.warehouse_id,
      'warehouse_name', warehouse.name,
      'counted_quantity', entry.counted_quantity,
      'on_hand_before', entry.on_hand_before,
      'on_hand_after', entry.on_hand_after,
      'on_hand_delta', entry.on_hand_delta,
      'reserved_after', entry.reserved_after,
      'source_event_id', entry.source_event_id,
      'counted_at', entry.counted_at
    )
    ORDER BY warehouse.name, entry.size_info
  ), '[]'::jsonb)
  INTO v_entries
  FROM public.inventory_count_entries entry
  JOIN public.warehouses warehouse ON warehouse.id = entry.warehouse_id
  WHERE entry.session_id = p_session_id
    AND entry.product_sku = v_sku
    AND entry.variant_suffix = v_variant;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'warehouse_id', scope.warehouse_id,
      'warehouse_name', warehouse.name,
      'size_info', COALESCE(balance.size_info, ''),
      'on_hand', COALESCE(balance.on_hand, 0),
      'reserved', COALESCE(balance.reserved, 0),
      'available', COALESCE(balance.on_hand, 0)
        - COALESCE(balance.reserved, 0)
    )
    ORDER BY scope.ordinality, COALESCE(balance.size_info, '')
  ), '[]'::jsonb)
  INTO v_current_balances
  FROM unnest(v_session.warehouse_ids)
    WITH ORDINALITY AS scope(warehouse_id, ordinality)
  JOIN public.warehouses warehouse ON warehouse.id = scope.warehouse_id
  LEFT JOIN public.inventory_balances balance
    ON balance.product_sku = v_sku
   AND balance.variant_suffix = v_variant
   AND balance.warehouse_id = scope.warehouse_id;

  RETURN jsonb_build_object(
    'session_id', p_session_id,
    'catalog', v_catalog,
    'target', v_target,
    'is_counted', v_target IS NOT NULL,
    'entries', v_entries,
    'current_balances', v_current_balances
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.post_inventory_count_batch_v1(
  p_session_id uuid,
  p_lines jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_session public.inventory_count_sessions%ROWTYPE;
  v_existing_batch public.inventory_count_batches%ROWTYPE;
  v_item jsonb;
  v_lines jsonb := '[]'::jsonb;
  v_sku text;
  v_variant text;
  v_size text;
  v_warehouse_text text;
  v_warehouse uuid;
  v_quantity bigint;
  v_index integer := 0;
  v_line_count integer;
  v_target_count integer;
  v_catalog_target_count integer;
  v_changed_count integer;
  v_zero_count integer;
  v_batch_id uuid := gen_random_uuid();
  v_batch_number integer;
  v_posting_key text;
  v_posting_result jsonb;
  v_result jsonb;
BEGIN
  PERFORM private.assert_inventory_role(ARRAY['admin']);

  IF BTRIM(COALESCE(p_idempotency_key, '')) = ''
     OR char_length(BTRIM(p_idempotency_key)) > 200 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Η παρτίδα απογραφής δεν καταχωρίστηκε επειδή λείπει το ασφαλές αναγνωριστικό υποβολής. Δεν πραγματοποιήθηκε καμία μεταβολή. Δοκιμάστε ξανά.';
  END IF;

  v_posting_key := 'inventory-count-batch:'
    || p_session_id::text || ':' || md5(BTRIM(p_idempotency_key));

  PERFORM pg_advisory_xact_lock(hashtextextended(v_posting_key, 0));

  SELECT *
  INTO v_existing_batch
  FROM public.inventory_count_batches batch
  WHERE batch.session_id = p_session_id
    AND batch.idempotency_key = BTRIM(p_idempotency_key);

  IF FOUND THEN
    RETURN jsonb_set(
      v_existing_batch.result,
      '{idempotent}',
      'true'::jsonb,
      true
    );
  END IF;

  SELECT *
  INTO v_session
  FROM public.inventory_count_sessions session_row
  WHERE session_row.id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'Η παρτίδα απογραφής δεν καταχωρίστηκε επειδή η συνεδρία δεν βρέθηκε. Δεν πραγματοποιήθηκε καμία μεταβολή. Ανανεώστε τη λίστα συνεδριών και δοκιμάστε ξανά.';
  END IF;

  IF v_session.status <> 'active' THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'Η παρτίδα απογραφής δεν καταχωρίστηκε επειδή η συνεδρία δεν είναι ενεργή. Δεν πραγματοποιήθηκε καμία μεταβολή. Ξεκινήστε ή συνεχίστε μία ενεργή Συνεδρία Απογραφής.';
  END IF;

  IF jsonb_typeof(COALESCE(p_lines, 'null'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Η παρτίδα απογραφής πρέπει να περιέχει από 1 έως 500 γραμμές ακριβούς καταμέτρησης. Δεν πραγματοποιήθηκε καμία μεταβολή. Διορθώστε την παρτίδα και δοκιμάστε ξανά.';
  END IF;

  IF jsonb_array_length(p_lines) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Η παρτίδα απογραφής πρέπει να περιέχει από 1 έως 500 γραμμές ακριβούς καταμέτρησης. Δεν πραγματοποιήθηκε καμία μεταβολή. Διορθώστε την παρτίδα και δοκιμάστε ξανά.';
  END IF;

  FOR v_item IN
    SELECT value
    FROM jsonb_array_elements(p_lines)
  LOOP
    v_index := v_index + 1;

    IF jsonb_typeof(v_item) <> 'object' THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = format(
          'Η γραμμή %s της παρτίδας απογραφής δεν έχει έγκυρη μορφή. Δεν πραγματοποιήθηκε καμία μεταβολή. Διορθώστε τη γραμμή και δοκιμάστε ξανά.',
          v_index
        );
    END IF;

    v_sku := upper(BTRIM(COALESCE(v_item->>'product_sku', '')));
    v_variant := upper(BTRIM(COALESCE(v_item->>'variant_suffix', '')));
    v_size := private.normalize_inventory_size(v_item->>'size_info');
    v_warehouse_text := BTRIM(COALESCE(v_item->>'warehouse_id', ''));

    IF v_sku = '' OR char_length(v_sku) > 80 THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = format(
          'Η γραμμή %s της παρτίδας δεν περιέχει έγκυρο SKU. Δεν πραγματοποιήθηκε καμία μεταβολή. Ελέγξτε το SKU και δοκιμάστε ξανά.',
          v_index
        );
    END IF;

    IF char_length(v_variant) > 80 THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = format(
          'Η γραμμή %s της παρτίδας δεν περιέχει έγκυρη παραλλαγή. Δεν πραγματοποιήθηκε καμία μεταβολή. Ελέγξτε τον πλήρη κωδικό και δοκιμάστε ξανά.',
          v_index
        );
    END IF;

    IF v_warehouse_text
       !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = format(
          'Η γραμμή %s της παρτίδας δεν περιέχει έγκυρη αποθήκη. Δεν πραγματοποιήθηκε καμία μεταβολή. Επιλέξτε ξανά την αποθήκη και δοκιμάστε ξανά.',
          v_index
        );
    END IF;
    v_warehouse := v_warehouse_text::uuid;

    IF v_warehouse <> ALL(v_session.warehouse_ids) THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = format(
          'Η γραμμή %s αφορά αποθήκη εκτός του πεδίου της Συνεδρίας Απογραφής. Δεν πραγματοποιήθηκε καμία μεταβολή. Επιλέξτε μία από τις αποθήκες της συνεδρίας.',
          v_index
        );
    END IF;

    IF COALESCE(v_item->>'quantity', '') !~ '^[0-9]+$'
       OR char_length(COALESCE(v_item->>'quantity', '')) > 10 THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = format(
          'Η ποσότητα στη γραμμή %s πρέπει να είναι μη αρνητικός ακέραιος αριθμός τεμαχίων. Δεν πραγματοποιήθηκε καμία μεταβολή. Καταχωρίστε ρητά 0 όταν το απόθεμα καταμετρήθηκε μηδενικό.',
          v_index
        );
    END IF;

    v_quantity := (v_item->>'quantity')::bigint;
    IF v_quantity > 2147483647 THEN
      RAISE EXCEPTION USING
        ERRCODE = '22003',
        MESSAGE = format(
          'Η ποσότητα στη γραμμή %s υπερβαίνει το επιτρεπτό όριο. Δεν πραγματοποιήθηκε καμία μεταβολή. Ελέγξτε την καταμέτρηση και δοκιμάστε ξανά.',
          v_index
        );
    END IF;

    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'product_sku', v_sku,
      'variant_suffix', v_variant,
      'size_info', v_size,
      'warehouse_id', v_warehouse,
      'quantity', v_quantity::integer
    ));
  END LOOP;

  SELECT COUNT(*)::integer
  INTO v_line_count
  FROM jsonb_array_elements(v_lines);

  SELECT COUNT(*)::integer
  INTO v_target_count
  FROM (
    SELECT DISTINCT line.product_sku, line.variant_suffix
    FROM jsonb_to_recordset(v_lines) AS line(
      product_sku text,
      variant_suffix text,
      size_info text,
      warehouse_id uuid,
      quantity integer
    )
  ) distinct_target;

  IF v_target_count NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Η παρτίδα απογραφής πρέπει να περιέχει από 1 έως 200 διαφορετικά SKU ή παραλλαγές. Δεν πραγματοποιήθηκε καμία μεταβολή. Χωρίστε την καταμέτρηση σε μικρότερες παρτίδες.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(v_lines) AS line(
      product_sku text,
      variant_suffix text,
      size_info text,
      warehouse_id uuid,
      quantity integer
    )
    GROUP BY
      line.product_sku,
      line.variant_suffix,
      line.size_info,
      line.warehouse_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Η ίδια παραλλαγή, μέγεθος και αποθήκη εμφανίζονται περισσότερες από μία φορές στην παρτίδα. Δεν πραγματοποιήθηκε καμία μεταβολή. Συγχωνεύστε τις διπλές γραμμές και δοκιμάστε ξανά.';
  END IF;

  -- Every target must explicitly cover every warehouse in the session. A
  -- counted zero is represented by quantity = 0; an omitted warehouse remains
  -- uncounted and therefore cannot be posted accidentally.
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT
        line.product_sku,
        line.variant_suffix,
        COUNT(DISTINCT line.warehouse_id) AS covered_warehouses
      FROM jsonb_to_recordset(v_lines) AS line(
        product_sku text,
        variant_suffix text,
        size_info text,
        warehouse_id uuid,
        quantity integer
      )
      GROUP BY line.product_sku, line.variant_suffix
    ) coverage
    WHERE coverage.covered_warehouses <> cardinality(v_session.warehouse_ids)
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Η παρτίδα απογραφής δεν καταχωρίστηκε επειδή ένα ή περισσότερα SKU δεν έχουν καταμετρηθεί σε όλες τις αποθήκες της συνεδρίας. Δεν πραγματοποιήθηκε καμία μεταβολή. Καταχωρίστε ρητά 0 για κάθε αποθήκη που καταμετρήθηκε χωρίς τεμάχια.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.inventory_count_targets counted_target
    JOIN (
      SELECT DISTINCT line.product_sku, line.variant_suffix
      FROM jsonb_to_recordset(v_lines) AS line(
        product_sku text,
        variant_suffix text,
        size_info text,
        warehouse_id uuid,
        quantity integer
      )
    ) submitted
      ON submitted.product_sku = counted_target.product_sku
     AND submitted.variant_suffix = counted_target.variant_suffix
    WHERE counted_target.session_id = p_session_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'Η παρτίδα απογραφής δεν καταχωρίστηκε επειδή περιέχει SKU ή παραλλαγή που έχει ήδη οριστικοποιηθεί στην ίδια συνεδρία. Δεν πραγματοποιήθηκε καμία μεταβολή. Αφαιρέστε τον ήδη καταμετρημένο στόχο ή ξεκινήστε νέα συνεδρία επανακαταμέτρησης.';
  END IF;

  -- Exact-count semantics require the operator to account explicitly for every
  -- pre-existing non-zero size/location balance of each submitted target.
  -- Otherwise an omitted legacy size could remain physically available while
  -- the target was incorrectly marked as fully counted.
  IF EXISTS (
    SELECT 1
    FROM public.inventory_balances balance
    JOIN (
      SELECT DISTINCT line.product_sku, line.variant_suffix
      FROM jsonb_to_recordset(v_lines) AS line(
        product_sku text,
        variant_suffix text,
        size_info text,
        warehouse_id uuid,
        quantity integer
      )
    ) submitted
      ON submitted.product_sku = balance.product_sku
     AND submitted.variant_suffix = balance.variant_suffix
    WHERE balance.warehouse_id = ANY(v_session.warehouse_ids)
      AND (balance.on_hand <> 0 OR balance.reserved <> 0)
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_to_recordset(v_lines) AS counted_line(
          product_sku text,
          variant_suffix text,
          size_info text,
          warehouse_id uuid,
          quantity integer
        )
        WHERE counted_line.product_sku = balance.product_sku
          AND counted_line.variant_suffix = balance.variant_suffix
          AND counted_line.size_info = balance.size_info
          AND counted_line.warehouse_id = balance.warehouse_id
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Η παρτίδα απογραφής δεν καταχωρίστηκε επειδή παραλείφθηκε υφιστάμενο μέγεθος ή θέση με υπόλοιπο. Δεν πραγματοποιήθηκε καμία μεταβολή. Καταχωρίστε τη μετρημένη ποσότητα ή ρητά 0 για κάθε εμφανιζόμενο υφιστάμενο μέγεθος και δοκιμάστε ξανά.';
  END IF;

  -- The existing command validates catalog identities and reservations, creates
  -- missing balance identities, locks them in deterministic order, writes one
  -- immutable event per line and updates the compatibility projection.
  v_posting_result := public.post_inventory_entries_v1(
    'count',
    v_lines,
    v_session.reason,
    v_posting_key
  );

  -- A committed retry always finds inventory_count_batches above. Reaching
  -- this branch with an idempotent nested result means that the derived key was
  -- used outside this session boundary; never attach unrelated movements.
  IF COALESCE((v_posting_result->>'idempotent')::boolean, false) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'Η παρτίδα απογραφής δεν συνδέθηκε με τη συνεδρία επειδή το ασφαλές αναγνωριστικό έχει ήδη χρησιμοποιηθεί. Δεν πραγματοποιήθηκε νέα μεταβολή. Δημιουργήστε νέα υποβολή και δοκιμάστε ξανά.';
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE event.on_hand_delta <> 0)::integer,
    COUNT(*) FILTER (WHERE line.quantity = 0)::integer
  INTO v_changed_count, v_zero_count
  FROM jsonb_to_recordset(v_lines) AS line(
    product_sku text,
    variant_suffix text,
    size_info text,
    warehouse_id uuid,
    quantity integer
  )
  JOIN public.inventory_events event
    ON event.idempotency_key = v_posting_key
   AND event.operation_type = 'stock_count'
   AND event.product_sku = line.product_sku
   AND event.variant_suffix = line.variant_suffix
   AND event.size_info = line.size_info
   AND event.warehouse_id = line.warehouse_id;

  IF v_changed_count IS NULL OR v_zero_count IS NULL OR (
    SELECT COUNT(*)
    FROM public.inventory_events event
    WHERE event.idempotency_key = v_posting_key
      AND event.operation_type = 'stock_count'
  ) <> v_line_count THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Η παρτίδα απογραφής δεν ολοκληρώθηκε επειδή δεν δημιουργήθηκε πλήρης αλυσίδα ελέγχου για όλες τις γραμμές. Η συναλλαγή ακυρώθηκε και δεν διατηρήθηκε καμία μεταβολή. Δοκιμάστε ξανά ή επικοινωνήστε με τον διαχειριστή.';
  END IF;

  v_batch_number := v_session.posted_batch_count + 1;

  INSERT INTO public.inventory_count_batches (
    id,
    session_id,
    batch_number,
    idempotency_key,
    posting_idempotency_key,
    target_count,
    line_count,
    changed_line_count,
    counted_zero_count,
    posted_by
  )
  VALUES (
    v_batch_id,
    p_session_id,
    v_batch_number,
    BTRIM(p_idempotency_key),
    v_posting_key,
    v_target_count,
    v_line_count,
    v_changed_count,
    v_zero_count,
    v_actor
  );

  INSERT INTO public.inventory_count_targets (
    session_id,
    batch_id,
    product_sku,
    variant_suffix,
    line_count,
    counted_zero_count,
    changed_line_count,
    counted_by
  )
  SELECT
    p_session_id,
    v_batch_id,
    line.product_sku,
    line.variant_suffix,
    COUNT(*)::integer,
    COUNT(*) FILTER (WHERE line.quantity = 0)::integer,
    COUNT(*) FILTER (WHERE event.on_hand_delta <> 0)::integer,
    v_actor
  FROM jsonb_to_recordset(v_lines) AS line(
    product_sku text,
    variant_suffix text,
    size_info text,
    warehouse_id uuid,
    quantity integer
  )
  JOIN public.inventory_events event
    ON event.idempotency_key = v_posting_key
   AND event.operation_type = 'stock_count'
   AND event.product_sku = line.product_sku
   AND event.variant_suffix = line.variant_suffix
   AND event.size_info = line.size_info
   AND event.warehouse_id = line.warehouse_id
  GROUP BY line.product_sku, line.variant_suffix;

  INSERT INTO public.inventory_count_entries (
    session_id,
    target_id,
    batch_id,
    product_sku,
    variant_suffix,
    size_info,
    warehouse_id,
    counted_quantity,
    on_hand_before,
    on_hand_after,
    on_hand_delta,
    reserved_after,
    source_event_id,
    posting_idempotency_key,
    counted_by
  )
  SELECT
    p_session_id,
    target.id,
    v_batch_id,
    line.product_sku,
    line.variant_suffix,
    line.size_info,
    line.warehouse_id,
    line.quantity,
    event.on_hand_after - event.on_hand_delta,
    event.on_hand_after,
    event.on_hand_delta,
    event.reserved_after,
    event.id,
    v_posting_key,
    v_actor
  FROM jsonb_to_recordset(v_lines) AS line(
    product_sku text,
    variant_suffix text,
    size_info text,
    warehouse_id uuid,
    quantity integer
  )
  JOIN public.inventory_count_targets target
    ON target.session_id = p_session_id
   AND target.batch_id = v_batch_id
   AND target.product_sku = line.product_sku
   AND target.variant_suffix = line.variant_suffix
  JOIN public.inventory_events event
    ON event.idempotency_key = v_posting_key
   AND event.operation_type = 'stock_count'
   AND event.product_sku = line.product_sku
   AND event.variant_suffix = line.variant_suffix
   AND event.size_info = line.size_info
   AND event.warehouse_id = line.warehouse_id;

  SELECT COUNT(*)::integer
  INTO v_catalog_target_count
  FROM (
    SELECT product.sku, ''::text AS variant_suffix
    FROM public.products product
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.product_variants variant
      WHERE variant.product_sku = product.sku
    )
    UNION ALL
    SELECT variant.product_sku, COALESCE(variant.suffix, '')
    FROM public.product_variants variant
  ) catalog_snapshot;

  UPDATE public.inventory_count_sessions
  SET total_target_count = GREATEST(
        total_target_count,
        v_catalog_target_count,
        counted_target_count + v_target_count
      ),
      counted_target_count = counted_target_count + v_target_count,
      counted_line_count = counted_line_count + v_line_count,
      counted_zero_count = counted_zero_count + v_zero_count,
      changed_line_count = changed_line_count + v_changed_count,
      posted_batch_count = posted_batch_count + 1,
      version = version + 1,
      updated_at = now()
  WHERE id = p_session_id;

  v_result := jsonb_build_object(
    'session', private.inventory_count_session_summary(p_session_id),
    'batch', jsonb_build_object(
      'id', v_batch_id,
      'batch_number', v_batch_number,
      'target_count', v_target_count,
      'line_count', v_line_count,
      'changed_line_count', v_changed_count,
      'counted_zero_count', v_zero_count
    ),
    'posted_count', v_line_count,
    'changed_count', v_changed_count,
    'counted_zero_count', v_zero_count,
    'balances', COALESCE(v_posting_result->'balances', '[]'::jsonb),
    'idempotent', false
  );

  UPDATE public.inventory_count_batches
  SET result = v_result
  WHERE id = v_batch_id;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_inventory_count_session_v1(
  p_session_id uuid,
  p_idempotency_key text,
  p_allow_partial boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_session public.inventory_count_sessions%ROWTYPE;
  v_command_key text;
  v_command public.inventory_command_results%ROWTYPE;
  v_current_catalog_total integer;
  v_result jsonb;
BEGIN
  PERFORM private.assert_inventory_role(ARRAY['admin']);

  IF BTRIM(COALESCE(p_idempotency_key, '')) = ''
     OR char_length(BTRIM(p_idempotency_key)) > 200 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Η Συνεδρία Απογραφής δεν ολοκληρώθηκε επειδή λείπει το ασφαλές αναγνωριστικό υποβολής. Δεν πραγματοποιήθηκε καμία μεταβολή. Δοκιμάστε ξανά.';
  END IF;

  v_command_key := 'inventory-count-complete:'
    || p_session_id::text || ':' || md5(BTRIM(p_idempotency_key));

  PERFORM pg_advisory_xact_lock(hashtextextended(v_command_key, 0));

  SELECT *
  INTO v_command
  FROM public.inventory_command_results command_result
  WHERE command_result.idempotency_key = v_command_key;

  IF FOUND THEN
    IF v_command.operation_type <> 'inventory_count_session_complete' THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'Η Συνεδρία Απογραφής δεν ολοκληρώθηκε. Το ασφαλές αναγνωριστικό έχει ήδη χρησιμοποιηθεί σε διαφορετική ενέργεια. Δεν πραγματοποιήθηκε καμία μεταβολή. Ξεκινήστε νέα υποβολή.';
    END IF;
    RETURN jsonb_set(v_command.result, '{idempotent}', 'true'::jsonb, true);
  END IF;

  SELECT *
  INTO v_session
  FROM public.inventory_count_sessions session_row
  WHERE session_row.id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'Η Συνεδρία Απογραφής δεν ολοκληρώθηκε επειδή δεν βρέθηκε. Δεν πραγματοποιήθηκε καμία μεταβολή. Ανανεώστε τη λίστα συνεδριών και δοκιμάστε ξανά.';
  END IF;

  IF v_session.status = 'abandoned' THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'Η Συνεδρία Απογραφής δεν ολοκληρώθηκε επειδή έχει εγκαταλειφθεί. Δεν πραγματοποιήθηκε καμία μεταβολή. Δημιουργήστε νέα συνεδρία για την υπόλοιπη απογραφή.';
  END IF;

  IF v_session.status = 'completed' THEN
    v_result := jsonb_build_object(
      'session', private.inventory_count_session_summary(p_session_id),
      'inventory_changed', false,
      'idempotent', true
    );

    INSERT INTO public.inventory_command_results (
      idempotency_key,
      operation_type,
      result,
      actor_user_id
    )
    VALUES (
      v_command_key,
      'inventory_count_session_complete',
      v_result,
      v_actor
    );
    RETURN v_result;
  END IF;

  IF v_session.posted_batch_count = 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'Η Συνεδρία Απογραφής δεν ολοκληρώθηκε επειδή δεν έχει καταχωριστεί καμία παρτίδα. Δεν πραγματοποιήθηκε καμία μεταβολή. Καταμετρήστε τουλάχιστον ένα SKU ή εγκαταλείψτε τη συνεδρία.';
  END IF;

  SELECT COUNT(*)::integer
  INTO v_current_catalog_total
  FROM (
    SELECT product.sku, ''::text AS variant_suffix
    FROM public.products product
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.product_variants variant
      WHERE variant.product_sku = product.sku
    )
    UNION ALL
    SELECT variant.product_sku, COALESCE(variant.suffix, '')
    FROM public.product_variants variant
  ) catalog_snapshot;

  UPDATE public.inventory_count_sessions
  SET total_target_count = GREATEST(
        total_target_count,
        v_current_catalog_total,
        counted_target_count
      ),
      updated_at = now()
  WHERE id = p_session_id
  RETURNING * INTO v_session;

  IF v_session.counted_target_count < v_session.total_target_count
     AND NOT COALESCE(p_allow_partial, false) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = format(
        'Η Συνεδρία Απογραφής δεν ολοκληρώθηκε. Έχουν καταμετρηθεί %s από %s SKU ή παραλλαγές και απομένουν %s. Δεν πραγματοποιήθηκε καμία μεταβολή. Συνεχίστε την καταμέτρηση ή επιλέξτε ρητά μερική ολοκλήρωση.',
        v_session.counted_target_count,
        v_session.total_target_count,
        v_session.total_target_count - v_session.counted_target_count
      );
  END IF;

  UPDATE public.inventory_count_sessions
  SET status = 'completed',
      allow_partial_completion = COALESCE(p_allow_partial, false),
      completed_by = v_actor,
      completed_at = now(),
      updated_at = now(),
      version = version + 1
  WHERE id = p_session_id;

  v_result := jsonb_build_object(
    'session', private.inventory_count_session_summary(p_session_id),
    'inventory_changed', false,
    'idempotent', false
  );

  INSERT INTO public.inventory_command_results (
    idempotency_key,
    operation_type,
    result,
    actor_user_id
  )
  VALUES (
    v_command_key,
    'inventory_count_session_complete',
    v_result,
    v_actor
  );

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.abandon_inventory_count_session_v1(
  p_session_id uuid,
  p_reason text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_session public.inventory_count_sessions%ROWTYPE;
  v_command_key text;
  v_command public.inventory_command_results%ROWTYPE;
  v_result jsonb;
BEGIN
  PERFORM private.assert_inventory_role(ARRAY['admin']);

  IF BTRIM(COALESCE(p_reason, '')) = ''
     OR char_length(BTRIM(p_reason)) > 500 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Η Συνεδρία Απογραφής δεν εγκαταλείφθηκε. Η αιτιολογία είναι υποχρεωτική και πρέπει να περιέχει έως 500 χαρακτήρες. Δεν πραγματοποιήθηκε καμία μεταβολή. Συμπληρώστε την αιτιολογία και δοκιμάστε ξανά.';
  END IF;

  IF BTRIM(COALESCE(p_idempotency_key, '')) = ''
     OR char_length(BTRIM(p_idempotency_key)) > 200 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Η Συνεδρία Απογραφής δεν εγκαταλείφθηκε επειδή λείπει το ασφαλές αναγνωριστικό υποβολής. Δεν πραγματοποιήθηκε καμία μεταβολή. Δοκιμάστε ξανά.';
  END IF;

  v_command_key := 'inventory-count-abandon:'
    || p_session_id::text || ':' || md5(BTRIM(p_idempotency_key));

  PERFORM pg_advisory_xact_lock(hashtextextended(v_command_key, 0));

  SELECT *
  INTO v_command
  FROM public.inventory_command_results command_result
  WHERE command_result.idempotency_key = v_command_key;

  IF FOUND THEN
    IF v_command.operation_type <> 'inventory_count_session_abandon' THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'Η Συνεδρία Απογραφής δεν εγκαταλείφθηκε. Το ασφαλές αναγνωριστικό έχει ήδη χρησιμοποιηθεί σε διαφορετική ενέργεια. Δεν πραγματοποιήθηκε καμία μεταβολή. Ξεκινήστε νέα υποβολή.';
    END IF;
    RETURN jsonb_set(v_command.result, '{idempotent}', 'true'::jsonb, true);
  END IF;

  SELECT *
  INTO v_session
  FROM public.inventory_count_sessions session_row
  WHERE session_row.id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'Η Συνεδρία Απογραφής δεν εγκαταλείφθηκε επειδή δεν βρέθηκε. Δεν πραγματοποιήθηκε καμία μεταβολή. Ανανεώστε τη λίστα συνεδριών και δοκιμάστε ξανά.';
  END IF;

  IF v_session.status = 'completed' THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'Η Συνεδρία Απογραφής δεν εγκαταλείφθηκε επειδή έχει ήδη ολοκληρωθεί. Δεν πραγματοποιήθηκε καμία μεταβολή. Δημιουργήστε νέα συνεδρία εάν απαιτείται συμπληρωματική απογραφή.';
  END IF;

  IF v_session.status = 'active' THEN
    UPDATE public.inventory_count_sessions
    SET status = 'abandoned',
        abandoned_by = v_actor,
        abandoned_at = now(),
        abandonment_reason = BTRIM(p_reason),
        updated_at = now(),
        version = version + 1
    WHERE id = p_session_id;
  END IF;

  v_result := jsonb_build_object(
    'session', private.inventory_count_session_summary(p_session_id),
    'inventory_changed', false,
    'posted_inventory_retained', true,
    'idempotent', v_session.status = 'abandoned'
  );

  INSERT INTO public.inventory_command_results (
    idempotency_key,
    operation_type,
    result,
    actor_user_id
  )
  VALUES (
    v_command_key,
    'inventory_count_session_abandon',
    v_result,
    v_actor
  );

  RETURN v_result;
END;
$$;

-- The browser may read session records only through administrator RLS. No
-- authenticated role receives INSERT, UPDATE or DELETE on these tables; all
-- writes remain inside the constrained RPC transaction boundaries above.
ALTER TABLE public.inventory_count_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_count_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_count_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_count_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY inventory_count_sessions_read_admin
ON public.inventory_count_sessions
FOR SELECT
TO authenticated
USING ((SELECT private.current_app_role()) = 'admin');

CREATE POLICY inventory_count_batches_read_admin
ON public.inventory_count_batches
FOR SELECT
TO authenticated
USING ((SELECT private.current_app_role()) = 'admin');

CREATE POLICY inventory_count_targets_read_admin
ON public.inventory_count_targets
FOR SELECT
TO authenticated
USING ((SELECT private.current_app_role()) = 'admin');

CREATE POLICY inventory_count_entries_read_admin
ON public.inventory_count_entries
FOR SELECT
TO authenticated
USING ((SELECT private.current_app_role()) = 'admin');

REVOKE ALL ON public.inventory_count_sessions
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.inventory_count_batches
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.inventory_count_targets
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.inventory_count_entries
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.inventory_count_session_progress_v
  FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.inventory_count_sessions
  TO authenticated, service_role;
GRANT SELECT ON public.inventory_count_batches
  TO authenticated, service_role;
GRANT SELECT ON public.inventory_count_targets
  TO authenticated, service_role;
GRANT SELECT ON public.inventory_count_entries
  TO authenticated, service_role;
GRANT SELECT ON public.inventory_count_session_progress_v
  TO authenticated, service_role;

GRANT INSERT, UPDATE, DELETE ON public.inventory_count_sessions
  TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.inventory_count_batches
  TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.inventory_count_targets
  TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.inventory_count_entries
  TO service_role;

REVOKE ALL ON FUNCTION public.start_inventory_count_session_v1(
  text, text, uuid[], text
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_inventory_count_session_v1(uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.search_inventory_count_targets_v1(
  uuid, text, integer, integer, boolean
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_inventory_count_target_v1(
  uuid, text, text
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.post_inventory_count_batch_v1(
  uuid, jsonb, text
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.complete_inventory_count_session_v1(
  uuid, text, boolean
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.abandon_inventory_count_session_v1(
  uuid, text, text
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.start_inventory_count_session_v1(
  text, text, uuid[], text
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_inventory_count_session_v1(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_inventory_count_targets_v1(
  uuid, text, integer, integer, boolean
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_inventory_count_target_v1(
  uuid, text, text
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.post_inventory_count_batch_v1(
  uuid, jsonb, text
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_inventory_count_session_v1(
  uuid, text, boolean
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.abandon_inventory_count_session_v1(
  uuid, text, text
) TO authenticated, service_role;

COMMENT ON TABLE public.inventory_count_sessions
IS 'Server-backed administrator inventory-count sessions with stable progress and warehouse scope.';

COMMENT ON TABLE public.inventory_count_targets
IS 'Catalog SKU or variant targets finalized inside an inventory-count session.';

COMMENT ON TABLE public.inventory_count_batches
IS 'Atomic, idempotent inventory-count postings of at most 200 targets and 500 exact-count lines.';

COMMENT ON TABLE public.inventory_count_entries
IS 'Auditable exact-count lines linked one-to-one with immutable inventory stock-count events.';

COMMENT ON VIEW public.inventory_count_session_progress_v
IS 'Compact administrator read model for inventory-count session progress; it never expands the complete catalog.';

COMMENT ON FUNCTION public.start_inventory_count_session_v1(
  text, text, uuid[], text
)
IS 'Starts one lightweight administrator count session without materializing thousands of catalog targets.';

COMMENT ON FUNCTION public.search_inventory_count_targets_v1(
  uuid, text, integer, integer, boolean
)
IS 'Searches and pages catalog targets for one count session, with current scoped balances and counted state.';

COMMENT ON FUNCTION public.post_inventory_count_batch_v1(
  uuid, jsonb, text
)
IS 'Posts one exact-count batch atomically through post_inventory_entries_v1 and persists session progress and event links.';

COMMENT ON FUNCTION public.complete_inventory_count_session_v1(
  uuid, text, boolean
)
IS 'Completes a count session; partial completion requires an explicit boolean acknowledgement.';

COMMENT ON FUNCTION public.abandon_inventory_count_session_v1(
  uuid, text, text
)
IS 'Abandons an active count session without reversing inventory already posted by completed batches.';
