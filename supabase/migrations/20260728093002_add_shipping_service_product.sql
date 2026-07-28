-- Prisma exports use item code 000 consistently for shipping charges.
-- Keep it as a real, non-stock catalog service so archived invoice lines
-- resolve through the same exact-code path as every other product.
INSERT INTO public.products (
  sku,
  prefix,
  category,
  description,
  gender,
  image_url,
  weight_g,
  plating_type,
  production_type,
  active_price,
  draft_price,
  selling_price,
  stock_qty,
  sample_qty,
  is_component
)
VALUES (
  '000',
  '000',
  'Υπηρεσίες',
  'Μεταφορικά',
  'Unisex',
  NULL,
  0,
  'None',
  'Imported',
  0,
  0,
  0,
  0,
  0,
  false
)
ON CONFLICT (sku) DO UPDATE
SET
  description = COALESCE(NULLIF(BTRIM(public.products.description), ''), EXCLUDED.description),
  category = COALESCE(NULLIF(BTRIM(public.products.category), ''), EXCLUDED.category);
