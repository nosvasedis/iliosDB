alter table public.products
  add column if not exists invoice_total_weight_g numeric null;

alter table public.materials
  add column if not exists unit_weight_g numeric null;

alter table public.products
  drop constraint if exists products_invoice_total_weight_g_positive_check;

alter table public.products
  add constraint products_invoice_total_weight_g_positive_check
  check (invoice_total_weight_g is null or invoice_total_weight_g > 0);

alter table public.materials
  drop constraint if exists materials_unit_weight_g_nonnegative_check;

alter table public.materials
  add constraint materials_unit_weight_g_nonnegative_check
  check (unit_weight_g is null or unit_weight_g >= 0);

comment on column public.products.invoice_total_weight_g is
  'Optional manual total jewelry weight in grams for legal-document descriptions. Null keeps live automatic calculation enabled.';

comment on column public.materials.unit_weight_g is
  'Physical weight in grams for one recipe unit. Null means unknown; zero is an explicit known weightless unit.';
