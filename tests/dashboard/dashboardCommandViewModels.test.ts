import { describe, expect, it } from 'vitest';
import type { FinanceLineEvent, ResolvedFinancePeriod } from '../../utils/financeAnalytics';
import {
  buildAttentionItems,
  buildMissingCostRows,
  buildMonthlyTrend,
  percentDelta,
  resolvePeriodComparison,
  summarizeEventsInWindow,
} from '../../features/dashboard/dashboardCommandViewModels';

let seq = 0;
function event(overrides: Partial<FinanceLineEvent>): FinanceLineEvent {
  seq += 1;
  return {
    source: 'shipment',
    orderId: `o${seq}`,
    shipmentId: `s${seq}`,
    date: '2026-03-10T10:00:00Z',
    customerName: 'Πελάτης',
    sellerCommissionPercent: 0,
    sku: 'DA100',
    variantSuffix: '',
    quantity: 1,
    unitPrice: 100,
    subtotal: 100,
    discount: 0,
    net: 100,
    vat: 24,
    gross: 124,
    estimatedUnitCost: 40,
    estimatedCost: 40,
    profit: 60,
    margin: 60,
    category: 'Δαχτυλίδι',
    collectionId: null,
    collectionName: 'Χωρίς συλλογή',
    productImage: null,
    silverWeight: 5,
    costBreakdown: { silver: 20, labor: 15, materials: 5 },
    priceOverride: false,
    ...overrides,
  };
}

const EMPTY_READY = { total: 0, fullCount: 0, partialCount: 0, entries: [] };

describe('resolvePeriodComparison', () => {
  it('compares the elapsed part of the month with the same span of the previous month', () => {
    const period: ResolvedFinancePeriod = {
      mode: 'current_month',
      label: 'Τρέχων μήνας',
      start: new Date(2026, 9, 1),
      end: new Date(2026, 10, 1),
    };
    const comparison = resolvePeriodComparison(period, new Date(2026, 9, 11));
    expect(comparison?.previous.start).toEqual(new Date(2026, 8, 1));
    expect(comparison?.previous.end).toEqual(new Date(2026, 8, 11));
    expect(comparison?.current.end).toEqual(new Date(2026, 9, 11));
  });

  it('compares year-to-date with the same span last year', () => {
    const period: ResolvedFinancePeriod = {
      mode: 'current_year',
      label: 'Τρέχον έτος',
      start: new Date(2026, 0, 1),
      end: new Date(2027, 0, 1),
    };
    const comparison = resolvePeriodComparison(period, new Date(2026, 5, 1));
    expect(comparison?.previous.start).toEqual(new Date(2025, 0, 1));
    expect(comparison?.previous.end.getTime()).toBeLessThanOrEqual(new Date(2026, 0, 1).getTime());
    expect(comparison?.label).toContain('πέρσι');
  });

  it('has nothing to compare for all-time', () => {
    expect(resolvePeriodComparison({ mode: 'all_time', label: 'Όλα', start: null, end: null })).toBeNull();
  });
});

describe('summarizeEventsInWindow / percentDelta', () => {
  it('sums only events inside the window and dedupes identical lines', () => {
    const inside = event({ date: '2026-02-05T10:00:00Z', net: 200, profit: 80, quantity: 2 });
    const outside = event({ date: '2026-04-05T10:00:00Z', net: 999 });
    const summary = summarizeEventsInWindow([inside, { ...inside }, outside], {
      start: new Date('2026-02-01T00:00:00Z'),
      end: new Date('2026-03-01T00:00:00Z'),
    });
    expect(summary.revenue).toBe(200);
    expect(summary.pieces).toBe(2);
    expect(summary.orders).toBe(1);
    expect(summary.margin).toBe(40);
  });

  it('returns null when there is no base to compare with', () => {
    expect(percentDelta(100, 0)).toBeNull();
    expect(percentDelta(150, 100)).toBe(50);
    expect(percentDelta(50, 100)).toBe(-50);
  });
});

describe('buildMonthlyTrend', () => {
  it('produces one bucket per month ending at the anchor month', () => {
    const trend = buildMonthlyTrend(
      [
        event({ date: new Date(2026, 9, 3).toISOString(), net: 100, profit: 30 }),
        event({ date: new Date(2026, 9, 20).toISOString(), net: 50, profit: 10 }),
        event({ date: new Date(2025, 0, 3).toISOString(), net: 999 }),
      ],
      new Date(2026, 9, 27),
      12,
    );
    expect(trend).toHaveLength(12);
    const last = trend[trend.length - 1];
    expect(last.revenue).toBe(150);
    expect(last.profit).toBe(40);
    expect(last.orders).toBe(2);
    expect(trend.reduce((sum, point) => sum + point.revenue, 0)).toBe(150);
  });
});

describe('buildMissingCostRows', () => {
  it('groups lines without cost per SKU with their orders', () => {
    const warning = 'XX999: Δεν βρέθηκε προϊόν για υπολογισμό κόστους.';
    const rows = buildMissingCostRows(
      [
        event({ sku: 'XX999', orderId: 'a', customerName: 'Α', net: 120, quantity: 2, costWarning: warning }),
        event({ sku: 'DA100', net: 500 }),
      ],
      [event({ source: 'backlog', sku: 'XX999', orderId: 'b', customerName: 'Β', net: 60, quantity: 1, costWarning: warning })],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].sku).toBe('XX999');
    expect(rows[0].reason).toBe('Δεν βρέθηκε προϊόν για υπολογισμό κόστους.');
    expect(rows[0].realizedQuantity).toBe(2);
    expect(rows[0].backlogNet).toBe(60);
    expect(rows[0].orders.map((order) => order.stage)).toEqual(['realized', 'backlog']);
  });
});

describe('buildAttentionItems', () => {
  it('routes missing costs to the in-dashboard drill-down and orders by severity', () => {
    const items = buildAttentionItems({
      deliveryAttention: [],
      stageLoad: [],
      readyOrders: { ...EMPTY_READY, total: 2 },
      lowStockCount: 0,
      demandPressureCount: 0,
      pendingOffers: 1,
      legalGap: null,
      costWarningCount: 1,
    });
    expect(items.map((item) => item.id)).toEqual(['cost', 'ready', 'offers']);
    expect(items[0].opens).toBe('missing-costs');
  });
});
