CREATE TABLE IF NOT EXISTS public.legal_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  environment text NOT NULL CHECK (environment IN ('dev', 'prod')),
  date_from date,
  date_to date,
  mark_from text,
  status text NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'failed', 'partial')),
  imported_count integer NOT NULL DEFAULT 0 CHECK (imported_count >= 0),
  updated_count integer NOT NULL DEFAULT 0 CHECK (updated_count >= 0),
  error_message text,
  next_partition_key text,
  next_row_key text,
  created_by text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

ALTER TABLE public.legal_documents
  ADD COLUMN IF NOT EXISTS external_source text NOT NULL DEFAULT 'ilios' CHECK (external_source IN ('ilios', 'aade_sync')),
  ADD COLUMN IF NOT EXISTS synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS sync_run_id uuid REFERENCES public.legal_sync_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS local_notes text;

ALTER TABLE public.legal_documents
  DROP CONSTRAINT IF EXISTS legal_documents_source_kind_check;

ALTER TABLE public.legal_documents
  ADD CONSTRAINT legal_documents_source_kind_check
  CHECK (source_kind IN ('order', 'shipment', 'manual', 'aade_sync', 'proforma'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_legal_documents_aade_mark_unique
  ON public.legal_documents(aade_mark)
  WHERE aade_mark IS NOT NULL AND aade_mark <> '';

CREATE INDEX IF NOT EXISTS idx_legal_documents_sync_run_id ON public.legal_documents(sync_run_id);
CREATE INDEX IF NOT EXISTS idx_legal_documents_synced_at ON public.legal_documents(synced_at DESC);

CREATE TABLE IF NOT EXISTS public.proforma_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid,
  shipment_id text,
  source_kind text NOT NULL DEFAULT 'manual' CHECK (source_kind IN ('order', 'shipment', 'manual', 'proforma')),
  document_kind text NOT NULL DEFAULT 'proforma' CHECK (document_kind = 'proforma'),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'converted', 'void')),
  series text,
  aa text,
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  valid_until date,
  issuer jsonb NOT NULL DEFAULT '{}'::jsonb,
  counterpart jsonb NOT NULL DEFAULT '{}'::jsonb,
  payment_method_code integer NOT NULL DEFAULT 5,
  currency text NOT NULL DEFAULT 'EUR',
  vat_rate numeric,
  vat_exemption_category integer,
  revenue_classification jsonb NOT NULL DEFAULT '[]'::jsonb,
  totals jsonb NOT NULL DEFAULT '{"net":0,"vat":0,"gross":0,"quantity":0}'::jsonb,
  notes text,
  converted_legal_document_id uuid REFERENCES public.legal_documents(id) ON DELETE SET NULL,
  converted_at timestamptz,
  voided_at timestamptz,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (series, aa)
);

CREATE TABLE IF NOT EXISTS public.proforma_document_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proforma_id uuid NOT NULL REFERENCES public.proforma_documents(id) ON DELETE CASCADE,
  line_number integer NOT NULL,
  sku text NOT NULL,
  variant_suffix text,
  description text NOT NULL,
  quantity numeric NOT NULL CHECK (quantity > 0),
  unit_price numeric NOT NULL DEFAULT 0,
  net_value numeric NOT NULL DEFAULT 0,
  vat_category integer NOT NULL DEFAULT 1,
  vat_amount numeric NOT NULL DEFAULT 0,
  gross_value numeric NOT NULL DEFAULT 0,
  measurement_unit integer NOT NULL DEFAULT 1,
  item_code text,
  income_classification jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_order_line_key text,
  line_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (proforma_id, line_number)
);

CREATE INDEX IF NOT EXISTS idx_proforma_documents_order_id ON public.proforma_documents(order_id);
CREATE INDEX IF NOT EXISTS idx_proforma_documents_status ON public.proforma_documents(status);
CREATE INDEX IF NOT EXISTS idx_proforma_documents_created_at ON public.proforma_documents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_proforma_lines_proforma_id ON public.proforma_document_lines(proforma_id);
CREATE INDEX IF NOT EXISTS idx_legal_sync_runs_started_at ON public.legal_sync_runs(started_at DESC);

ALTER TABLE public.legal_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proforma_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proforma_document_lines ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'legal_sync_runs',
    'proforma_documents',
    'proforma_document_lines'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_admin_all', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.is_legal_module_admin()) WITH CHECK (public.is_legal_module_admin())',
      table_name || '_admin_all',
      table_name
    );
  END LOOP;
END $$;
