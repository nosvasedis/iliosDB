import { describe, expect, it } from 'vitest';
import {
  buildSkuVariantDetail,
  buildSkuVariantDetailFromSelection,
  resolveSkuInspectTarget,
} from '../../features/dashboard/skuVariantAnalytics';
import { buildEnrichedVariantAnalyticsRows } from '../../features/dashboard/dashboardAnalysisViewModels';
import type { FinanceLineEvent, FinanceVariantRanking } from '../../utils/financeAnalytics';
import { itemMatchesSkuQuery, financeEventMatchesSkuQuery } from '../../utils/skuSearchMatch';

function event(overrides: Partial<FinanceLineEvent>): FinanceLineEvent {
  return {
    source: 'shipment',
    orderId: 'order-1',
    date: '2026-03-01T10:00:00.000Z',
    customerName: 'Πελάτης Α',
    sellerCommissionPercent: 10,
    sku: 'RN045',
    variantSuffix: 'XTG',
    quantity: 1,
    unitPrice: 100,
    subtotal: 100,
    discount: 0,
    net: 100,
    vat: 0,
    gross: 100,
    estimatedUnitCost: 20,
    estimatedCost: 20,
    profit: 80,
    margin: 80,
    category: 'Δαχτυλίδι',
    collectionId: null,
    collectionName: 'Χωρίς συλλογή',
    productImage: null,
    silverWeight: 5,
    costBreakdown: { silver: 10, labor: 5, materials: 5 },
    priceOverride: false,
    ...overrides,
  };
}

describe('skuSearchMatch', () => {
  it('matches master-only query against any suffix', () => {
    expect(itemMatchesSkuQuery({ sku: 'DA001', variant_suffix: 'DLE' }, 'DA001')).toBe(true);
    expect(financeEventMatchesSkuQuery({ sku: 'DA001', variantSuffix: 'DLE' }, 'DA001')).toBe(true);
  });

  it('matches suffix-specific prefix queries', () => {
    expect(financeEventMatchesSkuQuery({ sku: 'RN045', variantSuffix: 'XTG' }, 'RN045XTG')).toBe(true);
    expect(financeEventMatchesSkuQuery({ sku: 'RN045', variantSuffix: 'P' }, 'RN045XTG')).toBe(false);
  });

  it('matches SP searches against the item note', () => {
    expect(financeEventMatchesSkuQuery({ sku: 'SP', variantSuffix: null, itemNote: 'Μενταγιόν κύμα' }, 'κύμα')).toBe(true);
  });
});

describe('skuVariantAnalytics', () => {
  const realized: FinanceLineEvent[] = [
    event({
      orderId: 'order-1',
      customerId: 'c1',
      customerName: 'Alpha Shop',
      sku: 'RN045',
      variantSuffix: 'XTG',
      quantity: 2,
      net: 200,
      profit: 160,
      date: '2026-01-15T10:00:00.000Z',
      shipmentNumber: 1,
      sellerId: 's1',
      sellerName: 'Maria',
    }),
    event({
      orderId: 'order-2',
      customerId: 'c1',
      customerName: 'Alpha Shop',
      sku: 'RN045',
      variantSuffix: 'XTG',
      quantity: 1,
      net: 100,
      profit: 80,
      date: '2026-02-10T10:00:00.000Z',
      shipmentNumber: 2,
      sellerId: 's1',
      sellerName: 'Maria',
    }),
    event({
      orderId: 'order-3',
      customerId: 'c2',
      customerName: 'Beta Store',
      sku: 'RN045',
      variantSuffix: 'P',
      quantity: 3,
      net: 300,
      profit: 240,
      date: '2026-02-20T10:00:00.000Z',
      shipmentNumber: 1,
    }),
  ];

  const backlog: FinanceLineEvent[] = [
    event({
      source: 'backlog',
      orderId: 'order-4',
      customerId: 'c3',
      customerName: 'Gamma',
      sku: 'RN045',
      variantSuffix: 'XTG',
      quantity: 2,
      net: 200,
      profit: 160,
    }),
  ];

  it('keeps different SP notes separate in selection details', () => {
    const spEvents = [
      event({ sku: 'SP', variantSuffix: null, itemNote: 'Καρφίτσα ήλιος', quantity: 2, net: 200 }),
      event({ sku: 'SP', variantSuffix: null, itemNote: 'Μενταγιόν κύμα', quantity: 3, net: 300 }),
    ];
    const detail = buildSkuVariantDetailFromSelection({
      realized: spEvents,
      backlog: [],
      sku: 'SP',
      itemNote: 'Καρφίτσα ήλιος',
      matchItemNote: true,
    });
    expect(detail).toMatchObject({ itemNote: 'Καρφίτσα ήλιος', summary: { quantity: 2, revenue: 200 } });
  });

  it('resolveSkuInspectTarget returns master aggregate for master-only query with multiple suffixes', () => {
    expect(resolveSkuInspectTarget('RN045', realized)).toEqual({
      kind: 'master',
      sku: 'RN045',
      query: 'RN045',
    });
  });

  it('resolveSkuInspectTarget returns variant for suffix-specific query', () => {
    expect(resolveSkuInspectTarget('RN045XTG', realized)).toEqual({
      kind: 'variant',
      sku: 'RN045',
      variantSuffix: 'XTG',
      query: 'RN045XTG',
    });
  });

  it('buildSkuVariantDetail aggregates master SKU across suffixes', () => {
    const detail = buildSkuVariantDetail({ realized, backlog, query: 'RN045' });
    expect(detail).not.toBeNull();
    expect(detail!.isMasterAggregate).toBe(true);
    expect(detail!.summary.quantity).toBe(6);
    expect(detail!.summary.revenue).toBe(600);
    expect(detail!.summary.customerCount).toBe(2);
    expect(detail!.variantBreakdown).toHaveLength(2);
    expect(detail!.variantBreakdown!.find((r) => r.variantSuffix === 'XTG')?.quantity).toBe(3);
    expect(detail!.variantBreakdown!.find((r) => r.variantSuffix === 'P')?.quantity).toBe(3);
  });

  it('buildSkuVariantDetail isolates single variant suffix', () => {
    const detail = buildSkuVariantDetail({ realized, backlog, query: 'RN045XTG' });
    expect(detail).not.toBeNull();
    expect(detail!.variantSuffix).toBe('XTG');
    expect(detail!.summary.quantity).toBe(3);
    expect(detail!.summary.orderCount).toBe(2);
    expect(detail!.customers).toHaveLength(1);
    expect(detail!.customers[0]).toMatchObject({
      name: 'Alpha Shop',
      quantity: 3,
      orderCount: 2,
      quantityShare: 100,
    });
    expect(detail!.backlog.quantity).toBe(2);
  });

  it('buildSkuVariantDetail returns null for zero-match query', () => {
    expect(buildSkuVariantDetail({ realized, backlog, query: 'ZZ999' })).toBeNull();
    expect(buildSkuVariantDetail({ realized, backlog, query: 'R' })).toBeNull();
  });

  it('buildSkuVariantDetailFromSelection builds customer and seller rankings', () => {
    const detail = buildSkuVariantDetailFromSelection({
      realized,
      backlog,
      sku: 'RN045',
      variantSuffix: 'XTG',
    });
    expect(detail!.customers[0].name).toBe('Alpha Shop');
    expect(detail!.sellers[0]).toMatchObject({ name: 'Maria', quantity: 3, revenue: 300 });
    expect(detail!.timeline).toHaveLength(2);
  });
});

describe('buildEnrichedVariantAnalyticsRows without limit', () => {
  it('returns all rows when limit is omitted', () => {
    const rankings: FinanceVariantRanking[] = Array.from({ length: 120 }, (_, i) => ({
      sku: `SKU${i}`,
      variantSuffix: '',
      image: null,
      category: 'Δαχτυλίδι',
      revenue: 100 - i,
      estimatedCost: 10,
      profit: 90 - i,
      margin: 90,
      quantity: 120 - i,
    }));

    const rows = buildEnrichedVariantAnalyticsRows(rankings, [], []);
    expect(rows).toHaveLength(120);
    expect(rows[0].rank).toBe(1);
    expect(rows[0].quantity).toBe(120);
  });
});
