-- Confirmed relationship between a commercial myDATA document and the
-- delivery note that contains its physical product breakdown. The source
-- AADE rows/XML remain immutable; this column stores ERP-only context.

ALTER TABLE public.legal_documents
  ADD COLUMN IF NOT EXISTS related_delivery_document_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'legal_documents_related_delivery_document_id_fkey'
      AND conrelid = 'public.legal_documents'::regclass
  ) THEN
    ALTER TABLE public.legal_documents
      ADD CONSTRAINT legal_documents_related_delivery_document_id_fkey
      FOREIGN KEY (related_delivery_document_id)
      REFERENCES public.legal_documents(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_legal_documents_related_delivery_document_id
  ON public.legal_documents(related_delivery_document_id)
  WHERE related_delivery_document_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.validate_legal_delivery_document_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_target_kind text;
BEGIN
  IF NEW.related_delivery_document_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.related_delivery_document_id = NEW.id THEN
    RAISE EXCEPTION 'Ένα παραστατικό δεν μπορεί να συνδεθεί με τον εαυτό του.';
  END IF;

  IF NEW.document_kind NOT IN ('invoice', 'credit') THEN
    RAISE EXCEPTION 'Μόνο τιμολόγιο ή πιστωτικό μπορεί να συνδεθεί με Δελτίο Αποστολής.';
  END IF;

  SELECT document_kind
  INTO v_target_kind
  FROM public.legal_documents
  WHERE id = NEW.related_delivery_document_id;

  IF v_target_kind IS DISTINCT FROM 'delivery_note' THEN
    RAISE EXCEPTION 'Το συνδεδεμένο παραστατικό πρέπει να είναι Δελτίο Αποστολής.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_legal_delivery_document_link
  ON public.legal_documents;

CREATE TRIGGER trg_validate_legal_delivery_document_link
BEFORE INSERT OR UPDATE OF related_delivery_document_id, document_kind
ON public.legal_documents
FOR EACH ROW
EXECUTE FUNCTION public.validate_legal_delivery_document_link();

COMMENT ON COLUMN public.legal_documents.related_delivery_document_id IS
  'User-confirmed delivery note supplying product identities and quantities for an invoice whose official AADE rows remain unchanged.';

COMMENT ON FUNCTION public.validate_legal_delivery_document_link() IS
  'Prevents self-links and guarantees that ERP-only invoice product context points to a legal delivery-note document.';
