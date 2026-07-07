import { describe, expect, it } from 'vitest';
import { Gender, PlatingType, ProductionType, type Product, type SupplierOrderItem } from '../../types';
import { getPurchaseOrderLinePresentation, shouldShowPurchaseOrderSizeInput } from '../../features/suppliers/purchaseOrderPresentation';

const baseProduct: Product = {
  sku: 'DM001',
  prefix: 'DM',
  category: 'Ring',
  gender: Gender.Women,
  image_url: 'https://example.com/ring.jpg',
  weight_g: 0,
  plating_type: PlatingType.None,
  production_type: ProductionType.Imported,
  supplier_id: 'supplier-1',
  supplier_sku: 'SUP-DM001',
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

const baseItem: SupplierOrderItem = {
  id: 'line-1',
  item_type: 'Product',
  item_id: 'DM001',
  item_name: 'DM001XKR',
  quantity: 2,
  unit_cost: 0,
  total_cost: 0,
};

describe('purchase order presentation helpers', () => {
  it('builds supplier-aware display metadata for product lines', () => {
    expect(getPurchaseOrderLinePresentation(baseItem, baseProduct)).toMatchObject({
      imageUrl: 'https://example.com/ring.jpg',
      supplierRef: 'SUP-DM001',
      description: expect.stringContaining('Επίχρυσο'),
      finishStyle: 'bg-amber-100 text-amber-800 border-amber-200',
    });
  });

  it('marks ring-like product lines as size-editable', () => {
    expect(shouldShowPurchaseOrderSizeInput(baseProduct, baseItem)).toBe(true);
  });

  it('uses a neutral material presentation without product metadata', () => {
    expect(getPurchaseOrderLinePresentation({ ...baseItem, item_type: 'Material', item_name: 'Chain' })).toMatchObject({
      imageUrl: null,
      supplierRef: null,
      description: 'Υλικό',
      finishStyle: 'bg-slate-50 text-slate-800 border-slate-200',
    });
  });
});
