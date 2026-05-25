import { Order, Product, PriceSyncPreview, ItemPriceDelta, SkippedPriceItem } from '../types';
import { getOrderItemMatchKey } from './orderItemMatch';
import { isSpecialCreationSku } from './specialCreationSku';
import { itemKey } from './shipmentUtils';

/**
 * Generates a price sync preview for an order without applying changes.
 * Skips items that are:
 * - Specially created (SP items)
 * - Already shipped to the customer (any shipped qty on the line)
 * - Manually overridden (price_override = true)
 * - Priced at 0 EUR (gifts/δώρα)
 */
export function generateOrderPriceSyncPreview(
    order: Order,
    products: Product[],
    discountPercent: number,
    vatRate: number,
    shippedQuantities?: Map<string, number>
): PriceSyncPreview | null {
    const oldSub = order.items.reduce((acc, item) => acc + (item.price_at_order * item.quantity), 0);
    const oldNet = oldSub * (1 - discountPercent / 100);
    const oldVat = oldNet * vatRate;
    const oldTotal = oldNet + oldVat;

    let updatedCount = 0;
    let skippedCount = 0;
    const itemsToChange: ItemPriceDelta[] = [];
    const itemsToSkip: SkippedPriceItem[] = [];
    let newSubtotal = oldSub;

    order.items.forEach(item => {
        if (isSpecialCreationSku(item.sku)) return;

        const shipmentKey = itemKey(
            item.sku,
            item.variant_suffix,
            item.size_info,
            item.cord_color,
            item.enamel_color,
            item.line_id
        );
        const shippedQty = shippedQuantities?.get(shipmentKey) ?? 0;
        if (shippedQty > 0) {
            itemsToSkip.push({
                lineKey: getOrderItemMatchKey(item),
                sku: item.sku,
                variantSuffix: item.variant_suffix,
                currentPrice: item.price_at_order,
                reason: 'already_shipped',
                quantity: shippedQty,
                sizeInfo: item.size_info,
            });
            skippedCount++;
            return;
        }

        // Skip if manually overridden
        if (item.price_override === true) {
            itemsToSkip.push({
                lineKey: getOrderItemMatchKey(item),
                sku: item.sku,
                variantSuffix: item.variant_suffix,
                currentPrice: item.price_at_order,
                reason: 'manual_override',
                quantity: item.quantity,
                sizeInfo: item.size_info,
            });
            skippedCount++;
            return;
        }

        // Skip if price is 0 EUR (gift/δώρα)
        if (item.price_at_order === 0) {
            itemsToSkip.push({
                lineKey: getOrderItemMatchKey(item),
                sku: item.sku,
                variantSuffix: item.variant_suffix,
                currentPrice: 0,
                reason: 'gift_zero_eur',
                quantity: item.quantity,
                sizeInfo: item.size_info,
            });
            skippedCount++;
            return;
        }

        const product = products.find(p => p.sku === item.sku);
        if (!product) return;

        let currentRegistryPrice = 0;
        const hasSuffix = item.variant_suffix !== undefined && item.variant_suffix !== null;
        if (hasSuffix) {
            const variant = product.variants?.find(v => v.suffix === item.variant_suffix);
            currentRegistryPrice = variant?.selling_price || 0;
        }
        if (currentRegistryPrice === 0) currentRegistryPrice = product.selling_price;

        const hasPriceDiff = currentRegistryPrice > 0 && Math.abs(currentRegistryPrice - item.price_at_order) > 0.01;
        if (hasPriceDiff) {
            itemsToChange.push({
                lineKey: getOrderItemMatchKey(item),
                sku: item.sku,
                variantSuffix: item.variant_suffix,
                oldPrice: item.price_at_order,
                newPrice: currentRegistryPrice,
                quantity: item.quantity,
                sizeInfo: item.size_info,
            });
            updatedCount++;
            newSubtotal -= item.price_at_order * item.quantity;
            newSubtotal += currentRegistryPrice * item.quantity;
        }
    });

    if (updatedCount === 0 && skippedCount === 0) {
        return null; // No changes
    }

    const newNet = newSubtotal * (1 - discountPercent / 100);
    const newVat = newNet * vatRate;
    const newTotal = newNet + newVat;

    return {
        itemsToChange,
        itemsToSkip,
        totalsBefore: { subtotal: oldSub, net: oldNet, vat: oldVat, total: oldTotal },
        totalsAfter: { subtotal: newSubtotal, net: newNet, vat: newVat, total: newTotal },
        updatedCount,
        skippedCount,
    };
}

/**
 * Applies a price sync preview to an order, returning the updated order.
 */
export function applyOrderPriceSyncPreview(order: Order, preview: PriceSyncPreview): Order {
    const updatedItems = order.items.map(item => {
        const delta = preview.itemsToChange.find(d => d.lineKey === getOrderItemMatchKey(item));
        if (delta) {
            return { ...item, price_at_order: delta.newPrice, price_override: undefined };
        }
        return item;
    });

    return {
        ...order,
        items: updatedItems,
        total_price: preview.totalsAfter.total,
    };
}

/** True when local order has price edits not yet persisted to the saved order snapshot. */
export function hasUnsavedOrderPriceChanges(current: Order, saved: Order): boolean {
    if (Math.abs((current.total_price ?? 0) - (saved.total_price ?? 0)) > 0.01) {
        return true;
    }
    const savedByKey = new Map(saved.items.map(item => [getOrderItemMatchKey(item), item]));
    for (const item of current.items) {
        const orig = savedByKey.get(getOrderItemMatchKey(item));
        if (!orig) return true;
        if (Math.abs(item.price_at_order - orig.price_at_order) > 0.01) return true;
        if (item.price_override !== orig.price_override) return true;
    }
    return false;
}
