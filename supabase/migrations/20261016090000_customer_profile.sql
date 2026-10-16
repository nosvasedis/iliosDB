-- Commercial customer profile, kept as JSON on the customer row (same approach as branches):
-- backups/restore, RLS and offline sync need no changes.
--   {socials:{instagram,facebook,tiktok,website,eshop,google_maps,pinterest,youtube},
--    viber, whatsapp, contacts:[{id,name,role,phone,email,notes}],
--    shop_type, positioning, clientele, season:{mode,open_month,close_month}, opening_hours,
--    payment_method, credit_days, credit_limit, tags:[text],
--    exclusivity:{enabled,radius_km,scopes:[{kind,key}],until,notes}}
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS profile jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_profile_check;
ALTER TABLE public.customers ADD CONSTRAINT customers_profile_check CHECK (jsonb_typeof(profile) = 'object');

COMMENT ON COLUMN public.customers.profile IS
  'Commercial profile (social media, contact persons, shop profile, terms, tags, exclusivity agreement). JSON object.';

NOTIFY pgrst, 'reload schema';
