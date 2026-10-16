-- The «Παρακαταθήκες Πελατών» location is owned by the consignment workflow:
-- every unit there must correspond to an open consignment line. Manual
-- inventory commands (count, increase, adjustment, transfer) must therefore
-- never write to it, otherwise later settlements or returns fail or the
-- consignment balance silently diverges from its lines.
--
-- The guard runs on the immutable ledger, so it covers every current and
-- future manual command and rolls back the whole atomic command.

CREATE OR REPLACE FUNCTION private.guard_consignment_warehouse_manual_event()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.warehouse_id = '00000000-0000-0000-0000-000000000003'::uuid
     AND NEW.operation_type IN (
       'adjustment',
       'stock_count',
       'manual_stock_increase',
       'transfer_out',
       'transfer_in'
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Η θέση «Παρακαταθήκες Πελατών» ενημερώνεται αποκλειστικά από τη ροή Παρακαταθηκών. Δεν πραγματοποιήθηκε καμία μεταβολή. Χρησιμοποιήστε την παράδοση, πώληση ή επιστροφή Παρακαταθήκης.';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_consignment_warehouse_manual_event() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS inventory_events_consignment_manual_guard ON public.inventory_events;
CREATE TRIGGER inventory_events_consignment_manual_guard
BEFORE INSERT ON public.inventory_events
FOR EACH ROW
EXECUTE FUNCTION private.guard_consignment_warehouse_manual_event();
