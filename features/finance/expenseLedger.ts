import type { Supplier } from '../../types';
import { categoryPath, inheritedCategoryValue, rollUpTotals } from './categoryTree';
import { addDays, dateOnly, inPeriod, monthKeys, roundMoney } from './financeMath';
import type {
  FinanceBilling,
  FinanceCategory,
  FinanceExpense,
  FinanceExpensePayment,
  FinancePeriod,
} from './types';

/** Expected (not yet confirmed) recurring bills are forecasts, not expenses. */
export const isBookedExpense = (expense: FinanceExpense): boolean => expense.status !== 'expected';

export interface ExpensePeriodSummary {
  total: number;
  byBilling: Record<FinanceBilling, number>;
  fixed: number;
  variable: number;
  vat: number;
  count: number;
  /** Rolled-up gross per category id (every ancestor includes its descendants). */
  byCategory: Map<string, number>;
  /** Gross per month key (yyyy-mm) split Τ/Χ. */
  byMonth: Array<{ month: string; T: number; X: number; total: number }>;
}

export function summarizeExpenses(
  expenses: readonly FinanceExpense[],
  categories: readonly FinanceCategory[],
  period: FinancePeriod,
  billingFilter: FinanceBilling | 'all' = 'all',
): ExpensePeriodSummary {
  const leafTotals = new Map<string, number>();
  const byBilling: Record<FinanceBilling, number> = { T: 0, X: 0 };
  const months = new Map(monthKeys(period).map((month) => [month, { month, T: 0, X: 0, total: 0 }]));
  let fixed = 0;
  let variable = 0;
  let vat = 0;
  let count = 0;

  expenses.forEach((expense) => {
    if (!isBookedExpense(expense) || !inPeriod(expense.expense_date, period)) return;
    if (billingFilter !== 'all' && expense.billing !== billingFilter) return;
    const gross = expense.amount_gross;
    count += 1;
    vat += expense.vat_amount;
    byBilling[expense.billing] += gross;
    leafTotals.set(expense.category_id, (leafTotals.get(expense.category_id) || 0) + gross);
    if (inheritedCategoryValue(expense.category_id, categories, 'nature') === 'fixed') fixed += gross;
    else variable += gross;
    const bucket = months.get(dateOnly(expense.expense_date).slice(0, 7));
    if (bucket) {
      bucket[expense.billing] += gross;
      bucket.total += gross;
    }
  });

  return {
    total: roundMoney(byBilling.T + byBilling.X),
    byBilling: { T: roundMoney(byBilling.T), X: roundMoney(byBilling.X) },
    fixed: roundMoney(fixed),
    variable: roundMoney(variable),
    vat: roundMoney(vat),
    count,
    byCategory: rollUpTotals(leafTotals, categories),
    byMonth: [...months.values()].map((bucket) => ({
      ...bucket, T: roundMoney(bucket.T), X: roundMoney(bucket.X), total: roundMoney(bucket.total),
    })),
  };
}

export interface OpenExpense {
  expense: FinanceExpense;
  open: number;
  dueDate: string;
}

export interface PartyBalance {
  partyId: string;
  party?: Supplier;
  billed: number;
  paid: number;
  balance: number;
  /** Positive payments made on account that are not yet matched to any bill. */
  credit: number;
  open: OpenExpense[];
  overdue: number;
  lastActivity?: string;
}

/** When a bill is due: its own due date, else the party's payment terms, else the bill date. */
export function expenseDueDate(expense: FinanceExpense, party?: Supplier): string {
  if (expense.due_date) return dateOnly(expense.due_date);
  const terms = party?.payment_terms_days ?? 0;
  return addDays(dateOnly(expense.expense_date), Math.max(0, terms));
}

/**
 * Payables per party. Payments linked to a bill already reduce it (paid_amount);
 * payments on account are applied to the oldest open bills first.
 */
export function buildPartyBalances(
  expenses: readonly FinanceExpense[],
  payments: readonly FinanceExpensePayment[],
  parties: readonly Supplier[],
  today: string,
): PartyBalance[] {
  const partyById = new Map(parties.map((party) => [party.id, party]));
  const groups = new Map<string, { expenses: FinanceExpense[]; payments: FinanceExpensePayment[] }>();
  const group = (id: string) => {
    if (!groups.has(id)) groups.set(id, { expenses: [], payments: [] });
    return groups.get(id)!;
  };
  expenses.forEach((expense) => {
    if (expense.party_id && isBookedExpense(expense)) group(expense.party_id).expenses.push(expense);
  });
  const expenseParty = new Map(expenses.map((expense) => [expense.id, expense.party_id]));
  payments.forEach((payment) => {
    const partyId = payment.party_id || (payment.expense_id ? expenseParty.get(payment.expense_id) : null);
    if (partyId) group(partyId).payments.push(payment);
  });

  return [...groups.entries()].map(([partyId, { expenses: partyExpenses, payments: partyPayments }]) => {
    const party = partyById.get(partyId);
    const billed = partyExpenses.reduce((sum, expense) => sum + expense.amount_gross, 0);
    const paid = partyPayments.reduce((sum, payment) => sum + payment.amount, 0);
    let pool = partyPayments.filter((payment) => !payment.expense_id).reduce((sum, payment) => sum + payment.amount, 0);
    const open: OpenExpense[] = [];
    [...partyExpenses]
      .sort((a, b) => expenseDueDate(a, party).localeCompare(expenseDueDate(b, party)))
      .forEach((expense) => {
        let remaining = roundMoney(expense.amount_gross - expense.paid_amount);
        if (remaining > 0 && pool > 0) {
          const applied = Math.min(pool, remaining);
          pool -= applied;
          remaining = roundMoney(remaining - applied);
        }
        if (remaining > 0.004) open.push({ expense, open: remaining, dueDate: expenseDueDate(expense, party) });
      });
    const activity = [
      ...partyExpenses.map((expense) => dateOnly(expense.expense_date)),
      ...partyPayments.map((payment) => dateOnly(payment.paid_at)),
    ].sort();
    return {
      partyId,
      party,
      billed: roundMoney(billed),
      paid: roundMoney(paid),
      balance: roundMoney(billed - paid),
      credit: roundMoney(pool),
      open,
      overdue: roundMoney(open.filter((item) => item.dueDate < today).reduce((sum, item) => sum + item.open, 0)),
      lastActivity: activity[activity.length - 1],
    };
  }).sort((a, b) => b.balance - a.balance);
}

export interface PartyStatementRow {
  date: string;
  kind: 'expense' | 'payment';
  label: string;
  debit: number;
  credit: number;
  balance: number;
  billing: FinanceBilling;
  refId: string;
}

/** Καρτέλα συνεργάτη: chronological bills and payments with running balance. */
export function buildPartyStatement(
  partyId: string,
  expenses: readonly FinanceExpense[],
  payments: readonly FinanceExpensePayment[],
  categories: readonly FinanceCategory[],
): PartyStatementRow[] {
  const partyExpenseIds = new Set(expenses.filter((expense) => expense.party_id === partyId).map((expense) => expense.id));
  const rows: Omit<PartyStatementRow, 'balance'>[] = [
    ...expenses.filter((expense) => expense.party_id === partyId && isBookedExpense(expense)).map((expense) => ({
      date: dateOnly(expense.expense_date),
      kind: 'expense' as const,
      label: expense.description || categoryPath(expense.category_id, categories).map((category) => category.name).join(' › '),
      debit: expense.amount_gross,
      credit: 0,
      billing: expense.billing,
      refId: expense.id,
    })),
    ...payments.filter((payment) => payment.party_id === partyId || (payment.expense_id && partyExpenseIds.has(payment.expense_id))).map((payment) => ({
      date: dateOnly(payment.paid_at),
      kind: 'payment' as const,
      label: payment.notes || 'Πληρωμή',
      debit: 0,
      credit: payment.amount,
      billing: payment.billing,
      refId: payment.id,
    })),
  ].sort((a, b) => a.date.localeCompare(b.date) || (a.kind === 'expense' ? -1 : 1));
  let running = 0;
  return rows.map((row) => {
    running = roundMoney(running + row.debit - row.credit);
    return { ...row, balance: running };
  });
}

export interface BudgetUsage {
  category: FinanceCategory;
  budget: number;
  spent: number;
  ratio: number;
}

/** Monthly budgets scaled to the number of months in the period. */
export function budgetUsage(summary: ExpensePeriodSummary, categories: readonly FinanceCategory[], period: FinancePeriod): BudgetUsage[] {
  const months = Math.max(1, monthKeys(period).length);
  return categories
    .filter((category) => !category.is_archived && (category.monthly_budget || 0) > 0)
    .map((category) => {
      const budget = (category.monthly_budget || 0) * months;
      const spent = summary.byCategory.get(category.id) || 0;
      return { category, budget: roundMoney(budget), spent: roundMoney(spent), ratio: budget > 0 ? spent / budget : 0 };
    })
    .sort((a, b) => b.ratio - a.ratio);
}

/** Categories used most recently first, for one-tap quick entry. */
export function recentCategoryIds(expenses: readonly FinanceExpense[], limit = 8): string[] {
  const seen: string[] = [];
  [...expenses]
    .sort((a, b) => (b.created_at || b.expense_date).localeCompare(a.created_at || a.expense_date))
    .forEach((expense) => {
      if (!seen.includes(expense.category_id) && seen.length < limit) seen.push(expense.category_id);
    });
  return seen;
}

/** Net/ΦΠΑ/gross from either side of the calculation. */
export function computeAmounts(input: { net?: number; gross?: number; vatRate: number }): { net: number; vat: number; gross: number } {
  const rate = Math.max(0, input.vatRate);
  if (input.gross !== undefined) {
    const net = roundMoney(input.gross / (1 + rate));
    return { net, vat: roundMoney(input.gross - net), gross: roundMoney(input.gross) };
  }
  const net = roundMoney(input.net || 0);
  const vat = roundMoney(net * rate);
  return { net, vat, gross: roundMoney(net + vat) };
}
