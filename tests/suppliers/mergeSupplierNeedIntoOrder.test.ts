import { describe, expect, it } from 'vitest';
import { Gender, PlatingType, ProductionType, type Product, type SupplierOrderItem } from '../../types';
import { mergeNeedIntoItems, mergeSupplierOrderNotes, supplierOrderNotesFromRequirements } from '../../utils/mergeSupplierNeedIntoOrder';

const product: Product = {
  sku: 'BDA001',
  prefix: 'BD',
  category: 'Bracelet',
  gender: Gender.Unisex,
  image_url: null,
  weight_g: 0,
  plating_type: PlatingType.None,
  production_type: ProductionType.Imported,
  supplier_id: 'supplier-1',
  active_price: 0,
  draft_price: 0,
  selling_price: 0,
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
};

describe('supplier order note merging', () => {
  it('builds visible supplier notes from order and line notes', () => {
    expect(supplierOrderNotesFromRequirements([
      {
        orderId: 'order-1',
        customer: 'Customer A',
        quantity: 1,
        orderNote: 'Change clasp',
        itemNote: 'Use red cord',
      },
    ])).toBe('Customer A x1 - Σημείωση εντολής: Change clasp\nCustomer A x1 - Σημείωση γραμμής: Use red cord');
  });

  it('deduplicates notes when multiple needs merge into the same purchase line', () => {
    const initial: SupplierOrderItem[] = [{
      id: 'existing',
      item_type: 'Product',
      item_id: 'BDA001',
      item_name: 'BDA001X',
      quantity: 1,
      unit_cost: 0,
      total_cost: 0,
      notes: 'Customer A x1 - Σημείωση γραμμής: Use red cord',
    }];

    const merged = mergeNeedIntoItems(initial, {
      variant: 'X',
      totalQty: 2,
      product,
      requirements: [
        { orderId: 'order-1', customer: 'Customer A', quantity: 1, itemNote: 'Use red cord' },
        { orderId: 'order-2', customer: 'Customer B', quantity: 1, orderNote: 'Longer chain' },
      ],
    });

    expect(merged).toHaveLength(1);
    expect(merged[0].quantity).toBe(3);
    expect(merged[0].notes).toBe('Customer A x1 - Σημείωση γραμμής: Use red cord\nCustomer B x1 - Σημείωση εντολής: Longer chain');
  });

  it('aggregates repeated note quantities for the same customer and note text', () => {
    expect(supplierOrderNotesFromRequirements([
      { orderId: 'order-1', customer: 'Customer A', quantity: 1, itemNote: 'Use red cord' },
      { orderId: 'order-1', customer: 'Customer A', quantity: 2, itemNote: 'Use red cord' },
    ])).toBe('Customer A x3 - Σημείωση γραμμής: Use red cord');
  });

  it('keeps manually written notes while adding sourced order notes', () => {
    expect(mergeSupplierOrderNotes('Manual supplier note', 'Customer A - Order note: Rush')).toBe(
      'Manual supplier note\nCustomer A - Order note: Rush',
    );
  });
});
