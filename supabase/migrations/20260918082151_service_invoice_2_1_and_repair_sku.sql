-- Issueable myDATA 2.1 (Τιμολόγιο Παροχής Υπηρεσιών) numbering and reserved legal SKU 001.

SET lock_timeout = '5s';
SET statement_timeout = '60s';

DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'legal_numbering_sequences'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%aade_document_type%'
      AND pg_get_constraintdef(con.oid) ILIKE '%1.1%'
      AND pg_get_constraintdef(con.oid) NOT ILIKE '%2.1%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.legal_numbering_sequences DROP CONSTRAINT IF EXISTS %I',
      constraint_name
    );
  END LOOP;
END $$;

ALTER TABLE public.legal_numbering_sequences
  DROP CONSTRAINT IF EXISTS legal_numbering_sequences_aade_document_type_check;

ALTER TABLE public.legal_numbering_sequences
  ADD CONSTRAINT legal_numbering_sequences_aade_document_type_check
  CHECK (aade_document_type IN ('1.1', '2.1', '9.3', '5.1', '5.2'));

INSERT INTO public.legal_numbering_sequences (
  document_kind,
  aade_document_type,
  series,
  next_aa,
  is_active,
  environment
)
SELECT 'invoice', '2.1', 'ΤΠΥ', 1, true, env
FROM unnest(ARRAY['dev', 'prod']::text[]) AS env
WHERE NOT EXISTS (
  SELECT 1
  FROM public.legal_numbering_sequences
  WHERE aade_document_type = '2.1'
    AND public.legal_numbering_sequences.environment = env
);

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_sku_000_reserved_for_legal_documents_check;

UPDATE public.products
SET
  legal_only = true,
  prefix = '001'
WHERE UPPER(BTRIM(sku)) = '001';

ALTER TABLE public.products
  ADD CONSTRAINT products_sku_000_reserved_for_legal_documents_check
  CHECK (
    (
      legal_only
      AND UPPER(BTRIM(COALESCE(sku, ''))) IN ('000', '001')
      AND UPPER(BTRIM(COALESCE(prefix, ''))) = UPPER(BTRIM(COALESCE(sku, '')))
    )
    OR
    (
      NOT legal_only
      AND UPPER(BTRIM(COALESCE(sku, ''))) NOT IN ('000', '001')
      AND UPPER(BTRIM(COALESCE(prefix, ''))) NOT IN ('000', '001')
    )
  );

COMMENT ON CONSTRAINT products_sku_000_reserved_for_legal_documents_check
  ON public.products
  IS '000 and 001 are reserved as hidden legal-module markers; the legal catalog uses in-memory virtual items instead of registry products.';

INSERT INTO public.products (
  sku,
  prefix,
  category,
  description,
  gender,
  image_url,
  weight_g,
  plating_type,
  production_type,
  active_price,
  draft_price,
  selling_price,
  stock_qty,
  sample_qty,
  is_component,
  legal_only
)
VALUES (
  '001',
  '001',
  'Επισκευή',
  'Επισκευή Κοσμημάτων',
  'Unisex',
  NULL,
  0,
  'None',
  'Imported',
  0,
  0,
  0,
  0,
  0,
  false,
  true
)
ON CONFLICT (sku) DO UPDATE
SET
  legal_only = true,
  prefix = '001',
  category = COALESCE(NULLIF(BTRIM(public.products.category), ''), EXCLUDED.category),
  description = COALESCE(NULLIF(BTRIM(public.products.description), ''), EXCLUDED.description);
