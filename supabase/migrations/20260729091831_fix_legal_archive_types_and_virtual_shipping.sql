-- myDATA v2.0.1 archive imports may contain every official InvoiceType,
-- even though this ERP intentionally issues only 1.1, 9.3, 5.1 and 5.2.
-- Code 000 is reserved for the legal module's virtual shipping charge and
-- must not exist as a catalog/inventory product.

SET lock_timeout = '5s';
SET statement_timeout = '60s';

ALTER TABLE public.legal_documents
  DROP CONSTRAINT IF EXISTS legal_documents_aade_document_type_check;

ALTER TABLE public.legal_documents
  ADD CONSTRAINT legal_documents_aade_document_type_check
  CHECK (
    aade_document_type = ANY (
      ARRAY[
        '1.1', '1.2', '1.3', '1.4', '1.5', '1.6',
        '2.1', '2.2', '2.3', '2.4',
        '3.1', '3.2',
        '4',
        '5.1', '5.2',
        '6.1', '6.2',
        '7.1',
        '8.1', '8.2', '8.4', '8.5', '8.6',
        '9.1', '9.2', '9.3',
        '10.1', '10.2',
        '11.1', '11.2', '11.3', '11.4', '11.5',
        '12',
        '13.1', '13.2', '13.3', '13.4', '13.30', '13.31',
        '14.1', '14.2', '14.3', '14.4', '14.5', '14.30', '14.31',
        '15.1',
        '16.1',
        '17.1', '17.2', '17.3', '17.4', '17.5', '17.6'
      ]::text[]
    )
  );

COMMENT ON CONSTRAINT legal_documents_aade_document_type_check
  ON public.legal_documents
  IS 'Official myDATA InvoiceType enumeration from XSD v2.0.1; issuance remains restricted separately by legal_numbering_sequences.';

-- Keep the previously seeded row as a non-destructive compatibility marker,
-- but make its legal-only status explicit. Application catalog queries exclude
-- legal_only rows, and the legal module constructs its own in-memory item.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS legal_only boolean NOT NULL DEFAULT false;

UPDATE public.products
SET legal_only = true
WHERE UPPER(BTRIM(sku)) = '000';

COMMENT ON COLUMN public.products.legal_only
  IS 'Reserved compatibility marker for legal-document-only codes. Excluded from all product registry and inventory catalog queries.';

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_sku_000_reserved_for_legal_documents_check;

ALTER TABLE public.products
  ADD CONSTRAINT products_sku_000_reserved_for_legal_documents_check
  CHECK (
    (
      legal_only
      AND UPPER(BTRIM(COALESCE(sku, ''))) = '000'
      AND UPPER(BTRIM(COALESCE(prefix, ''))) = '000'
    )
    OR
    (
      NOT legal_only
      AND UPPER(BTRIM(COALESCE(sku, ''))) <> '000'
      AND UPPER(BTRIM(COALESCE(prefix, ''))) <> '000'
    )
  );

COMMENT ON CONSTRAINT products_sku_000_reserved_for_legal_documents_check
  ON public.products
  IS '000 is reserved as a hidden compatibility marker; the legal module uses an in-memory virtual shipping charge instead of a catalog product.';
