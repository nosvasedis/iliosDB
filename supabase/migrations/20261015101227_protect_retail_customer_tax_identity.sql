-- This fixed UUID identifies a shared sales bucket, never a taxpayer.
-- Preserve the real customer, orders and all issued document snapshots.
update public.customers
set vat_number = null, profession = null, tax_office = null
where id = '00000000-0000-0000-0000-000000000003';

alter table public.customers
  add constraint customers_retail_has_no_tax_identity check (
    id <> '00000000-0000-0000-0000-000000000003'::uuid
    or (
      nullif(btrim(vat_number), '') is null
      and nullif(btrim(profession), '') is null
      and nullif(btrim(tax_office), '') is null
    )
  );
