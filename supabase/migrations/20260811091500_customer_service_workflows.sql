-- Transactional commands for Παρακαταθήκες & Επισκευές.
-- All public functions are authenticated-only, idempotent where they mutate
-- inventory/financial state, and keep audit events in the same transaction.

CREATE OR REPLACE FUNCTION private.next_consignment_code()
RETURNS text
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT 'ΠΑΡ-' || to_char(CURRENT_DATE, 'YYYY') || '-' ||
         lpad(nextval('public.consignment_code_seq')::text, 6, '0');
$$;

CREATE OR REPLACE FUNCTION private.next_repair_intake_code()
RETURNS text
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT 'ΠΑΡΕΠ-' || to_char(CURRENT_DATE, 'YYYY') || '-' ||
         lpad(nextval('public.repair_intake_code_seq')::text, 6, '0');
$$;

CREATE OR REPLACE FUNCTION private.next_repair_item_code()
RETURNS text
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT 'ΕΠ-' || to_char(CURRENT_DATE, 'YYYY') || '-' ||
         lpad(nextval('public.repair_item_code_seq')::text, 6, '0');
$$;

CREATE OR REPLACE FUNCTION private.refresh_consignment_status(p_consignment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_handed_off timestamptz;
  v_pending integer;
  v_sold integer;
  v_returned integer;
  v_due numeric;
  v_paid numeric;
  v_status text;
  v_financial text;
BEGIN
  SELECT handed_off_at INTO v_handed_off
  FROM public.consignments WHERE id = p_consignment_id FOR UPDATE;

  SELECT COALESCE(sum(pending_quantity), 0), COALESCE(sum(sold_quantity), 0),
         COALESCE(sum(returned_quantity), 0)
  INTO v_pending, v_sold, v_returned
  FROM public.consignment_lines WHERE consignment_id = p_consignment_id;

  SELECT COALESCE(sum(settlement.total_amount), 0),
         COALESCE(sum(settlement.paid_amount), 0)
  INTO v_due, v_paid
  FROM public.consignment_settlements settlement
  JOIN public.consignment_lines line ON line.id = settlement.consignment_line_id
  WHERE line.consignment_id = p_consignment_id
    AND settlement.status <> 'reversed';

  v_status := CASE
    WHEN v_handed_off IS NULL THEN 'pending_handoff'
    WHEN v_pending = 0 THEN 'completed'
    WHEN v_sold + v_returned > 0 THEN 'partially_settled'
    ELSE 'active'
  END;
  v_financial := CASE
    WHEN v_due = 0 THEN 'not_due'
    WHEN v_paid = 0 THEN 'due'
    WHEN v_paid < v_due THEN 'partial'
    ELSE 'paid'
  END;

  UPDATE public.consignments
  SET status = v_status,
      financial_status = v_financial,
      completed_at = CASE WHEN v_status = 'completed' THEN COALESCE(completed_at, now()) ELSE NULL END,
      updated_at = now()
  WHERE id = p_consignment_id;
END;
$$;

CREATE OR REPLACE FUNCTION private.customer_service_move_stock(
  p_product_sku text,
  p_variant_suffix text,
  p_size_info text,
  p_source_warehouse_id uuid,
  p_destination_warehouse_id uuid,
  p_quantity integer,
  p_operation_type text,
  p_reference_type text,
  p_reference_id text,
  p_reference_line_id text,
  p_reason text,
  p_idempotency_key text,
  p_sequence_start integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_source public.inventory_balances%ROWTYPE;
  v_destination public.inventory_balances%ROWTYPE;
  v_group uuid := gen_random_uuid();
  v_source_event uuid := gen_random_uuid();
  v_destination_event uuid := gen_random_uuid();
BEGIN
  IF p_quantity <= 0 OR p_source_warehouse_id = p_destination_warehouse_id THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Η ποσότητα ή οι θέσεις αποθέματος δεν είναι έγκυρες.';
  END IF;
  PERFORM private.assert_inventory_item_ready(p_product_sku);

  INSERT INTO public.inventory_balances (product_sku, variant_suffix, size_info, warehouse_id)
  VALUES
    (p_product_sku, COALESCE(p_variant_suffix, ''), COALESCE(p_size_info, ''), p_source_warehouse_id),
    (p_product_sku, COALESCE(p_variant_suffix, ''), COALESCE(p_size_info, ''), p_destination_warehouse_id)
  ON CONFLICT DO NOTHING;

  PERFORM 1 FROM public.inventory_balances
  WHERE product_sku = p_product_sku
    AND variant_suffix = COALESCE(p_variant_suffix, '')
    AND size_info = COALESCE(p_size_info, '')
    AND warehouse_id IN (p_source_warehouse_id, p_destination_warehouse_id)
  ORDER BY warehouse_id FOR UPDATE;

  SELECT * INTO v_source FROM public.inventory_balances
  WHERE product_sku = p_product_sku
    AND variant_suffix = COALESCE(p_variant_suffix, '')
    AND size_info = COALESCE(p_size_info, '')
    AND warehouse_id = p_source_warehouse_id;

  IF v_source.on_hand - v_source.reserved < p_quantity THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = format(
      'Η κίνηση δεν ολοκληρώθηκε. Διαθέσιμα: %s τεμάχια.',
      GREATEST(v_source.on_hand - v_source.reserved, 0)
    );
  END IF;

  UPDATE public.inventory_balances
  SET on_hand = on_hand - p_quantity, version = version + 1, updated_at = now()
  WHERE product_sku = p_product_sku
    AND variant_suffix = COALESCE(p_variant_suffix, '')
    AND size_info = COALESCE(p_size_info, '')
    AND warehouse_id = p_source_warehouse_id
  RETURNING * INTO v_source;

  UPDATE public.inventory_balances
  SET on_hand = on_hand + p_quantity, version = version + 1, updated_at = now()
  WHERE product_sku = p_product_sku
    AND variant_suffix = COALESCE(p_variant_suffix, '')
    AND size_info = COALESCE(p_size_info, '')
    AND warehouse_id = p_destination_warehouse_id
  RETURNING * INTO v_destination;

  INSERT INTO public.inventory_events (
    id, sequence_no, operation_type, product_sku, variant_suffix, size_info,
    warehouse_id, on_hand_delta, reserved_delta, on_hand_after, reserved_after,
    reference_type, reference_id, reference_line_id, transfer_group_id,
    actor_user_id, reason, idempotency_key
  ) VALUES
    (v_source_event, p_sequence_start, p_operation_type || '_out', p_product_sku,
      COALESCE(p_variant_suffix, ''), COALESCE(p_size_info, ''), p_source_warehouse_id,
      -p_quantity, 0, v_source.on_hand, v_source.reserved, p_reference_type,
      p_reference_id, p_reference_line_id, v_group, (SELECT auth.uid()), p_reason,
      p_idempotency_key),
    (v_destination_event, p_sequence_start + 1, p_operation_type || '_in', p_product_sku,
      COALESCE(p_variant_suffix, ''), COALESCE(p_size_info, ''), p_destination_warehouse_id,
      p_quantity, 0, v_destination.on_hand, v_destination.reserved, p_reference_type,
      p_reference_id, p_reference_line_id, v_group, (SELECT auth.uid()), p_reason,
      p_idempotency_key);

  PERFORM private.sync_legacy_inventory_projection(p_product_sku);
  RETURN jsonb_build_object(
    'source_event_id', v_source_event,
    'destination_event_id', v_destination_event,
    'next_sequence', p_sequence_start + 2
  );
END;
$$;

CREATE OR REPLACE FUNCTION private.customer_service_issue_stock(
  p_product_sku text,
  p_variant_suffix text,
  p_size_info text,
  p_warehouse_id uuid,
  p_quantity integer,
  p_operation_type text,
  p_reference_type text,
  p_reference_id text,
  p_reference_line_id text,
  p_reason text,
  p_idempotency_key text,
  p_sequence_no integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_balance public.inventory_balances%ROWTYPE;
  v_event_id uuid := gen_random_uuid();
BEGIN
  IF p_quantity <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Η ποσότητα εξόδου πρέπει να είναι θετική.';
  END IF;
  PERFORM private.assert_inventory_item_ready(p_product_sku);
  SELECT * INTO v_balance FROM public.inventory_balances
  WHERE product_sku = p_product_sku
    AND variant_suffix = COALESCE(p_variant_suffix, '')
    AND size_info = COALESCE(p_size_info, '')
    AND warehouse_id = p_warehouse_id
  FOR UPDATE;
  IF NOT FOUND OR v_balance.on_hand - v_balance.reserved < p_quantity THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Δεν υπάρχει επαρκές διαθέσιμο απόθεμα για την έξοδο.';
  END IF;
  UPDATE public.inventory_balances
  SET on_hand = on_hand - p_quantity, version = version + 1, updated_at = now()
  WHERE product_sku = p_product_sku
    AND variant_suffix = COALESCE(p_variant_suffix, '')
    AND size_info = COALESCE(p_size_info, '')
    AND warehouse_id = p_warehouse_id
  RETURNING * INTO v_balance;
  INSERT INTO public.inventory_events (
    id, sequence_no, operation_type, product_sku, variant_suffix, size_info,
    warehouse_id, on_hand_delta, reserved_delta, on_hand_after, reserved_after,
    reference_type, reference_id, reference_line_id, actor_user_id, reason, idempotency_key
  ) VALUES (
    v_event_id, p_sequence_no, p_operation_type, p_product_sku,
    COALESCE(p_variant_suffix, ''), COALESCE(p_size_info, ''), p_warehouse_id,
    -p_quantity, 0, v_balance.on_hand, v_balance.reserved, p_reference_type,
    p_reference_id, p_reference_line_id, (SELECT auth.uid()), p_reason, p_idempotency_key
  );
  PERFORM private.sync_legacy_inventory_projection(p_product_sku);
  RETURN v_event_id;
END;
$$;

CREATE OR REPLACE FUNCTION private.customer_service_receive_stock(
  p_product_sku text,
  p_variant_suffix text,
  p_size_info text,
  p_warehouse_id uuid,
  p_quantity integer,
  p_operation_type text,
  p_reference_type text,
  p_reference_id text,
  p_reference_line_id text,
  p_reason text,
  p_idempotency_key text,
  p_sequence_no integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_balance public.inventory_balances%ROWTYPE;
  v_event_id uuid := gen_random_uuid();
BEGIN
  IF p_quantity <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Η ποσότητα εισόδου πρέπει να είναι θετική.';
  END IF;
  PERFORM private.assert_inventory_item_ready(p_product_sku);
  INSERT INTO public.inventory_balances (product_sku, variant_suffix, size_info, warehouse_id)
  VALUES (p_product_sku, COALESCE(p_variant_suffix, ''), COALESCE(p_size_info, ''), p_warehouse_id)
  ON CONFLICT DO NOTHING;
  SELECT * INTO v_balance FROM public.inventory_balances
  WHERE product_sku = p_product_sku
    AND variant_suffix = COALESCE(p_variant_suffix, '')
    AND size_info = COALESCE(p_size_info, '')
    AND warehouse_id = p_warehouse_id
  FOR UPDATE;
  UPDATE public.inventory_balances
  SET on_hand = on_hand + p_quantity, version = version + 1, updated_at = now()
  WHERE product_sku = p_product_sku
    AND variant_suffix = COALESCE(p_variant_suffix, '')
    AND size_info = COALESCE(p_size_info, '')
    AND warehouse_id = p_warehouse_id
  RETURNING * INTO v_balance;
  INSERT INTO public.inventory_events (
    id, sequence_no, operation_type, product_sku, variant_suffix, size_info,
    warehouse_id, on_hand_delta, reserved_delta, on_hand_after, reserved_after,
    reference_type, reference_id, reference_line_id, actor_user_id, reason, idempotency_key
  ) VALUES (
    v_event_id, p_sequence_no, p_operation_type, p_product_sku,
    COALESCE(p_variant_suffix, ''), COALESCE(p_size_info, ''), p_warehouse_id,
    p_quantity, 0, v_balance.on_hand, v_balance.reserved, p_reference_type,
    p_reference_id, p_reference_line_id, (SELECT auth.uid()), p_reason, p_idempotency_key
  );
  PERFORM private.sync_legacy_inventory_projection(p_product_sku);
  RETURN v_event_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_bulk_consignments_v1(
  p_groups jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing jsonb;
  v_group jsonb;
  v_line jsonb;
  v_allocation jsonb;
  v_consignment_id uuid;
  v_line_id uuid;
  v_customer_id uuid;
  v_seller_id uuid;
  v_source_warehouse_id uuid;
  v_code text;
  v_result_ids jsonb := '[]'::jsonb;
  v_group_count integer := 0;
  v_line_count integer := 0;
  v_remaining_quantity integer;
  v_batch record;
  v_allocation_quantity integer;
BEGIN
  IF NULLIF(btrim(COALESCE(p_idempotency_key, '')), '') IS NULL
     OR jsonb_typeof(p_groups) <> 'array'
     OR jsonb_array_length(p_groups) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Τα στοιχεία μαζικής δημιουργίας δεν είναι έγκυρα.';
  END IF;
  SELECT result INTO v_existing FROM public.customer_service_command_results
  WHERE idempotency_key = p_idempotency_key;
  IF v_existing IS NOT NULL THEN RETURN v_existing || jsonb_build_object('idempotent', true); END IF;

  FOR v_group IN SELECT value FROM jsonb_array_elements(p_groups)
  LOOP
    v_customer_id := NULLIF(v_group->>'customer_id', '')::uuid;
    v_seller_id := NULLIF(v_group->>'seller_id', '')::uuid;
    v_source_warehouse_id := COALESCE(
      NULLIF(v_group->>'source_warehouse_id', '')::uuid,
      '00000000-0000-0000-0000-000000000001'::uuid
    );
    PERFORM private.assert_customer_service_role(
      ARRAY['admin', 'user', 'seller'], v_customer_id, v_seller_id
    );
    IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id = v_customer_id) THEN
      RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Ο πελάτης της Παρακαταθήκης δεν βρέθηκε.';
    END IF;
    IF jsonb_typeof(v_group->'lines') <> 'array' OR jsonb_array_length(v_group->'lines') = 0 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Κάθε Παρακαταθήκη χρειάζεται τουλάχιστον μία γραμμή.';
    END IF;
    v_code := private.next_consignment_code();
    INSERT INTO public.consignments (
      id, code, customer_id, seller_id, source_order_id, source_warehouse_id,
      status, review_due_at, notes, created_by
    ) VALUES (
      gen_random_uuid(), v_code, v_customer_id, v_seller_id,
      NULLIF(v_group->>'source_order_id', ''), v_source_warehouse_id,
      'pending_handoff', COALESCE(NULLIF(v_group->>'review_due_at', '')::date, CURRENT_DATE + 30),
      NULLIF(btrim(COALESCE(v_group->>'notes', '')), ''), (SELECT auth.uid())
    ) RETURNING id INTO v_consignment_id;

    FOR v_line IN SELECT value FROM jsonb_array_elements(v_group->'lines')
    LOOP
      IF COALESCE((v_line->>'quantity')::integer, 0) <= 0
         OR NULLIF(btrim(COALESCE(v_line->>'product_sku', '')), '') IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Κάθε γραμμή χρειάζεται προϊόν και θετική ποσότητα.';
      END IF;
      INSERT INTO public.consignment_lines (
        consignment_id, order_line_id, product_sku, variant_suffix, size_info,
        cord_color, enamel_color, quantity, locked_unit_cost, locked_unit_price,
        price_override_reason
      ) VALUES (
        v_consignment_id, NULLIF(v_line->>'order_line_id', ''), btrim(v_line->>'product_sku'),
        COALESCE(v_line->>'variant_suffix', ''), COALESCE(v_line->>'size_info', ''),
        NULLIF(v_line->>'cord_color', ''), NULLIF(v_line->>'enamel_color', ''),
        (v_line->>'quantity')::integer,
        GREATEST(COALESCE((v_line->>'locked_unit_cost')::numeric, 0), 0),
        GREATEST(COALESCE((v_line->>'locked_unit_price')::numeric, 0), 0),
        NULLIF(btrim(COALESCE(v_line->>'price_override_reason', '')), '')
      ) RETURNING id INTO v_line_id;
      v_line_count := v_line_count + 1;

      IF jsonb_typeof(v_line->'allocations') = 'array' THEN
        FOR v_allocation IN SELECT value FROM jsonb_array_elements(v_line->'allocations')
        LOOP
          INSERT INTO public.consignment_allocations (
            consignment_line_id, production_batch_id, quantity
          ) VALUES (
            v_line_id, v_allocation->>'production_batch_id',
            (v_allocation->>'quantity')::integer
          );
          UPDATE public.production_batches
          SET workflow_kind = 'consignment', consignment_line_id = v_line_id, updated_at = now()
          WHERE id = v_allocation->>'production_batch_id';
        END LOOP;
      ELSIF NULLIF(v_line->>'order_line_id', '') IS NOT NULL
            AND NULLIF(v_group->>'source_order_id', '') IS NOT NULL THEN
        v_remaining_quantity := (v_line->>'quantity')::integer;
        FOR v_batch IN
          SELECT id, quantity
          FROM public.production_batches
          WHERE order_id = v_group->>'source_order_id'
            AND line_id = v_line->>'order_line_id'
          ORDER BY created_at, id
          FOR UPDATE
        LOOP
          EXIT WHEN v_remaining_quantity <= 0;
          v_allocation_quantity := LEAST(v_remaining_quantity, v_batch.quantity);
          INSERT INTO public.consignment_allocations (
            consignment_line_id, production_batch_id, quantity
          ) VALUES (v_line_id, v_batch.id, v_allocation_quantity);
          UPDATE public.production_batches
          SET workflow_kind = 'consignment', consignment_line_id = v_line_id, updated_at = now()
          WHERE id = v_batch.id;
          v_remaining_quantity := v_remaining_quantity - v_allocation_quantity;
        END LOOP;
      END IF;
    END LOOP;

    INSERT INTO public.consignment_events (
      consignment_id, event_type, payload, actor_user_id
    ) VALUES (
      v_consignment_id, 'created', jsonb_build_object('code', v_code), (SELECT auth.uid())
    );
    v_result_ids := v_result_ids || jsonb_build_array(jsonb_build_object('id', v_consignment_id, 'code', v_code));
    v_group_count := v_group_count + 1;
  END LOOP;

  v_existing := jsonb_build_object(
    'consignments', v_result_ids, 'consignment_count', v_group_count,
    'line_count', v_line_count, 'idempotent', false
  );
  INSERT INTO public.customer_service_command_results (
    idempotency_key, operation_type, result, actor_user_id
  ) VALUES (p_idempotency_key, 'consignment_bulk_create', v_existing, (SELECT auth.uid()));
  RETURN v_existing;
END;
$$;

CREATE OR REPLACE FUNCTION public.handoff_consignment_v1(
  p_consignment_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_parent public.consignments%ROWTYPE;
  v_line public.consignment_lines%ROWTYPE;
  v_existing jsonb;
  v_move jsonb;
  v_sequence integer := 1;
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
    v_move := private.customer_service_move_stock(
      v_line.product_sku, v_line.variant_suffix, v_line.size_info,
      v_parent.source_warehouse_id,
      '00000000-0000-0000-0000-000000000003'::uuid,
      v_line.quantity, 'consignment_handoff', 'consignment',
      p_consignment_id::text, v_line.id::text,
      'Παράδοση προϊόντων σε Παρακαταθήκη ' || v_parent.code,
      p_idempotency_key, v_sequence
    );
    v_sequence := (v_move->>'next_sequence')::integer;
  END LOOP;
  UPDATE public.consignments
  SET status = 'active', handed_off_at = now(), updated_at = now()
  WHERE id = p_consignment_id;
  INSERT INTO public.consignment_events (consignment_id, event_type, payload, actor_user_id)
  VALUES (p_consignment_id, 'handed_off', jsonb_build_object('line_count', v_sequence / 2), (SELECT auth.uid()));
  v_existing := jsonb_build_object('consignment_id', p_consignment_id, 'status', 'active', 'idempotent', false);
  INSERT INTO public.customer_service_command_results VALUES (
    p_idempotency_key, 'consignment_handoff', v_existing, (SELECT auth.uid()), now()
  );
  RETURN v_existing;
END;
$$;

CREATE OR REPLACE FUNCTION public.override_consignment_line_price_v1(
  p_line_id uuid,
  p_new_unit_price numeric,
  p_reason text
)
RETURNS public.consignment_lines
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_line public.consignment_lines%ROWTYPE;
  v_parent public.consignments%ROWTYPE;
  v_old numeric;
BEGIN
  SELECT * INTO v_line FROM public.consignment_lines WHERE id = p_line_id FOR UPDATE;
  SELECT * INTO v_parent FROM public.consignments WHERE id = v_line.consignment_id;
  PERFORM private.assert_customer_service_role(
    ARRAY['admin', 'user', 'seller'], v_parent.customer_id, v_parent.seller_id
  );
  IF p_new_unit_price < 0 OR NULLIF(btrim(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Η νέα τιμή και η αιτιολογία είναι υποχρεωτικές.';
  END IF;
  v_old := v_line.locked_unit_price;
  UPDATE public.consignment_lines
  SET locked_unit_price = p_new_unit_price, price_override_reason = btrim(p_reason), updated_at = now()
  WHERE id = p_line_id RETURNING * INTO v_line;
  INSERT INTO public.consignment_events (
    consignment_id, consignment_line_id, event_type, payload, actor_user_id
  ) VALUES (
    v_parent.id, p_line_id, 'price_overridden',
    jsonb_build_object('old_price', v_old, 'new_price', p_new_unit_price, 'reason', btrim(p_reason)),
    (SELECT auth.uid())
  );
  RETURN v_line;
END;
$$;

CREATE OR REPLACE FUNCTION public.settle_consignment_sale_v1(
  p_line_id uuid,
  p_quantity integer,
  p_unit_price numeric,
  p_price_override_reason text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_line public.consignment_lines%ROWTYPE;
  v_parent public.consignments%ROWTYPE;
  v_settlement_id uuid := gen_random_uuid();
  v_existing jsonb;
BEGIN
  SELECT result INTO v_existing FROM public.customer_service_command_results WHERE idempotency_key = p_idempotency_key;
  IF v_existing IS NOT NULL THEN RETURN v_existing || jsonb_build_object('idempotent', true); END IF;
  SELECT * INTO v_line FROM public.consignment_lines WHERE id = p_line_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Η γραμμή Παρακαταθήκης δεν βρέθηκε.'; END IF;
  SELECT * INTO v_parent FROM public.consignments WHERE id = v_line.consignment_id FOR UPDATE;
  PERFORM private.assert_customer_service_role(
    ARRAY['admin', 'user', 'seller'], v_parent.customer_id, v_parent.seller_id
  );
  IF v_parent.status NOT IN ('active', 'partially_settled')
     OR p_quantity <= 0 OR p_quantity > v_line.pending_quantity OR p_unit_price < 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Η ποσότητα ή η κατάσταση της πώλησης δεν είναι έγκυρη.';
  END IF;
  IF p_unit_price IS DISTINCT FROM v_line.locked_unit_price
     AND NULLIF(btrim(COALESCE(p_price_override_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Η αιτιολογία αλλαγής τιμής είναι υποχρεωτική.';
  END IF;

  PERFORM private.customer_service_issue_stock(
    v_line.product_sku, v_line.variant_suffix, v_line.size_info,
    '00000000-0000-0000-0000-000000000003'::uuid, p_quantity,
    'consignment_sale', 'consignment_settlement', v_settlement_id::text,
    v_line.id::text, 'Πώληση από Παρακαταθήκη ' || v_parent.code,
    p_idempotency_key, 1
  );
  UPDATE public.consignment_lines
  SET sold_quantity = sold_quantity + p_quantity, updated_at = now()
  WHERE id = p_line_id;
  INSERT INTO public.consignment_settlements (
    id, consignment_line_id, quantity, unit_price, price_override_reason, created_by
  ) VALUES (
    v_settlement_id, p_line_id, p_quantity, p_unit_price,
    NULLIF(btrim(COALESCE(p_price_override_reason, '')), ''), (SELECT auth.uid())
  );
  INSERT INTO public.consignment_events (
    consignment_id, consignment_line_id, event_type, payload, actor_user_id
  ) VALUES (
    v_parent.id, p_line_id, 'sale_recorded',
    jsonb_build_object('settlement_id', v_settlement_id, 'quantity', p_quantity, 'unit_price', p_unit_price),
    (SELECT auth.uid())
  );
  PERFORM private.refresh_consignment_status(v_parent.id);
  v_existing := jsonb_build_object('settlement_id', v_settlement_id, 'consignment_id', v_parent.id, 'idempotent', false);
  INSERT INTO public.customer_service_command_results VALUES (
    p_idempotency_key, 'consignment_sale', v_existing, (SELECT auth.uid()), now()
  );
  RETURN v_existing;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_consignment_payment_v1(
  p_settlement_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_notes text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_settlement public.consignment_settlements%ROWTYPE;
  v_line public.consignment_lines%ROWTYPE;
  v_parent public.consignments%ROWTYPE;
  v_existing jsonb;
  v_new_paid numeric;
BEGIN
  SELECT result INTO v_existing FROM public.customer_service_command_results WHERE idempotency_key = p_idempotency_key;
  IF v_existing IS NOT NULL THEN RETURN v_existing || jsonb_build_object('idempotent', true); END IF;
  SELECT * INTO v_settlement FROM public.consignment_settlements WHERE id = p_settlement_id FOR UPDATE;
  SELECT * INTO v_line FROM public.consignment_lines WHERE id = v_settlement.consignment_line_id;
  SELECT * INTO v_parent FROM public.consignments WHERE id = v_line.consignment_id FOR UPDATE;
  PERFORM private.assert_customer_service_role(
    ARRAY['admin', 'user', 'seller'], v_parent.customer_id, v_parent.seller_id
  );
  IF v_settlement.status = 'reversed' OR p_amount <= 0
     OR v_settlement.paid_amount + p_amount > v_settlement.total_amount THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Το ποσό πληρωμής δεν είναι έγκυρο.';
  END IF;
  v_new_paid := v_settlement.paid_amount + p_amount;
  INSERT INTO public.consignment_payments (
    settlement_id, amount, payment_method, notes, created_by
  ) VALUES (
    p_settlement_id, p_amount, NULLIF(btrim(COALESCE(p_payment_method, '')), ''),
    NULLIF(btrim(COALESCE(p_notes, '')), ''), (SELECT auth.uid())
  );
  UPDATE public.consignment_settlements
  SET paid_amount = v_new_paid,
      status = CASE WHEN v_new_paid >= total_amount THEN 'paid' ELSE 'partial' END,
      updated_at = now()
  WHERE id = p_settlement_id;
  INSERT INTO public.consignment_events (
    consignment_id, consignment_line_id, event_type, payload, actor_user_id
  ) VALUES (
    v_parent.id, v_line.id, 'payment_recorded',
    jsonb_build_object('settlement_id', p_settlement_id, 'amount', p_amount), (SELECT auth.uid())
  );
  PERFORM private.refresh_consignment_status(v_parent.id);
  v_existing := jsonb_build_object('settlement_id', p_settlement_id, 'paid_amount', v_new_paid, 'idempotent', false);
  INSERT INTO public.customer_service_command_results VALUES (
    p_idempotency_key, 'consignment_payment', v_existing, (SELECT auth.uid()), now()
  );
  RETURN v_existing;
END;
$$;

CREATE OR REPLACE FUNCTION public.receive_consignment_return_v1(
  p_line_id uuid,
  p_quantity integer,
  p_notes text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_line public.consignment_lines%ROWTYPE;
  v_parent public.consignments%ROWTYPE;
  v_return_id uuid := gen_random_uuid();
  v_existing jsonb;
BEGIN
  SELECT result INTO v_existing FROM public.customer_service_command_results WHERE idempotency_key = p_idempotency_key;
  IF v_existing IS NOT NULL THEN RETURN v_existing || jsonb_build_object('idempotent', true); END IF;
  SELECT * INTO v_line FROM public.consignment_lines WHERE id = p_line_id FOR UPDATE;
  SELECT * INTO v_parent FROM public.consignments WHERE id = v_line.consignment_id FOR UPDATE;
  PERFORM private.assert_customer_service_role(
    ARRAY['admin', 'user', 'seller'], v_parent.customer_id, v_parent.seller_id
  );
  IF p_quantity <= 0 OR p_quantity > v_line.pending_quantity
     OR v_parent.status NOT IN ('active', 'partially_settled') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Η ποσότητα επιστροφής δεν είναι έγκυρη.';
  END IF;
  PERFORM private.customer_service_move_stock(
    v_line.product_sku, v_line.variant_suffix, v_line.size_info,
    '00000000-0000-0000-0000-000000000003'::uuid,
    '00000000-0000-0000-0000-000000000004'::uuid,
    p_quantity, 'consignment_return', 'consignment_return', v_return_id::text,
    v_line.id::text, 'Παραλαβή επιστροφής από Παρακαταθήκη ' || v_parent.code,
    p_idempotency_key, 1
  );
  UPDATE public.consignment_lines
  SET returned_quantity = returned_quantity + p_quantity, updated_at = now()
  WHERE id = p_line_id;
  INSERT INTO public.consignment_returns (
    id, consignment_line_id, quantity, notes, created_by
  ) VALUES (
    v_return_id, p_line_id, p_quantity, NULLIF(btrim(COALESCE(p_notes, '')), ''), (SELECT auth.uid())
  );
  INSERT INTO public.consignment_events (
    consignment_id, consignment_line_id, event_type, payload, actor_user_id
  ) VALUES (
    v_parent.id, p_line_id, 'return_received',
    jsonb_build_object('return_id', v_return_id, 'quantity', p_quantity), (SELECT auth.uid())
  );
  PERFORM private.refresh_consignment_status(v_parent.id);
  v_existing := jsonb_build_object('return_id', v_return_id, 'consignment_id', v_parent.id, 'idempotent', false);
  INSERT INTO public.customer_service_command_results VALUES (
    p_idempotency_key, 'consignment_return', v_existing, (SELECT auth.uid()), now()
  );
  RETURN v_existing;
END;
$$;

CREATE OR REPLACE FUNCTION public.route_consignment_return_v1(
  p_return_id uuid,
  p_resolution text,
  p_destination_warehouse_id uuid,
  p_reason text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_return public.consignment_returns%ROWTYPE;
  v_line public.consignment_lines%ROWTYPE;
  v_parent public.consignments%ROWTYPE;
  v_batch_id text;
  v_existing jsonb;
BEGIN
  SELECT result INTO v_existing FROM public.customer_service_command_results WHERE idempotency_key = p_idempotency_key;
  IF v_existing IS NOT NULL THEN RETURN v_existing || jsonb_build_object('idempotent', true); END IF;
  SELECT * INTO v_return FROM public.consignment_returns WHERE id = p_return_id FOR UPDATE;
  SELECT * INTO v_line FROM public.consignment_lines WHERE id = v_return.consignment_line_id;
  SELECT * INTO v_parent FROM public.consignments WHERE id = v_line.consignment_id;
  PERFORM private.assert_customer_service_role(ARRAY['admin', 'user'], v_parent.customer_id, v_parent.seller_id);
  IF v_return.status <> 'inspection' OR p_resolution NOT IN ('restocked', 'production', 'damaged')
     OR NULLIF(btrim(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Η δρομολόγηση επιστροφής δεν είναι έγκυρη.';
  END IF;
  IF p_resolution = 'restocked' THEN
    IF p_destination_warehouse_id IS NULL OR p_destination_warehouse_id IN (
      '00000000-0000-0000-0000-000000000003'::uuid,
      '00000000-0000-0000-0000-000000000004'::uuid
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Επιλέξτε κανονική αποθήκη προορισμού.';
    END IF;
    PERFORM private.customer_service_move_stock(
      v_line.product_sku, v_line.variant_suffix, v_line.size_info,
      '00000000-0000-0000-0000-000000000004'::uuid, p_destination_warehouse_id,
      v_return.quantity, 'consignment_restock', 'consignment_return', p_return_id::text,
      v_line.id::text, btrim(p_reason), p_idempotency_key, 1
    );
  ELSIF p_resolution = 'damaged' THEN
    PERFORM private.customer_service_issue_stock(
      v_line.product_sku, v_line.variant_suffix, v_line.size_info,
      '00000000-0000-0000-0000-000000000004'::uuid, v_return.quantity,
      'consignment_damage', 'consignment_return', p_return_id::text,
      v_line.id::text, btrim(p_reason), p_idempotency_key, 1
    );
  ELSE
    v_batch_id := 'ΠΑΡΕΠΙΣ-' || replace(gen_random_uuid()::text, '-', '');
    INSERT INTO public.production_batches (
      id, order_id, sku, variant_suffix, quantity, current_stage, priority, type,
      notes, requires_setting, requires_assembly, size_info, line_id, on_hold,
      pending_dispatch, fulfillment_source, legacy_inventory_issued,
      workflow_kind, consignment_line_id, created_at, updated_at
    ) VALUES (
      v_batch_id, NULL, v_line.product_sku, NULLIF(v_line.variant_suffix, ''),
      v_return.quantity, 'Waxing', 'Normal', 'Φρεσκάρισμα', btrim(p_reason),
      false, false, NULLIF(v_line.size_info, ''), v_line.id::text, false, false,
      'production', false, 'consignment', v_line.id, now(), now()
    );
    INSERT INTO public.batch_stage_history (
      id, batch_id, from_stage, to_stage, moved_by, moved_at, notes
    ) VALUES (
      gen_random_uuid(), v_batch_id, NULL, 'Waxing', 'Σύστημα', now(),
      'Επιστροφή Παρακαταθήκης προς φρεσκάρισμα.'
    );
  END IF;
  UPDATE public.consignment_returns
  SET status = p_resolution, destination_warehouse_id = p_destination_warehouse_id,
      production_batch_id = v_batch_id, resolved_at = now(), updated_at = now()
  WHERE id = p_return_id;
  INSERT INTO public.consignment_events (
    consignment_id, consignment_line_id, event_type, payload, actor_user_id
  ) VALUES (
    v_parent.id, v_line.id, 'return_routed',
    jsonb_build_object('return_id', p_return_id, 'resolution', p_resolution, 'reason', btrim(p_reason)),
    (SELECT auth.uid())
  );
  v_existing := jsonb_build_object('return_id', p_return_id, 'resolution', p_resolution, 'production_batch_id', v_batch_id, 'idempotent', false);
  INSERT INTO public.customer_service_command_results VALUES (
    p_idempotency_key, 'consignment_return_route', v_existing, (SELECT auth.uid()), now()
  );
  RETURN v_existing;
END;
$$;

CREATE OR REPLACE FUNCTION public.reverse_consignment_settlement_v1(
  p_settlement_id uuid,
  p_reason text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_settlement public.consignment_settlements%ROWTYPE;
  v_line public.consignment_lines%ROWTYPE;
  v_parent public.consignments%ROWTYPE;
  v_existing jsonb;
BEGIN
  SELECT result INTO v_existing FROM public.customer_service_command_results WHERE idempotency_key = p_idempotency_key;
  IF v_existing IS NOT NULL THEN RETURN v_existing || jsonb_build_object('idempotent', true); END IF;
  PERFORM private.assert_customer_service_role(ARRAY['admin']);
  SELECT * INTO v_settlement FROM public.consignment_settlements WHERE id = p_settlement_id FOR UPDATE;
  SELECT * INTO v_line FROM public.consignment_lines WHERE id = v_settlement.consignment_line_id FOR UPDATE;
  SELECT * INTO v_parent FROM public.consignments WHERE id = v_line.consignment_id FOR UPDATE;
  IF v_settlement.status = 'reversed' OR v_settlement.paid_amount > 0 OR v_settlement.legal_document_id IS NOT NULL
     OR NULLIF(btrim(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Η πώληση δεν μπορεί να αντιστραφεί επειδή έχει πληρωμή, παραστατικό ή έχει ήδη αντιστραφεί.';
  END IF;
  PERFORM private.customer_service_receive_stock(
    v_line.product_sku, v_line.variant_suffix, v_line.size_info,
    '00000000-0000-0000-0000-000000000003'::uuid,
    v_settlement.quantity, 'consignment_sale_reversal', 'consignment_settlement',
    p_settlement_id::text, v_line.id::text, btrim(p_reason), p_idempotency_key, 1
  );
  UPDATE public.consignment_lines
  SET sold_quantity = sold_quantity - v_settlement.quantity, updated_at = now()
  WHERE id = v_line.id;
  UPDATE public.consignment_settlements
  SET status = 'reversed', reversed_at = now(), reversed_by = (SELECT auth.uid()),
      reversal_reason = btrim(p_reason), updated_at = now()
  WHERE id = p_settlement_id;
  INSERT INTO public.consignment_events (
    consignment_id, consignment_line_id, event_type, payload, actor_user_id
  ) VALUES (
    v_parent.id, v_line.id, 'sale_reversed',
    jsonb_build_object('settlement_id', p_settlement_id, 'reason', btrim(p_reason)), (SELECT auth.uid())
  );
  PERFORM private.refresh_consignment_status(v_parent.id);
  v_existing := jsonb_build_object('settlement_id', p_settlement_id, 'reversed', true, 'idempotent', false);
  INSERT INTO public.customer_service_command_results VALUES (
    p_idempotency_key, 'consignment_sale_reversal', v_existing, (SELECT auth.uid()), now()
  );
  RETURN v_existing;
END;
$$;

CREATE OR REPLACE FUNCTION public.reverse_consignment_return_v1(
  p_return_id uuid,
  p_reason text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_return public.consignment_returns%ROWTYPE;
  v_line public.consignment_lines%ROWTYPE;
  v_parent public.consignments%ROWTYPE;
  v_existing jsonb;
BEGIN
  SELECT result INTO v_existing FROM public.customer_service_command_results WHERE idempotency_key = p_idempotency_key;
  IF v_existing IS NOT NULL THEN RETURN v_existing || jsonb_build_object('idempotent', true); END IF;
  PERFORM private.assert_customer_service_role(ARRAY['admin']);
  SELECT * INTO v_return FROM public.consignment_returns WHERE id = p_return_id FOR UPDATE;
  SELECT * INTO v_line FROM public.consignment_lines WHERE id = v_return.consignment_line_id FOR UPDATE;
  SELECT * INTO v_parent FROM public.consignments WHERE id = v_line.consignment_id FOR UPDATE;
  IF v_return.id IS NULL OR v_return.status <> 'inspection' OR NULLIF(btrim(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Αντιστροφή επιτρέπεται μόνο όσο η επιστροφή βρίσκεται στον Έλεγχο Επιστροφών και με αιτιολογία.';
  END IF;
  PERFORM private.customer_service_move_stock(
    v_line.product_sku, v_line.variant_suffix, v_line.size_info,
    '00000000-0000-0000-0000-000000000004'::uuid,
    '00000000-0000-0000-0000-000000000003'::uuid,
    v_return.quantity, 'consignment_return_reversal', 'consignment_return',
    p_return_id::text, v_line.id::text, btrim(p_reason), p_idempotency_key, 1
  );
  UPDATE public.consignment_lines
  SET returned_quantity = returned_quantity - v_return.quantity, updated_at = now()
  WHERE id = v_line.id;
  UPDATE public.consignment_returns
  SET status = 'reversed', resolved_at = now(), notes = concat_ws(E'\n', notes, 'Αντιστροφή: ' || btrim(p_reason)), updated_at = now()
  WHERE id = p_return_id;
  INSERT INTO public.consignment_events (consignment_id, consignment_line_id, event_type, payload, actor_user_id)
  VALUES (v_parent.id, v_line.id, 'return_reversed', jsonb_build_object('return_id', p_return_id, 'reason', btrim(p_reason)), (SELECT auth.uid()));
  PERFORM private.refresh_consignment_status(v_parent.id);
  v_existing := jsonb_build_object('return_id', p_return_id, 'reversed', true, 'idempotent', false);
  INSERT INTO public.customer_service_command_results VALUES (p_idempotency_key, 'consignment_return_reversal', v_existing, (SELECT auth.uid()), now());
  RETURN v_existing;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_consignment_v1(
  p_consignment_id uuid,
  p_reason text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_parent public.consignments%ROWTYPE;
  v_existing jsonb;
BEGIN
  SELECT result INTO v_existing FROM public.customer_service_command_results WHERE idempotency_key = p_idempotency_key;
  IF v_existing IS NOT NULL THEN RETURN v_existing || jsonb_build_object('idempotent', true); END IF;
  SELECT * INTO v_parent FROM public.consignments WHERE id = p_consignment_id FOR UPDATE;
  PERFORM private.assert_customer_service_role(ARRAY['admin', 'user', 'seller'], v_parent.customer_id, v_parent.seller_id);
  IF v_parent.id IS NULL OR v_parent.status NOT IN ('draft', 'pending_handoff') OR v_parent.handed_off_at IS NOT NULL
     OR NULLIF(btrim(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Ακύρωση επιτρέπεται μόνο πριν από την παράδοση και με αιτιολογία.';
  END IF;
  UPDATE public.consignments SET status = 'cancelled', completed_at = now(), updated_at = now() WHERE id = p_consignment_id;
  UPDATE public.production_batches batch
  SET consignment_line_id = NULL, updated_at = now()
  WHERE batch.consignment_line_id IN (SELECT id FROM public.consignment_lines WHERE consignment_id = p_consignment_id);
  INSERT INTO public.consignment_events (consignment_id, event_type, payload, actor_user_id)
  VALUES (p_consignment_id, 'cancelled', jsonb_build_object('reason', btrim(p_reason)), (SELECT auth.uid()));
  v_existing := jsonb_build_object('consignment_id', p_consignment_id, 'cancelled', true, 'idempotent', false);
  INSERT INTO public.customer_service_command_results VALUES (p_idempotency_key, 'consignment_cancel', v_existing, (SELECT auth.uid()), now());
  RETURN v_existing;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_repair_intake_v1(
  p_customer_id uuid,
  p_seller_id uuid,
  p_items jsonb,
  p_notes text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing jsonb;
  v_item jsonb;
  v_intake_id uuid := gen_random_uuid();
  v_repair_item_id uuid;
  v_cycle_id uuid;
  v_batch_id text;
  v_intake_code text;
  v_item_code text;
  v_item_results jsonb := '[]'::jsonb;
  v_product_sku text;
  v_description text;
BEGIN
  SELECT result INTO v_existing FROM public.customer_service_command_results WHERE idempotency_key = p_idempotency_key;
  IF v_existing IS NOT NULL THEN RETURN v_existing || jsonb_build_object('idempotent', true); END IF;
  PERFORM private.assert_customer_service_role(
    ARRAY['admin', 'user', 'seller'], p_customer_id, p_seller_id
  );
  IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id = p_customer_id)
     OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Η παραλαβή χρειάζεται έγκυρο πελάτη και τουλάχιστον ένα τεμάχιο.';
  END IF;
  v_intake_code := private.next_repair_intake_code();
  INSERT INTO public.repair_intakes (
    id, code, customer_id, seller_id, notes, created_by
  ) VALUES (
    v_intake_id, v_intake_code, p_customer_id, p_seller_id,
    NULLIF(btrim(COALESCE(p_notes, '')), ''), (SELECT auth.uid())
  );

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_description := btrim(COALESCE(v_item->>'description', ''));
    v_product_sku := NULLIF(btrim(COALESCE(v_item->>'product_sku', '')), '');
    IF v_description = '' OR COALESCE(v_item->>'origin_type', '') NOT IN ('recorded_sale', 'legacy_own', 'third_party') THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Κάθε επισκευή χρειάζεται περιγραφή και προέλευση.';
    END IF;
    IF v_product_sku IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.products WHERE sku = v_product_sku) THEN
      RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Ο επιλεγμένος κωδικός προϊόντος δεν βρέθηκε.';
    END IF;
    v_repair_item_id := gen_random_uuid();
    v_cycle_id := gen_random_uuid();
    v_batch_id := 'ΕΠ-' || replace(gen_random_uuid()::text, '-', '');
    v_item_code := private.next_repair_item_code();

    INSERT INTO public.repair_items (
      id, code, intake_id, customer_id, seller_id, origin_type, source_order_id,
      source_order_line_id, source_consignment_settlement_id, product_sku,
      variant_suffix, size_info, description, intake_condition, accessories,
      previous_repair_item_id, created_by
    ) VALUES (
      v_repair_item_id, v_item_code, v_intake_id, p_customer_id, p_seller_id,
      v_item->>'origin_type', NULLIF(v_item->>'source_order_id', ''),
      NULLIF(v_item->>'source_order_line_id', ''),
      NULLIF(v_item->>'source_consignment_settlement_id', '')::uuid,
      v_product_sku, COALESCE(v_item->>'variant_suffix', ''),
      COALESCE(v_item->>'size_info', ''), v_description,
      NULLIF(btrim(COALESCE(v_item->>'intake_condition', '')), ''),
      NULLIF(btrim(COALESCE(v_item->>'accessories', '')), ''),
      NULLIF(v_item->>'previous_repair_item_id', '')::uuid, (SELECT auth.uid())
    );
    INSERT INTO public.repair_cycles (
      id, repair_item_id, cycle_number, production_batch_id
    ) VALUES (v_cycle_id, v_repair_item_id, 1, v_batch_id);
    INSERT INTO public.production_batches (
      id, order_id, sku, variant_suffix, quantity, current_stage, priority, type,
      notes, requires_setting, requires_assembly, size_info, line_id, on_hold,
      pending_dispatch, fulfillment_source, legacy_inventory_issued,
      workflow_kind, repair_item_id, repair_cycle_id, created_at, updated_at
    ) VALUES (
      v_batch_id, NULL, COALESCE(v_product_sku, 'SP'),
      NULLIF(COALESCE(v_item->>'variant_suffix', ''), ''), 1,
      'Αναμονή Παραλαβής', COALESCE(NULLIF(v_item->>'priority', ''), 'Normal'),
      'Φρεσκάρισμα', v_description,
      COALESCE((v_item->>'requires_setting')::boolean, false),
      COALESCE((v_item->>'requires_assembly')::boolean, false),
      NULLIF(COALESCE(v_item->>'size_info', ''), ''), v_item_code,
      false, false, 'production', false, 'repair', v_repair_item_id, v_cycle_id,
      now(), now()
    );
    INSERT INTO public.batch_stage_history (
      id, batch_id, from_stage, to_stage, moved_by, moved_at, notes
    ) VALUES (
      gen_random_uuid(), v_batch_id, NULL, 'Αναμονή Παραλαβής', 'Σύστημα', now(),
      'Αυτόματη δημιουργία από Παραλαβή Επισκευών.'
    );
    INSERT INTO public.repair_events (
      repair_item_id, repair_cycle_id, event_type, payload, actor_user_id
    ) VALUES (
      v_repair_item_id, v_cycle_id, 'received',
      jsonb_build_object('intake_code', v_intake_code, 'repair_code', v_item_code), (SELECT auth.uid())
    );
    v_item_results := v_item_results || jsonb_build_array(jsonb_build_object(
      'id', v_repair_item_id, 'code', v_item_code, 'production_batch_id', v_batch_id
    ));
  END LOOP;

  v_existing := jsonb_build_object(
    'intake_id', v_intake_id, 'intake_code', v_intake_code,
    'items', v_item_results, 'idempotent', false
  );
  INSERT INTO public.customer_service_command_results VALUES (
    p_idempotency_key, 'repair_intake_create', v_existing, (SELECT auth.uid()), now()
  );
  RETURN v_existing;
END;
$$;

CREATE OR REPLACE FUNCTION private.sync_repair_status_from_batch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_next_status text;
BEGIN
  IF NEW.workflow_kind <> 'repair' OR NEW.repair_item_id IS NULL
     OR NEW.current_stage IS NOT DISTINCT FROM OLD.current_stage THEN
    RETURN NEW;
  END IF;
  v_next_status := CASE
    WHEN NEW.current_stage = 'Αναμονή Παραλαβής' THEN 'received'
    WHEN NEW.current_stage = 'Ready' THEN 'quality_check'
    ELSE 'in_production'
  END;
  UPDATE public.repair_items
  SET status = v_next_status, updated_at = now()
  WHERE id = NEW.repair_item_id
    AND status NOT IN ('delivered', 'irreparable', 'cancelled');
  INSERT INTO public.repair_events (
    repair_item_id, repair_cycle_id, event_type, payload, actor_user_id
  ) VALUES (
    NEW.repair_item_id, NEW.repair_cycle_id, 'production_stage_changed',
    jsonb_build_object('from_stage', OLD.current_stage, 'to_stage', NEW.current_stage),
    (SELECT auth.uid())
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS production_batch_sync_repair_status ON public.production_batches;
CREATE TRIGGER production_batch_sync_repair_status
AFTER UPDATE OF current_stage ON public.production_batches
FOR EACH ROW EXECUTE FUNCTION private.sync_repair_status_from_batch();

CREATE OR REPLACE FUNCTION public.complete_repair_quality_check_v1(
  p_repair_item_id uuid,
  p_passed boolean,
  p_notes text,
  p_return_stage text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_item public.repair_items%ROWTYPE;
  v_cycle public.repair_cycles%ROWTYPE;
  v_next_cycle_id uuid;
  v_existing jsonb;
  v_actor_name text;
BEGIN
  SELECT result INTO v_existing FROM public.customer_service_command_results WHERE idempotency_key = p_idempotency_key;
  IF v_existing IS NOT NULL THEN RETURN v_existing || jsonb_build_object('idempotent', true); END IF;
  SELECT * INTO v_item FROM public.repair_items WHERE id = p_repair_item_id FOR UPDATE;
  PERFORM private.assert_customer_service_role(ARRAY['admin', 'user'], v_item.customer_id, v_item.seller_id);
  IF v_item.status <> 'quality_check' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Το τεμάχιο δεν βρίσκεται σε Ποιοτικό Έλεγχο.';
  END IF;
  SELECT * INTO v_cycle FROM public.repair_cycles
  WHERE repair_item_id = p_repair_item_id AND cycle_number = v_item.current_cycle_number FOR UPDATE;
  SELECT full_name INTO v_actor_name FROM public.profiles WHERE id = (SELECT auth.uid());

  IF p_passed THEN
    UPDATE public.repair_cycles
    SET quality_status = 'passed', quality_notes = NULLIF(btrim(COALESCE(p_notes, '')), ''), completed_at = now()
    WHERE id = v_cycle.id;
    UPDATE public.repair_items SET status = 'ready_for_return', updated_at = now()
    WHERE id = p_repair_item_id;
    INSERT INTO public.repair_events (
      repair_item_id, repair_cycle_id, event_type, payload, actor_user_id
    ) VALUES (
      p_repair_item_id, v_cycle.id, 'quality_passed',
      jsonb_build_object('notes', NULLIF(btrim(COALESCE(p_notes, '')), '')), (SELECT auth.uid())
    );
  ELSE
    IF NULLIF(btrim(COALESCE(p_notes, '')), '') IS NULL
       OR p_return_stage NOT IN ('Waxing', 'Casting', 'Setting', 'Polishing', 'Assembly', 'Labeling') THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Η αιτία και το στάδιο επανεπισκευής είναι υποχρεωτικά.';
    END IF;
    UPDATE public.repair_cycles
    SET quality_status = 'failed', quality_notes = btrim(p_notes), completed_at = now()
    WHERE id = v_cycle.id;
    v_next_cycle_id := gen_random_uuid();
    INSERT INTO public.repair_cycles (
      id, repair_item_id, cycle_number, production_batch_id
    ) VALUES (
      v_next_cycle_id, p_repair_item_id, v_item.current_cycle_number + 1, v_cycle.production_batch_id
    );
    UPDATE public.repair_items
    SET current_cycle_number = current_cycle_number + 1, status = 'in_production', updated_at = now()
    WHERE id = p_repair_item_id;
    UPDATE public.production_batches
    SET current_stage = p_return_stage, repair_cycle_id = v_next_cycle_id,
        pending_dispatch = CASE WHEN p_return_stage = 'Polishing' THEN true ELSE false END,
        updated_at = now()
    WHERE id = v_cycle.production_batch_id;
    INSERT INTO public.batch_stage_history (
      id, batch_id, from_stage, to_stage, moved_by, moved_at, notes
    ) VALUES (
      gen_random_uuid(), v_cycle.production_batch_id, 'Ready', p_return_stage,
      COALESCE(v_actor_name, 'Σύστημα'), now(), 'Επανεπισκευή: ' || btrim(p_notes)
    );
    INSERT INTO public.repair_events (
      repair_item_id, repair_cycle_id, event_type, payload, actor_user_id
    ) VALUES (
      p_repair_item_id, v_next_cycle_id, 'quality_failed_rework',
      jsonb_build_object('reason', btrim(p_notes), 'return_stage', p_return_stage, 'cycle', v_item.current_cycle_number + 1),
      (SELECT auth.uid())
    );
  END IF;
  v_existing := jsonb_build_object(
    'repair_item_id', p_repair_item_id, 'passed', p_passed,
    'status', CASE WHEN p_passed THEN 'ready_for_return' ELSE 'in_production' END,
    'idempotent', false
  );
  INSERT INTO public.customer_service_command_results VALUES (
    p_idempotency_key, 'repair_quality_check', v_existing, (SELECT auth.uid()), now()
  );
  RETURN v_existing;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_repair_delivered_v1(
  p_repair_item_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_item public.repair_items%ROWTYPE;
  v_existing jsonb;
BEGIN
  SELECT result INTO v_existing FROM public.customer_service_command_results WHERE idempotency_key = p_idempotency_key;
  IF v_existing IS NOT NULL THEN RETURN v_existing || jsonb_build_object('idempotent', true); END IF;
  SELECT * INTO v_item FROM public.repair_items WHERE id = p_repair_item_id FOR UPDATE;
  PERFORM private.assert_customer_service_role(ARRAY['admin', 'user'], v_item.customer_id, v_item.seller_id);
  IF v_item.status <> 'ready_for_return' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Μόνο έτοιμη Επισκευή μπορεί να παραδοθεί.';
  END IF;
  UPDATE public.repair_items SET status = 'delivered', delivered_at = now(), updated_at = now()
  WHERE id = p_repair_item_id;
  INSERT INTO public.repair_events (repair_item_id, event_type, payload, actor_user_id)
  VALUES (p_repair_item_id, 'delivered', '{}'::jsonb, (SELECT auth.uid()));
  IF NOT EXISTS (
    SELECT 1 FROM public.repair_items sibling
    WHERE sibling.intake_id = v_item.intake_id
      AND sibling.status NOT IN ('delivered', 'irreparable', 'cancelled')
  ) THEN
    UPDATE public.repair_intakes SET status = 'completed', updated_at = now()
    WHERE id = v_item.intake_id;
  END IF;
  v_existing := jsonb_build_object('repair_item_id', p_repair_item_id, 'status', 'delivered', 'idempotent', false);
  INSERT INTO public.customer_service_command_results VALUES (
    p_idempotency_key, 'repair_delivered', v_existing, (SELECT auth.uid()), now()
  );
  RETURN v_existing;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_repair_exception_state_v1(
  p_repair_item_id uuid,
  p_status text,
  p_reason text
)
RETURNS public.repair_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_item public.repair_items%ROWTYPE;
BEGIN
  SELECT * INTO v_item FROM public.repair_items WHERE id = p_repair_item_id FOR UPDATE;
  PERFORM private.assert_customer_service_role(ARRAY['admin', 'user'], v_item.customer_id, v_item.seller_id);
  IF p_status NOT IN ('on_hold', 'irreparable', 'cancelled', 'in_production')
     OR NULLIF(btrim(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Η κατάσταση και η αιτιολογία δεν είναι έγκυρες.';
  END IF;
  UPDATE public.repair_items SET status = p_status, updated_at = now()
  WHERE id = p_repair_item_id RETURNING * INTO v_item;
  INSERT INTO public.repair_events (repair_item_id, event_type, payload, actor_user_id)
  VALUES (p_repair_item_id, 'status_changed', jsonb_build_object('status', p_status, 'reason', btrim(p_reason)), (SELECT auth.uid()));
  RETURN v_item;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_repair_cost_line_v1(
  p_repair_item_id uuid,
  p_cost_type text,
  p_description text,
  p_quantity numeric,
  p_unit_cost numeric,
  p_product_sku text,
  p_variant_suffix text,
  p_size_info text,
  p_warehouse_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_item public.repair_items%ROWTYPE;
  v_cycle public.repair_cycles%ROWTYPE;
  v_cost_id uuid := gen_random_uuid();
  v_inventory_event_id uuid;
  v_existing jsonb;
BEGIN
  SELECT result INTO v_existing FROM public.customer_service_command_results WHERE idempotency_key = p_idempotency_key;
  IF v_existing IS NOT NULL THEN RETURN v_existing || jsonb_build_object('idempotent', true); END IF;
  SELECT * INTO v_item FROM public.repair_items WHERE id = p_repair_item_id FOR UPDATE;
  PERFORM private.assert_customer_service_role(ARRAY['admin', 'user'], v_item.customer_id, v_item.seller_id);
  SELECT * INTO v_cycle FROM public.repair_cycles
  WHERE repair_item_id = p_repair_item_id AND cycle_number = v_item.current_cycle_number;
  IF p_cost_type NOT IN ('labor', 'material', 'component', 'external')
     OR NULLIF(btrim(COALESCE(p_description, '')), '') IS NULL
     OR p_quantity <= 0 OR p_unit_cost < 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Η γραμμή κόστους δεν είναι έγκυρη.';
  END IF;
  IF p_product_sku IS NOT NULL THEN
    IF p_warehouse_id IS NULL OR p_quantity <> trunc(p_quantity) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Η κατανάλωση προϊόντος χρειάζεται αποθήκη και ακέραιη ποσότητα.';
    END IF;
    v_inventory_event_id := private.customer_service_issue_stock(
      p_product_sku, COALESCE(p_variant_suffix, ''), COALESCE(p_size_info, ''),
      p_warehouse_id, p_quantity::integer, 'repair_consumption', 'repair_item',
      p_repair_item_id::text, v_cost_id::text, 'Κατανάλωση για Επισκευή ' || v_item.code,
      p_idempotency_key, 1
    );
  END IF;
  INSERT INTO public.repair_cost_lines (
    id, repair_item_id, repair_cycle_id, cost_type, description, quantity,
    unit_cost, product_sku, variant_suffix, size_info, warehouse_id,
    inventory_event_id, created_by
  ) VALUES (
    v_cost_id, p_repair_item_id, v_cycle.id, p_cost_type, btrim(p_description),
    p_quantity, p_unit_cost, p_product_sku, COALESCE(p_variant_suffix, ''),
    COALESCE(p_size_info, ''), p_warehouse_id, v_inventory_event_id, (SELECT auth.uid())
  );
  INSERT INTO public.repair_events (repair_item_id, repair_cycle_id, event_type, payload, actor_user_id)
  VALUES (
    p_repair_item_id, v_cycle.id, 'cost_recorded',
    jsonb_build_object('cost_line_id', v_cost_id, 'cost_type', p_cost_type, 'total', p_quantity * p_unit_cost),
    (SELECT auth.uid())
  );
  v_existing := jsonb_build_object('cost_line_id', v_cost_id, 'inventory_event_id', v_inventory_event_id, 'idempotent', false);
  INSERT INTO public.customer_service_command_results VALUES (
    p_idempotency_key, 'repair_cost', v_existing, (SELECT auth.uid()), now()
  );
  RETURN v_existing;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_repair_charge_v1(
  p_repair_item_id uuid,
  p_charge_type text,
  p_amount numeric,
  p_paid_amount numeric,
  p_notes text
)
RETURNS public.repair_charges
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_item public.repair_items%ROWTYPE;
  v_charge public.repair_charges%ROWTYPE;
  v_payment_status text;
BEGIN
  SELECT * INTO v_item FROM public.repair_items WHERE id = p_repair_item_id;
  PERFORM private.assert_customer_service_role(ARRAY['admin', 'user'], v_item.customer_id, v_item.seller_id);
  IF p_charge_type NOT IN ('warranty', 'chargeable', 'unrecorded')
     OR p_amount < 0 OR p_paid_amount < 0 OR p_paid_amount > p_amount THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Τα στοιχεία χρέωσης δεν είναι έγκυρα.';
  END IF;
  v_payment_status := CASE
    WHEN p_charge_type <> 'chargeable' OR p_amount = 0 THEN 'not_due'
    WHEN p_paid_amount = 0 THEN 'due'
    WHEN p_paid_amount < p_amount THEN 'partial'
    ELSE 'paid'
  END;
  INSERT INTO public.repair_charges (
    repair_item_id, charge_type, amount, paid_amount, payment_status, notes, updated_by
  ) VALUES (
    p_repair_item_id, p_charge_type, p_amount, p_paid_amount, v_payment_status,
    NULLIF(btrim(COALESCE(p_notes, '')), ''), (SELECT auth.uid())
  ) ON CONFLICT (repair_item_id) DO UPDATE
  SET charge_type = EXCLUDED.charge_type, amount = EXCLUDED.amount,
      paid_amount = EXCLUDED.paid_amount, payment_status = EXCLUDED.payment_status,
      notes = EXCLUDED.notes, updated_by = EXCLUDED.updated_by, updated_at = now()
  RETURNING * INTO v_charge;
  INSERT INTO public.repair_events (repair_item_id, event_type, payload, actor_user_id)
  VALUES (
    p_repair_item_id, 'charge_updated',
    jsonb_build_object('charge_type', p_charge_type, 'amount', p_amount, 'paid_amount', p_paid_amount),
    (SELECT auth.uid())
  );
  RETURN v_charge;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_repair_attachment_slot_v1(
  p_repair_item_id uuid,
  p_file_name text,
  p_content_type text,
  p_attachment_type text
)
RETURNS public.repair_attachments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_item public.repair_items%ROWTYPE;
  v_attachment public.repair_attachments%ROWTYPE;
  v_safe_name text;
BEGIN
  SELECT * INTO v_item FROM public.repair_items WHERE id = p_repair_item_id;
  PERFORM private.assert_customer_service_role(
    ARRAY['admin', 'user', 'seller'], v_item.customer_id, v_item.seller_id
  );
  IF p_attachment_type NOT IN ('intake', 'quality', 'other')
     OR p_content_type NOT IN ('image/jpeg','image/png','image/webp','application/pdf') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Ο τύπος αρχείου δεν υποστηρίζεται.';
  END IF;
  v_safe_name := regexp_replace(btrim(COALESCE(p_file_name, 'αρχείο')), '[^[:alnum:]_.-]+', '_', 'g');
  INSERT INTO public.repair_attachments (
    repair_item_id, storage_path, file_name, content_type, attachment_type, uploaded_by
  ) VALUES (
    p_repair_item_id,
    p_repair_item_id::text || '/' || gen_random_uuid()::text || '-' || v_safe_name,
    v_safe_name, p_content_type, p_attachment_type, (SELECT auth.uid())
  ) RETURNING * INTO v_attachment;
  RETURN v_attachment;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_consignment_legal_draft_v1(p_settlement_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_settlement public.consignment_settlements%ROWTYPE;
  v_line public.consignment_lines%ROWTYPE;
  v_parent public.consignments%ROWTYPE;
  v_customer public.customers%ROWTYPE;
  v_document_id uuid := gen_random_uuid();
  v_vat numeric := 0.24;
  v_net numeric;
  v_vat_amount numeric;
BEGIN
  SELECT * INTO v_settlement FROM public.consignment_settlements WHERE id = p_settlement_id FOR UPDATE;
  SELECT * INTO v_line FROM public.consignment_lines WHERE id = v_settlement.consignment_line_id;
  SELECT * INTO v_parent FROM public.consignments WHERE id = v_line.consignment_id;
  SELECT * INTO v_customer FROM public.customers WHERE id = v_parent.customer_id;
  PERFORM private.assert_customer_service_role(ARRAY['admin', 'user'], v_parent.customer_id, v_parent.seller_id);
  IF v_settlement.status = 'reversed' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Δεν δημιουργείται παραστατικό για αντεστραμμένη πώληση.';
  END IF;
  IF v_settlement.legal_document_id IS NOT NULL THEN RETURN v_settlement.legal_document_id; END IF;
  v_vat := COALESCE(v_customer.vat_rate, 0.24);
  v_net := v_settlement.total_amount;
  v_vat_amount := round(v_net * v_vat, 2);
  INSERT INTO public.legal_documents (
    id, source_kind, document_kind, aade_document_type, status, counterpart,
    payment_method_code, currency, vat_rate, totals, created_by
  ) VALUES (
    v_document_id, 'manual', 'invoice', '1.1', 'draft',
    jsonb_build_object('name', v_customer.full_name, 'vat_number', v_customer.vat_number,
      'address', v_customer.address, 'phone', v_customer.phone, 'email', v_customer.email),
    5, 'EUR', v_vat,
    jsonb_build_object('net', v_net, 'vat', v_vat_amount, 'gross', v_net + v_vat_amount, 'quantity', v_settlement.quantity),
    (SELECT full_name FROM public.profiles WHERE id = (SELECT auth.uid()))
  );
  INSERT INTO public.legal_document_lines (
    document_id, line_number, sku, variant_suffix, description, quantity,
    unit_price, net_value, vat_category, vat_amount, gross_value,
    measurement_unit, item_code, income_classification, line_id
  ) VALUES (
    v_document_id, 1, v_line.product_sku, NULLIF(v_line.variant_suffix, ''),
    'Πώληση από Παρακαταθήκη ' || v_parent.code, v_settlement.quantity,
    v_settlement.unit_price, v_net, 1, v_vat_amount, v_net + v_vat_amount,
    1, v_line.product_sku, '{}'::jsonb, v_line.order_line_id
  );
  UPDATE public.consignment_settlements SET legal_document_id = v_document_id, updated_at = now()
  WHERE id = p_settlement_id;
  INSERT INTO public.consignment_events (consignment_id, consignment_line_id, event_type, payload, actor_user_id)
  VALUES (
    v_parent.id, v_line.id, 'legal_draft_created', jsonb_build_object('legal_document_id', v_document_id), (SELECT auth.uid())
  );
  RETURN v_document_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_repair_legal_draft_v1(p_repair_item_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_item public.repair_items%ROWTYPE;
  v_charge public.repair_charges%ROWTYPE;
  v_customer public.customers%ROWTYPE;
  v_document_id uuid := gen_random_uuid();
  v_vat numeric := 0.24;
  v_vat_amount numeric;
BEGIN
  SELECT * INTO v_item FROM public.repair_items WHERE id = p_repair_item_id;
  SELECT * INTO v_charge FROM public.repair_charges WHERE repair_item_id = p_repair_item_id FOR UPDATE;
  SELECT * INTO v_customer FROM public.customers WHERE id = v_item.customer_id;
  PERFORM private.assert_customer_service_role(ARRAY['admin', 'user'], v_item.customer_id, v_item.seller_id);
  IF v_charge.id IS NULL OR v_charge.charge_type <> 'chargeable' OR v_charge.amount <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Η Επισκευή δεν έχει χρεώσιμη αξία.';
  END IF;
  IF v_charge.legal_document_id IS NOT NULL THEN RETURN v_charge.legal_document_id; END IF;
  v_vat := COALESCE(v_customer.vat_rate, 0.24);
  v_vat_amount := round(v_charge.amount * v_vat, 2);
  INSERT INTO public.legal_documents (
    id, source_kind, document_kind, aade_document_type, status, counterpart,
    payment_method_code, currency, vat_rate, totals, created_by
  ) VALUES (
    v_document_id, 'manual', 'invoice', '1.1', 'draft',
    jsonb_build_object('name', v_customer.full_name, 'vat_number', v_customer.vat_number,
      'address', v_customer.address, 'phone', v_customer.phone, 'email', v_customer.email),
    5, 'EUR', v_vat,
    jsonb_build_object('net', v_charge.amount, 'vat', v_vat_amount, 'gross', v_charge.amount + v_vat_amount, 'quantity', 1),
    (SELECT full_name FROM public.profiles WHERE id = (SELECT auth.uid()))
  );
  INSERT INTO public.legal_document_lines (
    document_id, line_number, sku, description, quantity, unit_price, net_value,
    vat_category, vat_amount, gross_value, measurement_unit, item_code,
    income_classification
  ) VALUES (
    v_document_id, 1, COALESCE(v_item.product_sku, 'ΕΠΙΣΚΕΥΗ'),
    'Υπηρεσία επισκευής ' || v_item.code, 1, v_charge.amount, v_charge.amount,
    1, v_vat_amount, v_charge.amount + v_vat_amount, 1, 'ΕΠΙΣΚΕΥΗ', '{}'::jsonb
  );
  UPDATE public.repair_charges SET legal_document_id = v_document_id, updated_at = now()
  WHERE repair_item_id = p_repair_item_id;
  INSERT INTO public.repair_events (repair_item_id, event_type, payload, actor_user_id)
  VALUES (p_repair_item_id, 'legal_draft_created', jsonb_build_object('legal_document_id', v_document_id), (SELECT auth.uid()));
  RETURN v_document_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_consignment_inventory_reconciliation_v1()
RETURNS TABLE (
  product_sku text,
  variant_suffix text,
  size_info text,
  expected_quantity integer,
  actual_quantity integer,
  difference integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.assert_customer_service_role(ARRAY['admin', 'user']);
  RETURN QUERY
  WITH expected AS (
    SELECT
      line.product_sku,
      line.variant_suffix,
      line.size_info,
      SUM(line.pending_quantity)::integer AS quantity
    FROM public.consignment_lines line
    JOIN public.consignments parent ON parent.id = line.consignment_id
    WHERE parent.handed_off_at IS NOT NULL
      AND parent.status IN ('active', 'partially_settled', 'completed')
    GROUP BY line.product_sku, line.variant_suffix, line.size_info
  ), actual AS (
    SELECT
      balance.product_sku,
      balance.variant_suffix,
      balance.size_info,
      SUM(balance.on_hand)::integer AS quantity
    FROM public.inventory_balances balance
    WHERE balance.warehouse_id = '00000000-0000-0000-0000-000000000003'::uuid
    GROUP BY balance.product_sku, balance.variant_suffix, balance.size_info
  )
  SELECT
    COALESCE(expected.product_sku, actual.product_sku),
    COALESCE(expected.variant_suffix, actual.variant_suffix),
    COALESCE(expected.size_info, actual.size_info),
    COALESCE(expected.quantity, 0),
    COALESCE(actual.quantity, 0),
    COALESCE(actual.quantity, 0) - COALESCE(expected.quantity, 0)
  FROM expected
  FULL JOIN actual USING (product_sku, variant_suffix, size_info)
  WHERE COALESCE(actual.quantity, 0) <> COALESCE(expected.quantity, 0)
  ORDER BY 1, 2, 3;
END;
$$;

-- Lock down helpers and expose only documented authenticated RPCs.
REVOKE ALL ON FUNCTION private.next_consignment_code() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.next_repair_intake_code() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.next_repair_item_code() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.refresh_consignment_status(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.customer_service_move_stock(text,text,text,uuid,uuid,integer,text,text,text,text,text,text,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.customer_service_issue_stock(text,text,text,uuid,integer,text,text,text,text,text,text,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.customer_service_receive_stock(text,text,text,uuid,integer,text,text,text,text,text,text,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.sync_repair_status_from_batch() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  signature regprocedure;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.create_bulk_consignments_v1(jsonb,text)'::regprocedure,
    'public.handoff_consignment_v1(uuid,text)'::regprocedure,
    'public.override_consignment_line_price_v1(uuid,numeric,text)'::regprocedure,
    'public.settle_consignment_sale_v1(uuid,integer,numeric,text,text)'::regprocedure,
    'public.record_consignment_payment_v1(uuid,numeric,text,text,text)'::regprocedure,
    'public.receive_consignment_return_v1(uuid,integer,text,text)'::regprocedure,
    'public.route_consignment_return_v1(uuid,text,uuid,text,text)'::regprocedure,
    'public.reverse_consignment_settlement_v1(uuid,text,text)'::regprocedure,
    'public.reverse_consignment_return_v1(uuid,text,text)'::regprocedure,
    'public.cancel_consignment_v1(uuid,text,text)'::regprocedure,
    'public.create_repair_intake_v1(uuid,uuid,jsonb,text,text)'::regprocedure,
    'public.complete_repair_quality_check_v1(uuid,boolean,text,text,text)'::regprocedure,
    'public.mark_repair_delivered_v1(uuid,text)'::regprocedure,
    'public.set_repair_exception_state_v1(uuid,text,text)'::regprocedure,
    'public.record_repair_cost_line_v1(uuid,text,text,numeric,numeric,text,text,text,uuid,text)'::regprocedure,
    'public.set_repair_charge_v1(uuid,text,numeric,numeric,text)'::regprocedure,
    'public.create_repair_attachment_slot_v1(uuid,text,text,text)'::regprocedure,
    'public.create_consignment_legal_draft_v1(uuid)'::regprocedure,
    'public.create_repair_legal_draft_v1(uuid)'::regprocedure,
    'public.get_consignment_inventory_reconciliation_v1()'::regprocedure
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', signature);
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.create_bulk_consignments_v1(jsonb,text) IS 'Atomic multi-customer consignment draft creation with production allocations.';
COMMENT ON FUNCTION public.create_repair_intake_v1(uuid,uuid,jsonb,text,text) IS 'Atomic repair intake creation with one customer-owned item and production batch per physical piece.';
COMMENT ON FUNCTION public.get_consignment_inventory_reconciliation_v1() IS 'Returns only mismatches between pending consignment allocations and the protected consignment warehouse.';
