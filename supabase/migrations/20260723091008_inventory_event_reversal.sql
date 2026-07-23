-- ERP-safe cancellation of eligible inventory movements (live migration 20260723091008).
-- The immutable source event is never deleted; an attributable reversal event
-- applies the opposite balance delta in the same atomic transaction.

CREATE INDEX IF NOT EXISTS inventory_events_reversal_of_idx
  ON public.inventory_events (reversal_of)
  WHERE reversal_of IS NOT NULL;

CREATE OR REPLACE FUNCTION public.reverse_inventory_event_v1(
  p_event_id uuid,
  p_reason text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_actor_name text;
  v_target public.inventory_events%ROWTYPE;
  v_command public.inventory_command_results%ROWTYPE;
  v_event public.inventory_events%ROWTYPE;
  v_balance public.inventory_balances%ROWTYPE;
  v_event_ids uuid[];
  v_reversal_ids jsonb := '[]'::jsonb;
  v_affected_skus text[] := ARRAY[]::text[];
  v_reversal_id uuid;
  v_sku text;
  v_sequence integer := 0;
  v_new_on_hand integer;
  v_new_reserved integer;
  v_result jsonb;
BEGIN
  PERFORM private.assert_inventory_role(ARRAY['admin']);

  IF p_event_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Η ακύρωση κίνησης δεν ολοκληρώθηκε, επειδή δεν επιλέχθηκε έγκυρη κίνηση. Δεν πραγματοποιήθηκε καμία μεταβολή.';
  END IF;
  IF NULLIF(BTRIM(COALESCE(p_reason, '')), '') IS NULL
     OR char_length(BTRIM(p_reason)) > 500 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Η αιτιολογία ακύρωσης είναι υποχρεωτική και πρέπει να είναι έως 500 χαρακτήρες. Δεν πραγματοποιήθηκε καμία μεταβολή.';
  END IF;
  IF NULLIF(BTRIM(COALESCE(p_idempotency_key, '')), '') IS NULL
     OR char_length(p_idempotency_key) > 200 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Η ακύρωση κίνησης δεν ολοκληρώθηκε, επειδή λείπει το ασφαλές αναγνωριστικό υποβολής. Δεν πραγματοποιήθηκε καμία μεταβολή.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('inventory-event-reversal:' || p_event_id::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_idempotency_key, 0));

  SELECT * INTO v_command
  FROM public.inventory_command_results
  WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_command.operation_type <> 'inventory_event_reversal' THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'Το αναγνωριστικό υποβολής έχει ήδη χρησιμοποιηθεί σε διαφορετική ενέργεια. Δεν πραγματοποιήθηκε καμία μεταβολή.';
    END IF;
    RETURN jsonb_set(v_command.result, '{idempotent}', 'true'::jsonb, true);
  END IF;

  SELECT * INTO v_target
  FROM public.inventory_events
  WHERE id = p_event_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Η κίνηση δεν βρέθηκε στο Ιστορικό Κινήσεων. Δεν πραγματοποιήθηκε καμία μεταβολή.';
  END IF;

  IF v_target.reversal_of IS NOT NULL OR v_target.operation_type = 'movement_reversal' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Η επιλεγμένη εγγραφή είναι ήδη αντιλογιστική κίνηση και δεν μπορεί να ακυρωθεί ξανά. Δεν πραγματοποιήθηκε καμία μεταβολή.';
  END IF;

  IF v_target.operation_type IN ('transfer_out', 'transfer_in') THEN
    IF v_target.transfer_group_id IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'Η ενδοδιακίνηση δεν διαθέτει πλήρη συσχέτιση προέλευσης και προορισμού. Δεν πραγματοποιήθηκε καμία μεταβολή.';
    END IF;
    -- Either side of the pair may be selected from the UI. Lock the shared
    -- transfer identity so concurrent cancellation attempts serialize.
    PERFORM pg_advisory_xact_lock(
      hashtextextended('inventory-transfer-reversal:' || v_target.transfer_group_id::text, 0)
    );
    SELECT array_agg(event_row.id ORDER BY event_row.sequence_no, event_row.id)
    INTO v_event_ids
    FROM public.inventory_events event_row
    WHERE event_row.transfer_group_id = v_target.transfer_group_id
      AND event_row.operation_type IN ('transfer_out', 'transfer_in');

    IF COALESCE(array_length(v_event_ids, 1), 0) <> 2 THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'Η ενδοδιακίνηση δεν διαθέτει ακριβώς δύο συσχετισμένες κινήσεις. Δεν πραγματοποιήθηκε καμία μεταβολή.';
    END IF;
  ELSIF v_target.operation_type IN (
    'adjustment',
    'stock_count',
    'manual_stock_increase',
    'opening_reconciliation'
  ) THEN
    v_event_ids := ARRAY[v_target.id];
  ELSE
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Η κίνηση προέρχεται από επιχειρησιακό έγγραφο και δεν μπορεί να ακυρωθεί από το Ιστορικό Κινήσεων. Χρησιμοποιήστε την αναίρεση στο αντίστοιχο παραστατικό ή στην αποστολή. Δεν πραγματοποιήθηκε καμία μεταβολή.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.inventory_events reversal
    WHERE reversal.reversal_of = ANY(v_event_ids)
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Η επιλεγμένη κίνηση έχει ήδη ακυρωθεί. Δεν πραγματοποιήθηκε καμία μεταβολή.';
  END IF;

  -- Lock every affected identity in a deterministic order before validating.
  PERFORM balance.product_sku
  FROM public.inventory_balances balance
  JOIN public.inventory_events event_row
    ON event_row.product_sku = balance.product_sku
   AND event_row.variant_suffix = balance.variant_suffix
   AND event_row.size_info = balance.size_info
   AND event_row.warehouse_id = balance.warehouse_id
  WHERE event_row.id = ANY(v_event_ids)
  ORDER BY balance.product_sku, balance.variant_suffix, balance.size_info, balance.warehouse_id
  FOR UPDATE OF balance;

  IF (
    SELECT count(*)
    FROM public.inventory_balances balance
    JOIN public.inventory_events event_row
      ON event_row.product_sku = balance.product_sku
     AND event_row.variant_suffix = balance.variant_suffix
     AND event_row.size_info = balance.size_info
     AND event_row.warehouse_id = balance.warehouse_id
    WHERE event_row.id = ANY(v_event_ids)
  ) <> array_length(v_event_ids, 1) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Δεν βρέθηκαν όλα τα απαιτούμενα υπόλοιπα της κίνησης. Δεν πραγματοποιήθηκε καμία μεταβολή.';
  END IF;

  SELECT full_name INTO v_actor_name
  FROM public.profiles
  WHERE id = v_actor;

  FOR v_event IN
    SELECT *
    FROM public.inventory_events event_row
    WHERE event_row.id = ANY(v_event_ids)
    ORDER BY event_row.product_sku, event_row.variant_suffix, event_row.size_info,
             event_row.warehouse_id, event_row.sequence_no
  LOOP
    SELECT * INTO v_balance
    FROM public.inventory_balances balance
    WHERE balance.product_sku = v_event.product_sku
      AND balance.variant_suffix = v_event.variant_suffix
      AND balance.size_info = v_event.size_info
      AND balance.warehouse_id = v_event.warehouse_id;

    v_new_on_hand := v_balance.on_hand - v_event.on_hand_delta;
    v_new_reserved := v_balance.reserved - v_event.reserved_delta;
    IF v_new_on_hand < 0 OR v_new_reserved < 0 OR v_new_reserved > v_new_on_hand THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = format(
          'Η ακύρωση δεν ολοκληρώθηκε για το %s%s%s. Το αποτέλεσμα θα παραβίαζε το διαθέσιμο ή δεσμευμένο απόθεμα. Δεν πραγματοποιήθηκε καμία μεταβολή.',
          v_event.product_sku,
          v_event.variant_suffix,
          CASE WHEN v_event.size_info = '' THEN '' ELSE ' · Μέγεθος ' || v_event.size_info END
        );
    END IF;

    UPDATE public.inventory_balances
    SET on_hand = v_new_on_hand,
        reserved = v_new_reserved,
        version = version + 1,
        updated_at = now()
    WHERE product_sku = v_event.product_sku
      AND variant_suffix = v_event.variant_suffix
      AND size_info = v_event.size_info
      AND warehouse_id = v_event.warehouse_id
    RETURNING * INTO v_balance;

    v_sequence := v_sequence + 1;
    INSERT INTO public.inventory_events (
      sequence_no, operation_type, product_sku, variant_suffix, size_info,
      warehouse_id, on_hand_delta, reserved_delta, on_hand_after, reserved_after,
      reference_type, reference_id, reference_line_id, transfer_group_id,
      reversal_of, actor_user_id, actor_name, reason, idempotency_key
    ) VALUES (
      v_sequence,
      'movement_reversal',
      v_event.product_sku,
      v_event.variant_suffix,
      v_event.size_info,
      v_event.warehouse_id,
      -v_event.on_hand_delta,
      -v_event.reserved_delta,
      v_balance.on_hand,
      v_balance.reserved,
      'inventory_event_reversal',
      v_event.id::text,
      v_event.reference_line_id,
      v_event.transfer_group_id,
      v_event.id,
      v_actor,
      v_actor_name,
      'Ακύρωση κίνησης: ' || BTRIM(p_reason),
      p_idempotency_key
    )
    RETURNING id INTO v_reversal_id;

    v_reversal_ids := v_reversal_ids || jsonb_build_array(v_reversal_id);
    IF NOT (v_event.product_sku = ANY(v_affected_skus)) THEN
      v_affected_skus := array_append(v_affected_skus, v_event.product_sku);
    END IF;
  END LOOP;

  FOREACH v_sku IN ARRAY v_affected_skus
  LOOP
    PERFORM private.sync_legacy_inventory_projection(v_sku);
  END LOOP;

  v_result := jsonb_build_object(
    'reversed_event_ids', to_jsonb(v_event_ids),
    'reversal_event_ids', v_reversal_ids,
    'idempotent', false
  );

  INSERT INTO public.inventory_command_results (
    idempotency_key, operation_type, result, actor_user_id
  ) VALUES (
    p_idempotency_key, 'inventory_event_reversal', v_result, v_actor
  );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.reverse_inventory_event_v1(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_inventory_event_v1(uuid, text, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.reverse_inventory_event_v1(uuid, text, text)
IS 'Administrator-only atomic reversal for eligible manual inventory movements and complete warehouse transfers; source ledger events remain immutable.';
