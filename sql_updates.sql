
-- Run this in your Supabase SQL Editor to support batch notes
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS notes TEXT;

-- NEW: Add VAT Rate support
ALTER TABLE orders ADD COLUMN IF NOT EXISTS vat_rate numeric DEFAULT 0.24;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS vat_rate numeric DEFAULT 0.24;

-- NEW: Production Hold Status
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS on_hold BOOLEAN DEFAULT FALSE;
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS on_hold_reason TEXT;

-- NEW: Stones per Strand (Unisex/Strand Stone Type)
ALTER TABLE materials ADD COLUMN IF NOT EXISTS stones_per_strand numeric DEFAULT NULL;

-- NEW: Description field for Materials (e.g. Stone details)
ALTER TABLE materials ADD COLUMN IF NOT EXISTS description TEXT;

-- NEW: Customer VAT Profile
ALTER TABLE customers ADD COLUMN IF NOT EXISTS vat_rate numeric DEFAULT 0.24;

-- NEW: Support for Production Tracking column
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS requires_setting BOOLEAN DEFAULT FALSE;

-- PERFORMANCE: Index for faster Partial Batch calculations
CREATE INDEX IF NOT EXISTS idx_production_batches_order_id ON production_batches(order_id);

-- NEW (FEATURE REQUEST): Order Tags and Archiving
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE;

-- SCHEMA FIX: Global Settings Persistence
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS id INTEGER;
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS retail_barcode_width_mm NUMERIC DEFAULT 72;
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS retail_barcode_height_mm NUMERIC DEFAULT 10;
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS last_calc_silver_price NUMERIC DEFAULT 0.82;

-- Ensure row 1 exists for UPSERT logic
INSERT INTO global_settings (id, silver_price_gram, loss_percentage, barcode_width_mm, barcode_height_mm, retail_barcode_width_mm, retail_barcode_height_mm, last_calc_silver_price)
SELECT 1, 0.82, 0, 50, 30, 72, 10, 0.82
WHERE NOT EXISTS (SELECT 1 FROM global_settings WHERE id = 1);
