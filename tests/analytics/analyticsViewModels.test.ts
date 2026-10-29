import { describe, expect, it } from 'vitest';
import type { FinanceLineEvent, ResolvedFinancePeriod } from '../../utils/financeAnalytics';
import {
  buildProfitabilityRows,
  buildTrendWithLastYear,
  eventsInWindow,
  forecastPeriod,
  summarizePareto,
} from '../../features/analytics/analyticsViewModels';

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

describe('buildProfitabilityRows', () => {
  it('groups by dimension, computes shares, margins and deltas vs the comparison window', () => {
    const current = [
      event({ category: 'Δαχτυλίδι', net: 800, profit: 400, estimatedCost: 400 }),
      event({ category: 'Σκουλαρίκι', net: 150, profit: 30, estimatedCost: 120 }),
      event({ category: 'Βραχιόλι', net: 50, profit: 25, estimatedCost: 25 }),
    ];
    const previous = [event({ category: 'Δαχτυλίδι', net: 400 }), event({ category: 'Σκουλαρίκι', net: 300 })];
    const rows = buildProfitabilityRows(current, previous, 'category');

    expect(rows.map((row) => row.label)).toEqual(['Δαχτυλίδι', 'Σκουλαρίκι', 'Βραχιόλι']);
    expect(rows[0].share).toBeCloseTo(80);
    expect(rows[0].margin).toBeCloseTo(50);
    expect(rows[0].delta).toBeCloseTo(100);
    expect(rows[1].delta).toBeCloseTo(-50);
    expect(rows[2].delta).toBeNull();
    expect(rows[2].previousRevenue).toBe(0);
    expect(rows.map((row) => row.abc)).toEqual(['A', 'B', 'C']);
  });

  it('keeps SP special creations apart and separates them by note in the product view', () => {
    const current = [
      event({ sku: 'SP', itemNote: 'Βέρα χαραγμένη', net: 200 }),
      event({ sku: 'SP', itemNote: 'Μενταγιόν', net: 100 }),
      event({ sku: 'DA100', net: 100 }),
    ];
    expect(buildProfitabilityRows(current, null, 'category').find((row) => row.isSpecial)?.revenue).toBe(300);
    const products = buildProfitabilityRows(current, null, 'product');
    expect(products).toHaveLength(3);
    expect(products[0].label).toBe('Βέρα χαραγμένη');
    expect(products.every((row) => row.delta === null && row.previousRevenue === null)).toBe(true);
  });

  it('summarizes Pareto concentration', () => {
    const rows = buildProfitabilityRows(
      [event({ sku: 'A', net: 900 }), event({ sku: 'B', net: 60 }), event({ sku: 'C', net: 40 })],
      null,
      'product',
    );
    const pareto = summarizePareto(rows);
    expect(pareto).toMatchObject({ count: 3, aCount: 1, top1Share: 90 });
  });
});

describe('forecastPeriod', () => {
  const period: ResolvedFinancePeriod = { mode: 'current_month', label: 'Τρέχων μήνας', start: new Date(2026, 9, 1), end: new Date(2026, 10, 1) };

  it('projects the run rate to the end of the period', () => {
    const forecast = forecastPeriod(period, 1000, 500, new Date(2026, 9, 16, 12));
    expect(forecast?.projectedRevenue).toBeGreaterThan(1950);
    expect(forecast?.projectedRevenue).toBeLessThan(2050);
    expect(forecast?.daysLeft).toBe(16);
  });

  it('skips unbounded, finished or just-started periods', () => {
    expect(forecastPeriod({ ...period, start: null, end: null }, 1000, 500)).toBeNull();
    expect(forecastPeriod(period, 1000, 500, new Date(2026, 10, 5))).toBeNull();
    expect(forecastPeriod(period, 1000, 500, new Date(2026, 9, 2))).toBeNull();
  });
});

describe('buildTrendWithLastYear', () => {
  it('aligns each month with the same month a year earlier', () => {
    const points = buildTrendWithLastYear(
      [event({ date: '2026-03-10T10:00:00Z', net: 500 }), event({ date: '2025-03-12T10:00:00Z', net: 200 })],
      new Date(2026, 3, 15),
      3,
    );
    expect(points).toHaveLength(3);
    const march = points[1];
    expect(march.revenue).toBe(500);
    expect(march.lastYearRevenue).toBe(200);
  });
});

describe('eventsInWindow', () => {
  it('filters to [start, end)', () => {
    const scoped = eventsInWindow(
      [event({ date: '2026-03-01T00:00:00' }), event({ date: '2026-04-01T00:00:00' })],
      { start: new Date(2026, 2, 1), end: new Date(2026, 3, 1) },
    );
    expect(scoped).toHaveLength(1);
  });
});
