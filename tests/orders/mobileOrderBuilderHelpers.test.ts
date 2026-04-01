import { describe, expect, it } from 'vitest';
import { Customer, Gender, OrderItem, PlatingType, Product, ProductVariant, VatRegime } from '../../types';
import {
  buildMobileOrderBuilderCustomerSuggestions,
  buildMobileOrderBuilderEditFinishOptions,
  buildMobileOrderBuilderEditStoneOptions,
  buildMobileOrderBuilderFinishOrder,
  buildMobileOrderBuilderItemEditState,
  buildMobileOrderBuilderItemUpdate,
  buildMobileOrderBuilderProductSuggestions,
  buildMobileOrderBuilderTotals,
  buildMobileOrderBuilderVariantGroups,
  buildMobileOrderBuilderItems,
  hydrateMobileOrderBuilderDraft,
  parseMobileOrderBuilderDraft,
  serializeMobileOrderBuilderDraft,
} from '../../features/orders/mobileOrderBuilderHelpers';

const makeProduct = (overrides: Partial<Product>): Product =>
  ({
    sku: 'PN1',
    prefix: 'PN',
    category: 'Βραχιόλι',
    gender: Gender.Women,
    image_url: null,
    weight_g: 1,
    plating_type: PlatingType.None,
    production_type: 'InHouse',
    active_price: 0,
    draft_price: 0,
    selling_price: 12,
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
    variants: [],
    created_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  }) as Product;

describe('mobile order builder helpers', () => {
  it('groups variants and exposes the editor finish ordering rules', () => {
    const product = makeProduct({
      variants: [
        { suffix: 'X', description: 'Επίχρυσο', stock_qty: 0 } as ProductVariant,
        { suffix: '', description: 'Λουστρέ', stock_qty: 0 } as ProductVariant,
        { suffix: 'P', description: 'Πατίνα', stock_qty: 0 } as ProductVariant,
      ],
    });

    const groups = buildMobileOrderBuilderVariantGroups(product);
    expect(buildMobileOrderBuilderFinishOrder(groups)).toEqual(['', 'P', 'X']);
    expect(buildMobileOrderBuilderEditFinishOptions(groups)).toEqual(['', 'P', 'X']);
    expect(buildMobileOrderBuilderEditStoneOptions(groups, 'P')).toHaveLength(1);
  });

  it('suggests products and customers using the same search rules as the builder', () => {
    const products = [
      makeProduct({ sku: 'PN1' }),
      makeProduct({ sku: 'ZZ9', is_component: true }),
      makeProduct({ sku: 'PN2' }),
    ];
    const customers: Customer[] = [
      { id: '1', full_name: 'Ada', phone: '12345', created_at: '2024-01-01T00:00:00.000Z' },
      { id: '2', full_name: 'Bea', phone: '99999', created_at: '2024-01-01T00:00:00.000Z' },
    ];

    expect(buildMobileOrderBuilderProductSuggestions(products, 'pn')).toHaveLength(2);
    expect(buildMobileOrderBuilderCustomerSuggestions(customers, 'ad')).toEqual([customers[0]]);
  });

  it('serializes, parses, and hydrates draft state without losing product details', () => {
    const products = [makeProduct({ sku: 'PN1' })];
    const originalItems: OrderItem[] = [
      { sku: 'PN1', quantity: 2, price_at_order: 12, product_details: products[0] },
    ];

    const raw = serializeMobileOrderBuilderDraft({
      customerName: 'Ada',
      customerPhone: '123',
      customerId: 'cust-1',
      items: originalItems,
      vatRate: VatRegime.Standard,
      discountPercent: 10,
      orderNotes: 'notes',
      retailClientLabel: 'Shop',
    });

    const parsed = parseMobileOrderBuilderDraft(raw);
    expect(parsed?.customerName).toBe('Ada');

    const hydrated = parsed ? hydrateMobileOrderBuilderDraft(parsed, products) : null;
    expect(hydrated?.items[0].product_details?.sku).toBe('PN1');
    expect(buildMobileOrderBuilderItems(originalItems, products)[0].product_details?.sku).toBe('PN1');
  });

  it('updates items, merges identical rows, and recalculates totals', () => {
    const product = makeProduct({
      variants: [{ suffix: 'X', description: 'Επίχρυσο', stock_qty: 0, selling_price: 18 } as ProductVariant],
    });

    const items: OrderItem[] = [
      { sku: 'PN1', quantity: 1, price_at_order: 12, product_details: product, notes: 'a' },
      { sku: 'PN1', quantity: 2, price_at_order: 12, product_details: product, notes: 'b' },
    ];

    const updated = buildMobileOrderBuilderItemUpdate(items, 0, 'X', undefined, undefined, undefined, [product]);
    expect(updated).toHaveLength(2);
    expect(updated[0].variant_suffix).toBe('X');
    expect(buildMobileOrderBuilderTotals(updated, 10, 0.24).grandTotal).toBeGreaterThan(0);

    const editedState = buildMobileOrderBuilderItemEditState(updated[0], [product]);
    expect(editedState.editVariantSuffix).toBe('X');
  });
});
