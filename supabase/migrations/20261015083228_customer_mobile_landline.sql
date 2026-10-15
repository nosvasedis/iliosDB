-- Keep phone as a compatibility field for existing orders, printers and clients.
-- Backfill does not change the original phone text. Ambiguous numbers remain visible.
ALTER TABLE public.customers
  ADD COLUMN mobile_phone text,
  ADD COLUMN landline_phone text,
  ADD COLUMN phone_unclassified text;

CREATE OR REPLACE FUNCTION private.sync_customer_phones()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE part text; digits text; local_number text; explicit_greek boolean;
  split_changed boolean := false;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    split_changed := NEW.mobile_phone IS DISTINCT FROM OLD.mobile_phone
      OR NEW.landline_phone IS DISTINCT FROM OLD.landline_phone
      OR NEW.phone_unclassified IS DISTINCT FROM OLD.phone_unclassified;
  ELSE
    split_changed := NEW.mobile_phone IS NOT NULL OR NEW.landline_phone IS NOT NULL
      OR NEW.phone_unclassified IS NOT NULL;
  END IF;
  IF split_changed THEN
    NEW.phone := pg_catalog.concat_ws(' / ', NULLIF(NEW.mobile_phone,''), NULLIF(NEW.landline_phone,''), NULLIF(NEW.phone_unclassified,''));
  ELSIF TG_OP = 'INSERT' OR NEW.phone IS DISTINCT FROM OLD.phone
    OR (NEW.mobile_phone IS NULL AND NEW.landline_phone IS NULL AND NEW.phone_unclassified IS NULL) THEN
    NEW.mobile_phone := ''; NEW.landline_phone := ''; NEW.phone_unclassified := '';
    FOREACH part IN ARRAY pg_catalog.regexp_split_to_array(COALESCE(NEW.phone,''), E'[,;/\\n]+') LOOP
      part := pg_catalog.btrim(part, E' \t\r\n');
      IF part = '' THEN CONTINUE; END IF;
      digits := pg_catalog.regexp_replace(pg_catalog.regexp_replace(part, '\([^)]*\)', '', 'g'), '\D', '', 'g');
      explicit_greek := digits ~ '^(0030|30)(69[0-9]{8}|2[0-9]{9})$';
      local_number := CASE WHEN explicit_greek THEN pg_catalog.right(digits,10) ELSE digits END;
      IF (COALESCE(NEW.country,'GR') IN ('GR','EL','GRC') OR explicit_greek) AND local_number ~ '^69[0-9]{8}$' THEN
        NEW.mobile_phone := pg_catalog.concat_ws(' / ',NULLIF(NEW.mobile_phone,''),part);
      ELSIF (COALESCE(NEW.country,'GR') IN ('GR','EL','GRC') OR explicit_greek) AND local_number ~ '^2[0-9]{9}$' THEN
        NEW.landline_phone := pg_catalog.concat_ws(' / ',NULLIF(NEW.landline_phone,''),part);
      ELSE
        NEW.phone_unclassified := pg_catalog.concat_ws(' / ',NULLIF(NEW.phone_unclassified,''),part);
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.sync_customer_phones() FROM PUBLIC;
CREATE TRIGGER sync_customer_phones_before_write
BEFORE INSERT OR UPDATE ON public.customers
FOR EACH ROW EXECUTE FUNCTION private.sync_customer_phones();

DO $$
DECLARE before_hash text; after_hash text;
BEGIN
  LOCK TABLE public.customers IN SHARE ROW EXCLUSIVE MODE;
  SELECT md5(string_agg(id::text || COALESCE(phone,'<NULL>'),'|' ORDER BY id)) INTO before_hash FROM public.customers;
  UPDATE public.customers SET phone = phone;
  SELECT md5(string_agg(id::text || COALESCE(phone,'<NULL>'),'|' ORDER BY id)) INTO after_hash FROM public.customers;
  IF before_hash IS DISTINCT FROM after_hash THEN RAISE EXCEPTION 'Phone backfill changed original data'; END IF;
END $$;
COMMENT ON COLUMN public.customers.mobile_phone IS 'Κινητό πελάτη. May contain multiple numbers and contact labels.';
COMMENT ON COLUMN public.customers.landline_phone IS 'Σταθερό πελάτη. May contain multiple numbers and contact labels.';
COMMENT ON COLUMN public.customers.phone_unclassified IS 'Preserved legacy numbers requiring manual classification; never discard silently.';
NOTIFY pgrst, 'reload schema';

-- Preserve the same server-only access and whitelist in inspection mode.
CREATE OR REPLACE FUNCTION public.get_inspection_support()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF current_user NOT IN ('service_role','postgres') THEN RAISE EXCEPTION 'Server access required'; END IF;
  RETURN jsonb_build_object(
    'legal_settings',COALESCE((SELECT jsonb_agg(to_jsonb(s)-'inspection_exit_pin_hash') FROM public.legal_settings s),'[]'::jsonb),
    'customers',COALESCE((SELECT jsonb_agg(to_jsonb(c)) FROM (
      SELECT id,full_name,vat_number,address,phone,mobile_phone,landline_phone,phone_unclassified,email,profession,tax_office,customer_code,vat_rate,
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

-- Preserve the same server-only access and whitelist in inspection mode.
CREATE OR REPLACE FUNCTION public.save_inspection_customer(p_customer jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v_id uuid := COALESCE(NULLIF(p_customer->>'id','')::uuid,gen_random_uuid()); v_payload jsonb; v_result jsonb;
BEGIN
  IF current_user NOT IN ('service_role','postgres') THEN RAISE EXCEPTION 'Server access required'; END IF;
  SELECT to_jsonb(c) INTO v_payload FROM public.customers c WHERE id=v_id;
  v_payload := COALESCE(v_payload,'{}'::jsonb) || p_customer;
  -- Legacy callers only send phone; let the trigger reclassify their replacement.
  IF p_customer ? 'phone' AND NOT (p_customer ?| ARRAY['mobile_phone','landline_phone','phone_unclassified']) THEN
    v_payload := v_payload - 'mobile_phone' - 'landline_phone' - 'phone_unclassified';
  END IF;
  IF btrim(COALESCE(v_payload->>'full_name',''))='' THEN RAISE EXCEPTION 'Customer name required'; END IF;
  IF v_payload->>'full_name'='Λιανική' THEN RAISE EXCEPTION 'Wholesale customer required'; END IF;
  IF COALESCE((v_payload->>'vat_rate')::numeric,0.24)=0 AND NULLIF(v_payload->>'vat_exemption_category','') IS NULL THEN RAISE EXCEPTION 'VAT exemption reason required'; END IF;
  INSERT INTO public.customers(id,full_name,vat_number,address,phone,mobile_phone,landline_phone,phone_unclassified,email,profession,tax_office,customer_code,vat_rate,vat_exemption_category,vat_exemption_legal_note)
  VALUES(v_id,v_payload->>'full_name',v_payload->>'vat_number',v_payload->>'address',v_payload->>'phone',v_payload->>'mobile_phone',v_payload->>'landline_phone',v_payload->>'phone_unclassified',v_payload->>'email',v_payload->>'profession',v_payload->>'tax_office',v_payload->>'customer_code',COALESCE((v_payload->>'vat_rate')::numeric,0.24),(v_payload->>'vat_exemption_category')::integer,v_payload->>'vat_exemption_legal_note')
  ON CONFLICT(id) DO UPDATE SET full_name=EXCLUDED.full_name,vat_number=EXCLUDED.vat_number,address=EXCLUDED.address,phone=EXCLUDED.phone,mobile_phone=EXCLUDED.mobile_phone,landline_phone=EXCLUDED.landline_phone,phone_unclassified=EXCLUDED.phone_unclassified,email=EXCLUDED.email,profession=EXCLUDED.profession,tax_office=EXCLUDED.tax_office,customer_code=EXCLUDED.customer_code,vat_rate=EXCLUDED.vat_rate,vat_exemption_category=EXCLUDED.vat_exemption_category,vat_exemption_legal_note=EXCLUDED.vat_exemption_legal_note;
  SELECT to_jsonb(c) INTO v_result FROM (SELECT id,full_name,vat_number,address,phone,mobile_phone,landline_phone,phone_unclassified,email,profession,tax_office,customer_code,vat_rate,vat_exemption_category,vat_exemption_legal_note,created_at FROM public.customers WHERE id=v_id) c;
  RETURN v_result;
END $$;
