-- Include inventory counts and pricing recovery history in every backup path.
-- Dated repair snapshots remain excluded by backup_schema_inventory().
CREATE OR REPLACE FUNCTION private.backup_allowed_tables() RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$ SELECT ARRAY[
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
'inventory_reconciliation_issues',
'inventory_count_sessions',
'inventory_count_batches',
'inventory_count_targets',
'inventory_count_entries',
'pricing_recalculation_runs']::text[] $$;
REVOKE ALL ON FUNCTION private.backup_allowed_tables() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.backup_allowed_tables() TO service_role;

-- Preserve the public SBZ restore wrapper and its safety settings.
-- Delete count children first, restore original identity values, reseed their
-- sequences, and let PostgreSQL recompute generated columns.
create or replace function private.backup_apply_restore_pre_sbz(p_session uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mode text;
  v_requested text[];
  v_table text;
  v_rows jsonb;
  v_columns text;
  v_updates text;
  v_conflict text;
  v_conflict_columns text[];
  v_applied jsonb := '{}'::jsonb;
  v_count bigint;
  v_sequence text;
  v_pk text;
  v_delete_order constant text[] := array[
    'inventory_count_entries','inventory_count_targets','inventory_count_batches','inventory_count_sessions',
    'pricing_recalculation_runs','product_link_members',
    'audit_logs','price_snapshot_items','price_snapshots','supplier_orders','offers',
    'batch_stage_history','production_batches','proforma_document_lines','proforma_documents',
    'legal_audit_log','legal_delivery_events','legal_transmissions','legal_payments',
    'legal_document_lines','legal_documents','legal_carriers','legal_sync_runs',
    'legal_numbering_sequences','legal_settings','order_shipment_items','order_shipments',
    'order_delivery_reminders','order_delivery_plans','stock_movements','product_stock',
    'product_collections','product_molds','recipes','product_variants','orders','products',
    'collections','materials','molds','customers','suppliers','tag_color_overrides',
    'profiles','warehouses','global_settings'
  ];
  v_expected integer;
begin
  select mode, requested_tables into v_mode, v_requested
  from private.backup_restore_sessions
  where id = p_session and status = 'staged'
  for update;
  if not found then
    raise exception 'Restore session is missing or is not staged';
  end if;

  update private.backup_restore_sessions set status = 'applying' where id = p_session;

  if v_mode in ('exact', 'replace-selected') then
    foreach v_table in array v_delete_order
    loop
      if exists (
        select 1 from private.backup_restore_tables staged
        where staged.session_id = p_session
          and staged.table_name = v_table
          and (v_mode = 'exact' or v_table = any(v_requested))
      ) then
        execute format('delete from public.%I', v_table);
      end if;
    end loop;
  end if;

  for v_table, v_rows in
    select staged.table_name, staged.rows
    from private.backup_restore_tables staged
    where staged.session_id = p_session
    order by array_position(private.backup_allowed_tables(), staged.table_name)
  loop
    if jsonb_array_length(v_rows) = 0 then
      v_applied := v_applied || jsonb_build_object(v_table, 0);
      continue;
    end if;

    select string_agg(format('%I', column_name), ', ' order by ordinal_position)
    into v_columns
    from information_schema.columns
    where table_schema = 'public'
      and table_name = v_table
      and is_generated = 'NEVER'
      and column_name in (
        select distinct key
        from jsonb_array_elements(v_rows) element
        cross join lateral jsonb_object_keys(element) keys(key)
      );

    if v_columns is null then
      raise exception 'No compatible columns found for table %', v_table;
    end if;

    v_conflict_columns := private.backup_conflict_columns(v_table);
    if v_conflict_columns is null or array_length(v_conflict_columns, 1) is null then
      raise exception 'No primary or unique key exists for merge table %', v_table;
    end if;
    select string_agg(format('%I', item), ', ') into v_conflict
    from unnest(v_conflict_columns) item;

    select string_agg(format('%1$I = excluded.%1$I', column_name), ', ' order by ordinal_position)
    into v_updates
    from information_schema.columns
    where table_schema = 'public'
      and table_name = v_table
      and is_generated = 'NEVER'
      and column_name in (
        select distinct key
        from jsonb_array_elements(v_rows) element
        cross join lateral jsonb_object_keys(element) keys(key)
      )
      and not (column_name = any(v_conflict_columns));

    if v_mode = 'merge' or not (v_table = any(v_requested)) then
      execute format(
        'insert into public.%1$I (%2$s) overriding system value select %2$s from jsonb_populate_recordset(null::public.%1$I, $1) on conflict (%3$s) do update set %4$s',
        v_table, v_columns, v_conflict, coalesce(v_updates, format('%I = excluded.%I', v_conflict_columns[1], v_conflict_columns[1]))
      ) using v_rows;
    else
      execute format(
        'insert into public.%1$I (%2$s) overriding system value select %2$s from jsonb_populate_recordset(null::public.%1$I, $1)',
        v_table, v_columns
      ) using v_rows;
    end if;

    get diagnostics v_count = row_count;
    v_applied := v_applied || jsonb_build_object(v_table, v_count);

    select columns.column_name into v_pk
    from information_schema.columns columns
    where columns.table_schema = 'public'
      and columns.table_name = v_table
      and (columns.column_default like 'nextval(%' or columns.is_identity = 'YES')
    order by columns.ordinal_position
    limit 1;
    if v_pk is not null then
      v_sequence := pg_get_serial_sequence(format('public.%I', v_table), v_pk);
      if v_sequence is not null then
        execute format(
          'select setval(%L, greatest(coalesce((select max(%I) from public.%I), 1), 1), true)',
          v_sequence, v_pk, v_table
        );
      end if;
    end if;
    v_pk := null;
  end loop;

  for v_table, v_expected in
    select staged.table_name, staged.row_count
    from private.backup_restore_tables staged
    where staged.session_id = p_session
  loop
    execute format('select count(*) from public.%I', v_table) into v_count;
    if (v_mode = 'exact' or v_table = any(v_requested)) and v_count <> v_expected then
      raise exception 'Post-restore count verification failed for %: expected %, found %', v_table, v_expected, v_count;
    end if;
    if not (v_mode = 'exact' or v_table = any(v_requested)) and v_count < v_expected then
      raise exception 'Post-merge count verification failed for %: expected at least %, found %', v_table, v_expected, v_count;
    end if;
  end loop;

  update private.backup_restore_sessions
  set status = 'complete', result = jsonb_build_object('applied', v_applied, 'verified_counts', true, 'completed_at', now())
  where id = p_session;

  return jsonb_build_object('session_id', p_session, 'applied', v_applied, 'verified', true, 'verified_counts', true);
exception
  when others then
    -- The function call is a single transaction. Raising rolls back all data changes.
    raise;
end;
$$;
REVOKE ALL ON FUNCTION private.backup_apply_restore_pre_sbz(uuid) FROM PUBLIC, anon, authenticated, service_role;
