-- Repair production lifecycle: archive/delete, complete-to-QC by removing the
-- production batch, return to production, unified hold, and QC rework that
-- recreates a batch when the previous one was already deleted.

ALTER TABLE public.repair_items
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS repair_items_archived_idx
  ON public.repair_items (is_archived, status, created_at DESC);

CREATE OR REPLACE FUNCTION private.delete_repair_linked_batch(
  p_batch_id text,
  p_idempotency_key text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_batch public.production_batches%ROWTYPE;
BEGIN
  IF NULLIF(btrim(COALESCE(p_batch_id, '')), '') IS NULL THEN
    RETURN false;
  END IF;
  v_batch := private.restore_legacy_inventory_batch_core(p_batch_id, p_idempotency_key);
  IF v_batch.id IS NULL THEN
    RETURN false;
  END IF;
  DELETE FROM public.production_batches WHERE id = p_batch_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION private.create_repair_linked_batch(
  p_item public.repair_items,
  p_cycle_id uuid,
  p_stage text,
  p_requires_setting boolean,
  p_requires_assembly boolean,
  p_priority text,
  p_sku text,
  p_variant_suffix text,
  p_size_info text,
  p_notes text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_batch_id text := 'ΕΠ-' || replace(gen_random_uuid()::text, '-', '');
  v_stage text := COALESCE(NULLIF(btrim(p_stage), ''), 'Αναμονή Παραλαβής');
BEGIN
  IF v_stage NOT IN (
    'Αναμονή Παραλαβής', 'Waxing', 'Casting', 'Setting', 'Polishing', 'Assembly', 'Labeling'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Το στάδιο επιστροφής στην Παραγωγή δεν είναι έγκυρο.';
  END IF;
  INSERT INTO public.production_batches (
    id, order_id, sku, variant_suffix, quantity, current_stage, priority, type,
    notes, requires_setting, requires_assembly, size_info, line_id, on_hold,
    pending_dispatch, fulfillment_source, legacy_inventory_issued,
    workflow_kind, repair_item_id, repair_cycle_id, created_at, updated_at
  ) VALUES (
    v_batch_id, NULL, COALESCE(NULLIF(btrim(p_sku), ''), p_item.product_sku, 'SP'),
    NULLIF(COALESCE(p_variant_suffix, p_item.variant_suffix, ''), ''), 1,
    v_stage, COALESCE(NULLIF(btrim(p_priority), ''), 'Normal'),
    'Φρεσκάρισμα', COALESCE(NULLIF(btrim(p_notes), ''), p_item.description),
    COALESCE(p_requires_setting, false), COALESCE(p_requires_assembly, false),
    NULLIF(COALESCE(p_size_info, p_item.size_info, ''), ''), p_item.code,
    false, (v_stage = 'Polishing'), 'production', false, 'repair', p_item.id, p_cycle_id,
    now(), now()
  );
  INSERT INTO public.batch_stage_history (
    id, batch_id, from_stage, to_stage, moved_by, moved_at, notes
  ) VALUES (
    gen_random_uuid(), v_batch_id, NULL, v_stage, 'Σύστημα', now(),
    'Δημιουργία παρτίδας Επισκευής.'
  );
  RETURN v_batch_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_repair_item_v1(
  p_repair_item_id uuid,
  p_archive boolean,
  p_reason text
)
RETURNS public.repair_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_item public.repair_items%ROWTYPE;
  v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
BEGIN
  SELECT * INTO v_item FROM public.repair_items WHERE id = p_repair_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Η Επισκευή δεν βρέθηκε. Δεν πραγματοποιήθηκε καμία μεταβολή.';
  END IF;
  PERFORM private.assert_customer_service_role(ARRAY['admin', 'user'], v_item.customer_id, v_item.seller_id);
  IF v_reason IS NULL THEN
    v_reason := CASE WHEN p_archive THEN 'Αρχειοθέτηση' ELSE 'Ανάκτηση από αρχείο' END;
  END IF;
  UPDATE public.repair_items
  SET is_archived = p_archive, updated_at = now()
  WHERE id = p_repair_item_id
  RETURNING * INTO v_item;
  INSERT INTO public.repair_events (repair_item_id, event_type, payload, actor_user_id)
  VALUES (
    p_repair_item_id,
    CASE WHEN p_archive THEN 'archived' ELSE 'unarchived' END,
    jsonb_build_object('reason', v_reason, 'is_archived', p_archive),
    (SELECT auth.uid())
  );
  RETURN v_item;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_repair_production_v1(
  p_repair_item_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing jsonb;
  v_item public.repair_items%ROWTYPE;
  v_cycle public.repair_cycles%ROWTYPE;
  v_batch public.production_batches%ROWTYPE;
  v_from_stage text;
BEGIN
  SELECT result INTO v_existing FROM public.customer_service_command_results WHERE idempotency_key = p_idempotency_key;
  IF v_existing IS NOT NULL THEN RETURN v_existing || jsonb_build_object('idempotent', true); END IF;
  SELECT * INTO v_item FROM public.repair_items WHERE id = p_repair_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Η Επισκευή δεν βρέθηκε. Δεν πραγματοποιήθηκε καμία μεταβολή.';
  END IF;
  PERFORM private.assert_customer_service_role(ARRAY['admin', 'user'], v_item.customer_id, v_item.seller_id);
  IF v_item.status IN ('delivered', 'irreparable', 'cancelled') THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Η Επισκευή δεν μπορεί να ολοκληρωθεί στην Παραγωγή από την τρέχουσα κατάσταση.';
  END IF;
  SELECT * INTO v_batch FROM public.production_batches WHERE repair_item_id = p_repair_item_id FOR UPDATE;
  IF v_batch.id IS NULL THEN
    IF v_item.status = 'quality_check' THEN
      v_existing := jsonb_build_object('repair_item_id', p_repair_item_id, 'status', 'quality_check', 'removed', false, 'idempotent', false);
      INSERT INTO public.customer_service_command_results VALUES (
        p_idempotency_key, 'repair_production_complete', v_existing, (SELECT auth.uid()), now()
      );
      RETURN v_existing;
    END IF;
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Η Επισκευή δεν βρίσκεται στην Παραγωγή.';
  END IF;
  SELECT * INTO v_cycle FROM public.repair_cycles
  WHERE repair_item_id = p_repair_item_id AND cycle_number = v_item.current_cycle_number FOR UPDATE;
  v_from_stage := v_batch.current_stage;
  UPDATE public.repair_items SET status = 'quality_check', updated_at = now() WHERE id = p_repair_item_id;
  INSERT INTO public.repair_events (repair_item_id, repair_cycle_id, event_type, payload, actor_user_id)
  VALUES (
    p_repair_item_id, v_cycle.id, 'production_completed',
    jsonb_build_object(
      'from_stage', v_from_stage,
      'requires_setting', v_batch.requires_setting,
      'requires_assembly', v_batch.requires_assembly,
      'sku', v_batch.sku,
      'variant_suffix', v_batch.variant_suffix,
      'size_info', v_batch.size_info,
      'priority', v_batch.priority,
      'notes', v_batch.notes
    ),
    (SELECT auth.uid())
  );
  PERFORM private.delete_repair_linked_batch(v_batch.id, p_idempotency_key || ':batch');
  v_existing := jsonb_build_object(
    'repair_item_id', p_repair_item_id, 'status', 'quality_check', 'removed', true, 'idempotent', false
  );
  INSERT INTO public.customer_service_command_results VALUES (
    p_idempotency_key, 'repair_production_complete', v_existing, (SELECT auth.uid()), now()
  );
  RETURN v_existing;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_repair_from_production_v1(
  p_repair_item_id uuid,
  p_reason text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing jsonb;
  v_item public.repair_items%ROWTYPE;
  v_cycle public.repair_cycles%ROWTYPE;
  v_batch public.production_batches%ROWTYPE;
  v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
BEGIN
  SELECT result INTO v_existing FROM public.customer_service_command_results WHERE idempotency_key = p_idempotency_key;
  IF v_existing IS NOT NULL THEN RETURN v_existing || jsonb_build_object('idempotent', true); END IF;
  SELECT * INTO v_item FROM public.repair_items WHERE id = p_repair_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Η Επισκευή δεν βρέθηκε. Δεν πραγματοποιήθηκε καμία μεταβολή.';
  END IF;
  PERFORM private.assert_customer_service_role(ARRAY['admin', 'user'], v_item.customer_id, v_item.seller_id);
  IF v_reason IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Η αιτιολογία αφαίρεσης είναι υποχρεωτική.';
  END IF;
  SELECT * INTO v_batch FROM public.production_batches WHERE repair_item_id = p_repair_item_id FOR UPDATE;
  IF v_batch.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Η Επισκευή δεν βρίσκεται στην Παραγωγή.';
  END IF;
  SELECT * INTO v_cycle FROM public.repair_cycles
  WHERE repair_item_id = p_repair_item_id AND cycle_number = v_item.current_cycle_number FOR UPDATE;
  UPDATE public.repair_items SET status = 'received', updated_at = now() WHERE id = p_repair_item_id;
  INSERT INTO public.repair_events (repair_item_id, repair_cycle_id, event_type, payload, actor_user_id)
  VALUES (
    p_repair_item_id, v_cycle.id, 'removed_from_production',
    jsonb_build_object(
      'reason', v_reason,
      'from_stage', v_batch.current_stage,
      'requires_setting', v_batch.requires_setting,
      'requires_assembly', v_batch.requires_assembly,
      'sku', v_batch.sku,
      'variant_suffix', v_batch.variant_suffix,
      'size_info', v_batch.size_info,
      'priority', v_batch.priority,
      'notes', v_batch.notes
    ),
    (SELECT auth.uid())
  );
  PERFORM private.delete_repair_linked_batch(v_batch.id, p_idempotency_key || ':batch');
  v_existing := jsonb_build_object(
    'repair_item_id', p_repair_item_id, 'status', 'received', 'removed', true, 'idempotent', false
  );
  INSERT INTO public.customer_service_command_results VALUES (
    p_idempotency_key, 'repair_production_remove', v_existing, (SELECT auth.uid()), now()
  );
  RETURN v_existing;
END;
$$;

CREATE OR REPLACE FUNCTION public.return_repair_to_production_v1(
  p_repair_item_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing jsonb;
  v_item public.repair_items%ROWTYPE;
  v_cycle public.repair_cycles%ROWTYPE;
  v_snapshot jsonb;
  v_batch_id text;
BEGIN
  SELECT result INTO v_existing FROM public.customer_service_command_results WHERE idempotency_key = p_idempotency_key;
  IF v_existing IS NOT NULL THEN RETURN v_existing || jsonb_build_object('idempotent', true); END IF;
  SELECT * INTO v_item FROM public.repair_items WHERE id = p_repair_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Η Επισκευή δεν βρέθηκε. Δεν πραγματοποιήθηκε καμία μεταβολή.';
  END IF;
  PERFORM private.assert_customer_service_role(ARRAY['admin', 'user'], v_item.customer_id, v_item.seller_id);
  IF EXISTS (SELECT 1 FROM public.production_batches WHERE repair_item_id = p_repair_item_id) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Η Επισκευή βρίσκεται ήδη στην Παραγωγή.';
  END IF;
  IF v_item.status NOT IN ('received', 'on_hold', 'in_production') THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Η Επισκευή δεν μπορεί να επιστρέψει στην Παραγωγή από την τρέχουσα κατάσταση.';
  END IF;
  SELECT * INTO v_cycle FROM public.repair_cycles
  WHERE repair_item_id = p_repair_item_id AND cycle_number = v_item.current_cycle_number FOR UPDATE;
  SELECT payload INTO v_snapshot
  FROM public.repair_events
  WHERE repair_item_id = p_repair_item_id
    AND event_type IN ('removed_from_production', 'production_completed')
  ORDER BY created_at DESC
  LIMIT 1;
  v_batch_id := private.create_repair_linked_batch(
    v_item, v_cycle.id, 'Αναμονή Παραλαβής',
    COALESCE((v_snapshot->>'requires_setting')::boolean, false),
    COALESCE((v_snapshot->>'requires_assembly')::boolean, false),
    COALESCE(v_snapshot->>'priority', 'Normal'),
    COALESCE(v_snapshot->>'sku', v_item.product_sku, 'SP'),
    COALESCE(v_snapshot->>'variant_suffix', v_item.variant_suffix, ''),
    COALESCE(v_snapshot->>'size_info', v_item.size_info, ''),
    COALESCE(v_snapshot->>'notes', v_item.description)
  );
  UPDATE public.repair_cycles SET production_batch_id = v_batch_id WHERE id = v_cycle.id;
  UPDATE public.repair_items SET status = 'received', updated_at = now() WHERE id = p_repair_item_id;
  INSERT INTO public.repair_events (repair_item_id, repair_cycle_id, event_type, payload, actor_user_id)
  VALUES (
    p_repair_item_id, v_cycle.id, 'returned_to_production',
    jsonb_build_object('production_batch_id', v_batch_id), (SELECT auth.uid())
  );
  v_existing := jsonb_build_object(
    'repair_item_id', p_repair_item_id, 'production_batch_id', v_batch_id, 'status', 'received', 'idempotent', false
  );
  INSERT INTO public.customer_service_command_results VALUES (
    p_idempotency_key, 'repair_production_return', v_existing, (SELECT auth.uid()), now()
  );
  RETURN v_existing;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_repair_item_v1(
  p_repair_item_id uuid,
  p_reason text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing jsonb;
  v_item public.repair_items%ROWTYPE;
  v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_batch_id text;
  v_intake_id uuid;
BEGIN
  SELECT result INTO v_existing FROM public.customer_service_command_results WHERE idempotency_key = p_idempotency_key;
  IF v_existing IS NOT NULL THEN RETURN v_existing || jsonb_build_object('idempotent', true); END IF;
  SELECT * INTO v_item FROM public.repair_items WHERE id = p_repair_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Η Επισκευή δεν βρέθηκε. Δεν πραγματοποιήθηκε καμία μεταβολή.';
  END IF;
  PERFORM private.assert_customer_service_role(ARRAY['admin', 'user'], v_item.customer_id, v_item.seller_id);
  IF v_reason IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Η αιτιολογία διαγραφής είναι υποχρεωτική.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.repair_charges
    WHERE repair_item_id = p_repair_item_id AND legal_document_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000',
      MESSAGE = 'Η Επισκευή έχει συνδεδεμένο παραστατικό και δεν διαγράφεται. Αρχειοθετήστε την.';
  END IF;
  v_intake_id := v_item.intake_id;
  FOR v_batch_id IN
    SELECT id FROM public.production_batches WHERE repair_item_id = p_repair_item_id
    UNION
    SELECT production_batch_id FROM public.repair_cycles WHERE repair_item_id = p_repair_item_id
  LOOP
    PERFORM private.delete_repair_linked_batch(v_batch_id, p_idempotency_key || ':batch:' || v_batch_id);
  END LOOP;

  ALTER TABLE public.repair_events DISABLE TRIGGER repair_events_immutable;
  DELETE FROM public.repair_events WHERE repair_item_id = p_repair_item_id;
  ALTER TABLE public.repair_events ENABLE TRIGGER repair_events_immutable;

  DELETE FROM public.repair_attachments WHERE repair_item_id = p_repair_item_id;
  DELETE FROM public.repair_cost_lines WHERE repair_item_id = p_repair_item_id;
  DELETE FROM public.repair_charges WHERE repair_item_id = p_repair_item_id;
  DELETE FROM public.repair_cycles WHERE repair_item_id = p_repair_item_id;
  UPDATE public.repair_items SET previous_repair_item_id = NULL
  WHERE previous_repair_item_id = p_repair_item_id;
  DELETE FROM public.repair_items WHERE id = p_repair_item_id;

  IF NOT EXISTS (SELECT 1 FROM public.repair_items WHERE intake_id = v_intake_id) THEN
    UPDATE public.repair_intakes SET status = 'cancelled', updated_at = now() WHERE id = v_intake_id;
  END IF;

  v_existing := jsonb_build_object('repair_item_id', p_repair_item_id, 'deleted', true, 'idempotent', false);
  INSERT INTO public.customer_service_command_results VALUES (
    p_idempotency_key, 'repair_item_delete', v_existing, (SELECT auth.uid()), now()
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
  v_batch public.production_batches%ROWTYPE;
  v_next_status text;
BEGIN
  SELECT * INTO v_item FROM public.repair_items WHERE id = p_repair_item_id FOR UPDATE;
  PERFORM private.assert_customer_service_role(ARRAY['admin', 'user'], v_item.customer_id, v_item.seller_id);
  IF p_status NOT IN ('on_hold', 'irreparable', 'cancelled', 'in_production')
     OR NULLIF(btrim(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Η κατάσταση και η αιτιολογία δεν είναι έγκυρες.';
  END IF;
  SELECT * INTO v_batch FROM public.production_batches WHERE repair_item_id = p_repair_item_id FOR UPDATE;
  v_next_status := p_status;
  IF p_status = 'on_hold' THEN
    IF v_batch.id IS NOT NULL THEN
      UPDATE public.production_batches
      SET on_hold = true, on_hold_reason = btrim(p_reason), updated_at = now()
      WHERE id = v_batch.id;
    END IF;
  ELSIF p_status = 'in_production' THEN
    IF v_batch.id IS NOT NULL THEN
      UPDATE public.production_batches
      SET on_hold = false, on_hold_reason = NULL, updated_at = now()
      WHERE id = v_batch.id;
      v_next_status := CASE
        WHEN v_batch.current_stage = 'Αναμονή Παραλαβής' THEN 'received'
        WHEN v_batch.current_stage = 'Ready' THEN 'quality_check'
        ELSE 'in_production'
      END;
    ELSE
      v_next_status := 'received';
    END IF;
  END IF;
  UPDATE public.repair_items SET status = v_next_status, updated_at = now()
  WHERE id = p_repair_item_id RETURNING * INTO v_item;
  INSERT INTO public.repair_events (repair_item_id, event_type, payload, actor_user_id)
  VALUES (p_repair_item_id, 'status_changed', jsonb_build_object('status', v_next_status, 'reason', btrim(p_reason)), (SELECT auth.uid()));
  RETURN v_item;
END;
$$;

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
  v_old_batch public.production_batches%ROWTYPE;
  v_next_cycle_id uuid;
  v_existing jsonb;
  v_actor_name text;
  v_snapshot jsonb;
  v_new_batch_id text;
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
    SELECT * INTO v_old_batch FROM public.production_batches WHERE id = v_cycle.production_batch_id FOR UPDATE;
    v_next_cycle_id := gen_random_uuid();
    IF v_old_batch.id IS NOT NULL THEN
      INSERT INTO public.repair_cycles (
        id, repair_item_id, cycle_number, production_batch_id
      ) VALUES (
        v_next_cycle_id, p_repair_item_id, v_item.current_cycle_number + 1, v_old_batch.id
      );
      UPDATE public.repair_items
      SET current_cycle_number = current_cycle_number + 1, status = 'in_production', updated_at = now()
      WHERE id = p_repair_item_id;
      UPDATE public.production_batches
      SET current_stage = p_return_stage, repair_cycle_id = v_next_cycle_id,
          pending_dispatch = CASE WHEN p_return_stage = 'Polishing' THEN true ELSE false END,
          updated_at = now()
      WHERE id = v_old_batch.id;
      INSERT INTO public.batch_stage_history (
        id, batch_id, from_stage, to_stage, moved_by, moved_at, notes
      ) VALUES (
        gen_random_uuid(), v_old_batch.id, 'Ready', p_return_stage,
        COALESCE(v_actor_name, 'Σύστημα'), now(), 'Επανεπισκευή: ' || btrim(p_notes)
      );
    ELSE
      SELECT payload INTO v_snapshot
      FROM public.repair_events
      WHERE repair_item_id = p_repair_item_id
        AND event_type IN ('production_completed', 'removed_from_production')
      ORDER BY created_at DESC
      LIMIT 1;
      INSERT INTO public.repair_cycles (
        id, repair_item_id, cycle_number, production_batch_id
      ) VALUES (
        v_next_cycle_id, p_repair_item_id, v_item.current_cycle_number + 1, 'pending'
      );
      v_new_batch_id := private.create_repair_linked_batch(
        v_item, v_next_cycle_id, p_return_stage,
        COALESCE((v_snapshot->>'requires_setting')::boolean, false),
        COALESCE((v_snapshot->>'requires_assembly')::boolean, false),
        COALESCE(v_snapshot->>'priority', 'Normal'),
        COALESCE(v_snapshot->>'sku', v_item.product_sku, 'SP'),
        COALESCE(v_snapshot->>'variant_suffix', v_item.variant_suffix, ''),
        COALESCE(v_snapshot->>'size_info', v_item.size_info, ''),
        COALESCE(v_snapshot->>'notes', v_item.description)
      );
      UPDATE public.repair_cycles SET production_batch_id = v_new_batch_id WHERE id = v_next_cycle_id;
      UPDATE public.repair_items
      SET current_cycle_number = current_cycle_number + 1, status = 'in_production', updated_at = now()
      WHERE id = p_repair_item_id;
    END IF;
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

REVOKE ALL ON FUNCTION private.delete_repair_linked_batch(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.create_repair_linked_batch(public.repair_items, uuid, text, boolean, boolean, text, text, text, text, text) FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  signature regprocedure;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.archive_repair_item_v1(uuid,boolean,text)'::regprocedure,
    'public.complete_repair_production_v1(uuid,text)'::regprocedure,
    'public.remove_repair_from_production_v1(uuid,text,text)'::regprocedure,
    'public.return_repair_to_production_v1(uuid,text)'::regprocedure,
    'public.delete_repair_item_v1(uuid,text,text)'::regprocedure,
    'public.set_repair_exception_state_v1(uuid,text,text)'::regprocedure,
    'public.complete_repair_quality_check_v1(uuid,boolean,text,text,text)'::regprocedure
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', signature);
  END LOOP;
END;
$$;

-- Existing repair batches already sitting in Έτοιμα while the item is in
-- Ποιοτικός έλεγχος predate complete_repair_production_v1. Remove them so
-- the board never keeps a repair in Ready.
DO $$
DECLARE
  v_batch public.production_batches%ROWTYPE;
BEGIN
  FOR v_batch IN
    SELECT pb.*
    FROM public.production_batches pb
    JOIN public.repair_items ri ON ri.id = pb.repair_item_id
    WHERE pb.workflow_kind = 'repair'
      AND pb.current_stage = 'Ready'
  LOOP
    UPDATE public.repair_items
    SET status = 'quality_check', updated_at = now()
    WHERE id = v_batch.repair_item_id
      AND status NOT IN ('delivered', 'irreparable', 'cancelled', 'ready_for_return');
    PERFORM private.delete_repair_linked_batch(v_batch.id, 'repair-ready-cleanup:' || v_batch.id);
  END LOOP;
END;
$$;
