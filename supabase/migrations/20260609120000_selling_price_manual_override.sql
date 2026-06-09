ALTER TABLE products ADD COLUMN IF NOT EXISTS selling_price_manual_override boolean NOT NULL DEFAULT false;
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS selling_price_manual_override boolean NOT NULL DEFAULT false;
