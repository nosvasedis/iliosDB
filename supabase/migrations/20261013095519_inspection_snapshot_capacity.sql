-- Preserve complete transmission payloads: the live archive exceeds the initial 24 MiB cap.
-- The Worker streams this one MVCC snapshot without buffering it in memory.
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
  IF octet_length(v_tables::text)>64*1024*1024 THEN
    RAISE EXCEPTION 'Snapshot too large; narrow the document period';
  END IF;
  RETURN jsonb_build_object('version',1,'fetchedAt',statement_timestamp(),
    'filters',jsonb_build_object('environment',p_environment,'dateFrom',COALESCE(p_date_from::text,''),'dateTo',COALESCE(p_date_to::text,'')),
    'tables',v_tables,'tableStatus',v_status,
    'status',jsonb_build_object('source','database','state',CASE WHEN v_partial THEN 'partial' ELSE 'complete' END,
      'fetchedAt',statement_timestamp(),'period',jsonb_build_object('from',p_date_from,'to',p_date_to),
      'error',CASE WHEN v_partial THEN 'Ορισμένες ενότητες δεν είναι διαθέσιμες. Ελέγξτε την εγκατάσταση και τις εξωτερικές πηγές.' ELSE NULL END));
END $$;
NOTIFY pgrst,'reload schema';
