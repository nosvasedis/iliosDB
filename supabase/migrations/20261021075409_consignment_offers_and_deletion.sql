-- Preserve catalogue prices and immutable custody/financial history.
ALTER TABLE public.consignments
  ADD COLUMN offer_total numeric(14,2) CHECK (offer_total >= 0),
  ADD COLUMN offer_reason text,
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN deletion_reason text;
ALTER TABLE public.consignment_lines
  ADD COLUMN offer_line_total numeric(14,2) CHECK (offer_line_total >= 0),
  ADD COLUMN offer_quantity integer CHECK (offer_quantity >= 0);

-- These commands need definer privileges because authenticated clients have
-- SELECT-only access to workflow tables. Every entry point checks the actor.
CREATE OR REPLACE FUNCTION public.set_consignment_offer_v1(
  p_consignment_id uuid, p_total numeric, p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_parent public.consignments%ROWTYPE;
  v_line public.consignment_lines%ROWTYPE;
  v_weight numeric; v_cumulative numeric := 0; v_previous numeric := 0; v_next numeric;
  v_quantity_weight boolean;
BEGIN
  SELECT * INTO v_parent FROM public.consignments WHERE id = p_consignment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Η Παρακαταθήκη δεν βρέθηκε.'; END IF;
  PERFORM private.assert_customer_service_role(ARRAY['admin','user','seller'], v_parent.customer_id, v_parent.seller_id);
  IF v_parent.deleted_at IS NOT NULL OR v_parent.status NOT IN ('draft','pending_handoff','active','partially_settled') THEN
    RAISE EXCEPTION 'Δεν επιτρέπεται προσφορά σε κλειστή ή διαγραμμένη Παρακαταθήκη.';
  END IF;
  IF NULLIF(btrim(p_reason), '') IS NULL OR (p_total IS NOT NULL AND
     (p_total < 0 OR p_total >= 1000000000000 OR p_total::text IN ('NaN','Infinity','-Infinity') OR p_total <> round(p_total,2))) THEN
    RAISE EXCEPTION 'Ορίστε έγκυρο ποσό με έως δύο δεκαδικά και αιτιολογία.';
  END IF;
  PERFORM 1 FROM public.consignment_lines WHERE consignment_id = p_consignment_id ORDER BY id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.consignment_lines WHERE consignment_id = p_consignment_id AND sold_quantity > 0) THEN
    RAISE EXCEPTION 'Η προσφορά ορίζεται πριν από πωλήσεις. Αντιστρέψτε πρώτα τις σχετικές πωλήσεις.';
  END IF;
  SELECT COALESCE(sum(pending_quantity * locked_unit_price),0) INTO v_weight
  FROM public.consignment_lines WHERE consignment_id = p_consignment_id;
  v_quantity_weight := v_weight = 0;
  IF v_quantity_weight THEN
    SELECT sum(pending_quantity) INTO v_weight FROM public.consignment_lines WHERE consignment_id = p_consignment_id;
  END IF;
  IF COALESCE(v_weight,0) = 0 THEN RAISE EXCEPTION 'Η Παρακαταθήκη χρειάζεται τεμάχια.'; END IF;
  -- Clear first so the edit guard also permits removing an offer.
  UPDATE public.consignments SET offer_total = NULL WHERE id = p_consignment_id;
  FOR v_line IN SELECT * FROM public.consignment_lines WHERE consignment_id = p_consignment_id ORDER BY id LOOP
    v_cumulative := v_cumulative + CASE WHEN v_quantity_weight THEN v_line.pending_quantity ELSE v_line.pending_quantity * v_line.locked_unit_price END;
    v_next := round(p_total * v_cumulative / v_weight, 2);
    UPDATE public.consignment_lines SET
      offer_line_total = CASE WHEN v_line.pending_quantity > 0 THEN v_next - v_previous END,
      offer_quantity = CASE WHEN p_total IS NOT NULL THEN v_line.pending_quantity END,
      updated_at = now() WHERE id = v_line.id;
    v_previous := v_next;
  END LOOP;
  UPDATE public.consignments SET offer_total = p_total,
    offer_reason = CASE WHEN p_total IS NOT NULL THEN btrim(p_reason) END, updated_at = now() WHERE id = p_consignment_id;
  INSERT INTO public.consignment_events(consignment_id,event_type,payload,actor_user_id)
  VALUES(p_consignment_id,CASE WHEN p_total IS NULL THEN 'offer_removed' ELSE 'offer_set' END,
    jsonb_build_object('old_total',v_parent.offer_total,'new_total',p_total,'reason',btrim(p_reason)),(SELECT auth.uid()));
  RETURN jsonb_build_object('consignment_id',p_consignment_id,'offer_total',p_total);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_consignment_v1(
  p_consignment_id uuid, p_reason text, p_return_to_stock boolean, p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_parent public.consignments%ROWTYPE; v_line public.consignment_lines%ROWTYPE;
  v_result jsonb; v_move jsonb; v_sequence integer := 1; v_returned integer := 0; v_order_links jsonb;
BEGIN
  PERFORM private.assert_customer_service_role(ARRAY['admin']);
  IF NULLIF(btrim(p_reason),'') IS NULL OR NULLIF(btrim(p_idempotency_key),'') IS NULL THEN
    RAISE EXCEPTION 'Η αιτιολογία διαγραφής είναι υποχρεωτική.';
  END IF;
  SELECT * INTO v_parent FROM public.consignments WHERE id = p_consignment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Η Παρακαταθήκη δεν βρέθηκε.'; END IF;
  IF v_parent.deleted_at IS NOT NULL THEN RETURN jsonb_build_object('consignment_id',p_consignment_id,'deleted',true,'idempotent',true); END IF;
  PERFORM 1 FROM public.consignment_lines WHERE consignment_id = p_consignment_id ORDER BY id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.consignment_settlements s JOIN public.consignment_lines l ON l.id = s.consignment_line_id
    WHERE l.consignment_id = p_consignment_id AND s.status <> 'reversed' AND s.total_amount > s.paid_amount) THEN
    RAISE EXCEPTION 'Υπάρχουν ανεξόφλητες πωλήσεις. Εξοφλήστε ή αντιστρέψτε τις πριν από τη διαγραφή.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.consignment_returns r JOIN public.consignment_lines l ON l.id = r.consignment_line_id
    WHERE l.consignment_id = p_consignment_id AND r.status = 'inspection') THEN
    RAISE EXCEPTION 'Τακτοποιήστε πρώτα τις επιστροφές που βρίσκονται σε έλεγχο.';
  END IF;
  IF v_parent.handed_off_at IS NOT NULL THEN
    FOR v_line IN SELECT * FROM public.consignment_lines WHERE consignment_id = p_consignment_id AND pending_quantity > 0 ORDER BY id LOOP
      IF p_return_to_stock IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'Επιβεβαιώστε ότι τα υπόλοιπα τεμάχια έχουν επιστραφεί σε καλή κατάσταση στην αποθήκη προέλευσης.';
      END IF;
      v_move := private.customer_service_move_stock(v_line.product_sku,v_line.variant_suffix,v_line.size_info,
        '00000000-0000-0000-0000-000000000003'::uuid,v_parent.source_warehouse_id,v_line.pending_quantity,
        'consignment_delete','consignment',p_consignment_id::text,v_line.id::text,btrim(p_reason),p_idempotency_key,v_sequence);
      v_sequence := (v_move->>'next_sequence')::integer;
      v_returned := v_returned + v_line.pending_quantity;
      UPDATE public.consignment_lines SET returned_quantity = returned_quantity + pending_quantity, updated_at = now() WHERE id = v_line.id;
    END LOOP;
  END IF;
  UPDATE public.production_batches SET consignment_line_id = NULL, updated_at = now()
    WHERE consignment_line_id IN (SELECT id FROM public.consignment_lines WHERE consignment_id = p_consignment_id);
  DELETE FROM public.consignment_allocations WHERE consignment_line_id IN (SELECT id FROM public.consignment_lines WHERE consignment_id = p_consignment_id);
  SELECT jsonb_agg(jsonb_build_object('line_id',id,'order_line_id',order_line_id)) INTO v_order_links
    FROM public.consignment_lines WHERE consignment_id = p_consignment_id AND order_line_id IS NOT NULL;
  -- Release the unique order-line link so a corrected consignment can be created.
  UPDATE public.consignment_lines SET order_line_id = NULL WHERE consignment_id = p_consignment_id AND order_line_id IS NOT NULL;
  INSERT INTO public.consignment_events(consignment_id,event_type,payload,actor_user_id)
  VALUES(p_consignment_id,'deleted',jsonb_build_object('reason',btrim(p_reason),'returned_to_stock',v_returned,'released_order_links',v_order_links),(SELECT auth.uid()));
  UPDATE public.consignments SET deleted_at = now(), deletion_reason = btrim(p_reason),
    status = 'cancelled', completed_at = COALESCE(completed_at,now()), updated_at = now() WHERE id = p_consignment_id;
  v_result := jsonb_build_object('consignment_id',p_consignment_id,'deleted',true,'returned_to_stock',v_returned);
  INSERT INTO public.customer_service_command_results VALUES(p_idempotency_key,'consignment_delete',v_result,(SELECT auth.uid()),now());
  RETURN v_result;
END;
$$;

-- Freeze deleted records even when an older client calls an existing RPC.
CREATE OR REPLACE FUNCTION private.guard_consignment_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_parent public.consignments%ROWTYPE; v_line_id uuid; v_parent_id uuid;
BEGIN
  -- The existing service-only backup command sets this transaction-local flag.
  -- Keep restore/merge possible; authenticated RPC callers cannot assume this role.
  IF current_setting('ilios.sbz_restore',true) = 'on' AND current_setting('role',true) = 'service_role' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'consignments' THEN
    IF OLD.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Η Παρακαταθήκη έχει διαγραφεί.'; END IF;
    RETURN NEW;
  ELSIF TG_TABLE_NAME = 'consignment_lines' THEN
    v_parent_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.consignment_id ELSE NEW.consignment_id END;
  ELSIF TG_TABLE_NAME = 'consignment_payments' THEN
    SELECT consignment_line_id INTO v_line_id FROM public.consignment_settlements
      WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.settlement_id ELSE NEW.settlement_id END;
  ELSE
    v_line_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.consignment_line_id ELSE NEW.consignment_line_id END;
  END IF;
  IF v_parent_id IS NULL THEN SELECT consignment_id INTO v_parent_id FROM public.consignment_lines WHERE id = v_line_id; END IF;
  SELECT * INTO v_parent FROM public.consignments WHERE id = v_parent_id FOR UPDATE;
  IF v_parent.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Η Παρακαταθήκη έχει διαγραφεί.'; END IF;
  IF TG_TABLE_NAME = 'consignment_lines' AND v_parent.offer_total IS NOT NULL THEN
    IF TG_OP <> 'UPDATE' THEN RAISE EXCEPTION 'Αφαιρέστε πρώτα τη συνολική προσφορά για αλλαγές τεμαχίων.'; END IF;
    IF (NEW.quantity,NEW.locked_unit_price,NEW.product_sku,NEW.variant_suffix,NEW.size_info)
       IS DISTINCT FROM (OLD.quantity,OLD.locked_unit_price,OLD.product_sku,OLD.variant_suffix,OLD.size_info) THEN
      RAISE EXCEPTION 'Αφαιρέστε πρώτα τη συνολική προσφορά για αλλαγές τεμαχίων ή τιμών.';
    END IF;
    IF NEW.quantity - NEW.returned_quantity > COALESCE(NEW.offer_quantity,NEW.quantity) THEN
      RAISE EXCEPTION 'Αφαιρέστε πρώτα την προσφορά για να αντιστρέψετε επιστροφή που προηγήθηκε της συμφωνίας.';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER consignments_freeze_deleted BEFORE UPDATE ON public.consignments
  FOR EACH ROW EXECUTE FUNCTION private.guard_consignment_changes();
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['consignment_lines','consignment_allocations','consignment_settlements','consignment_payments','consignment_returns'] LOOP
    EXECUTE format('CREATE TRIGGER consignment_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION private.guard_consignment_changes()',t);
  END LOOP;
END; $$;
REVOKE ALL ON FUNCTION private.guard_consignment_changes() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.set_consignment_offer_v1(uuid,numeric,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.delete_consignment_v1(uuid,text,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_consignment_offer_v1(uuid,numeric,text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.delete_consignment_v1(uuid,text,boolean,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.settle_consignment_sale_v1(
  p_line_id uuid, p_quantity integer, p_unit_price numeric, p_price_override_reason text, p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_line public.consignment_lines%ROWTYPE; v_parent public.consignments%ROWTYPE;
  v_existing jsonb; v_total numeric; v_recorded numeric;
  v_cents bigint; v_low numeric; v_extra integer; v_id uuid;
  v_ids jsonb := '[]'::jsonb; v_part integer; v_qty integer; v_price numeric;
BEGIN
  SELECT * INTO v_parent FROM public.consignments
    WHERE id = (SELECT consignment_id FROM public.consignment_lines WHERE id = p_line_id) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Η Παρακαταθήκη δεν βρέθηκε.'; END IF;
  PERFORM private.assert_customer_service_role(ARRAY['admin','user','seller'],v_parent.customer_id,v_parent.seller_id);
  SELECT result INTO v_existing FROM public.customer_service_command_results WHERE idempotency_key = p_idempotency_key;
  IF v_existing IS NOT NULL THEN RETURN v_existing || jsonb_build_object('idempotent',true); END IF;
  SELECT * INTO v_line FROM public.consignment_lines WHERE id = p_line_id FOR UPDATE;
  IF v_parent.deleted_at IS NOT NULL OR v_parent.status NOT IN ('active','partially_settled')
    OR p_quantity IS NULL OR p_quantity <= 0 OR p_quantity > v_line.pending_quantity
    OR p_unit_price IS NULL OR p_unit_price < 0 OR p_unit_price >= 1000000000000
    OR p_unit_price::text IN ('NaN','Infinity','-Infinity')
    OR NULLIF(btrim(p_idempotency_key),'') IS NULL THEN
    RAISE EXCEPTION 'Η ποσότητα, η τιμή ή η κατάσταση της πώλησης δεν είναι έγκυρη.';
  END IF;
  IF v_line.offer_line_total IS NULL THEN
    IF p_unit_price IS DISTINCT FROM v_line.locked_unit_price AND NULLIF(btrim(p_price_override_reason),'') IS NULL THEN
      RAISE EXCEPTION 'Η αιτιολογία αλλαγής τιμής είναι υποχρεωτική.';
    END IF;
    v_total := p_quantity * round(p_unit_price,2);
  ELSE
    SELECT COALESCE(sum(total_amount),0) INTO v_recorded FROM public.consignment_settlements
      WHERE consignment_line_id = p_line_id AND status <> 'reversed';
    v_total := GREATEST(0,round(v_line.offer_line_total * (v_line.sold_quantity + p_quantity) / v_line.offer_quantity,2) - v_recorded);
  END IF;
  -- Exact cent prices preserve quantity * price = total in legal documents.
  -- At most two settlements are needed when an offer cannot divide evenly.
  v_cents := round(v_total * 100)::bigint;
  v_low := floor(v_cents::numeric / p_quantity) / 100;
  v_extra := (v_cents % p_quantity)::integer;
  UPDATE public.consignment_lines SET sold_quantity = sold_quantity + p_quantity,updated_at = now() WHERE id = p_line_id;
  FOR v_part IN 0..1 LOOP
    v_qty := CASE WHEN v_part = 0 THEN p_quantity - v_extra ELSE v_extra END;
    IF v_qty = 0 THEN CONTINUE; END IF;
    v_price := v_low + CASE WHEN v_part = 1 THEN 0.01 ELSE 0 END;
    v_id := gen_random_uuid();
    v_ids := v_ids || jsonb_build_array(v_id);
    PERFORM private.customer_service_issue_stock(v_line.product_sku,v_line.variant_suffix,v_line.size_info,
      '00000000-0000-0000-0000-000000000003'::uuid,v_qty,'consignment_sale','consignment_settlement',
      v_id::text,v_line.id::text,'Πώληση από Παρακαταθήκη ' || v_parent.code,p_idempotency_key,v_part + 1);
    INSERT INTO public.consignment_settlements(id,consignment_line_id,quantity,unit_price,status,price_override_reason,created_by)
    VALUES(v_id,p_line_id,v_qty,v_price,CASE WHEN v_price = 0 THEN 'paid' ELSE 'due' END,
      CASE WHEN v_line.offer_line_total IS NOT NULL THEN v_parent.offer_reason ELSE NULLIF(btrim(p_price_override_reason),'') END,(SELECT auth.uid()));
    INSERT INTO public.consignment_events(consignment_id,consignment_line_id,event_type,payload,actor_user_id)
    VALUES(v_parent.id,p_line_id,'sale_recorded',jsonb_build_object('settlement_id',v_id,'quantity',v_qty,'unit_price',v_price,'offer_total',v_parent.offer_total),(SELECT auth.uid()));
  END LOOP;
  PERFORM private.refresh_consignment_status(v_parent.id);
  v_existing := jsonb_build_object('settlement_id',v_ids->>0,'settlement_ids',v_ids,'consignment_id',v_parent.id,'total_amount',v_total,'idempotent',false);
  INSERT INTO public.customer_service_command_results VALUES(p_idempotency_key,'consignment_sale',v_existing,(SELECT auth.uid()),now());
  RETURN v_existing;
END;
$$;
REVOKE ALL ON FUNCTION public.settle_consignment_sale_v1(uuid,integer,numeric,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.settle_consignment_sale_v1(uuid,integer,numeric,text,text) TO authenticated,service_role;
