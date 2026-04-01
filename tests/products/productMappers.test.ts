import { describe, expect, it } from 'vitest';
import { Gender, PlatingType, ProductionType } from '../../types';
import {
  mapCatalogProductsWithRelations,
  mapProductsWithRelations,
  resolveProductImageUrl,
} from '../../features/products/mappers';

describe('product mappers', () => {
  it('resolves image urls and maps full product rows', () => {
    expect(resolveProductImageUrl('uploads/foo.jpg', 'https://cdn.example.com')).toBe('https://cdn.example.com/foo.jpg');

    const products = mapProductsWithRelations(
      [
        {
          sku: 'PN1',
          prefix: 'PN',
          category: 'Βραχιόλι',
          gender: Gender.Women,
          image_url: 'uploads/foo.jpg',
          weight_g: 2,
          plating_type: PlatingType.None,
          production_type: ProductionType.InHouse,
          active_price: 10,
          draft_price: 11,
          selling_price: 12,
          stock_qty: 5,
          sample_qty: 1,
          is_component: false,
          suppliers: { name: 'Sup' },
          labor_casting: 1,
          labor_setter: 2,
          labor_technician: 3,
          labor_plating_x: 4,
          labor_plating_d: 5,
          labor_subcontract: 6,
          labor_stone_setting: 7,
          labor_technician_manual_override: true,
          labor_plating_x_manual_override: false,
          labor_plating_d_manual_override: true,
        } as any,
      ],
      {
        variants: [
          { product_sku: 'PN1', suffix: 'X', description: 'Gold', stock_qty: 3, selling_price: 15 },
        ] as any,
        recipes: [
          { parent_sku: 'PN1', type: 'raw', material_id: 'm1', quantity: 2 },
        ] as any,
        molds: [
          { product_sku: 'PN1', mold_code: 'M1', quantity: 1 },
        ] as any,
        collections: [
          { product_sku: 'PN1', collection_id: 7 },
        ] as any,
        stock: [
          { product_sku: 'PN1', warehouse_id: 'central', quantity: 5 },
          { product_sku: 'PN1', variant_suffix: 'X', warehouse_id: 'central', quantity: 3 },
        ] as any,
      },
      {
        publicImageBaseUrl: 'https://cdn.example.com',
        centralWarehouseId: 'central',
        showroomWarehouseId: 'showroom',
      },
    );

    expect(products[0].image_url).toBe('https://cdn.example.com/foo.jpg');
    expect(products[0].variants).toHaveLength(1);
    expect(products[0].recipe).toHaveLength(1);
    expect(products[0].molds).toEqual([{ code: 'M1', quantity: 1 }]);
    expect(products[0].collections).toEqual([7]);
    expect(products[0].location_stock.central).toBe(5);
    expect(products[0].variants?.[0].location_stock.central).toBe(3);
  });

  it('maps catalog rows without heavy relations but keeps stable fallback fields', () => {
    const products = mapCatalogProductsWithRelations(
      [
        {
          sku: 'PN2',
          prefix: 'PN',
          category: 'Δαχτυλίδι',
          gender: Gender.Men,
          image_url: null,
          weight_g: 1,
          secondary_weight_g: null,
          plating_type: PlatingType.None,
          production_type: ProductionType.Imported,
          stock_qty: 2,
          sample_qty: 0,
          is_component: true,
          suppliers: null,
          active_price: 0,
          draft_price: 0,
          selling_price: 8,
          created_at: '2024-01-01T00:00:00.000Z',
        } as any,
      ],
      {
        variants: [],
        collections: [],
        stock: [],
      },
      {
        publicImageBaseUrl: 'https://cdn.example.com',
        centralWarehouseId: 'central',
        showroomWarehouseId: 'showroom',
      },
    );

    expect(products[0].molds).toEqual([]);
    expect(products[0].recipe).toEqual([]);
    expect(products[0].created_at).toBe('2024-01-01T00:00:00.000Z');
    expect(products[0].production_type).toBe(ProductionType.Imported);
  });
});
