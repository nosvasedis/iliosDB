-- Pricing policy is additive. Empty legacy policies keep stored plating totals.
CREATE OR REPLACE FUNCTION public.valid_pricing_rules_v1(rules jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE k text; v jsonb; t1 numeric; t2 numeric; t3 numeric; step numeric;
BEGIN
  IF rules IS NULL OR jsonb_typeof(rules) <> 'object' THEN RETURN false; END IF;
  FOR k, v IN SELECT * FROM jsonb_each(rules) LOOP
    IF k <> ALL(ARRAY['casting_rate','plating_rate','stx_technician_rate',
      'technician_threshold_1','technician_threshold_2','technician_threshold_3',
      'technician_rate_1','technician_rate_2','technician_rate_3','technician_rate_4',
      'ilios_labor_material_multiplier','ilios_weight_surcharge','retail_multiplier','price_rounding_step'])
      OR jsonb_typeof(v) <> 'number' THEN RETURN false; END IF;
    IF (v::text)::numeric < 0 OR (v::text)::numeric > 10000 THEN RETURN false; END IF;
  END LOOP;
  t1 := coalesce((rules->>'technician_threshold_1')::numeric, 2.2);
  t2 := coalesce((rules->>'technician_threshold_2')::numeric, 4.2);
  t3 := coalesce((rules->>'technician_threshold_3')::numeric, 8.2);
  step := coalesce((rules->>'price_rounding_step')::numeric, 0.10);
  RETURN t1 > 0 AND t2 > t1 AND t3 > t2
    AND coalesce((rules->>'ilios_labor_material_multiplier')::numeric, 2) > 0
    AND coalesce((rules->>'retail_multiplier')::numeric, 3) > 0
    AND step BETWEEN 0.01 AND 100 AND step * 100 = trunc(step * 100);
END;
$$;

ALTER TABLE public.global_settings ADD COLUMN IF NOT EXISTS pricing_rules jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.global_settings ADD CONSTRAINT global_settings_valid_pricing_rules CHECK (public.valid_pricing_rules_v1(pricing_rules));

-- Keep an exact before/after record of each catalogue-only repricing transaction.
CREATE TABLE public.pricing_recalculation_runs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  input_fingerprint text NOT NULL,
  before_values jsonb NOT NULL,
  after_values jsonb NOT NULL
);
ALTER TABLE public.pricing_recalculation_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY pricing_runs_admin_read ON public.pricing_recalculation_runs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'admin' AND is_approved));
CREATE POLICY pricing_runs_admin_insert ON public.pricing_recalculation_runs FOR INSERT TO authenticated
  WITH CHECK (created_by = (SELECT auth.uid()) AND EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'admin' AND is_approved));
GRANT SELECT, INSERT ON public.pricing_recalculation_runs TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.pricing_recalculation_runs_id_seq TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.pricing_catalog_snapshot_v1()
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE snapshot jsonb;
BEGIN
  IF current_user NOT IN ('postgres','service_role') AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin' AND is_approved
  ) THEN RAISE EXCEPTION 'Μόνο ο διαχειριστής μπορεί να ενημερώσει την τιμολόγηση.'; END IF;
  -- One statement provides one consistent snapshot of the entire pricing graph.
  SELECT jsonb_build_object(
    'settings', (SELECT to_jsonb(s) FROM public.global_settings s WHERE id = 1),
    'products', coalesce((SELECT jsonb_agg(to_jsonb(p) - 'image_url' ORDER BY sku) FROM public.products p), '[]'::jsonb),
    'variants', coalesce((SELECT jsonb_agg(to_jsonb(v) ORDER BY product_sku, suffix) FROM public.product_variants v), '[]'::jsonb),
    'recipes', coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text) FROM public.recipes r), '[]'::jsonb),
    'materials', coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY id) FROM public.materials m), '[]'::jsonb)
  ) INTO snapshot;
  IF snapshot->'settings' = 'null'::jsonb THEN RAISE EXCEPTION 'Δεν βρέθηκαν οι ρυθμίσεις.'; END IF;
  RETURN snapshot || jsonb_build_object('fingerprint', md5(snapshot::text));
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_pricing_recalculation_v1(expected_fingerprint text, price_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE snapshot jsonb; item jsonb; vals jsonb; k text; v jsonb; before_rows jsonb := '[]';
  previous jsonb; affected integer; master_count integer := 0; variant_count integer := 0; run_id bigint;
BEGIN
  IF current_user NOT IN ('postgres','service_role') AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin' AND is_approved
  ) THEN RAISE EXCEPTION 'Μόνο ο διαχειριστής μπορεί να ενημερώσει την τιμολόγηση.'; END IF;
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
      IF (vals ? 'selling_price' AND coalesce((previous->>'selling_price_manual_override')::boolean, false))
        OR (vals ? 'labor_casting' AND coalesce((previous->>'labor_casting_manual_override')::boolean, false))
        OR (vals ? 'labor_technician' AND coalesce((previous->>'labor_technician_manual_override')::boolean, false))
        OR (vals ? 'labor_plating_x' AND coalesce((previous->>'labor_plating_x_manual_override')::boolean, false))
        OR (vals ? 'labor_plating_d' AND coalesce((previous->>'labor_plating_d_manual_override')::boolean, false)) THEN
        RAISE EXCEPTION 'Η χειροκίνητη τιμή προστατεύεται.';
      END IF;
      UPDATE public.products SET
        active_price = CASE WHEN vals ? 'active_price' THEN (vals->>'active_price')::numeric ELSE active_price END,
        draft_price = CASE WHEN vals ? 'draft_price' THEN (vals->>'draft_price')::numeric ELSE draft_price END,
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
      IF vals ? 'selling_price' AND coalesce((previous->>'selling_price_manual_override')::boolean, false) THEN RAISE EXCEPTION 'Η χειροκίνητη τιμή προστατεύεται.'; END IF;
      UPDATE public.product_variants SET
        active_price = CASE WHEN vals ? 'active_price' THEN (vals->>'active_price')::numeric ELSE active_price END,
        selling_price = CASE WHEN vals ? 'selling_price' THEN (vals->>'selling_price')::numeric ELSE selling_price END
      WHERE product_sku = item->>'sku' AND suffix = item->>'suffix';
      GET DIAGNOSTICS affected = ROW_COUNT;
      variant_count := variant_count + affected;
    END IF;
    IF affected <> 1 THEN RAISE EXCEPTION 'Η ενημέρωση δεν επιτράπηκε. Δεν αποθηκεύτηκαν αλλαγές.'; END IF;
    before_rows := before_rows || jsonb_build_array(jsonb_build_object('sku', item->>'sku', 'suffix', item->'suffix', 'values',
      (SELECT jsonb_object_agg(key, previous->key) FROM jsonb_object_keys(vals) key)));
  END LOOP;
  INSERT INTO public.pricing_recalculation_runs(input_fingerprint, before_values, after_values)
    VALUES (expected_fingerprint, before_rows, price_rows) RETURNING id INTO run_id;
  RETURN jsonb_build_object('run_id',run_id,'masters',master_count,'variants',variant_count);
END;
$$;
REVOKE ALL ON FUNCTION public.pricing_catalog_snapshot_v1() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.apply_pricing_recalculation_v1(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pricing_catalog_snapshot_v1() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.apply_pricing_recalculation_v1(text, jsonb) TO authenticated, service_role;
