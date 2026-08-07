-- ERP catalog SKU-scoped sync: replica identity for realtime old-row SKUs
-- plus a SECURITY INVOKER RPC that returns related raw rows for client mapping.

alter table public.products replica identity full;
alter table public.product_variants replica identity full;
alter table public.product_collections replica identity full;
alter table public.recipes replica identity full;
alter table public.product_molds replica identity full;
alter table public.inventory_balances replica identity full;

create or replace function public.get_erp_products_by_skus(p_skus text[])
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $function$
declare
  v_result jsonb;
begin
  if (select auth.uid()) is null or not exists (
    select 1
    from public.profiles as profile
    where profile.id = (select auth.uid())
      and profile.is_approved is true
  ) then
    raise exception using
      errcode = '42501',
      message = 'ERP catalogue access requires an approved profile.';
  end if;

  if p_skus is null or cardinality(p_skus) = 0 then
    raise exception using
      errcode = '22023',
      message = 'get_erp_products_by_skus requires at least one SKU.';
  end if;

  if cardinality(p_skus) > 100 then
    raise exception using
      errcode = '22023',
      message = 'get_erp_products_by_skus accepts at most 100 SKUs.';
  end if;

  with requested_skus as (
    select distinct btrim(requested.sku) as sku
    from unnest(p_skus) as requested(sku)
    where requested.sku is not null
      and btrim(requested.sku) <> ''
  ),
  scoped_products as (
    select product.*
    from public.products as product
    join requested_skus as requested on requested.sku = product.sku
  ),
  supplier_ids as (
    select distinct product.supplier_id as id
    from scoped_products as product
    where product.supplier_id is not null
  )
  select jsonb_build_object(
    'schema_version', 1,
    'generated_at', statement_timestamp(),
    'products', coalesce((select jsonb_agg(to_jsonb(product) order by product.sku) from scoped_products as product), '[]'::jsonb),
    'product_variants', coalesce((
      select jsonb_agg(to_jsonb(variant) order by variant.product_sku, variant.suffix)
      from public.product_variants as variant
      join requested_skus as requested on requested.sku = variant.product_sku
    ), '[]'::jsonb),
    'recipes', coalesce((
      select jsonb_agg(to_jsonb(recipe) order by recipe.parent_sku)
      from public.recipes as recipe
      join requested_skus as requested on requested.sku = recipe.parent_sku
    ), '[]'::jsonb),
    'product_molds', coalesce((
      select jsonb_agg(to_jsonb(mold) order by mold.product_sku, mold.mold_code)
      from public.product_molds as mold
      join requested_skus as requested on requested.sku = mold.product_sku
    ), '[]'::jsonb),
    'product_collections', coalesce((
      select jsonb_agg(to_jsonb(link) order by link.product_sku, link.collection_id)
      from public.product_collections as link
      join requested_skus as requested on requested.sku = link.product_sku
    ), '[]'::jsonb),
    'inventory_balances', coalesce((
      select jsonb_agg(to_jsonb(balance) order by balance.product_sku, balance.variant_suffix, balance.size_info)
      from public.inventory_balances as balance
      join requested_skus as requested on requested.sku = balance.product_sku
    ), '[]'::jsonb),
    'suppliers', coalesce((
      select jsonb_agg(to_jsonb(supplier) order by supplier.name)
      from public.suppliers as supplier
      join supplier_ids as ids on ids.id = supplier.id
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$function$;

revoke all on function public.get_erp_products_by_skus(text[]) from public;
revoke all on function public.get_erp_products_by_skus(text[]) from anon;
grant execute on function public.get_erp_products_by_skus(text[]) to authenticated;

comment on function public.get_erp_products_by_skus(text[]) is
  'Returns raw ERP product-graph rows for up to 100 SKUs so the client can mapProductsWithRelations without a full catalogue download.';
