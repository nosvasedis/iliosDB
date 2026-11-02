-- Οικονομικός Έλεγχος: admin-only finance hub (Έσοδα Χ/Τ, Έξοδα, Συνεργάτες).
-- Every Χ/Τ or money row lives in finance_* tables. Inspection-visible tables
-- (orders, customers, legal_*) are never touched, and every finance table is
-- blocked while an inspection session is active.

create schema if not exists private;

create or replace function private.is_finance_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles as profile
    where profile.id = (select auth.uid())
      and profile.role = 'admin'
      and coalesce(profile.is_approved, false)
  );
$$;
revoke all on function private.is_finance_admin() from public, anon;
grant execute on function private.is_finance_admin() to authenticated, service_role;

-- ─── Προμηθευτές & Συνεργάτες ────────────────────────────────────────────────
alter table public.suppliers add column if not exists kind text not null default 'supplier';
alter table public.suppliers add column if not exists vat_number text;
alter table public.suppliers add column if not exists iban text;
alter table public.suppliers add column if not exists payment_terms_days integer;
-- No FK: suppliers restore before finance_categories in every backup path.
alter table public.suppliers add column if not exists default_category_id uuid;
alter table public.suppliers add column if not exists default_billing text;
alter table public.suppliers add column if not exists color text;
alter table public.suppliers add column if not exists is_active boolean not null default true;

do $$
begin
  alter table public.suppliers add constraint suppliers_kind_check
    check (kind in ('supplier', 'worker', 'utility', 'service', 'person'));
exception when duplicate_object then null;
end $$;
do $$
begin
  alter table public.suppliers add constraint suppliers_default_billing_check
    check (default_billing is null or default_billing in ('T', 'X'));
exception when duplicate_object then null;
end $$;

-- ─── Κατηγορίες εξόδων (Είδος › Ενότητα › Υποενότητα, ελεύθερο βάθος) ───────
create table if not exists public.finance_categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.finance_categories(id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  icon text,
  color text,
  nature text not null default 'variable' check (nature in ('fixed', 'variable')),
  link_kind text check (link_kind is null or link_kind in (
    'materials', 'stx', 'metal', 'stones', 'worker', 'seller_commission', 'travel', 'utility'
  )),
  default_party_id uuid references public.suppliers(id) on delete set null,
  default_billing text check (default_billing is null or default_billing in ('T', 'X')),
  monthly_budget numeric(12, 2),
  position integer not null default 0,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists finance_categories_parent_idx on public.finance_categories(parent_id);
create index if not exists finance_categories_party_idx on public.finance_categories(default_party_id);

-- ─── Επαναλαμβανόμενα έξοδα ──────────────────────────────────────────────────
create table if not exists public.finance_recurring (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.finance_categories(id) on delete cascade,
  party_id uuid references public.suppliers(id) on delete set null,
  description text,
  estimated_amount numeric(12, 2) not null default 0,
  billing text not null default 'T' check (billing in ('T', 'X')),
  frequency text not null default 'monthly' check (frequency in ('monthly', 'bimonthly', 'quarterly', 'yearly')),
  day_of_period integer not null default 1 check (day_of_period between 1 and 31),
  next_due date not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists finance_recurring_category_idx on public.finance_recurring(category_id);
create index if not exists finance_recurring_party_idx on public.finance_recurring(party_id);

-- ─── Έξοδα ───────────────────────────────────────────────────────────────────
create table if not exists public.finance_expenses (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.finance_categories(id) on delete restrict,
  party_id uuid references public.suppliers(id) on delete set null,
  expense_date date not null default current_date,
  due_date date,
  description text,
  doc_ref text,
  lines jsonb not null default '[]'::jsonb check (jsonb_typeof(lines) = 'array'),
  amount_net numeric(12, 2) not null default 0,
  vat_rate numeric(5, 4) not null default 0,
  vat_amount numeric(12, 2) not null default 0,
  amount_gross numeric(12, 2) not null default 0 check (amount_gross >= 0),
  billing text not null default 'T' check (billing in ('T', 'X')),
  paid_amount numeric(12, 2) not null default 0,
  status text not null default 'unpaid' check (status in ('unpaid', 'partial', 'paid', 'expected')),
  payment_method text,
  attachment_key text,
  source_kind text not null default 'manual' check (source_kind in (
    'manual', 'supplier_order', 'worker_statement', 'commission', 'recurring'
  )),
  source_id text,
  recurring_id uuid references public.finance_recurring(id) on delete set null,
  notes text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists finance_expenses_category_idx on public.finance_expenses(category_id);
create index if not exists finance_expenses_party_idx on public.finance_expenses(party_id);
create index if not exists finance_expenses_date_idx on public.finance_expenses(expense_date desc);
create index if not exists finance_expenses_recurring_idx on public.finance_expenses(recurring_id);
create index if not exists finance_expenses_created_by_idx on public.finance_expenses(created_by);
-- One automatic booking per source (supplier order, worker statement, commission payout, recurring period).
create unique index if not exists finance_expenses_source_uidx
  on public.finance_expenses(source_kind, source_id)
  where source_kind <> 'manual' and source_id is not null;

create table if not exists public.finance_expense_payments (
  id uuid primary key default gen_random_uuid(),
  party_id uuid references public.suppliers(id) on delete set null,
  expense_id uuid references public.finance_expenses(id) on delete cascade,
  paid_at date not null default current_date,
  amount numeric(12, 2) not null check (amount > 0),
  method text not null default 'cash' check (method in ('cash', 'bank', 'card', 'cheque')),
  billing text not null default 'T' check (billing in ('T', 'X')),
  notes text,
  created_at timestamptz not null default now(),
  check (party_id is not null or expense_id is not null)
);
create index if not exists finance_expense_payments_party_idx on public.finance_expense_payments(party_id);
create index if not exists finance_expense_payments_expense_idx on public.finance_expense_payments(expense_id);

-- ─── Τιμοκατάλογοι συνεργατών & ανάθεση εργασιών παραγωγής ──────────────────
create table if not exists public.finance_rate_cards (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references public.suppliers(id) on delete cascade,
  label text not null check (btrim(label) <> ''),
  unit text not null default 'per_piece' check (unit in ('per_stone', 'per_piece', 'per_gram', 'per_hour', 'fixed')),
  rate numeric(12, 4) not null default 0 check (rate >= 0),
  match jsonb not null default '{}'::jsonb check (jsonb_typeof(match) = 'object'),
  priority integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists finance_rate_cards_party_idx on public.finance_rate_cards(party_id);

create table if not exists public.finance_worker_statements (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references public.suppliers(id) on delete restrict,
  period_from date,
  period_to date,
  status text not null default 'draft' check (status in ('draft', 'confirmed')),
  lines jsonb not null default '[]'::jsonb check (jsonb_typeof(lines) = 'array'),
  total numeric(12, 2) not null default 0,
  expense_id uuid references public.finance_expenses(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);
create index if not exists finance_worker_statements_party_idx on public.finance_worker_statements(party_id);
create index if not exists finance_worker_statements_expense_idx on public.finance_worker_statements(expense_id);

-- Batch ids are text and batches may be deleted later; the assignment keeps its own snapshot.
create table if not exists public.production_stage_assignments (
  id uuid primary key default gen_random_uuid(),
  batch_id text not null,
  stage text not null,
  party_id uuid not null references public.suppliers(id) on delete cascade,
  sku text,
  variant_suffix text,
  quantity integer not null check (quantity > 0),
  assigned_at timestamptz not null default now(),
  statement_id uuid references public.finance_worker_statements(id) on delete set null,
  notes text,
  unique (batch_id, stage)
);
create index if not exists production_stage_assignments_party_idx on public.production_stage_assignments(party_id);
create index if not exists production_stage_assignments_statement_idx on public.production_stage_assignments(statement_id);

-- ─── Έσοδα: όροι Χ/Τ ανά πελάτη / παραγγελία και εισπράξεις ─────────────────
create table if not exists public.finance_customer_terms (
  customer_id uuid primary key references public.customers(id) on delete cascade,
  default_mode text not null default 'T' check (default_mode in ('T', 'X', 'split')),
  t_percent numeric(5, 2) not null default 100 check (t_percent between 0 and 100),
  notes text,
  updated_at timestamptz not null default now()
);

create table if not exists public.finance_order_billing (
  order_id text primary key references public.orders(id) on update cascade on delete cascade,
  mode text not null default 'T' check (mode in ('T', 'X', 'split')),
  t_percent numeric(5, 2) not null default 100 check (t_percent between 0 and 100),
  agreed_total numeric(12, 2),
  due_date date,
  notes text,
  updated_at timestamptz not null default now()
);

create table if not exists public.finance_receipts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete set null,
  order_id text references public.orders(id) on update cascade on delete set null,
  received_at date not null default current_date,
  amount numeric(12, 2) not null check (amount > 0),
  billing text not null check (billing in ('T', 'X')),
  method text not null default 'cash' check (method in ('cash', 'bank', 'card', 'cheque')),
  legal_document_id uuid references public.legal_documents(id) on delete set null,
  notes text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check (customer_id is not null or order_id is not null)
);
create index if not exists finance_receipts_customer_idx on public.finance_receipts(customer_id);
create index if not exists finance_receipts_order_idx on public.finance_receipts(order_id);
create index if not exists finance_receipts_legal_idx on public.finance_receipts(legal_document_id);
create index if not exists finance_receipts_created_by_idx on public.finance_receipts(created_by);
create index if not exists finance_receipts_date_idx on public.finance_receipts(received_at desc);

-- ─── Υπολογισμός εξόφλησης εξόδων ────────────────────────────────────────────
create or replace function private.finance_expense_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if new.status <> 'expected' then
    new.status := case
      when new.paid_amount >= new.amount_gross - 0.005 and new.amount_gross > 0 then 'paid'
      when new.paid_amount > 0 then 'partial'
      else 'unpaid'
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists finance_expenses_status on public.finance_expenses;
create trigger finance_expenses_status
  before insert or update on public.finance_expenses
  for each row execute function private.finance_expense_status();

create or replace function private.finance_sync_expense_paid()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[] := array_remove(array[
    case when tg_op <> 'INSERT' then old.expense_id end,
    case when tg_op <> 'DELETE' then new.expense_id end
  ], null);
begin
  update public.finance_expenses as expense
  set paid_amount = coalesce((
    select sum(payment.amount) from public.finance_expense_payments as payment
    where payment.expense_id = expense.id
  ), 0)
  where expense.id = any(v_ids);
  return null;
end;
$$;
revoke all on function private.finance_sync_expense_paid() from public, anon, authenticated;

drop trigger if exists finance_expense_payments_sync on public.finance_expense_payments;
create trigger finance_expense_payments_sync
  after insert or update or delete on public.finance_expense_payments
  for each row execute function private.finance_sync_expense_paid();

-- ─── Επιβεβαίωση εκκαθάρισης συνεργάτη (ατομική, ιδεμπότητη) ────────────────
create or replace function public.finance_confirm_worker_statement_v1(
  p_statement_id uuid,
  p_category_id uuid,
  p_billing text default 'T',
  p_expense_date date default current_date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_statement public.finance_worker_statements%rowtype;
  v_expense_id uuid;
  v_party_name text;
begin
  if not private.is_finance_admin() or private.inspection_session_active() then
    raise exception using errcode = '42501', message = 'Μόνο διαχειριστής μπορεί να επιβεβαιώσει εκκαθάριση.';
  end if;
  if p_billing not in ('T', 'X') then
    raise exception using errcode = '22023', message = 'Μη έγκυρος τύπος παραστατικού.';
  end if;

  select * into v_statement from public.finance_worker_statements where id = p_statement_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Η εκκαθάριση δεν βρέθηκε.';
  end if;
  if v_statement.status = 'confirmed' and v_statement.expense_id is not null then
    return v_statement.expense_id;
  end if;

  select name into v_party_name from public.suppliers where id = v_statement.party_id;

  insert into public.finance_expenses (
    category_id, party_id, expense_date, description, lines,
    amount_net, vat_rate, vat_amount, amount_gross, billing, source_kind, source_id
  ) values (
    p_category_id, v_statement.party_id, coalesce(p_expense_date, current_date),
    'Εκκαθάριση ' || coalesce(v_party_name, 'συνεργάτη')
      || coalesce(' ' || to_char(v_statement.period_from, 'DD/MM') || '–' || to_char(v_statement.period_to, 'DD/MM/YYYY'), ''),
    v_statement.lines, v_statement.total, 0, 0, v_statement.total, p_billing,
    'worker_statement', v_statement.id::text
  )
  on conflict (source_kind, source_id) where source_kind <> 'manual' and source_id is not null
  do update set amount_gross = excluded.amount_gross
  returning id into v_expense_id;

  update public.production_stage_assignments as assignment
  set statement_id = v_statement.id
  where assignment.statement_id is null
    and assignment.id in (
      select (line ->> 'assignment_id')::uuid
      from jsonb_array_elements(v_statement.lines) as line
      where line ? 'assignment_id' and (line ->> 'assignment_id') ~ '^[0-9a-fA-F-]{36}$'
    );

  update public.finance_worker_statements
  set status = 'confirmed', expense_id = v_expense_id, confirmed_at = now()
  where id = v_statement.id;

  return v_expense_id;
end;
$$;
revoke all on function public.finance_confirm_worker_statement_v1(uuid, uuid, text, date) from public, anon;
grant execute on function public.finance_confirm_worker_statement_v1(uuid, uuid, text, date) to authenticated;

-- ─── RLS, grants, realtime ───────────────────────────────────────────────────
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'finance_categories', 'finance_recurring', 'finance_expenses', 'finance_expense_payments',
    'finance_rate_cards', 'finance_worker_statements', 'production_stage_assignments',
    'finance_customer_terms', 'finance_order_billing', 'finance_receipts'
  ]
  loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('drop policy if exists %I on public.%I', v_table || '_finance_admin_all', v_table);
    execute format(
      'create policy %I on public.%I for all to authenticated using ((select private.is_finance_admin())) with check ((select private.is_finance_admin()))',
      v_table || '_finance_admin_all', v_table
    );
    execute format('drop policy if exists inspection_locked_session_read_guard on public.%I', v_table);
    execute format(
      'create policy inspection_locked_session_read_guard on public.%I as restrictive for all to authenticated using (not (select private.inspection_session_active())) with check (not (select private.inspection_session_active()))',
      v_table
    );
    execute format('grant select, insert, update, delete on public.%I to authenticated', v_table);
    execute format('grant all on public.%I to service_role', v_table);
    begin
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    exception
      when duplicate_object then null;
      when undefined_object then null;
    end;
  end loop;
end $$;

comment on table public.finance_categories is 'Δέντρο κατηγοριών εξόδων (Είδος › Ενότητα › Υποενότητα). Μόνο διαχειριστές, κλειδωμένο σε έλεγχο.';
comment on table public.finance_expenses is 'Καταχωρίσεις εξόδων Χ/Τ με αυτόματη κατάσταση εξόφλησης.';
comment on table public.finance_receipts is 'Εισπράξεις πελατών Χ/Τ. Δεν αποθηκεύεται ποτέ στον πίνακα orders.';
comment on table public.production_stage_assignments is 'Ποιος συνεργάτης (καρφωτής, τεχνίτης, χρυσωτής) εκτέλεσε ποιο στάδιο παρτίδας.';

-- ─── Αρχικό δέντρο κατηγοριών (πλήρως επεξεργάσιμο) ─────────────────────────
do $$
declare
  v_root uuid;
  v_mid uuid;
begin
  if exists (select 1 from public.finance_categories) then
    return;
  end if;

  insert into public.finance_categories (name, icon, color, nature, position)
  values ('Λειτουργικά', 'building', '#0ea5e9', 'fixed', 0) returning id into v_root;
  insert into public.finance_categories (parent_id, name, icon, nature, link_kind, position)
  values (v_root, 'Ρεύμα', 'zap', 'fixed', 'utility', 0) returning id into v_mid;
  insert into public.finance_categories (parent_id, name, nature, link_kind, position)
  values (v_mid, 'ΔΕΗ', 'fixed', 'utility', 0);
  insert into public.finance_categories (parent_id, name, icon, nature, link_kind, position)
  values (v_root, 'Τηλεπικοινωνίες', 'phone', 'fixed', 'utility', 1) returning id into v_mid;
  insert into public.finance_categories (parent_id, name, nature, link_kind, position) values
    (v_mid, 'Σταθερό μαγαζιού', 'fixed', 'utility', 0),
    (v_mid, 'Σταθερό γραφείου', 'fixed', 'utility', 1),
    (v_mid, 'Κινητό Αλέκου', 'fixed', 'utility', 2);

  insert into public.finance_categories (name, icon, color, nature, position)
  values ('Εργατικά', 'hammer', '#f59e0b', 'variable', 1) returning id into v_root;
  insert into public.finance_categories (parent_id, name, nature, link_kind, position) values
    (v_root, 'Τεχνίτης', 'variable', 'worker', 0),
    (v_root, 'Κεριά', 'variable', 'worker', 1),
    (v_root, 'Καρφωτής', 'variable', 'worker', 2),
    (v_root, 'Χρύσωμα', 'variable', 'worker', 3);

  insert into public.finance_categories (name, icon, color, nature, position)
  values ('Πρώτες Ύλες', 'gem', '#8b5cf6', 'variable', 2) returning id into v_root;
  insert into public.finance_categories (parent_id, name, nature, link_kind, position) values
    (v_root, 'Μέταλλο', 'variable', 'metal', 0),
    (v_root, 'Πέτρες', 'variable', 'stones', 1),
    (v_root, 'Υλικά', 'variable', 'materials', 2);

  insert into public.finance_categories (name, icon, color, nature, link_kind, position)
  values ('Εξαρτήματα (STX)', 'puzzle', '#10b981', 'variable', 'stx', 3);
  insert into public.finance_categories (name, icon, color, nature, link_kind, position)
  values ('Έξοδα Ταξιδιού', 'plane', '#ec4899', 'variable', 'travel', 4);
  insert into public.finance_categories (name, icon, color, nature, link_kind, position)
  values ('Προμήθειες Πλασιέ', 'handshake', '#64748b', 'variable', 'seller_commission', 5);
end $$;

-- ─── Backup registry: finance tables after every parent they reference ──────
-- Restore clears finance children before suppliers, customers and orders.
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
'pricing_recalculation_runs',
'finance_categories',
'finance_recurring',
'finance_expenses',
'finance_expense_payments',
'finance_rate_cards',
'finance_worker_statements',
'production_stage_assignments',
'finance_customer_terms',
'finance_order_billing',
'finance_receipts']::text[] $$;
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
    'finance_receipts','finance_order_billing','finance_customer_terms','production_stage_assignments','finance_worker_statements','finance_rate_cards','finance_expense_payments','finance_expenses','finance_recurring','finance_categories',
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
