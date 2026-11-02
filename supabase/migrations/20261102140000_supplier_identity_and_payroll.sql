-- Supplier identity for the finance hub: website and a logo shown on cards and ledgers.
alter table public.suppliers add column if not exists website text;
alter table public.suppliers add column if not exists logo_url text;

-- Μισθοδοσία as its own Είδος (fixed costs), with editable starting sections.
do $$
declare
  v_root uuid;
  v_position integer;
begin
  if exists (select 1 from public.finance_categories where parent_id is null and name = 'Μισθοδοσία') then
    return;
  end if;
  select coalesce(max(position) + 1, 0) into v_position from public.finance_categories where parent_id is null;
  insert into public.finance_categories (name, icon, color, nature, position)
  values ('Μισθοδοσία', 'handcoins', '#3b82f6', 'fixed', v_position)
  returning id into v_root;
  insert into public.finance_categories (parent_id, name, icon, nature, position) values
    (v_root, 'Μισθοί', 'banknote', 'fixed', 0),
    (v_root, 'Εισφορές ΕΦΚΑ', 'landmark', 'fixed', 1),
    (v_root, 'Δώρα & επιδόματα', 'gift', 'fixed', 2);
end $$;
