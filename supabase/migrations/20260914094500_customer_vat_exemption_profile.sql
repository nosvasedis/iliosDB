-- Persist customer-level VAT exemption settings and snapshot the mandatory legal note on documents.
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS vat_exemption_category integer,
  ADD COLUMN IF NOT EXISTS vat_exemption_legal_note text;

ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_vat_exemption_category_check;
ALTER TABLE public.customers ADD CONSTRAINT customers_vat_exemption_category_check
  CHECK (vat_exemption_category IS NULL OR vat_exemption_category BETWEEN 1 AND 31);

ALTER TABLE public.legal_documents
  ADD COLUMN IF NOT EXISTS vat_exemption_legal_note text;

ALTER TABLE public.proforma_documents
  ADD COLUMN IF NOT EXISTS vat_exemption_legal_note text;

COMMENT ON COLUMN public.customers.vat_exemption_category IS
  'Customer-specific myDATA vatExemptionCategory. It is intentionally not inferred from a 0% VAT rate.';
COMMENT ON COLUMN public.customers.vat_exemption_legal_note IS
  'Legal text to snapshot on documents, such as the mandatory Mount Athos exemption wording.';
COMMENT ON COLUMN public.legal_documents.vat_exemption_legal_note IS
  'Immutable-after-issuance legal exemption wording printed on the document.';

CREATE OR REPLACE FUNCTION public.save_sbz_draft(p_document jsonb,p_lines jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE d public.legal_documents; old_doc public.legal_documents; l public.legal_document_lines;
BEGIN
  IF NOT public.is_legal_module_admin() THEN RAISE EXCEPTION 'Απαιτείται διαχειριστής.'; END IF;
  d:=jsonb_populate_record(NULL::public.legal_documents,p_document);
  SELECT * INTO old_doc FROM public.legal_documents WHERE id=d.id FOR UPDATE;
  IF FOUND AND (old_doc.status NOT IN ('draft','failed') OR old_doc.provider_state IN ('sending','unknown','accepted')) THEN RAISE EXCEPTION 'Το παραστατικό είναι κλειδωμένο.'; END IF;
  IF old_doc.id IS NULL THEN
    INSERT INTO public.legal_documents(id,source_kind,document_kind,aade_document_type,status,issue_date,issuer,counterpart,delivery,payment_method_code,currency,vat_rate,vat_exemption_category,vat_exemption_legal_note,revenue_classification,totals,environment,credited_document_id,correlated_mark,order_id,shipment_id,created_by,counterpart_customer_id,order_link_mode,order_line_allocations,counterpart_seller_id,related_delivery_document_id,local_notes)
    VALUES(d.id,d.source_kind,d.document_kind,d.aade_document_type,'draft',d.issue_date,d.issuer,d.counterpart,d.delivery,d.payment_method_code,d.currency,d.vat_rate,d.vat_exemption_category,d.vat_exemption_legal_note,d.revenue_classification,d.totals,d.environment,d.credited_document_id,d.correlated_mark,d.order_id,d.shipment_id,d.created_by,d.counterpart_customer_id,COALESCE(d.order_link_mode,'whole'),COALESCE(d.order_line_allocations,'[]'::jsonb),d.counterpart_seller_id,d.related_delivery_document_id,d.local_notes);
  ELSE
    UPDATE public.legal_documents SET issue_date=d.issue_date,issuer=d.issuer,counterpart=d.counterpart,delivery=d.delivery,payment_method_code=d.payment_method_code,currency=d.currency,
      vat_rate=d.vat_rate,vat_exemption_category=d.vat_exemption_category,vat_exemption_legal_note=d.vat_exemption_legal_note,revenue_classification=d.revenue_classification,totals=d.totals,updated_at=now(),
      document_kind=d.document_kind,aade_document_type=d.aade_document_type,environment=COALESCE(d.environment,old_doc.environment),credited_document_id=d.credited_document_id,correlated_mark=d.correlated_mark WHERE id=d.id;
  END IF;
  DELETE FROM public.legal_document_lines WHERE document_id=d.id;
  FOR l IN SELECT * FROM jsonb_populate_recordset(NULL::public.legal_document_lines,p_lines) LOOP
    IF l.document_id <> d.id THEN RAISE EXCEPTION 'Μη έγκυρη γραμμή παραστατικού.'; END IF;
    INSERT INTO public.legal_document_lines SELECT l.*;
  END LOOP;
  INSERT INTO public.legal_audit_log(document_id,action,user_name) VALUES(d.id,'draft_saved',auth.uid()::text);
  RETURN d.id;
END $$;
REVOKE ALL ON FUNCTION public.save_sbz_draft(jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_sbz_draft(jsonb,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_legal_exemption_note() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF OLD.vat_exemption_legal_note IS DISTINCT FROM NEW.vat_exemption_legal_note
     AND (OLD.status IN ('submitted','issued','cancelled') OR OLD.provider_state IN ('sending','unknown','accepted')) THEN
    RAISE EXCEPTION 'Το φορολογικό περιεχόμενο είναι κλειδωμένο. Εκδώστε πιστωτικό για διόρθωση.';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS guard_legal_exemption_note ON public.legal_documents;
CREATE TRIGGER guard_legal_exemption_note
BEFORE UPDATE ON public.legal_documents FOR EACH ROW
EXECUTE FUNCTION public.guard_legal_exemption_note();
