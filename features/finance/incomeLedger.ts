import {
  OrderStatus,
  type Customer,
  type LegalDocument,
  type Offer,
  type Order,
  type OrderShipment,
  type OrderShipmentItem,
} from '../../types';
import { isInternalOrder } from '../../utils/orderCustomer';
import { calculateOrderFinancials } from '../orders/orderFinancials';
import {
  addDays,
  dateOnly,
  daysBetween,
  inPeriod,
  monthKeys,
  normalizeSplit,
  roundMoney,
  splitExpected,
  type BillingSplit,
} from './financeMath';
import type {
  FinanceBilling,
  FinanceCustomerTerms,
  FinanceOrderBilling,
  FinancePeriod,
  FinanceReceipt,
} from './types';

export interface IncomeInput {
  orders: readonly Order[];
  shipments: readonly OrderShipment[];
  shipmentItems: readonly OrderShipmentItem[];
  customers: readonly Customer[];
  orderBilling: readonly FinanceOrderBilling[];
  customerTerms: readonly FinanceCustomerTerms[];
  receipts: readonly FinanceReceipt[];
  legalDocuments?: readonly LegalDocument[];
  today: string;
}

export type MoneyPair = Record<FinanceBilling, number>;
const pair = (T = 0, X = 0): MoneyPair => ({ T: roundMoney(T), X: roundMoney(X) });

export interface OrderIncome {
  order: Order;
  customerId: string | null;
  customerName: string;
  split: BillingSplit;
  /** True when the split was set on the order itself (not inherited). */
  explicitSplit: boolean;
  net: number;
  vatRate: number;
  /** Full value of the order, split Τ/Χ. */
  expected: MoneyPair;
  /** Share of the order already delivered (0–1). */
  deliveredRatio: number;
  /** What the customer owes for what was delivered. */
  due: MoneyPair;
  collected: MoneyPair;
  /** due − collected (negative = προκαταβολή). */
  outstanding: MoneyPair;
  /** expected − collected: what is still to come in total. */
  remaining: MoneyPair;
  firstShippedAt?: string;
  lastShippedAt?: string;
  dueDate?: string;
  daysOverdue: number;
  /** Τ already covered by issued invoices for this order. */
  invoicedT: number;
}

const ACTIVE_LEGAL_STATUSES = new Set(['issued', 'submitted']);

/** Effective Χ/Τ split: order override → customer terms → Τ. */
export function resolveOrderSplit(
  order: Pick<Order, 'id' | 'customer_id'>,
  billingByOrder: ReadonlyMap<string, FinanceOrderBilling>,
  termsByCustomer: ReadonlyMap<string, FinanceCustomerTerms>,
): { split: BillingSplit; explicit: boolean; billing?: FinanceOrderBilling } {
  const billing = billingByOrder.get(order.id);
  if (billing) return { split: normalizeSplit(billing.mode, billing.t_percent), explicit: true, billing };
  const terms = order.customer_id ? termsByCustomer.get(order.customer_id) : undefined;
  return { split: normalizeSplit(terms?.default_mode, terms?.t_percent), explicit: false };
}

export const orderVatRate = (order: Pick<Order, 'vat_rate'>): number =>
  order.vat_rate === null || order.vat_rate === undefined ? 0.24 : Number(order.vat_rate);

export function isIncomeOrder(order: Order): boolean {
  return order.status !== OrderStatus.Cancelled && !isInternalOrder(order);
}

export function buildOrderIncome(input: IncomeInput): OrderIncome[] {
  const billingByOrder = new Map(input.orderBilling.map((row) => [row.order_id, row]));
  const termsByCustomer = new Map(input.customerTerms.map((row) => [row.customer_id, row]));
  const customerById = new Map(input.customers.map((customer) => [customer.id, customer]));
  const shipmentsByOrder = new Map<string, OrderShipment[]>();
  input.shipments.forEach((shipment) => {
    shipmentsByOrder.set(shipment.order_id, [...(shipmentsByOrder.get(shipment.order_id) || []), shipment]);
  });
  const shipmentById = new Map(input.shipments.map((shipment) => [shipment.id, shipment]));
  const shippedSubtotalByOrder = new Map<string, number>();
  input.shipmentItems.forEach((item) => {
    const shipment = shipmentById.get(item.shipment_id);
    if (!shipment) return;
    shippedSubtotalByOrder.set(shipment.order_id, (shippedSubtotalByOrder.get(shipment.order_id) || 0) + item.price_at_order * item.quantity);
  });
  const receiptsByOrder = new Map<string, FinanceReceipt[]>();
  input.receipts.forEach((receipt) => {
    if (receipt.order_id) receiptsByOrder.set(receipt.order_id, [...(receiptsByOrder.get(receipt.order_id) || []), receipt]);
  });
  const invoicedByOrder = new Map<string, number>();
  (input.legalDocuments || []).forEach((document) => {
    if (!document.order_id || !ACTIVE_LEGAL_STATUSES.has(document.status)) return;
    if (document.document_kind === 'delivery_note') return;
    const sign = document.document_kind === 'credit' ? -1 : 1;
    invoicedByOrder.set(document.order_id, (invoicedByOrder.get(document.order_id) || 0) + sign * Number(document.totals?.gross || 0));
  });

  return input.orders.filter(isIncomeOrder).map((order) => {
    const { split, explicit, billing } = resolveOrderSplit(order, billingByOrder, termsByCustomer);
    const vatRate = orderVatRate(order);
    const items = Array.isArray(order.items) ? order.items : [];
    const financials = calculateOrderFinancials(items, Number(order.discount_percent || 0), vatRate);
    // Lightweight list rows have no items; fall back to the stored gross total.
    const net = items.length > 0 ? financials.saleNet : Number(order.total_price || 0) / (1 + vatRate);
    const expected = splitExpected(net, vatRate, split, billing?.agreed_total);

    const orderShipments = (shipmentsByOrder.get(order.id) || []).slice().sort((a, b) => a.shipped_at.localeCompare(b.shipped_at));
    let deliveredRatio = 0;
    if (order.status === OrderStatus.Delivered) deliveredRatio = 1;
    else if (financials.saleSubtotal > 0) deliveredRatio = Math.min(1, (shippedSubtotalByOrder.get(order.id) || 0) / financials.saleSubtotal);
    else if (orderShipments.length > 0) deliveredRatio = 1;

    const due = pair(expected.T * deliveredRatio, expected.X * deliveredRatio);
    const collectedT = (receiptsByOrder.get(order.id) || []).filter((receipt) => receipt.billing === 'T').reduce((sum, receipt) => sum + receipt.amount, 0);
    const collectedX = (receiptsByOrder.get(order.id) || []).filter((receipt) => receipt.billing === 'X').reduce((sum, receipt) => sum + receipt.amount, 0);
    const collected = pair(collectedT, collectedX);

    const firstShippedAt = orderShipments[0] ? dateOnly(orderShipments[0].shipped_at) : (deliveredRatio > 0 ? dateOnly(order.created_at) : undefined);
    const lastShippedAt = orderShipments.length ? dateOnly(orderShipments[orderShipments.length - 1].shipped_at) : firstShippedAt;
    const customer = order.customer_id ? customerById.get(order.customer_id) : undefined;
    const creditDays = Number(customer?.profile?.credit_days || 0);
    const dueDate = billing?.due_date ? dateOnly(billing.due_date) : (lastShippedAt ? addDays(lastShippedAt, creditDays) : undefined);
    const outstanding = pair(due.T - collected.T, due.X - collected.X);
    const outstandingTotal = Math.max(0, outstanding.T) + Math.max(0, outstanding.X);

    return {
      order,
      customerId: order.customer_id || null,
      customerName: customer?.full_name || order.customer_name,
      split,
      explicitSplit: explicit,
      net: roundMoney(net),
      vatRate,
      expected,
      deliveredRatio,
      due,
      collected,
      outstanding,
      remaining: pair(expected.T - collected.T, expected.X - collected.X),
      firstShippedAt,
      lastShippedAt,
      dueDate,
      daysOverdue: dueDate && outstandingTotal > 0.01 ? Math.max(0, daysBetween(dueDate, input.today)) : 0,
      invoicedT: roundMoney(invoicedByOrder.get(order.id) || 0),
    };
  });
}

export type AgingBucket = 'current' | 'd30' | 'd60' | 'd90' | 'd90plus';
export const AGING_LABELS: Record<AgingBucket, string> = {
  current: 'Εμπρόθεσμα',
  d30: '1–30 ημ.',
  d60: '31–60 ημ.',
  d90: '61–90 ημ.',
  d90plus: '90+ ημ.',
};

export const agingBucket = (daysOverdue: number): AgingBucket =>
  daysOverdue <= 0 ? 'current' : daysOverdue <= 30 ? 'd30' : daysOverdue <= 60 ? 'd60' : daysOverdue <= 90 ? 'd90' : 'd90plus';

export interface CustomerBalance {
  customerId: string;
  customerName: string;
  due: MoneyPair;
  collected: MoneyPair;
  /** Receipts not linked to any order (on account). */
  onAccount: MoneyPair;
  balance: MoneyPair;
  total: number;
  aging: Record<AgingBucket, number>;
  maxDaysOverdue: number;
  creditLimit?: number;
  overCreditLimit: boolean;
  orders: OrderIncome[];
  lastReceiptAt?: string;
}

export function buildCustomerBalances(
  orderIncome: readonly OrderIncome[],
  receipts: readonly FinanceReceipt[],
  customers: readonly Customer[],
): CustomerBalance[] {
  const customerById = new Map(customers.map((customer) => [customer.id, customer]));
  const groups = new Map<string, { name: string; orders: OrderIncome[] }>();
  orderIncome.forEach((income) => {
    const key = income.customerId || `name:${income.customerName}`;
    if (!groups.has(key)) groups.set(key, { name: income.customerName, orders: [] });
    groups.get(key)!.orders.push(income);
  });
  const onAccountByCustomer = new Map<string, FinanceReceipt[]>();
  const lastReceipt = new Map<string, string>();
  receipts.forEach((receipt) => {
    const customerId = receipt.customer_id;
    if (!customerId) return;
    const day = dateOnly(receipt.received_at);
    if ((lastReceipt.get(customerId) || '') < day) lastReceipt.set(customerId, day);
    if (receipt.order_id) return;
    onAccountByCustomer.set(customerId, [...(onAccountByCustomer.get(customerId) || []), receipt]);
    if (!groups.has(customerId)) groups.set(customerId, { name: customerById.get(customerId)?.full_name || '—', orders: [] });
  });

  return [...groups.entries()].map(([key, group]) => {
    const due = pair(sumBy(group.orders, (o) => o.due.T), sumBy(group.orders, (o) => o.due.X));
    const collected = pair(sumBy(group.orders, (o) => o.collected.T), sumBy(group.orders, (o) => o.collected.X));
    const onAccountRows = onAccountByCustomer.get(key) || [];
    const onAccount = pair(
      sumBy(onAccountRows.filter((r) => r.billing === 'T'), (r) => r.amount),
      sumBy(onAccountRows.filter((r) => r.billing === 'X'), (r) => r.amount),
    );
    const balance = pair(due.T - collected.T - onAccount.T, due.X - collected.X - onAccount.X);
    const aging: Record<AgingBucket, number> = { current: 0, d30: 0, d60: 0, d90: 0, d90plus: 0 };
    // On-account money settles the oldest debts first.
    let pool = onAccount.T + onAccount.X;
    [...group.orders].sort((a, b) => b.daysOverdue - a.daysOverdue).forEach((income) => {
      let open = Math.max(0, income.outstanding.T) + Math.max(0, income.outstanding.X);
      const applied = Math.min(pool, open);
      pool -= applied;
      open -= applied;
      if (open > 0.004) aging[agingBucket(income.daysOverdue)] += open;
    });
    const customer = customerById.get(key);
    const total = roundMoney(balance.T + balance.X);
    const creditLimit = customer?.profile?.credit_limit ?? undefined;
    return {
      customerId: key,
      customerName: customer?.full_name || group.name,
      due,
      collected,
      onAccount,
      balance,
      total,
      aging: Object.fromEntries(Object.entries(aging).map(([bucket, value]) => [bucket, roundMoney(value)])) as Record<AgingBucket, number>,
      maxDaysOverdue: Math.max(0, ...group.orders.filter((o) => o.outstanding.T + o.outstanding.X > 0.01).map((o) => o.daysOverdue)),
      creditLimit: creditLimit ?? undefined,
      overCreditLimit: !!creditLimit && total > creditLimit,
      orders: group.orders,
      lastReceiptAt: lastReceipt.get(key),
    };
  }).sort((a, b) => b.total - a.total);
}

const sumBy = <T>(rows: readonly T[], pick: (row: T) => number): number => rows.reduce((sum, row) => sum + pick(row), 0);

export interface ReceiptSummary {
  total: number;
  byBilling: MoneyPair;
  byMethod: Record<string, number>;
  byMonth: Array<{ month: string; T: number; X: number; total: number }>;
  count: number;
}

export function summarizeReceipts(receipts: readonly FinanceReceipt[], period: FinancePeriod): ReceiptSummary {
  const months = new Map(monthKeys(period).map((month) => [month, { month, T: 0, X: 0, total: 0 }]));
  const byMethod: Record<string, number> = {};
  let T = 0;
  let X = 0;
  let count = 0;
  receipts.forEach((receipt) => {
    if (!inPeriod(receipt.received_at, period)) return;
    count += 1;
    if (receipt.billing === 'T') T += receipt.amount;
    else X += receipt.amount;
    byMethod[receipt.method] = roundMoney((byMethod[receipt.method] || 0) + receipt.amount);
    const bucket = months.get(dateOnly(receipt.received_at).slice(0, 7));
    if (bucket) {
      bucket[receipt.billing] += receipt.amount;
      bucket.total += receipt.amount;
    }
  });
  return {
    total: roundMoney(T + X),
    byBilling: pair(T, X),
    byMethod,
    byMonth: [...months.values()].map((bucket) => ({ ...bucket, T: roundMoney(bucket.T), X: roundMoney(bucket.X), total: roundMoney(bucket.total) })),
    count,
  };
}

/** Τζίρος: value delivered in the period (by shipment date), split Τ/Χ by each order's terms. */
export function deliveredInPeriod(input: IncomeInput, orderIncome: readonly OrderIncome[], period: FinancePeriod): MoneyPair {
  const incomeByOrder = new Map(orderIncome.map((income) => [income.order.id, income]));
  const shipmentById = new Map(input.shipments.map((shipment) => [shipment.id, shipment]));
  let T = 0;
  let X = 0;
  input.shipmentItems.forEach((item) => {
    const shipment = shipmentById.get(item.shipment_id);
    if (!shipment || !inPeriod(shipment.shipped_at, period)) return;
    const income = incomeByOrder.get(shipment.order_id);
    if (!income) return;
    const items = Array.isArray(income.order.items) ? income.order.items : [];
    const subtotal = calculateOrderFinancials(items, Number(income.order.discount_percent || 0), income.vatRate).saleSubtotal;
    if (subtotal <= 0) return;
    const share = (item.price_at_order * item.quantity) / subtotal;
    T += income.expected.T * share;
    X += income.expected.X * share;
  });
  // Legacy delivered orders without shipment rows count on their order date.
  orderIncome.forEach((income) => {
    if (income.order.status === OrderStatus.Delivered && !input.shipments.some((shipment) => shipment.order_id === income.order.id)
      && inPeriod(income.order.created_at, period)) {
      T += income.expected.T;
      X += income.expected.X;
    }
  });
  return pair(T, X);
}

export interface IncomePipeline {
  backlog: MoneyPair;
  backlogOrders: number;
  offers: MoneyPair;
  offerCount: number;
}

/** Still to deliver (open orders) and still to win (pending offers), split by expected Χ/Τ. */
export function buildPipeline(
  orderIncome: readonly OrderIncome[],
  offers: readonly Offer[],
  customerTerms: readonly FinanceCustomerTerms[],
): IncomePipeline {
  let backlogT = 0;
  let backlogX = 0;
  let backlogOrders = 0;
  orderIncome.forEach((income) => {
    const undelivered = 1 - income.deliveredRatio;
    if (undelivered <= 0.0001) return;
    backlogOrders += 1;
    backlogT += income.expected.T * undelivered;
    backlogX += income.expected.X * undelivered;
  });
  const termsByCustomer = new Map(customerTerms.map((row) => [row.customer_id, row]));
  let offerT = 0;
  let offerX = 0;
  const pending = offers.filter((offer) => offer.status === 'Pending' && !offer.converted_order_id);
  pending.forEach((offer) => {
    const terms = offer.customer_id ? termsByCustomer.get(offer.customer_id) : undefined;
    const vatRate = offer.vat_rate === null || offer.vat_rate === undefined ? 0.24 : Number(offer.vat_rate);
    const split = splitExpected(Number(offer.total_price || 0) / (1 + vatRate), vatRate, normalizeSplit(terms?.default_mode, terms?.t_percent));
    offerT += split.T;
    offerX += split.X;
  });
  return { backlog: pair(backlogT, backlogX), backlogOrders, offers: pair(offerT, offerX), offerCount: pending.length };
}

export interface InvoiceGap {
  income: OrderIncome;
  /** Τ delivered but not yet covered by an issued invoice. */
  missing: number;
}

/** Orders whose delivered Τ part exceeds what was invoiced. */
export function findInvoiceGaps(orderIncome: readonly OrderIncome[], tolerance = 1): InvoiceGap[] {
  return orderIncome
    .map((income) => ({ income, missing: roundMoney(income.due.T - income.invoicedT) }))
    .filter((gap) => gap.missing > tolerance)
    .sort((a, b) => b.missing - a.missing);
}

/** Splits an amount the user is collecting into Τ/Χ the way the order is agreed. */
export function suggestReceiptSplit(income: OrderIncome, amount: number): MoneyPair {
  const openT = Math.max(0, income.remaining.T);
  const openX = Math.max(0, income.remaining.X);
  const open = openT + openX;
  if (open <= 0) return income.split.tPercent >= 50 ? pair(amount, 0) : pair(0, amount);
  const t = Math.min(openT, amount * (openT / open));
  return pair(t, amount - t);
}
