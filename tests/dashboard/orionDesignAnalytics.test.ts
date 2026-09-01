import { describe, expect, it } from 'vitest';
import { Gender, PlatingType, ProductionType, type Collection, type Mold, type Product } from '../../types';
import type { FinanceLineEvent } from '../../utils/financeAnalytics';
import {
  aggregateOrionDesignRankings,
  filterEventsForOrionDesign,
  parseOrionDesignFromSku,
  resolveOrionDesignName,
  shouldShowOrionDesignView,
} from '../../features/dashboard/orionDesignAnalytics';
import { createEmptySkuModalFilters } from '../../features/dashboard/skuModalFilters';

function product(overrides: Partial<Product>): Product {
  return {
    sku: 'RN315',
    prefix: 'RN',
    category: 'Δαχτυλίδι',
    gender: Gender.Men,
    image_url: null,
    weight_g: 5,
    plating_type: PlatingType.None,
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
    ...overrides,
  };
}

function event(overrides: Partial<FinanceLineEvent>): FinanceLineEvent {
  return {
    source: 'shipment',
    orderId: 'order-1',
    date: '2026-03-01T10:00:00.000Z',
    customerName: 'Alpha',
    sellerCommissionPercent: 0,
    sku: 'RN315',
    variantSuffix: 'X',
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
    collectionId: 6,
    collectionName: 'Ωρίων',
    productImage: null,
    silverWeight: 5,
    costBreakdown: { silver: 5, labor: 3, materials: 2 },
    priceOverride: false,
    ...overrides,
  };
}

const orion: Collection[] = [{ id: 6, name: 'Ωρίων' }];
const ilios: Collection[] = [{ id: 22, name: 'Ilios' }];

describe('parseOrionDesignFromSku', () => {
  it('reads design 15 from RN/PN/XR hundreds cores', () => {
    expect(parseOrionDesignFromSku('RN315')).toMatchObject({ designNo: 15, type: 'ring' });
    expect(parseOrionDesignFromSku('PN615')).toMatchObject({ designNo: 15, type: 'pendant' });
    expect(parseOrionDesignFromSku('XR615')).toMatchObject({ designNo: 15, type: 'bracelet' });
    expect(parseOrionDesignFromSku('PN815N')).toMatchObject({ designNo: 15, type: 'pendant' });
  });

  it('accepts future design 99 and Greek prefixes', () => {
    expect(parseOrionDesignFromSku('RN399')?.designNo).toBe(99);
    expect(parseOrionDesignFromSku('\u03A1\u039D315')?.type).toBe('ring');
  });

  it('excludes Ilios 12 and Ψαλμός 19/20, plus design 00', () => {
    expect(parseOrionDesignFromSku('PN812')).toBeNull();
    expect(parseOrionDesignFromSku('RN312')).toBeNull();
    expect(parseOrionDesignFromSku('RN319')).toBeNull();
    expect(parseOrionDesignFromSku('RN420')).toBeNull();
    expect(parseOrionDesignFromSku('RN300')).toBeNull();
    expect(parseOrionDesignFromSku('DA152')).toBeNull();
  });
});

describe('resolveOrionDesignName', () => {
  it('takes the motif from the Ωρίων λάστιχο and ignores βάση / σφραγίδα', () => {
    const products = [
      product({
        sku: 'XR615',
        molds: [
          { code: 'L1005B', quantity: 1 },
          { code: 'L788', quantity: 1 },
        ],
      }),
      product({
        sku: 'RN315',
        molds: [
          { code: 'L1005B', quantity: 1 },
          { code: 'L696', quantity: 1 },
        ],
      }),
    ];
    const molds: Mold[] = [
      { code: 'L1005B', location: '', description: 'Περικεφαλαία Ωρίων 600' },
      { code: 'L788', location: '', description: 'Σφραγίδα Ilios Μακραμέ' },
      { code: 'L696', location: '', description: 'Βάση Ωρίων 300' },
    ];
    expect(resolveOrionDesignName(15, products, molds)).toBe('Περικεφαλαία');
  });

  it('falls back to Παράσταση NN when no motif λάστιχο exists', () => {
    expect(resolveOrionDesignName(21, [], [])).toBe('Παράσταση 21');
  });
});

describe('shouldShowOrionDesignView', () => {
  it('shows when Ωρίων is the only selected collection', () => {
    const filters = createEmptySkuModalFilters();
    filters.collections.add('6');
    expect(shouldShowOrionDesignView(filters, [event({})], orion)).toBe(true);
  });

  it('shows when no collection filter and every sale is Ωρίων', () => {
    const filters = createEmptySkuModalFilters();
    expect(shouldShowOrionDesignView(filters, [event({}), event({ sku: 'XR615' })], orion)).toBe(true);
  });

  it('hides when another collection is mixed in', () => {
    const filters = createEmptySkuModalFilters();
    const mixed = [
      event({}),
      event({ sku: 'DA152', collectionId: 22, collectionName: 'Ilios' }),
    ];
    expect(shouldShowOrionDesignView(filters, mixed, [...orion, ...ilios])).toBe(false);
  });
});

describe('aggregateOrionDesignRankings', () => {
  const products = [
    product({ sku: 'RN315', image_url: 'rn.jpg', molds: [{ code: 'L1005B', quantity: 1 }] }),
    product({ sku: 'XR615', image_url: 'xr.jpg', molds: [{ code: 'L1005B', quantity: 1 }] }),
    product({ sku: 'PN315', molds: [{ code: 'L990', quantity: 1 }] }),
    product({ sku: 'PN812', molds: [{ code: 'OTHER', quantity: 1 }] }),
  ];
  const molds: Mold[] = [
    { code: 'L1005B', location: '', description: 'Περικεφαλαία Ωρίων 600' },
    { code: 'L990', location: '', description: 'Περικεφαλαία Ωρίων 300' },
    { code: 'OTHER', location: '', description: 'Something else' },
  ];

  it('ranks a παράσταση across rings, bracelets and pendants and ignores 12', () => {
    const events = [
      event({ sku: 'RN315', quantity: 2, net: 200, profit: 160, estimatedCost: 40 }),
      event({ sku: 'XR615', quantity: 3, net: 300, profit: 240, estimatedCost: 60, category: 'Βραχιόλι με Πέτρες' }),
      event({ sku: 'PN315', quantity: 1, net: 50, profit: 40, estimatedCost: 10, category: 'Μενταγιόν' }),
      event({ sku: 'PN812', quantity: 9, net: 900, profit: 100, estimatedCost: 10, category: 'Μενταγιόν' }),
      event({ sku: 'RN319', quantity: 4, net: 80, profit: 10, estimatedCost: 10 }),
      event({ sku: 'XR620', quantity: 4, net: 80, profit: 10, estimatedCost: 10, category: 'Βραχιόλι με Πέτρες' }),
    ];
    const rows = aggregateOrionDesignRankings(events, products, molds, new Set(), 'quantity');
    expect(rows.map((row) => row.designNo)).toEqual([15]);
    expect(rows[0].name).toBe('Περικεφαλαία');
    expect(rows[0].quantity).toBe(6);
    expect(rows[0].revenue).toBe(550);
    expect(rows[0].typeMix.ring.quantity).toBe(2);
    expect(rows[0].typeMix.bracelet.quantity).toBe(3);
    expect(rows[0].typeMix.pendant.quantity).toBe(1);
    expect(rows[0].image).toBe('xr.jpg');
  });

  it('limits ranking to selected jewellery types', () => {
    const events = [
      event({ sku: 'RN315', quantity: 2, net: 200, profit: 160, estimatedCost: 40 }),
      event({ sku: 'XR615', quantity: 8, net: 800, profit: 640, estimatedCost: 160, category: 'Βραχιόλι με Πέτρες' }),
    ];
    const rings = aggregateOrionDesignRankings(events, products, molds, new Set(['ring']), 'quantity');
    expect(rings[0].quantity).toBe(2);
    const bracelets = aggregateOrionDesignRankings(events, products, molds, new Set(['bracelet']), 'quantity');
    expect(bracelets[0].quantity).toBe(8);
  });

  it('accepts future designs 26–99 from λάστιχο names', () => {
    const products = [product({ sku: 'XR626', image_url: 'xr.jpg', molds: [{ code: 'L2000', quantity: 1 }] })];
    const molds: Mold[] = [{ code: 'L2000', location: '', description: 'Νέα μορφή Ωρίων 600' }];
    const rows = aggregateOrionDesignRankings(
      [event({ sku: 'XR626', quantity: 1, net: 40, profit: 20, estimatedCost: 20 })],
      products,
      molds,
      new Set(),
      'quantity',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].designNo).toBe(26);
    expect(rows[0].name).toBe('Νέα μορφή');
  });
});
