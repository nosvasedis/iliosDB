import type {
  Consignment,
  ConsignmentLine,
  ConsignmentReturn,
  ConsignmentSettlement,
  RepairCharge,
  RepairItem,
} from '../../types';
import { consignmentSaleTotal } from './consignmentPricing';

// ──────────────────────────────────────────────
//  Παρακαταθήκες
// ──────────────────────────────────────────────

export type ConsignmentColumnKey = 'handoff' | 'at_customer' | 'to_collect' | 'closed';

export const CONSIGNMENT_COLUMNS: Array<{ key: ConsignmentColumnKey; label: string; hint: string }> = [
  { key: 'handoff', label: 'Προς παράδοση', hint: 'Δεν έχουν φύγει ακόμη από την αποθήκη' },
  { key: 'at_customer', label: 'Στον πελάτη', hint: 'Τεμάχια σε έκθεση στο κατάστημα του πελάτη' },
  { key: 'to_collect', label: 'Προς είσπραξη', hint: 'Πουλήθηκαν και εκκρεμεί πληρωμή ή δρομολόγηση επιστροφής' },
  { key: 'closed', label: 'Ολοκληρωμένες', hint: 'Κλεισμένες ή ακυρωμένες' },
];

export interface ConsignmentSummary {
  pending: number;
  value: number;
  cost: number;
  due: number;
  openReturns: number;
  overdue: boolean;
  dueSoon: boolean;
}

function todayIso(now: Date): string {
  const local = new Date(now);
  local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
  return local.toISOString().slice(0, 10);
}

export function summarizeConsignment(
  entry: Pick<Consignment, 'status' | 'review_due_at'>,
  lines: ConsignmentLine[],
  settlements: ConsignmentSettlement[],
  returns: ConsignmentReturn[],
  now: Date = new Date(),
): ConsignmentSummary {
  const pending = lines.reduce((sum, line) => sum + Number(line.pending_quantity || 0), 0);
  const live = settlements.filter((item) => item.status !== 'reversed');
  const today = todayIso(now);
  const soon = new Date(now);
  soon.setDate(soon.getDate() + 7);
  const review = (entry.review_due_at || '').slice(0, 10);
  const open = ['active', 'partially_settled'].includes(entry.status);
  return {
    pending,
    value: lines.reduce((sum, line) => sum + consignmentSaleTotal(line, Number(line.pending_quantity || 0), settlements), 0),
    cost: lines.reduce((sum, line) => sum + Number(line.pending_quantity || 0) * Number(line.locked_unit_cost || 0), 0),
    due: live.reduce((sum, item) => sum + Math.max(0, Number(item.total_amount || 0) - Number(item.paid_amount || 0)), 0),
    openReturns: returns.filter((item) => item.status === 'inspection').length,
    overdue: open && pending > 0 && !!review && review < today,
    dueSoon: open && pending > 0 && !!review && review >= today && review <= todayIso(soon),
  };
}

export function consignmentColumn(
  entry: Pick<Consignment, 'status'>,
  summary: Pick<ConsignmentSummary, 'pending' | 'due' | 'openReturns'>,
): ConsignmentColumnKey {
  if (entry.status === 'draft' || entry.status === 'pending_handoff') return 'handoff';
  if (entry.status === 'completed' || entry.status === 'cancelled') {
    return summary.due > 0 || summary.openReturns > 0 ? 'to_collect' : 'closed';
  }
  if (summary.pending > 0) return 'at_customer';
  return summary.due > 0 || summary.openReturns > 0 ? 'to_collect' : 'closed';
}

export type ConsignmentNextAction = 'handoff' | 'settle' | 'collect' | 'route-return' | null;

export function nextConsignmentAction(
  entry: Pick<Consignment, 'status'>,
  summary: Pick<ConsignmentSummary, 'pending' | 'due' | 'openReturns'>,
): ConsignmentNextAction {
  if (entry.status === 'pending_handoff' || entry.status === 'draft') return 'handoff';
  if (entry.status === 'cancelled') return null;
  if (summary.openReturns > 0) return 'route-return';
  if (summary.pending > 0 && ['active', 'partially_settled'].includes(entry.status)) return 'settle';
  if (summary.due > 0) return 'collect';
  return null;
}

export interface SettlementInputRow {
  lineId: string;
  pending: number;
  sold: number;
  returned: number;
  unitPrice: number;
}

export type SettlementStep =
  | { kind: 'sale'; lineId: string; quantity: number; unitPrice: number }
  | { kind: 'return'; lineId: string; quantity: number };

/** Μετατρέπει τον απολογισμό «πουλήθηκαν / επιστράφηκαν» σε διαδοχικές κινήσεις. */
export function buildSettlementSteps(rows: SettlementInputRow[]): { steps: SettlementStep[]; issues: string[] } {
  const steps: SettlementStep[] = [];
  const issues: string[] = [];
  for (const row of rows) {
    const sold = Math.max(0, Math.floor(Number(row.sold) || 0));
    const returned = Math.max(0, Math.floor(Number(row.returned) || 0));
    if (sold + returned > row.pending) {
      issues.push('Πουλημένα και επιστροφές δεν μπορούν να ξεπερνούν τα τεμάχια στον πελάτη.');
      continue;
    }
    if (sold > 0) steps.push({ kind: 'sale', lineId: row.lineId, quantity: sold, unitPrice: Number(row.unitPrice) || 0 });
    if (returned > 0) steps.push({ kind: 'return', lineId: row.lineId, quantity: returned });
  }
  if (steps.length === 0 && issues.length === 0) issues.push('Συμπληρώστε τουλάχιστον μία πώληση ή επιστροφή.');
  return { steps, issues: [...new Set(issues)] };
}

export function extractCreatedConsignmentIds(result: unknown): string[] {
  const list = (result as { consignments?: Array<{ id?: string }> } | null)?.consignments;
  return Array.isArray(list) ? list.map((entry) => entry?.id).filter((id): id is string => typeof id === 'string') : [];
}

// ──────────────────────────────────────────────
//  Επισκευές
// ──────────────────────────────────────────────

export type RepairColumnKey = 'received' | 'production' | 'quality' | 'ready' | 'on_hold' | 'history';

export const REPAIR_COLUMNS: Array<{ key: RepairColumnKey; label: string; hint: string }> = [
  { key: 'received', label: 'Παραλήφθηκαν', hint: 'Περιμένουν να μπουν στην Παραγωγή' },
  { key: 'production', label: 'Στην Παραγωγή', hint: 'Δουλεύονται στο εργαστήριο' },
  { key: 'quality', label: 'Έλεγχος', hint: 'Βγήκαν από την Παραγωγή — χρειάζονται έγκριση' },
  { key: 'ready', label: 'Έτοιμες', hint: 'Περιμένουν τον πελάτη' },
  { key: 'on_hold', label: 'Σε αναμονή', hint: 'Παγωμένες μέχρι νεωτέρας' },
];

export const CLOSED_REPAIR_STATUSES = ['delivered', 'irreparable', 'cancelled'] as const;

export function isRepairClosed(item: Pick<RepairItem, 'status'>): boolean {
  return (CLOSED_REPAIR_STATUSES as readonly string[]).includes(item.status);
}

export function repairColumn(item: Pick<RepairItem, 'status'>, hasLiveBatch = false, batchOnHold = false): RepairColumnKey {
  if (isRepairClosed(item)) return 'history';
  if (item.status === 'on_hold' || batchOnHold) return 'on_hold';
  if (item.status === 'quality_check') return 'quality';
  if (item.status === 'ready_for_return') return 'ready';
  if (item.status === 'in_production' || hasLiveBatch) return 'production';
  return 'received';
}

export type RepairNextAction = 'send-to-production' | 'open-production' | 'quality' | 'deliver' | 'resume' | 'rework' | null;

export function nextRepairAction(item: Pick<RepairItem, 'status'>, hasLiveBatch: boolean, batchOnHold = false): RepairNextAction {
  if (item.status === 'delivered') return 'rework';
  if (isRepairClosed(item)) return null;
  if (item.status === 'on_hold' || batchOnHold) return 'resume';
  if (item.status === 'quality_check') return 'quality';
  if (item.status === 'ready_for_return') return 'deliver';
  if (hasLiveBatch) return 'open-production';
  return 'send-to-production';
}

export function repairOutstanding(charge?: Pick<RepairCharge, 'charge_type' | 'amount' | 'paid_amount'> | null): number {
  if (!charge || charge.charge_type !== 'chargeable') return 0;
  return Math.max(0, Number(charge.amount || 0) - Number(charge.paid_amount || 0));
}

export function daysSince(value: string | null | undefined, now: Date = new Date()): number {
  if (!value) return 0;
  const start = new Date(value);
  if (Number.isNaN(start.getTime())) return 0;
  return Math.max(0, Math.floor((now.getTime() - start.getTime()) / 86_400_000));
}

// ──────────────────────────────────────────────
//  Έξυπνες προτάσεις από ιστορικό πελάτη
// ──────────────────────────────────────────────

export interface PurchaseChip {
  key: string;
  sku: string;
  variantSuffix: string;
  sizeInfo: string;
  source: 'order' | 'consignment';
  orderId?: string;
  orderLineId?: string;
  settlementId?: string;
  date?: string;
}

export function buildPurchaseChips(
  customerId: string,
  orders: Array<{ id: string; customer_id?: string | null; created_at?: string; items?: Array<{ sku: string; variant_suffix?: string | null; size_info?: string | null; line_id?: string | null }> }>,
  consignmentSales: Array<{ id: string; customerId: string; sku: string; variantSuffix: string; sizeInfo: string; soldAt: string }>,
  limit = 16,
): PurchaseChip[] {
  if (!customerId) return [];
  const seen = new Set<string>();
  const chips: PurchaseChip[] = [];
  const customerOrders = orders
    .filter((order) => order.customer_id === customerId)
    .sort((left, right) => String(right.created_at || '').localeCompare(String(left.created_at || '')));
  for (const order of customerOrders) {
    for (const item of order.items || []) {
      const key = `${item.sku}|${item.variant_suffix || ''}|${item.line_id || ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      chips.push({
        key,
        sku: item.sku,
        variantSuffix: item.variant_suffix || '',
        sizeInfo: item.size_info || '',
        source: 'order',
        orderId: order.id,
        orderLineId: item.line_id || '',
        date: order.created_at,
      });
    }
  }
  for (const sale of consignmentSales.filter((entry) => entry.customerId === customerId)) {
    const key = `consign|${sale.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    chips.push({ key, sku: sale.sku, variantSuffix: sale.variantSuffix, sizeInfo: sale.sizeInfo, source: 'consignment', settlementId: sale.id, date: sale.soldAt });
  }
  return chips.slice(0, limit);
}

export interface TaggedConsignmentOrderLine {
  key: string;
  orderId: string;
  orderLineId: string;
  sku: string;
  variantSuffix: string;
  sizeInfo: string;
  quantity: number;
  unitPrice: number | null;
}

/** Γραμμές παραγγελιών του πελάτη σημειωμένες «Παρακαταθήκη» που δεν έχουν ακόμη καταχωριστεί. */
export function findTaggedConsignmentOrderLines(
  customerId: string,
  orders: Array<{ id: string; customer_id?: string | null; items?: any[] }>,
  existingOrderLineIds: Set<string | null>,
): TaggedConsignmentOrderLine[] {
  if (!customerId) return [];
  return orders
    .filter((order) => order.customer_id === customerId)
    .flatMap((order) => (order.items || [])
      .filter((item: any) => item?.fulfillment_mode === 'consignment' && !existingOrderLineIds.has(item.line_id || null))
      .map((item: any) => ({
        key: `${order.id}:${item.line_id || item.sku}`,
        orderId: order.id,
        orderLineId: item.line_id || '',
        sku: item.sku,
        variantSuffix: item.variant_suffix || '',
        sizeInfo: item.size_info || '',
        quantity: Number(item.quantity) || 1,
        unitPrice: item.price_at_order != null ? Number(item.price_at_order) : null,
      })));
}
