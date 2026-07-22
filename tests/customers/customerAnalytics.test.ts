import { describe, expect, it } from 'vitest';
import { Customer, Order, OrderStatus, Product } from '../../types';
import { FinanceLineEvent } from '../../utils/financeAnalytics';
import {
  buildCustomerAnalytics,
  resolveCustomerAnalyticsCategory,
  sortCustomerPerformanceRows,
} from '../../features/customers/customerAnalytics';

const customer: Customer = {
  id: 'customer-1',
  full_name: 'Πελάτης Δοκιμής',
  created_at: '2024-01-01T00:00:00.000Z',
};

const product = (sku: string, category: string): Product => ({
  sku,
  prefix: sku,
  category,
  gender: 'Unisex' as Product['gender'],
  image_url: null,
  weight_g: 1,
  plating_type: 'None' as Product['plating_type'],
  production_type: 'InHouse' as Product['production_type'],
  active_price: 100,
  draft_price: 100,
  selling_price: 100,
  stock_qty: 0,
  sample_qty: 0,
  molds: [],
  is_component: false,
  recipe: [],
  labor: {
    casting_cost: 0,
    setter_cost: 0,
    technician_cost: 0,
    stone_setting_cost: 0,
    plating_cost_x: 0,
    plating_cost_d: 0,
    subcontract_cost: 0,
  },
});

const order = (id: string, date: string, sku = 'A1', overrides: Partial<Order> = {}): Order => ({
  id,
  customer_id: customer.id,
  customer_name: customer.full_name,
  created_at: date,
  status: OrderStatus.Delivered,
  items: [{ sku, quantity: 2, price_at_order: 100 }],
  total_price: 248,
  vat_rate: 0.24,
  ...overrides,
});

const event = (sku: string, date: string, overrides: Partial<FinanceLineEvent> = {}): FinanceLineEvent => ({
  source: 'shipment',
  orderId: overrides.orderId || `order-${sku}-${date}`,
  date,
  customerId: customer.id,
  customerName: customer.full_name,
  sellerCommissionPercent: 0,
  sku,
  variantSuffix: null,
  quantity: 2,
  unitPrice: 100,
  subtotal: 200,
  discount: 0,
  net: 200,
  vat: 48,
  gross: 248,
  estimatedUnitCost: 40,
  estimatedCost: 80,
  profit: 120,
  margin: 60,
  category: 'Legacy category',
  collectionId: null,
  collectionName: 'Χωρίς συλλογή',
  productImage: null,
  silverWeight: 0,
  costBreakdown: { silver: 0, labor: 0, materials: 80 },
  priceOverride: false,
  ...overrides,
});

describe('customer analytics', () => {
  it('separates realized performance from current backlog and compares bounded periods', () => {
    const vm = buildCustomerAnalytics({
      customer,
      allOrders: [order('current', '2026-06-01T00:00:00.000Z')],
      realizedEvents: [
        event('A1', '2026-06-15T00:00:00.000Z', { orderId: 'current' }),
        event('A1', '2025-05-01T00:00:00.000Z', { orderId: 'previous', net: 100, profit: 40 }),
      ],
      backlogEvents: [event('A1', '2026-06-01T00:00:00.000Z', { source: 'backlog', net: 75, quantity: 1 })],
      products: [product('A1', 'Δαχτυλίδι')],
      period: '12m',
      now: new Date('2026-07-01T00:00:00.000Z'),
    });

    expect(vm.metrics.revenue.current).toBe(200);
    expect(vm.metrics.revenue.previous).toBe(100);
    expect(vm.metrics.revenue.changePercent).toBe(100);
    expect(vm.metrics.backlogRevenue).toBe(75);
    expect(vm.metrics.backlogPieces).toBe(1);
  });

  it('uses explicit data-quality labels and preserves a literal Άλλο category', () => {
    const uncategorized = product('BLANK', '');
    const literalOther = product('OTHER', 'Άλλο');
    expect(resolveCustomerAnalyticsCategory('MISSING', null)).toBe('Μη αντιστοιχισμένο προϊόν');
    expect(resolveCustomerAnalyticsCategory('BLANK', uncategorized)).toBe('Μη κατηγοριοποιημένο');
    expect(resolveCustomerAnalyticsCategory('SP', null)).toBe('Ειδική δημιουργία');
    expect(resolveCustomerAnalyticsCategory('OTHER', literalOther)).toBe('Άλλο');

    const vm = buildCustomerAnalytics({
      customer,
      allOrders: [order('o1', '2026-05-01T00:00:00.000Z')],
      realizedEvents: [
        event('MISSING', '2026-05-01T00:00:00.000Z'),
        event('BLANK', '2026-05-01T00:00:00.000Z'),
        event('SP', '2026-05-01T00:00:00.000Z'),
        event('OTHER', '2026-05-01T00:00:00.000Z'),
      ],
      backlogEvents: [],
      products: [uncategorized, literalOther],
      period: 'all',
      now: new Date('2026-07-01T00:00:00.000Z'),
    });

    expect(vm.categories.map(row => row.name)).toEqual(expect.arrayContaining([
      'Μη αντιστοιχισμένο προϊόν',
      'Μη κατηγοριοποιημένο',
      'Ειδική δημιουργία',
      'Άλλο',
    ]));
    expect(vm.dataQuality).toHaveLength(2);
  });

  it('calculates personalized health from median order cadence', () => {
    const active = buildCustomerAnalytics({
      customer,
      allOrders: [
        order('o1', '2026-01-01T00:00:00.000Z'),
        order('o2', '2026-02-01T00:00:00.000Z'),
        order('o3', '2026-03-01T00:00:00.000Z'),
      ],
      realizedEvents: [],
      backlogEvents: [],
      products: [],
      period: 'all',
      now: new Date('2026-04-01T00:00:00.000Z'),
    });
    const atRisk = buildCustomerAnalytics({
      customer,
      allOrders: active.behavior.orderCount ? [
        order('o1', '2026-01-01T00:00:00.000Z'),
        order('o2', '2026-02-01T00:00:00.000Z'),
        order('o3', '2026-03-01T00:00:00.000Z'),
      ] : [],
      realizedEvents: [],
      backlogEvents: [],
      products: [],
      period: 'all',
      now: new Date('2026-09-01T00:00:00.000Z'),
    });

    expect(active.health.state).toBe('active');
    expect(active.health.typicalCadenceDays).toBe(30);
    expect(atRisk.health.state).toBe('risk');
  });

  it('groups product and variant performance and sorts by the selected success metric', () => {
    const p = product('A1', 'Δαχτυλίδι');
    p.variants = [{ suffix: 'X', description: 'Χρυσό', stock_qty: 0 }];
    const vm = buildCustomerAnalytics({
      customer,
      allOrders: [order('o1', '2026-06-01T00:00:00.000Z')],
      realizedEvents: [
        event('A1', '2026-06-02T00:00:00.000Z', { orderId: 'o1', variantSuffix: 'X', profit: 40, quantity: 4 }),
        event('B1', '2026-06-03T00:00:00.000Z', { orderId: 'o1', profit: 160, net: 300 }),
      ],
      backlogEvents: [],
      products: [p, product('B1', 'Βραχιόλι')],
      period: '12m',
      now: new Date('2026-07-01T00:00:00.000Z'),
    });

    expect(vm.variants.find(row => row.sku === 'A1')?.label).toContain('Χρυσό');
    expect(sortCustomerPerformanceRows(vm.products, 'profit')[0].sku).toBe('B1');
    expect(sortCustomerPerformanceRows(vm.products, 'quantity')[0].sku).toBe('A1');
  });

  it('groups SP performance by normalized note and names the creation in the headline', () => {
    const vm = buildCustomerAnalytics({
      customer,
      allOrders: [order('sp-order', '2026-06-01T00:00:00.000Z', 'SP')],
      realizedEvents: [
        event('SP', '2026-06-02T00:00:00.000Z', { orderId: 'sp-order', itemNote: '  Μονόγραμμα   με πέτρα ', quantity: 1, profit: 100 }),
        event('SP', '2026-06-03T00:00:00.000Z', { orderId: 'sp-order', itemNote: 'μονόγραμμα με ΠΈΤΡΑ', quantity: 2, profit: 120 }),
        event('SP', '2026-06-04T00:00:00.000Z', { orderId: 'sp-order', itemNote: null, quantity: 1, profit: 10 }),
      ],
      backlogEvents: [],
      products: [],
      period: '12m',
      now: new Date('2026-07-01T00:00:00.000Z'),
    });

    expect(vm.products).toHaveLength(2);
    expect(vm.products.find(row => row.itemNote?.includes('Μονόγραμμα'))).toMatchObject({ quantity: 3 });
    expect(vm.products.find(row => row.itemNote == null)).toMatchObject({ quantity: 1 });
    expect(vm.headline).toContain('Μονόγραμμα');
  });

  it('creates reorder, backlog, reactivation, margin, and peer cross-sell opportunities with evidence', () => {
    const clientOrders = [
      order('o1', '2025-01-01T00:00:00.000Z', 'A1'),
      order('o2', '2025-02-01T00:00:00.000Z', 'A1'),
    ];
    const peerOrders = ['p1', 'p2', 'p3'].map((id, index) => order(id, `2026-0${index + 1}-01T00:00:00.000Z`, 'C1', {
      customer_id: id,
      customer_name: `Peer ${index}`,
    }));
    const vm = buildCustomerAnalytics({
      customer,
      allOrders: [...clientOrders, ...peerOrders],
      realizedEvents: [event('A1', '2025-02-02T00:00:00.000Z', { profit: -20, estimatedCost: 220 })],
      backlogEvents: [event('A1', '2025-02-02T00:00:00.000Z', { source: 'backlog', net: 50 })],
      products: [product('A1', 'Δαχτυλίδι'), product('C1', 'Δαχτυλίδι')],
      period: 'all',
      now: new Date('2026-07-01T00:00:00.000Z'),
    });

    expect(vm.opportunities.map(row => row.type)).toEqual(expect.arrayContaining([
      'reactivation',
      'backlog',
      'reorder',
      'margin',
      'cross_sell',
    ]));
    expect(vm.opportunities.every(row => row.reason.length > 20)).toBe(true);
  });

  it('suppresses person-level recommendations for the retail system customer', () => {
    const vm = buildCustomerAnalytics({
      customer,
      allOrders: [order('o1', '2024-01-01T00:00:00.000Z')],
      realizedEvents: [],
      backlogEvents: [],
      products: [],
      period: 'all',
      now: new Date('2026-07-01T00:00:00.000Z'),
      isRetailSystemCustomer: true,
    });

    expect(vm.opportunities.some(row => row.type === 'reactivation' || row.type === 'reorder' || row.type === 'cross_sell')).toBe(false);
  });
});
