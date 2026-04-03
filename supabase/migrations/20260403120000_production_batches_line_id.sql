-- Optional line identity for order lines (esp. multiple SP / ειδική δημιουργία rows).
ALTER TABLE production_batches
  ADD COLUMN IF NOT EXISTS line_id text;

COMMENT ON COLUMN production_batches.line_id IS 'Matches orders.items[].line_id; distinguishes multiple SP lines.';
