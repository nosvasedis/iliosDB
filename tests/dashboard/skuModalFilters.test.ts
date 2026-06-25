import { describe, expect, it } from 'vitest';
import { Gender } from '../../types';
import type { FinanceLineEvent } from '../../utils/financeAnalytics';
import {
  aggregateVariantRankingsFromEvents,
  buildFilterFacets,
  buildOrderMetaIndex,
  buildSlimEnrichedRowsFromEvents,
  describeNegativeProfit,
  filterFinanceEventsForModal,
  formatVariantMargin,
  createEmptySkuModalFilters,
} from '../../features/dashboard/skuModalFilters';

function event(overrides: Partial<FinanceLineEvent>): FinanceLineEvent {
  return {
    source: 'shipment',
    orderId: 'order-1',
    date: '2026-03-01T10:00:00.000Z',
    customerName: 'Alpha',
    sellerCommissionPercent: 0,
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
    costBreakdown: { silver: 5, labor: 3, materials: 2 },
    priceOverride: false,
    ...overrides,
  };
}

describe('skuModalFilters', () => {
  const orders = [
    {
      id: 'order-1',
      customer_name: 'Alpha',
      items: [],
      status: 'Delivered',
      created_at: '2026-01-01',
      total_price: 100,
      tags: ['Αθήνα'],
    },
    {
      id: 'order-2',
      customer_name: 'Beta',
      items: [],
      status: 'Delivered',
      created_at: '2026-01-02',
      total_price: 50,
      tags: ['Θεσσαλονίκη'],
      seller_id: 's1',
      seller_name: 'Maria',
    },
  ] as any[];

  const realized = [
    event({ orderId: 'order-1', customerId: 'c1', customerName: 'Alpha', quantity: 2 }),
    event({ orderId: 'order-2', customerId: 'c2', customerName: 'Beta', quantity: 1, sellerId: 's1', sellerName: 'Maria' }),
    event({ orderId: 'order-gift', sku: 'GIFT01', customerName: 'Gamma', net: 0, profit: -50, estimatedCost: 50, unitPrice: 0, subtotal: 0, quantity: 1 }),
  ];

  it('filters events by customer and tag', () => {
    const orderMeta = buildOrderMetaIndex(orders);
    const filters = createEmptySkuModalFilters();
    filters.customers.add('c1');

    const filtered = filterFinanceEventsForModal(realized, filters, orderMeta, []);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].customerName).toBe('Alpha');

    filters.customers.clear();
    filters.tags.add('Αθήνα');
    const byTag = filterFinanceEventsForModal(realized, filters, orderMeta, []);
    expect(byTag).toHaveLength(1);
    expect(byTag[0].orderId).toBe('order-1');
  });

  it('filters by seller from current order assignment even when events lack sellerId', () => {
    const ordersWithLateSeller = [
      ...orders,
      {
        id: 'order-3',
        customer_name: 'Gamma',
        items: [],
        status: 'Delivered',
        created_at: '2026-01-03',
        total_price: 80,
        seller_id: 's2',
        seller_name: 'Alexandros',
      },
    ] as any[];

    const eventsWithoutSeller = [
      ...realized,
      event({ orderId: 'order-3', customerId: 'c3', customerName: 'Gamma', sku: 'NEW01', quantity: 3 }),
    ];

    const orderMeta = buildOrderMetaIndex(ordersWithLateSeller);
    const filters = createEmptySkuModalFilters();
    filters.sellers.add('s2');

    const filtered = filterFinanceEventsForModal(eventsWithoutSeller, filters, orderMeta, []);
    expect(filtered.some((row) => row.orderId === 'order-3')).toBe(true);
    expect(filtered.find((row) => row.orderId === 'order-3')?.sellerId).toBe('s2');
    expect(filtered.find((row) => row.orderId === 'order-3')?.sellerName).toBe('Alexandros');
  });

  it('tracks gift quantity in variant rankings', () => {
    const rankings = aggregateVariantRankingsFromEvents(realized);
    const giftRow = rankings.find((r) => r.profit < 0);
    expect(giftRow?.giftQuantity).toBe(1);
    expect(giftRow?.profit).toBe(-50);
  });

  it('explains negative profit for gifts', () => {
    const row = { profit: -50, giftQuantity: 2, belowCostQuantity: 0, quantity: 2, revenue: 0, margin: 0 } as any;
    expect(describeNegativeProfit(row)).toContain('δώρο');
    expect(formatVariantMargin(row)).toBe('—');
  });

  it('builds slim rows sorted by quantity', () => {
    const products = [{ sku: 'RN045', gender: Gender.Women }] as any[];
    const rows = buildSlimEnrichedRowsFromEvents(realized, products, 'quantity', '');
    expect(rows[0].quantity).toBeGreaterThanOrEqual(rows[rows.length - 1].quantity);
  });

  it('builds filter facets from events and orders', () => {
    const ordersWithLateSeller = [
      ...orders,
      {
        id: 'order-3',
        customer_name: 'Gamma',
        items: [],
        status: 'Delivered',
        created_at: '2026-01-03',
        total_price: 80,
        seller_id: 's2',
        seller_name: 'Alexandros',
      },
    ] as any[];
    const eventsWithoutSeller = [
      ...realized,
      event({ orderId: 'order-3', customerId: 'c3', customerName: 'Gamma' }),
    ];
    const orderMeta = buildOrderMetaIndex(ordersWithLateSeller);
    const facets = buildFilterFacets(eventsWithoutSeller, orderMeta, []);
    expect(facets.tags).toContain('Αθήνα');
    expect(facets.customers.map((c) => c.name)).toEqual(expect.arrayContaining(['Alpha', 'Beta', 'Gamma']));
    expect(facets.sellers.map((s) => s.id)).toEqual(expect.arrayContaining(['s1', 's2']));
  });
});
