import { Order, OrderStatus } from '../../types';

export type SelectAllState = 'none' | 'some' | 'all';

export function toggleSelectedId(selectedIds: Set<string>, orderId: string): Set<string> {
    const next = new Set(selectedIds);
    if (next.has(orderId)) next.delete(orderId);
    else next.add(orderId);
    return next;
}

export function selectVisibleIds(selectedIds: Set<string>, visibleOrders: Order[]): Set<string> {
    const visibleIds = visibleOrders.map((order) => order.id);
    if (visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id))) {
        return new Set();
    }
    return new Set(visibleIds);
}

export function pruneSelectedIds(selectedIds: Set<string>, availableOrders: Order[]): Set<string> {
    const available = new Set(availableOrders.map((order) => order.id));
    return new Set([...selectedIds].filter((id) => available.has(id)));
}

export function selectedOrdersFromIds(selectedIds: Set<string>, orders: Order[]): Order[] {
    return orders.filter((order) => selectedIds.has(order.id));
}

export function getSelectAllState(selectedIds: Set<string>, visibleOrders: Order[]): SelectAllState {
    if (visibleOrders.length === 0) return 'none';
    const selectedVisibleCount = visibleOrders.filter((order) => selectedIds.has(order.id)).length;
    if (selectedVisibleCount === 0) return 'none';
    if (selectedVisibleCount === visibleOrders.length) return 'all';
    return 'some';
}

export function canBulkCancel(orders: Order[]): boolean {
    if (orders.length === 0) return false;
    return orders.every((order) => (
        order.status !== OrderStatus.Cancelled && order.status !== OrderStatus.Delivered
    ));
}

export function mergeOrderTags(existingTags: string[] | undefined, rawTag: string): string[] {
    const current = existingTags ?? [];
    const tag = rawTag.trim();
    if (!tag || current.includes(tag)) return current;
    return [...current, tag];
}
