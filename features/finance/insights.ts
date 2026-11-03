import { categoryPath } from './categoryTree';
import { formatEuro } from './financeMath';
import type { BudgetUsage, ExpensePeriodSummary, PartyBalance } from './expenseLedger';
import type { CustomerBalance } from './incomeLedger';
import type { SellerCommission } from './commissions';
import type { FinanceCategory, FinanceExpense, ProductionStageAssignment } from './types';

export type InsightTone = 'good' | 'warn' | 'bad' | 'info';
export type InsightTarget = 'income' | 'expenses' | 'partners' | 'overview';

export interface FinanceInsight {
  id: string;
  tone: InsightTone;
  title: string;
  detail: string;
  target: InsightTarget;
  weight: number;
}

const pct = (value: number) => `${value > 0 ? '+' : ''}${Math.round(value * 100)}%`;

/** Plain-Greek observations, most important first. */
export function buildInsights(params: {
  current: ExpensePeriodSummary;
  previous: ExpensePeriodSummary;
  categories: readonly FinanceCategory[];
  customerBalances: readonly CustomerBalance[];
  partyBalances: readonly PartyBalance[];
  budgets: readonly BudgetUsage[];
  commissions: readonly SellerCommission[];
  assignments: readonly ProductionStageAssignment[];
  expenses: readonly FinanceExpense[];
  receiptsTotal: number;
  previousReceiptsTotal: number;
  today: string;
}): FinanceInsight[] {
  const insights: FinanceInsight[] = [];

  const overdueCustomers = params.customerBalances.filter((balance) => balance.maxDaysOverdue > 60 && balance.total > 1);
  if (overdueCustomers.length > 0) {
    const amount = overdueCustomers.reduce((sum, balance) => sum + balance.aging.d90 + balance.aging.d90plus + balance.aging.d60, 0);
    insights.push({
      id: 'overdue-customers', tone: 'bad', target: 'income', weight: 100 + amount / 100,
      title: `${overdueCustomers.length} ${overdueCustomers.length === 1 ? 'πελάτης εκπρόθεσμος' : 'πελάτες εκπρόθεσμοι'} > 60 ημ.`,
      detail: `${formatEuro(amount)} σε καθυστέρηση. Μεγαλύτερο υπόλοιπο: ${overdueCustomers[0].customerName}.`,
    });
  }

  const overLimit = params.customerBalances.filter((balance) => balance.overCreditLimit);
  if (overLimit.length > 0) {
    insights.push({
      id: 'credit-limit', tone: 'warn', target: 'income', weight: 80,
      title: `${overLimit.length} ${overLimit.length === 1 ? 'πελάτης ξεπερνά' : 'πελάτες ξεπερνούν'} το πιστωτικό όριο`,
      detail: overLimit.slice(0, 3).map((balance) => balance.customerName).join(', '),
    });
  }

  const overduePayables = params.partyBalances.filter((balance) => balance.overdue > 1);
  if (overduePayables.length > 0) {
    const amount = overduePayables.reduce((sum, balance) => sum + balance.overdue, 0);
    insights.push({
      id: 'overdue-payables', tone: 'warn', target: 'partners', weight: 85,
      title: `${formatEuro(amount)} ληξιπρόθεσμα προς ${overduePayables.length} ${overduePayables.length === 1 ? 'συνεργάτη' : 'συνεργάτες'}`,
      detail: overduePayables.slice(0, 3).map((balance) => balance.party?.name || '—').join(', '),
    });
  }

  const unbilled = params.assignments.filter((assignment) => !assignment.statement_id);
  if (unbilled.length > 0) {
    insights.push({
      id: 'unbilled-work', tone: 'info', target: 'partners', weight: 60 + unbilled.length,
      title: `${unbilled.length} ${unbilled.length === 1 ? 'παρτίδα αχρέωτη' : 'παρτίδες αχρέωτες'} σε συνεργάτες`,
      detail: 'Έτοιμες για εκκαθάριση με βάση τους τιμοκαταλόγους τους.',
    });
  }

  const pendingRecurring = params.expenses.filter((expense) => expense.status === 'expected' && expense.expense_date <= params.today);
  if (pendingRecurring.length > 0) {
    insights.push({
      id: 'expected-bills', tone: 'info', target: 'expenses', weight: 70,
      title: `${pendingRecurring.length} ${pendingRecurring.length === 1 ? 'αναμενόμενος λογαριασμός' : 'αναμενόμενοι λογαριασμοί'} προς επιβεβαίωση`,
      detail: pendingRecurring.slice(0, 3).map((expense) => expense.description || '—').join(', '),
    });
  }

  params.budgets.filter((usage) => usage.ratio >= 0.9).slice(0, 2).forEach((usage) => {
    insights.push({
      id: `budget-${usage.category.id}`, tone: usage.ratio > 1 ? 'bad' : 'warn', target: 'expenses', weight: 75 * usage.ratio,
      title: `${usage.category.name}: ${Math.round(usage.ratio * 100)}% του προϋπολογισμού`,
      detail: `${formatEuro(usage.spent)} από ${formatEuro(usage.budget)}.`,
    });
  });

  // Biggest category movement vs the previous period (top-level Είδη and their children).
  const movers = params.categories
    .filter((category) => !category.is_archived && categoryPath(category.id, params.categories).length <= 2)
    .map((category) => {
      const now = params.current.byCategory.get(category.id) || 0;
      const before = params.previous.byCategory.get(category.id) || 0;
      return { category, now, before, change: before > 0 ? (now - before) / before : 0 };
    })
    .filter((mover) => mover.before >= 50 && Math.abs(mover.change) >= 0.15)
    .sort((a, b) => Math.abs(b.now - b.before) - Math.abs(a.now - a.before));
  movers.slice(0, 2).forEach((mover) => {
    insights.push({
      id: `mover-${mover.category.id}`, tone: mover.change > 0 ? 'warn' : 'good', target: 'expenses', weight: 50 + Math.abs(mover.change) * 10,
      title: `${mover.category.name} ${pct(mover.change)} έναντι προηγούμενης περιόδου`,
      detail: `${formatEuro(mover.now)} τώρα, ${formatEuro(mover.before)} πριν.`,
    });
  });

  const owed = params.commissions.filter((commission) => commission.owed > 1);
  if (owed.length > 0) {
    insights.push({
      id: 'commissions', tone: 'info', target: 'partners', weight: 55,
      title: `Προμήθειες πλασιέ προς εξόφληση: ${formatEuro(owed.reduce((sum, commission) => sum + commission.owed, 0))}`,
      detail: owed.slice(0, 3).map((commission) => `${commission.sellerName} ${formatEuro(commission.owed)}`).join(' · '),
    });
  }

  if (params.previousReceiptsTotal > 0) {
    const change = (params.receiptsTotal - params.previousReceiptsTotal) / params.previousReceiptsTotal;
    if (Math.abs(change) >= 0.1) {
      insights.push({
        id: 'receipts-trend', tone: change > 0 ? 'good' : 'warn', target: 'income', weight: 45,
        title: `Εισπράξεις ${pct(change)} έναντι προηγούμενης περιόδου`,
        detail: `${formatEuro(params.receiptsTotal)} τώρα, ${formatEuro(params.previousReceiptsTotal)} πριν.`,
      });
    }
  }

  if (params.current.total > 0) {
    const xShare = params.current.byBilling.X / params.current.total;
    if (xShare >= 0.4) {
      insights.push({
        id: 'x-share', tone: 'info', target: 'expenses', weight: 30,
        title: `${Math.round(xShare * 100)}% των εξόδων χωρίς παραστατικό`,
        detail: 'Τα έξοδα Χ δεν εκπίπτουν· ελέγξτε αν κάποια μπορούν να γίνουν με τιμολόγιο.',
      });
    }
  }

  return insights.sort((a, b) => b.weight - a.weight);
}
