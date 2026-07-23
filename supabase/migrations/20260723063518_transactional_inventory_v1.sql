-- Transactional finished-goods inventory v1.
--
-- This migration intentionally keeps the legacy product quantity columns during
-- the transition. All new mutations go through the normalized balance,
-- reservation and event tables. Legacy quantities are maintained as a temporary
-- compatibility projection by private.sync_legacy_inventory_projection().

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS source_offer_id text;

ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS converted_order_id text;

ALTER TABLE public.supplier_orders
  ADD COLUMN IF NOT EXISTS receipt_warehouse_id uuid;

ALTER TABLE public.production_batches
  ADD COLUMN IF NOT EXISTS fulfillment_source text NOT NULL DEFAULT 'production',
  ADD COLUMN IF NOT EXISTS legacy_inventory_issued boolean NOT NULL DEFAULT false;

UPDATE public.production_batches
SET fulfillment_source = 'legacy_inventory_issued',
    legacy_inventory_issued = true
WHERE type = 'Από Stock'
  AND fulfillment_source = 'production';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'production_batches_fulfillment_source_check'
  ) THEN
    ALTER TABLE public.production_batches
      ADD CONSTRAINT production_batches_fulfillment_source_check
      CHECK (fulfillment_source IN ('production', 'inventory_reserved', 'legacy_inventory_issued')) NOT VALID;
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.inventory_balances (
  product_sku text NOT NULL,
  variant_suffix text NOT NULL DEFAULT '',
  size_info text NOT NULL DEFAULT '',
  warehouse_id uuid NOT NULL,
  on_hand integer NOT NULL DEFAULT 0,
  reserved integer NOT NULL DEFAULT 0,
  version bigint NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_sku, variant_suffix, size_info, warehouse_id)
);

CREATE TABLE IF NOT EXISTS public.inventory_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id text NOT NULL,
  order_line_id text NOT NULL,
  product_sku text NOT NULL,
  variant_suffix text NOT NULL DEFAULT '',
  size_info text NOT NULL DEFAULT '',
  warehouse_id uuid NOT NULL,
  initial_quantity integer NOT NULL,
  quantity integer NOT NULL,
  state text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  consumed_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS inventory_reservations_active_identity_uidx
  ON public.inventory_reservations (
    order_id, order_line_id, product_sku, variant_suffix, size_info, warehouse_id
  )
  WHERE state = 'active';

CREATE INDEX IF NOT EXISTS inventory_reservations_order_idx
  ON public.inventory_reservations (order_id, state);

CREATE TABLE IF NOT EXISTS public.inventory_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_no integer NOT NULL DEFAULT 1,
  operation_type text NOT NULL,
  product_sku text NOT NULL,
  variant_suffix text NOT NULL DEFAULT '',
  size_info text NOT NULL DEFAULT '',
  warehouse_id uuid NOT NULL,
  on_hand_delta integer NOT NULL DEFAULT 0,
  reserved_delta integer NOT NULL DEFAULT 0,
  on_hand_after integer NOT NULL,
  reserved_after integer NOT NULL,
  reference_type text,
  reference_id text,
  reference_line_id text,
  transfer_group_id uuid,
  reversal_of uuid,
  actor_user_id uuid,
  actor_name text,
  reason text NOT NULL,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (idempotency_key, sequence_no)
);

CREATE INDEX IF NOT EXISTS inventory_events_identity_created_idx
  ON public.inventory_events (product_sku, variant_suffix, size_info, warehouse_id, created_at DESC);

CREATE INDEX IF NOT EXISTS inventory_events_reference_idx
  ON public.inventory_events (reference_type, reference_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.inventory_command_results (
  idempotency_key text PRIMARY KEY,
  operation_type text NOT NULL,
  result jsonb NOT NULL,
  actor_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.inventory_cutover_balance_snapshot (
  snapshot_id uuid NOT NULL,
  captured_at timestamptz NOT NULL,
  product_sku text NOT NULL,
  variant_suffix text NOT NULL DEFAULT '',
  size_info text NOT NULL DEFAULT '',
  warehouse_id uuid NOT NULL,
  on_hand integer NOT NULL,
  reserved integer NOT NULL,
  PRIMARY KEY (snapshot_id, product_sku, variant_suffix, size_info, warehouse_id)
);

CREATE TABLE IF NOT EXISTS public.inventory_reorder_policies (
  product_sku text NOT NULL,
  variant_suffix text NOT NULL DEFAULT '',
  size_info text NOT NULL DEFAULT '',
  warehouse_id uuid NOT NULL,
  reorder_point integer NOT NULL DEFAULT 0,
  preferred_supplier_id uuid,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_sku, variant_suffix, size_info, warehouse_id)
);

CREATE TABLE IF NOT EXISTS public.inventory_shipment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid NOT NULL,
  shipment_item_id uuid NOT NULL,
  reservation_id uuid NOT NULL,
  product_sku text NOT NULL,
  variant_suffix text NOT NULL DEFAULT '',
  size_info text NOT NULL DEFAULT '',
  warehouse_id uuid NOT NULL,
  quantity integer NOT NULL,
  issue_event_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inventory_shipment_allocations_shipment_idx
  ON public.inventory_shipment_allocations (shipment_id, shipment_item_id);

CREATE TABLE IF NOT EXISTS public.inventory_reconciliation_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_type text NOT NULL,
  severity text NOT NULL DEFAULT 'blocking',
  product_sku text,
  variant_suffix text NOT NULL DEFAULT '',
  size_info text NOT NULL DEFAULT '',
  warehouse_id uuid,
  expected_quantity integer,
  actual_quantity integer,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved_at timestamptz,
  resolved_by uuid,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inventory_reconciliation_unresolved_idx
  ON public.inventory_reconciliation_issues (severity, product_sku)
  WHERE resolved_at IS NULL;

-- Seed the normalized balance model from legacy sources. Size maps are treated
-- as a breakdown, never added on top of aggregate quantities.
WITH product_size_rows AS (
  SELECT p.sku,
         entry.key AS size_info,
         CASE WHEN entry.value ~ '^-?[0-9]+$' THEN entry.value::integer ELSE 0 END AS quantity
  FROM public.products p
  CROSS JOIN LATERAL jsonb_each_text(COALESCE(to_jsonb(p.stock_by_size), '{}'::jsonb)) entry
  WHERE NOT EXISTS (SELECT 1 FROM public.product_variants pv WHERE pv.product_sku = p.sku)
),
product_aggregate_rows AS (
  SELECT p.sku, ''::text AS size_info, COALESCE(p.stock_qty, 0)::integer AS quantity
  FROM public.products p
  WHERE NOT EXISTS (SELECT 1 FROM public.product_variants pv WHERE pv.product_sku = p.sku)
    AND COALESCE(to_jsonb(p.stock_by_size), '{}'::jsonb) = '{}'::jsonb
)
INSERT INTO public.inventory_balances (
  product_sku, variant_suffix, size_info, warehouse_id, on_hand
)
SELECT sku, '', size_info, '00000000-0000-0000-0000-000000000001'::uuid, quantity
FROM (
  SELECT * FROM product_size_rows
  UNION ALL
  SELECT * FROM product_aggregate_rows
) seeded
ON CONFLICT (product_sku, variant_suffix, size_info, warehouse_id)
DO UPDATE SET on_hand = EXCLUDED.on_hand, updated_at = now();

WITH variant_size_rows AS (
  SELECT pv.product_sku,
         pv.suffix,
         entry.key AS size_info,
         CASE WHEN entry.value ~ '^-?[0-9]+$' THEN entry.value::integer ELSE 0 END AS quantity
  FROM public.product_variants pv
  CROSS JOIN LATERAL jsonb_each_text(COALESCE(to_jsonb(pv.stock_by_size), '{}'::jsonb)) entry
),
variant_aggregate_rows AS (
  SELECT pv.product_sku,
         pv.suffix,
         ''::text AS size_info,
         COALESCE(pv.stock_qty, 0)::integer AS quantity
  FROM public.product_variants pv
  WHERE COALESCE(to_jsonb(pv.stock_by_size), '{}'::jsonb) = '{}'::jsonb
)
INSERT INTO public.inventory_balances (
  product_sku, variant_suffix, size_info, warehouse_id, on_hand
)
SELECT product_sku, COALESCE(suffix, ''), size_info,
       '00000000-0000-0000-0000-000000000001'::uuid, quantity
FROM (
  SELECT * FROM variant_size_rows
  UNION ALL
  SELECT * FROM variant_aggregate_rows
) seeded
ON CONFLICT (product_sku, variant_suffix, size_info, warehouse_id)
DO UPDATE SET on_hand = EXCLUDED.on_hand, updated_at = now();

WITH showroom_size_rows AS (
  SELECT p.sku,
         entry.key AS size_info,
         CASE WHEN entry.value ~ '^-?[0-9]+$' THEN entry.value::integer ELSE 0 END AS quantity
  FROM public.products p
  CROSS JOIN LATERAL jsonb_each_text(COALESCE(to_jsonb(p.sample_stock_by_size), '{}'::jsonb)) entry
  WHERE NOT EXISTS (SELECT 1 FROM public.product_variants pv WHERE pv.product_sku = p.sku)
),
showroom_aggregate_rows AS (
  SELECT p.sku, ''::text AS size_info, COALESCE(p.sample_qty, 0)::integer AS quantity
  FROM public.products p
  WHERE NOT EXISTS (SELECT 1 FROM public.product_variants pv WHERE pv.product_sku = p.sku)
    AND COALESCE(to_jsonb(p.sample_stock_by_size), '{}'::jsonb) = '{}'::jsonb
)
INSERT INTO public.inventory_balances (
  product_sku, variant_suffix, size_info, warehouse_id, on_hand
)
SELECT sku, '', size_info, '00000000-0000-0000-0000-000000000002'::uuid, quantity
FROM (
  SELECT * FROM showroom_size_rows
  UNION ALL
  SELECT * FROM showroom_aggregate_rows
) seeded
ON CONFLICT (product_sku, variant_suffix, size_info, warehouse_id)
DO UPDATE SET on_hand = EXCLUDED.on_hand, updated_at = now();

INSERT INTO public.inventory_balances (
  product_sku, variant_suffix, size_info, warehouse_id, on_hand
)
SELECT ps.product_sku,
       COALESCE(ps.variant_suffix, ''),
       COALESCE(ps.size_info, ''),
       ps.warehouse_id,
       SUM(COALESCE(ps.quantity, 0))::integer
FROM public.product_stock ps
WHERE ps.warehouse_id <> '00000000-0000-0000-0000-000000000001'::uuid
  AND (
    ps.warehouse_id <> '00000000-0000-0000-0000-000000000002'::uuid
    OR ps.variant_suffix IS NOT NULL
  )
GROUP BY ps.product_sku, COALESCE(ps.variant_suffix, ''), COALESCE(ps.size_info, ''), ps.warehouse_id
ON CONFLICT (product_sku, variant_suffix, size_info, warehouse_id)
DO UPDATE SET on_hand = EXCLUDED.on_hand, updated_at = now();

DO $$
DECLARE
  v_snapshot_id uuid := gen_random_uuid();
  v_captured_at timestamptz := now();
BEGIN
  INSERT INTO public.inventory_cutover_balance_snapshot (
    snapshot_id, captured_at, product_sku, variant_suffix, size_info,
    warehouse_id, on_hand, reserved
  )
  SELECT v_snapshot_id, v_captured_at, balance.product_sku, balance.variant_suffix,
         balance.size_info, balance.warehouse_id, balance.on_hand, balance.reserved
  FROM public.inventory_balances balance;
END;
$$;

-- Capture reconciliation blockers before enforcing new-write constraints.
INSERT INTO public.inventory_reconciliation_issues (
  issue_type, product_sku, variant_suffix, size_info, warehouse_id,
  expected_quantity, actual_quantity, details
)
SELECT 'negative_opening_balance', product_sku, variant_suffix, size_info, warehouse_id,
       0, on_hand, jsonb_build_object('message', 'Το αρχικό φυσικό απόθεμα είναι αρνητικό.')
FROM public.inventory_balances
WHERE on_hand < 0
  AND NOT EXISTS (
    SELECT 1 FROM public.inventory_reconciliation_issues issue
    WHERE issue.issue_type = 'negative_opening_balance'
      AND issue.product_sku = inventory_balances.product_sku
      AND issue.variant_suffix = inventory_balances.variant_suffix
      AND issue.size_info = inventory_balances.size_info
      AND issue.warehouse_id = inventory_balances.warehouse_id
      AND issue.resolved_at IS NULL
  );

INSERT INTO public.inventory_reconciliation_issues (
  issue_type, product_sku, expected_quantity, actual_quantity, details
)
SELECT 'product_size_total_mismatch', p.sku, COALESCE(p.stock_qty, 0)::integer,
       COALESCE(size_totals.quantity, 0)::integer,
       jsonb_build_object('message', 'Το άθροισμα αποθέματος ανά μέγεθος διαφέρει από το συνολικό απόθεμα.')
FROM public.products p
CROSS JOIN LATERAL (
  SELECT SUM(CASE WHEN value ~ '^-?[0-9]+$' THEN value::integer ELSE 0 END) AS quantity
  FROM jsonb_each_text(COALESCE(to_jsonb(p.stock_by_size), '{}'::jsonb))
) size_totals
WHERE COALESCE(to_jsonb(p.stock_by_size), '{}'::jsonb) <> '{}'::jsonb
  AND COALESCE(size_totals.quantity, 0)::integer <> COALESCE(p.stock_qty, 0)::integer
  AND NOT EXISTS (
    SELECT 1 FROM public.inventory_reconciliation_issues issue
    WHERE issue.issue_type = 'product_size_total_mismatch'
      AND issue.product_sku = p.sku
      AND issue.resolved_at IS NULL
  );

INSERT INTO public.inventory_reconciliation_issues (
  issue_type, product_sku, variant_suffix, expected_quantity, actual_quantity, details
)
SELECT 'variant_size_total_mismatch', pv.product_sku, COALESCE(pv.suffix, ''),
       COALESCE(pv.stock_qty, 0)::integer, COALESCE(size_totals.quantity, 0)::integer,
       jsonb_build_object('message', 'Το άθροισμα αποθέματος παραλλαγής ανά μέγεθος διαφέρει από το συνολικό απόθεμα.')
FROM public.product_variants pv
CROSS JOIN LATERAL (
  SELECT SUM(CASE WHEN value ~ '^-?[0-9]+$' THEN value::integer ELSE 0 END) AS quantity
  FROM jsonb_each_text(COALESCE(to_jsonb(pv.stock_by_size), '{}'::jsonb))
) size_totals
WHERE COALESCE(to_jsonb(pv.stock_by_size), '{}'::jsonb) <> '{}'::jsonb
  AND COALESCE(size_totals.quantity, 0)::integer <> COALESCE(pv.stock_qty, 0)::integer
  AND NOT EXISTS (
    SELECT 1 FROM public.inventory_reconciliation_issues issue
    WHERE issue.issue_type = 'variant_size_total_mismatch'
      AND issue.product_sku = pv.product_sku
      AND issue.variant_suffix = COALESCE(pv.suffix, '')
      AND issue.resolved_at IS NULL
  );

INSERT INTO public.inventory_reconciliation_issues (
  issue_type, product_sku, variant_suffix, size_info, warehouse_id, actual_quantity, details
)
SELECT 'unknown_warehouse', b.product_sku, b.variant_suffix, b.size_info, b.warehouse_id,
       b.on_hand, jsonb_build_object('message', 'Το απόθεμα αναφέρεται σε άγνωστη αποθήκη.')
FROM public.inventory_balances b
LEFT JOIN public.warehouses w ON w.id = b.warehouse_id
WHERE w.id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.inventory_reconciliation_issues issue
    WHERE issue.issue_type = 'unknown_warehouse'
      AND issue.product_sku = b.product_sku
      AND issue.variant_suffix = b.variant_suffix
      AND issue.size_info = b.size_info
      AND issue.warehouse_id = b.warehouse_id
      AND issue.resolved_at IS NULL
  );

INSERT INTO public.inventory_reconciliation_issues (
  issue_type, product_sku, variant_suffix, size_info, warehouse_id,
  actual_quantity, details
)
WITH duplicate_rows AS (
  SELECT ps.product_sku,
         COALESCE(ps.variant_suffix, '') AS variant_suffix,
         COALESCE(ps.size_info, '') AS size_info,
         ps.warehouse_id,
         SUM(COALESCE(ps.quantity, 0))::integer AS actual_quantity,
         COUNT(*) AS row_count
  FROM public.product_stock ps
  GROUP BY ps.product_sku, COALESCE(ps.variant_suffix, ''),
           COALESCE(ps.size_info, ''), ps.warehouse_id
  HAVING COUNT(*) > 1
)
SELECT 'duplicate_location_rows', duplicate.product_sku, duplicate.variant_suffix,
       duplicate.size_info, duplicate.warehouse_id,
       duplicate.actual_quantity,
       jsonb_build_object(
         'message', 'Βρέθηκαν πολλαπλές παλαιές εγγραφές για την ίδια θέση αποθέματος.',
         'row_count', duplicate.row_count
       )
FROM duplicate_rows duplicate
WHERE NOT EXISTS (
  SELECT 1 FROM public.inventory_reconciliation_issues issue
  WHERE issue.issue_type = 'duplicate_location_rows'
    AND issue.product_sku = duplicate.product_sku
    AND issue.variant_suffix = duplicate.variant_suffix
    AND issue.size_info = duplicate.size_info
    AND issue.warehouse_id = duplicate.warehouse_id
    AND issue.resolved_at IS NULL
);

INSERT INTO public.inventory_reconciliation_issues (
  issue_type, product_sku, variant_suffix, actual_quantity, details
)
WITH inconsistent_movements AS (
  SELECT movement.product_sku,
         COALESCE(movement.variant_suffix, '') AS variant_suffix,
         COALESCE(SUM(movement.change_amount), 0)::integer AS actual_quantity,
         COUNT(*) AS row_count
  FROM public.stock_movements movement
  LEFT JOIN public.products product ON product.sku = movement.product_sku
  WHERE product.sku IS NULL
     OR movement.change_amount IS NULL
     OR BTRIM(COALESCE(movement.reason, '')) = ''
  GROUP BY movement.product_sku, COALESCE(movement.variant_suffix, '')
)
SELECT 'legacy_movement_inconsistency', movement.product_sku,
       movement.variant_suffix,
       movement.actual_quantity,
       jsonb_build_object(
         'message', 'Βρέθηκαν παλαιές κινήσεις με ελλιπή αιτιολογία, ποσότητα ή μη αναγνωρισμένο προϊόν.',
         'row_count', movement.row_count
       )
FROM inconsistent_movements movement
WHERE NOT EXISTS (
  SELECT 1 FROM public.inventory_reconciliation_issues issue
  WHERE issue.issue_type = 'legacy_movement_inconsistency'
    AND issue.product_sku IS NOT DISTINCT FROM movement.product_sku
    AND issue.variant_suffix = movement.variant_suffix
    AND issue.resolved_at IS NULL
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_balances_nonnegative_check') THEN
    ALTER TABLE public.inventory_balances
      ADD CONSTRAINT inventory_balances_nonnegative_check
      CHECK (on_hand >= 0 AND reserved >= 0 AND reserved <= on_hand) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_balances_product_fk') THEN
    ALTER TABLE public.inventory_balances
      ADD CONSTRAINT inventory_balances_product_fk
      FOREIGN KEY (product_sku) REFERENCES public.products(sku)
      ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_balances_warehouse_fk') THEN
    ALTER TABLE public.inventory_balances
      ADD CONSTRAINT inventory_balances_warehouse_fk
      FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id)
      ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_reservations_quantity_check') THEN
    ALTER TABLE public.inventory_reservations
      ADD CONSTRAINT inventory_reservations_quantity_check
      CHECK (initial_quantity > 0 AND quantity >= 0 AND quantity <= initial_quantity);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_reservations_state_check') THEN
    ALTER TABLE public.inventory_reservations
      ADD CONSTRAINT inventory_reservations_state_check
      CHECK (state IN ('active', 'released', 'consumed'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_shipment_allocations_quantity_check') THEN
    ALTER TABLE public.inventory_shipment_allocations
      ADD CONSTRAINT inventory_shipment_allocations_quantity_check CHECK (quantity > 0);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.current_app_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.role::text
  FROM public.profiles p
  WHERE p.id = (SELECT auth.uid())
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION private.current_app_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.current_app_role() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.assert_inventory_role(p_allowed text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_role text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Απαιτείται ενεργή σύνδεση χρήστη.';
  END IF;
  SELECT public_role.role INTO v_role
  FROM public.profiles public_role
  WHERE public_role.id = v_user_id;
  IF v_role IS NULL OR NOT (v_role = ANY(p_allowed)) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Δεν έχετε δικαίωμα εκτέλεσης αυτής της ενέργειας αποθέματος.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION private.assert_inventory_role(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.assert_inventory_role(text[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.assert_inventory_item_ready(p_product_sku text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.inventory_reconciliation_issues issue
    WHERE issue.resolved_at IS NULL
      AND issue.severity = 'blocking'
      AND (issue.product_sku IS NULL OR issue.product_sku = p_product_sku)
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Η κίνηση δεν ολοκληρώθηκε επειδή υπάρχουν εκκρεμότητες συμφωνίας αποθέματος για το συγκεκριμένο είδος. Δεν πραγματοποιήθηκε καμία μεταβολή.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION private.assert_inventory_item_ready(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.assert_inventory_item_ready(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.assert_product_inventory_retirable(
  p_product_sku text,
  p_operation text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.assert_inventory_role(ARRAY['admin']);

  IF NULLIF(BTRIM(COALESCE(p_product_sku, '')), '') IS NULL
     OR p_operation NOT IN ('delete', 'rename') THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Ο έλεγχος του κωδικού προϊόντος δεν ολοκληρώθηκε. Δεν πραγματοποιήθηκε καμία μεταβολή.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.inventory_balances balance
    WHERE balance.product_sku = p_product_sku
      AND (balance.on_hand <> 0 OR balance.reserved <> 0)
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Ο κωδικός προϊόντος δεν μπορεί να διαγραφεί ή να μετονομαστεί, επειδή διαθέτει φυσικό ή δεσμευμένο απόθεμα. Μηδενίστε και συμφωνήστε πρώτα όλα τα υπόλοιπα. Δεν πραγματοποιήθηκε καμία μεταβολή.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.inventory_events event_row WHERE event_row.product_sku = p_product_sku)
     OR EXISTS (SELECT 1 FROM public.inventory_reservations reservation WHERE reservation.product_sku = p_product_sku)
     OR EXISTS (SELECT 1 FROM public.inventory_shipment_allocations allocation WHERE allocation.product_sku = p_product_sku)
     OR EXISTS (SELECT 1 FROM public.inventory_reconciliation_issues issue WHERE issue.product_sku = p_product_sku) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Ο κωδικός προϊόντος δεν μπορεί να διαγραφεί ή να μετονομαστεί, επειδή συμμετέχει στο ιστορικό αποθέματος. Απενεργοποιήστε το προϊόν ώστε να διατηρηθεί η πλήρης ιχνηλασιμότητα. Δεν πραγματοποιήθηκε καμία μεταβολή.';
  END IF;

  IF p_operation = 'rename' AND EXISTS (
    SELECT 1 FROM public.inventory_reorder_policies policy
    WHERE policy.product_sku = p_product_sku
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Ο κωδικός προϊόντος δεν μπορεί να μετονομαστεί όσο διαθέτει πολιτική αναπαραγγελίας. Καταργήστε πρώτα την πολιτική. Δεν πραγματοποιήθηκε καμία μεταβολή.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION private.assert_product_inventory_retirable(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.assert_product_inventory_retirable(text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.assert_product_inventory_retirable_v1(
  p_product_sku text,
  p_operation text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.assert_product_inventory_retirable(p_product_sku, p_operation);
END;
$$;

REVOKE ALL ON FUNCTION public.assert_product_inventory_retirable_v1(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_product_inventory_retirable_v1(text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.guard_inventory_product_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.assert_product_inventory_retirable(OLD.sku, 'delete');
  DELETE FROM public.inventory_reorder_policies WHERE product_sku = OLD.sku;
  DELETE FROM public.inventory_balances WHERE product_sku = OLD.sku;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_inventory_product_delete() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS inventory_guard_product_delete ON public.products;
CREATE TRIGGER inventory_guard_product_delete
BEFORE DELETE ON public.products
FOR EACH ROW EXECUTE FUNCTION private.guard_inventory_product_delete();

CREATE OR REPLACE FUNCTION private.ensure_order_line_ids(p_items jsonb)
RETURNS jsonb
LANGUAGE sql
VOLATILE
SET search_path = ''
AS $$
  SELECT COALESCE(
    jsonb_agg(
      CASE
        WHEN NULLIF(item->>'line_id', '') IS NULL
          THEN jsonb_set(item, '{line_id}', to_jsonb(gen_random_uuid()::text), true)
        ELSE item
      END
      ORDER BY ordinal
    ),
    '[]'::jsonb
  )
  FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) WITH ORDINALITY rows(item, ordinal);
$$;

-- Every order line receives a stable identity before any reservation backfill.
UPDATE public.orders
SET items = private.ensure_order_line_ids(items)
WHERE EXISTS (
  SELECT 1
  FROM jsonb_array_elements(COALESCE(items, '[]'::jsonb)) item
  WHERE NULLIF(item->>'line_id', '') IS NULL
);

CREATE OR REPLACE FUNCTION private.sync_legacy_inventory_projection(p_product_sku text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_central constant uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_showroom constant uuid := '00000000-0000-0000-0000-000000000002'::uuid;
BEGIN
  UPDATE public.products p
  SET stock_qty = COALESCE((
        SELECT SUM(b.on_hand)::integer FROM public.inventory_balances b
        WHERE b.product_sku = p.sku AND b.variant_suffix = '' AND b.warehouse_id = v_central
      ), 0),
      sample_qty = COALESCE((
        SELECT SUM(b.on_hand)::integer FROM public.inventory_balances b
        WHERE b.product_sku = p.sku AND b.variant_suffix = '' AND b.warehouse_id = v_showroom
      ), 0),
      stock_by_size = COALESCE((
        SELECT jsonb_object_agg(b.size_info, b.on_hand ORDER BY b.size_info)
        FROM public.inventory_balances b
        WHERE b.product_sku = p.sku AND b.variant_suffix = '' AND b.size_info <> '' AND b.warehouse_id = v_central
      ), '{}'::jsonb),
      sample_stock_by_size = COALESCE((
        SELECT jsonb_object_agg(b.size_info, b.on_hand ORDER BY b.size_info)
        FROM public.inventory_balances b
        WHERE b.product_sku = p.sku AND b.variant_suffix = '' AND b.size_info <> '' AND b.warehouse_id = v_showroom
      ), '{}'::jsonb)
  WHERE p.sku = p_product_sku;

  UPDATE public.product_variants pv
  SET stock_qty = COALESCE((
        SELECT SUM(b.on_hand)::integer FROM public.inventory_balances b
        WHERE b.product_sku = pv.product_sku
          AND b.variant_suffix = COALESCE(pv.suffix, '')
          AND b.warehouse_id = v_central
      ), 0),
      stock_by_size = COALESCE((
        SELECT jsonb_object_agg(b.size_info, b.on_hand ORDER BY b.size_info)
        FROM public.inventory_balances b
        WHERE b.product_sku = pv.product_sku
          AND b.variant_suffix = COALESCE(pv.suffix, '')
          AND b.size_info <> ''
          AND b.warehouse_id = v_central
      ), '{}'::jsonb)
  WHERE pv.product_sku = p_product_sku;
END;
$$;

REVOKE ALL ON FUNCTION private.sync_legacy_inventory_projection(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.sync_legacy_inventory_projection(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.release_order_reservations_core(
  p_order_id text,
  p_reason text,
  p_idempotency_key text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  reservation_row public.inventory_reservations%ROWTYPE;
  balance_row public.inventory_balances%ROWTYPE;
  v_released integer := 0;
  v_sequence integer := 0;
BEGIN
  FOR reservation_row IN
    SELECT * FROM public.inventory_reservations
    WHERE order_id = p_order_id AND state = 'active' AND quantity > 0
    ORDER BY product_sku, variant_suffix, size_info, warehouse_id
    FOR UPDATE
  LOOP
    SELECT * INTO balance_row
    FROM public.inventory_balances
    WHERE product_sku = reservation_row.product_sku
      AND variant_suffix = reservation_row.variant_suffix
      AND size_info = reservation_row.size_info
      AND warehouse_id = reservation_row.warehouse_id
    FOR UPDATE;

    UPDATE public.inventory_balances
    SET reserved = reserved - reservation_row.quantity,
        version = version + 1,
        updated_at = now()
    WHERE product_sku = reservation_row.product_sku
      AND variant_suffix = reservation_row.variant_suffix
      AND size_info = reservation_row.size_info
      AND warehouse_id = reservation_row.warehouse_id
    RETURNING * INTO balance_row;

    UPDATE public.inventory_reservations
    SET quantity = 0, state = 'released', released_at = now(), updated_at = now()
    WHERE id = reservation_row.id;

    v_sequence := v_sequence + 1;
    INSERT INTO public.inventory_events (
      sequence_no, operation_type, product_sku, variant_suffix, size_info, warehouse_id,
      reserved_delta, on_hand_after, reserved_after, reference_type, reference_id,
      reference_line_id, actor_user_id, reason, idempotency_key
    ) VALUES (
      v_sequence, 'reservation_release', reservation_row.product_sku,
      reservation_row.variant_suffix, reservation_row.size_info, reservation_row.warehouse_id,
      -reservation_row.quantity, balance_row.on_hand, balance_row.reserved, 'order', p_order_id,
      reservation_row.order_line_id, (SELECT auth.uid()), p_reason, p_idempotency_key
    ) ON CONFLICT (idempotency_key, sequence_no) DO NOTHING;

    v_released := v_released + reservation_row.quantity;
  END LOOP;
  RETURN v_released;
END;
$$;

REVOKE ALL ON FUNCTION private.release_order_reservations_core(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.release_order_reservations_core(text, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.save_order_with_inventory_core(
  p_order jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_existing public.orders%ROWTYPE;
  v_items jsonb;
  item jsonb;
  balance_row public.inventory_balances%ROWTYPE;
  v_line_id text;
  v_sku text;
  v_variant text;
  v_size text;
  v_requested integer;
  v_available integer;
  v_reserved integer;
  v_warehouse uuid;
  v_central constant uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_sequence integer := 1000;
  v_allocations jsonb := '[]'::jsonb;
BEGIN
  PERFORM private.assert_inventory_role(ARRAY['admin', 'user', 'seller']);

  IF private.current_app_role() = 'seller'
     AND COALESCE(p_order->>'seller_id', '') <> COALESCE((SELECT auth.uid())::text, '') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Η παραγγελία δεν αποθηκεύτηκε, επειδή ο πωλητής μπορεί να δεσμεύσει απόθεμα μόνο για δική του παραγγελία. Δεν πραγματοποιήθηκε καμία μεταβολή.';
  END IF;

  IF NULLIF(p_order->>'id', '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Δεν είναι δυνατή η αποθήκευση παραγγελίας χωρίς κωδικό.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.inventory_events
    WHERE idempotency_key = p_idempotency_key AND operation_type = 'order_reservation'
  ) THEN
    SELECT * INTO v_existing FROM public.orders WHERE id = p_order->>'id';
    RETURN jsonb_build_object('order', to_jsonb(v_existing), 'allocations', '[]'::jsonb, 'idempotent', true);
  END IF;

  SELECT * INTO v_existing
  FROM public.orders
  WHERE id = p_order->>'id'
  FOR UPDATE;

  IF FOUND THEN
    PERFORM private.release_order_reservations_core(
      v_existing.id,
      'Ανακατανομή αποθέματος μετά από μεταβολή παραγγελίας.',
      p_idempotency_key || ':release'
    );
  END IF;

  v_items := private.ensure_order_line_ids(p_order->'items');
  p_order := jsonb_set(p_order, '{items}', v_items, true);
  v_order := jsonb_populate_record(NULL::public.orders, p_order);

  IF v_existing.id IS NULL THEN
    INSERT INTO public.orders SELECT (v_order).*;
  ELSE
    UPDATE public.orders o
    SET customer_id = v_order.customer_id,
        customer_name = v_order.customer_name,
        customer_phone = v_order.customer_phone,
        seller_id = v_order.seller_id,
        seller_name = v_order.seller_name,
        seller_commission_percent = v_order.seller_commission_percent,
        status = v_order.status,
        items = v_items,
        total_price = v_order.total_price,
        notes = v_order.notes,
        custom_silver_rate = v_order.custom_silver_rate,
        vat_rate = v_order.vat_rate,
        discount_percent = v_order.discount_percent,
        tags = v_order.tags,
        is_archived = v_order.is_archived,
        price_change_log = v_order.price_change_log,
        source_offer_id = v_order.source_offer_id
    WHERE o.id = v_order.id;
  END IF;

  IF v_order.status IN ('Cancelled', 'Delivered') THEN
    SELECT * INTO v_order FROM public.orders WHERE id = v_order.id;
    RETURN jsonb_build_object('order', to_jsonb(v_order), 'allocations', v_allocations);
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(v_items) rows(value)
  LOOP
    v_sku := BTRIM(COALESCE(item->>'sku', ''));
    v_variant := BTRIM(COALESCE(item->>'variant_suffix', ''));
    v_size := BTRIM(COALESCE(item->>'size_info', ''));
    v_line_id := item->>'line_id';
    v_requested := GREATEST(COALESCE((item->>'quantity')::integer, 0), 0);
    v_warehouse := COALESCE(NULLIF(item->>'warehouse_id', '')::uuid, v_central);

    IF v_sku = '' OR v_requested = 0 THEN CONTINUE; END IF;
    PERFORM private.assert_inventory_item_ready(v_sku);

    SELECT * INTO balance_row
    FROM public.inventory_balances b
    WHERE b.product_sku = v_sku
      AND b.variant_suffix = v_variant
      AND b.warehouse_id = v_warehouse
      AND (
        b.size_info = v_size
        OR (
          v_size <> '' AND b.size_info = ''
          AND NOT EXISTS (
            SELECT 1 FROM public.inventory_balances sized
            WHERE sized.product_sku = v_sku
              AND sized.variant_suffix = v_variant
              AND sized.warehouse_id = v_warehouse
              AND sized.size_info <> ''
          )
        )
      )
    ORDER BY CASE WHEN b.size_info = v_size THEN 0 ELSE 1 END
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
      INSERT INTO public.inventory_balances (
        product_sku, variant_suffix, size_info, warehouse_id, on_hand, reserved
      ) VALUES (v_sku, v_variant, v_size, v_warehouse, 0, 0)
      ON CONFLICT DO NOTHING;
      SELECT * INTO balance_row
      FROM public.inventory_balances
      WHERE product_sku = v_sku AND variant_suffix = v_variant
        AND size_info = v_size AND warehouse_id = v_warehouse
      FOR UPDATE;
    END IF;

    v_available := GREATEST(balance_row.on_hand - balance_row.reserved, 0);
    v_reserved := LEAST(v_requested, v_available);

    IF v_reserved > 0 THEN
      INSERT INTO public.inventory_reservations (
        order_id, order_line_id, product_sku, variant_suffix, size_info,
        warehouse_id, initial_quantity, quantity
      ) VALUES (
        v_order.id, v_line_id, v_sku, v_variant, balance_row.size_info,
        v_warehouse, v_reserved, v_reserved
      );

      UPDATE public.inventory_balances
      SET reserved = reserved + v_reserved, version = version + 1, updated_at = now()
      WHERE product_sku = v_sku AND variant_suffix = v_variant
        AND size_info = balance_row.size_info AND warehouse_id = v_warehouse
      RETURNING * INTO balance_row;

      v_sequence := v_sequence + 1;
      INSERT INTO public.inventory_events (
        sequence_no, operation_type, product_sku, variant_suffix, size_info, warehouse_id,
        reserved_delta, on_hand_after, reserved_after, reference_type, reference_id,
        reference_line_id, actor_user_id, reason, idempotency_key
      ) VALUES (
        v_sequence, 'order_reservation', v_sku, v_variant, balance_row.size_info, v_warehouse,
        v_reserved, balance_row.on_hand, balance_row.reserved, 'order', v_order.id,
        v_line_id, (SELECT auth.uid()), 'Αυτόματη δέσμευση κατά την αποθήκευση παραγγελίας.', p_idempotency_key
      );
    END IF;

    v_allocations := v_allocations || jsonb_build_array(jsonb_build_object(
      'line_id', v_line_id,
      'product_sku', v_sku,
      'variant_suffix', v_variant,
      'size_info', v_size,
      'warehouse_id', v_warehouse,
      'requested', v_requested,
      'reserved', v_reserved,
      'shortage', v_requested - v_reserved
    ));
  END LOOP;

  SELECT * INTO v_order FROM public.orders WHERE id = v_order.id;
  RETURN jsonb_build_object('order', to_jsonb(v_order), 'allocations', v_allocations);
END;
$$;

REVOKE ALL ON FUNCTION private.save_order_with_inventory_core(jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.save_order_with_inventory_core(jsonb, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.save_order_with_inventory_v1(p_order jsonb, p_idempotency_key text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$ SELECT private.save_order_with_inventory_core(p_order, p_idempotency_key); $$;

REVOKE ALL ON FUNCTION public.save_order_with_inventory_v1(jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_order_with_inventory_v1(jsonb, text) TO authenticated, service_role;

-- Shadow-mode backfill: issue-free, unshipped Pending orders are reserved up to
-- current availability. Any order that cannot be reconciled is reported and
-- remains untouched so an administrator can resolve it before writer cutover.
DO $$
DECLARE
  order_row public.orders%ROWTYPE;
BEGIN
  FOR order_row IN
    SELECT candidate.*
    FROM public.orders candidate
    WHERE candidate.status = 'Pending'
      AND NOT EXISTS (
        SELECT 1 FROM public.order_shipments shipment WHERE shipment.order_id = candidate.id
      )
    ORDER BY candidate.created_at, candidate.id
  LOOP
    BEGIN
      PERFORM private.save_order_with_inventory_core(
        to_jsonb(order_row),
        format('cutover-order-reservation:%s', order_row.id)
      );
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.inventory_reconciliation_issues (
        issue_type, severity, details
      ) VALUES (
        'reservation_backfill_failed', 'warning',
        jsonb_build_object(
          'order_id', order_row.id,
          'message', 'Η αρχική δέσμευση της εκκρεμούς παραγγελίας δεν δημιουργήθηκε και απαιτεί έλεγχο διαχειριστή.',
          'internal_error', SQLERRM
        )
      );
    END;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_order_inventory_v1(
  p_order_id text,
  p_reason text,
  p_idempotency_key text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.assert_inventory_role(ARRAY['admin', 'user', 'seller']);
  IF private.current_app_role() = 'seller' AND NOT EXISTS (
    SELECT 1 FROM public.orders order_row
    WHERE order_row.id = p_order_id
      AND COALESCE(order_row.seller_id::text, '') = COALESCE((SELECT auth.uid())::text, '')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Η αποδέσμευση δεν ολοκληρώθηκε, επειδή ο πωλητής μπορεί να μεταβάλει μόνο δική του παραγγελία. Δεν πραγματοποιήθηκε καμία μεταβολή.';
  END IF;
  RETURN private.release_order_reservations_core(p_order_id, p_reason, p_idempotency_key);
END;
$$;

REVOKE ALL ON FUNCTION public.release_order_inventory_v1(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_order_inventory_v1(text, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_order_status_with_inventory_v1(
  p_order_id text,
  p_status text,
  p_idempotency_key text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.assert_inventory_role(ARRAY['admin', 'user', 'seller']);
  IF private.current_app_role() = 'seller' AND NOT EXISTS (
    SELECT 1 FROM public.orders order_row
    WHERE order_row.id = p_order_id
      AND COALESCE(order_row.seller_id::text, '') = COALESCE((SELECT auth.uid())::text, '')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Η κατάσταση της παραγγελίας δεν ενημερώθηκε, επειδή ο πωλητής μπορεί να μεταβάλει μόνο δική του παραγγελία. Δεν πραγματοποιήθηκε καμία μεταβολή.';
  END IF;
  PERFORM 1 FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Η παραγγελία δεν βρέθηκε. Δεν πραγματοποιήθηκε καμία μεταβολή.';
  END IF;
  IF p_status IN ('Cancelled', 'Delivered') THEN
    PERFORM private.release_order_reservations_core(
      p_order_id,
      CASE WHEN p_status = 'Cancelled' THEN 'Αποδέσμευση λόγω ακύρωσης παραγγελίας.' ELSE 'Κλείσιμο υπολειπόμενων δεσμεύσεων παραγγελίας.' END,
      p_idempotency_key || ':release'
    );
  END IF;
  UPDATE public.orders SET status = p_status WHERE id = p_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_order_status_with_inventory_v1(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_order_status_with_inventory_v1(text, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.delete_order_with_inventory_v1(
  p_order_id text,
  p_idempotency_key text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.assert_inventory_role(ARRAY['admin', 'user']);
  PERFORM 1 FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  PERFORM private.release_order_reservations_core(
    p_order_id, 'Αποδέσμευση λόγω διαγραφής παραγγελίας.', p_idempotency_key || ':release'
  );
  DELETE FROM public.production_batches WHERE order_id = p_order_id;
  DELETE FROM public.orders WHERE id = p_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_order_with_inventory_v1(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_order_with_inventory_v1(text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.adjust_inventory_stock_v1(
  p_product_sku text,
  p_variant_suffix text,
  p_size_info text,
  p_warehouse_id uuid,
  p_mode text,
  p_quantity integer,
  p_reason text,
  p_idempotency_key text
)
RETURNS public.inventory_balances
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  balance_row public.inventory_balances%ROWTYPE;
  v_new_on_hand integer;
  v_delta integer;
BEGIN
  PERFORM private.assert_inventory_role(ARRAY['admin']);
  PERFORM private.assert_inventory_item_ready(p_product_sku);
  IF BTRIM(COALESCE(p_reason, '')) = '' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Η αιτιολογία διόρθωσης αποθέματος είναι υποχρεωτική.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.inventory_events WHERE idempotency_key = p_idempotency_key) THEN
    SELECT * INTO balance_row FROM public.inventory_balances
    WHERE product_sku = p_product_sku
      AND variant_suffix = COALESCE(p_variant_suffix, '')
      AND size_info = COALESCE(p_size_info, '')
      AND warehouse_id = p_warehouse_id;
    RETURN balance_row;
  END IF;

  INSERT INTO public.inventory_balances (product_sku, variant_suffix, size_info, warehouse_id)
  VALUES (p_product_sku, COALESCE(p_variant_suffix, ''), COALESCE(p_size_info, ''), p_warehouse_id)
  ON CONFLICT DO NOTHING;

  SELECT * INTO balance_row FROM public.inventory_balances
  WHERE product_sku = p_product_sku
    AND variant_suffix = COALESCE(p_variant_suffix, '')
    AND size_info = COALESCE(p_size_info, '')
    AND warehouse_id = p_warehouse_id
  FOR UPDATE;

  v_new_on_hand := CASE p_mode
    WHEN 'set' THEN p_quantity
    WHEN 'delta' THEN balance_row.on_hand + p_quantity
    ELSE NULL
  END;
  IF v_new_on_hand IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Μη έγκυρος τρόπος διόρθωσης αποθέματος.';
  END IF;
  IF v_new_on_hand < 0 OR v_new_on_hand < balance_row.reserved THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Η διόρθωση δεν ολοκληρώθηκε, επειδή το νέο φυσικό απόθεμα θα ήταν μικρότερο από το δεσμευμένο. Δεν πραγματοποιήθηκε καμία μεταβολή.';
  END IF;
  v_delta := v_new_on_hand - balance_row.on_hand;

  UPDATE public.inventory_balances
  SET on_hand = v_new_on_hand, version = version + 1, updated_at = now()
  WHERE product_sku = balance_row.product_sku
    AND variant_suffix = balance_row.variant_suffix
    AND size_info = balance_row.size_info
    AND warehouse_id = balance_row.warehouse_id
  RETURNING * INTO balance_row;

  INSERT INTO public.inventory_events (
    operation_type, product_sku, variant_suffix, size_info, warehouse_id,
    on_hand_delta, on_hand_after, reserved_after, reference_type, actor_user_id,
    reason, idempotency_key
  ) VALUES (
    'adjustment', balance_row.product_sku, balance_row.variant_suffix, balance_row.size_info,
    balance_row.warehouse_id, v_delta, balance_row.on_hand, balance_row.reserved,
    'manual_adjustment', (SELECT auth.uid()), p_reason, p_idempotency_key
  );

  PERFORM private.sync_legacy_inventory_projection(p_product_sku);
  RETURN balance_row;
END;
$$;

REVOKE ALL ON FUNCTION public.adjust_inventory_stock_v1(text, text, text, uuid, text, integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_inventory_stock_v1(text, text, text, uuid, text, integer, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.batch_adjust_inventory_stock_v1(
  p_items jsonb,
  p_warehouse_id uuid,
  p_reason text,
  p_idempotency_key text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  item jsonb;
  v_index integer := 0;
BEGIN
  PERFORM private.assert_inventory_role(ARRAY['admin']);
  IF jsonb_typeof(COALESCE(p_items, '[]'::jsonb)) <> 'array' OR jsonb_array_length(COALESCE(p_items, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Η μαζική διόρθωση δεν περιέχει είδη προς καταχώριση. Δεν πραγματοποιήθηκε καμία μεταβολή.';
  END IF;
  IF BTRIM(COALESCE(p_reason, '')) = '' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Η αιτιολογία μαζικής διόρθωσης αποθέματος είναι υποχρεωτική. Δεν πραγματοποιήθηκε καμία μεταβολή.';
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(p_items) rows(value)
  LOOP
    v_index := v_index + 1;
    PERFORM public.adjust_inventory_stock_v1(
      BTRIM(COALESCE(item->>'product_sku', '')),
      BTRIM(COALESCE(item->>'variant_suffix', '')),
      BTRIM(COALESCE(item->>'size_info', '')),
      p_warehouse_id,
      'delta',
      COALESCE((item->>'quantity')::integer, 0),
      p_reason,
      format('%s:item:%s', p_idempotency_key, v_index)
    );
  END LOOP;
  RETURN v_index;
END;
$$;

REVOKE ALL ON FUNCTION public.batch_adjust_inventory_stock_v1(jsonb, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.batch_adjust_inventory_stock_v1(jsonb, uuid, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.transfer_inventory_stock_v1(
  p_product_sku text,
  p_variant_suffix text,
  p_size_info text,
  p_source_warehouse_id uuid,
  p_destination_warehouse_id uuid,
  p_quantity integer,
  p_reason text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  source_row public.inventory_balances%ROWTYPE;
  destination_row public.inventory_balances%ROWTYPE;
  v_group uuid := gen_random_uuid();
BEGIN
  PERFORM private.assert_inventory_role(ARRAY['admin', 'user']);
  PERFORM private.assert_inventory_item_ready(p_product_sku);
  IF p_source_warehouse_id = p_destination_warehouse_id OR p_quantity <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Η ποσότητα και οι αποθήκες της ενδοδιακίνησης δεν είναι έγκυρες.';
  END IF;
  IF BTRIM(COALESCE(p_reason, '')) = '' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Η αιτιολογία ενδοδιακίνησης είναι υποχρεωτική.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.inventory_events WHERE idempotency_key = p_idempotency_key) THEN
    RETURN jsonb_build_object('idempotent', true);
  END IF;

  INSERT INTO public.inventory_balances (product_sku, variant_suffix, size_info, warehouse_id)
  VALUES
    (p_product_sku, COALESCE(p_variant_suffix, ''), COALESCE(p_size_info, ''), p_source_warehouse_id),
    (p_product_sku, COALESCE(p_variant_suffix, ''), COALESCE(p_size_info, ''), p_destination_warehouse_id)
  ON CONFLICT DO NOTHING;

  -- Deterministic lock order prevents opposing transfers from deadlocking.
  PERFORM 1 FROM public.inventory_balances
  WHERE product_sku = p_product_sku
    AND variant_suffix = COALESCE(p_variant_suffix, '')
    AND size_info = COALESCE(p_size_info, '')
    AND warehouse_id IN (p_source_warehouse_id, p_destination_warehouse_id)
  ORDER BY warehouse_id
  FOR UPDATE;

  SELECT * INTO source_row FROM public.inventory_balances
  WHERE product_sku = p_product_sku
    AND variant_suffix = COALESCE(p_variant_suffix, '')
    AND size_info = COALESCE(p_size_info, '')
    AND warehouse_id = p_source_warehouse_id;

  IF source_row.on_hand - source_row.reserved < p_quantity THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = format(
        'Η ενδοδιακίνηση δεν ολοκληρώθηκε. Το διαθέσιμο απόθεμα στην αποθήκη προέλευσης είναι %s τεμάχια. Δεν πραγματοποιήθηκε καμία μεταβολή.',
        GREATEST(source_row.on_hand - source_row.reserved, 0)
      );
  END IF;

  UPDATE public.inventory_balances
  SET on_hand = on_hand - p_quantity, version = version + 1, updated_at = now()
  WHERE product_sku = p_product_sku
    AND variant_suffix = COALESCE(p_variant_suffix, '')
    AND size_info = COALESCE(p_size_info, '')
    AND warehouse_id = p_source_warehouse_id
  RETURNING * INTO source_row;

  UPDATE public.inventory_balances
  SET on_hand = on_hand + p_quantity, version = version + 1, updated_at = now()
  WHERE product_sku = p_product_sku
    AND variant_suffix = COALESCE(p_variant_suffix, '')
    AND size_info = COALESCE(p_size_info, '')
    AND warehouse_id = p_destination_warehouse_id
  RETURNING * INTO destination_row;

  INSERT INTO public.inventory_events (
    sequence_no, operation_type, product_sku, variant_suffix, size_info, warehouse_id,
    on_hand_delta, on_hand_after, reserved_after, reference_type, transfer_group_id,
    actor_user_id, reason, idempotency_key
  ) VALUES
    (1, 'transfer_out', p_product_sku, COALESCE(p_variant_suffix, ''), COALESCE(p_size_info, ''),
      p_source_warehouse_id, -p_quantity, source_row.on_hand, source_row.reserved,
      'warehouse_transfer', v_group, (SELECT auth.uid()), p_reason, p_idempotency_key),
    (2, 'transfer_in', p_product_sku, COALESCE(p_variant_suffix, ''), COALESCE(p_size_info, ''),
      p_destination_warehouse_id, p_quantity, destination_row.on_hand, destination_row.reserved,
      'warehouse_transfer', v_group, (SELECT auth.uid()), p_reason, p_idempotency_key);

  PERFORM private.sync_legacy_inventory_projection(p_product_sku);
  RETURN jsonb_build_object('transfer_group_id', v_group, 'source', to_jsonb(source_row), 'destination', to_jsonb(destination_row));
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_inventory_stock_v1(text, text, text, uuid, uuid, integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_inventory_stock_v1(text, text, text, uuid, uuid, integer, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_inventory_reorder_policy_v1(
  p_product_sku text,
  p_variant_suffix text,
  p_size_info text,
  p_warehouse_id uuid,
  p_reorder_point integer,
  p_preferred_supplier_id uuid
)
RETURNS public.inventory_reorder_policies
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  policy_row public.inventory_reorder_policies%ROWTYPE;
BEGIN
  PERFORM private.assert_inventory_role(ARRAY['admin']);
  IF p_reorder_point < 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Το σημείο αναπαραγγελίας δεν μπορεί να είναι αρνητικό.';
  END IF;
  INSERT INTO public.inventory_reorder_policies (
    product_sku, variant_suffix, size_info, warehouse_id, reorder_point,
    preferred_supplier_id, updated_by, updated_at
  ) VALUES (
    p_product_sku, COALESCE(p_variant_suffix, ''), COALESCE(p_size_info, ''),
    p_warehouse_id, p_reorder_point, p_preferred_supplier_id, (SELECT auth.uid()), now()
  )
  ON CONFLICT (product_sku, variant_suffix, size_info, warehouse_id)
  DO UPDATE SET reorder_point = EXCLUDED.reorder_point,
                preferred_supplier_id = EXCLUDED.preferred_supplier_id,
                updated_by = EXCLUDED.updated_by,
                updated_at = EXCLUDED.updated_at
  RETURNING * INTO policy_row;
  RETURN policy_row;
END;
$$;

REVOKE ALL ON FUNCTION public.set_inventory_reorder_policy_v1(text, text, text, uuid, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_inventory_reorder_policy_v1(text, text, text, uuid, integer, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.resolve_inventory_reconciliation_issue_v1(
  p_issue_id uuid,
  p_resolution_note text,
  p_target_on_hand integer DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_target_warehouse_id uuid DEFAULT NULL
)
RETURNS public.inventory_reconciliation_issues
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  issue_row public.inventory_reconciliation_issues%ROWTYPE;
  balance_row public.inventory_balances%ROWTYPE;
  v_warehouse uuid;
  v_before integer := 0;
  v_after integer := 0;
  v_reserved integer := 0;
  v_key text := COALESCE(NULLIF(p_idempotency_key, ''), format('reconciliation:%s', p_issue_id));
  source_balance public.inventory_balances%ROWTYPE;
  target_balance public.inventory_balances%ROWTYPE;
BEGIN
  PERFORM private.assert_inventory_role(ARRAY['admin']);
  IF BTRIM(COALESCE(p_resolution_note, '')) = '' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Η αιτιολογία συμφωνίας αποθέματος είναι υποχρεωτική. Δεν πραγματοποιήθηκε καμία μεταβολή.';
  END IF;

  SELECT * INTO issue_row
  FROM public.inventory_reconciliation_issues
  WHERE id = p_issue_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Η εκκρεμότητα συμφωνίας δεν βρέθηκε. Δεν πραγματοποιήθηκε καμία μεταβολή.';
  END IF;
  IF issue_row.resolved_at IS NOT NULL THEN RETURN issue_row; END IF;

  v_warehouse := COALESCE(issue_row.warehouse_id, '00000000-0000-0000-0000-000000000001'::uuid);
  IF issue_row.issue_type = 'unknown_warehouse' THEN
    IF p_target_warehouse_id IS NULL OR p_target_warehouse_id = issue_row.warehouse_id
       OR NOT EXISTS (SELECT 1 FROM public.warehouses warehouse WHERE warehouse.id = p_target_warehouse_id) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Επιλέξτε έγκυρη Αποθήκη Προορισμού για τη μεταφορά του άγνωστου υπολοίπου. Δεν πραγματοποιήθηκε καμία μεταβολή.';
    END IF;

    SELECT * INTO source_balance
    FROM public.inventory_balances balance
    WHERE balance.product_sku = issue_row.product_sku
      AND balance.variant_suffix = issue_row.variant_suffix
      AND balance.size_info = issue_row.size_info
      AND balance.warehouse_id = issue_row.warehouse_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Η συμφωνία δεν ολοκληρώθηκε, επειδή το άγνωστο υπόλοιπο δεν βρέθηκε. Δεν πραγματοποιήθηκε καμία μεταβολή.';
    END IF;

    INSERT INTO public.inventory_balances (
      product_sku, variant_suffix, size_info, warehouse_id
    ) VALUES (
      source_balance.product_sku, source_balance.variant_suffix,
      source_balance.size_info, p_target_warehouse_id
    ) ON CONFLICT DO NOTHING;
    SELECT * INTO target_balance
    FROM public.inventory_balances balance
    WHERE balance.product_sku = source_balance.product_sku
      AND balance.variant_suffix = source_balance.variant_suffix
      AND balance.size_info = source_balance.size_info
      AND balance.warehouse_id = p_target_warehouse_id
    FOR UPDATE;

    UPDATE public.inventory_balances
    SET on_hand = on_hand + source_balance.on_hand,
        reserved = reserved + source_balance.reserved,
        version = version + 1,
        updated_at = now()
    WHERE product_sku = target_balance.product_sku
      AND variant_suffix = target_balance.variant_suffix
      AND size_info = target_balance.size_info
      AND warehouse_id = target_balance.warehouse_id
    RETURNING * INTO target_balance;
    DELETE FROM public.inventory_balances
    WHERE product_sku = source_balance.product_sku
      AND variant_suffix = source_balance.variant_suffix
      AND size_info = source_balance.size_info
      AND warehouse_id = source_balance.warehouse_id;

    INSERT INTO public.inventory_events (
      sequence_no, operation_type, product_sku, variant_suffix, size_info,
      warehouse_id, on_hand_delta, reserved_delta, on_hand_after, reserved_after,
      reference_type, reference_id, actor_user_id, reason, idempotency_key
    ) VALUES
      (1, 'opening_reconciliation', source_balance.product_sku, source_balance.variant_suffix,
       source_balance.size_info, source_balance.warehouse_id, -source_balance.on_hand,
       -source_balance.reserved, 0, 0, 'inventory_reconciliation', issue_row.id::text,
       (SELECT auth.uid()), p_resolution_note, v_key),
      (2, 'opening_reconciliation', target_balance.product_sku, target_balance.variant_suffix,
       target_balance.size_info, target_balance.warehouse_id, source_balance.on_hand,
       source_balance.reserved, target_balance.on_hand, target_balance.reserved,
       'inventory_reconciliation', issue_row.id::text, (SELECT auth.uid()),
       p_resolution_note, v_key)
    ON CONFLICT (idempotency_key, sequence_no) DO NOTHING;

    UPDATE public.inventory_reconciliation_issues
    SET resolved_at = now(), resolved_by = (SELECT auth.uid()), resolution_note = p_resolution_note
    WHERE id = p_issue_id
    RETURNING * INTO issue_row;
    PERFORM private.sync_legacy_inventory_projection(issue_row.product_sku);
    RETURN issue_row;
  END IF;

  IF issue_row.issue_type = 'negative_opening_balance' AND p_target_on_hand IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Καταχωρίστε το διορθωμένο Φυσικό Απόθεμα για να ολοκληρωθεί η συμφωνία. Δεν πραγματοποιήθηκε καμία μεταβολή.';
  END IF;

  IF issue_row.product_sku IS NOT NULL THEN
    IF p_target_on_hand IS NOT NULL THEN
      INSERT INTO public.inventory_balances (
        product_sku, variant_suffix, size_info, warehouse_id
      ) VALUES (
        issue_row.product_sku, issue_row.variant_suffix, issue_row.size_info, v_warehouse
      ) ON CONFLICT DO NOTHING;

      SELECT * INTO balance_row
      FROM public.inventory_balances
      WHERE product_sku = issue_row.product_sku
        AND variant_suffix = issue_row.variant_suffix
        AND size_info = issue_row.size_info
        AND warehouse_id = v_warehouse
      FOR UPDATE;
      IF p_target_on_hand < 0 OR p_target_on_hand < balance_row.reserved THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Η συμφωνία δεν ολοκληρώθηκε, επειδή το διορθωμένο Φυσικό Απόθεμα είναι μικρότερο από το Δεσμευμένο. Δεν πραγματοποιήθηκε καμία μεταβολή.';
      END IF;
      v_before := balance_row.on_hand;
      UPDATE public.inventory_balances
      SET on_hand = p_target_on_hand, version = version + 1, updated_at = now()
      WHERE product_sku = balance_row.product_sku
        AND variant_suffix = balance_row.variant_suffix
        AND size_info = balance_row.size_info
        AND warehouse_id = balance_row.warehouse_id
      RETURNING * INTO balance_row;
      v_after := balance_row.on_hand;
      v_reserved := balance_row.reserved;
    ELSE
      SELECT COALESCE(SUM(on_hand), 0)::integer, COALESCE(SUM(reserved), 0)::integer
      INTO v_after, v_reserved
      FROM public.inventory_balances
      WHERE product_sku = issue_row.product_sku
        AND variant_suffix = issue_row.variant_suffix
        AND warehouse_id = v_warehouse;
      v_before := v_after;
    END IF;

    INSERT INTO public.inventory_events (
      operation_type, product_sku, variant_suffix, size_info, warehouse_id,
      on_hand_delta, on_hand_after, reserved_after, reference_type, reference_id,
      actor_user_id, reason, idempotency_key
    ) VALUES (
      'opening_reconciliation', issue_row.product_sku, issue_row.variant_suffix,
      issue_row.size_info, v_warehouse, v_after - v_before, v_after, v_reserved,
      'inventory_reconciliation', issue_row.id::text, (SELECT auth.uid()),
      p_resolution_note, v_key
    ) ON CONFLICT (idempotency_key, sequence_no) DO NOTHING;
    PERFORM private.sync_legacy_inventory_projection(issue_row.product_sku);
  END IF;

  UPDATE public.inventory_reconciliation_issues
  SET resolved_at = now(), resolved_by = (SELECT auth.uid()), resolution_note = p_resolution_note
  WHERE id = p_issue_id
  RETURNING * INTO issue_row;
  RETURN issue_row;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_inventory_reconciliation_issue_v1(uuid, text, integer, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_inventory_reconciliation_issue_v1(uuid, text, integer, text, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.convert_offer_to_order_v1(
  p_offer_id text,
  p_order jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  offer_row public.offers%ROWTYPE;
  result jsonb;
BEGIN
  PERFORM private.assert_inventory_role(ARRAY['admin', 'user', 'seller']);
  SELECT * INTO offer_row FROM public.offers WHERE id = p_offer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Η προσφορά δεν βρέθηκε. Δεν δημιουργήθηκε παραγγελία.';
  END IF;
  IF offer_row.converted_order_id IS NOT NULL THEN
    RETURN jsonb_build_object('order_id', offer_row.converted_order_id, 'idempotent', true);
  END IF;

  p_order := jsonb_set(p_order, '{source_offer_id}', to_jsonb(p_offer_id), true);
  result := private.save_order_with_inventory_core(p_order, p_idempotency_key || ':order');
  UPDATE public.offers
  SET status = 'Accepted', converted_order_id = p_order->>'id'
  WHERE id = p_offer_id;
  RETURN result || jsonb_build_object('offer_id', p_offer_id, 'order_id', p_order->>'id');
END;
$$;

REVOKE ALL ON FUNCTION public.convert_offer_to_order_v1(text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.convert_offer_to_order_v1(text, jsonb, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.receive_supplier_order_inventory_v1(
  p_order_id uuid,
  p_warehouse_id uuid,
  p_idempotency_key text
)
RETURNS public.supplier_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  order_row public.supplier_orders%ROWTYPE;
  item jsonb;
  allocation jsonb;
  balance_row public.inventory_balances%ROWTYPE;
  v_sku text;
  v_variant text;
  v_size text;
  v_quantity integer;
  v_committed integer;
  v_free integer;
  v_allocation_quantity integer;
  v_allocation_order_id text;
  v_allocation_line_id text;
  v_matching_line_count integer;
  v_new_batch_id text;
  v_sequence integer := 0;
BEGIN
  PERFORM private.assert_inventory_role(ARRAY['admin', 'user']);
  SELECT * INTO order_row FROM public.supplier_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Η εντολή προμηθευτή δεν βρέθηκε. Δεν πραγματοποιήθηκε καμία μεταβολή.';
  END IF;
  IF order_row.status = 'Received' THEN
    RETURN order_row;
  END IF;
  IF order_row.status <> 'Pending' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Η εντολή προμηθευτή έχει ήδη παραληφθεί ή κλείσει. Δεν πραγματοποιήθηκε καμία μεταβολή.';
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(order_row.items, '[]'::jsonb)) rows(value)
  LOOP
    v_quantity := GREATEST(COALESCE((item->>'quantity')::integer, 0), 0);
    IF v_quantity = 0 THEN CONTINUE; END IF;

    IF item->>'item_type' = 'Material' THEN
      UPDATE public.materials
      SET stock_qty = COALESCE(stock_qty, 0) + v_quantity
      WHERE id = item->>'item_id';
      CONTINUE;
    END IF;

    IF item->>'item_type' <> 'Product' THEN CONTINUE; END IF;
    v_sku := BTRIM(COALESCE(item->>'item_id', ''));
    v_variant := BTRIM(COALESCE(item->>'variant_suffix', ''));
    v_size := BTRIM(COALESCE(item->>'size_info', ''));
    PERFORM private.assert_inventory_item_ready(v_sku);

    -- The entire receipt becomes physical stock at the selected warehouse.
    -- Customer-linked quantities are reserved immediately; only the surplus is free.
    INSERT INTO public.inventory_balances (
      product_sku, variant_suffix, size_info, warehouse_id, on_hand
    ) VALUES (v_sku, v_variant, v_size, p_warehouse_id, v_quantity)
    ON CONFLICT (product_sku, variant_suffix, size_info, warehouse_id)
    DO UPDATE SET on_hand = public.inventory_balances.on_hand + EXCLUDED.on_hand,
                  version = public.inventory_balances.version + 1,
                  updated_at = now()
    RETURNING * INTO balance_row;

    v_committed := 0;
    FOR allocation IN
      SELECT value FROM jsonb_array_elements(COALESCE(item->'source_allocations', '[]'::jsonb)) rows(value)
    LOOP
      v_allocation_quantity := LEAST(
        GREATEST(COALESCE((allocation->>'quantity')::integer, 0), 0),
        v_quantity - v_committed
      );
      EXIT WHEN v_allocation_quantity <= 0;

      v_allocation_order_id := NULLIF(allocation->>'order_id', '');
      v_allocation_line_id := NULLIF(allocation->>'line_id', '');
      IF allocation->>'source_type' = 'production_batch' THEN
        SELECT batch.order_id, NULLIF(batch.line_id::text, '')
        INTO v_allocation_order_id, v_allocation_line_id
        FROM public.production_batches batch
        WHERE batch.id = allocation->>'source_id'
        FOR UPDATE;
      END IF;

      SELECT COUNT(*)::integer, MIN(order_item->>'line_id')
      INTO v_matching_line_count, v_allocation_line_id
      FROM public.orders customer_order
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(customer_order.items, '[]'::jsonb)) order_item
      WHERE customer_order.id = v_allocation_order_id
        AND customer_order.status NOT IN ('Cancelled', 'Delivered')
        AND order_item->>'sku' = v_sku
        AND COALESCE(order_item->>'variant_suffix', '') = v_variant
        AND COALESCE(order_item->>'size_info', '') = v_size
        AND (
          v_allocation_line_id IS NULL
          OR order_item->>'line_id' = v_allocation_line_id
        );

      IF v_allocation_order_id IS NULL OR v_matching_line_count <> 1 OR v_allocation_line_id IS NULL THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'Η παραλαβή δεν ολοκληρώθηκε, επειδή μία δέσμευση πελάτη δεν αντιστοιχεί μονοσήμαντα σε ενεργή γραμμή παραγγελίας. Δεν πραγματοποιήθηκε καμία μεταβολή.';
      END IF;

      UPDATE public.inventory_balances
      SET reserved = reserved + v_allocation_quantity,
          version = version + 1,
          updated_at = now()
      WHERE product_sku = v_sku
        AND variant_suffix = v_variant
        AND size_info = v_size
        AND warehouse_id = p_warehouse_id
      RETURNING * INTO balance_row;

      INSERT INTO public.inventory_reservations (
        order_id, order_line_id, product_sku, variant_suffix, size_info,
        warehouse_id, initial_quantity, quantity
      ) VALUES (
        v_allocation_order_id, v_allocation_line_id, v_sku, v_variant, v_size,
        p_warehouse_id, v_allocation_quantity, v_allocation_quantity
      )
      ON CONFLICT (
        order_id, order_line_id, product_sku, variant_suffix, size_info, warehouse_id
      ) WHERE state = 'active'
      DO UPDATE SET
        initial_quantity = public.inventory_reservations.initial_quantity + EXCLUDED.initial_quantity,
        quantity = public.inventory_reservations.quantity + EXCLUDED.quantity,
        updated_at = now();

      IF allocation->>'source_type' = 'production_batch' THEN
        UPDATE public.production_batches batch
        SET current_stage = CASE
              WHEN COALESCE(batch.requires_setting, false) THEN 'Setting'
              WHEN COALESCE(batch.requires_assembly, false) THEN 'Assembly'
              ELSE 'Ready'
            END,
            fulfillment_source = 'inventory_reserved',
            updated_at = now()
        WHERE batch.id = allocation->>'source_id'
          AND batch.current_stage = 'Αναμονή Παραλαβής';
      ELSE
        UPDATE public.production_batches batch
        SET current_stage = CASE
              WHEN COALESCE(batch.requires_setting, false) THEN 'Setting'
              WHEN COALESCE(batch.requires_assembly, false) THEN 'Assembly'
              ELSE 'Ready'
            END,
            fulfillment_source = 'inventory_reserved',
            updated_at = now()
        WHERE batch.order_id = v_allocation_order_id
          AND batch.sku = v_sku
          AND COALESCE(batch.variant_suffix, '') = v_variant
          AND COALESCE(batch.size_info, '') = v_size
          AND COALESCE(batch.line_id::text, '') = v_allocation_line_id
          AND batch.current_stage = 'Αναμονή Παραλαβής';

        IF NOT FOUND THEN
          v_new_batch_id := gen_random_uuid()::text;
          INSERT INTO public.production_batches (
            id, order_id, sku, variant_suffix, quantity, current_stage, priority,
            type, requires_setting, requires_assembly, on_hold, pending_dispatch,
            size_info, cord_color, enamel_color, line_id, fulfillment_source,
            legacy_inventory_issued, created_at, updated_at
          ) VALUES (
            v_new_batch_id, v_allocation_order_id, v_sku, NULLIF(v_variant, ''),
            v_allocation_quantity, 'Ready', 'Normal', 'Νέα', false, false, false,
            false, NULLIF(v_size, ''), NULLIF(item->>'cord_color', ''),
            NULLIF(item->>'enamel_color', ''), v_allocation_line_id,
            'inventory_reserved', false, now(), now()
          );
          INSERT INTO public.batch_stage_history (
            id, batch_id, from_stage, to_stage, moved_by, moved_at, notes
          ) VALUES (
            gen_random_uuid(), v_new_batch_id, 'Αναμονή Παραλαβής', 'Ready',
            'Σύστημα', now(), 'Δημιουργία δεσμευμένης παρτίδας από παραλαβή προμηθευτή.'
          );
        END IF;
      END IF;

      v_committed := v_committed + v_allocation_quantity;
    END LOOP;

    v_free := v_quantity - v_committed;
    v_sequence := v_sequence + 1;
    INSERT INTO public.inventory_events (
      sequence_no, operation_type, product_sku, variant_suffix, size_info, warehouse_id,
      on_hand_delta, reserved_delta, on_hand_after, reserved_after, reference_type,
      reference_id, actor_user_id, reason, idempotency_key
    ) VALUES (
      v_sequence, 'supplier_receipt', v_sku, v_variant, v_size, p_warehouse_id,
      v_quantity, v_committed, balance_row.on_hand, balance_row.reserved,
      'supplier_order', p_order_id::text, (SELECT auth.uid()),
      format('Παραλαβή αποθέματος: %s δεσμευμένα και %s ελεύθερα τεμάχια.', v_committed, v_free),
      p_idempotency_key
    );

    PERFORM private.sync_legacy_inventory_projection(v_sku);
  END LOOP;

  UPDATE public.supplier_orders
  SET status = 'Received', received_at = now(), receipt_warehouse_id = p_warehouse_id
  WHERE id = p_order_id
  RETURNING * INTO order_row;
  RETURN order_row;
END;
$$;

REVOKE ALL ON FUNCTION public.receive_supplier_order_inventory_v1(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.receive_supplier_order_inventory_v1(uuid, uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.restore_legacy_inventory_batch_core(
  p_batch_id text,
  p_idempotency_key text
)
RETURNS public.production_batches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  batch_row public.production_batches%ROWTYPE;
  balance_row public.inventory_balances%ROWTYPE;
BEGIN
  SELECT * INTO batch_row
  FROM public.production_batches
  WHERE id = p_batch_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF batch_row.type = 'Από Stock' AND COALESCE(batch_row.legacy_inventory_issued, false) THEN
    PERFORM private.assert_inventory_item_ready(batch_row.sku);
    INSERT INTO public.inventory_balances (
      product_sku, variant_suffix, size_info, warehouse_id, on_hand
    ) VALUES (
      batch_row.sku, COALESCE(batch_row.variant_suffix, ''), COALESCE(batch_row.size_info, ''),
      '00000000-0000-0000-0000-000000000001'::uuid, batch_row.quantity
    )
    ON CONFLICT (product_sku, variant_suffix, size_info, warehouse_id)
    DO UPDATE SET on_hand = public.inventory_balances.on_hand + EXCLUDED.on_hand,
                  version = public.inventory_balances.version + 1,
                  updated_at = now()
    RETURNING * INTO balance_row;

    INSERT INTO public.inventory_events (
      operation_type, product_sku, variant_suffix, size_info, warehouse_id,
      on_hand_delta, on_hand_after, reserved_after, reference_type, reference_id,
      reference_line_id, actor_user_id, reason, idempotency_key
    ) VALUES (
      'legacy_issue_reversal', batch_row.sku, COALESCE(batch_row.variant_suffix, ''),
      COALESCE(batch_row.size_info, ''), balance_row.warehouse_id, batch_row.quantity,
      balance_row.on_hand, balance_row.reserved, 'production_batch', batch_row.id,
      batch_row.line_id, (SELECT auth.uid()),
      'Επαναφορά παλαιάς πρόωρης εξαγωγής αποθέματος λόγω διαγραφής παρτίδας.',
      p_idempotency_key
    ) ON CONFLICT (idempotency_key, sequence_no) DO NOTHING;

    UPDATE public.production_batches
    SET legacy_inventory_issued = false, updated_at = now()
    WHERE id = batch_row.id
    RETURNING * INTO batch_row;
    PERFORM private.sync_legacy_inventory_projection(batch_row.sku);
  END IF;
  RETURN batch_row;
END;
$$;

REVOKE ALL ON FUNCTION private.restore_legacy_inventory_batch_core(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.restore_legacy_inventory_batch_core(text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.delete_production_batch_inventory_v1(
  p_batch_id text,
  p_idempotency_key text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  batch_row public.production_batches%ROWTYPE;
BEGIN
  PERFORM private.assert_inventory_role(ARRAY['admin', 'user']);
  batch_row := private.restore_legacy_inventory_batch_core(p_batch_id, p_idempotency_key || ':restore');
  IF batch_row.id IS NULL THEN RETURN NULL; END IF;
  DELETE FROM public.production_batches WHERE id = p_batch_id;
  RETURN batch_row.order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_production_batch_inventory_v1(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_production_batch_inventory_v1(text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.revert_order_production_inventory_v1(
  p_order_id text,
  p_idempotency_key text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  batch_row public.production_batches%ROWTYPE;
  v_count integer := 0;
BEGIN
  PERFORM private.assert_inventory_role(ARRAY['admin', 'user']);
  PERFORM 1 FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Η παραγγελία δεν βρέθηκε. Δεν πραγματοποιήθηκε καμία μεταβολή.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.order_shipments WHERE order_id = p_order_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Η επαναφορά παραγωγής δεν ολοκληρώθηκε, επειδή υπάρχουν καταχωρισμένες αποστολές. Δεν πραγματοποιήθηκε καμία μεταβολή.';
  END IF;

  FOR batch_row IN
    SELECT * FROM public.production_batches WHERE order_id = p_order_id ORDER BY id FOR UPDATE
  LOOP
    PERFORM private.restore_legacy_inventory_batch_core(
      batch_row.id,
      format('%s:batch:%s', p_idempotency_key, batch_row.id)
    );
    v_count := v_count + 1;
  END LOOP;
  DELETE FROM public.production_batches WHERE order_id = p_order_id;
  UPDATE public.orders SET status = 'Pending' WHERE id = p_order_id;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.revert_order_production_inventory_v1(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revert_order_production_inventory_v1(text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.dispatch_order_to_production_inventory_v1(
  p_order_id text,
  p_batches jsonb,
  p_order_status text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  command_row public.inventory_command_results%ROWTYPE;
  item jsonb;
  v_batch_id text;
  v_source text;
  v_quantity integer;
  v_reserved integer;
  v_already_dispatched integer;
  v_count integer := 0;
  v_result jsonb;
  v_actor_name text;
BEGIN
  PERFORM private.assert_inventory_role(ARRAY['admin', 'user']);
  IF p_order_status NOT IN ('In Production', 'Partially Delivered') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Η αποστολή προς παραγωγή δεν ολοκληρώθηκε, επειδή η κατάσταση παραγγελίας δεν είναι έγκυρη. Δεν πραγματοποιήθηκε καμία μεταβολή.';
  END IF;
  IF NULLIF(BTRIM(COALESCE(p_idempotency_key, '')), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Η αποστολή προς παραγωγή δεν ολοκληρώθηκε, επειδή λείπει το αναγνωριστικό ασφαλούς επανάληψης. Δεν πραγματοποιήθηκε καμία μεταβολή.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_idempotency_key, 0));
  SELECT * INTO command_row
  FROM public.inventory_command_results
  WHERE idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF command_row.operation_type <> 'production_dispatch' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Η αποστολή προς παραγωγή δεν ολοκληρώθηκε, επειδή το αναγνωριστικό επανάληψης χρησιμοποιείται από διαφορετική ενέργεια. Δεν πραγματοποιήθηκε καμία μεταβολή.';
    END IF;
    RETURN command_row.result;
  END IF;

  PERFORM 1 FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Η αποστολή προς παραγωγή δεν ολοκληρώθηκε, επειδή η παραγγελία δεν βρέθηκε. Δεν πραγματοποιήθηκε καμία μεταβολή.';
  END IF;
  SELECT profile.full_name INTO v_actor_name
  FROM public.profiles profile WHERE profile.id = (SELECT auth.uid());

  FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(p_batches, '[]'::jsonb)) rows(value)
  LOOP
    v_batch_id := NULLIF(item->>'id', '');
    v_source := COALESCE(NULLIF(item->>'fulfillment_source', ''), 'production');
    v_quantity := GREATEST(COALESCE((item->>'quantity')::integer, 0), 0);
    IF v_batch_id IS NULL OR v_quantity <= 0 OR COALESCE(item->>'order_id', '') <> p_order_id THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Η αποστολή προς παραγωγή δεν ολοκληρώθηκε, επειδή μία παρτίδα δεν διαθέτει έγκυρη ταυτότητα ή ποσότητα. Δεν πραγματοποιήθηκε καμία μεταβολή.';
    END IF;
    IF v_source NOT IN ('production', 'inventory_reserved') THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Η αποστολή προς παραγωγή δεν ολοκληρώθηκε, επειδή η προέλευση μίας παρτίδας δεν είναι έγκυρη. Δεν πραγματοποιήθηκε καμία μεταβολή.';
    END IF;

    IF v_source = 'inventory_reserved' THEN
      IF NULLIF(item->>'line_id', '') IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Η αποστολή προς παραγωγή δεν ολοκληρώθηκε, επειδή μία δεσμευμένη ποσότητα δεν συνδέεται με γραμμή παραγγελίας. Δεν πραγματοποιήθηκε καμία μεταβολή.';
      END IF;
      SELECT COALESCE(SUM(reservation.quantity), 0)::integer
      INTO v_reserved
      FROM public.inventory_reservations reservation
      WHERE reservation.order_id = p_order_id
        AND reservation.order_line_id = item->>'line_id'
        AND reservation.product_sku = item->>'sku'
        AND reservation.variant_suffix = COALESCE(item->>'variant_suffix', '')
        AND reservation.state = 'active';

      SELECT COALESCE(SUM(batch.quantity), 0)::integer
      INTO v_already_dispatched
      FROM public.production_batches batch
      WHERE batch.order_id = p_order_id
        AND batch.line_id = item->>'line_id'
        AND batch.sku = item->>'sku'
        AND COALESCE(batch.variant_suffix, '') = COALESCE(item->>'variant_suffix', '')
        AND batch.fulfillment_source = 'inventory_reserved';

      IF v_already_dispatched + v_quantity > v_reserved THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Η αποστολή προς παραγωγή δεν ολοκληρώθηκε, επειδή η ποσότητα από απόθεμα υπερβαίνει την ενεργή δέσμευση. Δεν πραγματοποιήθηκε καμία μεταβολή.';
      END IF;
    END IF;

    INSERT INTO public.production_batches (
      id, order_id, sku, variant_suffix, quantity, current_stage, priority, type,
      notes, requires_setting, requires_assembly, size_info, cord_color, enamel_color,
      line_id, on_hold, on_hold_reason, pending_dispatch, fulfillment_source,
      legacy_inventory_issued, created_at, updated_at
    ) VALUES (
      v_batch_id, p_order_id, item->>'sku', NULLIF(item->>'variant_suffix', ''),
      v_quantity, COALESCE(NULLIF(item->>'current_stage', ''), 'Waxing'),
      COALESCE(NULLIF(item->>'priority', ''), 'Normal'),
      COALESCE(NULLIF(item->>'type', ''), 'Νέα'), NULLIF(item->>'notes', ''),
      COALESCE((item->>'requires_setting')::boolean, false),
      COALESCE((item->>'requires_assembly')::boolean, false),
      NULLIF(item->>'size_info', ''), NULLIF(item->>'cord_color', ''),
      NULLIF(item->>'enamel_color', ''), NULLIF(item->>'line_id', ''),
      COALESCE((item->>'on_hold')::boolean, false), NULLIF(item->>'on_hold_reason', ''),
      COALESCE((item->>'pending_dispatch')::boolean, false), v_source, false,
      COALESCE((item->>'created_at')::timestamptz, now()), now()
    );

    INSERT INTO public.batch_stage_history (
      id, batch_id, from_stage, to_stage, moved_by, moved_at, notes
    ) VALUES (
      gen_random_uuid(), v_batch_id, NULL,
      COALESCE(NULLIF(item->>'current_stage', ''), 'Waxing'),
      COALESCE(v_actor_name, 'Σύστημα'), now(), 'Αποστολή παρτίδας από παραγγελία.'
    );
    v_count := v_count + 1;
  END LOOP;

  UPDATE public.orders SET status = p_order_status WHERE id = p_order_id;
  v_result := jsonb_build_object('order_id', p_order_id, 'batch_count', v_count, 'status', p_order_status);
  INSERT INTO public.inventory_command_results (
    idempotency_key, operation_type, result, actor_user_id
  ) VALUES (
    p_idempotency_key, 'production_dispatch', v_result, (SELECT auth.uid())
  );
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_order_to_production_inventory_v1(text, jsonb, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dispatch_order_to_production_inventory_v1(text, jsonb, text, text) TO authenticated, service_role;

-- Physical inventory issue is attached to the existing atomic shipment
-- transaction. If the shipment fails, these trigger changes roll back with it.
CREATE OR REPLACE FUNCTION private.consume_inventory_reservation_for_shipment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order_id text;
  v_remaining integer := NEW.quantity;
  reservation_row public.inventory_reservations%ROWTYPE;
  balance_row public.inventory_balances%ROWTYPE;
  v_take integer;
  v_event_id uuid;
  v_sequence integer := 0;
  v_key text;
BEGIN
  SELECT shipment.order_id INTO v_order_id
  FROM public.order_shipments shipment
  WHERE shipment.id = NEW.shipment_id;

  FOR reservation_row IN
    SELECT *
    FROM public.inventory_reservations reservation
    WHERE reservation.order_id = v_order_id
      AND reservation.state = 'active'
      AND reservation.quantity > 0
      AND reservation.product_sku = NEW.sku
      AND reservation.variant_suffix = COALESCE(NEW.variant_suffix, '')
      AND reservation.size_info = COALESCE(NEW.size_info, '')
      AND (
        NEW.line_id IS NULL
        OR reservation.order_line_id = NEW.line_id::text
      )
    ORDER BY reservation.created_at, reservation.id
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_take := LEAST(v_remaining, reservation_row.quantity);
    v_key := format('shipment:%s:item:%s:reservation:%s', NEW.shipment_id, NEW.id, reservation_row.id);

    SELECT * INTO balance_row
    FROM public.inventory_balances
    WHERE product_sku = reservation_row.product_sku
      AND variant_suffix = reservation_row.variant_suffix
      AND size_info = reservation_row.size_info
      AND warehouse_id = reservation_row.warehouse_id
    FOR UPDATE;

    IF balance_row.on_hand < v_take OR balance_row.reserved < v_take THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Η αποστολή δεν ολοκληρώθηκε, επειδή η δεσμευμένη ποσότητα δεν συμφωνεί με το φυσικό απόθεμα. Δεν πραγματοποιήθηκε καμία μεταβολή.';
    END IF;

    UPDATE public.inventory_balances
    SET on_hand = on_hand - v_take,
        reserved = reserved - v_take,
        version = version + 1,
        updated_at = now()
    WHERE product_sku = reservation_row.product_sku
      AND variant_suffix = reservation_row.variant_suffix
      AND size_info = reservation_row.size_info
      AND warehouse_id = reservation_row.warehouse_id
    RETURNING * INTO balance_row;

    UPDATE public.inventory_reservations
    SET quantity = quantity - v_take,
        state = CASE WHEN quantity - v_take = 0 THEN 'consumed' ELSE 'active' END,
        consumed_at = CASE WHEN quantity - v_take = 0 THEN now() ELSE consumed_at END,
        updated_at = now()
    WHERE id = reservation_row.id;

    v_sequence := v_sequence + 1;
    INSERT INTO public.inventory_events (
      sequence_no, operation_type, product_sku, variant_suffix, size_info, warehouse_id,
      on_hand_delta, reserved_delta, on_hand_after, reserved_after, reference_type,
      reference_id, reference_line_id, actor_user_id, reason, idempotency_key
    ) VALUES (
      v_sequence, 'shipment_issue', reservation_row.product_sku, reservation_row.variant_suffix,
      reservation_row.size_info, reservation_row.warehouse_id, -v_take, -v_take,
      balance_row.on_hand, balance_row.reserved, 'shipment', NEW.shipment_id::text,
      reservation_row.order_line_id, (SELECT auth.uid()),
      'Εξαγωγή δεσμευμένου αποθέματος λόγω αποστολής.', v_key
    ) RETURNING id INTO v_event_id;

    INSERT INTO public.inventory_shipment_allocations (
      shipment_id, shipment_item_id, reservation_id, product_sku, variant_suffix,
      size_info, warehouse_id, quantity, issue_event_id
    ) VALUES (
      NEW.shipment_id, NEW.id, reservation_row.id, reservation_row.product_sku,
      reservation_row.variant_suffix, reservation_row.size_info,
      reservation_row.warehouse_id, v_take, v_event_id
    );

    PERFORM private.sync_legacy_inventory_projection(reservation_row.product_sku);
    v_remaining := v_remaining - v_take;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.restore_inventory_reservation_for_shipment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  allocation_row public.inventory_shipment_allocations%ROWTYPE;
  reservation_row public.inventory_reservations%ROWTYPE;
  balance_row public.inventory_balances%ROWTYPE;
  v_sequence integer := 0;
BEGIN
  FOR allocation_row IN
    SELECT * FROM public.inventory_shipment_allocations
    WHERE shipment_item_id = OLD.id
    ORDER BY created_at, id
    FOR UPDATE
  LOOP
    SELECT * INTO reservation_row
    FROM public.inventory_reservations
    WHERE id = allocation_row.reservation_id
    FOR UPDATE;

    UPDATE public.inventory_balances
    SET on_hand = on_hand + allocation_row.quantity,
        reserved = reserved + allocation_row.quantity,
        version = version + 1,
        updated_at = now()
    WHERE product_sku = allocation_row.product_sku
      AND variant_suffix = allocation_row.variant_suffix
      AND size_info = allocation_row.size_info
      AND warehouse_id = allocation_row.warehouse_id
    RETURNING * INTO balance_row;

    UPDATE public.inventory_reservations
    SET quantity = quantity + allocation_row.quantity,
        state = 'active', consumed_at = NULL, updated_at = now()
    WHERE id = allocation_row.reservation_id;

    v_sequence := v_sequence + 1;
    INSERT INTO public.inventory_events (
      sequence_no, operation_type, product_sku, variant_suffix, size_info, warehouse_id,
      on_hand_delta, reserved_delta, on_hand_after, reserved_after, reference_type,
      reference_id, reference_line_id, reversal_of, actor_user_id, reason, idempotency_key
    ) VALUES (
      v_sequence, 'shipment_reversal', allocation_row.product_sku, allocation_row.variant_suffix,
      allocation_row.size_info, allocation_row.warehouse_id, allocation_row.quantity,
      allocation_row.quantity, balance_row.on_hand, balance_row.reserved, 'shipment',
      OLD.shipment_id::text, reservation_row.order_line_id, allocation_row.issue_event_id,
      (SELECT auth.uid()), 'Επαναφορά αποθέματος λόγω αναίρεσης αποστολής.',
      format('shipment-reversal:%s:item:%s:allocation:%s', OLD.shipment_id, OLD.id, allocation_row.id)
    ) ON CONFLICT (idempotency_key, sequence_no) DO NOTHING;

    PERFORM private.sync_legacy_inventory_projection(allocation_row.product_sku);
  END LOOP;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS inventory_consume_on_shipment_item_insert ON public.order_shipment_items;
CREATE TRIGGER inventory_consume_on_shipment_item_insert
AFTER INSERT ON public.order_shipment_items
FOR EACH ROW EXECUTE FUNCTION private.consume_inventory_reservation_for_shipment();

DROP TRIGGER IF EXISTS inventory_restore_on_shipment_item_delete ON public.order_shipment_items;
CREATE TRIGGER inventory_restore_on_shipment_item_delete
BEFORE DELETE ON public.order_shipment_items
FOR EACH ROW EXECUTE FUNCTION private.restore_inventory_reservation_for_shipment();

CREATE OR REPLACE FUNCTION private.rebalance_ready_batch_sources(
  p_order_id text,
  p_sku text,
  p_variant text,
  p_size text,
  p_cord text,
  p_enamel text,
  p_line_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  batch_row public.production_batches%ROWTYPE;
  v_target_inventory integer;
  v_ready_total integer;
  v_split_id text;
  v_production_quantity integer;
BEGIN
  SELECT COALESCE(SUM(reservation.quantity), 0)::integer
  INTO v_target_inventory
  FROM public.inventory_reservations reservation
  WHERE reservation.order_id = p_order_id
    AND reservation.state = 'active'
    AND reservation.product_sku = p_sku
    AND reservation.variant_suffix = COALESCE(p_variant, '')
    AND reservation.size_info = COALESCE(p_size, '')
    AND (NULLIF(COALESCE(p_line_id, ''), '') IS NULL OR reservation.order_line_id = p_line_id);

  SELECT COALESCE(SUM(batch.quantity), 0)::integer
  INTO v_ready_total
  FROM public.production_batches batch
  WHERE batch.order_id = p_order_id
    AND batch.current_stage = 'Ready'
    AND batch.sku = p_sku
    AND COALESCE(batch.variant_suffix, '') = COALESCE(p_variant, '')
    AND COALESCE(batch.size_info, '') = COALESCE(p_size, '')
    AND COALESCE(batch.cord_color, '') = COALESCE(p_cord, '')
    AND COALESCE(batch.enamel_color, '') = COALESCE(p_enamel, '')
    AND COALESCE(batch.line_id::text, '') = COALESCE(p_line_id, '');

  IF v_target_inventory > v_ready_total THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Η αποστολή δεν ολοκληρώθηκε, επειδή οι εναπομένουσες δεσμεύσεις αποθέματος δεν αντιστοιχούν σε έτοιμες παρτίδες. Δεν πραγματοποιήθηκε καμία μεταβολή.';
  END IF;

  FOR batch_row IN
    SELECT *
    FROM public.production_batches batch
    WHERE batch.order_id = p_order_id
      AND batch.current_stage = 'Ready'
      AND batch.sku = p_sku
      AND COALESCE(batch.variant_suffix, '') = COALESCE(p_variant, '')
      AND COALESCE(batch.size_info, '') = COALESCE(p_size, '')
      AND COALESCE(batch.cord_color, '') = COALESCE(p_cord, '')
      AND COALESCE(batch.enamel_color, '') = COALESCE(p_enamel, '')
      AND COALESCE(batch.line_id::text, '') = COALESCE(p_line_id, '')
    ORDER BY CASE WHEN batch.fulfillment_source = 'inventory_reserved' THEN 0 ELSE 1 END,
             batch.created_at, batch.id
    FOR UPDATE
  LOOP
    IF v_target_inventory <= 0 THEN
      UPDATE public.production_batches
      SET fulfillment_source = 'production', type = 'Νέα', legacy_inventory_issued = false,
          updated_at = now()
      WHERE id = batch_row.id;
    ELSIF batch_row.quantity <= v_target_inventory THEN
      UPDATE public.production_batches
      SET fulfillment_source = 'inventory_reserved', type = 'Από Stock',
          legacy_inventory_issued = false, updated_at = now()
      WHERE id = batch_row.id;
      v_target_inventory := v_target_inventory - batch_row.quantity;
    ELSE
      v_production_quantity := batch_row.quantity - v_target_inventory;
      UPDATE public.production_batches
      SET quantity = v_target_inventory, fulfillment_source = 'inventory_reserved',
          type = 'Από Stock', legacy_inventory_issued = false, updated_at = now()
      WHERE id = batch_row.id;

      v_split_id := gen_random_uuid()::text;
      INSERT INTO public.production_batches (
        id, order_id, sku, variant_suffix, quantity, current_stage, priority, type,
        notes, requires_setting, requires_assembly, size_info, cord_color, enamel_color,
        line_id, on_hold, on_hold_reason, pending_dispatch, fulfillment_source,
        legacy_inventory_issued, created_at, updated_at
      ) VALUES (
        v_split_id, batch_row.order_id, batch_row.sku, batch_row.variant_suffix,
        v_production_quantity, 'Ready', batch_row.priority, 'Νέα', batch_row.notes,
        batch_row.requires_setting, batch_row.requires_assembly, batch_row.size_info,
        batch_row.cord_color, batch_row.enamel_color, batch_row.line_id,
        batch_row.on_hold, batch_row.on_hold_reason, batch_row.pending_dispatch,
        'production', false, batch_row.created_at, now()
      );
      INSERT INTO public.batch_stage_history (
        id, batch_id, from_stage, to_stage, moved_by, moved_at, notes
      ) VALUES (
        gen_random_uuid(), v_split_id, 'Ready', 'Ready', 'Σύστημα', now(),
        'Διαχωρισμός προέλευσης παρτίδας μετά από μερική αποστολή.'
      );
      v_target_inventory := 0;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION private.rebalance_ready_batch_sources(text, text, text, text, text, text, text)
  FROM PUBLIC, anon, authenticated;

-- Wrap the legacy shipment routines with role enforcement and command-level
-- idempotency. The original routines remain transaction-local implementation
-- details. Reversal splits the Ready quantity restored by the legacy routine
-- back into production-sourced and explicitly inventory-reserved batches.
ALTER FUNCTION public.create_partial_shipment_v1(text, text, jsonb, uuid, text, jsonb, jsonb)
  RENAME TO create_partial_shipment_inventory_core_v1;
ALTER FUNCTION public.revert_partial_shipment_v1(text, uuid)
  RENAME TO revert_partial_shipment_inventory_core_v1;

REVOKE ALL ON FUNCTION public.create_partial_shipment_inventory_core_v1(text, text, jsonb, uuid, text, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revert_partial_shipment_inventory_core_v1(text, uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_partial_shipment_v2(
  p_order_id text,
  p_shipped_by text,
  p_items jsonb,
  p_delivery_plan_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_next_plan jsonb DEFAULT NULL,
  p_next_reminders jsonb DEFAULT '[]'::jsonb,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  command_row public.inventory_command_results%ROWTYPE;
  v_result jsonb;
  item_row jsonb;
BEGIN
  PERFORM private.assert_inventory_role(ARRAY['admin', 'user']);
  IF NULLIF(BTRIM(COALESCE(p_idempotency_key, '')), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Η αποστολή δεν ολοκληρώθηκε, επειδή λείπει το αναγνωριστικό ασφαλούς επανάληψης. Δεν πραγματοποιήθηκε καμία μεταβολή.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_idempotency_key, 0));
  SELECT * INTO command_row
  FROM public.inventory_command_results
  WHERE idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF command_row.operation_type <> 'shipment_create' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Η αποστολή δεν ολοκληρώθηκε, επειδή το αναγνωριστικό επανάληψης χρησιμοποιείται από διαφορετική ενέργεια. Δεν πραγματοποιήθηκε καμία μεταβολή.';
    END IF;
    RETURN command_row.result;
  END IF;

  v_result := public.create_partial_shipment_inventory_core_v1(
    p_order_id, p_shipped_by, p_items, p_delivery_plan_id,
    p_notes, p_next_plan, p_next_reminders
  );

  FOR item_row IN SELECT value FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb))
  LOOP
    PERFORM private.rebalance_ready_batch_sources(
      p_order_id,
      item_row->>'sku',
      COALESCE(item_row->>'variant_suffix', ''),
      COALESCE(item_row->>'size_info', ''),
      COALESCE(item_row->>'cord_color', ''),
      COALESCE(item_row->>'enamel_color', ''),
      COALESCE(item_row->>'line_id', '')
    );
  END LOOP;

  INSERT INTO public.inventory_command_results (
    idempotency_key, operation_type, result, actor_user_id
  ) VALUES (
    p_idempotency_key, 'shipment_create', v_result, (SELECT auth.uid())
  );
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_partial_shipment_v1(
  p_order_id text,
  p_shipped_by text,
  p_items jsonb,
  p_delivery_plan_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_next_plan jsonb DEFAULT NULL,
  p_next_reminders jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.create_partial_shipment_v2(
    p_order_id, p_shipped_by, p_items, p_delivery_plan_id, p_notes,
    p_next_plan, p_next_reminders, 'shipment-compat:' || gen_random_uuid()::text
  );
$$;

CREATE OR REPLACE FUNCTION public.revert_partial_shipment_v2(
  p_order_id text,
  p_shipment_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  command_row public.inventory_command_results%ROWTYPE;
  v_result jsonb;
  v_stock_restores jsonb;
  item_row jsonb;
  batch_row public.production_batches%ROWTYPE;
  v_remaining integer;
  v_stock_quantity integer;
  v_stock_batch_id text;
BEGIN
  PERFORM private.assert_inventory_role(ARRAY['admin', 'user']);
  IF NULLIF(BTRIM(COALESCE(p_idempotency_key, '')), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Η αναίρεση αποστολής δεν ολοκληρώθηκε, επειδή λείπει το αναγνωριστικό ασφαλούς επανάληψης. Δεν πραγματοποιήθηκε καμία μεταβολή.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_idempotency_key, 0));
  SELECT * INTO command_row
  FROM public.inventory_command_results
  WHERE idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF command_row.operation_type <> 'shipment_revert' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Η αναίρεση αποστολής δεν ολοκληρώθηκε, επειδή το αναγνωριστικό επανάληψης χρησιμοποιείται από διαφορετική ενέργεια. Δεν πραγματοποιήθηκε καμία μεταβολή.';
    END IF;
    RETURN command_row.result;
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(restored_row)), '[]'::jsonb)
  INTO v_stock_restores
  FROM (
    SELECT shipment_item.sku,
           COALESCE(shipment_item.variant_suffix, '') AS variant_suffix,
           COALESCE(shipment_item.size_info, '') AS size_info,
           COALESCE(shipment_item.cord_color, '') AS cord_color,
           COALESCE(shipment_item.enamel_color, '') AS enamel_color,
           COALESCE(shipment_item.line_id::text, '') AS line_id,
           COALESCE(SUM(allocation.quantity), 0)::integer AS stock_quantity
    FROM public.order_shipment_items shipment_item
    LEFT JOIN public.inventory_shipment_allocations allocation
      ON allocation.shipment_item_id = shipment_item.id
    WHERE shipment_item.shipment_id = p_shipment_id
    GROUP BY shipment_item.sku, COALESCE(shipment_item.variant_suffix, ''),
             COALESCE(shipment_item.size_info, ''), COALESCE(shipment_item.cord_color, ''),
             COALESCE(shipment_item.enamel_color, ''), COALESCE(shipment_item.line_id::text, '')
  ) restored_row
  WHERE restored_row.stock_quantity > 0;

  v_result := public.revert_partial_shipment_inventory_core_v1(p_order_id, p_shipment_id);

  FOR item_row IN SELECT value FROM jsonb_array_elements(v_stock_restores)
  LOOP
    v_stock_quantity := COALESCE((item_row->>'stock_quantity')::integer, 0);
    v_remaining := v_stock_quantity;
    FOR batch_row IN
      SELECT *
      FROM public.production_batches batch
      WHERE batch.order_id = p_order_id
        AND batch.current_stage = 'Ready'
        AND batch.sku = item_row->>'sku'
        AND COALESCE(batch.variant_suffix, '') = item_row->>'variant_suffix'
        AND COALESCE(batch.size_info, '') = item_row->>'size_info'
        AND COALESCE(batch.cord_color, '') = item_row->>'cord_color'
        AND COALESCE(batch.enamel_color, '') = item_row->>'enamel_color'
        AND COALESCE(batch.line_id::text, '') = item_row->>'line_id'
      ORDER BY batch.created_at, batch.id
      FOR UPDATE
    LOOP
      EXIT WHEN v_remaining <= 0;
      IF batch_row.quantity <= v_remaining THEN
        DELETE FROM public.production_batches WHERE id = batch_row.id;
        v_remaining := v_remaining - batch_row.quantity;
      ELSE
        UPDATE public.production_batches
        SET quantity = quantity - v_remaining, updated_at = now()
        WHERE id = batch_row.id;
        v_remaining := 0;
      END IF;
    END LOOP;

    IF v_remaining > 0 THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Η αναίρεση αποστολής δεν ολοκληρώθηκε, επειδή δεν ήταν δυνατό να διαχωριστεί με ασφάλεια η προέλευση αποθέματος από την παραγωγή. Δεν πραγματοποιήθηκε καμία μεταβολή.';
    END IF;

    v_stock_batch_id := gen_random_uuid()::text;
    INSERT INTO public.production_batches (
      id, order_id, sku, variant_suffix, quantity, current_stage, priority,
      type, requires_setting, requires_assembly, on_hold, pending_dispatch,
      size_info, cord_color, enamel_color, line_id, fulfillment_source,
      legacy_inventory_issued, notes, created_at, updated_at
    ) VALUES (
      v_stock_batch_id, p_order_id, item_row->>'sku',
      NULLIF(item_row->>'variant_suffix', ''), v_stock_quantity, 'Ready', 'Normal',
      'Από Stock', false, false, false, false, NULLIF(item_row->>'size_info', ''),
      NULLIF(item_row->>'cord_color', ''), NULLIF(item_row->>'enamel_color', ''),
      NULLIF(item_row->>'line_id', ''), 'inventory_reserved', false,
      'Επαναφορά δεσμευμένης ποσότητας μετά από αναίρεση αποστολής.', now(), now()
    );
    INSERT INTO public.batch_stage_history (
      id, batch_id, from_stage, to_stage, moved_by, moved_at, notes
    ) VALUES (
      gen_random_uuid(), v_stock_batch_id, NULL, 'Ready', 'Σύστημα', now(),
      'Επαναφορά δεσμευμένης παρτίδας μετά από αναίρεση αποστολής.'
    );
  END LOOP;

  INSERT INTO public.inventory_command_results (
    idempotency_key, operation_type, result, actor_user_id
  ) VALUES (
    p_idempotency_key, 'shipment_revert', v_result, (SELECT auth.uid())
  );
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.revert_partial_shipment_v1(
  p_order_id text,
  p_shipment_id uuid
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.revert_partial_shipment_v2(
    p_order_id, p_shipment_id, 'shipment-revert:' || p_shipment_id::text
  );
$$;

REVOKE ALL ON FUNCTION public.create_partial_shipment_v1(text, text, jsonb, uuid, text, jsonb, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_partial_shipment_v2(text, text, jsonb, uuid, text, jsonb, jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revert_partial_shipment_v1(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revert_partial_shipment_v2(text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_partial_shipment_v1(text, text, jsonb, uuid, text, jsonb, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_partial_shipment_v2(text, text, jsonb, uuid, text, jsonb, jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.revert_partial_shipment_v1(text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.revert_partial_shipment_v2(text, uuid, text) TO authenticated, service_role;

-- Availability combines physical/reserved balances with pending supplier
-- quantities and outstanding customer demand. Demand is displayed on Central
-- to avoid duplicating it across locations; explicit reservations remain local.
CREATE OR REPLACE VIEW public.inventory_availability_v
WITH (security_invoker = true)
AS
WITH supplier_incoming AS (
  SELECT item->>'item_id' AS product_sku,
         COALESCE(item->>'variant_suffix', '') AS variant_suffix,
         COALESCE(item->>'size_info', '') AS size_info,
         COALESCE(so.receipt_warehouse_id, '00000000-0000-0000-0000-000000000001'::uuid) AS warehouse_id,
         SUM(GREATEST(COALESCE((item->>'quantity')::integer, 0), 0))::integer AS incoming
  FROM public.supplier_orders so
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(so.items, '[]'::jsonb)) item
  WHERE so.status = 'Pending' AND item->>'item_type' = 'Product'
  GROUP BY item->>'item_id', COALESCE(item->>'variant_suffix', ''),
           COALESCE(item->>'size_info', ''),
           COALESCE(so.receipt_warehouse_id, '00000000-0000-0000-0000-000000000001'::uuid)
),
shipped AS (
  SELECT shipment.order_id,
         shipment_item.sku AS product_sku,
         COALESCE(shipment_item.variant_suffix, '') AS variant_suffix,
         COALESCE(shipment_item.size_info, '') AS size_info,
         COALESCE(shipment_item.line_id::text, '') AS line_id,
         SUM(shipment_item.quantity)::integer AS quantity
  FROM public.order_shipments shipment
  JOIN public.order_shipment_items shipment_item ON shipment_item.shipment_id = shipment.id
  GROUP BY shipment.order_id, shipment_item.sku, COALESCE(shipment_item.variant_suffix, ''),
           COALESCE(shipment_item.size_info, ''), COALESCE(shipment_item.line_id::text, '')
),
active_reservations AS (
  SELECT reservation.order_id,
         reservation.order_line_id,
         reservation.product_sku,
         reservation.variant_suffix,
         reservation.size_info,
         SUM(reservation.quantity)::integer AS quantity
  FROM public.inventory_reservations reservation
  WHERE reservation.state = 'active'
  GROUP BY reservation.order_id, reservation.order_line_id, reservation.product_sku,
           reservation.variant_suffix, reservation.size_info
),
open_demand AS (
  SELECT item->>'sku' AS product_sku,
         COALESCE(item->>'variant_suffix', '') AS variant_suffix,
         CASE WHEN reservation.order_line_id IS NOT NULL
           THEN reservation.size_info
           ELSE COALESCE(item->>'size_info', '')
         END AS size_info,
         SUM(GREATEST(
           COALESCE((item->>'quantity')::integer, 0)
             - COALESCE(shipped.quantity, 0)
             - COALESCE(reservation.quantity, 0),
           0
         ))::integer AS outstanding_demand,
         SUM(CASE WHEN product.production_type = 'Imported' THEN 0 ELSE GREATEST(
           COALESCE((item->>'quantity')::integer, 0)
             - COALESCE(shipped.quantity, 0)
             - COALESCE(reservation.quantity, 0), 0
         ) END)::integer AS production_demand,
         SUM(CASE WHEN product.production_type = 'Imported' THEN GREATEST(
           COALESCE((item->>'quantity')::integer, 0)
             - COALESCE(shipped.quantity, 0)
             - COALESCE(reservation.quantity, 0), 0
         ) ELSE 0 END)::integer AS purchase_demand
  FROM public.orders order_row
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(order_row.items, '[]'::jsonb)) item
  JOIN public.products product ON product.sku = item->>'sku'
  LEFT JOIN shipped
    ON shipped.order_id = order_row.id
   AND shipped.product_sku = item->>'sku'
   AND shipped.variant_suffix = COALESCE(item->>'variant_suffix', '')
   AND shipped.size_info = COALESCE(item->>'size_info', '')
   AND shipped.line_id = COALESCE(item->>'line_id', '')
  LEFT JOIN active_reservations reservation
    ON reservation.order_id = order_row.id
   AND reservation.order_line_id = COALESCE(item->>'line_id', '')
   AND reservation.product_sku = item->>'sku'
   AND reservation.variant_suffix = COALESCE(item->>'variant_suffix', '')
  WHERE order_row.status IN ('Pending', 'In Production', 'Ready', 'Partially Delivered')
  GROUP BY item->>'sku', COALESCE(item->>'variant_suffix', ''),
           CASE WHEN reservation.order_line_id IS NOT NULL THEN reservation.size_info ELSE COALESCE(item->>'size_info', '') END
)
SELECT balance.product_sku,
       balance.variant_suffix,
       balance.size_info,
       balance.warehouse_id,
       warehouse.name AS warehouse_name,
       warehouse.type AS warehouse_type,
       balance.on_hand,
       balance.reserved,
       balance.on_hand - balance.reserved AS available,
       COALESCE(incoming.incoming, 0) AS incoming,
       CASE
         WHEN balance.warehouse_id = '00000000-0000-0000-0000-000000000001'::uuid
           THEN COALESCE(demand.outstanding_demand, 0)
         ELSE 0
       END AS outstanding_demand,
       CASE
         WHEN balance.warehouse_id = '00000000-0000-0000-0000-000000000001'::uuid
           THEN COALESCE(demand.production_demand, 0)
         ELSE 0
       END AS production_demand,
       CASE
         WHEN balance.warehouse_id = '00000000-0000-0000-0000-000000000001'::uuid
           THEN COALESCE(demand.purchase_demand, 0)
         ELSE 0
       END AS purchase_demand,
       balance.on_hand - balance.reserved + COALESCE(incoming.incoming, 0)
         - CASE WHEN balance.warehouse_id = '00000000-0000-0000-0000-000000000001'::uuid
             THEN COALESCE(demand.outstanding_demand, 0) ELSE 0 END AS projected_available,
       COALESCE(policy.reorder_point, 0) AS reorder_point,
       policy.preferred_supplier_id,
       balance.updated_at
FROM public.inventory_balances balance
JOIN public.warehouses warehouse ON warehouse.id = balance.warehouse_id
LEFT JOIN supplier_incoming incoming
  ON incoming.product_sku = balance.product_sku
 AND incoming.variant_suffix = balance.variant_suffix
 AND incoming.size_info = balance.size_info
 AND incoming.warehouse_id = balance.warehouse_id
LEFT JOIN open_demand demand
  ON demand.product_sku = balance.product_sku
 AND demand.variant_suffix = balance.variant_suffix
 AND demand.size_info = balance.size_info
LEFT JOIN public.inventory_reorder_policies policy
  ON policy.product_sku = balance.product_sku
 AND policy.variant_suffix = balance.variant_suffix
 AND policy.size_info = balance.size_info
 AND policy.warehouse_id = balance.warehouse_id;

CREATE OR REPLACE VIEW public.inventory_legacy_shadow_comparison_v
WITH (security_invoker = true)
AS
WITH legacy_identity AS (
  SELECT product.sku AS product_sku, ''::text AS variant_suffix,
         COALESCE(product.stock_qty, 0)::integer AS legacy_central,
         COALESCE(product.sample_qty, 0)::integer AS legacy_showroom
  FROM public.products product
  WHERE NOT EXISTS (
    SELECT 1 FROM public.product_variants variant WHERE variant.product_sku = product.sku
  )
  UNION ALL
  SELECT variant.product_sku, COALESCE(variant.suffix, ''),
         COALESCE(variant.stock_qty, 0)::integer, 0::integer
  FROM public.product_variants variant
), canonical AS (
  SELECT balance.product_sku, balance.variant_suffix,
         COALESCE(SUM(balance.on_hand) FILTER (
           WHERE balance.warehouse_id = '00000000-0000-0000-0000-000000000001'::uuid
         ), 0)::integer AS canonical_central,
         COALESCE(SUM(balance.on_hand) FILTER (
           WHERE balance.warehouse_id = '00000000-0000-0000-0000-000000000002'::uuid
         ), 0)::integer AS canonical_showroom
  FROM public.inventory_balances balance
  GROUP BY balance.product_sku, balance.variant_suffix
)
SELECT legacy.product_sku, legacy.variant_suffix,
       legacy.legacy_central, COALESCE(canonical.canonical_central, 0) AS canonical_central,
       COALESCE(canonical.canonical_central, 0) - legacy.legacy_central AS central_difference,
       legacy.legacy_showroom, COALESCE(canonical.canonical_showroom, 0) AS canonical_showroom,
       COALESCE(canonical.canonical_showroom, 0) - legacy.legacy_showroom AS showroom_difference
FROM legacy_identity legacy
LEFT JOIN canonical
  ON canonical.product_sku = legacy.product_sku
 AND canonical.variant_suffix = legacy.variant_suffix;

CREATE OR REPLACE VIEW public.inventory_reconciliation_status_v
WITH (security_invoker = true)
AS
SELECT COUNT(*) FILTER (WHERE resolved_at IS NULL AND severity = 'blocking')::integer AS blocking_count,
       COUNT(*) FILTER (WHERE resolved_at IS NULL AND severity <> 'blocking')::integer AS warning_count,
       MAX(created_at) AS last_checked_at
FROM public.inventory_reconciliation_issues;

-- PostgreSQL grants EXECUTE to PUBLIC for newly-created functions by default.
-- Keep only the documented inventory entry points callable by authenticated
-- users; private helpers stay internal to SECURITY DEFINER functions/triggers.
REVOKE ALL ON FUNCTION private.assert_inventory_role(text[]) FROM authenticated;
REVOKE ALL ON FUNCTION private.assert_inventory_item_ready(text) FROM authenticated;
REVOKE ALL ON FUNCTION private.ensure_order_line_ids(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.sync_legacy_inventory_projection(text) FROM authenticated;
REVOKE ALL ON FUNCTION private.release_order_reservations_core(text, text, text) FROM authenticated;
REVOKE ALL ON FUNCTION private.save_order_with_inventory_core(jsonb, text) FROM authenticated;
REVOKE ALL ON FUNCTION private.restore_legacy_inventory_batch_core(text, text) FROM authenticated;

REVOKE ALL ON FUNCTION public.save_order_with_inventory_v1(jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.release_order_inventory_v1(text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_order_status_with_inventory_v1(text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_order_with_inventory_v1(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.adjust_inventory_stock_v1(text, text, text, uuid, text, integer, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.batch_adjust_inventory_stock_v1(jsonb, uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.transfer_inventory_stock_v1(text, text, text, uuid, uuid, integer, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_inventory_reorder_policy_v1(text, text, text, uuid, integer, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.convert_offer_to_order_v1(text, jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.receive_supplier_order_inventory_v1(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_production_batch_inventory_v1(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revert_order_production_inventory_v1(text, text) FROM PUBLIC, anon;

-- RLS and grants. Direct writes are intentionally unavailable; mutations use
-- constrained RPCs. Views use security_invoker and inherit these policies.
ALTER TABLE public.inventory_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_command_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_cutover_balance_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_reorder_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_shipment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_reconciliation_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inventory_balances_read_authenticated ON public.inventory_balances;
CREATE POLICY inventory_balances_read_authenticated
ON public.inventory_balances FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS inventory_reservations_read_operations ON public.inventory_reservations;
CREATE POLICY inventory_reservations_read_operations
ON public.inventory_reservations FOR SELECT TO authenticated
USING ((SELECT private.current_app_role()) IN ('admin', 'user'));

DROP POLICY IF EXISTS inventory_events_read_operations ON public.inventory_events;
CREATE POLICY inventory_events_read_operations
ON public.inventory_events FOR SELECT TO authenticated
USING ((SELECT private.current_app_role()) IN ('admin', 'user'));

DROP POLICY IF EXISTS inventory_reorder_policies_read_authenticated ON public.inventory_reorder_policies;
CREATE POLICY inventory_reorder_policies_read_authenticated
ON public.inventory_reorder_policies FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS inventory_shipment_allocations_read_operations ON public.inventory_shipment_allocations;
CREATE POLICY inventory_shipment_allocations_read_operations
ON public.inventory_shipment_allocations FOR SELECT TO authenticated
USING ((SELECT private.current_app_role()) IN ('admin', 'user'));

DROP POLICY IF EXISTS inventory_reconciliation_read_admin ON public.inventory_reconciliation_issues;
CREATE POLICY inventory_reconciliation_read_admin
ON public.inventory_reconciliation_issues FOR SELECT TO authenticated
USING ((SELECT private.current_app_role()) = 'admin');

DROP POLICY IF EXISTS inventory_cutover_snapshot_read_admin ON public.inventory_cutover_balance_snapshot;
CREATE POLICY inventory_cutover_snapshot_read_admin
ON public.inventory_cutover_balance_snapshot FOR SELECT TO authenticated
USING ((SELECT private.current_app_role()) = 'admin');

-- Warehouses are shared reference data. All authenticated roles may read them;
-- only administrators may change configuration. Existing permissive warehouse
-- policies are removed so they cannot bypass the role split.
DO $$
DECLARE
  policy_row record;
BEGIN
  FOR policy_row IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'warehouses'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.warehouses', policy_row.policyname);
  END LOOP;
END;
$$;

CREATE POLICY warehouses_read_authenticated
ON public.warehouses FOR SELECT TO authenticated USING (true);

CREATE POLICY warehouses_insert_admin
ON public.warehouses FOR INSERT TO authenticated
WITH CHECK ((SELECT private.current_app_role()) = 'admin');

CREATE POLICY warehouses_update_admin
ON public.warehouses FOR UPDATE TO authenticated
USING ((SELECT private.current_app_role()) = 'admin')
WITH CHECK ((SELECT private.current_app_role()) = 'admin');

CREATE POLICY warehouses_delete_admin
ON public.warehouses FOR DELETE TO authenticated
USING (
  (SELECT private.current_app_role()) = 'admin'
  AND is_system IS NOT TRUE
  AND id NOT IN (
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000002'::uuid
  )
);

REVOKE ALL ON public.inventory_balances FROM anon, authenticated;
REVOKE ALL ON public.inventory_reservations FROM anon, authenticated;
REVOKE ALL ON public.inventory_events FROM anon, authenticated;
REVOKE ALL ON public.inventory_command_results FROM anon, authenticated;
REVOKE ALL ON public.inventory_cutover_balance_snapshot FROM anon, authenticated;
REVOKE ALL ON public.inventory_reorder_policies FROM anon, authenticated;
REVOKE ALL ON public.inventory_shipment_allocations FROM anon, authenticated;
REVOKE ALL ON public.inventory_reconciliation_issues FROM anon, authenticated;

GRANT SELECT ON public.inventory_balances TO authenticated, service_role;
GRANT SELECT ON public.inventory_reservations TO authenticated, service_role;
GRANT SELECT ON public.inventory_events TO authenticated, service_role;
GRANT SELECT ON public.inventory_command_results TO service_role;
GRANT SELECT ON public.inventory_cutover_balance_snapshot TO authenticated, service_role;
GRANT SELECT ON public.inventory_reorder_policies TO authenticated, service_role;
GRANT SELECT ON public.inventory_shipment_allocations TO authenticated, service_role;
GRANT SELECT ON public.inventory_reconciliation_issues TO authenticated, service_role;
GRANT SELECT ON public.inventory_availability_v TO authenticated, service_role;
GRANT SELECT ON public.inventory_legacy_shadow_comparison_v TO authenticated, service_role;
GRANT SELECT ON public.inventory_reconciliation_status_v TO authenticated, service_role;

REVOKE ALL ON public.inventory_availability_v FROM PUBLIC, anon;
REVOKE ALL ON public.inventory_legacy_shadow_comparison_v FROM PUBLIC, anon;
REVOKE ALL ON public.inventory_reconciliation_status_v FROM PUBLIC, anon;

-- Existing shipment RPCs were previously executable by anon. They remain the
-- transactional shipment boundary but are now authenticated-only.
REVOKE EXECUTE ON FUNCTION public.create_partial_shipment_v1(text, text, jsonb, uuid, text, jsonb, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.revert_partial_shipment_v1(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_partial_shipment_v1(text, text, jsonb, uuid, text, jsonb, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.revert_partial_shipment_v1(text, uuid) TO authenticated, service_role;

-- Realtime publication is additive and safe when a table is already present.
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory_balances; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory_reservations; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory_events; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory_reorder_policies; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory_reconciliation_issues; EXCEPTION WHEN duplicate_object THEN NULL; END;
END;
$$;

COMMENT ON TABLE public.inventory_balances IS 'Canonical physical and reserved finished-goods balances per SKU, variant, size and warehouse.';
COMMENT ON TABLE public.inventory_events IS 'Immutable ERP inventory audit ledger. Rows are written only by constrained transactional functions.';
COMMENT ON VIEW public.inventory_availability_v IS 'Canonical Greek ERP inventory availability read model.';
