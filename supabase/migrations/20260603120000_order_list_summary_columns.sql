-- Lightweight order list fields so list views avoid downloading the full items JSON blob.

CREATE OR REPLACE FUNCTION public.order_item_total_qty(items jsonb)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT COALESCE(SUM((elem->>'quantity')::integer), 0)::integer
  FROM jsonb_array_elements(COALESCE(items, '[]'::jsonb)) AS elem;
$$;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS item_count integer GENERATED ALWAYS AS (jsonb_array_length(COALESCE(items, '[]'::jsonb))) STORED;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS item_total_qty integer GENERATED ALWAYS AS (public.order_item_total_qty(items)) STORED;
