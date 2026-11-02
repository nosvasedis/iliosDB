import type { Supplier } from '../../types';
import { expenseDueDate, isBookedExpense } from './expenseLedger';
import { addDays, roundMoney } from './financeMath';
import type { OrderIncome } from './incomeLedger';
import { futureRecurring } from './recurring';
import type { FinanceExpense, FinanceRecurring } from './types';

export interface ForecastPoint {
  date: string;
  inflow: number;
  outflow: number;
  net: number;
  cumulative: number;
}

export interface ForecastEvent {
  date: string;
  kind: 'collection' | 'bill' | 'recurring';
  label: string;
  amount: number;
  overdue: boolean;
}

export interface CashflowForecast {
  points: ForecastPoint[];
  events: ForecastEvent[];
  totalIn: number;
  totalOut: number;
  lowestPoint: ForecastPoint | null;
}

/**
 * Projection of the next `days` days. Overdue items land on day 0, because they are
 * collectable / payable now. Starting cash is unknown, so the curve shows the change.
 */
export function buildCashflowForecast(params: {
  orderIncome: readonly OrderIncome[];
  expenses: readonly FinanceExpense[];
  recurring: readonly FinanceRecurring[];
  parties: readonly Supplier[];
  today: string;
  days?: number;
  startingCash?: number;
}): CashflowForecast {
  const days = params.days ?? 90;
  const end = addDays(params.today, days);
  const partyById = new Map(params.parties.map((party) => [party.id, party]));
  const events: ForecastEvent[] = [];
  const clamp = (date: string) => (date < params.today ? params.today : date);

  params.orderIncome.forEach((income) => {
    const open = Math.max(0, income.outstanding.T) + Math.max(0, income.outstanding.X);
    if (open < 0.01 || !income.dueDate || income.dueDate > end) return;
    events.push({ date: clamp(income.dueDate), kind: 'collection', label: income.customerName, amount: roundMoney(open), overdue: income.dueDate < params.today });
  });

  params.expenses.forEach((expense) => {
    const open = expense.amount_gross - expense.paid_amount;
    if (open < 0.01) return;
    const due = expenseDueDate(expense, expense.party_id ? partyById.get(expense.party_id) : undefined);
    if (due > end) return;
    events.push({
      date: clamp(due),
      kind: isBookedExpense(expense) ? 'bill' : 'recurring',
      label: expense.description || partyById.get(expense.party_id || '')?.name || 'Έξοδο',
      amount: roundMoney(open),
      overdue: due < params.today,
    });
  });

  futureRecurring(params.recurring, params.expenses, params.today, end).forEach(({ template, date, amount }) => {
    events.push({ date, kind: 'recurring', label: template.description || partyById.get(template.party_id || '')?.name || 'Επαναλαμβανόμενο', amount, overdue: false });
  });

  const byDate = new Map<string, { inflow: number; outflow: number }>();
  events.forEach((event) => {
    const bucket = byDate.get(event.date) || { inflow: 0, outflow: 0 };
    if (event.kind === 'collection') bucket.inflow += event.amount;
    else bucket.outflow += event.amount;
    byDate.set(event.date, bucket);
  });

  const points: ForecastPoint[] = [];
  let cumulative = params.startingCash ?? 0;
  for (let offset = 0; offset <= days; offset += 1) {
    const date = addDays(params.today, offset);
    const bucket = byDate.get(date) || { inflow: 0, outflow: 0 };
    const net = bucket.inflow - bucket.outflow;
    cumulative += net;
    points.push({ date, inflow: roundMoney(bucket.inflow), outflow: roundMoney(bucket.outflow), net: roundMoney(net), cumulative: roundMoney(cumulative) });
  }

  const lowestPoint = points.reduce<ForecastPoint | null>((lowest, point) => (!lowest || point.cumulative < lowest.cumulative ? point : lowest), null);
  return {
    points,
    events: events.sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount),
    totalIn: roundMoney(events.filter((event) => event.kind === 'collection').reduce((sum, event) => sum + event.amount, 0)),
    totalOut: roundMoney(events.filter((event) => event.kind !== 'collection').reduce((sum, event) => sum + event.amount, 0)),
    lowestPoint,
  };
}
