-- Παρακαταθήκες & Επισκευές: normalized custody, financial and production links.
-- Additive migration. Existing orders and legacy "Φρεσκάρισμα" batches remain valid.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS private;

-- Stable protected warehouse ids used by the application and transactional RPCs.
-- Repair pieces are customer property and deliberately do NOT use these warehouses.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'warehouses_system_role_check'
      AND conrelid = 'public.warehouses'::regclass
  ) THEN
    ALTER TABLE public.warehouses DROP CONSTRAINT warehouses_system_role_check;
  END IF;
END;
$$;

ALTER TABLE public.warehouses
  ADD CONSTRAINT warehouses_system_role_check
  CHECK (
    CASE
      WHEN id = '00000000-0000-0000-0000-000000000001'::uuid
        THEN is_system IS TRUE AND type = 'Central'
      WHEN id = '00000000-0000-0000-0000-000000000002'::uuid
        THEN is_system IS TRUE AND type = 'Showroom'
      WHEN id IN (
        '00000000-0000-0000-0000-000000000003'::uuid,
        '00000000-0000-0000-0000-000000000004'::uuid
      ) THEN is_system IS TRUE AND type = 'Other'
      ELSE is_system IS NOT TRUE AND type <> 'Central'
    END
  ) NOT VALID;

CREATE OR REPLACE FUNCTION private.normalize_inventory_warehouse()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_protected boolean := NEW.id IN (
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000002'::uuid,
    '00000000-0000-0000-0000-000000000003'::uuid,
    '00000000-0000-0000-0000-000000000004'::uuid
  );
BEGIN
  NEW.name := btrim(NEW.name);
  NEW.category := btrim(NEW.category);
  NEW.address := NULLIF(btrim(COALESCE(NEW.address, '')), '');
  NEW.updated_at := now();
  NEW.updated_by := (SELECT auth.uid());

  IF TG_OP = 'UPDATE' THEN
    NEW.id := OLD.id;
    NEW.is_system := OLD.is_system;
    IF OLD.is_system IS TRUE THEN NEW.type := OLD.type; END IF;
  ELSIF v_protected THEN
    NEW.is_system := true;
    NEW.type := CASE
      WHEN NEW.id = '00000000-0000-0000-0000-000000000001'::uuid THEN 'Central'
      WHEN NEW.id = '00000000-0000-0000-0000-000000000002'::uuid THEN 'Showroom'
      ELSE 'Other'
    END;
  ELSE
    NEW.is_system := false;
    IF NEW.type = 'Central' THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'Η Κεντρική Αποθήκη υπάρχει ήδη και είναι μοναδική.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

INSERT INTO public.warehouses (id, name, type, is_system, category)
VALUES
  ('00000000-0000-0000-0000-000000000003', 'Παρακαταθήκες Πελατών', 'Other', true, 'Προστατευμένη θέση παρακαταθηκών'),
  ('00000000-0000-0000-0000-000000000004', 'Έλεγχος Επιστροφών', 'Other', true, 'Προστατευμένη θέση επιστροφών')
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    type = EXCLUDED.type,
    is_system = true,
    category = EXCLUDED.category;

ALTER TABLE public.warehouses VALIDATE CONSTRAINT warehouses_system_role_check;

-- Existing JSON order lines become normal sale lines without changing totals.
UPDATE public.orders
SET items = COALESCE((
  SELECT jsonb_agg(
    CASE
      WHEN line ? 'fulfillment_mode' THEN line
      ELSE line || jsonb_build_object('fulfillment_mode', 'sale')
    END
    ORDER BY ordinal
  )
  FROM jsonb_array_elements(COALESCE(public.orders.items, '[]'::jsonb))
    WITH ORDINALITY AS source(line, ordinal)
), '[]'::jsonb)
WHERE jsonb_typeof(items) = 'array'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(items) line
    WHERE NOT (line ? 'fulfillment_mode')
  );

ALTER TABLE public.production_batches
  ADD COLUMN IF NOT EXISTS workflow_kind text NOT NULL DEFAULT 'order',
  ADD COLUMN IF NOT EXISTS consignment_line_id uuid,
  ADD COLUMN IF NOT EXISTS repair_item_id uuid,
  ADD COLUMN IF NOT EXISTS repair_cycle_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'production_batches_workflow_kind_check'
      AND conrelid = 'public.production_batches'::regclass
  ) THEN
    ALTER TABLE public.production_batches
      ADD CONSTRAINT production_batches_workflow_kind_check
      CHECK (workflow_kind IN ('order', 'consignment', 'repair')) NOT VALID;
  END IF;
END;
$$;

CREATE SEQUENCE IF NOT EXISTS public.consignment_code_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.repair_intake_code_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.repair_item_code_seq START 1;

CREATE TABLE IF NOT EXISTS public.consignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  seller_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  source_order_id text,
  source_warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending_handoff'
    CHECK (status IN ('draft', 'pending_handoff', 'active', 'partially_settled', 'completed', 'cancelled')),
  financial_status text NOT NULL DEFAULT 'not_due'
    CHECK (financial_status IN ('not_due', 'due', 'partial', 'paid')),
  review_due_at date NOT NULL DEFAULT (CURRENT_DATE + 30),
  handed_off_at timestamptz,
  completed_at timestamptz,
  notes text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.consignment_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consignment_id uuid NOT NULL REFERENCES public.consignments(id) ON DELETE RESTRICT,
  order_line_id text,
  product_sku text NOT NULL REFERENCES public.products(sku) ON UPDATE CASCADE ON DELETE RESTRICT,
  variant_suffix text NOT NULL DEFAULT '',
  size_info text NOT NULL DEFAULT '',
  cord_color text,
  enamel_color text,
  quantity integer NOT NULL CHECK (quantity > 0),
  sold_quantity integer NOT NULL DEFAULT 0 CHECK (sold_quantity >= 0),
  returned_quantity integer NOT NULL DEFAULT 0 CHECK (returned_quantity >= 0),
  pending_quantity integer GENERATED ALWAYS AS (quantity - sold_quantity - returned_quantity) STORED,
  locked_unit_cost numeric(14, 4) NOT NULL DEFAULT 0 CHECK (locked_unit_cost >= 0),
  locked_unit_price numeric(14, 2) NOT NULL DEFAULT 0 CHECK (locked_unit_price >= 0),
  price_override_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT consignment_line_quantities_check
    CHECK (sold_quantity + returned_quantity <= quantity)
);

CREATE TABLE IF NOT EXISTS public.consignment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consignment_line_id uuid NOT NULL REFERENCES public.consignment_lines(id) ON DELETE RESTRICT,
  production_batch_id text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (consignment_line_id, production_batch_id)
);

CREATE TABLE IF NOT EXISTS public.consignment_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consignment_line_id uuid NOT NULL REFERENCES public.consignment_lines(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price numeric(14, 2) NOT NULL CHECK (unit_price >= 0),
  total_amount numeric(14, 2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  paid_amount numeric(14, 2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  status text NOT NULL DEFAULT 'due' CHECK (status IN ('due', 'partial', 'paid', 'reversed')),
  price_override_reason text,
  legal_document_id uuid REFERENCES public.legal_documents(id) ON DELETE SET NULL,
  sold_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reversed_at timestamptz,
  reversed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reversal_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT consignment_settlement_paid_check CHECK (paid_amount <= quantity * unit_price)
);

CREATE TABLE IF NOT EXISTS public.consignment_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id uuid NOT NULL REFERENCES public.consignment_settlements(id) ON DELETE RESTRICT,
  amount numeric(14, 2) NOT NULL CHECK (amount > 0),
  payment_method text,
  notes text,
  paid_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.consignment_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consignment_line_id uuid NOT NULL REFERENCES public.consignment_lines(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity > 0),
  status text NOT NULL DEFAULT 'inspection'
    CHECK (status IN ('inspection', 'restocked', 'production', 'damaged', 'reversed')),
  destination_warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  production_batch_id text,
  received_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  notes text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.consignment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consignment_id uuid NOT NULL REFERENCES public.consignments(id) ON DELETE RESTRICT,
  consignment_line_id uuid REFERENCES public.consignment_lines(id) ON DELETE RESTRICT,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.repair_intakes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  seller_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'completed', 'cancelled')),
  notes text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.repair_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  intake_id uuid NOT NULL REFERENCES public.repair_intakes(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  seller_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  origin_type text NOT NULL
    CHECK (origin_type IN ('recorded_sale', 'legacy_own', 'third_party')),
  source_order_id text,
  source_order_line_id text,
  source_consignment_settlement_id uuid REFERENCES public.consignment_settlements(id) ON DELETE SET NULL,
  product_sku text REFERENCES public.products(sku) ON UPDATE CASCADE ON DELETE SET NULL,
  variant_suffix text NOT NULL DEFAULT '',
  size_info text NOT NULL DEFAULT '',
  description text NOT NULL CHECK (btrim(description) <> ''),
  intake_condition text,
  accessories text,
  status text NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'in_production', 'quality_check', 'ready_for_return', 'delivered', 'on_hold', 'irreparable', 'cancelled')),
  current_cycle_number integer NOT NULL DEFAULT 1 CHECK (current_cycle_number > 0),
  previous_repair_item_id uuid REFERENCES public.repair_items(id) ON DELETE SET NULL,
  delivered_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.repair_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_item_id uuid NOT NULL REFERENCES public.repair_items(id) ON DELETE RESTRICT,
  cycle_number integer NOT NULL CHECK (cycle_number > 0),
  production_batch_id text NOT NULL,
  quality_status text NOT NULL DEFAULT 'pending'
    CHECK (quality_status IN ('pending', 'passed', 'failed')),
  quality_notes text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (repair_item_id, cycle_number)
);

CREATE TABLE IF NOT EXISTS public.repair_cost_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_item_id uuid NOT NULL REFERENCES public.repair_items(id) ON DELETE RESTRICT,
  repair_cycle_id uuid REFERENCES public.repair_cycles(id) ON DELETE SET NULL,
  cost_type text NOT NULL CHECK (cost_type IN ('labor', 'material', 'component', 'external')),
  description text NOT NULL CHECK (btrim(description) <> ''),
  quantity numeric(14, 3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_cost numeric(14, 4) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  product_sku text REFERENCES public.products(sku) ON UPDATE CASCADE ON DELETE SET NULL,
  variant_suffix text NOT NULL DEFAULT '',
  size_info text NOT NULL DEFAULT '',
  warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  inventory_event_id uuid REFERENCES public.inventory_events(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.repair_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_item_id uuid NOT NULL UNIQUE REFERENCES public.repair_items(id) ON DELETE RESTRICT,
  charge_type text NOT NULL DEFAULT 'unrecorded'
    CHECK (charge_type IN ('warranty', 'chargeable', 'unrecorded')),
  amount numeric(14, 2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  paid_amount numeric(14, 2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0 AND paid_amount <= amount),
  payment_status text NOT NULL DEFAULT 'not_due'
    CHECK (payment_status IN ('not_due', 'due', 'partial', 'paid')),
  legal_document_id uuid REFERENCES public.legal_documents(id) ON DELETE SET NULL,
  notes text,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.repair_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_item_id uuid NOT NULL REFERENCES public.repair_items(id) ON DELETE RESTRICT,
  storage_path text NOT NULL UNIQUE,
  file_name text NOT NULL,
  content_type text,
  attachment_type text NOT NULL DEFAULT 'intake'
    CHECK (attachment_type IN ('intake', 'quality', 'other')),
  uploaded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.repair_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_item_id uuid NOT NULL REFERENCES public.repair_items(id) ON DELETE RESTRICT,
  repair_cycle_id uuid REFERENCES public.repair_cycles(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.customer_service_command_results (
  idempotency_key text PRIMARY KEY,
  operation_type text NOT NULL,
  result jsonb NOT NULL,
  actor_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Add production foreign keys only after the target tables exist.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'production_batches_consignment_line_fk') THEN
    ALTER TABLE public.production_batches
      ADD CONSTRAINT production_batches_consignment_line_fk
      FOREIGN KEY (consignment_line_id) REFERENCES public.consignment_lines(id)
      ON DELETE SET NULL NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'production_batches_repair_item_fk') THEN
    ALTER TABLE public.production_batches
      ADD CONSTRAINT production_batches_repair_item_fk
      FOREIGN KEY (repair_item_id) REFERENCES public.repair_items(id)
      ON DELETE SET NULL NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'production_batches_repair_cycle_fk') THEN
    ALTER TABLE public.production_batches
      ADD CONSTRAINT production_batches_repair_cycle_fk
      FOREIGN KEY (repair_cycle_id) REFERENCES public.repair_cycles(id)
      ON DELETE SET NULL NOT VALID;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS consignments_customer_status_idx ON public.consignments (customer_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS consignments_seller_status_idx ON public.consignments (seller_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS consignments_review_idx ON public.consignments (review_due_at) WHERE status IN ('active', 'partially_settled');
CREATE INDEX IF NOT EXISTS consignment_lines_parent_idx ON public.consignment_lines (consignment_id);
CREATE INDEX IF NOT EXISTS consignment_lines_product_idx ON public.consignment_lines (product_sku, variant_suffix, size_info);
CREATE UNIQUE INDEX IF NOT EXISTS consignment_lines_order_line_unique_idx
  ON public.consignment_lines (order_line_id)
  WHERE order_line_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS consignment_allocations_batch_idx ON public.consignment_allocations (production_batch_id);
CREATE INDEX IF NOT EXISTS consignment_settlements_line_idx ON public.consignment_settlements (consignment_line_id, sold_at DESC);
CREATE INDEX IF NOT EXISTS consignment_payments_settlement_idx ON public.consignment_payments (settlement_id, paid_at DESC);
CREATE INDEX IF NOT EXISTS consignment_returns_line_idx ON public.consignment_returns (consignment_line_id, received_at DESC);
CREATE INDEX IF NOT EXISTS consignment_events_parent_idx ON public.consignment_events (consignment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS repair_intakes_customer_idx ON public.repair_intakes (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS repair_intakes_seller_idx ON public.repair_intakes (seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS repair_items_customer_status_idx ON public.repair_items (customer_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS repair_items_seller_status_idx ON public.repair_items (seller_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS repair_items_source_order_idx ON public.repair_items (source_order_id, source_order_line_id);
CREATE INDEX IF NOT EXISTS repair_items_product_idx ON public.repair_items (product_sku, variant_suffix);
CREATE INDEX IF NOT EXISTS repair_items_previous_idx ON public.repair_items (previous_repair_item_id);
CREATE INDEX IF NOT EXISTS repair_cycles_item_idx ON public.repair_cycles (repair_item_id, cycle_number DESC);
CREATE INDEX IF NOT EXISTS repair_cost_lines_item_idx ON public.repair_cost_lines (repair_item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS repair_attachments_item_idx ON public.repair_attachments (repair_item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS repair_events_item_idx ON public.repair_events (repair_item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS production_batches_workflow_idx ON public.production_batches (workflow_kind, current_stage, updated_at DESC);
CREATE INDEX IF NOT EXISTS production_batches_repair_item_idx ON public.production_batches (repair_item_id) WHERE repair_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS production_batches_consignment_line_idx ON public.production_batches (consignment_line_id) WHERE consignment_line_id IS NOT NULL;

CREATE OR REPLACE FUNCTION private.customer_service_can_access(
  p_customer_id uuid,
  p_seller_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN (SELECT auth.uid()) IS NULL THEN false
    WHEN role_row.role IN ('admin', 'user') THEN true
    WHEN role_row.role = 'seller' THEN p_seller_id = (SELECT auth.uid())
    ELSE false
  END
  FROM public.profiles role_row
  WHERE role_row.id = (SELECT auth.uid())
    AND role_row.is_approved IS TRUE
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION private.assert_customer_service_role(
  p_allowed text[],
  p_customer_id uuid DEFAULT NULL,
  p_seller_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_role text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Απαιτείται ενεργή σύνδεση χρήστη.';
  END IF;
  SELECT role INTO v_role FROM public.profiles
  WHERE id = v_actor AND is_approved IS TRUE;
  IF v_role IS NULL OR NOT (v_role = ANY(p_allowed)) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Δεν έχετε δικαίωμα εκτέλεσης αυτής της ενέργειας.';
  END IF;
  IF v_role = 'seller' AND (
    p_customer_id IS NULL OR p_seller_id IS DISTINCT FROM v_actor
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Μπορείτε να διαχειριστείτε μόνο εγγραφές των δικών σας πελατών.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.block_customer_service_event_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Το ιστορικό ενεργειών είναι αμετάβλητο.';
END;
$$;

DROP TRIGGER IF EXISTS consignment_events_immutable ON public.consignment_events;
CREATE TRIGGER consignment_events_immutable
BEFORE UPDATE OR DELETE ON public.consignment_events
FOR EACH ROW EXECUTE FUNCTION private.block_customer_service_event_changes();

DROP TRIGGER IF EXISTS repair_events_immutable ON public.repair_events;
CREATE TRIGGER repair_events_immutable
BEFORE UPDATE OR DELETE ON public.repair_events
FOR EACH ROW EXECUTE FUNCTION private.block_customer_service_event_changes();

-- RLS: direct writes stay closed; constrained RPCs own all state transitions.
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'consignments','consignment_lines','consignment_allocations','consignment_settlements',
    'consignment_payments','consignment_returns','consignment_events','repair_intakes',
    'repair_items','repair_cycles','repair_cost_lines','repair_charges','repair_attachments',
    'repair_events','customer_service_command_results'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', table_name);
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated, service_role', table_name);
  END LOOP;
END;
$$;

CREATE POLICY consignments_read_authorized ON public.consignments FOR SELECT TO authenticated
USING ((SELECT private.customer_service_can_access(customer_id, seller_id)));

CREATE POLICY consignment_lines_read_authorized ON public.consignment_lines FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.consignments parent
  WHERE parent.id = consignment_id
    AND (SELECT private.customer_service_can_access(parent.customer_id, parent.seller_id))
));

CREATE POLICY consignment_allocations_read_authorized ON public.consignment_allocations FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.consignment_lines line
  JOIN public.consignments parent ON parent.id = line.consignment_id
  WHERE line.id = consignment_line_id
    AND (SELECT private.customer_service_can_access(parent.customer_id, parent.seller_id))
));

CREATE POLICY consignment_settlements_read_authorized ON public.consignment_settlements FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.consignment_lines line
  JOIN public.consignments parent ON parent.id = line.consignment_id
  WHERE line.id = consignment_line_id
    AND (SELECT private.customer_service_can_access(parent.customer_id, parent.seller_id))
));

CREATE POLICY consignment_payments_read_authorized ON public.consignment_payments FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.consignment_settlements settlement
  JOIN public.consignment_lines line ON line.id = settlement.consignment_line_id
  JOIN public.consignments parent ON parent.id = line.consignment_id
  WHERE settlement.id = settlement_id
    AND (SELECT private.customer_service_can_access(parent.customer_id, parent.seller_id))
));

CREATE POLICY consignment_returns_read_authorized ON public.consignment_returns FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.consignment_lines line
  JOIN public.consignments parent ON parent.id = line.consignment_id
  WHERE line.id = consignment_line_id
    AND (SELECT private.customer_service_can_access(parent.customer_id, parent.seller_id))
));

CREATE POLICY consignment_events_read_authorized ON public.consignment_events FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.consignments parent
  WHERE parent.id = consignment_id
    AND (SELECT private.customer_service_can_access(parent.customer_id, parent.seller_id))
));

CREATE POLICY repair_intakes_read_authorized ON public.repair_intakes FOR SELECT TO authenticated
USING ((SELECT private.customer_service_can_access(customer_id, seller_id)));

CREATE POLICY repair_items_read_authorized ON public.repair_items FOR SELECT TO authenticated
USING ((SELECT private.customer_service_can_access(customer_id, seller_id)));

CREATE POLICY repair_cycles_read_authorized ON public.repair_cycles FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.repair_items item
  WHERE item.id = repair_item_id
    AND (SELECT private.customer_service_can_access(item.customer_id, item.seller_id))
));

CREATE POLICY repair_cost_lines_read_authorized ON public.repair_cost_lines FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.repair_items item
  WHERE item.id = repair_item_id
    AND (SELECT private.customer_service_can_access(item.customer_id, item.seller_id))
));

CREATE POLICY repair_charges_read_authorized ON public.repair_charges FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.repair_items item
  WHERE item.id = repair_item_id
    AND (SELECT private.customer_service_can_access(item.customer_id, item.seller_id))
));

CREATE POLICY repair_attachments_read_authorized ON public.repair_attachments FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.repair_items item
  WHERE item.id = repair_item_id
    AND (SELECT private.customer_service_can_access(item.customer_id, item.seller_id))
));

CREATE POLICY repair_events_read_authorized ON public.repair_events FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.repair_items item
  WHERE item.id = repair_item_id
    AND (SELECT private.customer_service_can_access(item.customer_id, item.seller_id))
));

-- Command results are internal idempotency state, not a browser read model.
REVOKE SELECT ON public.customer_service_command_results FROM authenticated;

REVOKE ALL ON FUNCTION private.customer_service_can_access(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.customer_service_can_access(uuid, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION private.assert_customer_service_role(text[], uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.block_customer_service_event_changes() FROM PUBLIC, anon, authenticated;

-- Private attachment bucket. Upload is authorized against a pre-created attachment slot.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'repair-attachments',
  'repair-attachments',
  false,
  10485760,
  ARRAY['image/jpeg','image/png','image/webp','application/pdf']
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS repair_attachments_storage_read ON storage.objects;
CREATE POLICY repair_attachments_storage_read ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'repair-attachments'
  AND EXISTS (
    SELECT 1 FROM public.repair_attachments attachment
    JOIN public.repair_items item ON item.id = attachment.repair_item_id
    WHERE attachment.storage_path = name
      AND (SELECT private.customer_service_can_access(item.customer_id, item.seller_id))
  )
);

DROP POLICY IF EXISTS repair_attachments_storage_insert ON storage.objects;
CREATE POLICY repair_attachments_storage_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'repair-attachments'
  AND EXISTS (
    SELECT 1 FROM public.repair_attachments attachment
    JOIN public.repair_items item ON item.id = attachment.repair_item_id
    WHERE attachment.storage_path = name
      AND (SELECT private.customer_service_can_access(item.customer_id, item.seller_id))
  )
);

DROP POLICY IF EXISTS repair_attachments_storage_update ON storage.objects;
CREATE POLICY repair_attachments_storage_update ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'repair-attachments'
  AND EXISTS (
    SELECT 1 FROM public.repair_attachments attachment
    JOIN public.repair_items item ON item.id = attachment.repair_item_id
    WHERE attachment.storage_path = name
      AND (SELECT private.customer_service_can_access(item.customer_id, item.seller_id))
  )
)
WITH CHECK (
  bucket_id = 'repair-attachments'
  AND EXISTS (
    SELECT 1 FROM public.repair_attachments attachment
    JOIN public.repair_items item ON item.id = attachment.repair_item_id
    WHERE attachment.storage_path = name
      AND (SELECT private.customer_service_can_access(item.customer_id, item.seller_id))
  )
);

DROP POLICY IF EXISTS repair_attachments_storage_delete ON storage.objects;
CREATE POLICY repair_attachments_storage_delete ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'repair-attachments'
  AND EXISTS (
    SELECT 1 FROM public.profiles actor
    WHERE actor.id = (SELECT auth.uid()) AND actor.role = 'admin' AND actor.is_approved IS TRUE
  )
  AND EXISTS (
    SELECT 1 FROM public.repair_attachments attachment
    JOIN public.repair_items item ON item.id = attachment.repair_item_id
    WHERE attachment.storage_path = name
      AND (SELECT private.customer_service_can_access(item.customer_id, item.seller_id))
  )
);

DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.consignments; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.consignment_lines; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.consignment_settlements; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.consignment_payments; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.consignment_returns; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.consignment_events; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.repair_intakes; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.repair_items; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.repair_cycles; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.repair_cost_lines; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.repair_charges; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.repair_attachments; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.repair_events; EXCEPTION WHEN duplicate_object THEN NULL; END;
END;
$$;

COMMENT ON TABLE public.consignments IS 'Customer consignments whose goods remain company-owned until sold or returned.';
COMMENT ON TABLE public.repair_items IS 'Customer-owned physical pieces held for repair; excluded from company inventory valuation.';
COMMENT ON COLUMN public.production_batches.workflow_kind IS 'Stable workflow discriminator rendered with Greek labels in every UI.';
