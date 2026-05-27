-- Rename women's stone code BST -> SB and display name Blue Sky Topaz -> Swiss Blue.
-- Data-only migration; no schema changes.

BEGIN;

-- Pre-check: no (product_sku, new_suffix) collisions after rename
DO $$
DECLARE
  conflict_count integer;
BEGIN
  SELECT COUNT(*) INTO conflict_count
  FROM product_variants pv1
  JOIN product_variants pv2
    ON pv2.product_sku = pv1.product_sku
   AND pv2.suffix = regexp_replace(pv1.suffix, 'BST', 'SB', 'g')
  WHERE pv1.suffix LIKE '%BST%'
    AND pv1.suffix <> pv2.suffix;

  IF conflict_count > 0 THEN
    RAISE EXCEPTION 'BST->SB migration blocked: % product_variants suffix conflicts', conflict_count;
  END IF;
END $$;

-- 1. product_variants
UPDATE product_variants
SET
  suffix = regexp_replace(suffix, 'BST', 'SB', 'g'),
  description = replace(description, 'Blue Sky Topaz', 'Swiss Blue')
WHERE suffix LIKE '%BST%'
   OR description ILIKE '%Blue Sky Topaz%';

-- 2. materials.variant_prices JSON key
UPDATE materials
SET variant_prices = (variant_prices - 'BST') || jsonb_build_object('SB', variant_prices->'BST')
WHERE variant_prices ? 'BST';

-- 3. Scalar variant_suffix columns
UPDATE production_batches
SET variant_suffix = regexp_replace(variant_suffix, 'BST', 'SB', 'g')
WHERE variant_suffix LIKE '%BST%';

UPDATE order_shipment_items
SET variant_suffix = regexp_replace(variant_suffix, 'BST', 'SB', 'g')
WHERE variant_suffix LIKE '%BST%';

UPDATE price_snapshot_items
SET variant_suffix = regexp_replace(variant_suffix, 'BST', 'SB', 'g')
WHERE variant_suffix LIKE '%BST%';

UPDATE stock_movements
SET variant_suffix = regexp_replace(variant_suffix, 'BST', 'SB', 'g')
WHERE variant_suffix LIKE '%BST%';

UPDATE product_stock
SET variant_suffix = regexp_replace(variant_suffix, 'BST', 'SB', 'g')
WHERE variant_suffix LIKE '%BST%';

-- 4. orders.items JSON (line items + embedded product snapshots)
UPDATE orders
SET items = replace(replace(items::text, 'Blue Sky Topaz', 'Swiss Blue'), 'BST', 'SB')::jsonb
WHERE items::text LIKE '%BST%'
   OR items::text ILIKE '%Blue Sky Topaz%';

-- 5. offers.items JSON
UPDATE offers
SET items = replace(replace(items::text, 'Blue Sky Topaz', 'Swiss Blue'), 'BST', 'SB')::jsonb
WHERE items::text LIKE '%BST%'
   OR items::text ILIKE '%Blue Sky Topaz%';

-- 6. audit_logs.details JSON (historical consistency)
UPDATE audit_logs
SET details = replace(replace(details::text, 'Blue Sky Topaz', 'Swiss Blue'), 'BST', 'SB')::jsonb
WHERE details::text LIKE '%BST%'
   OR details::text ILIKE '%Blue Sky Topaz%';

COMMIT;
