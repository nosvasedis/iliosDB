import { describe, expect, it } from 'vitest';
import { applySpecialCreationCostEstimate, type FinanceLineEvent } from '../../utils/financeAnalytics';

function event(overrides: Partial<FinanceLineEvent>): FinanceLineEvent {
  return {
    source: 'shipment',
    orderId: 'o1',
    date: '2026-03-10T10:00:00Z',
    customerName: 'Πελάτης',
    sellerCommissionPercent: 0,
    sku: 'DA100',
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
    silverWeight: 0,
    costBreakdown: { silver: 20, labor: 15, materials: 5 },
    priceOverride: false,
    costSource: 'catalog',
    ...overrides,
  };
}

const sp = (overrides: Partial<FinanceLineEvent> = {}) =>
  event({
    sku: 'SP',
    itemNote: 'Μονόγραμμα',
    quantity: 2,
    net: 500,
    estimatedCost: 0,
    estimatedUnitCost: 0,
    profit: 500,
    margin: 100,
    costBreakdown: { silver: 0, labor: 0, materials: 0 },
    costSource: 'special_estimate',
    ...overrides,
  });

describe('applySpecialCreationCostEstimate', () => {
  it('costs SP lines at the catalogue cost/revenue ratio and split', () => {
    const { realized } = applySpecialCreationCostEstimate({ realized: [event({}), sp()], backlog: [] });
    const special = realized.find((row) => row.sku === 'SP')!;
    expect(special.estimatedCost).toBeCloseTo(200);
    expect(special.estimatedUnitCost).toBeCloseTo(100);
    expect(special.profit).toBeCloseTo(300);
    expect(special.margin).toBeCloseTo(60);
    expect(special.costBreakdown.silver).toBeCloseTo(100);
    expect(special.costBreakdown.labor).toBeCloseTo(75);
    expect(special.costBreakdown.materials).toBeCloseTo(25);
  });

  it('leaves catalogue lines and missing-cost lines untouched', () => {
    const missing = event({ sku: 'GONE', estimatedCost: 0, profit: 100, costSource: 'missing', costWarning: 'GONE: x' });
    const catalog = event({});
    const { realized } = applySpecialCreationCostEstimate({ realized: [catalog, missing, sp()], backlog: [] });
    expect(realized[0]).toBe(catalog);
    expect(realized[1]).toBe(missing);
  });

  it('keeps SP at zero cost when there is no catalogue data to estimate from', () => {
    const bundle = { realized: [sp()], backlog: [] };
    expect(applySpecialCreationCostEstimate(bundle)).toBe(bundle);
  });
});
