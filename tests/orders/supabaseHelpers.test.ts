import { describe, expect, it } from 'vitest';
import { Gender, Product, ProductionType } from '../../types';
import {
  buildOrderShipmentItemKey,
  buildStockDeductionEntries,
  checkStockForOrderItems,
  getOrderShipmentsSnapshotFromTables,
} from '../../features/orders/supabaseHelpers';

const product = {
  sku: 'PN1',
  prefix: 'PN',
  category: 'Βραχιόλι',
  gender: Gender.Women,
  image_url: null,
  weight_g: 1,
  plating_type: 'None',
  production_type: ProductionType.InHouse,
  active_price: 0,
  draft_price: 0,
  selling_price: 50,
  stock_qty: 7,
  sample_qty: 0,
  is_component: false,
  variants: [
    { suffix: 'X', description: 'Gold', stock_qty: 4, stock_by_size: { '52': 2 } },
  ],
  recipe: [],
  molds: [],
  labor: {
    casting_cost: 0,
    setter_cost: 0,
    technician_cost: 0,
    stone_setting_cost: 0,
    plating_cost_x: 0,
    plating_cost_d: 0,
    subcontract_cost: 0,
  },
  created_at: '2024-01-01T00:00:00.000Z',
} as Product;

describe('orders supabase helpers', () => {
  it('builds stable shipment keys and snapshots', () => {
    const key = buildOrderShipmentItemKey('PN1', 'X', '52', null, null, 'line-1');
    expect(key).toContain('PN1::X::52');
    expect(key).toContain('lid:line-1');

    const snapshot = getOrderShipmentsSnapshotFromTables(
      [
        { id: 's1', order_id: 'o1', shipment_number: 2, shipped_at: '2024-01-02T00:00:00.000Z', shipped_by: 'A', created_at: '2024-01-02T00:00:00.000Z' },
        { id: 's2', order_id: 'o1', shipment_number: 1, shipped_at: '2024-01-01T00:00:00.000Z', shipped_by: 'A', created_at: '2024-01-01T00:00:00.000Z' },
      ] as any,
      [
        { id: 'i1', shipment_id: 's2', sku: 'PN1', variant_suffix: '', quantity: 1, price_at_order: 10 },
        { id: 'i2', shipment_id: 's1', sku: 'PN1', variant_suffix: 'X', quantity: 2, price_at_order: 20 },
      ] as any,
      'o1',
    );

    expect(snapshot.shipments.map((s) => s.id)).toEqual(['s2', 's1']);
    expect(snapshot.items.map((i) => i.id)).toEqual(['i1', 'i2']);
  });

  it('checks stock and plans deductions from stock-held items', () => {
    const stock = checkStockForOrderItems(
      [
        { sku: 'PN1', variant: null, qty: 2 },
        { sku: 'PN1', variant: 'X', qty: 1, size_info: '52' },
      ],
      [product],
    );

    expect(stock).toEqual([
      expect.objectContaining({ sku: 'PN1', available_in_stock: 7 }),
      expect.objectContaining({ sku: 'PN1', variant_suffix: 'X', available_in_stock: 2 }),
    ]);

    const entries = buildStockDeductionEntries('order-1234567890', [
      { sku: 'PN1', variant_suffix: null, qty: 2 },
      { sku: 'PN1', variant_suffix: 'X', qty: 1, size_info: '52' },
    ], [product]);

    expect(entries).toEqual([
      expect.objectContaining({
        table: 'products',
        match: { sku: 'PN1' },
        updateData: expect.objectContaining({ stock_qty: 5 }),
      }),
      expect.objectContaining({
        table: 'product_variants',
        match: { product_sku: 'PN1', suffix: 'X' },
        updateData: expect.objectContaining({ stock_qty: 3 }),
      }),
    ]);
    expect(entries[1].movementReason).toContain('Εκτέλεση από Stock');
  });
});
