-- Persist label dimensions (χονδρική + λιανική) in global_settings.
ALTER TABLE public.global_settings
  ADD COLUMN IF NOT EXISTS barcode_width_mm integer,
  ADD COLUMN IF NOT EXISTS barcode_height_mm integer,
  ADD COLUMN IF NOT EXISTS retail_barcode_width_mm integer,
  ADD COLUMN IF NOT EXISTS retail_barcode_height_mm integer;

UPDATE public.global_settings
SET
  barcode_width_mm = COALESCE(barcode_width_mm, 50),
  barcode_height_mm = COALESCE(barcode_height_mm, 30),
  retail_barcode_width_mm = COALESCE(retail_barcode_width_mm, 72),
  retail_barcode_height_mm = COALESCE(retail_barcode_height_mm, 10)
WHERE id = 1;
