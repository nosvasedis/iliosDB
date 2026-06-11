CREATE INDEX IF NOT EXISTS idx_legal_payments_document_id
  ON public.legal_payments(document_id);

CREATE INDEX IF NOT EXISTS idx_legal_audit_log_document_id
  ON public.legal_audit_log(document_id);
