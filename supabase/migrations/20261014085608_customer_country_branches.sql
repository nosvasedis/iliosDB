-- Overseas customers + shop locations (υποκαταστήματα).
-- * country: ISO-3166 alpha-2 of the fiscal seat (φορολογική έδρα). Drives myDATA counterpart country.
-- * address (existing) stays the fiscal seat used on Παραστατικά / Παραγγελίες.
-- * branches: the customer's real shops, JSON array of
--   {id, label, street, postal_code, city, country, phone, contact_person, notes, latitude, longitude, is_primary}.
--   Kept on the customer row so backups/restore, RLS and offline sync need no changes.
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT 'GR',
  ADD COLUMN IF NOT EXISTS branches jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_country_check;
ALTER TABLE public.customers ADD CONSTRAINT customers_country_check CHECK (country ~ '^[A-Z]{2}$');

ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_branches_check;
ALTER TABLE public.customers ADD CONSTRAINT customers_branches_check CHECK (jsonb_typeof(branches) = 'array');

-- Pins may now be anywhere in the world (overseas customers).
ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_geolocation_check;
ALTER TABLE public.customers ADD CONSTRAINT customers_geolocation_check CHECK (
  (latitude IS NULL AND longitude IS NULL)
  OR (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
);

COMMENT ON COLUMN public.customers.address IS
  'Φορολογική έδρα (as registered at AADE). Used as counterpart address on legal documents and orders.';
COMMENT ON COLUMN public.customers.country IS
  'ISO-3166 alpha-2 country of the fiscal seat. GR for domestic customers.';
COMMENT ON COLUMN public.customers.branches IS
  'Shop locations / υποκαταστήματα (JSON array). Used for the customers map, region filters and delivery addresses.';
