import type { OrderItem, Product } from '../types';
import { isSpecialCreationSku } from './specialCreationSku';

export type OrderPriceMode = 'wholesale' | 'retail';

export function getOrderCatalogPrice(product: Product, suffix?: string, mode: OrderPriceMode = 'wholesale'): number {
    const variant = product.variants?.find(v => v.suffix === suffix);
    const wholesale = variant?.selling_price || product.selling_price || 0;
    return Math.round(wholesale * (mode === 'retail' ? 3 : 1) * 100) / 100;
}

export function getOrderPriceMode(items: OrderItem[]): OrderPriceMode {
    return items.some(item => item.price_mode === 'retail') ? 'retail' : 'wholesale';
}

/** Rebase from the catalog on every switch so repeated toggles never compound. */
export function setOrderItemsPriceMode(items: OrderItem[], products: Product[], mode: OrderPriceMode): OrderItem[] {
    const bySku = new Map(products.map(product => [product.sku, product]));
    return items.map(item => {
        if (isSpecialCreationSku(item.sku)) return item;
        const product = bySku.get(item.sku) || item.product_details;
        return {
            ...item,
            price_mode: mode,
            price_at_order: product && !item.price_override && item.price_at_order !== 0
                ? getOrderCatalogPrice(product, item.variant_suffix, mode)
                : item.price_at_order,
        };
    });
}
