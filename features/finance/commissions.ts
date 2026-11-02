import type { UserProfile } from '../../types';
import type { FinanceLineEvent } from '../../utils/financeAnalytics';
import { roundMoney } from './financeMath';
import type { FinanceExpense } from './types';

export const commissionSourcePrefix = (sellerId: string): string => `seller:${sellerId}:`;
export const newCommissionSourceId = (sellerId: string): string => `${commissionSourcePrefix(sellerId)}${crypto.randomUUID()}`;

export interface SellerCommission {
  sellerId: string;
  sellerName: string;
  /** Earned on delivered value (net, before ΦΠΑ). */
  earned: number;
  /** Will be earned once open orders ship. */
  pending: number;
  paid: number;
  owed: number;
  lastPaidAt?: string;
}

/** Commission owed per seller: earned on shipments minus payouts booked as expenses. */
export function buildSellerCommissions(params: {
  realized: readonly FinanceLineEvent[];
  backlog: readonly FinanceLineEvent[];
  sellers: readonly UserProfile[];
  expenses: readonly FinanceExpense[];
}): SellerCommission[] {
  const rows = new Map<string, SellerCommission>();
  const row = (id: string, name: string) => {
    if (!rows.has(id)) rows.set(id, { sellerId: id, sellerName: name, earned: 0, pending: 0, paid: 0, owed: 0 });
    return rows.get(id)!;
  };
  params.sellers.forEach((seller) => row(seller.id, seller.full_name || seller.email));
  params.realized.forEach((event) => {
    if (!event.sellerId || event.sellerCommissionPercent <= 0) return;
    row(event.sellerId, event.sellerName || '—').earned += event.net * (event.sellerCommissionPercent / 100);
  });
  params.backlog.forEach((event) => {
    if (!event.sellerId || event.sellerCommissionPercent <= 0) return;
    row(event.sellerId, event.sellerName || '—').pending += event.net * (event.sellerCommissionPercent / 100);
  });
  params.expenses.forEach((expense) => {
    if (expense.source_kind !== 'commission' || !expense.source_id?.startsWith('seller:')) return;
    const sellerId = expense.source_id.split(':')[1];
    const target = rows.get(sellerId);
    if (!target) return;
    target.paid += expense.amount_gross;
    if (!target.lastPaidAt || target.lastPaidAt < expense.expense_date) target.lastPaidAt = expense.expense_date;
  });
  return [...rows.values()]
    .map((entry) => ({
      ...entry,
      earned: roundMoney(entry.earned),
      pending: roundMoney(entry.pending),
      paid: roundMoney(entry.paid),
      owed: roundMoney(entry.earned - entry.paid),
    }))
    .filter((entry) => entry.earned > 0 || entry.pending > 0 || entry.paid > 0)
    .sort((a, b) => b.owed - a.owed);
}
