-- Smart, atomic multi-location inventory posting.
--
-- This migration does not seed or modify balances. It establishes the canonical
-- size normalizer and one administrator-only command for initial counts and
-- documented manual increases across many sizes and warehouses.

CREATE OR REPLACE FUNCTION private.normalize_inventory_size(p_value text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_value text := regexp_replace(normalize(BTRIM(COALESCE(p_value, '')), NFC), '\s+', ' ', 'g');
  v_number numeric;
  v_number_text text;
  v_match text[];
BEGIN
  IF v_value = '' THEN
    RETURN '';
  END IF;

  IF v_value ~ '^[0-9]+([,.][0-9]+)?$' THEN
    v_number := replace(v_value, ',', '.')::numeric;
    v_number_text := v_number::text;
    IF position('.' IN v_number_text) > 0 THEN
      v_number_text := regexp_replace(v_number_text, '0+$', '');
      v_number_text := regexp_replace(v_number_text, '\.$', '');
    END IF;
    RETURN v_number_text;
  END IF;

  v_match := regexp_match(v_value, '^([0-9]+([,.][0-9]+)?)\s*(cm|εκ\.?)$', 'i');
  IF v_match IS NOT NULL THEN
    v_number := replace(v_match[1], ',', '.')::numeric;
    v_number_text := v_number::text;
    IF position('.' IN v_number_text) > 0 THEN
      v_number_text := regexp_replace(v_number_text, '0+$', '');
      v_number_text := regexp_replace(v_number_text, '\.$', '');
    END IF;
    RETURN v_number_text || 'cm';
  END IF;

  v_value := upper(v_value);
  IF char_length(v_value) > 40
     OR v_value !~ '^[[:alnum:]Α-ΩΆΈΉΊΌΎΏΪΫ][[:alnum:]Α-ΩΆΈΉΊΌΎΏΪΫ ._/-]*$' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Το ειδικό μέγεθος δεν είναι έγκυρο. Χρησιμοποιήστε σύντομη τεκμηριωμένη τιμή χωρίς ειδικούς χαρακτήρες. Δεν πραγματοποιήθηκε καμία μεταβολή.';
  END IF;
  RETURN v_value;
END;
$$;

REVOKE ALL ON FUNCTION private.normalize_inventory_size(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.normalize_inventory_size(text) TO service_role;

CREATE OR REPLACE FUNCTION public.post_inventory_entries_v1(
  p_mode text,
  p_lines jsonb,
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
  v_command public.inventory_command_results%ROWTYPE;
  v_item jsonb;
  v_lines jsonb := '[]'::jsonb;
  v_sku text;
  v_variant text;
  v_size text;
  v_warehouse_text text;
  v_warehouse uuid;
  v_quantity bigint;
  v_index integer := 0;
  v_sequence integer := 0;
  v_new_on_hand integer;
  v_delta integer;
  v_posted integer := 0;
  v_changed integer := 0;
  v_counted_zero integer := 0;
  v_balances jsonb := '[]'::jsonb;
  v_result jsonb;
  v_line record;
  v_balance public.inventory_balances%ROWTYPE;
  v_product record;
BEGIN
  PERFORM private.assert_inventory_role(ARRAY['admin']);

  IF p_mode NOT IN ('count', 'increase') THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Η καταχώριση αποθέματος δεν ολοκληρώθηκε. Επιλέξτε «Απογραφή» ή «Προσθήκη Ποσότητας». Δεν πραγματοποιήθηκε καμία μεταβολή.';
  END IF;
  IF NULLIF(BTRIM(COALESCE(p_idempotency_key, '')), '') IS NULL
     OR char_length(p_idempotency_key) > 200 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Η καταχώριση αποθέματος δεν ολοκληρώθηκε επειδή λείπει το ασφαλές αναγνωριστικό υποβολής. Δεν πραγματοποιήθηκε καμία μεταβολή. Δοκιμάστε ξανά.';
  END IF;
  IF BTRIM(COALESCE(p_reason, '')) = '' OR char_length(BTRIM(p_reason)) > 500 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Η αιτιολογία είναι υποχρεωτική και πρέπει να είναι έως 500 χαρακτήρες. Δεν πραγματοποιήθηκε καμία μεταβολή.';
  END IF;
  IF jsonb_typeof(COALESCE(p_lines, 'null'::jsonb)) <> 'array'
     OR jsonb_array_length(p_lines) = 0
     OR jsonb_array_length(p_lines) > 500 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Η καταχώριση πρέπει να περιέχει από 1 έως 500 έγκυρες γραμμές αποθέματος. Δεν πραγματοποιήθηκε καμία μεταβολή.';
  END IF;

  -- One global result per command. The lock serializes concurrent retries.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_idempotency_key, 0));
  SELECT * INTO v_command
  FROM public.inventory_command_results
  WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_command.operation_type <> 'inventory_posting' THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'Το αναγνωριστικό υποβολής έχει ήδη χρησιμοποιηθεί σε διαφορετική ενέργεια. Δεν πραγματοποιήθηκε καμία μεταβολή. Επαναλάβετε με νέα υποβολή.';
    END IF;
    RETURN jsonb_set(v_command.result, '{idempotent}', 'true'::jsonb, true);
  END IF;

  SELECT full_name INTO v_actor_name
  FROM public.profiles
  WHERE id = v_actor;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_lines)
  LOOP
    v_index := v_index + 1;
    IF jsonb_typeof(v_item) <> 'object' THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = format('Η γραμμή %s δεν έχει έγκυρη μορφή. Δεν πραγματοποιήθηκε καμία μεταβολή.', v_index);
    END IF;

    v_sku := upper(BTRIM(COALESCE(v_item->>'product_sku', '')));
    v_variant := upper(BTRIM(COALESCE(v_item->>'variant_suffix', '')));
    v_size := private.normalize_inventory_size(v_item->>'size_info');
    v_warehouse_text := BTRIM(COALESCE(v_item->>'warehouse_id', ''));

    IF v_sku = '' OR char_length(v_sku) > 80 THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = format('Η γραμμή %s δεν περιέχει έγκυρο SKU. Δεν πραγματοποιήθηκε καμία μεταβολή.', v_index);
    END IF;
    IF v_warehouse_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = format('Η γραμμή %s δεν περιέχει έγκυρη αποθήκη. Δεν πραγματοποιήθηκε καμία μεταβολή.', v_index);
    END IF;
    v_warehouse := v_warehouse_text::uuid;

    IF COALESCE(v_item->>'quantity', '') !~ '^-?[0-9]+$' THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = format('Η ποσότητα στη γραμμή %s πρέπει να είναι ακέραιος αριθμός τεμαχίων. Δεν πραγματοποιήθηκε καμία μεταβολή.', v_index);
    END IF;
    v_quantity := (v_item->>'quantity')::bigint;
    IF v_quantity > 2147483647
       OR (p_mode = 'count' AND v_quantity < 0)
       OR (p_mode = 'increase' AND v_quantity <= 0) THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = format(
          'Η ποσότητα στη γραμμή %s δεν είναι έγκυρη για τον επιλεγμένο τρόπο καταχώρισης. Δεν πραγματοποιήθηκε καμία μεταβολή.',
          v_index
        );
    END IF;

    SELECT p.sku, p.category, p.prefix INTO v_product
    FROM public.products p
    WHERE p.sku = v_sku;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = format('Η καταχώριση δεν ολοκληρώθηκε. Το SKU %s δεν υπάρχει στο Μητρώο Προϊόντων. Δεν πραγματοποιήθηκε καμία μεταβολή.', v_sku);
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.product_variants pv WHERE pv.product_sku = v_sku
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.product_variants pv
        WHERE pv.product_sku = v_sku
          AND COALESCE(pv.suffix, '') = v_variant
      ) THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = format('Η καταχώριση δεν ολοκληρώθηκε. Η παραλλαγή %s%s δεν υπάρχει στο Μητρώο Προϊόντων. Δεν πραγματοποιήθηκε καμία μεταβολή.', v_sku, v_variant);
      END IF;
    ELSIF v_variant <> '' THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = format('Η καταχώριση δεν ολοκληρώθηκε. Το SKU %s δεν διαθέτει την παραλλαγή %s. Δεν πραγματοποιήθηκε καμία μεταβολή.', v_sku, v_variant);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.warehouses w WHERE w.id = v_warehouse) THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = format('Η καταχώριση δεν ολοκληρώθηκε. Η αποθήκη της γραμμής %s δεν υπάρχει. Δεν πραγματοποιήθηκε καμία μεταβολή.', v_index);
    END IF;

    PERFORM private.assert_inventory_item_ready(v_sku);
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'product_sku', v_sku,
      'variant_suffix', v_variant,
      'size_info', v_size,
      'warehouse_id', v_warehouse,
      'quantity', v_quantity::integer
    ));
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(v_lines) AS line(
      product_sku text,
      variant_suffix text,
      size_info text,
      warehouse_id uuid,
      quantity integer
    )
    GROUP BY line.product_sku, line.variant_suffix, line.size_info, line.warehouse_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Η ίδια παραλλαγή, μέγεθος και αποθήκη εμφανίζονται περισσότερες από μία φορές. Δεν πραγματοποιήθηκε καμία μεταβολή.';
  END IF;

  INSERT INTO public.inventory_balances (
    product_sku, variant_suffix, size_info, warehouse_id
  )
  SELECT
    line.product_sku,
    line.variant_suffix,
    line.size_info,
    line.warehouse_id
  FROM jsonb_to_recordset(v_lines) AS line(
    product_sku text,
    variant_suffix text,
    size_info text,
    warehouse_id uuid,
    quantity integer
  )
  ORDER BY line.product_sku, line.variant_suffix, line.size_info, line.warehouse_id
  ON CONFLICT DO NOTHING;

  -- Every touched balance is locked in one stable identity order.
  PERFORM balance.product_sku
  FROM public.inventory_balances balance
  JOIN jsonb_to_recordset(v_lines) AS line(
    product_sku text,
    variant_suffix text,
    size_info text,
    warehouse_id uuid,
    quantity integer
  )
    ON line.product_sku = balance.product_sku
   AND line.variant_suffix = balance.variant_suffix
   AND line.size_info = balance.size_info
   AND line.warehouse_id = balance.warehouse_id
  ORDER BY balance.product_sku, balance.variant_suffix, balance.size_info, balance.warehouse_id
  FOR UPDATE OF balance;

  FOR v_line IN
    SELECT *
    FROM jsonb_to_recordset(v_lines) AS line(
      product_sku text,
      variant_suffix text,
      size_info text,
      warehouse_id uuid,
      quantity integer
    )
    ORDER BY line.product_sku, line.variant_suffix, line.size_info, line.warehouse_id
  LOOP
    v_sequence := v_sequence + 1;
    SELECT * INTO v_balance
    FROM public.inventory_balances balance
    WHERE balance.product_sku = v_line.product_sku
      AND balance.variant_suffix = v_line.variant_suffix
      AND balance.size_info = v_line.size_info
      AND balance.warehouse_id = v_line.warehouse_id;

    v_new_on_hand := CASE p_mode
      WHEN 'count' THEN v_line.quantity
      ELSE v_balance.on_hand + v_line.quantity
    END;
    IF v_new_on_hand < v_balance.reserved THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = format(
          'Η καταχώριση δεν ολοκληρώθηκε για το %s%s%s. Το νέο Φυσικό Απόθεμα (%s) δεν μπορεί να είναι μικρότερο από το Δεσμευμένο (%s). Δεν πραγματοποιήθηκε καμία μεταβολή.',
          v_line.product_sku,
          v_line.variant_suffix,
          CASE WHEN v_line.size_info = '' THEN '' ELSE ' · Μέγεθος ' || v_line.size_info END,
          v_new_on_hand,
          v_balance.reserved
        );
    END IF;

    v_delta := v_new_on_hand - v_balance.on_hand;
    UPDATE public.inventory_balances
    SET on_hand = v_new_on_hand,
        version = version + 1,
        updated_at = now()
    WHERE product_sku = v_line.product_sku
      AND variant_suffix = v_line.variant_suffix
      AND size_info = v_line.size_info
      AND warehouse_id = v_line.warehouse_id
    RETURNING * INTO v_balance;

    INSERT INTO public.inventory_events (
      sequence_no, operation_type, product_sku, variant_suffix, size_info,
      warehouse_id, on_hand_delta, reserved_delta, on_hand_after, reserved_after,
      reference_type, reference_id, actor_user_id, actor_name, reason,
      idempotency_key
    ) VALUES (
      v_sequence,
      CASE p_mode WHEN 'count' THEN 'stock_count' ELSE 'manual_stock_increase' END,
      v_balance.product_sku,
      v_balance.variant_suffix,
      v_balance.size_info,
      v_balance.warehouse_id,
      v_delta,
      0,
      v_balance.on_hand,
      v_balance.reserved,
      CASE p_mode WHEN 'count' THEN 'inventory_count' ELSE 'manual_inventory_increase' END,
      p_idempotency_key,
      v_actor,
      v_actor_name,
      BTRIM(p_reason),
      p_idempotency_key
    );

    v_posted := v_posted + 1;
    IF v_delta <> 0 THEN v_changed := v_changed + 1; END IF;
    IF p_mode = 'count' AND v_line.quantity = 0 THEN
      v_counted_zero := v_counted_zero + 1;
    END IF;
    v_balances := v_balances || jsonb_build_array(jsonb_build_object(
      'product_sku', v_balance.product_sku,
      'variant_suffix', v_balance.variant_suffix,
      'size_info', v_balance.size_info,
      'warehouse_id', v_balance.warehouse_id,
      'on_hand', v_balance.on_hand,
      'reserved', v_balance.reserved,
      'available', v_balance.on_hand - v_balance.reserved
    ));
  END LOOP;

  -- Keep the one-release compatibility projection in sync once per SKU.
  FOR v_sku IN
    SELECT DISTINCT line.product_sku
    FROM jsonb_to_recordset(v_lines) AS line(
      product_sku text,
      variant_suffix text,
      size_info text,
      warehouse_id uuid,
      quantity integer
    )
    ORDER BY line.product_sku
  LOOP
    PERFORM private.sync_legacy_inventory_projection(v_sku);
  END LOOP;

  v_result := jsonb_build_object(
    'posted_count', v_posted,
    'changed_count', v_changed,
    'counted_zero_count', v_counted_zero,
    'idempotent', false,
    'balances', v_balances
  );

  INSERT INTO public.inventory_command_results (
    idempotency_key, operation_type, result, actor_user_id
  ) VALUES (
    p_idempotency_key, 'inventory_posting', v_result, v_actor
  );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.post_inventory_entries_v1(text, jsonb, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_inventory_entries_v1(text, jsonb, text, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.post_inventory_entries_v1(text, jsonb, text, text)
IS 'Administrator-only atomic stock count or manual increase across many SKU, size and warehouse identities.';
