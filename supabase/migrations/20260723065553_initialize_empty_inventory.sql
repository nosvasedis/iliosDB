-- Initial zero inventory declaration.
--
-- The administrator confirmed that no physical inventory count has taken
-- place yet and that all finished-goods inventory must start from zero.
-- This migration clears both canonical operational balances and every legacy
-- compatibility quantity while preserving the pre-cutover snapshot.

LOCK TABLE public.inventory_balances IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.inventory_reservations IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.inventory_events IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.inventory_reconciliation_issues IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.products IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.product_variants IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.product_stock IN SHARE ROW EXCLUSIVE MODE;

WITH nonzero_balances AS (
  SELECT
    balance.product_sku,
    balance.variant_suffix,
    balance.size_info,
    balance.warehouse_id,
    balance.on_hand,
    balance.reserved,
    ROW_NUMBER() OVER (
      ORDER BY
        balance.product_sku,
        balance.variant_suffix,
        balance.size_info,
        balance.warehouse_id
    )::integer AS sequence_no
  FROM public.inventory_balances balance
  WHERE balance.on_hand <> 0
     OR balance.reserved <> 0
)
INSERT INTO public.inventory_events (
  sequence_no,
  operation_type,
  product_sku,
  variant_suffix,
  size_info,
  warehouse_id,
  on_hand_delta,
  reserved_delta,
  on_hand_after,
  reserved_after,
  reference_type,
  reference_id,
  actor_name,
  reason,
  idempotency_key
)
SELECT
  balance.sequence_no,
  'opening_reconciliation',
  balance.product_sku,
  balance.variant_suffix,
  balance.size_info,
  balance.warehouse_id,
  -balance.on_hand,
  -balance.reserved,
  0,
  0,
  'initial_inventory_declaration',
  '2026-07-23',
  'Αρχική μετάπτωση αποθέματος',
  'Αρχική μηδενική απογραφή: δεν έχει πραγματοποιηθεί ακόμη φυσική απογραφή αποθέματος.',
  'initial-zero-inventory:balances'
FROM nonzero_balances balance
ON CONFLICT (idempotency_key, sequence_no) DO NOTHING;

UPDATE public.inventory_reservations
SET quantity = 0,
    state = 'released',
    released_at = COALESCE(released_at, now()),
    updated_at = now()
WHERE state = 'active';

UPDATE public.inventory_balances
SET on_hand = 0,
    reserved = 0,
    version = version + 1,
    updated_at = now()
WHERE on_hand <> 0
   OR reserved <> 0;

UPDATE public.products
SET stock_qty = 0,
    sample_qty = 0,
    stock_by_size = '{}'::jsonb,
    sample_stock_by_size = '{}'::jsonb
WHERE stock_qty <> 0
   OR sample_qty <> 0
   OR COALESCE(stock_by_size, '{}'::jsonb) <> '{}'::jsonb
   OR COALESCE(sample_stock_by_size, '{}'::jsonb) <> '{}'::jsonb;

UPDATE public.product_variants
SET stock_qty = 0,
    stock_by_size = '{}'::jsonb
WHERE stock_qty <> 0
   OR COALESCE(stock_by_size, '{}'::jsonb) <> '{}'::jsonb;

DELETE FROM public.product_stock;

WITH unresolved_inventory_issues AS (
  SELECT
    issue.id,
    issue.product_sku,
    COALESCE(issue.variant_suffix, '') AS variant_suffix,
    COALESCE(issue.size_info, '') AS size_info,
    COALESCE(
      issue.warehouse_id,
      '00000000-0000-0000-0000-000000000001'::uuid
    ) AS warehouse_id,
    ROW_NUMBER() OVER (
      ORDER BY issue.created_at, issue.id
    )::integer AS sequence_no
  FROM public.inventory_reconciliation_issues issue
  WHERE issue.resolved_at IS NULL
    AND issue.product_sku IS NOT NULL
    AND issue.issue_type IN (
      'negative_opening_balance',
      'product_size_total_mismatch',
      'variant_size_total_mismatch',
      'duplicate_location_rows',
      'unknown_warehouse'
    )
)
INSERT INTO public.inventory_events (
  sequence_no,
  operation_type,
  product_sku,
  variant_suffix,
  size_info,
  warehouse_id,
  on_hand_delta,
  reserved_delta,
  on_hand_after,
  reserved_after,
  reference_type,
  reference_id,
  actor_name,
  reason,
  idempotency_key
)
SELECT
  issue.sequence_no,
  'opening_reconciliation',
  issue.product_sku,
  issue.variant_suffix,
  issue.size_info,
  issue.warehouse_id,
  0,
  0,
  0,
  0,
  'inventory_reconciliation',
  issue.id::text,
  'Αρχική μετάπτωση αποθέματος',
  'Επιβεβαιώθηκε μηδενικό αρχικό απόθεμα πριν από την πρώτη φυσική απογραφή.',
  'initial-zero-inventory:reconciliation'
FROM unresolved_inventory_issues issue
ON CONFLICT (idempotency_key, sequence_no) DO NOTHING;

UPDATE public.inventory_reconciliation_issues
SET resolved_at = now(),
    resolution_note = 'Επιβεβαιώθηκε από τον διαχειριστή ότι δεν έχει πραγματοποιηθεί ακόμη φυσική απογραφή και το αρχικό απόθεμα ορίζεται σε μηδέν.'
WHERE resolved_at IS NULL
  AND issue_type IN (
    'negative_opening_balance',
    'product_size_total_mismatch',
    'variant_size_total_mismatch',
    'duplicate_location_rows',
    'unknown_warehouse'
  );
