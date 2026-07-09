create schema if not exists private;

create table if not exists private.backup_restore_sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid,
  mode text not null check (mode in ('exact', 'merge', 'replace-selected')),
  requested_tables text[] not null default '{}',
  manifest jsonb not null,
  status text not null default 'staged' check (status in ('staged', 'applying', 'complete', 'failed')),
  result jsonb
);

create table if not exists private.backup_restore_tables (
  session_id uuid not null references private.backup_restore_sessions(id) on delete cascade,
  table_name text not null,
  rows jsonb not null check (jsonb_typeof(rows) = 'array'),
  row_count integer not null,
  sha256 text,
  primary key (session_id, table_name)
);

alter table private.backup_restore_sessions enable row level security;
alter table private.backup_restore_tables enable row level security;
revoke all on schema private from public, anon, authenticated;
revoke all on all tables in schema private from public, anon, authenticated;
grant usage on schema private to service_role;
grant select, insert, update, delete on private.backup_restore_sessions to service_role;
grant select, insert, update, delete on private.backup_restore_tables to service_role;

create or replace function private.backup_allowed_tables()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'global_settings','warehouses','profiles','tag_color_overrides',
    'suppliers','customers','molds','materials','collections','products',
    'product_variants','recipes','product_molds','product_collections',
    'product_stock','stock_movements','orders','order_delivery_plans',
    'order_delivery_reminders','order_shipments','order_shipment_items',
    'legal_settings','legal_numbering_sequences','legal_sync_runs',
    'legal_carriers','legal_documents','legal_document_lines','legal_payments',
    'legal_transmissions','legal_delivery_events','legal_audit_log',
    'proforma_documents','proforma_document_lines','production_batches',
    'batch_stage_history','offers','supplier_orders','price_snapshots',
    'price_snapshot_items','audit_logs'
  ]::text[];
$$;

create or replace function private.backup_conflict_columns(p_table text)
returns text[]
language plpgsql
stable
set search_path = ''
as $$
declare
  v_columns text[];
begin
  select array_agg(attributes.attname::text order by keys.ordinality)
  into v_columns
  from pg_catalog.pg_index indexes
  cross join lateral unnest(indexes.indkey) with ordinality keys(attnum, ordinality)
  join pg_catalog.pg_attribute attributes
    on attributes.attrelid = indexes.indrelid
   and attributes.attnum = keys.attnum
  where indexes.indrelid = pg_catalog.to_regclass(format('public.%I', p_table))
    and indexes.indisprimary;

  if v_columns is null then
    select array_agg(attributes.attname::text order by keys.ordinality)
    into v_columns
    from pg_catalog.pg_index indexes
    cross join lateral unnest(indexes.indkey) with ordinality keys(attnum, ordinality)
    join pg_catalog.pg_attribute attributes
      on attributes.attrelid = indexes.indrelid
     and attributes.attnum = keys.attnum
    where indexes.indrelid = pg_catalog.to_regclass(format('public.%I', p_table))
      and indexes.indisunique
      and indexes.indpred is null
    group by indexes.indexrelid
    order by indexes.indexrelid
    limit 1;
  end if;
  return v_columns;
end;
$$;

create or replace function public.backup_schema_inventory()
returns table(table_name text)
language sql
security definer
set search_path = ''
as $$
  select tables.table_name::text
  from information_schema.tables
  where tables.table_schema = 'public'
    and tables.table_type = 'BASE TABLE'
    and tables.table_name <> 'spatial_ref_sys'
    -- Historical repair snapshots are intentionally not part of the live
    -- application schema and must not block verified application backups.
    and tables.table_name !~ '_backup_[0-9]{8}$'
  order by tables.table_name;
$$;

create or replace function public.backup_stage_restore(
  p_manifest jsonb,
  p_tables jsonb,
  p_mode text,
  p_requested_tables text[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session uuid;
  v_table text;
  v_rows jsonb;
  v_allowed text[] := private.backup_allowed_tables();
begin
  if p_mode not in ('exact', 'merge', 'replace-selected') then
    raise exception 'Unsupported restore mode: %', p_mode;
  end if;
  if jsonb_typeof(p_tables) <> 'object' then
    raise exception 'Restore tables payload must be a JSON object';
  end if;

  insert into private.backup_restore_sessions(mode, requested_tables, manifest)
  values (p_mode, coalesce(p_requested_tables, '{}'), p_manifest)
  returning id into v_session;

  for v_table, v_rows in select key, value from jsonb_each(p_tables)
  loop
    if not (v_table = any(v_allowed)) then
      raise exception 'Restore contains an unregistered table: %', v_table;
    end if;
    if jsonb_typeof(v_rows) <> 'array' then
      raise exception 'Restore table % is not an array', v_table;
    end if;
    insert into private.backup_restore_tables(session_id, table_name, rows, row_count, sha256)
    values (
      v_session,
      v_table,
      v_rows,
      jsonb_array_length(v_rows),
      p_manifest #>> array['tables', v_table, 'sha256']
    );
  end loop;
  return v_session;
end;
$$;

create or replace function public.backup_apply_restore(p_session uuid)
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
      and column_name in (
        select distinct key
        from jsonb_array_elements(v_rows) element
        cross join lateral jsonb_object_keys(element) keys(key)
      )
      and not (column_name = any(v_conflict_columns));

    if v_mode = 'merge' or not (v_table = any(v_requested)) then
      execute format(
        'insert into public.%1$I (%2$s) select %2$s from jsonb_populate_recordset(null::public.%1$I, $1) on conflict (%3$s) do update set %4$s',
        v_table, v_columns, v_conflict, coalesce(v_updates, format('%I = excluded.%I', v_conflict_columns[1], v_conflict_columns[1]))
      ) using v_rows;
    else
      execute format(
        'insert into public.%1$I (%2$s) select %2$s from jsonb_populate_recordset(null::public.%1$I, $1)',
        v_table, v_columns
      ) using v_rows;
    end if;

    get diagnostics v_count = row_count;
    v_applied := v_applied || jsonb_build_object(v_table, v_count);

    select columns.column_name into v_pk
    from information_schema.columns columns
    where columns.table_schema = 'public'
      and columns.table_name = v_table
      and columns.column_default like 'nextval(%'
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

revoke all on function public.backup_schema_inventory() from public, anon, authenticated;
revoke all on function public.backup_stage_restore(jsonb, jsonb, text, text[]) from public, anon, authenticated;
revoke all on function public.backup_apply_restore(uuid) from public, anon, authenticated;
grant execute on function public.backup_schema_inventory() to service_role;
grant execute on function public.backup_stage_restore(jsonb, jsonb, text, text[]) to service_role;
grant execute on function public.backup_apply_restore(uuid) to service_role;
