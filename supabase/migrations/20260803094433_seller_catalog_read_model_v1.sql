-- A compact, read-only seller catalogue snapshot. This intentionally remains
-- a SECURITY INVOKER function so the caller's existing table RLS is preserved.
create or replace function public.get_seller_catalog_v1(p_skus text[] default null)
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
      and profile.role in ('seller', 'admin')
  ) then
    raise exception using
      errcode = '42501',
      message = 'Seller catalogue access requires an approved seller or admin profile.';
  end if;

  if p_skus is not null and cardinality(p_skus) > 100 then
    raise exception using
      errcode = '22023',
      message = 'get_seller_catalog_v1 accepts at most 100 SKUs.';
  end if;

  with requested_skus as (
    select distinct btrim(requested.sku) as sku
    from unnest(coalesce(p_skus, array[]::text[])) as requested(sku)
    where requested.sku is not null
      and btrim(requested.sku) <> ''
  ),
  scoped_products as materialized (
    select
      product.sku,
      product.category,
      product.gender,
      product.image_url,
      product.production_type,
      product.created_at,
      product.selling_price,
      product.stock_qty
    from public.products as product
    where product.is_component is not true
      and product.legal_only is not true
      and upper(btrim(product.sku)) <> '000'
      and upper(btrim(product.prefix)) <> '000'
      and (
        p_skus is null
        or exists (
          select 1
          from requested_skus as requested
          where requested.sku = product.sku
        )
      )
  ),
  central_stock as materialized (
    select
      balance.product_sku,
      coalesce(balance.variant_suffix, '') as variant_suffix,
      sum(balance.on_hand)::integer as on_hand,
      sum(balance.reserved)::integer as reserved
    from public.inventory_balances as balance
    join scoped_products as product on product.sku = balance.product_sku
    where balance.warehouse_id = '00000000-0000-0000-0000-000000000001'::uuid
    group by balance.product_sku, coalesce(balance.variant_suffix, '')
  ),
  product_collection_ids as (
    select
      link.product_sku,
      jsonb_agg(link.collection_id order by link.collection_id) as collection_ids
    from public.product_collections as link
    join scoped_products as product on product.sku = link.product_sku
    group by link.product_sku
  ),
  product_variants as (
    select
      variant.product_sku,
      jsonb_agg(
        jsonb_build_object(
          'suffix', variant.suffix,
          'description', coalesce(variant.description, ''),
          'selling_price', variant.selling_price,
          'stock_qty', coalesce(stock.on_hand, variant.stock_qty, 0),
          'available_qty', coalesce(stock.on_hand - stock.reserved, variant.stock_qty, 0)
        )
        order by variant.suffix
      ) as variants
    from public.product_variants as variant
    join scoped_products as product on product.sku = variant.product_sku
    left join central_stock as stock
      on stock.product_sku = variant.product_sku
     and stock.variant_suffix = variant.suffix
    group by variant.product_sku
  ),
  snapshot_products as (
    select jsonb_agg(
      jsonb_build_object(
        'sku', product.sku,
        'category', coalesce(product.category, ''),
        'gender', product.gender,
        'image_url', product.image_url,
        'production_type', product.production_type,
        'created_at', product.created_at,
        'selling_price', coalesce(product.selling_price, 0),
        'stock_qty', coalesce(stock.on_hand, product.stock_qty, 0),
        'available_qty', coalesce(stock.on_hand - stock.reserved, product.stock_qty, 0),
        'collection_ids', coalesce(collections.collection_ids, '[]'::jsonb),
        'variants', coalesce(variants.variants, '[]'::jsonb)
      )
      order by product.sku
    ) as products
    from scoped_products as product
    left join central_stock as stock
      on stock.product_sku = product.sku
     and stock.variant_suffix = ''
    left join product_collection_ids as collections on collections.product_sku = product.sku
    left join product_variants as variants on variants.product_sku = product.sku
  ),
  snapshot_collections as (
    select jsonb_agg(
      jsonb_build_object(
        'id', collection.id,
        'name', collection.name,
        'description', collection.description
      )
      order by collection.name, collection.id
    ) as collections
    from public.collections as collection
  )
  select jsonb_build_object(
    'schema_version', 1,
    'generated_at', statement_timestamp(),
    'products', coalesce(snapshot_products.products, '[]'::jsonb),
    'collections', coalesce(snapshot_collections.collections, '[]'::jsonb)
  )
  into v_result
  from snapshot_products
  cross join snapshot_collections;

  return v_result;
end;
$function$;

revoke all on function public.get_seller_catalog_v1(text[]) from public;
revoke all on function public.get_seller_catalog_v1(text[]) from anon;
grant execute on function public.get_seller_catalog_v1(text[]) to authenticated;

comment on function public.get_seller_catalog_v1(text[]) is
  'Versioned compact seller catalogue snapshot. NULL returns the full catalogue; up to 100 SKUs returns a reconciliation subset.';
