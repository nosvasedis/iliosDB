
-- Run this in your Supabase SQL Editor to enable Customer-specific VAT profiles
ALTER TABLE customers ADD COLUMN IF NOT EXISTS vat_rate numeric DEFAULT 0.24;
