-- Approved catalogue meanings: KD0155/KD0255 are chains; KOU8 is a clasp.
-- Idempotent data correction only. Legal-only 000/001, STX identities and all prices stay untouched.
begin;
do $accessory_categories$
declare
  before_rows jsonb;
  after_rows jsonb;
begin
  perform 1 from public.products where sku in ('KD0155', 'KD0255', 'KOU8') for update;
  if (select count(*) from public.products where sku in ('KD0155', 'KD0255', 'KOU8')) <> 3 then
    raise exception 'Expected exactly the three approved accessory SKUs';
  end if;
  if exists (
    select 1 from public.products p
    join (values ('KD0155', 'Καδένα'), ('KD0255', 'Καδένα'), ('KOU8', 'Κούμπωμα')) target(sku, category) on target.sku = p.sku
    where p.category not in ('Έξτρα', target.category) or p.category is null
      or coalesce(p.legal_only, false) or coalesce(p.is_component, false)
  ) then raise exception 'Accessory classification changed; review the three target records before applying'; end if;
  select jsonb_agg(to_jsonb(p) - 'category' - 'description' order by p.sku) into before_rows
  from public.products p where sku in ('KD0155', 'KD0255', 'KOU8');

  update public.products p set category = target.category,
    description = case when nullif(btrim(p.description), '') is null then target.category else p.description end
  from (values ('KD0155', 'Καδένα'), ('KD0255', 'Καδένα'), ('KOU8', 'Κούμπωμα')) target(sku, category)
  where p.sku = target.sku;

  select jsonb_agg(to_jsonb(p) - 'category' - 'description' order by p.sku) into after_rows
  from public.products p where sku in ('KD0155', 'KD0255', 'KOU8');
  if before_rows is distinct from after_rows then raise exception 'Non-classification accessory fields changed'; end if;
end;
$accessory_categories$;
commit;
