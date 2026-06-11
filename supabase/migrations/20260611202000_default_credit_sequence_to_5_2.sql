UPDATE public.legal_numbering_sequences
SET aade_document_type = '5.2',
    updated_at = now()
WHERE document_kind = 'credit'
  AND series = 'ΠΙΣ'
  AND aade_document_type = '5.1';
