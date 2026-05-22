-- Atomic partial shipment create/revert (single transaction, row locks on order + batches)

CREATE OR REPLACE FUNCTION public.order_line_identity_key(
  p_sku text,
  p_variant text,
  p_size text,
  p_cord text,
  p_enamel text,
  p_line_id text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT
    coalesce(p_sku, '') || '::' ||
    coalesce(p_variant, '') || '::' ||
    coalesce(p_size, '') || '::' ||
    coalesce(p_cord, '') || '::' ||
    coalesce(p_enamel, '') ||
    CASE
      WHEN p_line_id IS NOT NULL AND btrim(p_line_id) <> '' THEN '::lid:' || p_line_id
      ELSE ''
    END;
$$;

CREATE OR REPLACE FUNCTION public.create_partial_shipment_v1(
  p_order_id text,
  p_shipped_by text,
  p_items jsonb,
  p_delivery_plan_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_next_plan jsonb DEFAULT NULL,
  p_next_reminders jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO public
AS $$
DECLARE
  v_now timestamptz := now();
  v_order orders%ROWTYPE;
  v_shipment_id uuid := gen_random_uuid();
  v_shipment_number integer;
  v_item jsonb;
  v_remaining integer;
  v_batch production_batches%ROWTYPE;
  v_has_remaining boolean := false;
  v_new_status text;
  v_order_item jsonb;
  v_key text;
  v_order_qty integer;
  v_shipped_qty integer;
  v_shipment_row order_shipments%ROWTYPE;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Δεν επιλέχθηκαν τεμάχια για αποστολή.';
  END IF;

  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Η παραγγελία δεν βρέθηκε. Δεν έγινε αποστολή.';
  END IF;

  SELECT coalesce(max(shipment_number), 0) + 1
  INTO v_shipment_number
  FROM order_shipments
  WHERE order_id = p_order_id;

  -- Consume ready batches (FIFO) per shipped line; fail if insufficient ready stock
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) AS t(value)
  LOOP
    v_remaining := coalesce((v_item->>'quantity')::integer, 0);
    IF v_remaining <= 0 THEN
      CONTINUE;
    END IF;

    FOR v_batch IN
      SELECT *
      FROM production_batches
      WHERE order_id = p_order_id
        AND current_stage = 'Ready'
        AND sku = v_item->>'sku'
        AND coalesce(variant_suffix, '') = coalesce(v_item->>'variant_suffix', '')
        AND coalesce(size_info, '') = coalesce(v_item->>'size_info', '')
        AND coalesce(cord_color, '') = coalesce(v_item->>'cord_color', '')
        AND coalesce(enamel_color, '') = coalesce(v_item->>'enamel_color', '')
        AND coalesce(line_id::text, '') = coalesce(v_item->>'line_id', '')
      ORDER BY created_at ASC
      FOR UPDATE
    LOOP
      EXIT WHEN v_remaining <= 0;

      IF v_batch.quantity <= v_remaining THEN
        DELETE FROM production_batches WHERE id = v_batch.id;
        v_remaining := v_remaining - v_batch.quantity;
      ELSE
        UPDATE production_batches
        SET quantity = v_batch.quantity - v_remaining,
            updated_at = v_now
        WHERE id = v_batch.id;
        v_remaining := 0;
      END IF;
    END LOOP;

    IF v_remaining > 0 THEN
      RAISE EXCEPTION 'Ανεπαρκής ποσότητα σε στάδιο Έτοιμο για SKU % (λείπουν % τεμ.)',
        v_item->>'sku', v_remaining;
    END IF;
  END LOOP;

  INSERT INTO order_shipments (
    id, order_id, shipment_number, shipped_at, shipped_by, delivery_plan_id, notes, created_at
  ) VALUES (
    v_shipment_id,
    p_order_id,
    v_shipment_number,
    v_now,
    p_shipped_by,
    p_delivery_plan_id,
    p_notes,
    v_now
  )
  RETURNING * INTO v_shipment_row;

  INSERT INTO order_shipment_items (
    id, shipment_id, sku, variant_suffix, size_info, quantity, price_at_order,
    cord_color, enamel_color, line_id
  )
  SELECT
    gen_random_uuid(),
    v_shipment_id,
    elem->>'sku',
    nullif(elem->>'variant_suffix', ''),
    nullif(elem->>'size_info', ''),
    (elem->>'quantity')::integer,
    (elem->>'price_at_order')::numeric,
    nullif(elem->>'cord_color', ''),
    nullif(elem->>'enamel_color', ''),
    nullif(elem->>'line_id', '')::uuid
  FROM jsonb_array_elements(p_items) AS elem;

  -- Remaining order lines after this shipment (existing + new)
  FOR v_order_item IN SELECT value FROM jsonb_array_elements(v_order.items) AS t(value)
  LOOP
    v_key := order_line_identity_key(
      v_order_item->>'sku',
      v_order_item->>'variant_suffix',
      v_order_item->>'size_info',
      v_order_item->>'cord_color',
      v_order_item->>'enamel_color',
      v_order_item->>'line_id'
    );
    v_order_qty := coalesce((v_order_item->>'quantity')::integer, 0);

    SELECT coalesce(sum(si.quantity), 0)::integer
    INTO v_shipped_qty
    FROM order_shipment_items si
    INNER JOIN order_shipments s ON s.id = si.shipment_id
    WHERE s.order_id = p_order_id
      AND order_line_identity_key(
        si.sku,
        si.variant_suffix,
        si.size_info,
        si.cord_color,
        si.enamel_color,
        si.line_id::text
      ) = v_key;

    IF v_shipped_qty < v_order_qty THEN
      v_has_remaining := true;
      EXIT;
    END IF;
  END LOOP;

  v_new_status := CASE WHEN v_has_remaining THEN 'Partially Delivered' ELSE 'Delivered' END;
  UPDATE orders SET status = v_new_status WHERE id = p_order_id;

  IF p_delivery_plan_id IS NOT NULL THEN
    UPDATE order_delivery_plans
    SET plan_status = 'completed', completed_at = v_now, updated_at = v_now
    WHERE id = p_delivery_plan_id;

    UPDATE order_delivery_reminders
    SET completed_at = v_now, updated_at = v_now
    WHERE plan_id = p_delivery_plan_id;
  END IF;

  IF p_next_plan IS NOT NULL THEN
    INSERT INTO order_delivery_plans (
      id, order_id, plan_status, planning_mode, target_at, window_start, window_end,
      holiday_anchor, holiday_year, holiday_offset_days, contact_phone_override,
      internal_notes, snoozed_until, completed_at, cancelled_at, created_by, updated_by,
      created_at, updated_at
    ) VALUES (
      (p_next_plan->>'id')::uuid,
      p_order_id,
      coalesce(p_next_plan->>'plan_status', 'active'),
      coalesce(p_next_plan->>'planning_mode', 'exact'),
      (p_next_plan->>'target_at')::timestamptz,
      nullif(p_next_plan->>'window_start', '')::timestamptz,
      nullif(p_next_plan->>'window_end', '')::timestamptz,
      nullif(p_next_plan->>'holiday_anchor', ''),
      nullif(p_next_plan->>'holiday_year', '')::integer,
      nullif(p_next_plan->>'holiday_offset_days', '')::integer,
      nullif(p_next_plan->>'contact_phone_override', ''),
      p_next_plan->>'internal_notes',
      nullif(p_next_plan->>'snoozed_until', '')::timestamptz,
      nullif(p_next_plan->>'completed_at', '')::timestamptz,
      nullif(p_next_plan->>'cancelled_at', '')::timestamptz,
      p_next_plan->>'created_by',
      nullif(p_next_plan->>'updated_by', ''),
      coalesce((p_next_plan->>'created_at')::timestamptz, v_now),
      coalesce((p_next_plan->>'updated_at')::timestamptz, v_now)
    )
    ON CONFLICT (id) DO UPDATE SET
      plan_status = EXCLUDED.plan_status,
      planning_mode = EXCLUDED.planning_mode,
      target_at = EXCLUDED.target_at,
      internal_notes = EXCLUDED.internal_notes,
      updated_at = EXCLUDED.updated_at;
  END IF;

  IF jsonb_array_length(p_next_reminders) > 0 THEN
    INSERT INTO order_delivery_reminders (
      id, plan_id, trigger_at, action_type, reason, sort_order, source,
      acknowledged_at, completed_at, completion_note, completed_by, snoozed_until,
      created_at, updated_at
    )
    SELECT
      (r->>'id')::uuid,
      (r->>'plan_id')::uuid,
      (r->>'trigger_at')::timestamptz,
      r->>'action_type',
      r->>'reason',
      coalesce((r->>'sort_order')::integer, 0),
      coalesce(r->>'source', 'auto'),
      nullif(r->>'acknowledged_at', '')::timestamptz,
      nullif(r->>'completed_at', '')::timestamptz,
      nullif(r->>'completion_note', ''),
      nullif(r->>'completed_by', ''),
      nullif(r->>'snoozed_until', '')::timestamptz,
      coalesce((r->>'created_at')::timestamptz, v_now),
      coalesce((r->>'updated_at')::timestamptz, v_now)
    FROM jsonb_array_elements(p_next_reminders) AS r
    ON CONFLICT (id) DO NOTHING;
  END IF;

  IF NOT v_has_remaining THEN
    DELETE FROM production_batches WHERE order_id = p_order_id;
  END IF;

  RETURN jsonb_build_object(
    'id', v_shipment_row.id,
    'order_id', v_shipment_row.order_id,
    'shipment_number', v_shipment_row.shipment_number,
    'shipped_at', v_shipment_row.shipped_at,
    'shipped_by', v_shipment_row.shipped_by,
    'delivery_plan_id', v_shipment_row.delivery_plan_id,
    'notes', v_shipment_row.notes,
    'created_at', v_shipment_row.created_at,
    'new_status', v_new_status,
    'has_remaining', v_has_remaining
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.revert_partial_shipment_v1(
  p_order_id text,
  p_shipment_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO public
AS $$
DECLARE
  v_now timestamptz := now();
  v_target order_shipments%ROWTYPE;
  v_latest_id uuid;
  v_item order_shipment_items%ROWTYPE;
  v_target_batch_id text;
  v_target_qty integer;
  v_new_batch_id text;
  v_remaining_shipments integer;
  v_new_status text;
  v_auto_plan_id uuid;
  v_restored_qty integer := 0;
BEGIN
  PERFORM 1 FROM orders WHERE id = p_order_id FOR UPDATE;

  SELECT * INTO v_target
  FROM order_shipments
  WHERE id = p_shipment_id AND order_id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Η αποστολή δεν βρέθηκε.';
  END IF;

  SELECT id INTO v_latest_id
  FROM order_shipments
  WHERE order_id = p_order_id
  ORDER BY shipment_number DESC
  LIMIT 1;

  IF v_latest_id IS DISTINCT FROM p_shipment_id THEN
    RAISE EXCEPTION 'Μπορείτε να αναιρέσετε μόνο την τελευταία αποστολή.';
  END IF;

  FOR v_item IN
    SELECT * FROM order_shipment_items WHERE shipment_id = p_shipment_id
  LOOP
    IF v_item.quantity <= 0 THEN
      CONTINUE;
    END IF;

    v_restored_qty := v_restored_qty + v_item.quantity;

    SELECT pb.id, pb.quantity
    INTO v_target_batch_id, v_target_qty
    FROM production_batches pb
    WHERE pb.order_id = p_order_id
      AND pb.sku = v_item.sku
      AND coalesce(pb.variant_suffix, '') = coalesce(v_item.variant_suffix, '')
      AND coalesce(pb.size_info, '') = coalesce(v_item.size_info, '')
      AND coalesce(pb.cord_color, '') = coalesce(v_item.cord_color, '')
      AND coalesce(pb.enamel_color, '') = coalesce(v_item.enamel_color, '')
      AND coalesce(pb.line_id::text, '') = coalesce(v_item.line_id::text, '')
    ORDER BY CASE WHEN pb.current_stage = 'Ready' THEN 0 ELSE 1 END, pb.created_at ASC
    LIMIT 1
    FOR UPDATE OF pb;

    IF v_target_batch_id IS NOT NULL THEN
      UPDATE production_batches
      SET quantity = v_target_qty + v_item.quantity,
          current_stage = 'Ready',
          updated_at = v_now
      WHERE id = v_target_batch_id;
    ELSE
      v_new_batch_id := gen_random_uuid()::text;
      INSERT INTO production_batches (
        id, order_id, sku, variant_suffix, quantity, current_stage, priority,
        requires_setting, requires_assembly, on_hold, pending_dispatch,
        size_info, cord_color, enamel_color, line_id, created_at, updated_at
      ) VALUES (
        v_new_batch_id,
        p_order_id,
        v_item.sku,
        v_item.variant_suffix,
        v_item.quantity,
        'Ready',
        'Normal',
        false,
        false,
        false,
        false,
        v_item.size_info,
        v_item.cord_color,
        v_item.enamel_color,
        v_item.line_id::text,
        v_now,
        v_now
      );

      INSERT INTO batch_stage_history (id, batch_id, from_stage, to_stage, moved_by, moved_at, notes)
      VALUES (gen_random_uuid(), v_new_batch_id, NULL, 'Ready', 'System', v_now, NULL);
    END IF;
  END LOOP;

  DELETE FROM order_shipment_items WHERE shipment_id = p_shipment_id;
  DELETE FROM order_shipments WHERE id = p_shipment_id;

  SELECT count(*)::integer
  INTO v_remaining_shipments
  FROM order_shipments
  WHERE order_id = p_order_id;

  v_new_status := CASE WHEN v_remaining_shipments > 0 THEN 'Partially Delivered' ELSE 'In Production' END;
  UPDATE orders SET status = v_new_status WHERE id = p_order_id;

  SELECT id INTO v_auto_plan_id
  FROM order_delivery_plans
  WHERE order_id = p_order_id
    AND plan_status = 'active'
    AND internal_notes LIKE ('Αυτόματο πλάνο για υπόλοιπο παραγγελίας μετά από αποστολή #' || v_target.shipment_number::text || '%')
  LIMIT 1;

  IF v_auto_plan_id IS NOT NULL THEN
    UPDATE order_delivery_plans
    SET plan_status = 'cancelled', cancelled_at = v_now, updated_at = v_now
    WHERE id = v_auto_plan_id;
  END IF;

  IF v_target.delivery_plan_id IS NOT NULL THEN
    UPDATE order_delivery_plans
    SET plan_status = 'active', completed_at = NULL, updated_at = v_now
    WHERE id = v_target.delivery_plan_id;

    UPDATE order_delivery_reminders
    SET completed_at = NULL, completion_note = NULL, completed_by = NULL, updated_at = v_now
    WHERE plan_id = v_target.delivery_plan_id;
  END IF;

  RETURN jsonb_build_object(
    'order_id', p_order_id,
    'shipment_id', p_shipment_id,
    'shipment_number', v_target.shipment_number,
    'restored_qty', v_restored_qty,
    'new_status', v_new_status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.order_line_identity_key(text, text, text, text, text, text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.create_partial_shipment_v1(text, text, jsonb, uuid, text, jsonb, jsonb) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.revert_partial_shipment_v1(text, uuid) TO authenticated, anon;
