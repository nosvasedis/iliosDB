create extension if not exists pgcrypto;

create table if not exists public.order_delivery_plans (
    id uuid primary key default gen_random_uuid(),
    order_id uuid not null references public.orders(id) on delete cascade,
    plan_status text not null default 'active' check (plan_status in ('active', 'completed', 'cancelled')),
    planning_mode text not null check (planning_mode in ('exact', 'month', 'custom_period', 'holiday_anchor')),
    target_at timestamptz null,
    window_start timestamptz null,
    window_end timestamptz null,
    holiday_anchor text null check (holiday_anchor in ('orthodox_easter', 'orthodox_christmas')),
    holiday_year integer null,
    holiday_offset_days integer null,
    contact_phone_override text null,
    internal_notes text null,
    snoozed_until timestamptz null,
    completed_at timestamptz null,
    cancelled_at timestamptz null,
    created_by text null,
    updated_by text null,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

alter table public.order_delivery_plans add column if not exists order_id uuid;
alter table public.order_delivery_plans add column if not exists plan_status text;
alter table public.order_delivery_plans add column if not exists planning_mode text;
alter table public.order_delivery_plans add column if not exists target_at timestamptz;
alter table public.order_delivery_plans add column if not exists window_start timestamptz;
alter table public.order_delivery_plans add column if not exists window_end timestamptz;
alter table public.order_delivery_plans add column if not exists holiday_anchor text;
alter table public.order_delivery_plans add column if not exists holiday_year integer;
alter table public.order_delivery_plans add column if not exists holiday_offset_days integer;
alter table public.order_delivery_plans add column if not exists contact_phone_override text;
alter table public.order_delivery_plans add column if not exists internal_notes text;
alter table public.order_delivery_plans add column if not exists snoozed_until timestamptz;
alter table public.order_delivery_plans add column if not exists completed_at timestamptz;
alter table public.order_delivery_plans add column if not exists cancelled_at timestamptz;
alter table public.order_delivery_plans add column if not exists created_by text;
alter table public.order_delivery_plans add column if not exists updated_by text;
alter table public.order_delivery_plans add column if not exists created_at timestamptz default timezone('utc', now());
alter table public.order_delivery_plans add column if not exists updated_at timestamptz default timezone('utc', now());

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'order_delivery_plans_order_id_fkey'
    ) then
        alter table public.order_delivery_plans
            add constraint order_delivery_plans_order_id_fkey
            foreign key (order_id) references public.orders(id) on delete cascade;
    end if;
end $$;

create index if not exists idx_order_delivery_plans_order_id on public.order_delivery_plans(order_id);
create index if not exists idx_order_delivery_plans_status_target on public.order_delivery_plans(plan_status, target_at);

create table if not exists public.order_delivery_reminders (
    id uuid primary key default gen_random_uuid(),
    plan_id uuid not null references public.order_delivery_plans(id) on delete cascade,
    trigger_at timestamptz not null,
    action_type text not null check (action_type in ('call_client', 'message_client', 'confirm_ready', 'arrange_delivery', 'internal_followup')),
    reason text not null default '',
    sort_order integer not null default 0,
    source text not null default 'manual' check (source in ('auto', 'manual')),
    acknowledged_at timestamptz null,
    completed_at timestamptz null,
    completion_note text null,
    completed_by text null,
    snoozed_until timestamptz null,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

alter table public.order_delivery_reminders add column if not exists plan_id uuid;
alter table public.order_delivery_reminders add column if not exists trigger_at timestamptz;
alter table public.order_delivery_reminders add column if not exists action_type text;
alter table public.order_delivery_reminders add column if not exists reason text default '';
alter table public.order_delivery_reminders add column if not exists sort_order integer default 0;
alter table public.order_delivery_reminders add column if not exists source text default 'manual';
alter table public.order_delivery_reminders add column if not exists acknowledged_at timestamptz;
alter table public.order_delivery_reminders add column if not exists completed_at timestamptz;
alter table public.order_delivery_reminders add column if not exists completion_note text;
alter table public.order_delivery_reminders add column if not exists completed_by text;
alter table public.order_delivery_reminders add column if not exists snoozed_until timestamptz;
alter table public.order_delivery_reminders add column if not exists created_at timestamptz default timezone('utc', now());
alter table public.order_delivery_reminders add column if not exists updated_at timestamptz default timezone('utc', now());

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'order_delivery_reminders_plan_id_fkey'
    ) then
        alter table public.order_delivery_reminders
            add constraint order_delivery_reminders_plan_id_fkey
            foreign key (plan_id) references public.order_delivery_plans(id) on delete cascade;
    end if;
end $$;

create index if not exists idx_order_delivery_reminders_plan_id on public.order_delivery_reminders(plan_id);
create index if not exists idx_order_delivery_reminders_trigger_at on public.order_delivery_reminders(trigger_at);

alter table public.order_delivery_plans enable row level security;
alter table public.order_delivery_reminders enable row level security;

do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'order_delivery_plans'
          and policyname = 'order_delivery_plans_all_authenticated'
    ) then
        create policy order_delivery_plans_all_authenticated
            on public.order_delivery_plans
            for all
            to authenticated
            using (true)
            with check (true);
    end if;
end $$;

do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'order_delivery_reminders'
          and policyname = 'order_delivery_reminders_all_authenticated'
    ) then
        create policy order_delivery_reminders_all_authenticated
            on public.order_delivery_reminders
            for all
            to authenticated
            using (true)
            with check (true);
    end if;
end $$;
