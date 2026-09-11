-- SBZ: server-owned fiscal operations. Existing archive rows are never retransmitted.
CREATE SCHEMA IF NOT EXISTS private;
CREATE OR REPLACE FUNCTION private.sbz_restore_allowed() RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
  SELECT current_user='postgres' AND COALESCE(current_setting('ilios.sbz_restore',true),'')='on'
$$;
GRANT USAGE ON SCHEMA private TO service_role;
GRANT EXECUTE ON FUNCTION private.sbz_restore_allowed() TO service_role;
ALTER TABLE public.legal_settings ADD COLUMN sbz_production_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.legal_settings ADD COLUMN sbz_activation_checks jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.legal_documents ADD COLUMN provider text NOT NULL DEFAULT 'legacy' CHECK (provider IN ('legacy','sbz'));
ALTER TABLE public.legal_documents ADD COLUMN environment text CHECK (environment IN ('dev','prod'));
ALTER TABLE public.legal_documents ADD COLUMN provider_state text NOT NULL DEFAULT 'idle' CHECK (provider_state IN ('idle','sending','unknown','accepted','rejected'));
ALTER TABLE public.legal_documents ADD COLUMN provider_operation_id uuid;
ALTER TABLE public.legal_documents ADD COLUMN provider_invoice_url text;
ALTER TABLE public.legal_documents ADD COLUMN provider_mydata_url text;
ALTER TABLE public.legal_documents ADD COLUMN provider_units text;
ALTER TABLE public.legal_documents ADD COLUMN provider_attachment_state text NOT NULL DEFAULT 'idle' CHECK (provider_attachment_state IN ('idle','sending','unknown','accepted','rejected'));
ALTER TABLE public.legal_documents ADD COLUMN credited_document_id uuid REFERENCES public.legal_documents(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public.legal_documents ADD COLUMN correlated_mark text;
ALTER TABLE public.legal_document_lines ADD COLUMN credited_line_id uuid REFERENCES public.legal_document_lines(id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX legal_credit_parent_idx ON public.legal_documents(credited_document_id);
CREATE UNIQUE INDEX legal_credit_unique_line ON public.legal_document_lines(document_id,credited_line_id) WHERE credited_line_id IS NOT NULL;
CREATE INDEX legal_credit_line_idx ON public.legal_document_lines(credited_line_id);
ALTER TABLE public.legal_transmissions DROP CONSTRAINT legal_transmissions_status_check;
ALTER TABLE public.legal_transmissions ADD CONSTRAINT legal_transmissions_status_check CHECK (status IN ('success','failed','pending','unknown'));

-- Only unambiguous transmission evidence can assign a legacy environment.
WITH retrieved_marks AS MATERIALIZED (
  SELECT DISTINCT t.environment,m[1] mark FROM public.legal_transmissions t
  CROSS JOIN LATERAL regexp_matches(t.response_payload,'(?:&lt;|<)(?:mark|invoiceMark)(?:&gt;|>)([0-9]+)(?:&lt;|<)/(?:mark|invoiceMark)(?:&gt;|>)','gi') m
  WHERE t.action='request_transmitted_docs' AND t.status='success'
)
UPDATE public.legal_documents d SET environment = x.environment
FROM (SELECT document_id, min(environment) environment FROM (
      SELECT document_id, environment FROM public.legal_transmissions
      UNION ALL SELECT d.id,r.environment FROM public.legal_documents d JOIN public.legal_sync_runs r ON r.id=d.sync_run_id
      WHERE d.source_kind='aade_sync' AND r.status='success'
      UNION ALL SELECT d.id,m.environment FROM public.legal_documents d JOIN retrieved_marks m ON m.mark=d.aade_mark WHERE d.source_kind='aade_sync'
      ) evidence GROUP BY document_id HAVING count(DISTINCT environment) = 1) x
WHERE d.id = x.document_id;
ALTER TABLE public.legal_documents ALTER COLUMN provider SET DEFAULT 'sbz';
DROP INDEX IF EXISTS public.idx_legal_documents_aade_mark_unique;
CREATE UNIQUE INDEX idx_legal_documents_aade_mark_unique ON public.legal_documents(environment,aade_mark) WHERE aade_mark IS NOT NULL AND aade_mark <> '';
ALTER TABLE public.legal_numbering_sequences ADD COLUMN environment text NOT NULL DEFAULT 'prod' CHECK (environment IN ('dev','prod'));
DROP INDEX IF EXISTS public.idx_legal_documents_number_namespace_unique;
DROP INDEX IF EXISTS public.idx_legal_numbering_sequences_normalized_unique;
DROP INDEX IF EXISTS public.idx_legal_numbering_sequences_one_active_kind;
CREATE UNIQUE INDEX idx_legal_documents_number_namespace_unique ON public.legal_documents
 (COALESCE(environment,'unresolved'), (issuer->>'vat_number'), (COALESCE(issuer->>'branch','0')), aade_document_type, public.normalize_legal_series(series), ((btrim(aa)::numeric)::text))
 WHERE aa ~ '^[0-9]{1,18}$';
CREATE UNIQUE INDEX idx_legal_numbering_sequences_normalized_unique ON public.legal_numbering_sequences(environment, aade_document_type, public.normalize_legal_series(series));
CREATE UNIQUE INDEX idx_legal_numbering_sequences_one_active_kind ON public.legal_numbering_sequences(environment,document_kind,aade_document_type) WHERE is_active;
INSERT INTO public.legal_numbering_sequences(document_kind,aade_document_type,series,next_aa,is_active,environment)
SELECT document_kind,aade_document_type,series,1,is_active,'dev' FROM public.legal_numbering_sequences WHERE environment='prod';
INSERT INTO public.legal_numbering_sequences(document_kind,aade_document_type,series,next_aa,is_active,environment)
SELECT 'credit','5.1','Π',1,true,e FROM unnest(ARRAY['dev','prod']) e
WHERE NOT EXISTS (SELECT 1 FROM public.legal_numbering_sequences WHERE aade_document_type='5.1' AND environment=e AND is_active);

-- Disable legacy numbering RPCs: the Worker owns the entire submission transaction.
REVOKE EXECUTE ON FUNCTION public.prepare_legal_document_submission(uuid) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.allocate_legal_document_number(uuid) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_legal_numbering_alignment(text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.guard_sbz_document() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v_service boolean := current_user IN ('service_role','postgres');
BEGIN
  IF current_user='postgres' AND private.sbz_restore_allowed() THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END IF;
  IF TG_OP='DELETE' THEN
    IF OLD.aa IS NOT NULL OR OLD.status IN ('submitted','issued','cancelled') THEN
      RAISE EXCEPTION 'Το δεσμευμένο ή εκδομένο παραστατικό διατηρείται στο αρχείο.';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP='INSERT' THEN
    IF NOT v_service AND (NEW.status <> 'draft' OR NEW.aa IS NOT NULL OR NEW.aade_mark IS NOT NULL OR NEW.provider_state <> 'idle' OR NEW.provider <> 'sbz') THEN
      RAISE EXCEPTION 'Η έκδοση ολοκληρώνεται αποκλειστικά από τον πάροχο.';
    END IF;
    RETURN NEW;
  END IF;
  IF NOT v_service AND ROW(NEW.status,NEW.series,NEW.aa,NEW.provider,NEW.provider_state,NEW.provider_operation_id,NEW.aade_mark,NEW.aade_uid,NEW.authentication_code,NEW.cancellation_mark,NEW.provider_invoice_url,NEW.provider_mydata_url,NEW.provider_units,NEW.provider_attachment_state,NEW.raw_xml,NEW.qr_url,NEW.submitted_at,NEW.locked_at,NEW.cancelled_at)
    IS DISTINCT FROM ROW(OLD.status,OLD.series,OLD.aa,OLD.provider,OLD.provider_state,OLD.provider_operation_id,OLD.aade_mark,OLD.aade_uid,OLD.authentication_code,OLD.cancellation_mark,OLD.provider_invoice_url,OLD.provider_mydata_url,OLD.provider_units,OLD.provider_attachment_state,OLD.raw_xml,OLD.qr_url,OLD.submitted_at,OLD.locked_at,OLD.cancelled_at) THEN
    RAISE EXCEPTION 'Τα στοιχεία διαβίβασης ενημερώνονται αποκλειστικά από τον πάροχο.';
  END IF;
  IF OLD.aa IS NOT NULL AND NEW.environment IS DISTINCT FROM OLD.environment AND NOT (v_service AND OLD.provider='legacy' AND OLD.environment IS NULL) THEN
    RAISE EXCEPTION 'Το περιβάλλον εκδομένου παραστατικού δεν αλλάζει.';
  END IF;
  IF OLD.status IN ('submitted','issued','cancelled') OR OLD.provider_state IN ('sending','unknown','accepted') THEN
    IF ROW(NEW.issuer,NEW.counterpart,NEW.delivery,NEW.document_kind,NEW.aade_document_type,NEW.issue_date,NEW.payment_method_code,NEW.currency,NEW.vat_rate,NEW.vat_exemption_category,NEW.revenue_classification,NEW.totals,NEW.credited_document_id,NEW.correlated_mark)
      IS DISTINCT FROM ROW(OLD.issuer,OLD.counterpart,OLD.delivery,OLD.document_kind,OLD.aade_document_type,OLD.issue_date,OLD.payment_method_code,OLD.currency,OLD.vat_rate,OLD.vat_exemption_category,OLD.revenue_classification,OLD.totals,OLD.credited_document_id,OLD.correlated_mark) THEN
      RAISE EXCEPTION 'Το φορολογικό περιεχόμενο είναι κλειδωμένο. Εκδώστε πιστωτικό για διόρθωση.';
    END IF;
  END IF;
  IF NEW.status='cancelled' AND OLD.status <> 'cancelled' AND NEW.document_kind <> 'delivery_note' AND NOT (v_service AND OLD.source_kind='aade_sync' AND OLD.status='draft') THEN
    RAISE EXCEPTION 'Τα τιμολόγια διορθώνονται μόνο με πιστωτικό.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_sbz_document BEFORE INSERT OR UPDATE OR DELETE ON public.legal_documents FOR EACH ROW EXECUTE FUNCTION public.guard_sbz_document();

CREATE OR REPLACE FUNCTION public.guard_sbz_line() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE d public.legal_documents;
BEGIN
  IF current_user='postgres' AND private.sbz_restore_allowed() THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END IF;
  IF TG_OP='UPDATE' AND NEW.document_id <> OLD.document_id THEN RAISE EXCEPTION 'Η γραμμή δεν μπορεί να μεταφερθεί σε άλλο παραστατικό.'; END IF;
  SELECT * INTO d FROM public.legal_documents WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.document_id ELSE NEW.document_id END FOR UPDATE;
  IF d.status IN ('submitted','issued','cancelled') OR d.provider_state IN ('sending','unknown','accepted') THEN RAISE EXCEPTION 'Οι γραμμές του παραστατικού είναι κλειδωμένες.'; END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER guard_sbz_line BEFORE INSERT OR UPDATE OR DELETE ON public.legal_document_lines FOR EACH ROW EXECUTE FUNCTION public.guard_sbz_line();

-- Audit history is append-only for clients.
REVOKE INSERT,UPDATE,DELETE ON public.legal_transmissions FROM authenticated,anon;
REVOKE UPDATE,DELETE ON public.legal_audit_log FROM authenticated,anon;

CREATE OR REPLACE FUNCTION public.claim_sbz_operation(p_document_id uuid,p_action text,p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE d public.legal_documents; s public.legal_settings; seq public.legal_numbering_sequences;
  original public.legal_documents; l record; used_qty numeric; used_net numeric; used_vat numeric; op uuid:=gen_random_uuid(); lines jsonb;
BEGIN
  IF current_user NOT IN ('service_role','postgres') THEN RAISE EXCEPTION 'Server access required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=p_actor AND role='admin' AND is_approved) THEN RAISE EXCEPTION 'Δεν έχετε δικαίωμα έκδοσης.'; END IF;
  SELECT * INTO d FROM public.legal_documents WHERE id=p_document_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Το παραστατικό δεν βρέθηκε.'; END IF;
  SELECT * INTO s FROM public.legal_settings ORDER BY updated_at DESC LIMIT 1;
  IF p_action NOT IN ('send','cancel','attach') THEN RAISE EXCEPTION 'Μη υποστηριζόμενη ενέργεια.'; END IF;
  IF d.provider_state IN ('sending','unknown') THEN RAISE EXCEPTION 'Ελέγχεται ήδη ενέργεια στον πάροχο. Μην επαναλάβετε την έκδοση.'; END IF;
  IF p_action='send' THEN
    IF d.status NOT IN ('draft','failed') THEN RAISE EXCEPTION 'Το παραστατικό δεν μπορεί να εκδοθεί ξανά.'; END IF;
    IF d.aa IS NOT NULL AND d.provider='legacy' THEN RAISE EXCEPTION 'Η παλιά εκκρεμής έκδοση χρειάζεται συμφωνία πριν από τη μετάβαση.'; END IF;
    IF d.environment IS NULL THEN d.environment:=s.environment; END IF;
    IF d.environment='prod' AND NOT s.sbz_production_enabled THEN RAISE EXCEPTION 'Δεν έχει ενεργοποιηθεί η παραγωγή SBZ.'; END IF;
    IF EXISTS (SELECT 1 FROM public.legal_documents WHERE aa IS NOT NULL AND environment IS NULL) AND d.environment='prod' THEN RAISE EXCEPTION 'Ελέγξτε πρώτα τα παλιά παραστατικά χωρίς επιβεβαιωμένο περιβάλλον.'; END IF;
    IF d.credited_document_id IS NOT NULL THEN
      SELECT * INTO original FROM public.legal_documents WHERE id=d.credited_document_id FOR UPDATE;
      IF original.status <> 'issued' OR original.document_kind NOT IN ('invoice','invoice_delivery') OR original.environment IS DISTINCT FROM d.environment
        OR d.aade_document_type <> '5.1' OR d.correlated_mark IS DISTINCT FROM original.aade_mark OR d.counterpart IS DISTINCT FROM original.counterpart
        OR d.issuer IS DISTINCT FROM original.issuer OR d.currency <> original.currency OR d.vat_exemption_category IS DISTINCT FROM original.vat_exemption_category THEN
        RAISE EXCEPTION 'Το πιστωτικό δεν αντιστοιχεί στα στοιχεία του αρχικού τιμολογίου.';
      END IF;
      FOR l IN SELECT c.*,o.quantity original_quantity,o.net_value original_net,o.vat_amount original_vat,o.unit_price original_price,o.vat_category original_category,
          o.income_classification original_class,o.document_id original_document
        FROM public.legal_document_lines c LEFT JOIN public.legal_document_lines o ON o.id=c.credited_line_id WHERE c.document_id=d.id LOOP
        SELECT COALESCE(sum(c.quantity),0),COALESCE(sum(c.net_value),0),COALESCE(sum(c.vat_amount),0) INTO used_qty,used_net,used_vat
        FROM public.legal_document_lines c JOIN public.legal_documents x ON x.id=c.document_id
        WHERE c.credited_line_id=l.credited_line_id AND x.id<>d.id AND (x.status IN ('submitted','issued') OR x.provider_state IN ('sending','unknown'));
        IF used_qty+l.quantity>l.original_quantity OR used_net+l.net_value>l.original_net OR used_vat+l.vat_amount>l.original_vat THEN RAISE EXCEPTION 'Η ποσότητα ή αξία έχει ήδη πιστωθεί ή δεσμευτεί από άλλο πιστωτικό.'; END IF;
        IF l.original_document IS DISTINCT FROM original.id OR l.quantity<=0 OR l.original_quantity<=0 OR l.unit_price <> l.original_price OR l.vat_category <> l.original_category
          OR l.income_classification->>'classification_category' IS DISTINCT FROM l.original_class->>'classification_category'
          OR l.income_classification->>'classification_type' IS DISTINCT FROM l.original_class->>'classification_type'
          OR abs(l.net_value-(round(l.original_net*(used_qty+l.quantity)/l.original_quantity,2)-used_net))>0.001
          OR abs(l.vat_amount-(round(l.original_vat*(used_qty+l.quantity)/l.original_quantity,2)-used_vat))>0.001 THEN RAISE EXCEPTION 'Το υπόλοιπο ή οι γραμμές πίστωσης άλλαξαν. Δημιουργήστε ξανά το προσχέδιο από το αρχικό τιμολόγιο.'; END IF;
      END LOOP;
    ELSIF d.aade_document_type='5.1' THEN RAISE EXCEPTION 'Επιλέξτε αρχικό τιμολόγιο για το συσχετιζόμενο πιστωτικό.';
    END IF;
    PERFORM 1 FROM public.legal_document_lines WHERE document_id=d.id FOR UPDATE;
    SELECT jsonb_agg(to_jsonb(x) ORDER BY line_number) INTO lines FROM public.legal_document_lines x WHERE document_id=d.id;
    IF lines IS NULL THEN RAISE EXCEPTION 'Το παραστατικό δεν έχει γραμμές.'; END IF;
    IF d.aa IS NULL THEN
      SELECT * INTO seq FROM public.legal_numbering_sequences WHERE environment=d.environment AND document_kind=d.document_kind AND aade_document_type=d.aade_document_type AND is_active FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Δεν υπάρχει ενεργή σειρά για το παραστατικό.'; END IF;
      SELECT greatest(seq.next_aa,COALESCE(max(aa::bigint),0)+1) INTO seq.next_aa FROM public.legal_documents
        WHERE environment=d.environment AND aade_document_type=d.aade_document_type AND public.normalize_legal_series(series)=public.normalize_legal_series(seq.series) AND aa ~ '^[0-9]{1,18}$';
      UPDATE public.legal_numbering_sequences SET next_aa=seq.next_aa+1,updated_at=now() WHERE id=seq.id;
      d.series:=seq.series; d.aa:=seq.next_aa::text;
    END IF;
    UPDATE public.legal_documents SET environment=d.environment,provider='sbz',series=d.series,aa=d.aa,status='submitted',provider_state='sending',provider_operation_id=op,submitted_at=now(),last_error=NULL WHERE id=d.id RETURNING * INTO d;
  ELSE
    IF d.provider <> 'sbz' OR d.status <> 'issued' OR d.aade_mark IS NULL OR d.environment IS NULL THEN RAISE EXCEPTION 'Απαιτείται εκδομένο παραστατικό SBZ.'; END IF;
    IF p_action='cancel' AND d.document_kind <> 'delivery_note' THEN RAISE EXCEPTION 'Τα τιμολόγια διορθώνονται με πιστωτικό.'; END IF;
    IF p_action='attach' AND d.provider_attachment_state IN ('sending','unknown','accepted') THEN RAISE EXCEPTION 'Υπάρχει ήδη αρχείο ή εκκρεμής αποστολή αρχείου.'; END IF;
    UPDATE public.legal_documents SET provider_state='sending',provider_operation_id=op,provider_attachment_state=CASE WHEN p_action='attach' THEN 'sending' ELSE provider_attachment_state END WHERE id=d.id RETURNING * INTO d;
  END IF;
  INSERT INTO public.legal_transmissions(id,document_id,action,endpoint,environment,status) VALUES(op,d.id,'sbz_'||p_action,p_action,d.environment,'pending');
  INSERT INTO public.legal_audit_log(document_id,action,user_name,details) VALUES(d.id,'sbz_'||p_action||'_started',p_actor::text,jsonb_build_object('operation_id',op));
  RETURN jsonb_build_object('document',to_jsonb(d),'lines',COALESCE(lines,'[]'::jsonb),'operationId',op);
END $$;
REVOKE ALL ON FUNCTION public.claim_sbz_operation(uuid,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_sbz_operation(uuid,text,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.finish_sbz_operation(p_operation_id uuid,p_outcome text,p_result jsonb,p_response text,p_error text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE t public.legal_transmissions; d public.legal_documents;
BEGIN
  IF current_user NOT IN ('service_role','postgres') THEN RAISE EXCEPTION 'Server access required'; END IF;
  IF p_outcome NOT IN ('accepted','rejected','unknown') THEN RAISE EXCEPTION 'Invalid outcome'; END IF;
  SELECT * INTO t FROM public.legal_transmissions WHERE id=p_operation_id FOR UPDATE;
  SELECT * INTO d FROM public.legal_documents WHERE id=t.document_id FOR UPDATE;
  IF d.provider_operation_id IS DISTINCT FROM p_operation_id THEN RAISE EXCEPTION 'Stale operation'; END IF;
  IF t.status='success' THEN RETURN to_jsonb(d); END IF;
  IF p_outcome='accepted' AND t.action='sbz_send' AND (COALESCE(p_result->>'invoiceMark','') !~ '^[0-9]+$' OR COALESCE(p_result->>'invoiceUid','')='' OR COALESCE(p_result->>'authenticationCode','')='') THEN RAISE EXCEPTION 'Incomplete provider acceptance'; END IF;
  IF p_outcome='accepted' AND t.action='sbz_cancel' AND COALESCE(p_result->>'cancellationMark','') !~ '^[0-9]+$' THEN RAISE EXCEPTION 'Incomplete cancellation'; END IF;
  UPDATE public.legal_transmissions SET status=CASE p_outcome WHEN 'accepted' THEN 'success' WHEN 'rejected' THEN 'failed' ELSE 'unknown' END,response_payload=p_response,error_message=p_error WHERE id=t.id;
  UPDATE public.legal_documents SET
    provider_state=CASE WHEN t.action='sbz_attach' AND p_outcome<>'unknown' THEN 'accepted' ELSE p_outcome END,
    provider_attachment_state=CASE WHEN t.action='sbz_attach' THEN p_outcome ELSE provider_attachment_state END,
    status=CASE WHEN t.action='sbz_send' THEN CASE p_outcome WHEN 'accepted' THEN 'issued' WHEN 'rejected' THEN 'failed' ELSE 'submitted' END
      WHEN t.action='sbz_cancel' AND p_outcome='accepted' THEN 'cancelled' ELSE status END,
    aade_mark=CASE WHEN t.action='sbz_send' AND p_outcome='accepted' THEN p_result->>'invoiceMark' ELSE aade_mark END,
    aade_uid=CASE WHEN t.action='sbz_send' AND p_outcome='accepted' THEN p_result->>'invoiceUid' ELSE aade_uid END,
    authentication_code=CASE WHEN t.action='sbz_send' AND p_outcome='accepted' THEN p_result->>'authenticationCode' ELSE authentication_code END,
    provider_invoice_url=COALESCE(NULLIF(p_result->>'invoiceUrl',''),provider_invoice_url),
    provider_mydata_url=COALESCE(NULLIF(p_result->>'mydataUrl',''),provider_mydata_url),
    qr_url=COALESCE(NULLIF(p_result->>'invoiceUrl',''),qr_url),
    provider_units=COALESCE(NULLIF(p_result->>'units',''),provider_units),
    cancellation_mark=CASE WHEN t.action='sbz_cancel' AND p_outcome='accepted' THEN p_result->>'cancellationMark' ELSE cancellation_mark END,
    cancelled_at=CASE WHEN t.action='sbz_cancel' AND p_outcome='accepted' THEN now() ELSE cancelled_at END,
    locked_at=CASE WHEN p_outcome='accepted' THEN COALESCE(locked_at,now()) ELSE locked_at END,
    last_error=p_error,updated_at=now()
    WHERE id=d.id RETURNING * INTO d;
  INSERT INTO public.legal_audit_log(document_id,action,details) VALUES(d.id,t.action||'_'||p_outcome,jsonb_build_object('operation_id',t.id));
  RETURN to_jsonb(d);
END $$;
REVOKE ALL ON FUNCTION public.finish_sbz_operation(uuid,text,jsonb,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_sbz_operation(uuid,text,jsonb,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.import_sbz_document(p_document jsonb,p_actor uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE id_new uuid:=gen_random_uuid(); x jsonb; qty numeric;
BEGIN
  IF current_user NOT IN ('service_role','postgres') THEN RAISE EXCEPTION 'Server access required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended((p_document->>'environment')||':'||(p_document->>'mark'),0));
  SELECT id INTO id_new FROM public.legal_documents WHERE environment=p_document->>'environment' AND aade_mark=p_document->>'mark';
  IF FOUND THEN RETURN id_new; END IF;
  id_new:=gen_random_uuid();
  INSERT INTO public.legal_documents(id,source_kind,document_kind,aade_document_type,status,series,aa,issue_date,issuer,counterpart,totals,aade_mark,aade_uid,qr_url,raw_xml,environment,provider,provider_state,sync_run_id,synced_at)
  VALUES(id_new,'aade_sync',p_document->>'document_kind',p_document->>'invoiceType','draft',p_document->>'series',p_document->>'aa',(p_document->>'issueDate')::date,
    p_document->'issuer',p_document->'counterpart',p_document->'totals',p_document->>'mark',p_document->>'uid',p_document->>'qrUrl',p_document->>'rawXml',p_document->>'environment','sbz','idle',(p_document->>'sync_run_id')::uuid,now());
  FOR x IN SELECT value FROM jsonb_array_elements(p_document->'lines') LOOP
    qty:=COALESCE(NULLIF((x->>'quantity')::numeric,0),1);
    INSERT INTO public.legal_document_lines(document_id,line_number,sku,description,quantity,unit_price,net_value,vat_category,vat_amount,gross_value,measurement_unit,item_code,income_classification)
    VALUES(id_new,(x->>'lineNumber')::int,COALESCE(x->>'itemCode','SBZ'),COALESCE(x->>'itemDescription',x->>'itemCode','Είδος από το αρχείο παρόχου'),qty,
      round((x->>'netValue')::numeric/qty,2),(x->>'netValue')::numeric,(x->>'vatCategory')::int,(x->>'vatAmount')::numeric,(x->>'netValue')::numeric+(x->>'vatAmount')::numeric,
      COALESCE((x->>'measurementUnit')::int,1),x->>'itemCode',COALESCE(NULLIF(x->'incomeClassification','null'::jsonb),'{}'::jsonb));
  END LOOP;
  UPDATE public.legal_documents SET status=CASE WHEN NULLIF(p_document->>'cancelledByMark','') IS NULL THEN 'issued' ELSE 'cancelled' END,
    cancellation_mark=p_document->>'cancelledByMark',provider_state='accepted',locked_at=now() WHERE id=id_new;
  INSERT INTO public.legal_audit_log(document_id,action,user_name) VALUES(id_new,'sbz_imported',p_actor::text);
  RETURN id_new;
END $$;
REVOKE ALL ON FUNCTION public.import_sbz_document(jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.import_sbz_document(jsonb,uuid) TO service_role;

-- Draft header and lines must commit together; parent lock serializes saves and submission.
CREATE OR REPLACE FUNCTION public.save_sbz_draft(p_document jsonb,p_lines jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE d public.legal_documents; old_doc public.legal_documents; l public.legal_document_lines;
BEGIN
  IF NOT public.is_legal_module_admin() THEN RAISE EXCEPTION 'Απαιτείται διαχειριστής.'; END IF;
  d:=jsonb_populate_record(NULL::public.legal_documents,p_document);
  SELECT * INTO old_doc FROM public.legal_documents WHERE id=d.id FOR UPDATE;
  IF FOUND AND (old_doc.status NOT IN ('draft','failed') OR old_doc.provider_state IN ('sending','unknown','accepted')) THEN RAISE EXCEPTION 'Το παραστατικό είναι κλειδωμένο.'; END IF;
  IF old_doc.id IS NULL THEN
    INSERT INTO public.legal_documents(id,source_kind,document_kind,aade_document_type,status,issue_date,issuer,counterpart,delivery,payment_method_code,currency,vat_rate,vat_exemption_category,revenue_classification,totals,environment,credited_document_id,correlated_mark,order_id,shipment_id,created_by,counterpart_customer_id,order_link_mode,order_line_allocations,counterpart_seller_id,related_delivery_document_id,local_notes)
    VALUES(d.id,d.source_kind,d.document_kind,d.aade_document_type,'draft',d.issue_date,d.issuer,d.counterpart,d.delivery,d.payment_method_code,d.currency,d.vat_rate,d.vat_exemption_category,d.revenue_classification,d.totals,d.environment,d.credited_document_id,d.correlated_mark,d.order_id,d.shipment_id,d.created_by,d.counterpart_customer_id,COALESCE(d.order_link_mode,'whole'),COALESCE(d.order_line_allocations,'[]'::jsonb),d.counterpart_seller_id,d.related_delivery_document_id,d.local_notes);
  ELSE
    UPDATE public.legal_documents SET issue_date=d.issue_date,issuer=d.issuer,counterpart=d.counterpart,delivery=d.delivery,payment_method_code=d.payment_method_code,currency=d.currency,
      vat_rate=d.vat_rate,vat_exemption_category=d.vat_exemption_category,revenue_classification=d.revenue_classification,totals=d.totals,updated_at=now(),
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

CREATE OR REPLACE FUNCTION public.guard_sbz_activation() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF current_user NOT IN ('service_role','postgres') AND ROW(NEW.sbz_production_enabled,NEW.sbz_activation_checks) IS DISTINCT FROM ROW(OLD.sbz_production_enabled,OLD.sbz_activation_checks) THEN RAISE EXCEPTION 'Η ενεργοποίηση γίνεται από τη διαδικασία ελέγχου παρόχου.'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_sbz_activation BEFORE UPDATE ON public.legal_settings FOR EACH ROW EXECUTE FUNCTION public.guard_sbz_activation();

ALTER TABLE public.legal_documents ALTER CONSTRAINT legal_documents_related_delivery_document_id_fkey DEFERRABLE INITIALLY DEFERRED;

-- Preserve exact disaster recovery with a narrowly scoped service-only wrapper.
-- The flag alone cannot bypass protection: triggers additionally require the DB owner.
DO $$
DECLARE definition text; f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['public.enforce_legal_numbering_sequence_safety()','public.protect_legal_document_number_snapshot()','public.validate_legal_delivery_document_link()'] LOOP
    SELECT pg_get_functiondef(to_regprocedure(f)) INTO definition;
    definition:=replace(definition,chr(13),'');
    definition:=replace(definition,E'BEGIN\n',E'BEGIN\n  IF current_user=''postgres'' AND private.sbz_restore_allowed() THEN RETURN CASE WHEN TG_OP=''DELETE'' THEN OLD ELSE NEW END; END IF;\n');
    EXECUTE definition;
  END LOOP;
  IF to_regprocedure('public.backup_apply_restore(uuid)') IS NOT NULL THEN
    ALTER FUNCTION public.backup_apply_restore(uuid) SET SCHEMA private;
    ALTER FUNCTION private.backup_apply_restore(uuid) RENAME TO backup_apply_restore_pre_sbz;
    REVOKE ALL ON FUNCTION private.backup_apply_restore_pre_sbz(uuid) FROM PUBLIC,anon,authenticated,service_role;
  END IF;
END $$;
CREATE OR REPLACE FUNCTION public.backup_apply_restore(p_session uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
  PERFORM set_config('ilios.sbz_restore','on',true);
  result:=private.backup_apply_restore_pre_sbz(p_session);
  UPDATE public.legal_settings SET sbz_production_enabled=false;
  UPDATE public.legal_documents d SET provider='legacy',environment=NULL
    WHERE EXISTS (SELECT 1 FROM private.backup_restore_tables t CROSS JOIN LATERAL jsonb_array_elements(t.rows) r
      WHERE t.session_id=p_session AND t.table_name='legal_documents' AND r->>'id'=d.id::text AND NOT r ? 'provider');
  PERFORM set_config('ilios.sbz_restore','off',true);
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.backup_apply_restore(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.backup_apply_restore(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.guard_sbz_settings_insert() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF current_user NOT IN ('postgres','service_role') AND (NEW.sbz_production_enabled OR NEW.sbz_activation_checks <> '{}'::jsonb) THEN RAISE EXCEPTION 'Η ενεργοποίηση γίνεται από τη διαδικασία ελέγχου παρόχου.'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_sbz_settings_insert BEFORE INSERT ON public.legal_settings FOR EACH ROW EXECUTE FUNCTION public.guard_sbz_settings_insert();

-- A series belongs to one environment for its entire lifetime.
CREATE OR REPLACE FUNCTION public.guard_sbz_sequence_environment() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF current_user='postgres' AND private.sbz_restore_allowed() THEN RETURN NEW; END IF;
  IF NEW.environment IS DISTINCT FROM OLD.environment THEN RAISE EXCEPTION 'Δημιουργήστε νέα σειρά στο επιθυμητό περιβάλλον.'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_sbz_sequence_environment BEFORE UPDATE ON public.legal_numbering_sequences FOR EACH ROW EXECUTE FUNCTION public.guard_sbz_sequence_environment();
