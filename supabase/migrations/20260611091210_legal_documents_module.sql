CREATE TABLE IF NOT EXISTS public.legal_settings (
  id uuid PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000091',
  environment text NOT NULL DEFAULT 'dev' CHECK (environment IN ('dev', 'prod')),
  issuer jsonb NOT NULL DEFAULT '{}'::jsonb,
  default_payment_method integer NOT NULL DEFAULT 5,
  default_vat_exemption_category integer,
  default_income_classification_category text NOT NULL DEFAULT 'category1_2',
  default_income_classification_type text NOT NULL DEFAULT 'E3_561_001',
  inhouse_income_classification_category text NOT NULL DEFAULT 'category1_2',
  inhouse_income_classification_type text NOT NULL DEFAULT 'E3_561_001',
  imported_income_classification_category text NOT NULL DEFAULT 'category1_1',
  imported_income_classification_type text NOT NULL DEFAULT 'E3_561_001',
  default_move_purpose integer NOT NULL DEFAULT 1,
  loading_address jsonb,
  require_aade_credentials boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.legal_numbering_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_kind text NOT NULL CHECK (document_kind IN ('invoice', 'delivery_note', 'invoice_delivery', 'credit')),
  aade_document_type text NOT NULL CHECK (aade_document_type IN ('1.1', '9.3', '5.1', '5.2')),
  series text NOT NULL,
  next_aa bigint NOT NULL DEFAULT 1 CHECK (next_aa > 0),
  is_active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_kind, series)
);

CREATE TABLE IF NOT EXISTS public.legal_carriers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  vat_number text,
  vehicle_number text,
  phone text,
  notes text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.legal_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid,
  shipment_id text,
  source_kind text NOT NULL DEFAULT 'manual' CHECK (source_kind IN ('order', 'shipment', 'manual')),
  document_kind text NOT NULL CHECK (document_kind IN ('invoice', 'delivery_note', 'invoice_delivery', 'credit')),
  aade_document_type text NOT NULL CHECK (aade_document_type IN ('1.1', '9.3', '5.1', '5.2')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'issued', 'failed', 'cancelled')),
  series text,
  aa text,
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  issuer jsonb NOT NULL DEFAULT '{}'::jsonb,
  counterpart jsonb NOT NULL DEFAULT '{}'::jsonb,
  delivery jsonb,
  payment_method_code integer NOT NULL DEFAULT 5,
  currency text NOT NULL DEFAULT 'EUR',
  vat_rate numeric,
  vat_exemption_category integer,
  revenue_classification jsonb NOT NULL DEFAULT '[]'::jsonb,
  totals jsonb NOT NULL DEFAULT '{"net":0,"vat":0,"gross":0,"quantity":0}'::jsonb,
  aade_uid text,
  aade_mark text,
  cancellation_mark text,
  authentication_code text,
  qr_url text,
  last_error text,
  raw_xml text,
  locked_at timestamptz,
  submitted_at timestamptz,
  cancelled_at timestamptz,
  printed_at timestamptz,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (series, aa)
);

CREATE TABLE IF NOT EXISTS public.legal_document_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.legal_documents(id) ON DELETE CASCADE,
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
  UNIQUE (document_id, line_number)
);

CREATE TABLE IF NOT EXISTS public.legal_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.legal_documents(id) ON DELETE CASCADE,
  payment_method_code integer NOT NULL,
  amount numeric NOT NULL CHECK (amount >= 0),
  payment_method_mark text,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.legal_transmissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid REFERENCES public.legal_documents(id) ON DELETE SET NULL,
  action text NOT NULL,
  endpoint text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('dev', 'prod')),
  status text NOT NULL CHECK (status IN ('success', 'failed')),
  request_payload text,
  response_payload text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.legal_delivery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.legal_documents(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('register_transfer', 'confirm_delivery', 'failed_delivery', 'reject_delivery', 'status_poll')),
  aade_status text,
  actor_role text NOT NULL DEFAULT 'issuer' CHECK (actor_role IN ('issuer', 'carrier', 'receiver')),
  event_payload jsonb,
  event_mark text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.legal_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid REFERENCES public.legal_documents(id) ON DELETE SET NULL,
  action text NOT NULL,
  user_name text,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_legal_documents_order_id ON public.legal_documents(order_id);
CREATE INDEX IF NOT EXISTS idx_legal_documents_shipment_id ON public.legal_documents(shipment_id);
CREATE INDEX IF NOT EXISTS idx_legal_documents_status ON public.legal_documents(status);
CREATE INDEX IF NOT EXISTS idx_legal_documents_created_at ON public.legal_documents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_legal_lines_document_id ON public.legal_document_lines(document_id);
CREATE INDEX IF NOT EXISTS idx_legal_transmissions_document_id ON public.legal_transmissions(document_id);
CREATE INDEX IF NOT EXISTS idx_legal_delivery_events_document_id ON public.legal_delivery_events(document_id);

INSERT INTO public.legal_settings (id, issuer)
VALUES (
  '00000000-0000-0000-0000-000000000091',
  '{"country":"GR","branch":0,"business_name":"ILIOS KOSMIMA","vat_number":"","phone":"2104905405","email":"ilioskosmima@gmail.com","address":{"street":"","number":"","postal_code":"","city":""}}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.legal_numbering_sequences (document_kind, aade_document_type, series, next_aa)
VALUES
  ('invoice', '1.1', 'ΤΙΜ', 1),
  ('delivery_note', '9.3', 'ΔΑ', 1),
  ('invoice_delivery', '1.1', 'ΤΔΑ', 1),
  ('credit', '5.1', 'ΠΙΣ', 1)
ON CONFLICT (document_kind, series) DO NOTHING;

CREATE OR REPLACE FUNCTION public.allocate_legal_document_number(p_sequence_id uuid)
RETURNS TABLE(series text, aa text)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_sequence public.legal_numbering_sequences%ROWTYPE;
BEGIN
  SELECT *
  INTO v_sequence
  FROM public.legal_numbering_sequences
  WHERE id = p_sequence_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Legal numbering sequence not found';
  END IF;

  IF NOT v_sequence.is_active THEN
    RAISE EXCEPTION 'Legal numbering sequence is inactive';
  END IF;

  UPDATE public.legal_numbering_sequences
  SET next_aa = v_sequence.next_aa + 1,
      updated_at = now()
  WHERE id = p_sequence_id;

  series := v_sequence.series;
  aa := v_sequence.next_aa::text;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.allocate_legal_document_number(uuid) TO authenticated;

ALTER TABLE public.legal_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_numbering_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_carriers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_document_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_transmissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_delivery_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_audit_log ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'legal_settings',
    'legal_numbering_sequences',
    'legal_carriers',
    'legal_documents',
    'legal_document_lines',
    'legal_payments',
    'legal_transmissions',
    'legal_delivery_events',
    'legal_audit_log'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_authenticated_all', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      table_name || '_authenticated_all',
      table_name
    );
  END LOOP;
END $$;
