-- Flexible ERP warehouse presentation with protected operational roles.
-- Names and user-facing categories are editable independently from the stable
-- Central/Showroom roles used by inventory allocation and legacy projections.

ALTER TABLE public.warehouses
  ADD COLUMN IF NOT EXISTS category text
    NOT NULL DEFAULT 'Αποθηκευτικός χώρος',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz
    NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_by uuid;

UPDATE public.warehouses
SET category = CASE
  WHEN id = '00000000-0000-0000-0000-000000000001'::uuid
    THEN 'Κεντρική λειτουργία'
  WHEN id = '00000000-0000-0000-0000-000000000002'::uuid
    THEN 'Δειγματολόγιο πλασιέ'
  WHEN type = 'Showroom'
    THEN 'Δειγματολόγιο πλασιέ'
  WHEN type = 'Store'
    THEN 'Αποθηκευτικός χώρος'
  ELSE 'Λοιπή θέση αποθέματος'
END
WHERE category = 'Αποθηκευτικός χώρος';

ALTER TABLE public.warehouses
  DROP CONSTRAINT IF EXISTS warehouses_name_valid_check,
  DROP CONSTRAINT IF EXISTS warehouses_category_valid_check,
  DROP CONSTRAINT IF EXISTS warehouses_address_valid_check,
  DROP CONSTRAINT IF EXISTS warehouses_type_valid_check,
  DROP CONSTRAINT IF EXISTS warehouses_system_role_check;

ALTER TABLE public.warehouses
  ADD CONSTRAINT warehouses_name_valid_check
    CHECK (
      btrim(name) <> ''
      AND char_length(btrim(name)) <= 120
    ) NOT VALID,
  ADD CONSTRAINT warehouses_category_valid_check
    CHECK (
      btrim(category) <> ''
      AND char_length(btrim(category)) <= 80
    ) NOT VALID,
  ADD CONSTRAINT warehouses_address_valid_check
    CHECK (
      address IS NULL
      OR char_length(btrim(address)) <= 250
    ) NOT VALID,
  ADD CONSTRAINT warehouses_type_valid_check
    CHECK (type = ANY (ARRAY['Central', 'Showroom', 'Store', 'Other'])) NOT VALID,
  ADD CONSTRAINT warehouses_system_role_check
    CHECK (
      CASE
        WHEN id = '00000000-0000-0000-0000-000000000001'::uuid
          THEN is_system IS TRUE AND type = 'Central'
        WHEN id = '00000000-0000-0000-0000-000000000002'::uuid
          THEN is_system IS TRUE AND type = 'Showroom'
        ELSE
          is_system IS NOT TRUE AND type <> 'Central'
      END
    ) NOT VALID;

ALTER TABLE public.warehouses
  VALIDATE CONSTRAINT warehouses_name_valid_check;
ALTER TABLE public.warehouses
  VALIDATE CONSTRAINT warehouses_category_valid_check;
ALTER TABLE public.warehouses
  VALIDATE CONSTRAINT warehouses_address_valid_check;
ALTER TABLE public.warehouses
  VALIDATE CONSTRAINT warehouses_type_valid_check;
ALTER TABLE public.warehouses
  VALIDATE CONSTRAINT warehouses_system_role_check;

CREATE UNIQUE INDEX IF NOT EXISTS warehouses_name_normalized_unique_idx
  ON public.warehouses (lower(btrim(name)));

CREATE OR REPLACE FUNCTION private.normalize_inventory_warehouse()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  NEW.name := btrim(NEW.name);
  NEW.category := btrim(NEW.category);
  NEW.address := NULLIF(btrim(COALESCE(NEW.address, '')), '');
  NEW.updated_at := now();
  NEW.updated_by := (SELECT auth.uid());

  IF TG_OP = 'UPDATE' THEN
    NEW.id := OLD.id;
    NEW.is_system := OLD.is_system;
    IF OLD.is_system IS TRUE THEN
      NEW.type := OLD.type;
    END IF;
  ELSE
    NEW.is_system := false;
    IF NEW.type = 'Central' THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'Η αποθήκη δεν δημιουργήθηκε. Η προεπιλεγμένη Κεντρική Αποθήκη υπάρχει ήδη και είναι μοναδική. Δεν πραγματοποιήθηκε καμία μεταβολή. Επιλέξτε Δειγματολόγιο ή άλλη λειτουργία αποθέματος.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.normalize_inventory_warehouse()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.normalize_inventory_warehouse()
  TO service_role;

DROP TRIGGER IF EXISTS warehouses_normalize_before_write
  ON public.warehouses;
CREATE TRIGGER warehouses_normalize_before_write
BEFORE INSERT OR UPDATE ON public.warehouses
FOR EACH ROW
EXECUTE FUNCTION private.normalize_inventory_warehouse();

-- Explicit grants are paired with the existing role-aware RLS policies.
-- Anonymous access is unnecessary; authenticated writes remain administrator-
-- only through warehouses_*_admin policies.
REVOKE ALL ON TABLE public.warehouses FROM anon;
REVOKE ALL ON TABLE public.warehouses FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.warehouses
  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.warehouses
  TO service_role;

COMMENT ON COLUMN public.warehouses.type IS
  'Stable operational role used by allocation and compatibility logic. The system Central and primary Showroom roles are protected.';
COMMENT ON COLUMN public.warehouses.category IS
  'Editable Greek ERP category or responsible party shown to operators, independent from the operational role.';
