-- Safely connect legacy production batches to stable order lines.
-- This migration never changes quantities, production stages, or shipment rows.

CREATE OR REPLACE FUNCTION private.resolve_order_line_id_v1(
  p_order_id text,
  p_candidate jsonb
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_line_id text;
  v_candidate_count integer;
  v_candidate_notes text := lower(btrim(coalesce(p_candidate->>'notes', '')));
BEGIN
  IF nullif(btrim(coalesce(p_candidate->>'line_id', '')), '') IS NOT NULL THEN
    RETURN btrim(p_candidate->>'line_id');
  END IF;

  WITH candidates AS (
    SELECT item
    FROM public.orders AS o
    CROSS JOIN LATERAL jsonb_array_elements(coalesce(o.items, '[]'::jsonb)) AS item
    WHERE o.id = p_order_id
      AND nullif(btrim(coalesce(item->>'line_id', '')), '') IS NOT NULL
      AND upper(btrim(coalesce(item->>'sku', ''))) =
          upper(btrim(coalesce(p_candidate->>'sku', '')))
      AND upper(btrim(coalesce(item->>'variant_suffix', ''))) =
          upper(btrim(coalesce(p_candidate->>'variant_suffix', '')))
      AND public.inventory_normalized_size_read_v1(item->>'size_info') =
          public.inventory_normalized_size_read_v1(p_candidate->>'size_info')
      AND lower(btrim(coalesce(item->>'cord_color', ''))) =
          lower(btrim(coalesce(p_candidate->>'cord_color', '')))
      AND lower(btrim(coalesce(item->>'enamel_color', ''))) =
          lower(btrim(coalesce(p_candidate->>'enamel_color', '')))
  )
  SELECT count(*), min(item->>'line_id')
  INTO v_candidate_count, v_line_id
  FROM candidates;

  IF v_candidate_count = 1 THEN
    RETURN v_line_id;
  END IF;

  IF v_candidate_count > 1 THEN
    WITH note_candidates AS (
      SELECT item
      FROM public.orders AS o
      CROSS JOIN LATERAL jsonb_array_elements(coalesce(o.items, '[]'::jsonb)) AS item
      WHERE o.id = p_order_id
        AND nullif(btrim(coalesce(item->>'line_id', '')), '') IS NOT NULL
        AND upper(btrim(coalesce(item->>'sku', ''))) =
            upper(btrim(coalesce(p_candidate->>'sku', '')))
        AND upper(btrim(coalesce(item->>'variant_suffix', ''))) =
            upper(btrim(coalesce(p_candidate->>'variant_suffix', '')))
        AND public.inventory_normalized_size_read_v1(item->>'size_info') =
            public.inventory_normalized_size_read_v1(p_candidate->>'size_info')
        AND lower(btrim(coalesce(item->>'cord_color', ''))) =
            lower(btrim(coalesce(p_candidate->>'cord_color', '')))
        AND lower(btrim(coalesce(item->>'enamel_color', ''))) =
            lower(btrim(coalesce(p_candidate->>'enamel_color', '')))
        AND lower(btrim(coalesce(item->>'notes', ''))) = v_candidate_notes
    )
    SELECT count(*), min(item->>'line_id')
    INTO v_candidate_count, v_line_id
    FROM note_candidates;

    IF v_candidate_count = 1 THEN
      RETURN v_line_id;
    END IF;
  END IF;

  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION private.prepare_shipment_line_ids_v1(
  p_order_id text,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_item jsonb;
  v_line_id text;
  v_result jsonb := '[]'::jsonb;
BEGIN
  IF jsonb_typeof(coalesce(p_items, 'null'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Η αποστολή δεν ολοκληρώθηκε, επειδή δεν επιλέχθηκαν έγκυρα είδη. Δεν πραγματοποιήθηκε καμία μεταβολή.';
  END IF;

  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Η αποστολή δεν ολοκληρώθηκε, επειδή δεν επιλέχθηκαν έγκυρα είδη. Δεν πραγματοποιήθηκε καμία μεταβολή.';
  END IF;

  PERFORM 1
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'Η αποστολή δεν ολοκληρώθηκε, επειδή η παραγγελία δεν βρέθηκε. Δεν πραγματοποιήθηκε καμία μεταβολή.';
  END IF;

  -- Stable locking order prevents concurrent shipment/reconciliation deadlocks.
  PERFORM 1
  FROM public.production_batches
  WHERE order_id = p_order_id
    AND current_stage = 'Ready'
  ORDER BY id
  FOR UPDATE;

  -- Repair only unambiguous legacy rows. Ambiguous rows remain untouched and
  -- are rejected below or by the shipment core.
  UPDATE public.production_batches AS b
  SET line_id = private.resolve_order_line_id_v1(b.order_id, to_jsonb(b)),
      updated_at = now()
  WHERE b.order_id = p_order_id
    AND b.current_stage = 'Ready'
    AND nullif(btrim(coalesce(b.line_id, '')), '') IS NULL
    AND private.resolve_order_line_id_v1(b.order_id, to_jsonb(b)) IS NOT NULL;

  FOR v_item IN
    SELECT value
    FROM jsonb_array_elements(p_items)
  LOOP
    v_line_id := private.resolve_order_line_id_v1(p_order_id, v_item);
    IF v_line_id IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = format(
          'Η αποστολή δεν ολοκληρώθηκε, επειδή το είδος %s%s%s δεν αντιστοιχεί με ασφάλεια σε μία ενεργή γραμμή της παραγγελίας. Δεν πραγματοποιήθηκε καμία μεταβολή.',
          coalesce(v_item->>'sku', ''),
          CASE WHEN nullif(v_item->>'variant_suffix', '') IS NULL THEN '' ELSE ' ' || (v_item->>'variant_suffix') END,
          CASE WHEN nullif(v_item->>'size_info', '') IS NULL THEN '' ELSE ' #' || (v_item->>'size_info') END
        );
    END IF;
    v_result := v_result || jsonb_build_array(
      jsonb_set(v_item, '{line_id}', to_jsonb(v_line_id), true)
    );
  END LOOP;

  RETURN v_result;
END;
$function$;

-- One-time, deterministic metadata backfill for all currently unambiguous
-- legacy batches. No stock, demand, stage, or shipment quantity is modified.
UPDATE public.production_batches AS b
SET line_id = private.resolve_order_line_id_v1(b.order_id, to_jsonb(b)),
    updated_at = now()
WHERE nullif(btrim(coalesce(b.line_id, '')), '') IS NULL
  AND private.resolve_order_line_id_v1(b.order_id, to_jsonb(b)) IS NOT NULL;

CREATE OR REPLACE FUNCTION public.create_partial_shipment_v2(
  p_order_id text,
  p_shipped_by text,
  p_items jsonb,
  p_delivery_plan_id uuid DEFAULT NULL::uuid,
  p_notes text DEFAULT NULL::text,
  p_next_plan jsonb DEFAULT NULL::jsonb,
  p_next_reminders jsonb DEFAULT '[]'::jsonb,
  p_idempotency_key text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  command_row public.inventory_command_results%ROWTYPE;
  v_result jsonb;
  v_items jsonb;
  item_row jsonb;
BEGIN
  PERFORM private.assert_inventory_role(ARRAY['admin', 'user']);
  IF NULLIF(BTRIM(COALESCE(p_idempotency_key, '')), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Η αποστολή δεν ολοκληρώθηκε, επειδή λείπει το αναγνωριστικό ασφαλούς επανάληψης. Δεν πραγματοποιήθηκε καμία μεταβολή.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_idempotency_key, 0));
  SELECT * INTO command_row
  FROM public.inventory_command_results
  WHERE idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF command_row.operation_type <> 'shipment_create' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Η αποστολή δεν ολοκληρώθηκε, επειδή το αναγνωριστικό επανάληψης χρησιμοποιείται από διαφορετική ενέργεια. Δεν πραγματοποιήθηκε καμία μεταβολή.';
    END IF;
    RETURN command_row.result;
  END IF;

  v_items := private.prepare_shipment_line_ids_v1(p_order_id, p_items);

  v_result := public.create_partial_shipment_inventory_core_v1(
    p_order_id, p_shipped_by, v_items, p_delivery_plan_id,
    p_notes, p_next_plan, p_next_reminders
  );

  FOR item_row IN SELECT value FROM jsonb_array_elements(v_items)
  LOOP
    PERFORM private.rebalance_ready_batch_sources(
      p_order_id,
      item_row->>'sku',
      COALESCE(item_row->>'variant_suffix', ''),
      COALESCE(item_row->>'size_info', ''),
      COALESCE(item_row->>'cord_color', ''),
      COALESCE(item_row->>'enamel_color', ''),
      COALESCE(item_row->>'line_id', '')
    );
  END LOOP;

  INSERT INTO public.inventory_command_results (
    idempotency_key, operation_type, result, actor_user_id
  ) VALUES (
    p_idempotency_key, 'shipment_create', v_result, (SELECT auth.uid())
  );
  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION private.resolve_order_line_id_v1(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.prepare_shipment_line_ids_v1(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_partial_shipment_v2(text, text, jsonb, uuid, text, jsonb, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_partial_shipment_v2(text, text, jsonb, uuid, text, jsonb, jsonb, text) TO authenticated, service_role;
