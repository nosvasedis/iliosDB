import { describe, expect, it } from 'vitest';
import { MaterialType, OrderStatus, Gender, PlatingType, ProductionType, type Product, type Material, type Order } from '../../types';
import { createRecipeResourceResolver, resourceUnit, summarizeResourceQuantities } from '../../features/finance/resourceQuantities';
import { buildFinanceAnalytics, type FinanceLineEvent } from '../../utils/financeAnalytics';

const materials: Material[] = [
  { id: 'stone', name: 'Ζιργκόν', description: '3mm', type: MaterialType.Stone, unit: 'τεμ', cost_per_unit: 0.2, stones_per_strand: 100 },
  { id: 'cord', name: 'Κορδόνι', type: MaterialType.Cord, unit: 'm', cost_per_unit: 1 },
  { id: 'clasp', name: 'Κούμπωμα', type: MaterialType.Component, unit: 'τεμ.', cost_per_unit: 1 },
];
function product(sku: string, recipe: Product['recipe'] = [], is_component = false): Product {
  return { sku, recipe, is_component, prefix: is_component ? 'STX' : 'DA', category: 'Δαχτυλίδι', gender: Gender.Women, image_url: null, weight_g: 1, plating_type: PlatingType.None, production_type: ProductionType.InHouse, active_price: 5, draft_price: 5, selling_price: 10, stock_qty: 0, sample_qty: 0, molds: [], labor: { casting_cost: 0, setter_cost: 0, technician_cost: 0, stone_setting_cost: 0, plating_cost_x: 0, plating_cost_d: 0, subcontract_cost: 0 } };
}
const products = [
  product('DA001', [{ type: 'raw', id: 'stone', quantity: 1 }, { type: 'raw', id: 'cord', quantity: 0.25 }, { type: 'raw', id: 'clasp', quantity: 1 }, { type: 'component', sku: 'STX001', quantity: 2 }]),
  product('STX001', [{ type: 'component', sku: 'STX002', quantity: 3 }], true),
  product('STX002', [{ type: 'raw', id: 'stone', quantity: 4 }], true),
];

describe('finance resource quantities', () => {
  it('keeps missing units unknown and does not turn metres or grams into pieces', () => {
    expect(resourceUnit(null)).toBe('μον.');
    expect(resourceUnit(undefined)).toBe('μον.');
    expect(resourceUnit(' τεμ ')).toBe('τεμ.');
    expect(resourceUnit('m')).toBe('m');
    expect(resourceUnit('g')).toBe('g');
  });
  it('counts stones separately from cords/clasps, expands nested STX and retains native units', () => {
    const resolve = createRecipeResourceResolver(products, materials);
    expect(resolve('DA001')).toBe(resolve('DA001'));
    const events = [
      { sku: 'DA001', variantSuffix: 'X', quantity: 2, recipeResources: resolve('DA001') },
      { sku: 'DA001', variantSuffix: 'P', quantity: 1, recipeResources: resolve('DA001') },
    ] as FinanceLineEvent[];
    const report = summarizeResourceQuantities(events);
    expect(report.stonePieces).toBe(75); // (1 + 2 * 3 * 4) * 3; never multiply by stones_per_strand again.
    expect(report.componentPieces).toBe(24); // 6 STX001 and 18 STX002, shown separately from stones.
    expect(report.rows.find((row) => row.id === 'cord')).toMatchObject({ quantity: 0.75, unit: 'm', kind: 'material' });
    expect(report.rows.find((row) => row.id === 'clasp')).toMatchObject({ quantity: 3, kind: 'material' });
    expect(report.rows.find((row) => row.id === 'stone')?.products).toEqual([
      { sku: 'DA001', variantSuffix: 'P', pieces: 1, quantity: 25 },
      { sku: 'DA001', variantSuffix: 'X', pieces: 2, quantity: 50 },
    ]);
    expect(report.warnings).toEqual([]);
    expect(resolve('STX001').items.find((row) => row.id === 'STX001')?.quantity).toBe(1);
  });

  it('handles shared components on distinct paths without mistaking them for cycles', () => {
    const shared = product('STX003', [{ type: 'component', sku: 'STX002', quantity: 5 }], true);
    const root = product('DA002', [{ type: 'component', sku: 'STX001', quantity: 2 }, { type: 'component', sku: 'STX003', quantity: 1 }]);
    const result = createRecipeResourceResolver([...products, root, shared], materials)('DA002');
    expect(result.items.find((item) => item.id === 'stone')?.quantity).toBe(44);
    expect(result.warnings).toEqual([]);
  });

  it('reports cycles, missing references and invalid recipes instead of silently claiming complete counts', () => {
    const bad = product('BAD', [{ type: 'component', sku: 'BAD', quantity: 1 }, { type: 'component', sku: 'MISSING', quantity: 2 }, { type: 'raw', id: 'missing', quantity: 1 }, { type: 'raw', id: 'stone', quantity: -1 }, { type: 'raw', id: 'stone', quantity: NaN }, { type: 'raw', id: 'stone', quantity: 0 }, { type: 'raw', id: 'cord', quantity: 0.1 }]);
    const result = createRecipeResourceResolver([bad], materials)('BAD');
    expect(result.warnings).toHaveLength(4);
    expect(result.items.find((item) => item.id === 'cord')?.quantity).toBe(0.1);
    expect(result.items.some((item) => item.id === 'stone')).toBe(false);
    expect(createRecipeResourceResolver([], [])('DELETED').warnings).toHaveLength(1);
  });

  it('expands deep component recipes without a recursion depth cutoff', () => {
    const chain = Array.from({ length: 1000 }, (_, i) => product(`STX${i}`, i === 999 ? [{ type: 'raw', id: 'stone', quantity: 2 }] : [{ type: 'component', sku: `STX${i + 1}`, quantity: 1 }], true));
    const resolved = createRecipeResourceResolver(chain, materials)('STX0');
    expect(resolved.items.find((item) => item.id === 'stone')?.quantity).toBe(2);
    expect(resolved.warnings).toEqual([]);
  });

  it('invalidates catalogue-scoped caches and never infers missing/SP quantities from euro costs', () => {
    const oldResolve = createRecipeResourceResolver(products, materials);
    const changed = products.map((item) => item.sku === 'STX002' ? { ...item, recipe: [{ type: 'raw' as const, id: 'stone', quantity: 5 }] } : item);
    expect(createRecipeResourceResolver(changed, materials)('DA001').items.find((item) => item.id === 'stone')?.quantity).toBe(31);
    expect(oldResolve('DA001').items.find((item) => item.id === 'stone')?.quantity).toBe(25);
    const report = summarizeResourceQuantities([{ sku: 'SP', quantity: 10, estimatedCost: 500 } as FinanceLineEvent]);
    expect(report.rows).toEqual([]);
    expect(report.warnings).toHaveLength(1);
  });

  it('uses the finance shipment scope, deduplication, canonical SKU and pending quantities without changing money', () => {
    const order = { id: 'order', customer_name: 'Πελάτης', created_at: '2026-03-01T10:00:00Z', status: OrderStatus.PartiallyDelivered, items: [{ sku: 'DA001', variant_suffix: 'X', quantity: 5, price_at_order: 10, line_id: 'line' }], total_price: 50 } as Order;
    const input = {
      orders: [order, { ...order, id: 'cancelled', status: OrderStatus.Cancelled }], products, materials,
      settings: { silver_price_gram: 1, loss_percentage: 0, barcode_width_mm: 50, barcode_height_mm: 30, retail_barcode_width_mm: 72, retail_barcode_height_mm: 10, last_calc_silver_price: 1 },
      shipments: [{ id: 'ship', order_id: 'order', shipment_number: 1, shipped_at: '2026-03-05T10:00:00Z', shipped_by: 'admin', created_at: '2026-03-05T10:00:00Z' }],
      shipmentItems: [{ id: 'item', shipment_id: 'ship', sku: 'DA001', variant_suffix: 'X', quantity: 2, price_at_order: 10, line_id: 'line' }],
      period: { mode: 'all_time' as const }, now: new Date('2026-03-10T10:00:00Z'),
    };
    const stats = buildFinanceAnalytics(input);
    expect(stats.resourceQuantities.stonePieces).toBe(50);
    expect(stats.backlogResourceQuantities.stonePieces).toBe(75);
    expect(stats.totals.realizedNet).toBe(20);
    expect(stats.totals.backlogNet).toBe(30);
    expect(stats.resourceQuantities.rows.find((row) => row.id === 'stone')?.products[0].variantSuffix).toBe('X');
    const duplicated = buildFinanceAnalytics({ ...input, shipmentItems: [...input.shipmentItems, { ...input.shipmentItems[0], id: 'duplicate' }] });
    expect(duplicated.resourceQuantities.stonePieces).toBe(50);
    // Short periods intentionally fall back to the latest active month in the existing finance UI.
    const outsidePeriod = buildFinanceAnalytics({ ...input, period: { mode: 'current_year' }, now: new Date('2027-04-10T10:00:00Z') });
    expect(outsidePeriod.resourceQuantities.stonePieces).toBe(0);
    expect(outsidePeriod.backlogResourceQuantities.stonePieces).toBe(75);
  });
});

describe('special creations', () => {
    it('treats SP lines as recipe-less by design: counted pieces, no missing-recipe warning', () => {
        const order = { id: 'sp-order', customer_name: 'Πελάτης', created_at: '2026-03-01T10:00:00Z', status: OrderStatus.Delivered, total_price: 0,
            items: [{ sku: 'SP', quantity: 3, price_at_order: 40, notes: 'Ειδικό δαχτυλίδι', line_id: 'sp' }, { sku: 'DA001', variant_suffix: 'X', quantity: 1, price_at_order: 10, line_id: 'da' }] } as Order;
        const stats = buildFinanceAnalytics({
            orders: [order], products, materials,
            settings: { silver_price_gram: 1, loss_percentage: 0, barcode_width_mm: 50, barcode_height_mm: 30, retail_barcode_width_mm: 72, retail_barcode_height_mm: 10, last_calc_silver_price: 1 },
            shipments: [], shipmentItems: [], period: { mode: 'all_time' as const }, now: new Date('2026-03-10T10:00:00Z'),
        });
        expect(stats.resourceQuantities.warnings).toEqual([]);
        expect(stats.resourceQuantities.pieces).toBe(4);
        expect(stats.resourceQuantities.stonePieces).toBe(25);
    });
});
