-- Legal archive relationship intelligence:
-- persistent seller matching for operational delivery notes and explicit
-- whole/partial order allocations for both legal documents and proformas.

ALTER TABLE public.legal_documents
  ADD COLUMN IF NOT EXISTS counterpart_seller_id uuid
    REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS order_link_mode text NOT NULL DEFAULT 'whole',
  ADD COLUMN IF NOT EXISTS order_line_allocations jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.proforma_documents
  ADD COLUMN IF NOT EXISTS order_link_mode text NOT NULL DEFAULT 'whole',
  ADD COLUMN IF NOT EXISTS order_line_allocations jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'legal_documents_order_link_mode_check'
      AND conrelid = 'public.legal_documents'::regclass
  ) THEN
    ALTER TABLE public.legal_documents
      ADD CONSTRAINT legal_documents_order_link_mode_check
      CHECK (order_link_mode IN ('whole', 'partial'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'proforma_documents_order_link_mode_check'
      AND conrelid = 'public.proforma_documents'::regclass
  ) THEN
    ALTER TABLE public.proforma_documents
      ADD CONSTRAINT proforma_documents_order_link_mode_check
      CHECK (order_link_mode IN ('whole', 'partial'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'legal_documents_order_line_allocations_array_check'
      AND conrelid = 'public.legal_documents'::regclass
  ) THEN
    ALTER TABLE public.legal_documents
      ADD CONSTRAINT legal_documents_order_line_allocations_array_check
      CHECK (jsonb_typeof(order_line_allocations) = 'array');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'proforma_documents_order_line_allocations_array_check'
      AND conrelid = 'public.proforma_documents'::regclass
  ) THEN
    ALTER TABLE public.proforma_documents
      ADD CONSTRAINT proforma_documents_order_line_allocations_array_check
      CHECK (jsonb_typeof(order_line_allocations) = 'array');
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_legal_documents_counterpart_seller_id
  ON public.legal_documents(counterpart_seller_id)
  WHERE counterpart_seller_id IS NOT NULL;

COMMENT ON COLUMN public.legal_documents.counterpart_seller_id IS
  'Confirmed Ilios seller linked to an operational delivery-note counterpart.';

COMMENT ON COLUMN public.legal_documents.order_link_mode IS
  'Whether the linked order is represented in full or only by selected line allocations.';

COMMENT ON COLUMN public.legal_documents.order_line_allocations IS
  'Confirmed partial-order line identities and quantities; empty for whole-order links.';

COMMENT ON COLUMN public.proforma_documents.order_link_mode IS
  'Whether the linked order is represented in full or only by selected line allocations.';

COMMENT ON COLUMN public.proforma_documents.order_line_allocations IS
  'Confirmed partial-order line identities and quantities; empty for whole-order links.';
