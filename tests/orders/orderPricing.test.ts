import { describe, expect, it } from 'vitest';
import type { Order, OrderItem, Product } from '../../types';
import { getOrderCatalogPrice, getOrderPriceMode, setOrderItemsPriceMode } from '../../utils/orderPricing';
import { generateOrderPriceSyncPreview } from '../../utils/productionPricingUtils';
import { buildMobileOrderBuilderItemUpdate, buildMobileOrderBuilderTotals, hydrateMobileOrderBuilderDraft, parseMobileOrderBuilderDraft, serializeMobileOrderBuilderDraft } from '../../features/orders/mobileOrderBuilderHelpers';
import { normalizeOrderInventoryIdentities } from '../../features/inventory/repository';

const product = {
  sku: 'BDA001', prefix: 'BD', selling_price: 10,
  variants: [{ suffix: 'X', selling_price: 12.15 }, { suffix: '', selling_price: 11 }],
} as Product;
const line = (extra: Partial<OrderItem> = {}): OrderItem => ({
  sku: product.sku, quantity: 2, price_at_order: 12.15, variant_suffix: 'X', size_info: '52', ...extra,
});

describe('order retail pricing', () => {
  it('uses variant prices, master fallbacks, and cent rounding', () => {
    expect(getOrderCatalogPrice(product, 'X', 'retail')).toBe(36.45);
    expect(getOrderCatalogPrice(product, '', 'retail')).toBe(33);
    expect(getOrderCatalogPrice(product, undefined, 'retail')).toBe(30);
    expect(getOrderCatalogPrice(product, 'unknown', 'retail')).toBe(30);
    expect(getOrderCatalogPrice(product, 'X')).toBe(12.15);
  });

  it('toggles existing lines without compounding and preserves custom prices, gifts and SP', () => {
    const original = [line(), line({ price_override: true, price_at_order: 9 }), line({ price_at_order: 0 }), line({ sku: 'SP', price_at_order: 80 })];
    const retail = setOrderItemsPriceMode(original, [product], 'retail');
    expect(retail.map(item => item.price_at_order)).toEqual([36.45, 9, 0, 80]);
    expect(setOrderItemsPriceMode(retail, [product], 'retail')).toEqual(retail);
    expect(setOrderItemsPriceMode(retail, [product], 'wholesale').map(item => item.price_at_order)).toEqual([12.15, 9, 0, 80]);
    expect(original[0].price_at_order).toBe(12.15);
    expect(buildMobileOrderBuilderTotals([retail[0]], 10, 0.24).grandTotal).toBeCloseTo(81.3564);
  });

  it('retains retail prices through JSON persistence, drafts, size edits and catalog sync', () => {
    const retail = setOrderItemsPriceMode([line()], [product], 'retail');
    const payload = normalizeOrderInventoryIdentities({ items: retail } as Order);
    const persisted = JSON.parse(JSON.stringify(payload)) as Order;
    expect(getOrderPriceMode(persisted.items)).toBe('retail');
    const edited = buildMobileOrderBuilderItemUpdate(persisted.items, 0, '', '54', undefined, undefined, [product]);
    expect(edited[0]).toMatchObject({ size_info: '54', price_at_order: 33, price_mode: 'retail' });
    expect(generateOrderPriceSyncPreview({ items: retail } as Order, [product], 0, 0.24)).toBeNull();
    const updatedProduct = { ...product, variants: [{ suffix: 'X', selling_price: 13 }] } as Product;
    expect(generateOrderPriceSyncPreview({ items: retail } as Order, [updatedProduct], 0, 0.24)?.itemsToChange[0].newPrice).toBe(39);
    const raw = serializeMobileOrderBuilderDraft({ customerName: 'Test', customerPhone: '', customerId: null, items: retail, vatRate: 0.24, discountPercent: 0, orderNotes: '', priceMode: 'retail' });
    const restored = hydrateMobileOrderBuilderDraft(parseMobileOrderBuilderDraft(raw)!, [product]);
    expect(restored.priceMode).toBe('retail');
    expect(restored.items[0].price_at_order).toBe(36.45);
  });
});
