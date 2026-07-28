-- Smart legal archive: persistent counterpart links, versioned AADE enrichment metadata,
-- and learned mappings from external item codes to the Ilios catalog.

ALTER TABLE public.legal_documents
  ADD COLUMN IF NOT EXISTS counterpart_customer_id uuid
    REFERENCES public.customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS archive_parse_version smallint NOT NULL DEFAULT 0;

ALTER TABLE public.proforma_documents
  ADD COLUMN IF NOT EXISTS counterpart_customer_id uuid
    REFERENCES public.customers(id) ON DELETE SET NULL;

ALTER TABLE public.legal_document_lines
  ADD COLUMN IF NOT EXISTS source_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.proforma_document_lines
  ADD COLUMN IF NOT EXISTS source_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.legal_external_item_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_source text NOT NULL,
  normalized_item_code text NOT NULL,
  raw_item_code text NOT NULL,
  product_sku text NOT NULL
    REFERENCES public.products(sku) ON UPDATE CASCADE ON DELETE RESTRICT,
  variant_suffix text,
  created_by text,
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT legal_external_item_aliases_code_not_blank
    CHECK (length(btrim(normalized_item_code)) > 0),
  CONSTRAINT legal_external_item_aliases_source_not_blank
    CHECK (length(btrim(external_source)) > 0),
  CONSTRAINT legal_external_item_aliases_source_code_key
    UNIQUE (external_source, normalized_item_code)
);

CREATE INDEX IF NOT EXISTS idx_legal_documents_counterpart_customer_id
  ON public.legal_documents(counterpart_customer_id);

CREATE INDEX IF NOT EXISTS idx_proforma_documents_counterpart_customer_id
  ON public.proforma_documents(counterpart_customer_id);

CREATE INDEX IF NOT EXISTS idx_legal_documents_issue_date
  ON public.legal_documents(issue_date DESC);

CREATE INDEX IF NOT EXISTS idx_proforma_documents_issue_date
  ON public.proforma_documents(issue_date DESC);

CREATE INDEX IF NOT EXISTS idx_legal_external_item_aliases_product
  ON public.legal_external_item_aliases(product_sku, variant_suffix);

ALTER TABLE public.legal_external_item_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS legal_external_item_aliases_admin_all
  ON public.legal_external_item_aliases;

CREATE POLICY legal_external_item_aliases_admin_all
  ON public.legal_external_item_aliases
  FOR ALL
  TO authenticated
  USING ((SELECT public.is_legal_module_admin()))
  WITH CHECK ((SELECT public.is_legal_module_admin()));

-- Explicit grants keep the table available to supabase-js even for projects
-- using the newer opt-in Data API exposure defaults. RLS remains authoritative.
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.legal_external_item_aliases TO authenticated;
GRANT ALL
  ON TABLE public.legal_external_item_aliases TO service_role;

COMMENT ON COLUMN public.legal_documents.archive_parse_version IS
  'Version of the AADE raw_xml enrichment applied to the archived document.';

COMMENT ON COLUMN public.legal_document_lines.source_metadata IS
  'Lossless searchable metadata recovered from the source XML, such as itemDescr and lineComments.';

COMMENT ON TABLE public.legal_external_item_aliases IS
  'Administrator-confirmed mappings from external item codes to Ilios product and variant identities.';
