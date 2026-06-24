import { describe, expect, it } from 'vitest';
import { Gender, PlatingType, Product, ProductionType } from '../../types';
import {
  buildPrintableSkuMap,
  buildSearchableProducts,
  filterRegistryProducts,
  getAvailableRegistryStones,
  getGroupedProductCategories,
  getProductAverageSellingPrice,
} from '../../features/products/productRegistryViewModels';

const makeProduct = (overrides: Partial<Product>): Product =>
  ({
    sku: 'BASE',
    prefix: 'BA',
    category: 'Βραχιόλι',
    gender: Gender.Women,
    image_url: null,
    weight_g: 1,
    plating_type: PlatingType.None,
    production_type: ProductionType.InHouse,
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
      casting_cost_manual_override: false,
      technician_cost_manual_override: false,
      plating_cost_x_manual_override: false,
      plating_cost_d_manual_override: false,
    },
    created_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  }) as Product;

describe('product registry view models', () => {
  it('builds searchable rows and filters them with the same rules as the registry', () => {
    const products = [
      makeProduct({
        sku: 'A10',
        category: 'Βραχιόλι',
        collections: [7],
        recipe: [{ type: 'raw', id: 'stone-1', quantity: 1 }],
        variants: [{ suffix: 'LE', description: 'Λευκό', stock_qty: 1 }],
      }),
      makeProduct({
        sku: 'A2',
        category: 'Δαχτυλίδι',
        gender: Gender.Men,
        plating_type: PlatingType.GoldPlated,
        production_type: ProductionType.Imported,
        collections: [8],
        created_at: '2024-02-01T00:00:00.000Z',
      }),
    ];

    const searchable = buildSearchableProducts(products, new Set(['stone-1']));

    expect(getGroupedProductCategories(products).parents).toEqual(['Βραχιόλι', 'Δαχτυλίδι']);
    expect(getAvailableRegistryStones(searchable, 'All')).toEqual([
      { id: 'LE', name: 'Λευκά Ζιργκόν', count: 1 },
    ]);

    const filtered = filterRegistryProducts(searchable, {
      category: 'All',
      gender: 'All',
      searchTerm: '',
      stone: 'all',
      plating: 'all',
      productionType: 'all',
      collection: 'all',
      sortBy: 'sku_asc',
    });

    expect(filtered.map((product) => product.sku)).toEqual(['A2', 'A10']);

    const filteredByCollection = filterRegistryProducts(searchable, {
      category: 'All',
      gender: 'All',
      searchTerm: '',
      stone: 'all',
      plating: 'all',
      productionType: 'all',
      collection: '7',
      sortBy: 'sku_asc',
    });

    expect(filteredByCollection.map((product) => product.sku)).toEqual(['A10']);
  });

  it('builds a printable SKU lookup for master products and variants', () => {
    const product = makeProduct({
      sku: 'K10',
      variants: [
        { suffix: 'P', description: 'Πατίνα', stock_qty: 1 },
        { suffix: 'X', description: 'Επίχρυσο', stock_qty: 1 },
      ],
    });

    const map = buildPrintableSkuMap([product]);

    expect(map.get('K10')?.product.sku).toBe('K10');
    expect(map.get('K10P')?.variant?.suffix).toBe('P');
    expect(map.get('K10X')?.variant?.suffix).toBe('X');
  });

  it('sorts registry products by sku descending, category, price average, and created date', () => {
    const products = [
      makeProduct({
        sku: 'B20',
        category: 'Δαχτυλίδι',
        selling_price: 10,
        variants: [
          { suffix: 'P', description: 'Patina', stock_qty: 1, selling_price: 40 },
          { suffix: 'X', description: 'Gold', stock_qty: 1, selling_price: 60 },
        ],
        created_at: '2024-03-01T00:00:00.000Z',
      }),
      makeProduct({
        sku: 'A10',
        category: 'Βραχιόλι',
        selling_price: 100,
        created_at: '2024-01-01T00:00:00.000Z',
      }),
      makeProduct({
        sku: 'C5',
        category: 'Βραχιόλι',
        selling_price: 25,
        created_at: '2024-06-01T00:00:00.000Z',
      }),
    ];
    const searchable = buildSearchableProducts(products, new Set());
    const baseFilters = {
      category: 'All',
      gender: 'All' as const,
      searchTerm: '',
      stone: 'all',
      plating: 'all',
      productionType: 'all',
      collection: 'all',
    };

    expect(getProductAverageSellingPrice(products[0])).toBe(50);

    expect(
      filterRegistryProducts(searchable, { ...baseFilters, sortBy: 'sku_desc' }).map((p) => p.sku),
    ).toEqual(['C5', 'B20', 'A10']);

    expect(
      filterRegistryProducts(searchable, { ...baseFilters, sortBy: 'category_asc' }).map((p) => p.sku),
    ).toEqual(['A10', 'C5', 'B20']);

    expect(
      filterRegistryProducts(searchable, { ...baseFilters, sortBy: 'price_desc' }).map((p) => p.sku),
    ).toEqual(['A10', 'B20', 'C5']);

    expect(
      filterRegistryProducts(searchable, { ...baseFilters, sortBy: 'created_desc' }).map((p) => p.sku),
    ).toEqual(['C5', 'B20', 'A10']);

    expect(
      filterRegistryProducts(searchable, { ...baseFilters, sortBy: 'created_asc' }).map((p) => p.sku),
    ).toEqual(['A10', 'B20', 'C5']);
  });
});
