-- READ ONLY. Run before the SBZ migration; investigate every returned conflict.
-- Existing document environment evidence; NULL must be reviewed manually.
WITH evidence AS (
 SELECT document_id, CASE WHEN count(DISTINCT environment)=1 THEN min(environment) END environment
 FROM public.legal_transmissions GROUP BY document_id
)
SELECT d.id,d.status,d.series,d.aa,d.aade_mark,e.environment
FROM public.legal_documents d LEFT JOIN evidence e ON e.document_id=d.id
WHERE d.aa IS NOT NULL AND (e.environment IS NULL OR d.status IN ('submitted','failed'));

-- SBZ/AADE identity is shared by document kinds with the same invoice type.
SELECT aade_document_type,public.normalize_legal_series(series),count(*)
FROM public.legal_numbering_sequences
GROUP BY aade_document_type,public.normalize_legal_series(series) HAVING count(*)>1;

WITH evidence AS (
 SELECT document_id, CASE WHEN count(DISTINCT environment)=1 THEN min(environment) END environment
 FROM public.legal_transmissions GROUP BY document_id
)
SELECT e.environment,d.issuer->>'vat_number' issuer_vat,d.issuer->>'branch' branch,d.aade_document_type,
 public.normalize_legal_series(d.series) series,d.aa::numeric aa,count(*)
FROM public.legal_documents d LEFT JOIN evidence e ON e.document_id=d.id
WHERE d.aa ~ '^[0-9]{1,18}$' AND e.environment IS NOT NULL
GROUP BY e.environment,d.issuer->>'vat_number',d.issuer->>'branch',d.aade_document_type,public.normalize_legal_series(d.series),d.aa::numeric
HAVING count(*)>1;
