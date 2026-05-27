-- Revert accidental BST### product SKU corruption from blind JSON replace in rename_bst_to_sb.
-- Stone suffix renames (DBST -> DSB, etc.) are unchanged.
-- Only restores SKUs that exist in products as BST### (e.g. BST001 -> was wrongly SB001 in order snapshots).

BEGIN;

DO $$
DECLARE
  r record;
  corrupted text;
BEGIN
  FOR r IN
    SELECT sku
    FROM products
    WHERE sku ~ '^BST[0-9]+$'
    ORDER BY length(sku) DESC, sku
  LOOP
    corrupted := regexp_replace(r.sku, '^BST', 'SB');
    IF corrupted IS DISTINCT FROM r.sku THEN
      UPDATE orders
      SET items = replace(items::text, corrupted, r.sku)::jsonb
      WHERE items::text LIKE '%' || corrupted || '%';

      UPDATE offers
      SET items = replace(items::text, corrupted, r.sku)::jsonb
      WHERE items::text LIKE '%' || corrupted || '%';

      UPDATE audit_logs
      SET details = replace(details::text, corrupted, r.sku)::jsonb
      WHERE details::text LIKE '%' || corrupted || '%';
    END IF;
  END LOOP;
END $$;

COMMIT;
