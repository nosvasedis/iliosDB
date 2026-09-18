-- Atomically remove a production batch and the matching order-line quantity.
-- Inventory restore, batch delete, and order/reservation save share one transaction
-- so a failed delete cannot leave the Παραγγελία and Παραγωγή out of sync.

CREATE OR REPLACE FUNCTION public.delete_production_batch_from_order_v1(
  p_batch_id text,
  p_order jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  command_row public.inventory_command_results%ROWTYPE;
  batch_row public.production_batches%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_old_items jsonb;
  v_new_items jsonb;
  v_old_item jsonb;
  v_new_item jsonb;
  v_target_item jsonb;
  v_line_id text;
  v_old_qty integer;
  v_new_qty integer;
  v_shipped integer;
  v_result jsonb;
BEGIN
  PERFORM private.assert_inventory_role(ARRAY['admin', 'user']);

  IF NULLIF(BTRIM(COALESCE(p_batch_id, '')), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Η διαγραφή παρτίδας από την παραγγελία δεν ολοκληρώθηκε, επειδή λείπει η παρτίδα. Δεν πραγματοποιήθηκε καμία μεταβολή.';
  END IF;
  IF NULLIF(BTRIM(COALESCE(p_idempotency_key, '')), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Η διαγραφή παρτίδας από την παραγγελία δεν ολοκληρώθηκε, επειδή λείπει το αναγνωριστικό ασφαλούς επανάληψης. Δεν πραγματοποιήθηκε καμία μεταβολή.';
  END IF;
  IF NULLIF(BTRIM(COALESCE(p_order->>'id', '')), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Η διαγραφή παρτίδας από την παραγγελία δεν ολοκληρώθηκε, επειδή λείπει ο κωδικός παραγγελίας. Δεν πραγματοποιήθηκε καμία μεταβολή.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_idempotency_key, 0));
  SELECT * INTO command_row
  FROM public.inventory_command_results
  WHERE idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF command_row.operation_type <> 'production_batch_order_delete' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Η διαγραφή παρτίδας από την παραγγελία δεν ολοκληρώθηκε, επειδή το αναγνωριστικό επανάληψης χρησιμοποιείται από διαφορετική ενέργεια. Δεν πραγματοποιήθηκε καμία μεταβολή.';
    END IF;
    RETURN command_row.result;
  END IF;

  SELECT * INTO batch_row
  FROM public.production_batches
  WHERE id = p_batch_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Η παρτίδα δεν βρέθηκε. Δεν πραγματοποιήθηκε καμία μεταβολή.';
  END IF;

  IF COALESCE(batch_row.workflow_kind, 'order') = 'repair'
     OR batch_row.repair_item_id IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Οι επισκευές δεν διαγράφονται από την παραγγελία μέσω της διαχείρισης παραγωγής. Δεν πραγματοποιήθηκε καμία μεταβολή.';
  END IF;

  IF COALESCE(batch_row.order_id, '') <> BTRIM(p_order->>'id') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Η παρτίδα δεν ανήκει στην επιλεγμένη παραγγελία. Δεν πραγματοποιήθηκε καμία μεταβολή.';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = batch_row.order_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Η παραγγελία δεν βρέθηκε. Δεν πραγματοποιήθηκε καμία μεταβολή.';
  END IF;

  v_old_items := COALESCE(v_order.items, '[]'::jsonb);
  v_new_items := COALESCE(p_order->'items', '[]'::jsonb);
  IF jsonb_typeof(v_new_items) <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Η διαγραφή παρτίδας από την παραγγελία δεν ολοκληρώθηκε, επειδή τα είδη της παραγγελίας δεν είναι έγκυρα. Δεν πραγματοποιήθηκε καμία μεταβολή.';
  END IF;
  IF jsonb_array_length(v_new_items) < 1 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Δεν μπορεί να μείνει η παραγγελία χωρίς είδη. Ακυρώστε ολόκληρη την παραγγελία αν αυτό είναι το ζητούμενο. Δεν πραγματοποιήθηκε καμία μεταβολή.';
  END IF;

  v_line_id := private.resolve_order_line_id_v1(
    v_order.id,
    jsonb_build_object(
      'line_id', batch_row.line_id,
      'sku', batch_row.sku,
      'variant_suffix', batch_row.variant_suffix,
      'size_info', batch_row.size_info,
      'cord_color', batch_row.cord_color,
      'enamel_color', batch_row.enamel_color,
      'notes', batch_row.notes
    )
  );
  IF NULLIF(BTRIM(COALESCE(v_line_id, '')), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Η παρτίδα δεν αντιστοιχεί μοναδικά σε γραμμή της παραγγελίας. Δεν πραγματοποιήθηκε καμία μεταβολή.';
  END IF;

  SELECT item.value
  INTO v_target_item
  FROM jsonb_array_elements(v_old_items) AS item(value)
  WHERE item.value->>'line_id' = v_line_id
  LIMIT 1;
  IF v_target_item IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Η παρτίδα δεν αντιστοιχεί μοναδικά σε γραμμή της παραγγελίας. Δεν πραγματοποιήθηκε καμία μεταβολή.';
  END IF;

  v_old_qty := GREATEST(COALESCE((v_target_item->>'quantity')::integer, 0), 0);
  SELECT item.value
  INTO v_new_item
  FROM jsonb_array_elements(v_new_items) AS item(value)
  WHERE item.value->>'line_id' = v_line_id
  LIMIT 1;
  v_new_qty := CASE
    WHEN v_new_item IS NULL THEN 0
    ELSE GREATEST(COALESCE((v_new_item->>'quantity')::integer, 0), 0)
  END;

  IF batch_row.quantity > v_old_qty THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Η ποσότητα της παρτίδας υπερβαίνει τη γραμμή της παραγγελίας. Δεν πραγματοποιήθηκε καμία μεταβολή.';
  END IF;
  IF (v_old_qty - v_new_qty) <> batch_row.quantity THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Η προτεινόμενη παραγγελία δεν αφαιρεί ακριβώς την ποσότητα της παρτίδας. Δεν πραγματοποιήθηκε καμία μεταβολή.';
  END IF;

  FOR v_old_item IN
    SELECT item.value
    FROM jsonb_array_elements(v_old_items) AS item(value)
  LOOP
    IF COALESCE(v_old_item->>'line_id', '') IN ('', v_line_id) THEN
      CONTINUE;
    END IF;
    SELECT item.value
    INTO v_new_item
    FROM jsonb_array_elements(v_new_items) AS item(value)
    WHERE item.value->>'line_id' = v_old_item->>'line_id'
    LIMIT 1;
    IF v_new_item IS NULL
       OR GREATEST(COALESCE((v_new_item->>'quantity')::integer, 0), 0)
          <> GREATEST(COALESCE((v_old_item->>'quantity')::integer, 0), 0) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Η προτεινόμενη παραγγελία αλλάζει άλλες γραμμές εκτός από την παρτίδα. Δεν πραγματοποιήθηκε καμία μεταβολή.';
    END IF;
  END LOOP;

  FOR v_new_item IN
    SELECT item.value
    FROM jsonb_array_elements(v_new_items) AS item(value)
  LOOP
    IF COALESCE(v_new_item->>'line_id', '') IN ('', v_line_id) THEN
      CONTINUE;
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_old_items) AS item(value)
      WHERE item.value->>'line_id' = v_new_item->>'line_id'
    ) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Η προτεινόμενη παραγγελία αλλάζει άλλες γραμμές εκτός από την παρτίδα. Δεν πραγματοποιήθηκε καμία μεταβολή.';
    END IF;
  END LOOP;

  SELECT COALESCE(SUM(shipment_item.quantity), 0)::integer
  INTO v_shipped
  FROM public.order_shipments shipment
  JOIN public.order_shipment_items shipment_item
    ON shipment_item.shipment_id = shipment.id
  WHERE shipment.order_id = v_order.id
    AND (
      COALESCE(shipment_item.line_id::text, '') = v_line_id
      OR (
        shipment_item.line_id IS NULL
        AND UPPER(BTRIM(COALESCE(shipment_item.sku, ''))) = UPPER(BTRIM(COALESCE(v_target_item->>'sku', '')))
        AND UPPER(BTRIM(COALESCE(shipment_item.variant_suffix, ''))) = UPPER(BTRIM(COALESCE(v_target_item->>'variant_suffix', '')))
        AND public.inventory_normalized_size_read_v1(shipment_item.size_info)
            = public.inventory_normalized_size_read_v1(v_target_item->>'size_info')
        AND LOWER(BTRIM(COALESCE(shipment_item.cord_color, ''))) = LOWER(BTRIM(COALESCE(v_target_item->>'cord_color', '')))
        AND LOWER(BTRIM(COALESCE(shipment_item.enamel_color, ''))) = LOWER(BTRIM(COALESCE(v_target_item->>'enamel_color', '')))
      )
    );
  IF v_new_qty < v_shipped THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Δεν μπορεί να διαγραφεί ποσότητα που έχει ήδη αποσταλεί στον πελάτη. Δεν πραγματοποιήθηκε καμία μεταβολή.';
  END IF;

  batch_row := private.restore_legacy_inventory_batch_core(p_batch_id, p_idempotency_key || ':restore');
  IF batch_row.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Η παρτίδα δεν βρέθηκε. Δεν πραγματοποιήθηκε καμία μεταβολή.';
  END IF;
  DELETE FROM public.production_batches WHERE id = p_batch_id;

  p_order := (p_order - 'item_count') - 'item_total_qty';
  v_result := private.save_order_with_inventory_core(p_order, p_idempotency_key || ':save');

  INSERT INTO public.inventory_command_results (
    idempotency_key, operation_type, result, actor_user_id
  ) VALUES (
    p_idempotency_key, 'production_batch_order_delete', v_result, (SELECT auth.uid())
  );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_production_batch_from_order_v1(text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_production_batch_from_order_v1(text, jsonb, text) TO authenticated, service_role;
