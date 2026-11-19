-- User-managed system item codes for document lines (beside the built-in 000/001).
-- Kept on the single legal_settings row so they share its admin-only RLS, backups,
-- inspection snapshot and realtime wiring. Each item:
--   { code, description, unit: pcs|g|kg|l|m, default_price: number|null, is_active }
-- «g» lines are stored/transmitted to myDATA as measurementUnit 2 (Κιλά) in kg.

alter table public.legal_settings
  add column if not exists system_items jsonb not null default '[]'::jsonb;

alter table public.legal_settings
  drop constraint if exists legal_settings_system_items_is_array;
alter table public.legal_settings
  add constraint legal_settings_system_items_is_array check (jsonb_typeof(system_items) = 'array');

-- First codes for delivery notes to the foundry (χυτήριο). Only added if absent.
update public.legal_settings s
   set system_items = s.system_items || missing.items
  from (
    select coalesce(jsonb_agg(seed.item), '[]'::jsonb) as items
      from (values
        ('{"code":"ΑΦΟΣ","description":"Ασήμι 999°","unit":"g","default_price":null,"is_active":true}'::jsonb),
        ('{"code":"ΜΠΟΚ","description":"Κράμα μετάλλου ασήμι 925°","unit":"g","default_price":null,"is_active":true}'::jsonb),
        ('{"code":"ΚΕΡ","description":"Κέρινα ομοιώματα μέρους κοσμημάτων","unit":"pcs","default_price":null,"is_active":true}'::jsonb),
        ('{"code":"ΕΠΕΞ","description":"Ακατέργαστα κοσμήματα 925°","unit":"g","default_price":null,"is_active":true}'::jsonb)
      ) as seed(item)
     where not exists (
       select 1 from public.legal_settings existing,
              jsonb_array_elements(existing.system_items) as current_item
        where current_item->>'code' = seed.item->>'code'
     )
  ) missing
 where jsonb_array_length(missing.items) > 0;
