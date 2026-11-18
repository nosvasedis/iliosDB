-- A carrier (μεταφορέας / courier) on delivery notes can be the same entity as a
-- contact in «Προμηθευτές & Συνεργάτες» (e.g. ACS: we receive its invoices too).
-- Linking keeps one identity (name, ΑΦΜ, logo, contact) and lets the supplier
-- view show which contacts act as carriers. The carrier row stays the snapshot
-- source for documents, so deleting the contact only unlinks it.

alter table public.legal_carriers
  add column if not exists supplier_id uuid references public.suppliers(id) on delete set null;

create index if not exists legal_carriers_supplier_id_idx on public.legal_carriers(supplier_id);
