-- Shipment-aware canonical inventory demand.
--
-- The previous availability view matched shipments to order lines only by the
-- modern line_id. Most historical shipment rows predate line_id, so quantities
-- that had physically left the business were still presented as outstanding
-- demand. This migration establishes one order-demand read model that:
--   * uses line_id when it is available;
--   * falls back to the canonical inventory identity for legacy shipments;
--   * aggregates duplicate order lines before subtracting fulfillment;
--   * subtracts active reservations exactly once;
--   * exposes demand identities even before their first physical balance row.

CREATE OR REPLACE FUNCTION public.inventory_normalized_size_read_v1(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH cleaned AS (
    SELECT regexp_replace(BTRIM(COALESCE(p_value, '')), '\s+', ' ', 'g') AS value
  )
  SELECT CASE
    WHEN value = '' THEN ''
    WHEN value ~ '^[0-9]+([,.][0-9]+)?$'
      THEN replace(value, ',', '.')::numeric::text
    WHEN value ~* '^[0-9]+([,.][0-9]+)?\s*cm$'
      THEN replace(regexp_replace(lower(value), '\s*cm$', ''), ',', '.')::numeric::text || 'cm'
    ELSE upper(value)
  END
  FROM cleaned;
$$;

REVOKE ALL ON FUNCTION public.inventory_normalized_size_read_v1(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inventory_normalized_size_read_v1(text)
  TO authenticated, service_role;

CREATE OR REPLACE VIEW public.inventory_order_demand_v
WITH (security_invoker = true)
AS
WITH active_order_lines AS (
  SELECT
    order_row.id AS order_id,
    order_row.status AS order_status,
    item.ordinality::integer AS item_position,
    item.value->>'sku' AS product_sku,
    COALESCE(item.value->>'variant_suffix', '') AS variant_suffix,
    public.inventory_normalized_size_read_v1(item.value->>'size_info') AS size_info,
    COALESCE(item.value->>'line_id', '') AS line_id,
    GREATEST(COALESCE((item.value->>'quantity')::integer, 0), 0)::integer
      AS ordered_quantity
  FROM public.orders order_row
  CROSS JOIN LATERAL jsonb_array_elements(
    COALESCE(order_row.items, '[]'::jsonb)
  ) WITH ORDINALITY AS item(value, ordinality)
  WHERE order_row.status IN (
    'Pending',
    'In Production',
    'Ready',
    'Partially Delivered'
  )
    AND NULLIF(BTRIM(item.value->>'sku'), '') IS NOT NULL
),
stable_line_identity AS (
  SELECT
    line.order_id,
    line.line_id,
    MIN(line.product_sku) AS product_sku,
    MIN(line.variant_suffix) AS variant_suffix,
    MIN(line.size_info) AS size_info
  FROM active_order_lines line
  WHERE line.line_id <> ''
  GROUP BY line.order_id, line.line_id
  HAVING COUNT(DISTINCT (
    line.product_sku,
    line.variant_suffix,
    line.size_info
  )) = 1
),
ordered_by_identity AS (
  SELECT
    line.order_id,
    MIN(line.order_status) AS order_status,
    line.product_sku,
    line.variant_suffix,
    line.size_info,
    SUM(line.ordered_quantity)::integer AS ordered_quantity
  FROM active_order_lines line
  GROUP BY
    line.order_id,
    line.product_sku,
    line.variant_suffix,
    line.size_info
),
normalized_shipment_lines AS (
  SELECT
    shipment.order_id,
    COALESCE(line.product_sku, shipment_item.sku) AS product_sku,
    COALESCE(
      line.variant_suffix,
      COALESCE(shipment_item.variant_suffix, '')
    ) AS variant_suffix,
    COALESCE(
      line.size_info,
      public.inventory_normalized_size_read_v1(shipment_item.size_info)
    ) AS size_info,
    GREATEST(COALESCE(shipment_item.quantity, 0), 0)::integer
      AS shipped_quantity,
    shipment.shipped_at
  FROM public.order_shipments shipment
  JOIN public.order_shipment_items shipment_item
    ON shipment_item.shipment_id = shipment.id
  LEFT JOIN stable_line_identity line
    ON line.order_id = shipment.order_id
   AND line.line_id = COALESCE(shipment_item.line_id::text, '')
   AND COALESCE(shipment_item.line_id::text, '') <> ''
),
shipped_by_identity AS (
  SELECT
    shipment.order_id,
    shipment.product_sku,
    shipment.variant_suffix,
    shipment.size_info,
    SUM(shipment.shipped_quantity)::integer AS shipped_quantity,
    MAX(shipment.shipped_at) AS latest_shipped_at
  FROM normalized_shipment_lines shipment
  GROUP BY
    shipment.order_id,
    shipment.product_sku,
    shipment.variant_suffix,
    shipment.size_info
),
normalized_active_reservations AS (
  SELECT
    reservation.order_id,
    COALESCE(line.product_sku, reservation.product_sku) AS product_sku,
    COALESCE(line.variant_suffix, reservation.variant_suffix) AS variant_suffix,
    COALESCE(
      line.size_info,
      public.inventory_normalized_size_read_v1(reservation.size_info)
    ) AS size_info,
    GREATEST(COALESCE(reservation.quantity, 0), 0)::integer
      AS reserved_quantity
  FROM public.inventory_reservations reservation
  LEFT JOIN stable_line_identity line
    ON line.order_id = reservation.order_id
   AND line.line_id = reservation.order_line_id
  WHERE reservation.state = 'active'
),
reserved_by_identity AS (
  SELECT
    reservation.order_id,
    reservation.product_sku,
    reservation.variant_suffix,
    reservation.size_info,
    SUM(reservation.reserved_quantity)::integer AS reserved_quantity
  FROM normalized_active_reservations reservation
  GROUP BY
    reservation.order_id,
    reservation.product_sku,
    reservation.variant_suffix,
    reservation.size_info
),
demand_per_order AS (
  SELECT
    ordered.order_id,
    ordered.order_status,
    ordered.product_sku,
    ordered.variant_suffix,
    ordered.size_info,
    ordered.ordered_quantity,
    COALESCE(shipped.shipped_quantity, 0)::integer AS shipped_quantity,
    GREATEST(
      ordered.ordered_quantity - COALESCE(shipped.shipped_quantity, 0),
      0
    )::integer AS remaining_quantity,
    LEAST(
      COALESCE(reserved.reserved_quantity, 0),
      GREATEST(
        ordered.ordered_quantity - COALESCE(shipped.shipped_quantity, 0),
        0
      )
    )::integer AS reserved_quantity,
    GREATEST(
      ordered.ordered_quantity
        - COALESCE(shipped.shipped_quantity, 0)
        - COALESCE(reserved.reserved_quantity, 0),
      0
    )::integer AS outstanding_demand,
    shipped.latest_shipped_at
  FROM ordered_by_identity ordered
  LEFT JOIN shipped_by_identity shipped
    ON shipped.order_id = ordered.order_id
   AND shipped.product_sku = ordered.product_sku
   AND shipped.variant_suffix = ordered.variant_suffix
   AND shipped.size_info = ordered.size_info
  LEFT JOIN reserved_by_identity reserved
    ON reserved.order_id = ordered.order_id
   AND reserved.product_sku = ordered.product_sku
   AND reserved.variant_suffix = ordered.variant_suffix
   AND reserved.size_info = ordered.size_info
)
SELECT
  demand.order_id,
  demand.order_status,
  demand.product_sku,
  demand.variant_suffix,
  demand.size_info,
  demand.ordered_quantity,
  demand.shipped_quantity,
  demand.remaining_quantity,
  demand.reserved_quantity,
  demand.outstanding_demand,
  CASE
    WHEN product.production_type = 'Imported' THEN 0
    ELSE demand.outstanding_demand
  END::integer AS production_demand,
  CASE
    WHEN product.production_type = 'Imported' THEN demand.outstanding_demand
    ELSE 0
  END::integer AS purchase_demand,
  demand.latest_shipped_at
FROM demand_per_order demand
JOIN public.products product
  ON product.sku = demand.product_sku;

REVOKE ALL ON public.inventory_order_demand_v FROM PUBLIC, anon;
GRANT SELECT ON public.inventory_order_demand_v TO authenticated, service_role;

CREATE OR REPLACE VIEW public.inventory_availability_v
WITH (security_invoker = true)
AS
WITH supplier_incoming AS (
  SELECT
    item->>'item_id' AS product_sku,
    COALESCE(item->>'variant_suffix', '') AS variant_suffix,
    public.inventory_normalized_size_read_v1(item->>'size_info') AS size_info,
    COALESCE(
      supplier_order.receipt_warehouse_id,
      '00000000-0000-0000-0000-000000000001'::uuid
    ) AS warehouse_id,
    SUM(
      GREATEST(COALESCE((item->>'quantity')::integer, 0), 0)
    )::integer AS incoming
  FROM public.supplier_orders supplier_order
  CROSS JOIN LATERAL jsonb_array_elements(
    COALESCE(supplier_order.items, '[]'::jsonb)
  ) item
  WHERE supplier_order.status = 'Pending'
    AND item->>'item_type' = 'Product'
    AND NULLIF(BTRIM(item->>'item_id'), '') IS NOT NULL
  GROUP BY
    item->>'item_id',
    COALESCE(item->>'variant_suffix', ''),
    public.inventory_normalized_size_read_v1(item->>'size_info'),
    COALESCE(
      supplier_order.receipt_warehouse_id,
      '00000000-0000-0000-0000-000000000001'::uuid
    )
),
open_demand AS (
  SELECT
    demand.product_sku,
    demand.variant_suffix,
    demand.size_info,
    SUM(demand.ordered_quantity)::integer AS open_order_quantity,
    SUM(demand.shipped_quantity)::integer AS shipped_quantity,
    SUM(demand.remaining_quantity)::integer AS remaining_order_quantity,
    SUM(demand.reserved_quantity)::integer AS allocated_quantity,
    SUM(demand.outstanding_demand)::integer AS outstanding_demand,
    SUM(demand.production_demand)::integer AS production_demand,
    SUM(demand.purchase_demand)::integer AS purchase_demand,
    MAX(demand.latest_shipped_at) AS latest_shipped_at
  FROM public.inventory_order_demand_v demand
  GROUP BY demand.product_sku, demand.variant_suffix, demand.size_info
),
identity_universe AS (
  SELECT
    balance.product_sku,
    balance.variant_suffix,
    balance.size_info,
    balance.warehouse_id
  FROM public.inventory_balances balance

  UNION

  SELECT
    incoming.product_sku,
    incoming.variant_suffix,
    incoming.size_info,
    incoming.warehouse_id
  FROM supplier_incoming incoming

  UNION

  SELECT
    demand.product_sku,
    demand.variant_suffix,
    demand.size_info,
    '00000000-0000-0000-0000-000000000001'::uuid
  FROM open_demand demand

  UNION

  SELECT
    policy.product_sku,
    policy.variant_suffix,
    policy.size_info,
    policy.warehouse_id
  FROM public.inventory_reorder_policies policy
)
SELECT
  identity.product_sku,
  identity.variant_suffix,
  identity.size_info,
  identity.warehouse_id,
  warehouse.name AS warehouse_name,
  warehouse.type AS warehouse_type,
  COALESCE(balance.on_hand, 0)::integer AS on_hand,
  COALESCE(balance.reserved, 0)::integer AS reserved,
  (
    COALESCE(balance.on_hand, 0) - COALESCE(balance.reserved, 0)
  )::integer AS available,
  COALESCE(incoming.incoming, 0)::integer AS incoming,
  CASE
    WHEN identity.warehouse_id =
      '00000000-0000-0000-0000-000000000001'::uuid
      THEN COALESCE(demand.outstanding_demand, 0)
    ELSE 0
  END::integer AS outstanding_demand,
  CASE
    WHEN identity.warehouse_id =
      '00000000-0000-0000-0000-000000000001'::uuid
      THEN COALESCE(demand.production_demand, 0)
    ELSE 0
  END::integer AS production_demand,
  CASE
    WHEN identity.warehouse_id =
      '00000000-0000-0000-0000-000000000001'::uuid
      THEN COALESCE(demand.purchase_demand, 0)
    ELSE 0
  END::integer AS purchase_demand,
  (
    COALESCE(balance.on_hand, 0)
      - COALESCE(balance.reserved, 0)
      + COALESCE(incoming.incoming, 0)
      - CASE
          WHEN identity.warehouse_id =
            '00000000-0000-0000-0000-000000000001'::uuid
            THEN COALESCE(demand.outstanding_demand, 0)
          ELSE 0
        END
  )::integer AS projected_available,
  COALESCE(policy.reorder_point, 0)::integer AS reorder_point,
  policy.preferred_supplier_id,
  COALESCE(
    balance.updated_at,
    demand.latest_shipped_at,
    '1970-01-01 00:00:00+00'::timestamptz
  ) AS updated_at,
  CASE
    WHEN identity.warehouse_id =
      '00000000-0000-0000-0000-000000000001'::uuid
      THEN COALESCE(demand.open_order_quantity, 0)
    ELSE 0
  END::integer AS open_order_quantity,
  CASE
    WHEN identity.warehouse_id =
      '00000000-0000-0000-0000-000000000001'::uuid
      THEN COALESCE(demand.shipped_quantity, 0)
    ELSE 0
  END::integer AS shipped_quantity,
  CASE
    WHEN identity.warehouse_id =
      '00000000-0000-0000-0000-000000000001'::uuid
      THEN COALESCE(demand.remaining_order_quantity, 0)
    ELSE 0
  END::integer AS remaining_order_quantity,
  CASE
    WHEN identity.warehouse_id =
      '00000000-0000-0000-0000-000000000001'::uuid
      THEN COALESCE(demand.allocated_quantity, 0)
    ELSE 0
  END::integer AS allocated_quantity,
  CASE
    WHEN identity.warehouse_id =
      '00000000-0000-0000-0000-000000000001'::uuid
      THEN demand.latest_shipped_at
    ELSE NULL
  END AS latest_shipped_at
FROM identity_universe identity
JOIN public.warehouses warehouse
  ON warehouse.id = identity.warehouse_id
LEFT JOIN public.inventory_balances balance
  ON balance.product_sku = identity.product_sku
 AND balance.variant_suffix = identity.variant_suffix
 AND balance.size_info = identity.size_info
 AND balance.warehouse_id = identity.warehouse_id
LEFT JOIN supplier_incoming incoming
  ON incoming.product_sku = identity.product_sku
 AND incoming.variant_suffix = identity.variant_suffix
 AND incoming.size_info = identity.size_info
 AND incoming.warehouse_id = identity.warehouse_id
LEFT JOIN open_demand demand
  ON demand.product_sku = identity.product_sku
 AND demand.variant_suffix = identity.variant_suffix
 AND demand.size_info = identity.size_info
LEFT JOIN public.inventory_reorder_policies policy
  ON policy.product_sku = identity.product_sku
 AND policy.variant_suffix = identity.variant_suffix
 AND policy.size_info = identity.size_info
 AND policy.warehouse_id = identity.warehouse_id;

REVOKE ALL ON public.inventory_availability_v FROM PUBLIC, anon;
GRANT SELECT ON public.inventory_availability_v TO authenticated, service_role;

COMMENT ON VIEW public.inventory_order_demand_v IS
  'Canonical active order demand after shipped quantities and active inventory reservations, with legacy shipment fallback by inventory identity.';
COMMENT ON VIEW public.inventory_availability_v IS
  'Canonical inventory availability with shipment-aware order demand, incoming stock, allocations and projected availability.';
