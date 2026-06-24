import { describe, expect, it } from 'vitest';
import { Gender, ProductionType } from '../../types';
import {
  buildCategoryChartData,
  buildFinishChartData,
  buildGenderChartData,
  buildTopCustomerRows,
  buildTopVariantRows,
} from '../../features/dashboard/dashboardAnalysisViewModels';
import type { FinanceLineEvent, FinanceVariantRanking } from '../../utils/financeAnalytics';

function event(overrides: Partial<FinanceLineEvent>): FinanceLineEvent {
  return {
    source: 'shipment',
    orderId: 'order-1',
    date: '2026-03-01T10:00:00.000Z',
    customerName: 'Πελάτης',
    sellerCommissionPercent: 0,
    sku: 'SKU',
    quantity: 1,
    unitPrice: 100,
    subtotal: 100,
    discount: 0,
    net: 100,
    vat: 0,
    gross: 100,
    estimatedUnitCost: 10,
    estimatedCost: 10,
    profit: 90,
    margin: 90,
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

const products = [
  {
    sku: 'RING-W',
    prefix: 'RW',
    category: 'Δαχτυλίδι',
    gender: Gender.Women,
    image_url: null,
    weight_g: 5,
    plating_type: 'None' as const,
    production_type: ProductionType.InHouse,
    active_price: 10,
    draft_price: 10,
    selling_price: 30,
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
    collections: [],
  },
  {
    sku: 'RING-M',
    prefix: 'RM',
    category: 'Δαχτυλίδι',
    gender: Gender.Men,
    image_url: null,
    weight_g: 5,
    plating_type: 'None' as const,
    production_type: ProductionType.InHouse,
    active_price: 10,
    draft_price: 10,
    selling_price: 30,
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
    collections: [],
  },
];

describe('dashboardAnalysisViewModels', () => {
  it('buildGenderChartData groups realized sales by product gender', () => {
    const data = buildGenderChartData(
      [
        event({ sku: 'RING-W', quantity: 3 }),
        event({ sku: 'RING-M', quantity: 2 }),
      ],
      products,
    );

    expect(data).toEqual([
      { name: 'Γυναικεία', value: 3 },
      { name: 'Ανδρικά', value: 2 },
    ]);
  });

  it('buildFinishChartData groups realized sales by finish label', () => {
    const data = buildFinishChartData(
      [
        event({ sku: 'RING-W', variantSuffix: 'X', quantity: 2 }),
        event({ sku: 'RING-W', variantSuffix: '', quantity: 1 }),
      ],
      products,
    );

    expect(data).toEqual([
      { name: 'Επίχρυσο', value: 2 },
      { name: 'Λουστρέ', value: 1 },
    ]);
  });

  it('buildCategoryChartData respects gender filter', () => {
    const events = [
      event({ sku: 'RING-W', category: 'Δαχτυλίδι', quantity: 4 }),
      event({ sku: 'RING-M', category: 'Βραχιόλι', quantity: 2 }),
    ];

    expect(buildCategoryChartData(events, products, Gender.Women)).toEqual([
      { name: 'Δαχτυλίδι', value: 4 },
    ]);
    expect(buildCategoryChartData(events, products, 'All')).toEqual([
      { name: 'Δαχτυλίδι', value: 4 },
      { name: 'Βραχιόλι', value: 2 },
    ]);
  });

  it('buildTopVariantRows sorts by quantity and attaches gender', () => {
    const rankings: FinanceVariantRanking[] = [
      { sku: 'RING-W', variantSuffix: 'X', image: null, category: 'Δαχτυλίδι', revenue: 100, estimatedCost: 10, profit: 90, margin: 90, quantity: 1 },
      { sku: 'RING-W', variantSuffix: 'P', image: null, category: 'Δαχτυλίδι', revenue: 300, estimatedCost: 30, profit: 270, margin: 90, quantity: 3 },
    ];

    const rows = buildTopVariantRows(rankings, products, 8);
    expect(rows[0].variantSuffix).toBe('P');
    expect(rows[0].gender).toBe(Gender.Women);
  });

  it('buildTopCustomerRows slices to limit', () => {
    const customers = [
      { id: 'c1', name: 'Alpha', revenue: 300, orders: 2 },
      { id: 'c2', name: 'Beta', revenue: 200, orders: 1 },
      { id: 'c3', name: 'Gamma', revenue: 100, orders: 1 },
    ];

    expect(buildTopCustomerRows(customers, 2)).toHaveLength(2);
    expect(buildTopCustomerRows(customers, 2)[0].name).toBe('Alpha');
  });
});
