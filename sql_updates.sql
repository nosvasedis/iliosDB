
-- Run this in your Supabase SQL Editor to support batch notes
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS notes TEXT;
