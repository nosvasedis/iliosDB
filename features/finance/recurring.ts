import { addDays, addMonths, parseIsoDate } from './financeMath';
import type { FinanceCategory, FinanceExpense, FinanceRecurring, FinanceRecurringFrequency, FinanceBilling } from './types';

export const FREQUENCY_MONTHS: Record<FinanceRecurringFrequency, number> = {
  monthly: 1,
  bimonthly: 2,
  quarterly: 3,
  yearly: 12,
};

export const FREQUENCY_LABELS: Record<FinanceRecurringFrequency, string> = {
  monthly: 'Κάθε μήνα',
  bimonthly: 'Κάθε 2 μήνες',
  quarterly: 'Κάθε τρίμηνο',
  yearly: 'Κάθε χρόνο',
};

/** Occurrence dates of a template between two dates (inclusive), anchored at next_due. */
export function occurrences(template: FinanceRecurring, from: string, to: string): string[] {
  if (!template.is_active) return [];
  const step = FREQUENCY_MONTHS[template.frequency];
  const day = template.day_of_period || parseIsoDate(template.next_due).getDate();
  const result: string[] = [];
  for (let index = 0, date = template.next_due; date <= to && index < 600; index += 1) {
    if (date >= from) result.push(date);
    date = addMonths(template.next_due, step * (index + 1), day);
  }
  return result;
}

export const recurringSourceId = (template: FinanceRecurring, date: string): string => `${template.id}:${date}`;

/**
 * Expected bills that should exist by now (up to `leadDays` ahead).
 * Creation is idempotent: the source id is unique per template and date.
 */
export function pendingRecurringExpenses(
  templates: readonly FinanceRecurring[],
  existing: readonly FinanceExpense[],
  today: string,
  leadDays = 10,
  categories: readonly FinanceCategory[] = [],
): Array<Partial<FinanceExpense>> {
  const existingSources = new Set(existing.filter((expense) => expense.source_kind === 'recurring').map((expense) => expense.source_id));
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
  const horizon = addDays(today, leadDays);
  const lookBack = addDays(today, -62);
  return templates.flatMap((template) =>
    occurrences(template, lookBack, horizon)
      .filter((date) => !existingSources.has(recurringSourceId(template, date)))
      .map((date) => ({
        category_id: template.category_id,
        party_id: template.party_id || null,
        expense_date: date,
        due_date: date,
        description: template.description || categoryNames.get(template.category_id) || 'Επαναλαμβανόμενο έξοδο',
        amount_net: template.estimated_amount,
        amount_gross: template.estimated_amount,
        vat_rate: 0,
        vat_amount: 0,
        billing: template.billing as FinanceBilling,
        status: 'expected' as const,
        source_kind: 'recurring' as const,
        source_id: recurringSourceId(template, date),
        recurring_id: template.id,
        lines: [],
      })),
  );
}

/** Upcoming occurrences that have not been materialised yet, for the forecast. */
export function futureRecurring(templates: readonly FinanceRecurring[], existing: readonly FinanceExpense[], from: string, to: string) {
  const existingSources = new Set(existing.filter((expense) => expense.source_kind === 'recurring').map((expense) => expense.source_id));
  return templates.flatMap((template) =>
    occurrences(template, from, to)
      .filter((date) => !existingSources.has(recurringSourceId(template, date)))
      .map((date) => ({ template, date, amount: template.estimated_amount })),
  );
}

/** Average of the last confirmed amounts, to keep the estimate realistic. */
export function suggestedEstimate(template: FinanceRecurring, expenses: readonly FinanceExpense[], take = 3): number | null {
  const confirmed = expenses
    .filter((expense) => expense.recurring_id === template.id && expense.status !== 'expected')
    .sort((a, b) => b.expense_date.localeCompare(a.expense_date))
    .slice(0, take);
  if (confirmed.length === 0) return null;
  return Math.round((confirmed.reduce((sum, expense) => sum + expense.amount_gross, 0) / confirmed.length) * 100) / 100;
}
