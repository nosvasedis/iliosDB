-- Add women's stone code AZM (Αζουρίτης - Μαλαχίτης).
-- Normalize legacy AZA / trailing-AZ suffixes to AZM on women's products only.
-- Data-only migration; no schema changes.

BEGIN;

-- Helper: suffix transform (AZA first, then trailing AZ — order matters to avoid AZMM corruption)
CREATE OR REPLACE FUNCTION pg_temp.azm_suffix_transform(suffix text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(regexp_replace(suffix, 'AZA', 'AZM', 'g'), 'AZ$', 'AZM');
$$;

-- Rebuild description from transformed suffix (finish prefix + AZM stone name)
CREATE OR REPLACE FUNCTION pg_temp.azm_variant_description(suffix text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN suffix = 'AZM' THEN 'Λουστρέ - Αζουρίτης - Μαλαχίτης'
    WHEN suffix ~ '^P.*AZM$' THEN 'Πατίνα - Αζουρίτης - Μαλαχίτης'
    WHEN suffix ~ '^X.*AZM$' THEN 'Επίχρυσο - Αζουρίτης - Μαλαχίτης'
    WHEN suffix ~ '^D.*AZM$' THEN 'Δίχρωμο - Αζουρίτης - Μαλαχίτης'
    WHEN suffix ~ '^H.*AZM$' THEN 'Επιπλατινωμένο - Αζουρίτης - Μαλαχίτης'
    ELSE 'Αζουρίτης - Μαλαχίτης'
  END;
$$;

-- Pre-check: no (product_sku, new_suffix) collisions after rename (women's products only)
DO $$
DECLARE
  conflict_count integer;
BEGIN
  SELECT COUNT(*) INTO conflict_count
  FROM product_variants pv1
  JOIN products p1 ON p1.sku = pv1.product_sku AND p1.gender = 'Women'
  JOIN product_variants pv2
    ON pv2.product_sku = pv1.product_sku
   AND pv2.suffix = pg_temp.azm_suffix_transform(pv1.suffix)
  WHERE pv1.suffix <> pv2.suffix
    AND (
      pv1.suffix ~ 'AZA'
      OR (pv1.suffix ~ 'AZ$' AND pv1.suffix <> 'AZM')
    );

  IF conflict_count > 0 THEN
    RAISE EXCEPTION 'AZA/AZ->AZM migration blocked: % product_variants suffix conflicts', conflict_count;
  END IF;
END $$;

-- 1. product_variants (women's products only)
UPDATE product_variants pv
SET
  suffix = pg_temp.azm_suffix_transform(pv.suffix),
  description = pg_temp.azm_variant_description(pg_temp.azm_suffix_transform(pv.suffix))
FROM products p
WHERE p.sku = pv.product_sku
  AND p.gender = 'Women'
  AND (
    pv.suffix ~ 'AZA'
    OR (pv.suffix ~ 'AZ$' AND pv.suffix <> 'AZM')
    OR (pv.suffix ~ 'AZM$' AND pv.description NOT ILIKE '%Αζουρίτης - Μαλαχίτης%')
  );

-- 2. materials.variant_prices JSON keys (AZA first, then AZ)
UPDATE materials
SET variant_prices = (variant_prices - 'AZA')
  || jsonb_build_object('AZM', COALESCE(variant_prices->'AZM', variant_prices->'AZA'))
WHERE variant_prices ? 'AZA';

UPDATE materials
SET variant_prices = (variant_prices - 'AZ')
  || jsonb_build_object('AZM', COALESCE(variant_prices->'AZM', variant_prices->'AZ'))
WHERE variant_prices ? 'AZ';

-- 3. Scalar variant_suffix columns (women's products only via sku join)
UPDATE production_batches pb
SET variant_suffix = pg_temp.azm_suffix_transform(pb.variant_suffix)
FROM products p
WHERE p.sku = pb.sku
  AND p.gender = 'Women'
  AND pb.variant_suffix IS NOT NULL
  AND (
    pb.variant_suffix ~ 'AZA'
    OR (pb.variant_suffix ~ 'AZ$' AND pb.variant_suffix <> 'AZM')
  );

UPDATE order_shipment_items osi
SET variant_suffix = pg_temp.azm_suffix_transform(osi.variant_suffix)
FROM products p
WHERE p.sku = osi.sku
  AND p.gender = 'Women'
  AND osi.variant_suffix IS NOT NULL
  AND (
    osi.variant_suffix ~ 'AZA'
    OR (osi.variant_suffix ~ 'AZ$' AND osi.variant_suffix <> 'AZM')
  );

UPDATE price_snapshot_items psi
SET variant_suffix = pg_temp.azm_suffix_transform(psi.variant_suffix)
FROM products p
WHERE p.sku = psi.product_sku
  AND p.gender = 'Women'
  AND psi.variant_suffix IS NOT NULL
  AND (
    psi.variant_suffix ~ 'AZA'
    OR (psi.variant_suffix ~ 'AZ$' AND psi.variant_suffix <> 'AZM')
  );

UPDATE stock_movements sm
SET variant_suffix = pg_temp.azm_suffix_transform(sm.variant_suffix)
FROM products p
WHERE p.sku = sm.product_sku
  AND p.gender = 'Women'
  AND sm.variant_suffix IS NOT NULL
  AND (
    sm.variant_suffix ~ 'AZA'
    OR (sm.variant_suffix ~ 'AZ$' AND sm.variant_suffix <> 'AZM')
  );

UPDATE product_stock ps
SET variant_suffix = pg_temp.azm_suffix_transform(ps.variant_suffix)
FROM products p
WHERE p.sku = ps.product_sku
  AND p.gender = 'Women'
  AND ps.variant_suffix IS NOT NULL
  AND (
    ps.variant_suffix ~ 'AZA'
    OR (ps.variant_suffix ~ 'AZ$' AND ps.variant_suffix <> 'AZM')
  );

-- 4. JSON snapshots: description text only (do NOT blind-replace AZ in JSON)
UPDATE orders
SET items = replace(
  replace(
    replace(items::text, 'Αζουρίτης', 'Αζουρίτης - Μαλαχίτης'),
    'Azurite', 'Αζουρίτης - Μαλαχίτης'
  ),
  'azurite', 'Αζουρίτης - Μαλαχίτης'
)::jsonb
WHERE items::text ILIKE '%αζουρίτ%'
   OR items::text ILIKE '%azurite%';

UPDATE offers
SET items = replace(
  replace(
    replace(items::text, 'Αζουρίτης', 'Αζουρίτης - Μαλαχίτης'),
    'Azurite', 'Αζουρίτης - Μαλαχίτης'
  ),
  'azurite', 'Αζουρίτης - Μαλαχίτης'
)::jsonb
WHERE items::text ILIKE '%αζουρίτ%'
   OR items::text ILIKE '%azurite%';

UPDATE audit_logs
SET details = replace(
  replace(
    replace(details::text, 'Αζουρίτης', 'Αζουρίτης - Μαλαχίτης'),
    'Azurite', 'Αζουρίτης - Μαλαχίτης'
  ),
  'azurite', 'Αζουρίτης - Μαλαχίτης'
)::jsonb
WHERE details::text ILIKE '%αζουρίτ%'
   OR details::text ILIKE '%azurite%';

COMMIT;
