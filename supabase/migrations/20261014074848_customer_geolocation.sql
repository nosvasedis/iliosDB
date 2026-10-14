-- Optional manual map position for customers (Πελάτες map pins).
-- NULL means the app derives the pin from the address postal code / town.
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision;

ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_geolocation_check;
ALTER TABLE public.customers ADD CONSTRAINT customers_geolocation_check CHECK (
  (latitude IS NULL AND longitude IS NULL)
  OR (latitude BETWEEN 34 AND 42 AND longitude BETWEEN 19 AND 30)
);

COMMENT ON COLUMN public.customers.latitude IS
  'Manually placed map latitude (WGS84). NULL = derived from address.';
COMMENT ON COLUMN public.customers.longitude IS
  'Manually placed map longitude (WGS84). NULL = derived from address.';
