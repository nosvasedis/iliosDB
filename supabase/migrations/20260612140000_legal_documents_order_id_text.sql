-- Orders use text IDs (e.g. ORD-260612-543), not UUIDs.
-- legal_documents and proforma_documents were created with order_id uuid by mistake.

ALTER TABLE public.legal_documents
  ALTER COLUMN order_id TYPE text USING order_id::text;

ALTER TABLE public.proforma_documents
  ALTER COLUMN order_id TYPE text USING order_id::text;
