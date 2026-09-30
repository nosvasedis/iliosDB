-- The legacy global_settings policy also permits general/public settings writes.
-- Protect only the new pricing policy without broadening or rewriting that policy.
CREATE OR REPLACE FUNCTION public.guard_pricing_policy_edits_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE changed boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    changed := NEW.pricing_rules <> '{}'::jsonb;
  ELSE
    changed := NEW.pricing_rules IS DISTINCT FROM OLD.pricing_rules;
  END IF;
  IF changed AND current_user NOT IN ('postgres','service_role') THEN
    IF auth.uid() IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin' AND is_approved
    ) THEN RAISE EXCEPTION 'Μόνο ο διαχειριστής μπορεί να αλλάξει τις παραμέτρους τιμολόγησης.'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER guard_pricing_policy_edits_v1 BEFORE INSERT OR UPDATE OF pricing_rules ON public.global_settings
FOR EACH ROW EXECUTE FUNCTION public.guard_pricing_policy_edits_v1();
REVOKE ALL ON FUNCTION public.guard_pricing_policy_edits_v1() FROM PUBLIC, anon, authenticated;
