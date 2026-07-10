ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS hide_offer_validity_in_pdf boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS offer_validity_days integer NOT NULL DEFAULT 30;
