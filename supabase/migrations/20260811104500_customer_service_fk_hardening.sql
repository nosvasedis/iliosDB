-- Παρακαταθήκες & Επισκευές: complete foreign-key index coverage and
-- validate the additive production constraints after the schema is installed.

CREATE INDEX IF NOT EXISTS consignments_created_by_idx
  ON public.consignments (created_by);
CREATE INDEX IF NOT EXISTS consignments_source_warehouse_idx
  ON public.consignments (source_warehouse_id);

CREATE INDEX IF NOT EXISTS consignment_settlements_created_by_idx
  ON public.consignment_settlements (created_by);
CREATE INDEX IF NOT EXISTS consignment_settlements_legal_document_idx
  ON public.consignment_settlements (legal_document_id);
CREATE INDEX IF NOT EXISTS consignment_settlements_reversed_by_idx
  ON public.consignment_settlements (reversed_by);

CREATE INDEX IF NOT EXISTS consignment_payments_created_by_idx
  ON public.consignment_payments (created_by);

CREATE INDEX IF NOT EXISTS consignment_returns_created_by_idx
  ON public.consignment_returns (created_by);
CREATE INDEX IF NOT EXISTS consignment_returns_destination_warehouse_idx
  ON public.consignment_returns (destination_warehouse_id);

CREATE INDEX IF NOT EXISTS consignment_events_actor_idx
  ON public.consignment_events (actor_user_id);
CREATE INDEX IF NOT EXISTS consignment_events_line_idx
  ON public.consignment_events (consignment_line_id);

CREATE INDEX IF NOT EXISTS repair_intakes_created_by_idx
  ON public.repair_intakes (created_by);

CREATE INDEX IF NOT EXISTS repair_items_created_by_idx
  ON public.repair_items (created_by);
CREATE INDEX IF NOT EXISTS repair_items_intake_idx
  ON public.repair_items (intake_id);
CREATE INDEX IF NOT EXISTS repair_items_source_settlement_idx
  ON public.repair_items (source_consignment_settlement_id);

CREATE INDEX IF NOT EXISTS repair_cost_lines_created_by_idx
  ON public.repair_cost_lines (created_by);
CREATE INDEX IF NOT EXISTS repair_cost_lines_inventory_event_idx
  ON public.repair_cost_lines (inventory_event_id);
CREATE INDEX IF NOT EXISTS repair_cost_lines_product_idx
  ON public.repair_cost_lines (product_sku);
CREATE INDEX IF NOT EXISTS repair_cost_lines_cycle_idx
  ON public.repair_cost_lines (repair_cycle_id);
CREATE INDEX IF NOT EXISTS repair_cost_lines_warehouse_idx
  ON public.repair_cost_lines (warehouse_id);

CREATE INDEX IF NOT EXISTS repair_charges_legal_document_idx
  ON public.repair_charges (legal_document_id);
CREATE INDEX IF NOT EXISTS repair_charges_updated_by_idx
  ON public.repair_charges (updated_by);

CREATE INDEX IF NOT EXISTS repair_attachments_uploaded_by_idx
  ON public.repair_attachments (uploaded_by);

CREATE INDEX IF NOT EXISTS repair_events_actor_idx
  ON public.repair_events (actor_user_id);
CREATE INDEX IF NOT EXISTS repair_events_cycle_idx
  ON public.repair_events (repair_cycle_id);

CREATE INDEX IF NOT EXISTS customer_service_command_results_actor_idx
  ON public.customer_service_command_results (actor_user_id);

CREATE INDEX IF NOT EXISTS production_batches_repair_cycle_idx
  ON public.production_batches (repair_cycle_id)
  WHERE repair_cycle_id IS NOT NULL;

ALTER TABLE public.production_batches
  VALIDATE CONSTRAINT production_batches_workflow_kind_check;
ALTER TABLE public.production_batches
  VALIDATE CONSTRAINT production_batches_consignment_line_fk;
ALTER TABLE public.production_batches
  VALIDATE CONSTRAINT production_batches_repair_item_fk;
ALTER TABLE public.production_batches
  VALIDATE CONSTRAINT production_batches_repair_cycle_fk;
