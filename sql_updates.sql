
-- Run this in your Supabase SQL Editor to support batch notes
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS notes TEXT;

-- NEW: Add VAT Rate support
ALTER TABLE orders ADD COLUMN IF NOT EXISTS vat_rate numeric DEFAULT 0.24;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS vat_rate numeric DEFAULT 0.24;

-- NEW: Add Discount support to Orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_percent numeric DEFAULT 0;

-- NEW: Production Hold Status
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS on_hold BOOLEAN DEFAULT FALSE;
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS on_hold_reason TEXT;

-- NEW: Stones per Strand (Unisex/Strand Stone Type)
ALTER TABLE materials ADD COLUMN IF NOT EXISTS stones_per_strand numeric DEFAULT NULL;

-- NEW: Description field for Materials (e.g. Stone details)
ALTER TABLE materials ADD COLUMN IF NOT EXISTS description TEXT;
