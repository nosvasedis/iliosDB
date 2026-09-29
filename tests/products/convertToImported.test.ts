import { describe, expect, it } from 'vitest';
import { Gender, PlatingType, ProductionType } from '../../types';
import { computeImportedConversion, toImportedSavePayload } from '../../features/products/convertToImported';

const settings = { silver_price_gram: 2.5 } as any;

const makeInHouseProduct = (overrides: Record<string, unknown> = {}) => ({
  sku: 'PN80',
  prefix: 'PN',
  category: 'Βραχιόλι',
  gender: Gender.Women,
  image_url: null,
  weight_g: 3,
  secondary_weight_g: 1,
  plating_type: PlatingType.None,
  production_type: ProductionType.InHouse,
  active_price: 8,
  draft_price: 8,
  selling_price: 22,
  stock_qty: 0,
  sample_qty: 0,
  is_component: false,
  skip_casting: false,
  molds: [{ code: 'L1', quantity: 1 }],
  recipe: [{ type: 'raw' as const, id: 'm1', quantity: 2 }],
  supplier_id: undefined,
  supplier_sku: undefined,
  supplier_cost: undefined,
  labor: {
    casting_cost: 0.6,
    setter_cost: 0.4,
    technician_cost: 2.1,
    stone_setting_cost: 0,
    plating_cost_x: 1.8,
    plating_cost_d: 0,
    subcontract_cost: 0.5,
    casting_cost_manual_override: true,
    technician_cost_manual_override: true,
    plating_cost_x_manual_override: true,
    plating_cost_d_manual_override: false,
  },
  variants: [
    { suffix: 'X', description: 'Επίχρυσο', stock_qty: 1, selling_price: 24, active_price: 9 },
  ],
  ...overrides,
} as any);

describe('computeImportedConversion', () => {
  it('converts in-house products to imported and clears manufacturing data', () => {
    const product = makeInHouseProduct();
    const { newProduct } = computeImportedConversion(product, settings, [], [], {
      supplierId: 's1',
      supplierSku: 'ITEM-9',
      supplierCost: 4.5,
      technicianCostPerGram: 0.8,
      platingCostPerGram: 0.6,
      stoneSettingCost: 1.2,
    });

    expect(newProduct.production_type).toBe(ProductionType.Imported);
    expect(newProduct.recipe).toEqual([]);
    expect(newProduct.molds).toEqual([]);
    expect(newProduct.supplier_id).toBe('s1');
    expect(newProduct.supplier_sku).toBe('ITEM-9');
    expect(newProduct.supplier_cost).toBe(4.5);
    expect(newProduct.selling_price).toBe(22);
    expect(newProduct.labor.casting_cost).toBe(0);
    expect(newProduct.labor.setter_cost).toBe(0);
    expect(newProduct.labor.technician_cost).toBe(0.8);
    expect(newProduct.labor.plating_cost_x).toBe(0.6);
    expect(newProduct.labor.stone_setting_cost).toBe(1.2);
    expect(newProduct.labor.casting_cost_manual_override).toBe(false);
    expect(newProduct.labor.subcontract_cost).toBe(0.5);
    expect(newProduct.variants?.[0].selling_price).toBe(24);
    expect(newProduct.variants?.[0].active_price).not.toBe(9);
  });

  it('stores null supplier fields when they are omitted', () => {
    const { newProduct } = computeImportedConversion(makeInHouseProduct(), settings, [], [], {
      supplierId: '  ',
      supplierSku: '',
    });
    expect(newProduct.supplier_id).toBeNull();
    expect(newProduct.supplier_sku).toBeNull();
    expect(newProduct.supplier_cost).toBeNull();
  });

  it('applies optional weight and clears skip_casting', () => {
    const { newProduct } = computeImportedConversion(
      makeInHouseProduct({ skip_casting: true, weight_g: 0, secondary_weight_g: 0 }),
      settings,
      [],
      [],
      { weightG: 3.2, secondaryWeightG: 0.4 },
    );
    expect(newProduct.weight_g).toBe(3.2);
    expect(newProduct.secondary_weight_g).toBe(0.4);
    expect(newProduct.skip_casting).toBe(false);
  });

  it('rejects non-in-house products and STX components', () => {
    expect(() => computeImportedConversion(
      makeInHouseProduct({ production_type: ProductionType.Imported }),
      settings,
      [],
      [],
      {},
    )).toThrow(/non-InHouse/i);
    expect(() => computeImportedConversion(
      makeInHouseProduct({ is_component: true }),
      settings,
      [],
      [],
      {},
    )).toThrow(/component/i);
  });

  it('builds a save payload that clears manufacturing fields for imported products', () => {
    const { newProduct, newCost } = computeImportedConversion(makeInHouseProduct(), settings, [], [], {
      supplierId: 's1',
      supplierSku: 'ITEM-9',
      supplierCost: 4.5,
    });
    const payload = toImportedSavePayload(newProduct, newCost.total);
    expect(payload.production_type).toBe(ProductionType.Imported);
    expect(payload.supplier_id).toBe('s1');
    expect(payload.supplier_sku).toBe('ITEM-9');
    expect(payload.supplier_cost).toBe(4.5);
    expect(payload.skip_casting).toBe(false);
    expect(payload.labor_casting).toBe(0);
  });
});
