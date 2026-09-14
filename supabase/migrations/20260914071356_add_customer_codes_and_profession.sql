-- Stable ERP customer identity and fiscal metadata used by printed/provider invoices.
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS customer_code text,
  ADD COLUMN IF NOT EXISTS profession text,
  ADD COLUMN IF NOT EXISTS tax_office text;

CREATE SEQUENCE IF NOT EXISTS private.customer_code_seq AS bigint START WITH 1;

UPDATE public.customers SET customer_code = '0000'
WHERE id = '00000000-0000-0000-0000-000000000003'::uuid AND customer_code IS NULL;

WITH numbered AS (
  SELECT id, row_number() OVER (ORDER BY created_at NULLS LAST, id) AS number
  FROM public.customers
  WHERE id <> '00000000-0000-0000-0000-000000000003'::uuid AND customer_code IS NULL
)
UPDATE public.customers AS customer
SET customer_code = lpad(numbered.number::text, 4, '0')
FROM numbered WHERE customer.id = numbered.id;

SELECT setval(
  'private.customer_code_seq',
  GREATEST(COALESCE((SELECT max(customer_code::bigint) FROM public.customers
    WHERE customer_code ~ '^[0-9]+$' AND customer_code <> '0000'), 0), 1),
  EXISTS (SELECT 1 FROM public.customers
    WHERE customer_code ~ '^[0-9]+$' AND customer_code <> '0000')
);

CREATE OR REPLACE FUNCTION private.assign_customer_code()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.id = '00000000-0000-0000-0000-000000000003'::uuid THEN
    NEW.customer_code := '0000';
  ELSIF TG_OP = 'UPDATE' AND OLD.customer_code IS NOT NULL THEN
    NEW.customer_code := OLD.customer_code;
  ELSIF TG_OP = 'INSERT' THEN
    NEW.customer_code := lpad(nextval('private.customer_code_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assign_customer_code_before_write ON public.customers;
CREATE TRIGGER assign_customer_code_before_write
BEFORE INSERT OR UPDATE OF customer_code ON public.customers
FOR EACH ROW EXECUTE FUNCTION private.assign_customer_code();

ALTER TABLE public.customers ALTER COLUMN customer_code SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS customers_customer_code_key ON public.customers (customer_code);
ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_customer_code_format_check;
ALTER TABLE public.customers ADD CONSTRAINT customers_customer_code_format_check
  CHECK (customer_code ~ '^[0-9]{4,}$');

COMMENT ON COLUMN public.customers.customer_code IS
  'Immutable ERP customer code. 0000 is reserved for the collective retail system record.';
COMMENT ON COLUMN public.customers.profession IS
  'Customer main activity/profession, preferably populated from the official AADE registry.';
COMMENT ON COLUMN public.customers.tax_office IS
  'Customer tax office (DOY), preferably populated from the official AADE registry.';

REVOKE ALL ON SEQUENCE private.customer_code_seq FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.assign_customer_code() FROM PUBLIC, anon, authenticated;
