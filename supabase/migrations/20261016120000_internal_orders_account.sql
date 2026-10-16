-- «Εσωτερική παραγγελία»: system account for orders we place for our own stock.
-- Fixed UUID (like Λιανική = ...0003). Those orders still go through production, but the app
-- excludes them from revenue/analytics, seller commissions, customer KPIs, maps and invoicing.
insert into public.customers (id, full_name, vat_number, profession, tax_office, phone, notes, vat_rate)
values ('00000000-0000-0000-0000-000000000004', 'Εσωτερική παραγγελία', null, null, null, '', '', 0.24)
on conflict (id) do update set full_name = excluded.full_name;

-- Never a taxpayer: no tax identity can be stored on it.
alter table public.customers drop constraint if exists customers_internal_has_no_tax_identity;
alter table public.customers
  add constraint customers_internal_has_no_tax_identity check (
    id <> '00000000-0000-0000-0000-000000000004'::uuid
    or (
      nullif(btrim(vat_number), '') is null
      and nullif(btrim(profession), '') is null
      and nullif(btrim(tax_office), '') is null
    )
  );

comment on column public.customers.id is
  'Customer id. System accounts: 00000000-0000-0000-0000-000000000003 = Λιανική, 00000000-0000-0000-0000-000000000004 = Εσωτερική παραγγελία.';
