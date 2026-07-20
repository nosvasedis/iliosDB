-- Serialize source-linked supplier-order saves per supplier and reject duplicate reservations.
CREATE OR REPLACE FUNCTION public.save_supplier_order_validated(p_order jsonb)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_order public.supplier_orders%ROWTYPE;
  v_existing_status text;
BEGIN
  v_order := jsonb_populate_record(NULL::public.supplier_orders, p_order);
  IF v_order.id IS NULL OR v_order.supplier_id IS NULL THEN
    RAISE EXCEPTION 'Invalid supplier order payload';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_order.supplier_id::text, 0));

  IF EXISTS (
    SELECT 1
    FROM public.supplier_orders existing_order
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(existing_order.items, '[]'::jsonb)) existing_item
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(existing_item->'source_allocations', '[]'::jsonb)) existing_allocation
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p_order->'items', '[]'::jsonb)) incoming_item
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(incoming_item->'source_allocations', '[]'::jsonb)) incoming_allocation
    WHERE existing_order.supplier_id = v_order.supplier_id
      AND existing_order.status = 'Pending'
      AND existing_order.id <> v_order.id
      AND (
        (
          existing_allocation->>'source_type' = incoming_allocation->>'source_type'
          AND existing_allocation->>'source_id' = incoming_allocation->>'source_id'
        )
        OR (
          NULLIF(existing_allocation->>'order_id', '') = NULLIF(incoming_allocation->>'order_id', '')
          AND COALESCE(existing_allocation->>'line_id', '') = COALESCE(incoming_allocation->>'line_id', '')
          AND existing_item->>'item_id' = incoming_item->>'item_id'
          AND COALESCE(existing_item->>'variant_suffix', '') = COALESCE(incoming_item->>'variant_suffix', '')
          AND COALESCE(existing_item->>'size_info', '') = COALESCE(incoming_item->>'size_info', '')
          AND COALESCE(existing_item->>'cord_color', '') = COALESCE(incoming_item->>'cord_color', '')
          AND COALESCE(existing_item->>'enamel_color', '') = COALESCE(incoming_item->>'enamel_color', '')
        )
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Μία ή περισσότερες ανάγκες δεσμεύτηκαν ήδη σε άλλη εντολή προμηθευτή.';
  END IF;

  SELECT status INTO v_existing_status
  FROM public.supplier_orders
  WHERE id = v_order.id
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing_status <> 'Pending' THEN
      RAISE EXCEPTION 'Μόνο εκκρεμείς εντολές προμηθευτή μπορούν να τροποποιηθούν.';
    END IF;
    UPDATE public.supplier_orders
    SET supplier_id = v_order.supplier_id,
        supplier_name = v_order.supplier_name,
        items = v_order.items,
        notes = v_order.notes,
        total_amount = v_order.total_amount
    WHERE id = v_order.id;
  ELSE
    INSERT INTO public.supplier_orders SELECT (v_order).*;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.save_supplier_order_validated(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.save_supplier_order_validated(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.save_supplier_order_validated(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_supplier_order_validated(jsonb) TO service_role;

-- Atomically claim a pending receipt so retries or two open clients cannot add stock twice.
CREATE OR REPLACE FUNCTION public.claim_supplier_order_receipt(p_order_id uuid)
RETURNS public.supplier_orders
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_order public.supplier_orders%ROWTYPE;
BEGIN
  UPDATE public.supplier_orders
  SET status = 'Received', received_at = now()
  WHERE id = p_order_id AND status = 'Pending'
  RETURNING * INTO v_order;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Η εντολή προμηθευτή έχει ήδη παραληφθεί ή κλείσει.';
  END IF;
  RETURN v_order;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_supplier_order_receipt(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_supplier_order_receipt(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.claim_supplier_order_receipt(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_supplier_order_receipt(uuid) TO service_role;
