-- Συνδεδεμένα Προϊόντα: curated product sets (e.g. KL255 + BR344 + SK227).
-- A set is a group_id; a SKU may belong to several sets. Links are between
-- master SKUs; variants are matched by suffix on the client.

create table if not exists public.product_link_members (
  group_id uuid not null,
  product_sku text not null references public.products(sku) on update cascade on delete cascade,
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  primary key (group_id, product_sku)
);

create index if not exists product_link_members_sku_idx on public.product_link_members(product_sku);

-- DELETE realtime events must carry product_sku for SKU-scoped catalogue refreshes.
alter table public.product_link_members replica identity full;

comment on table public.product_link_members is
  'Membership rows of curated product sets (Συνδεδεμένα Προϊόντα). Rows sharing group_id form one set.';

alter table public.product_link_members enable row level security;

drop policy if exists product_link_members_approved_read on public.product_link_members;
create policy product_link_members_approved_read on public.product_link_members
  for select to authenticated
  using (exists (
    select 1 from public.profiles as profile
    where profile.id = (select auth.uid()) and profile.is_approved is true
  ));

drop policy if exists product_link_members_approved_write on public.product_link_members;
create policy product_link_members_approved_write on public.product_link_members
  for all to authenticated
  using (exists (
    select 1 from public.profiles as profile
    where profile.id = (select auth.uid()) and profile.is_approved is true
  ))
  with check (exists (
    select 1 from public.profiles as profile
    where profile.id = (select auth.uid()) and profile.is_approved is true
  ));

drop policy if exists inspection_locked_session_read_guard on public.product_link_members;
create policy inspection_locked_session_read_guard on public.product_link_members
  as restrictive for select to authenticated
  using (not (select private.inspection_session_active()));

-- Explicit grants keep the table available to supabase-js even for projects
-- using the newer opt-in Data API exposure defaults.
grant select, insert, update, delete on public.product_link_members to authenticated;
grant all on public.product_link_members to service_role;

do $$
begin
  alter publication supabase_realtime add table public.product_link_members;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;

-- ERP catalogue RPC: also return every member row of the sets touching the requested SKUs.
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
    'product_link_members', coalesce((
      select jsonb_agg(to_jsonb(member) order by member.group_id, member.position, member.product_sku)
      from public.product_link_members as member
      where member.group_id in (
        select scoped_member.group_id
        from public.product_link_members as scoped_member
        join requested_skus as requested on requested.sku = scoped_member.product_sku
      )
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

-- Seller catalogue snapshot: expose set memberships per product.
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
  product_link_groups as (
    select
      member.product_sku,
      jsonb_agg(
        jsonb_build_object('group_id', member.group_id, 'position', member.position)
        order by member.group_id
      ) as link_groups
    from public.product_link_members as member
    join scoped_products as product on product.sku = member.product_sku
    group by member.product_sku
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
        'variants', coalesce(variants.variants, '[]'::jsonb),
        'link_groups', coalesce(links.link_groups, '[]'::jsonb)
      )
      order by product.sku
    ) as products
    from scoped_products as product
    left join central_stock as stock
      on stock.product_sku = product.sku
     and stock.variant_suffix = ''
    left join product_collection_ids as collections on collections.product_sku = product.sku
    left join product_variants as variants on variants.product_sku = product.sku
    left join product_link_groups as links on links.product_sku = product.sku
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

-- Backup registry: register the new table right after products.
CREATE OR REPLACE FUNCTION private.backup_allowed_tables() RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT ARRAY[
'global_settings',
'warehouses',
'profiles',
'tag_color_overrides',
'suppliers',
'customers',
'molds',
'materials',
'collections',
'products',
'product_link_members',
'product_variants',
'recipes',
'product_molds',
'product_collections',
'product_stock',
'inventory_balances',
'inventory_reorder_policies',
'stock_movements',
'orders',
'inventory_reservations',
'order_delivery_plans',
'order_delivery_reminders',
'order_shipments',
'order_shipment_items',
'inventory_shipment_allocations',
'legal_settings',
'legal_numbering_sequences',
'legal_sync_runs',
'legal_carriers',
'legal_documents',
'legal_document_lines',
'legal_external_item_aliases',
'legal_payments',
'legal_transmissions',
'legal_delivery_events',
'legal_audit_log',
'proforma_documents',
'proforma_document_lines',
'consignments',
'consignment_lines',
'consignment_allocations',
'consignment_settlements',
'consignment_payments',
'consignment_returns',
'consignment_events',
'repair_intakes',
'repair_items',
'repair_cycles',
'repair_cost_lines',
'repair_charges',
'repair_attachments',
'repair_events',
'customer_service_command_results',
'production_batches',
'batch_stage_history',
'offers',
'supplier_orders',
'price_snapshots',
'price_snapshot_items',
'audit_logs',
'inventory_events',
'inventory_command_results',
'inventory_cutover_balance_snapshot',
'inventory_reconciliation_issues']::text[] $$;
REVOKE ALL ON FUNCTION private.backup_allowed_tables() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.backup_allowed_tables() TO service_role;
