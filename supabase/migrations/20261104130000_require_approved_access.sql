-- Business data is for approved accounts only. Older policies were `true` for the
-- public role, so the anon key (which ships in every browser) could read and change
-- orders, customers and products, and any self-registered account could too.
-- Approved users keep the table access they already had.

create or replace function private.is_approved_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles as profile
    where profile.id = (select auth.uid()) and profile.is_approved is true
  );
$$;
revoke all on function private.is_approved_user() from public, anon;
grant execute on function private.is_approved_user() to authenticated, service_role;

-- Shared role helpers: an unapproved account has no application role.
create or replace function private.current_app_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select profile.role::text
  from public.profiles as profile
  where profile.id = (select auth.uid()) and profile.is_approved is true
  limit 1;
$$;

create or replace function private.assert_inventory_role(p_allowed text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_role text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Απαιτείται ενεργή σύνδεση χρήστη.';
  end if;
  select profile.role into v_role
  from public.profiles as profile
  where profile.id = v_user_id and profile.is_approved is true;
  if v_role is null or not (v_role = any(p_allowed)) then
    raise exception using errcode = '42501', message = 'Δεν έχετε δικαίωμα εκτέλεσης αυτής της ενέργειας αποθέματος.';
  end if;
end;
$$;

do $$
declare
  v_table text;
  v_policy record;
  -- Full access for approved users, as these tables allowed everyone before.
  v_all constant text[] := array[
    'batch_stage_history', 'collections', 'customers', 'global_settings', 'materials', 'molds', 'offers',
    'order_delivery_plans', 'order_delivery_plans_backup_20260317',
    'order_delivery_reminders', 'order_delivery_reminders_backup_20260317',
    'order_shipment_items', 'order_shipments', 'orders', 'price_snapshot_items', 'price_snapshots',
    'product_collections', 'product_molds', 'product_variants', 'production_batches', 'products',
    'recipes', 'stock_movements', 'supplier_orders', 'suppliers', 'tag_color_overrides'
  ];
  -- Written only through security definer functions (or by admins through existing policies).
  v_read constant text[] := array['inventory_balances', 'inventory_reorder_policies', 'warehouses'];
begin
  for v_policy in
    select policy.tablename, policy.policyname
    from pg_policies as policy
    where policy.schemaname = 'public'
      and policy.permissive = 'PERMISSIVE'
      and policy.tablename = any(v_all || v_read || array['audit_logs', 'product_stock', 'profiles'])
      and coalesce(policy.qual, '') || coalesce(policy.with_check, '') !~* '(is_approved|current_app_role|is_finance_admin|is_legal_module_admin|inspection_approved_admin)'
      and policy.policyname <> 'Users can read own profile'
  loop
    execute format('drop policy %I on public.%I', v_policy.policyname, v_policy.tablename);
  end loop;

  foreach v_table in array v_all loop
    if to_regclass('public.' || quote_ident(v_table)) is not null then
      execute format('drop policy if exists approved_access on public.%I', v_table);
      execute format('create policy approved_access on public.%I for all to authenticated using ((select private.is_approved_user())) with check ((select private.is_approved_user()))', v_table);
    end if;
  end loop;

  foreach v_table in array v_read loop
    if to_regclass('public.' || quote_ident(v_table)) is not null then
      execute format('drop policy if exists approved_read on public.%I', v_table);
      execute format('create policy approved_read on public.%I for select to authenticated using ((select private.is_approved_user()))', v_table);
    end if;
  end loop;
end $$;

-- Audit history: readable and appendable, same operations as before, approved accounts only.
drop policy if exists approved_read on public.audit_logs;
create policy approved_read on public.audit_logs for select to authenticated using ((select private.is_approved_user()));
drop policy if exists approved_insert on public.audit_logs;
create policy approved_insert on public.audit_logs for insert to authenticated with check ((select private.is_approved_user()));
drop policy if exists approved_delete on public.audit_logs;
create policy approved_delete on public.audit_logs for delete to authenticated using ((select private.is_approved_user()));

-- Sellers never had product_stock; only the approval requirement is new.
drop policy if exists staff_access on public.product_stock;
create policy staff_access on public.product_stock for all to authenticated
  using ((select private.current_app_role()) in ('admin', 'user'))
  with check ((select private.current_app_role()) in ('admin', 'user'));

-- Everyone can always see their own profile (the pending-approval screen needs it).
drop policy if exists approved_read on public.profiles;
create policy approved_read on public.profiles for select to authenticated using ((select private.is_approved_user()));

-- Nothing in the app reads or writes data before login.
revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;

-- Public image buckets stay publicly readable; changing them needs an approved account.
do $$
declare
  v_bucket text;
begin
  if to_regclass('storage.objects') is null then return; end if;
  drop policy if exists "allow 16wiy3a_0" on storage.objects;
  drop policy if exists "allow 16wiy3a_1" on storage.objects;
  drop policy if exists "allow 16wiy3a_2" on storage.objects;
  drop policy if exists "allow 96uo7t_1" on storage.objects;
  drop policy if exists "allow 96uo7t_2" on storage.objects;
  drop policy if exists "allow 96uo7t_3" on storage.objects;
  foreach v_bucket in array array['product-images', 'catalog'] loop
    execute format('drop policy if exists %I on storage.objects', v_bucket || '_approved_insert');
    execute format('drop policy if exists %I on storage.objects', v_bucket || '_approved_update');
    execute format('drop policy if exists %I on storage.objects', v_bucket || '_approved_delete');
    execute format('create policy %I on storage.objects for insert to authenticated with check (bucket_id = %L and (select private.is_approved_user()))', v_bucket || '_approved_insert', v_bucket);
    execute format('create policy %I on storage.objects for update to authenticated using (bucket_id = %L and (select private.is_approved_user())) with check (bucket_id = %L and (select private.is_approved_user()))', v_bucket || '_approved_update', v_bucket, v_bucket);
    execute format('create policy %I on storage.objects for delete to authenticated using (bucket_id = %L and (select private.is_approved_user()))', v_bucket || '_approved_delete', v_bucket);
  end loop;
end $$;

-- Pin search_path on the remaining functions (their bodies are already schema-qualified).
alter function public.order_item_total_qty(jsonb) set search_path = '';
alter function public.order_line_identity_key(text, text, text, text, text, text) set search_path = '';
alter function public.move_inhouse_batches_from_awaiting_to_waxing(text) set search_path = '';
alter function public.trg_products_auto_move_inhouse_batches() set search_path = '';
