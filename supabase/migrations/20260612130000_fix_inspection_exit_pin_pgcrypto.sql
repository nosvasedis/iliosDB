CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.set_inspection_exit_pin(pin text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_legal_module_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF pin IS NULL OR length(trim(pin)) < 4 THEN
    RAISE EXCEPTION 'PIN must be at least 4 characters';
  END IF;

  UPDATE public.legal_settings
  SET inspection_exit_pin_hash = extensions.crypt(trim(pin), extensions.gen_salt('bf')),
      updated_at = now()
  WHERE id = '00000000-0000-0000-0000-000000000091';
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_inspection_exit_pin(pin text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  stored_hash text;
BEGIN
  IF NOT public.is_legal_module_admin() THEN
    RETURN false;
  END IF;

  SELECT inspection_exit_pin_hash
  INTO stored_hash
  FROM public.legal_settings
  WHERE id = '00000000-0000-0000-0000-000000000091';

  IF stored_hash IS NULL OR pin IS NULL OR length(trim(pin)) = 0 THEN
    RETURN false;
  END IF;

  RETURN stored_hash = extensions.crypt(trim(pin), stored_hash);
END;
$$;
