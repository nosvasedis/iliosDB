alter table public.products
  add column if not exists skip_casting boolean not null default false;

update public.products
set skip_casting = true
where coalesce(weight_g, 0) = 0
  and coalesce(secondary_weight_g, 0) = 0
  and is_component = false;

comment on column public.products.skip_casting is
  'True when the product was created without casting (Χωρίς χύτευση). Casting weight stays 0; physical weight comes from the recipe.';
