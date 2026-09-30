-- Manual prices remain protected unless the approved admin explicitly opts in.
-- The recovery record includes both prices and any flags reset to automatic.
CREATE OR REPLACE FUNCTION public.apply_pricing_recalculation_v2(expected_fingerprint text, price_rows jsonb, replace_manual_selling boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE snapshot jsonb; item jsonb; vals jsonb; k text; v jsonb; before_rows jsonb := '[]'; after_rows jsonb := '[]';
  previous jsonb; affected integer; master_count integer := 0; variant_count integer := 0; run_id bigint;
BEGIN
  IF current_user NOT IN ('postgres','service_role') AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin' AND is_approved
  ) THEN RAISE EXCEPTION 'Μόνο ο διαχειριστής μπορεί να ενημερώσει την τιμολόγηση.'; END IF;
  IF replace_manual_selling IS NULL THEN RAISE EXCEPTION 'Manual-price replacement must be explicit.'; END IF;
  IF jsonb_typeof(price_rows) <> 'array' OR price_rows IS NULL OR jsonb_array_length(price_rows) = 0 THEN
    RAISE EXCEPTION 'Δεν υπάρχουν έγκυρες αλλαγές τιμών.';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(price_rows) r GROUP BY r->>'sku', r->>'suffix' HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Διπλότυπες εγγραφές τιμολόγησης.';
  END IF;
  -- Short transaction; any stale preview, invalid row, permission failure or
  -- trigger failure rolls back every row together with its recovery record.
  LOCK TABLE public.global_settings, public.products, public.product_variants, public.recipes, public.materials IN SHARE ROW EXCLUSIVE MODE;
  snapshot := public.pricing_catalog_snapshot_v1();
  IF expected_fingerprint IS DISTINCT FROM snapshot->>'fingerprint' THEN
    RAISE EXCEPTION 'Τα δεδομένα άλλαξαν. Δημιουργήστε νέα προεπισκόπηση.';
  END IF;
  FOR item IN SELECT * FROM jsonb_array_elements(price_rows) LOOP
    IF item->>'sku' IN ('000','001','SP') THEN RAISE EXCEPTION 'Οι υπηρεσίες εξαιρούνται από την τιμολόγηση κοσμημάτων.'; END IF;
    vals := item->'values';
    IF vals IS NULL OR jsonb_typeof(vals) <> 'object' OR vals = '{}'::jsonb THEN RAISE EXCEPTION 'Μη έγκυρες τιμές.'; END IF;
    FOR k, v IN SELECT * FROM jsonb_each(vals) LOOP
      IF k <> ALL(ARRAY['active_price','draft_price','selling_price','labor_casting','labor_technician','labor_plating_x','labor_plating_d'])
        OR jsonb_typeof(v) <> 'number' THEN RAISE EXCEPTION 'Μη έγκυρο πεδίο τιμολόγησης.'; END IF;
      IF (v::text)::numeric < 0 OR (v::text)::numeric > 100000000 THEN RAISE EXCEPTION 'Μη έγκυρη τιμή.'; END IF;
    END LOOP;
    IF item->>'suffix' IS NULL THEN
      SELECT to_jsonb(p) INTO previous FROM public.products p WHERE sku = item->>'sku';
      IF previous IS NULL THEN RAISE EXCEPTION 'Δεν βρέθηκε βασικός κωδικός.'; END IF;
      IF (vals ? 'selling_price' AND coalesce((previous->>'selling_price_manual_override')::boolean, false) AND NOT replace_manual_selling)
        OR (vals ? 'labor_casting' AND coalesce((previous->>'labor_casting_manual_override')::boolean, false))
        OR (vals ? 'labor_technician' AND coalesce((previous->>'labor_technician_manual_override')::boolean, false))
        OR (vals ? 'labor_plating_x' AND coalesce((previous->>'labor_plating_x_manual_override')::boolean, false))
        OR (vals ? 'labor_plating_d' AND coalesce((previous->>'labor_plating_d_manual_override')::boolean, false)) THEN
        RAISE EXCEPTION 'Η χειροκίνητη τιμή προστατεύεται.';
      END IF;
      IF replace_manual_selling AND vals ? 'selling_price' AND coalesce((previous->>'selling_price_manual_override')::boolean, false) THEN
        vals := vals || jsonb_build_object('selling_price_manual_override', false);
      END IF;
      UPDATE public.products SET
        active_price = CASE WHEN vals ? 'active_price' THEN (vals->>'active_price')::numeric ELSE active_price END,
        draft_price = CASE WHEN vals ? 'draft_price' THEN (vals->>'draft_price')::numeric ELSE draft_price END,
        selling_price_manual_override = CASE WHEN vals ? 'selling_price_manual_override' THEN false ELSE selling_price_manual_override END,
        selling_price = CASE WHEN vals ? 'selling_price' THEN (vals->>'selling_price')::numeric ELSE selling_price END,
        labor_casting = CASE WHEN vals ? 'labor_casting' THEN (vals->>'labor_casting')::numeric ELSE labor_casting END,
        labor_technician = CASE WHEN vals ? 'labor_technician' THEN (vals->>'labor_technician')::numeric ELSE labor_technician END,
        labor_plating_x = CASE WHEN vals ? 'labor_plating_x' THEN (vals->>'labor_plating_x')::numeric ELSE labor_plating_x END,
        labor_plating_d = CASE WHEN vals ? 'labor_plating_d' THEN (vals->>'labor_plating_d')::numeric ELSE labor_plating_d END
      WHERE sku = item->>'sku';
      GET DIAGNOSTICS affected = ROW_COUNT;
      master_count := master_count + affected;
    ELSE
      IF EXISTS (SELECT 1 FROM jsonb_object_keys(vals) AS fields(field_name) WHERE fields.field_name NOT IN ('active_price','selling_price')) THEN RAISE EXCEPTION 'Μη έγκυρο πεδίο παραλλαγής.'; END IF;
      SELECT to_jsonb(p) INTO previous FROM public.product_variants p WHERE product_sku = item->>'sku' AND suffix = item->>'suffix';
      IF previous IS NULL THEN RAISE EXCEPTION 'Δεν βρέθηκε παραλλαγή.'; END IF;
      IF vals ? 'selling_price' AND coalesce((previous->>'selling_price_manual_override')::boolean, false) AND NOT replace_manual_selling THEN RAISE EXCEPTION 'Η χειροκίνητη τιμή προστατεύεται.'; END IF;
      IF replace_manual_selling AND vals ? 'selling_price' AND coalesce((previous->>'selling_price_manual_override')::boolean, false) THEN
        vals := vals || jsonb_build_object('selling_price_manual_override', false);
      END IF;
      UPDATE public.product_variants SET
        active_price = CASE WHEN vals ? 'active_price' THEN (vals->>'active_price')::numeric ELSE active_price END,
        selling_price_manual_override = CASE WHEN vals ? 'selling_price_manual_override' THEN false ELSE selling_price_manual_override END,
        selling_price = CASE WHEN vals ? 'selling_price' THEN (vals->>'selling_price')::numeric ELSE selling_price END
      WHERE product_sku = item->>'sku' AND suffix = item->>'suffix';
      GET DIAGNOSTICS affected = ROW_COUNT;
      variant_count := variant_count + affected;
    END IF;
    IF affected <> 1 THEN RAISE EXCEPTION 'Η ενημέρωση δεν επιτράπηκε. Δεν αποθηκεύτηκαν αλλαγές.'; END IF;
    after_rows := after_rows || jsonb_build_array(jsonb_build_object('sku', item->>'sku', 'suffix', item->'suffix', 'values', vals));
    before_rows := before_rows || jsonb_build_array(jsonb_build_object('sku', item->>'sku', 'suffix', item->'suffix', 'values',
      (SELECT jsonb_object_agg(key, previous->key) FROM jsonb_object_keys(vals) key)));
  END LOOP;
  INSERT INTO public.pricing_recalculation_runs(input_fingerprint, before_values, after_values)
    VALUES (expected_fingerprint, before_rows, after_rows) RETURNING id INTO run_id;
  RETURN jsonb_build_object('run_id',run_id,'masters',master_count,'variants',variant_count);
END;
$$;
REVOKE ALL ON FUNCTION public.apply_pricing_recalculation_v2(text, jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_pricing_recalculation_v2(text, jsonb, boolean) TO authenticated, service_role;
