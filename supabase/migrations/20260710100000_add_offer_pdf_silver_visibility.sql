ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS hide_silver_price_in_pdf boolean NOT NULL DEFAULT false;
