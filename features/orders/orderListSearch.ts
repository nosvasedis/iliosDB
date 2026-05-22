import type { Order } from '../../types';
import { getOrderTransferIndicators } from '../../utils/transferIndicators';
import { orderStatusShowsProductionProgress } from '../../utils/orderReadiness';

/** Lowercase search corpus for an order (id, customer, tags). */
export function buildOrderSearchHaystack(order: Order): string {
    const parts = [order.id, order.customer_name, ...(order.tags ?? [])];
    return parts.join(' ').toLocaleLowerCase('el');
}

export function orderMatchesSearch(order: Order, normalizedTerm: string): boolean {
    if (!normalizedTerm) return true;
    return buildOrderSearchHaystack(order).includes(normalizedTerm);
}

/** Fixed-height estimate for desktop virtualized order rows (avoids dynamic measureElement). */
export function estimateOrderListRowHeight(
    order: Order,
    options?: { isReady?: boolean }
): number {
    // Base height (124) + margin space (my-1 = 0.25rem top + 0.25rem bottom = 0.5rem = 8px)
    let height = 132;
    const tagCount = order.tags?.length ?? 0;
    if (tagCount > 0) height += 24 + Math.max(0, Math.ceil(tagCount / 3) - 1) * 22;
    if (getOrderTransferIndicators(order.notes).length > 0) height += 30;
    if (order.seller_name) height += 24;
    const ready = options?.isReady ?? false;
    if (!ready && orderStatusShowsProductionProgress(order.status)) height += 28;
    return height;
}
