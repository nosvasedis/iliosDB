create table if not exists public.order_shipments (
    id uuid primary key,
    order_id uuid not null references public.orders(id) on delete cascade,
    shipment_no integer not null,
    status text not null check (status in ('draft', 'dispatched', 'delivered', 'cancelled')),
    created_at timestamptz not null default now(),
    dispatched_at timestamptz null,
    delivered_at timestamptz null,
    notes text null,
    customer_snapshot text null,
    seller_snapshot text null,
    net_amount numeric(12,2) not null default 0,
    vat_amount numeric(12,2) not null default 0,
    gross_amount numeric(12,2) not null default 0,
    discount_allocated_amount numeric(12,2) not null default 0,
    unique (order_id, shipment_no)
);

create index if not exists idx_order_shipments_order_id on public.order_shipments(order_id);
create index if not exists idx_order_shipments_status on public.order_shipments(status);

create table if not exists public.order_shipment_items (
    id uuid primary key,
    shipment_id uuid not null references public.order_shipments(id) on delete cascade,
    order_id uuid not null references public.orders(id) on delete cascade,
    order_item_key text not null,
    sku text not null,
    variant_suffix text null,
    size_info text null,
    quantity integer not null check (quantity > 0),
    unit_price_at_order numeric(12,2) not null default 0,
    net_amount numeric(12,2) not null default 0,
    vat_amount numeric(12,2) not null default 0,
    gross_amount numeric(12,2) not null default 0,
    realized_unit_cost numeric(12,2) not null default 0,
    realized_total_cost numeric(12,2) not null default 0
);

create index if not exists idx_order_shipment_items_shipment_id on public.order_shipment_items(shipment_id);
create index if not exists idx_order_shipment_items_order_id on public.order_shipment_items(order_id);
create index if not exists idx_order_shipment_items_order_item_key on public.order_shipment_items(order_item_key);
