-- Post-application hardening for transactional finished-goods inventory v1.
-- The migration validates deferred constraints, makes the audit ledger
-- database-immutable, closes helper-function privileges, adds the advisor
-- index and retries the cutover reservation backfill without requiring a
-- request JWT.

CREATE INDEX IF NOT EXISTS inventory_balances_warehouse_idx
  ON public.inventory_balances (warehouse_id);

ALTER TABLE public.production_batches
  VALIDATE CONSTRAINT production_batches_fulfillment_source_check;

ALTER TABLE public.inventory_balances
  VALIDATE CONSTRAINT inventory_balances_nonnegative_check;

ALTER TABLE public.inventory_balances
  VALIDATE CONSTRAINT inventory_balances_product_fk;

ALTER TABLE public.inventory_balances
  VALIDATE CONSTRAINT inventory_balances_warehouse_fk;

CREATE OR REPLACE FUNCTION private.guard_inventory_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '55000',
    MESSAGE = 'Το ιστορικό κινήσεων αποθέματος είναι αμετάβλητο. Καταχωρίστε αντιλογιστική κίνηση αντί για τροποποίηση ή διαγραφή.';
END;
$$;

REVOKE ALL ON FUNCTION private.guard_inventory_event_mutation()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS inventory_events_immutable_guard
  ON public.inventory_events;

CREATE TRIGGER inventory_events_immutable_guard
BEFORE UPDATE OR DELETE ON public.inventory_events
FOR EACH ROW
EXECUTE FUNCTION private.guard_inventory_event_mutation();

REVOKE ALL ON FUNCTION private.consume_inventory_reservation_for_shipment()
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION private.restore_inventory_reservation_for_shipment()
  FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS inventory_command_results_no_client_access
  ON public.inventory_command_results;

CREATE POLICY inventory_command_results_no_client_access
ON public.inventory_command_results
FOR SELECT
TO authenticated
USING (false);

DO $$
DECLARE
  order_row public.orders%ROWTYPE;
  item jsonb;
  balance_row public.inventory_balances%ROWTYPE;
  v_sku text;
  v_variant text;
  v_size text;
  v_line_id text;
  v_warehouse_id uuid;
  v_requested integer;
  v_existing_reserved integer;
  v_reserve_quantity integer;
  v_sequence integer;
  v_idempotency_key text;
  v_central constant uuid := '00000000-0000-0000-0000-000000000001'::uuid;
BEGIN
  FOR order_row IN
    SELECT candidate.*
    FROM public.orders candidate
    JOIN public.inventory_reconciliation_issues issue
      ON issue.issue_type = 'reservation_backfill_failed'
     AND issue.resolved_at IS NULL
     AND issue.details->>'order_id' = candidate.id
    WHERE candidate.status = 'Pending'
      AND NOT EXISTS (
        SELECT 1
        FROM public.order_shipments shipment
        WHERE shipment.order_id = candidate.id
      )
    ORDER BY candidate.created_at, candidate.id
    FOR UPDATE OF candidate
  LOOP
    v_sequence := 0;
    v_idempotency_key := format(
      'cutover-order-reservation-retry:%s',
      order_row.id
    );

    FOR item IN
      SELECT value
      FROM jsonb_array_elements(COALESCE(order_row.items, '[]'::jsonb)) rows(value)
    LOOP
      v_sku := BTRIM(COALESCE(item->>'sku', ''));
      v_variant := BTRIM(COALESCE(item->>'variant_suffix', ''));
      v_size := BTRIM(COALESCE(item->>'size_info', ''));
      v_line_id := BTRIM(COALESCE(item->>'line_id', ''));
      v_requested := GREATEST(COALESCE((item->>'quantity')::integer, 0), 0);
      v_warehouse_id := COALESCE(
        NULLIF(item->>'warehouse_id', '')::uuid,
        v_central
      );

      IF v_sku = '' OR v_line_id = '' OR v_requested = 0 THEN
        CONTINUE;
      END IF;

      SELECT COALESCE(SUM(reservation.quantity), 0)::integer
      INTO v_existing_reserved
      FROM public.inventory_reservations reservation
      WHERE reservation.order_id = order_row.id
        AND reservation.order_line_id = v_line_id
        AND reservation.state = 'active';

      v_requested := GREATEST(v_requested - v_existing_reserved, 0);
      IF v_requested = 0 THEN
        CONTINUE;
      END IF;

      SELECT balance.*
      INTO balance_row
      FROM public.inventory_balances balance
      WHERE balance.product_sku = v_sku
        AND balance.variant_suffix = v_variant
        AND balance.warehouse_id = v_warehouse_id
        AND (
          balance.size_info = v_size
          OR (
            v_size <> ''
            AND balance.size_info = ''
            AND NOT EXISTS (
              SELECT 1
              FROM public.inventory_balances sized
              WHERE sized.product_sku = v_sku
                AND sized.variant_suffix = v_variant
                AND sized.warehouse_id = v_warehouse_id
                AND sized.size_info <> ''
            )
          )
        )
      ORDER BY CASE WHEN balance.size_info = v_size THEN 0 ELSE 1 END
      LIMIT 1
      FOR UPDATE;

      IF NOT FOUND THEN
        CONTINUE;
      END IF;

      v_reserve_quantity := LEAST(
        v_requested,
        GREATEST(balance_row.on_hand - balance_row.reserved, 0)
      );

      IF v_reserve_quantity = 0 THEN
        CONTINUE;
      END IF;

      INSERT INTO public.inventory_reservations (
        order_id,
        order_line_id,
        product_sku,
        variant_suffix,
        size_info,
        warehouse_id,
        initial_quantity,
        quantity
      )
      VALUES (
        order_row.id,
        v_line_id,
        v_sku,
        v_variant,
        balance_row.size_info,
        v_warehouse_id,
        v_reserve_quantity,
        v_reserve_quantity
      );

      UPDATE public.inventory_balances
      SET reserved = reserved + v_reserve_quantity,
          version = version + 1,
          updated_at = now()
      WHERE product_sku = balance_row.product_sku
        AND variant_suffix = balance_row.variant_suffix
        AND size_info = balance_row.size_info
        AND warehouse_id = balance_row.warehouse_id
      RETURNING * INTO balance_row;

      v_sequence := v_sequence + 1;

      INSERT INTO public.inventory_events (
        sequence_no,
        operation_type,
        product_sku,
        variant_suffix,
        size_info,
        warehouse_id,
        reserved_delta,
        on_hand_after,
        reserved_after,
        reference_type,
        reference_id,
        reference_line_id,
        actor_name,
        reason,
        idempotency_key
      )
      VALUES (
        v_sequence,
        'order_reservation',
        v_sku,
        v_variant,
        balance_row.size_info,
        v_warehouse_id,
        v_reserve_quantity,
        balance_row.on_hand,
        balance_row.reserved,
        'order',
        order_row.id,
        v_line_id,
        'Μετάπτωση συστήματος',
        'Επαναληπτική αρχική δέσμευση εκκρεμούς παραγγελίας κατά τη μετάπτωση.',
        v_idempotency_key
      );
    END LOOP;

    UPDATE public.inventory_reconciliation_issues
    SET resolved_at = now(),
        resolution_note = 'Η εκκρεμής παραγγελία επανελέγχθηκε και δεσμεύτηκε έως το διαθέσιμο απόθεμα από τη migration σκλήρυνσης.'
    WHERE issue_type = 'reservation_backfill_failed'
      AND resolved_at IS NULL
      AND details->>'order_id' = order_row.id;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION private.guard_inventory_event_mutation()
IS 'Prevents UPDATE and DELETE on the immutable inventory audit ledger.';
