-- Allow correcting a Παρακαταθήκη before Παράδοση (no inventory has moved yet).

CREATE OR REPLACE FUNCTION public.update_pending_consignment_v1(
  p_consignment_id uuid,
  p_customer_id uuid,
  p_source_warehouse_id uuid,
  p_review_due_at date,
  p_notes text,
  p_lines jsonb,
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
  v_line jsonb;
  v_existing_line public.consignment_lines%ROWTYPE;
  v_line_id uuid;
  v_incoming_ids uuid[] := ARRAY[]::uuid[];
  v_identity text;
  v_seen text[] := ARRAY[]::text[];
  v_sku text;
  v_variant text;
  v_size text;
  v_qty integer;
  v_cost numeric;
  v_price numeric;
  v_allocated integer;
  v_protected uuid[] := ARRAY[
    '00000000-0000-0000-0000-000000000003'::uuid,
    '00000000-0000-0000-0000-000000000004'::uuid
  ];
BEGIN
  IF NULLIF(btrim(COALESCE(p_idempotency_key, '')), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Λείπει το κλειδί επαναληψιμότητας.';
  END IF;
  SELECT result INTO v_existing FROM public.customer_service_command_results
  WHERE idempotency_key = p_idempotency_key;
  IF v_existing IS NOT NULL THEN RETURN v_existing || jsonb_build_object('idempotent', true); END IF;

  SELECT * INTO v_parent FROM public.consignments WHERE id = p_consignment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Η Παρακαταθήκη δεν βρέθηκε.';
  END IF;
  PERFORM private.assert_customer_service_role(
    ARRAY['admin', 'user', 'seller'], p_customer_id, v_parent.seller_id
  );
  IF v_parent.status NOT IN ('draft', 'pending_handoff') OR v_parent.handed_off_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Η επεξεργασία επιτρέπεται μόνο πριν από την παράδοση.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id = p_customer_id) THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Ο πελάτης της Παρακαταθήκης δεν βρέθηκε.';
  END IF;
  IF p_source_warehouse_id IS NULL
     OR p_source_warehouse_id = ANY(v_protected)
     OR NOT EXISTS (SELECT 1 FROM public.warehouses WHERE id = p_source_warehouse_id) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Η αποθήκη προέλευσης δεν είναι έγκυρη.';
  END IF;
  IF p_review_due_at IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Ορίστε ημερομηνία επανελέγχου.';
  END IF;
  IF jsonb_typeof(COALESCE(p_lines, 'null'::jsonb)) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Κάθε Παρακαταθήκη χρειάζεται τουλάχιστον μία γραμμή.';
  END IF;

  PERFORM 1 FROM public.consignment_lines WHERE consignment_id = p_consignment_id FOR UPDATE;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
  LOOP
    v_sku := btrim(COALESCE(v_line->>'product_sku', ''));
    v_variant := COALESCE(v_line->>'variant_suffix', '');
    v_size := COALESCE(v_line->>'size_info', '');
    v_qty := COALESCE((v_line->>'quantity')::integer, 0);
    v_cost := GREATEST(COALESCE((v_line->>'locked_unit_cost')::numeric, 0), 0);
    v_price := GREATEST(COALESCE((v_line->>'locked_unit_price')::numeric, 0), 0);
    IF v_sku = '' OR v_qty <= 0 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Κάθε γραμμή χρειάζεται προϊόν και θετική ποσότητα.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.products WHERE sku = v_sku) THEN
      RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = format('Το προϊόν %s δεν βρέθηκε.', v_sku);
    END IF;
    v_identity := v_sku || '|' || v_variant || '|' || v_size;
    IF v_identity = ANY(v_seen) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Υπάρχει διπλότυπη ταυτότητα γραμμής (SKU + παραλλαγή + μέγεθος).';
    END IF;
    v_seen := array_append(v_seen, v_identity);
    v_line_id := NULLIF(btrim(COALESCE(v_line->>'id', '')), '')::uuid;
    IF v_line_id IS NOT NULL THEN
      IF v_line_id = ANY(v_incoming_ids) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Η ίδια γραμμή στάλθηκε περισσότερες από μία φορές.';
      END IF;
      SELECT * INTO v_existing_line FROM public.consignment_lines
      WHERE id = v_line_id AND consignment_id = p_consignment_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Η γραμμή δεν ανήκει σε αυτή την Παρακαταθήκη.';
      END IF;
      v_incoming_ids := array_append(v_incoming_ids, v_line_id);
    END IF;
  END LOOP;

  FOR v_existing_line IN
    SELECT * FROM public.consignment_lines WHERE consignment_id = p_consignment_id
  LOOP
    IF cardinality(v_incoming_ids) = 0 OR NOT (v_existing_line.id = ANY(v_incoming_ids)) THEN
      IF v_existing_line.sold_quantity > 0 OR v_existing_line.returned_quantity > 0
         OR EXISTS (SELECT 1 FROM public.consignment_settlements WHERE consignment_line_id = v_existing_line.id)
         OR EXISTS (SELECT 1 FROM public.consignment_returns WHERE consignment_line_id = v_existing_line.id) THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Δεν γίνεται αφαίρεση γραμμής με πωλήσεις ή επιστροφές.';
      END IF;
      UPDATE public.production_batches
      SET consignment_line_id = NULL, updated_at = now()
      WHERE consignment_line_id = v_existing_line.id;
      DELETE FROM public.consignment_allocations WHERE consignment_line_id = v_existing_line.id;
      DELETE FROM public.consignment_lines WHERE id = v_existing_line.id;
    END IF;
  END LOOP;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
  LOOP
    v_sku := btrim(v_line->>'product_sku');
    v_variant := COALESCE(v_line->>'variant_suffix', '');
    v_size := COALESCE(v_line->>'size_info', '');
    v_qty := (v_line->>'quantity')::integer;
    v_cost := GREATEST(COALESCE((v_line->>'locked_unit_cost')::numeric, 0), 0);
    v_price := GREATEST(COALESCE((v_line->>'locked_unit_price')::numeric, 0), 0);
    v_line_id := NULLIF(btrim(COALESCE(v_line->>'id', '')), '')::uuid;

    IF v_line_id IS NULL THEN
      INSERT INTO public.consignment_lines (
        consignment_id, product_sku, variant_suffix, size_info,
        quantity, locked_unit_cost, locked_unit_price
      ) VALUES (
        p_consignment_id, v_sku, v_variant, v_size, v_qty, v_cost, v_price
      );
    ELSE
      SELECT * INTO v_existing_line FROM public.consignment_lines WHERE id = v_line_id FOR UPDATE;
      IF v_existing_line.sold_quantity > 0 OR v_existing_line.returned_quantity > 0 THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Δεν γίνεται αλλαγή γραμμής με πωλήσεις ή επιστροφές.';
      END IF;
      IF v_qty < v_existing_line.sold_quantity + v_existing_line.returned_quantity THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Η ποσότητα δεν μπορεί να είναι μικρότερη από τις πωλήσεις και τις επιστροφές.';
      END IF;
      SELECT COALESCE(SUM(quantity), 0)::integer INTO v_allocated
      FROM public.consignment_allocations WHERE consignment_line_id = v_line_id;
      IF v_sku IS DISTINCT FROM v_existing_line.product_sku
         OR v_variant IS DISTINCT FROM v_existing_line.variant_suffix
         OR v_size IS DISTINCT FROM v_existing_line.size_info THEN
        UPDATE public.production_batches
        SET consignment_line_id = NULL, updated_at = now()
        WHERE consignment_line_id = v_line_id;
        DELETE FROM public.consignment_allocations WHERE consignment_line_id = v_line_id;
        v_allocated := 0;
      ELSIF v_qty < v_allocated THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Η ποσότητα δεν μπορεί να είναι μικρότερη από τα συνδεδεμένα τεμάχια Παραγωγής.';
      END IF;
      UPDATE public.consignment_lines
      SET product_sku = v_sku,
          variant_suffix = v_variant,
          size_info = v_size,
          quantity = v_qty,
          locked_unit_cost = v_cost,
          locked_unit_price = v_price,
          order_line_id = CASE
            WHEN v_sku IS DISTINCT FROM v_existing_line.product_sku
              OR v_variant IS DISTINCT FROM v_existing_line.variant_suffix
              OR v_size IS DISTINCT FROM v_existing_line.size_info
            THEN NULL
            ELSE v_existing_line.order_line_id
          END,
          updated_at = now()
      WHERE id = v_line_id;
    END IF;
  END LOOP;

  UPDATE public.consignments
  SET customer_id = p_customer_id,
      source_warehouse_id = p_source_warehouse_id,
      review_due_at = p_review_due_at,
      notes = NULLIF(btrim(COALESCE(p_notes, '')), ''),
      updated_at = now()
  WHERE id = p_consignment_id;

  INSERT INTO public.consignment_events (consignment_id, event_type, payload, actor_user_id)
  VALUES (
    p_consignment_id,
    'updated',
    jsonb_build_object(
      'customer_id', p_customer_id,
      'source_warehouse_id', p_source_warehouse_id,
      'review_due_at', p_review_due_at,
      'line_count', jsonb_array_length(p_lines)
    ),
    (SELECT auth.uid())
  );

  v_existing := jsonb_build_object('consignment_id', p_consignment_id, 'updated', true, 'idempotent', false);
  INSERT INTO public.customer_service_command_results VALUES (
    p_idempotency_key, 'consignment_update', v_existing, (SELECT auth.uid()), now()
  );
  RETURN v_existing;
END;
$$;

REVOKE ALL ON FUNCTION public.update_pending_consignment_v1(uuid, uuid, uuid, date, text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_pending_consignment_v1(uuid, uuid, uuid, date, text, jsonb, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.update_pending_consignment_v1(uuid, uuid, uuid, date, text, jsonb, text)
IS 'Correct customer, source warehouse, review date, notes and SKU lines of a consignment before handoff.';
