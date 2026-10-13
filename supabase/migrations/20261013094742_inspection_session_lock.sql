-- Bind the lock to the signed Supabase session_id, not to editable user metadata.
CREATE SCHEMA IF NOT EXISTS private;
CREATE TABLE IF NOT EXISTS private.inspection_sessions (
  session_id text PRIMARY KEY,
  user_id uuid NOT NULL,
  active boolean NOT NULL DEFAULT true,
  failed_attempts integer NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  entered_at timestamptz NOT NULL DEFAULT now(),
  exited_at timestamptz
);
ALTER TABLE private.inspection_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.inspection_sessions FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS private.inspection_local_vaults (
  id uuid PRIMARY KEY, user_id uuid NOT NULL, recovery_key text NOT NULL CHECK (recovery_key ~ '^[A-Za-z0-9+/]{43}=$'), created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.inspection_local_vaults ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.inspection_local_vaults FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.inspection_session_active()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS(SELECT 1 FROM private.inspection_sessions s
    WHERE s.session_id = NULLIF(current_setting('request.jwt.claims',true),'')::jsonb->>'session_id'
      AND s.user_id=auth.uid() AND s.active);
$$;
REVOKE ALL ON FUNCTION private.inspection_session_active() FROM PUBLIC,anon;
GRANT USAGE ON SCHEMA private TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.inspection_session_active() TO authenticated,service_role;

-- Legal RLS must continue to work without allowing full profile reads on a locked JWT.
CREATE OR REPLACE FUNCTION private.inspection_approved_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='admin' AND COALESCE(is_approved,false));
$$;
REVOKE ALL ON FUNCTION private.inspection_approved_admin() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.inspection_approved_admin() TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.is_legal_module_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT private.inspection_approved_admin(); $$;

CREATE OR REPLACE FUNCTION public.inspection_session_state()
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT private.inspection_session_active();
$$;
REVOKE ALL ON FUNCTION public.inspection_session_state() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.inspection_session_state() TO authenticated,service_role;

CREATE OR REPLACE FUNCTION private.inspection_current_profile()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT to_jsonb(p) FROM (SELECT id,email,full_name,role,is_approved FROM public.profiles WHERE id=auth.uid()) p;
$$;
REVOKE ALL ON FUNCTION private.inspection_current_profile() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.inspection_current_profile() TO authenticated;
CREATE OR REPLACE FUNCTION public.inspection_current_profile()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT private.inspection_current_profile(); $$;
REVOKE ALL ON FUNCTION public.inspection_current_profile() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.inspection_current_profile() TO authenticated;

CREATE OR REPLACE FUNCTION private.enter_inspection_session(p_vault_id uuid DEFAULT NULL,p_vault_key text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_session text := NULLIF(current_setting('request.jwt.claims',true),'')::jsonb->>'session_id';
BEGIN
  IF NOT public.is_legal_module_admin() OR auth.uid() IS NULL THEN RAISE EXCEPTION 'Approved administrator required'; END IF;
  IF v_session IS NULL OR v_session !~ '^[0-9a-fA-F-]{36}$' THEN RAISE EXCEPTION 'Valid authenticated session required'; END IF;
  IF NOT public.has_inspection_exit_pin() THEN RAISE EXCEPTION 'Configure an exit PIN first'; END IF;
  IF p_vault_id IS NOT NULL THEN
    IF p_vault_key IS NULL THEN RAISE EXCEPTION 'Recovery key required'; END IF;
    INSERT INTO private.inspection_local_vaults(id,user_id,recovery_key) VALUES(p_vault_id,auth.uid(),p_vault_key);
  ELSIF p_vault_key IS NOT NULL THEN RAISE EXCEPTION 'Vault identity required'; END IF;
  INSERT INTO private.inspection_sessions(session_id,user_id,active) VALUES(v_session,auth.uid(),true)
  ON CONFLICT(session_id) DO UPDATE SET active=true,failed_attempts=0,last_attempt_at=null,entered_at=now(),exited_at=null
    WHERE NOT inspection_sessions.active;
  RETURN true;
END $$;
CREATE OR REPLACE FUNCTION private.exit_inspection_session(p_pin text,p_vault_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_session text := NULLIF(current_setting('request.jwt.claims',true),'')::jsonb->>'session_id'; v_lock private.inspection_sessions%ROWTYPE; v_key text;
BEGIN
  IF NOT public.is_legal_module_admin() OR auth.uid() IS NULL THEN RAISE EXCEPTION 'Approved administrator required'; END IF;
  SELECT * INTO v_lock FROM private.inspection_sessions WHERE session_id=v_session AND user_id=auth.uid() FOR UPDATE;
  IF NOT FOUND OR NOT v_lock.active THEN RETURN jsonb_build_object('unlocked',false); END IF;
  IF v_lock.failed_attempts>=5 AND v_lock.last_attempt_at>now()-interval '1 minute' THEN RETURN jsonb_build_object('unlocked',false); END IF;
  IF NOT COALESCE(public.verify_inspection_exit_pin(p_pin),false) THEN
    UPDATE private.inspection_sessions SET failed_attempts=CASE WHEN last_attempt_at>now()-interval '1 minute' THEN failed_attempts+1 ELSE 1 END,last_attempt_at=now() WHERE session_id=v_session;
    RETURN jsonb_build_object('unlocked',false);
  END IF;
  IF p_vault_id IS NOT NULL THEN
    SELECT recovery_key INTO v_key FROM private.inspection_local_vaults WHERE id=p_vault_id AND user_id=auth.uid();
    IF v_key IS NULL THEN RAISE EXCEPTION 'Local recovery key unavailable; session remains locked'; END IF;
  END IF;
  UPDATE private.inspection_sessions SET active=false,failed_attempts=0,exited_at=now() WHERE session_id=v_session;
  RETURN jsonb_build_object('unlocked',true,'vaultKey',v_key);
END $$;
REVOKE ALL ON FUNCTION private.enter_inspection_session(uuid,text),private.exit_inspection_session(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.enter_inspection_session(uuid,text),private.exit_inspection_session(text,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.enter_inspection_session(p_vault_id uuid DEFAULT NULL,p_vault_key text DEFAULT NULL)
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.enter_inspection_session(p_vault_id,p_vault_key); $$;
CREATE OR REPLACE FUNCTION public.exit_inspection_session(p_pin text,p_vault_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.exit_inspection_session(p_pin,p_vault_id); $$;
REVOKE ALL ON FUNCTION public.enter_inspection_session(uuid,text),public.exit_inspection_session(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.enter_inspection_session(uuid,text),public.exit_inspection_session(text,uuid) TO authenticated;

-- Enforce at the gateway, including RPCs that might otherwise bypass table RLS.
CREATE OR REPLACE FUNCTION public.enforce_inspection_request()
RETURNS void LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE v_path text := current_setting('request.path',true); v_method text := current_setting('request.method',true);
BEGIN
  IF current_user IN ('anon','service_role','postgres') THEN RETURN; END IF;
  IF NOT private.inspection_session_active() THEN RETURN; END IF;
  IF v_path IN ('/rpc/inspection_session_state','/rpc/inspection_current_profile','/rpc/has_inspection_exit_pin','/rpc/get_inspection_snapshot') AND v_method IN ('GET','HEAD','POST') THEN RETURN; END IF;
  IF v_path IN ('/rpc/enter_inspection_session','/rpc/exit_inspection_session','/rpc/save_sbz_draft') AND v_method='POST' THEN RETURN; END IF;
  IF v_path IN ('/legal_documents','/legal_document_lines','/legal_external_item_aliases','/legal_payments','/legal_transmissions','/legal_delivery_events','/legal_audit_log','/legal_sync_runs','/legal_carriers','/legal_numbering_sequences','/proforma_documents','/proforma_document_lines')
    AND v_method IN ('GET','HEAD') THEN RETURN; END IF;
  IF v_path IN ('/legal_documents','/legal_document_lines','/legal_external_item_aliases','/legal_audit_log','/proforma_documents','/proforma_document_lines')
    AND v_method IN ('POST','PATCH') THEN RETURN; END IF;
  IF v_path='/proforma_document_lines' AND v_method='DELETE' THEN RETURN; END IF;
  RAISE SQLSTATE 'PT403' USING MESSAGE='Η συνεδρία είναι κλειδωμένη στη λειτουργία ελέγχου. Απαιτείται έξοδος με PIN.';
END $$;
REVOKE ALL ON FUNCTION public.enforce_inspection_request() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enforce_inspection_request() TO anon,authenticated,service_role;

-- Also protect direct table reads (e.g. Realtime/GraphQL), preserving all existing policies.
DO $$ DECLARE v_table text; BEGIN
  FOR v_table IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT IN (
    'profiles','legal_documents','legal_document_lines','legal_external_item_aliases','legal_payments','legal_transmissions',
    'legal_delivery_events','legal_audit_log','legal_sync_runs','legal_carriers','legal_numbering_sequences','proforma_documents','proforma_document_lines'
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS inspection_locked_session_read_guard ON public.%I',v_table);
    EXECUTE format('CREATE POLICY inspection_locked_session_read_guard ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING (NOT (SELECT private.inspection_session_active()))',v_table);
  END LOOP;
  DROP POLICY IF EXISTS inspection_locked_session_read_guard ON public.profiles;
  CREATE POLICY inspection_locked_session_read_guard ON public.profiles AS RESTRICTIVE FOR SELECT TO authenticated
    USING (NOT (SELECT private.inspection_session_active()));
END $$;

-- Do not replace an unrelated pre-request hook silently.
DO $$ DECLARE v_hook text; BEGIN
  SELECT split_part(config,'=',2) INTO v_hook FROM pg_roles r CROSS JOIN LATERAL unnest(r.rolconfig) config
    WHERE r.rolname='authenticator' AND config LIKE 'pgrst.db_pre_request=%';
  IF v_hook IS NOT NULL AND v_hook NOT IN ('','public.enforce_inspection_request') THEN
    RAISE EXCEPTION 'Existing PostgREST pre-request hook must be chained explicitly before installing the inspection lock';
  END IF;
END $$;
ALTER ROLE authenticator SET pgrst.db_pre_request='public.enforce_inspection_request';
NOTIFY pgrst,'reload config';
