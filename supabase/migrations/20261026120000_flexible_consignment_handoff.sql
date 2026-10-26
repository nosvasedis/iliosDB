-- Παράδοση Παρακαταθήκης χωρίς μπλοκάρισμα από το απόθεμα.
--
-- Until now handoff moved every line with an exact (sku, variant, size) match
-- from the source warehouse and failed the whole consignment when the source
-- was short. New consignments are often made of pieces that were never booked
-- into the warehouse, so handoff now:
--   1. takes whatever is available from the source warehouse, with flexible
--      size matching (exact size → unsized stock for sized lines; unsized →
--      any size, largest available first, for unsized lines);
--   2. books the remainder straight into «Παρακαταθήκες Πελατών» as
--      `consignment_direct_in`, so the source never goes negative.
-- Every unit lands in the consignment location under the LINE's size, which
-- keeps settlements, returns and the consignment reconciliation consistent.

CREATE OR REPLACE FUNCTION private.consignment_draw_line_stock(
  p_line public.consignment_lines,
  p_source_warehouse_id uuid,
  p_consignment_code text,
  p_idempotency_key text,
  p_sequence_start integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c_consignments CONSTANT uuid := '00000000-0000-0000-0000-000000000003'::uuid;
  v_actor uuid := (SELECT auth.uid());
  v_sku text := p_line.product_sku;
  v_variant text := COALESCE(p_line.variant_suffix, '');
  v_size text := COALESCE(p_line.size_info, '');
  v_remaining integer := p_line.quantity;
  v_sequence integer := p_sequence_start;
  v_from_stock integer := 0;
  v_take integer;
  v_group uuid;
  v_candidate record;
  v_source public.inventory_balances%ROWTYPE;
  v_destination public.inventory_balances%ROWTYPE;
  v_sources jsonb := '[]'::jsonb;
  v_reason text := 'Παράδοση προϊόντων σε Παρακαταθήκη ' || p_consignment_code;
BEGIN
  IF p_line.quantity <= 0 OR p_source_warehouse_id = c_consignments THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Η ποσότητα ή οι θέσεις αποθέματος δεν είναι έγκυρες.';
  END IF;
  PERFORM private.assert_inventory_item_ready(v_sku);

  INSERT INTO public.inventory_balances (product_sku, variant_suffix, size_info, warehouse_id)
  VALUES (v_sku, v_variant, v_size, c_consignments)
  ON CONFLICT DO NOTHING;

  -- Lock every balance of this variant in both locations in one stable order.
  PERFORM 1 FROM public.inventory_balances
  WHERE product_sku = v_sku
    AND variant_suffix = v_variant
    AND warehouse_id IN (p_source_warehouse_id, c_consignments)
  ORDER BY warehouse_id, size_info
  FOR UPDATE;

  FOR v_candidate IN
    SELECT size_info, on_hand - reserved AS available
    FROM public.inventory_balances
    WHERE product_sku = v_sku
      AND variant_suffix = v_variant
      AND warehouse_id = p_source_warehouse_id
      AND on_hand - reserved > 0
      AND (v_size = '' OR size_info = v_size OR size_info = '')
    ORDER BY
      CASE WHEN size_info = v_size THEN 0 WHEN size_info = '' THEN 1 ELSE 2 END,
      on_hand - reserved DESC,
      size_info
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_take := LEAST(v_remaining, v_candidate.available);
    v_group := gen_random_uuid();

    UPDATE public.inventory_balances
    SET on_hand = on_hand - v_take, version = version + 1, updated_at = now()
    WHERE product_sku = v_sku AND variant_suffix = v_variant
      AND size_info = v_candidate.size_info AND warehouse_id = p_source_warehouse_id
    RETURNING * INTO v_source;

    UPDATE public.inventory_balances
    SET on_hand = on_hand + v_take, version = version + 1, updated_at = now()
    WHERE product_sku = v_sku AND variant_suffix = v_variant
      AND size_info = v_size AND warehouse_id = c_consignments
    RETURNING * INTO v_destination;

    INSERT INTO public.inventory_events (
      sequence_no, operation_type, product_sku, variant_suffix, size_info,
      warehouse_id, on_hand_delta, reserved_delta, on_hand_after, reserved_after,
      reference_type, reference_id, reference_line_id, transfer_group_id,
      actor_user_id, reason, idempotency_key
    ) VALUES
      (v_sequence, 'consignment_handoff_out', v_sku, v_variant, v_candidate.size_info,
        p_source_warehouse_id, -v_take, 0, v_source.on_hand, v_source.reserved,
        'consignment', p_line.consignment_id::text, p_line.id::text, v_group,
        v_actor, v_reason, p_idempotency_key),
      (v_sequence + 1, 'consignment_handoff_in', v_sku, v_variant, v_size,
        c_consignments, v_take, 0, v_destination.on_hand, v_destination.reserved,
        'consignment', p_line.consignment_id::text, p_line.id::text, v_group,
        v_actor, v_reason, p_idempotency_key);

    v_sequence := v_sequence + 2;
    v_remaining := v_remaining - v_take;
    v_from_stock := v_from_stock + v_take;
    v_sources := v_sources || jsonb_build_array(
      jsonb_build_object('size_info', v_candidate.size_info, 'quantity', v_take)
    );
  END LOOP;

  IF v_remaining > 0 THEN
    UPDATE public.inventory_balances
    SET on_hand = on_hand + v_remaining, version = version + 1, updated_at = now()
    WHERE product_sku = v_sku AND variant_suffix = v_variant
      AND size_info = v_size AND warehouse_id = c_consignments
    RETURNING * INTO v_destination;

    INSERT INTO public.inventory_events (
      sequence_no, operation_type, product_sku, variant_suffix, size_info,
      warehouse_id, on_hand_delta, reserved_delta, on_hand_after, reserved_after,
      reference_type, reference_id, reference_line_id,
      actor_user_id, reason, idempotency_key
    ) VALUES (
      v_sequence, 'consignment_direct_in', v_sku, v_variant, v_size,
      c_consignments, v_remaining, 0, v_destination.on_hand, v_destination.reserved,
      'consignment', p_line.consignment_id::text, p_line.id::text,
      v_actor, v_reason || ' (απευθείας, χωρίς απόθεμα αποθήκης)', p_idempotency_key
    );
    v_sequence := v_sequence + 1;
  END IF;

  PERFORM private.sync_legacy_inventory_projection(v_sku);

  RETURN jsonb_build_object(
    'line_id', p_line.id,
    'product_sku', v_sku,
    'variant_suffix', v_variant,
    'size_info', v_size,
    'quantity', p_line.quantity,
    'from_stock', v_from_stock,
    'direct', GREATEST(v_remaining, 0),
    'sources', v_sources,
    'next_sequence', v_sequence
  );
END;
$$;

REVOKE ALL ON FUNCTION private.consignment_draw_line_stock(
  public.consignment_lines, uuid, text, text, integer
) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.handoff_consignment_v1(p_consignment_id uuid, p_idempotency_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_parent public.consignments%ROWTYPE;
  v_line public.consignment_lines%ROWTYPE;
  v_existing jsonb;
  v_draw jsonb;
  v_lines jsonb := '[]'::jsonb;
  v_sequence integer := 1;
  v_from_stock integer := 0;
  v_direct integer := 0;
BEGIN
  SELECT result INTO v_existing FROM public.customer_service_command_results
  WHERE idempotency_key = p_idempotency_key;
  IF v_existing IS NOT NULL THEN RETURN v_existing || jsonb_build_object('idempotent', true); END IF;
  SELECT * INTO v_parent FROM public.consignments WHERE id = p_consignment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Η Παρακαταθήκη δεν βρέθηκε.'; END IF;
  PERFORM private.assert_customer_service_role(
    ARRAY['admin', 'user', 'seller'], v_parent.customer_id, v_parent.seller_id
  );
  IF v_parent.handed_off_at IS NOT NULL OR v_parent.status NOT IN ('draft', 'pending_handoff') THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Η Παρακαταθήκη έχει ήδη παραδοθεί ή κλείσει.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.consignment_allocations allocation
    JOIN public.consignment_lines line ON line.id = allocation.consignment_line_id
    JOIN public.production_batches batch ON batch.id = allocation.production_batch_id
    WHERE line.consignment_id = p_consignment_id AND batch.current_stage <> 'Ready'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Υπάρχουν συνδεδεμένα τεμάχια που δεν είναι ακόμη έτοιμα στην Παραγωγή.';
  END IF;

  FOR v_line IN
    SELECT * FROM public.consignment_lines WHERE consignment_id = p_consignment_id ORDER BY id FOR UPDATE
  LOOP
    v_draw := private.consignment_draw_line_stock(
      v_line, v_parent.source_warehouse_id, v_parent.code, p_idempotency_key, v_sequence
    );
    v_sequence := (v_draw->>'next_sequence')::integer;
    v_from_stock := v_from_stock + (v_draw->>'from_stock')::integer;
    v_direct := v_direct + (v_draw->>'direct')::integer;
    v_lines := v_lines || jsonb_build_array(v_draw - 'next_sequence');
  END LOOP;

  UPDATE public.consignments
  SET status = 'active', handed_off_at = now(), updated_at = now()
  WHERE id = p_consignment_id;
  INSERT INTO public.consignment_events (consignment_id, event_type, payload, actor_user_id)
  VALUES (
    p_consignment_id, 'handed_off',
    jsonb_build_object(
      'line_count', jsonb_array_length(v_lines),
      'from_stock_total', v_from_stock,
      'direct_total', v_direct,
      'lines', v_lines
    ),
    (SELECT auth.uid())
  );
  v_existing := jsonb_build_object(
    'consignment_id', p_consignment_id, 'status', 'active',
    'from_stock_total', v_from_stock, 'direct_total', v_direct,
    'lines', v_lines, 'idempotent', false
  );
  INSERT INTO public.customer_service_command_results VALUES (
    p_idempotency_key, 'consignment_handoff', v_existing, (SELECT auth.uid()), now()
  );
  RETURN v_existing;
END;
$$;
