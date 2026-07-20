import { describe, expect, it } from 'vitest';
import { Gender, PlatingType, ProductionType, type Product, type SupplierOrderItem } from '../../types';
import {
  filterOrderNotesFromItemNotes,
  mergeNeedIntoItems,
  mergeSupplierOrderNotes,
  normalizeSupplierItemNotesForDisplay,
  supplierOrderNotesFromRequirements,
} from '../../utils/mergeSupplierNeedIntoOrder';

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
  it('builds supplier notes from line and production notes only', () => {
    expect(supplierOrderNotesFromRequirements([
      {
        orderId: 'order-1',
        customer: 'Customer A',
        quantity: 1,
        orderNote: 'Change clasp',
        itemNote: 'Use red cord',
        productionNote: 'Rush',
      },
    ])).toBe('Customer A x1: Use red cord · Rush');
  });

  it('deduplicates identical line and production notes', () => {
    expect(supplierOrderNotesFromRequirements([
      {
        orderId: 'order-1',
        customer: 'Customer A',
        quantity: 1,
        itemNote: 'KO-PR-KO',
        productionNote: 'KO-PR-KO',
      },
    ])).toBe('Customer A x1: KO-PR-KO');
  });

  it('ignores order-level notes when building supplier line notes', () => {
    expect(supplierOrderNotesFromRequirements([
      {
        orderId: 'order-1',
        customer: 'Customer A',
        quantity: 1,
        orderNote: 'Change clasp',
      },
    ])).toBeUndefined();
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
      notes: 'Customer A x1: Use red cord',
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
    expect(merged[0].notes).toBe('Customer A x1: Use red cord');
  });

  it('aggregates repeated note quantities for the same customer and note text', () => {
    expect(supplierOrderNotesFromRequirements([
      { orderId: 'order-1', customer: 'Customer A', quantity: 1, itemNote: 'Use red cord' },
      { orderId: 'order-1', customer: 'Customer A', quantity: 2, itemNote: 'Use red cord' },
    ])).toBe('Customer A x3: Use red cord');
  });

  it('strips legacy order note lines and collapses duplicate line/production notes for print', () => {
    expect(normalizeSupplierItemNotesForDisplay(
      'Customer A x1 - Σημείωση εντολής: Change clasp\nCustomer A x1 - Σημείωση γραμμής: Use red cord',
    )).toBe('Customer A x1: Use red cord');

    expect(normalizeSupplierItemNotesForDisplay(
      'Customer A x1 - Σημείωση γραμμής: KO-PR-KO\nCustomer A x1 - Σημείωση παραγωγής: KO-PR-KO',
    )).toBe('Customer A x1: KO-PR-KO');

    expect(normalizeSupplierItemNotesForDisplay(
      'Customer A x1: KO-PR-KO · KO-PR-KO',
    )).toBe('Customer A x1: KO-PR-KO');

    expect(filterOrderNotesFromItemNotes(
      'Customer A x1 - Σημείωση γραμμής: Use red cord\nCustomer A x1 - Σημείωση παραγωγής: Rush',
    )).toBe('Customer A x1: Use red cord · Rush');
  });

  it('keeps manually written notes while adding sourced order notes', () => {
    expect(mergeSupplierOrderNotes('Manual supplier note', 'Customer A - Order note: Rush')).toBe(
      'Manual supplier note\nCustomer A - Order note: Rush',
    );
  });

  it('does not add the same smart requirement twice', () => {
    const need = {
      variant: 'X',
      totalQty: 2,
      product,
      requirements: [{
        id: 'customer_order:o1:line:l1',
        sourceType: 'customer_order' as const,
        sourceId: 'o1:line:l1',
        orderId: 'o1',
        lineId: 'l1',
        customer: 'Customer A',
        quantity: 2,
      }],
    };
    const once = mergeNeedIntoItems([], need);
    const twice = mergeNeedIntoItems(once, need);

    expect(twice).toHaveLength(1);
    expect(twice[0].quantity).toBe(2);
    expect(twice[0].source_allocations).toHaveLength(1);
  });

  it('preserves deliberate manual quantity when a smart source merges into the same line', () => {
    const initial: SupplierOrderItem[] = [{
      id: 'manual', item_type: 'Product', item_id: product.sku, item_name: `${product.sku}X`, quantity: 3,
      manual_quantity: 3, unit_cost: 0, total_cost: 0,
    }];
    const merged = mergeNeedIntoItems(initial, {
      variant: 'X', totalQty: 2, product,
      requirements: [{
        id: 'production_batch:b1', sourceType: 'production_batch', sourceId: 'b1', orderId: 'o1',
        customer: 'Customer A', quantity: 2,
      }],
    });

    expect(merged[0].manual_quantity).toBe(3);
    expect(merged[0].quantity).toBe(5);
  });
});
