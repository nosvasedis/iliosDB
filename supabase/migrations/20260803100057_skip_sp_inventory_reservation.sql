-- SP is the reserved systemic SKU for one-off creations. It is intentionally
-- not a public.products row and therefore must not enter stock accounting.
-- Keep the order line, pricing, notes, and production behavior unchanged while
-- excluding only SP from balances, reservations, events, and allocation output.

CREATE OR REPLACE FUNCTION private.save_order_with_inventory_core(
  p_order jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_existing public.orders%ROWTYPE;
  v_items jsonb;
  item jsonb;
  balance_row public.inventory_balances%ROWTYPE;
  v_line_id text;
  v_sku text;
  v_variant text;
  v_size text;
  v_requested integer;
  v_available integer;
  v_reserved integer;
  v_warehouse uuid;
  v_central constant uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_sequence integer := 1000;
  v_allocations jsonb := '[]'::jsonb;
BEGIN
  PERFORM private.assert_inventory_role(ARRAY['admin', 'user', 'seller']);

  IF private.current_app_role() = 'seller'
     AND COALESCE(p_order->>'seller_id', '') <> COALESCE((SELECT auth.uid())::text, '') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Η παραγγελία δεν αποθηκεύτηκε, επειδή ο πωλητής μπορεί να δεσμεύσει απόθεμα μόνο για δική του παραγγελία. Δεν πραγματοποιήθηκε καμία μεταβολή.';
  END IF;

  IF NULLIF(p_order->>'id', '') IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Δεν είναι δυνατή η αποθήκευση παραγγελίας χωρίς κωδικό.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.inventory_events
    WHERE idempotency_key = p_idempotency_key
      AND operation_type = 'order_reservation'
  ) THEN
    SELECT *
    INTO v_existing
    FROM public.orders
    WHERE id = p_order->>'id';

    RETURN jsonb_build_object(
      'order', to_jsonb(v_existing),
      'allocations', '[]'::jsonb,
      'idempotent', true
    );
  END IF;

  SELECT *
  INTO v_existing
  FROM public.orders
  WHERE id = p_order->>'id'
  FOR UPDATE;

  IF FOUND THEN
    PERFORM private.release_order_reservations_core(
      v_existing.id,
      'Ανακατανομή αποθέματος μετά από μεταβολή παραγγελίας.',
      p_idempotency_key || ':release'
    );
  END IF;

  v_items := private.ensure_order_line_ids(
    COALESCE(p_order->'items', '[]'::jsonb)
  );
  p_order := jsonb_set(p_order, '{items}', v_items, true);
  v_order := jsonb_populate_record(NULL::public.orders, p_order);

  IF v_existing.id IS NULL THEN
    INSERT INTO public.orders (
      id,
      customer_name,
      customer_phone,
      status,
      total_price,
      items,
      notes,
      created_at,
      customer_id,
      seller_id,
      custom_silver_rate,
      vat_rate,
      discount_percent,
      tags,
      is_archived,
      seller_name,
      price_change_log,
      seller_commission_percent,
      source_offer_id
    ) VALUES (
      v_order.id,
      v_order.customer_name,
      v_order.customer_phone,
      COALESCE(v_order.status, 'Pending'),
      COALESCE(v_order.total_price, 0),
      v_items,
      v_order.notes,
      COALESCE(v_order.created_at, now()),
      v_order.customer_id,
      v_order.seller_id,
      v_order.custom_silver_rate,
      COALESCE(v_order.vat_rate, 0.24),
      COALESCE(v_order.discount_percent, 0),
      COALESCE(v_order.tags, '{}'::text[]),
      COALESCE(v_order.is_archived, false),
      v_order.seller_name,
      v_order.price_change_log,
      v_order.seller_commission_percent,
      v_order.source_offer_id
    );
  ELSE
    UPDATE public.orders o
    SET customer_id = v_order.customer_id,
        customer_name = v_order.customer_name,
        customer_phone = v_order.customer_phone,
        seller_id = v_order.seller_id,
        seller_name = v_order.seller_name,
        seller_commission_percent = v_order.seller_commission_percent,
        status = COALESCE(v_order.status, o.status),
        items = v_items,
        total_price = COALESCE(v_order.total_price, 0),
        notes = v_order.notes,
        custom_silver_rate = v_order.custom_silver_rate,
        vat_rate = COALESCE(v_order.vat_rate, o.vat_rate),
        discount_percent = COALESCE(v_order.discount_percent, 0),
        tags = COALESCE(v_order.tags, '{}'::text[]),
        is_archived = COALESCE(v_order.is_archived, false),
        price_change_log = v_order.price_change_log,
        source_offer_id = v_order.source_offer_id
    WHERE o.id = v_order.id;
  END IF;

  -- Reload defaults and generated summaries before status checks and response.
  SELECT *
  INTO v_order
  FROM public.orders
  WHERE id = v_order.id;

  IF v_order.status IN ('Cancelled', 'Delivered') THEN
    RETURN jsonb_build_object(
      'order', to_jsonb(v_order),
      'allocations', v_allocations
    );
  END IF;

  FOR item IN
    SELECT value
    FROM jsonb_array_elements(v_items) rows(value)
  LOOP
    v_sku := BTRIM(COALESCE(item->>'sku', ''));
    v_variant := BTRIM(COALESCE(item->>'variant_suffix', ''));
    v_size := BTRIM(COALESCE(item->>'size_info', ''));
    v_line_id := item->>'line_id';
    v_requested := GREATEST(
      COALESCE((item->>'quantity')::integer, 0),
      0
    );
    v_warehouse := COALESCE(
      NULLIF(item->>'warehouse_id', '')::uuid,
      v_central
    );

    IF v_sku = '' OR v_requested = 0 THEN
      CONTINUE;
    END IF;

    -- SP is a non-catalog, made-to-order line. It has no stock identity and
    -- must never create an inventory balance or appear as an inventory shortage.
    IF UPPER(v_sku) = 'SP' THEN
      CONTINUE;
    END IF;

    PERFORM private.assert_inventory_item_ready(v_sku);

    SELECT *
    INTO balance_row
    FROM public.inventory_balances b
    WHERE b.product_sku = v_sku
      AND b.variant_suffix = v_variant
      AND b.warehouse_id = v_warehouse
      AND (
        b.size_info = v_size
        OR (
          v_size <> ''
          AND b.size_info = ''
          AND NOT EXISTS (
            SELECT 1
            FROM public.inventory_balances sized
            WHERE sized.product_sku = v_sku
              AND sized.variant_suffix = v_variant
              AND sized.warehouse_id = v_warehouse
              AND sized.size_info <> ''
          )
        )
      )
    ORDER BY CASE WHEN b.size_info = v_size THEN 0 ELSE 1 END
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
      INSERT INTO public.inventory_balances (
        product_sku,
        variant_suffix,
        size_info,
        warehouse_id,
        on_hand,
        reserved
      ) VALUES (
        v_sku,
        v_variant,
        v_size,
        v_warehouse,
        0,
        0
      )
      ON CONFLICT DO NOTHING;

      SELECT *
      INTO balance_row
      FROM public.inventory_balances
      WHERE product_sku = v_sku
        AND variant_suffix = v_variant
        AND size_info = v_size
        AND warehouse_id = v_warehouse
      FOR UPDATE;
    END IF;

    v_available := GREATEST(
      balance_row.on_hand - balance_row.reserved,
      0
    );
    v_reserved := LEAST(v_requested, v_available);

    IF v_reserved > 0 THEN
      INSERT INTO public.inventory_reservations (
        order_id,
        order_line_id,
        product_sku,
        variant_suffix,
        size_info,
        warehouse_id,
        initial_quantity,
        quantity
      ) VALUES (
        v_order.id,
        v_line_id,
        v_sku,
        v_variant,
        balance_row.size_info,
        v_warehouse,
        v_reserved,
        v_reserved
      );

      UPDATE public.inventory_balances
      SET reserved = reserved + v_reserved,
          version = version + 1,
          updated_at = now()
      WHERE product_sku = v_sku
        AND variant_suffix = v_variant
        AND size_info = balance_row.size_info
        AND warehouse_id = v_warehouse
      RETURNING *
      INTO balance_row;

      v_sequence := v_sequence + 1;

      INSERT INTO public.inventory_events (
        sequence_no,
        operation_type,
        product_sku,
        variant_suffix,
        size_info,
        warehouse_id,
        reserved_delta,
        on_hand_after,
        reserved_after,
        reference_type,
        reference_id,
        reference_line_id,
        actor_user_id,
        reason,
        idempotency_key
      ) VALUES (
        v_sequence,
        'order_reservation',
        v_sku,
        v_variant,
        balance_row.size_info,
        v_warehouse,
        v_reserved,
        balance_row.on_hand,
        balance_row.reserved,
        'order',
        v_order.id,
        v_line_id,
        (SELECT auth.uid()),
        'Αυτόματη δέσμευση κατά την αποθήκευση παραγγελίας.',
        p_idempotency_key
      );
    END IF;

    v_allocations := v_allocations || jsonb_build_array(
      jsonb_build_object(
        'line_id', v_line_id,
        'product_sku', v_sku,
        'variant_suffix', v_variant,
        'size_info', v_size,
        'warehouse_id', v_warehouse,
        'requested', v_requested,
        'reserved', v_reserved,
        'shortage', v_requested - v_reserved
      )
    );
  END LOOP;

  SELECT *
  INTO v_order
  FROM public.orders
  WHERE id = v_order.id;

  RETURN jsonb_build_object(
    'order', to_jsonb(v_order),
    'allocations', v_allocations
  );
END;
$$;

-- The public SECURITY DEFINER RPC remains the sole authenticated entry point.
REVOKE ALL ON FUNCTION private.save_order_with_inventory_core(jsonb, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.save_order_with_inventory_core(jsonb, text)
  TO service_role;
