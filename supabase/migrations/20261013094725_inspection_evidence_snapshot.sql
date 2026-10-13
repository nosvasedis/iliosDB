-- Additive read APIs. STABLE uses one caller snapshot for all statements.
ALTER TABLE public.legal_settings
  ADD COLUMN IF NOT EXISTS inspection_evidence_sources jsonb NOT NULL DEFAULT '[]'::jsonb
  CHECK (jsonb_typeof(inspection_evidence_sources) = 'array' AND jsonb_array_length(inspection_evidence_sources) <= 100);

CREATE OR REPLACE FUNCTION public.get_legal_catalog_context()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  -- Only the authenticated Worker can access the recipe context. It returns a reduced DTO.
  IF current_user NOT IN ('service_role', 'postgres') THEN RAISE EXCEPTION 'Server access required'; END IF;
  RETURN jsonb_build_object(
    'fetchedAt', statement_timestamp(),
    'products', COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.sku) FROM (
      SELECT sku,prefix,category,description,image_url,gender,plating_type,production_type,is_component,skip_casting,
        weight_g,secondary_weight_g,invoice_total_weight_g,active_price,selling_price,selling_price_manual_override,legal_only
      FROM public.products
    ) p), '[]'::jsonb),
    'variants', COALESCE((SELECT jsonb_agg(to_jsonb(v) ORDER BY v.product_sku,v.suffix) FROM (
      SELECT product_sku,suffix,description,active_price,selling_price,selling_price_manual_override FROM public.product_variants
    ) v), '[]'::jsonb),
    'recipes', COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.parent_sku,r.id) FROM (
      SELECT id,parent_sku,type,material_id,component_sku,quantity FROM public.recipes
    ) r), '[]'::jsonb),
    'materials', COALESCE((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id) FROM (
      SELECT id,name,unit_weight_g FROM public.materials
    ) m), '[]'::jsonb)
  );
END $$;
REVOKE ALL ON FUNCTION public.get_legal_catalog_context() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_legal_catalog_context() TO service_role;

CREATE OR REPLACE FUNCTION public.get_inspection_snapshot(
  p_environment text DEFAULT 'prod', p_date_from date DEFAULT NULL, p_date_to date DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_documents jsonb; v_ids uuid[]; v_tables jsonb; v_status jsonb := '{}'::jsonb;
  v_rows jsonb; v_entry record; v_partial boolean := false;
BEGIN
  IF current_user NOT IN ('service_role','postgres') AND NOT public.is_legal_module_admin() THEN
    RAISE EXCEPTION 'Approved administrator required';
  END IF;
  IF p_environment NOT IN ('prod','dev') OR p_environment IS NULL THEN RAISE EXCEPTION 'Invalid environment'; END IF;
  IF p_date_from > p_date_to THEN RAISE EXCEPTION 'Invalid period'; END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY d.issue_date,d.id),'[]'::jsonb), COALESCE(array_agg(d.id),ARRAY[]::uuid[])
  INTO v_documents,v_ids FROM public.legal_documents d
  WHERE (d.environment=p_environment OR d.environment IS NULL)
    AND (p_date_from IS NULL OR d.issue_date>=p_date_from) AND (p_date_to IS NULL OR d.issue_date<=p_date_to);
  v_tables := jsonb_build_object('legal_documents',v_documents);
  v_status := jsonb_build_object('legal_documents','complete');
  -- Static projections: additions to business tables never silently expand the registry.
  FOR v_entry IN SELECT * FROM jsonb_each_text(jsonb_build_object(
    'legal_document_lines', 'SELECT * FROM public.legal_document_lines WHERE document_id=ANY($1)',
    'legal_payments', 'SELECT * FROM public.legal_payments WHERE document_id=ANY($1)',
    'proforma_documents', 'SELECT * FROM public.proforma_documents',
    'proforma_document_lines', 'SELECT * FROM public.proforma_document_lines',
    'legal_transmissions', 'SELECT * FROM public.legal_transmissions WHERE document_id=ANY($1) OR (document_id IS NULL AND environment=$2)',
    'legal_delivery_events', 'SELECT * FROM public.legal_delivery_events WHERE document_id=ANY($1)',
    'legal_audit_log', 'SELECT * FROM public.legal_audit_log WHERE document_id=ANY($1) OR document_id IS NULL',
    'legal_sync_runs', 'SELECT * FROM public.legal_sync_runs WHERE environment=$2',
    'legal_settings', 'SELECT to_jsonb(s)-''inspection_exit_pin_hash'' AS settings FROM public.legal_settings s',
    'products', 'SELECT sku,category,description,prefix,legal_only FROM public.products',
    'product_variants', 'SELECT product_sku,suffix,description FROM public.product_variants',
    'inventory_balances', 'SELECT product_sku,variant_suffix,size_info,warehouse_id,on_hand,reserved,updated_at FROM public.inventory_balances',
    'inventory_events', 'SELECT * FROM public.inventory_events',
    'warehouses', 'SELECT id,name,address FROM public.warehouses',
    'customers', 'SELECT id,full_name,vat_number,address FROM public.customers',
    'consignments', 'SELECT id,code,customer_id,source_order_id,source_warehouse_id,status,handed_off_at,created_at,updated_at FROM public.consignments',
    'consignment_lines', 'SELECT id,consignment_id,product_sku,variant_suffix,size_info,quantity,sold_quantity,returned_quantity,pending_quantity,created_at,updated_at FROM public.consignment_lines',
    'consignment_settlements', 'SELECT id,consignment_line_id,quantity,legal_document_id,status,sold_at FROM public.consignment_settlements',
    'consignment_returns', 'SELECT id,consignment_line_id,quantity,status,destination_warehouse_id,received_at FROM public.consignment_returns',
    'repair_intakes', 'SELECT id,code,customer_id,status,created_at,updated_at FROM public.repair_intakes',
    'repair_items', 'SELECT id,code,intake_id,customer_id,product_sku,variant_suffix,description,origin_type,status,created_at,updated_at,delivered_at FROM public.repair_items',
    'repair_charges', 'SELECT id,repair_item_id,legal_document_id,charge_type,payment_status FROM public.repair_charges'
  )) LOOP
    BEGIN
      EXECUTE 'SELECT COALESCE(jsonb_agg(to_jsonb(t)),''[]''::jsonb) FROM (' || v_entry.value || ') t'
        INTO v_rows USING v_ids,p_environment;
      v_tables := v_tables || jsonb_build_object(v_entry.key,v_rows);
      v_status := v_status || jsonb_build_object(v_entry.key,'complete');
    EXCEPTION WHEN undefined_table OR undefined_column THEN
      -- Auxiliary modules may not yet be installed; never label them empty/complete.
      v_partial := true;
      v_status := v_status || jsonb_build_object(v_entry.key,'unavailable');
    END;
  END LOOP;
  IF octet_length(v_tables::text)>24*1024*1024 THEN
    RAISE EXCEPTION 'Snapshot too large; narrow the document period';
  END IF;
  RETURN jsonb_build_object('version',1,'fetchedAt',statement_timestamp(),
    'filters',jsonb_build_object('environment',p_environment,'dateFrom',COALESCE(p_date_from::text,''),'dateTo',COALESCE(p_date_to::text,'')),
    'tables',v_tables,'tableStatus',v_status,
    'status',jsonb_build_object('source','database','state',CASE WHEN v_partial THEN 'partial' ELSE 'complete' END,
      'fetchedAt',statement_timestamp(),'period',jsonb_build_object('from',p_date_from,'to',p_date_to),
      'error',CASE WHEN v_partial THEN 'Ορισμένες ενότητες δεν είναι διαθέσιμες. Ελέγξτε την εγκατάσταση και τις εξωτερικές πηγές.' ELSE NULL END));
END $$;
REVOKE ALL ON FUNCTION public.get_inspection_snapshot(text,date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_inspection_snapshot(text,date,date) TO authenticated,service_role;
COMMENT ON FUNCTION public.get_inspection_snapshot(text,date,date) IS
  'Read-only, administrator-authorized, single MVCC snapshot. Inventory is internal and is not a verified physical count.';

CREATE OR REPLACE FUNCTION public.get_inspection_support()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF current_user NOT IN ('service_role','postgres') THEN RAISE EXCEPTION 'Server access required'; END IF;
  RETURN jsonb_build_object(
    'legal_settings',COALESCE((SELECT jsonb_agg(to_jsonb(s)-'inspection_exit_pin_hash') FROM public.legal_settings s),'[]'::jsonb),
    'customers',COALESCE((SELECT jsonb_agg(to_jsonb(c)) FROM (
      SELECT id,full_name,vat_number,address,phone,email,profession,tax_office,customer_code,vat_rate,
        vat_exemption_category,vat_exemption_legal_note,created_at FROM public.customers
    ) c),'[]'::jsonb),
    'orders',COALESCE((SELECT jsonb_agg(to_jsonb(o)) FROM (
      SELECT id,customer_id,customer_name,status,created_at,is_archived,vat_rate,discount_percent,total_price,
        (SELECT COALESCE(jsonb_agg(jsonb_build_object('sku',i->'sku','variant_suffix',i->'variant_suffix','quantity',i->'quantity','price_at_order',i->'price_at_order','price_override',i->'price_override','size_info',i->'size_info','cord_color',i->'cord_color','enamel_color',i->'enamel_color','line_id',i->'line_id','notes',i->'notes','warehouse_id',i->'warehouse_id','fulfillment_mode',i->'fulfillment_mode')),'[]'::jsonb) FROM jsonb_array_elements(COALESCE(items,'[]'::jsonb)) i) AS items
      FROM public.orders
    ) o),'[]'::jsonb),
    'order_shipments',COALESCE((SELECT jsonb_agg(to_jsonb(s)) FROM public.order_shipments s),'[]'::jsonb),
    'order_shipment_items',COALESCE((SELECT jsonb_agg(to_jsonb(s)) FROM public.order_shipment_items s),'[]'::jsonb),
    'profiles',COALESCE((SELECT jsonb_agg(to_jsonb(p)) FROM (
      SELECT id,full_name FROM public.profiles WHERE role='seller'
    ) p),'[]'::jsonb)
  );
END $$;
REVOKE ALL ON FUNCTION public.get_inspection_support() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_inspection_support() TO service_role;

-- Fiscal customer editor: server-only whitelist, bypassing locked ERP reads.
CREATE OR REPLACE FUNCTION public.save_inspection_customer(p_customer jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v_id uuid := COALESCE(NULLIF(p_customer->>'id','')::uuid,gen_random_uuid()); v_payload jsonb; v_result jsonb;
BEGIN
  IF current_user NOT IN ('service_role','postgres') THEN RAISE EXCEPTION 'Server access required'; END IF;
  SELECT to_jsonb(c) INTO v_payload FROM public.customers c WHERE id=v_id;
  v_payload := COALESCE(v_payload,'{}'::jsonb) || p_customer;
  IF btrim(COALESCE(v_payload->>'full_name',''))='' THEN RAISE EXCEPTION 'Customer name required'; END IF;
  IF v_payload->>'full_name'='Λιανική' THEN RAISE EXCEPTION 'Wholesale customer required'; END IF;
  IF COALESCE((v_payload->>'vat_rate')::numeric,0.24)=0 AND NULLIF(v_payload->>'vat_exemption_category','') IS NULL THEN RAISE EXCEPTION 'VAT exemption reason required'; END IF;
  INSERT INTO public.customers(id,full_name,vat_number,address,phone,email,profession,tax_office,customer_code,vat_rate,vat_exemption_category,vat_exemption_legal_note)
  VALUES(v_id,v_payload->>'full_name',v_payload->>'vat_number',v_payload->>'address',v_payload->>'phone',v_payload->>'email',v_payload->>'profession',v_payload->>'tax_office',v_payload->>'customer_code',COALESCE((v_payload->>'vat_rate')::numeric,0.24),(v_payload->>'vat_exemption_category')::integer,v_payload->>'vat_exemption_legal_note')
  ON CONFLICT(id) DO UPDATE SET full_name=EXCLUDED.full_name,vat_number=EXCLUDED.vat_number,address=EXCLUDED.address,phone=EXCLUDED.phone,email=EXCLUDED.email,profession=EXCLUDED.profession,tax_office=EXCLUDED.tax_office,customer_code=EXCLUDED.customer_code,vat_rate=EXCLUDED.vat_rate,vat_exemption_category=EXCLUDED.vat_exemption_category,vat_exemption_legal_note=EXCLUDED.vat_exemption_legal_note;
  SELECT to_jsonb(c) INTO v_result FROM (SELECT id,full_name,vat_number,address,phone,email,profession,tax_office,customer_code,vat_rate,vat_exemption_category,vat_exemption_legal_note,created_at FROM public.customers WHERE id=v_id) c;
  RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.save_inspection_customer(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_inspection_customer(jsonb) TO service_role;
