-- Renaming a λάστιχο (molds.code) must keep product_molds links intact.
-- product_sku already cascades on rename; mold_code did not, so the editor
-- could not persist a new code when the mold was used by any product.

alter table public.product_molds
  drop constraint if exists product_molds_mold_code_fkey;

alter table public.product_molds
  add constraint product_molds_mold_code_fkey
  foreign key (mold_code) references public.molds(code)
  on update cascade
  on delete cascade;
