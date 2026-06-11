CREATE OR REPLACE FUNCTION public.is_legal_module_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
      AND COALESCE(p.is_approved, false) = true
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_legal_module_admin() TO authenticated;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'legal_settings',
    'legal_numbering_sequences',
    'legal_carriers',
    'legal_documents',
    'legal_document_lines',
    'legal_payments',
    'legal_transmissions',
    'legal_delivery_events',
    'legal_audit_log'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_authenticated_all', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_admin_all', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.is_legal_module_admin()) WITH CHECK (public.is_legal_module_admin())',
      table_name || '_admin_all',
      table_name
    );
  END LOOP;
END $$;
