import { describe, expect, it } from 'vitest';
import { Gender, ProductionType, type Product } from '../../types';
import {
  defaultRequirementSelectionIds,
  mergeManyNeedsWithCustomerFilter,
  purchaseOrderFilterFromTab,
} from '../../utils/supplierOrderCustomerFilter';

const product = {
  sku: 'IMP001', prefix: 'IMP', category: 'Ring', gender: Gender.Unisex, image_url: null, weight_g: 0,
  plating_type: 'None', production_type: ProductionType.Imported, supplier_id: 's1', active_price: 0,
  draft_price: 0, selling_price: 0, stock_qty: 0, sample_qty: 0, molds: [], is_component: false,
  recipe: [], labor: { casting_cost: 0, setter_cost: 0, technician_cost: 0, stone_setting_cost: 0, plating_cost_x: 0, plating_cost_d: 0, subcontract_cost: 0 },
} as Product;

const need = {
  sku: product.sku,
  variant: 'X',
  totalQty: 5,
  product,
  requirements: [
    { id: 'a', sourceType: 'customer_order' as const, sourceId: 'a', orderId: 'o1', customer: 'Alpha', quantity: 2 },
    { id: 'b', sourceType: 'customer_order' as const, sourceId: 'b', orderId: 'o2', customer: 'Beta', quantity: 3 },
  ],
};

describe('supplier-order customer selections', () => {
  it('uses stable requirement ids for customer filters', () => {
    const filter = purchaseOrderFilterFromTab('exclude', new Set(['alpha']));
    expect([...defaultRequirementSelectionIds(need, filter)]).toEqual(['b']);
  });

  it('makes add-all respect an explicit per-row deselection', () => {
    const items = mergeManyNeedsWithCustomerFilter(
      [],
      [need],
      purchaseOrderFilterFromTab('all', new Set()),
      { row: ['b'] },
      () => 'row',
    );

    expect(items[0].quantity).toBe(3);
    expect(items[0].source_allocations?.map((allocation) => allocation.source_id)).toEqual(['b']);
  });
});

