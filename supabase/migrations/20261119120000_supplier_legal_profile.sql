-- Partners («Προμηθευτές & Συνεργάτες») can be the counterpart of legal documents
-- (e.g. delivery notes to the foundry). Their tax details for myDATA/SBZ
-- (ΔΟΥ, επάγγελμα, structured έδρα, CounterpartCode) are kept here:
--   { code, profession, tax_office, country, address: {street, number, postal_code, city}, verified_at }

alter table public.suppliers
  add column if not exists legal_profile jsonb;

alter table public.suppliers
  drop constraint if exists suppliers_legal_profile_is_object;
alter table public.suppliers
  add constraint suppliers_legal_profile_is_object check (legal_profile is null or jsonb_typeof(legal_profile) = 'object');
