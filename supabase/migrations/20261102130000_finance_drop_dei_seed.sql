-- Ρεύμα is the subsection itself; the seeded ΔΕΗ level under it is not needed.
-- Removed only while nothing references it, so user data is never touched.
delete from public.finance_categories as category
using public.finance_categories as parent
where category.parent_id = parent.id
  and parent.name = 'Ρεύμα'
  and category.name = 'ΔΕΗ'
  and not exists (select 1 from public.finance_categories as child where child.parent_id = category.id)
  and not exists (select 1 from public.finance_expenses as expense where expense.category_id = category.id)
  and not exists (select 1 from public.finance_recurring as template where template.category_id = category.id);
