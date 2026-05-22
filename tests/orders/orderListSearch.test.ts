import { describe, expect, it } from 'vitest';
import { OrderStatus } from '../../types';
import type { Order } from '../../types';
import { buildOrderSearchHaystack, estimateOrderListRowHeight, orderMatchesSearch } from '../../features/orders/orderListSearch';

const baseOrder: Order = {
    id: 'ORD-100',
    customer_id: 'c1',
    customer_name: 'Μίλτος Παπαδόπουλος',
    status: OrderStatus.Pending,
    created_at: '2026-01-01T00:00:00Z',
    items: [],
    total_price: 100,
    tags: ['VIP'],
};

describe('orderListSearch', () => {
    it('matches Greek customer names case-insensitively', () => {
        expect(orderMatchesSearch(baseOrder, 'μί')).toBe(true);
        expect(orderMatchesSearch(baseOrder, 'παπα')).toBe(true);
        expect(orderMatchesSearch(baseOrder, 'zzz')).toBe(false);
    });

    it('builds haystack with id, customer, and tags', () => {
        const haystack = buildOrderSearchHaystack(baseOrder);
        expect(haystack).toContain('ord-100');
        expect(haystack).toContain('μίλτος');
        expect(haystack).toContain('vip');
    });

    it('estimates taller rows for tags and production progress', () => {
        const plain = estimateOrderListRowHeight({ ...baseOrder, tags: [] });
        const tagged = estimateOrderListRowHeight(baseOrder);
        const inProduction = estimateOrderListRowHeight({
            ...baseOrder,
            status: OrderStatus.InProduction,
            tags: [],
        }, { isReady: false });
        expect(tagged).toBeGreaterThan(plain);
        expect(inProduction).toBeGreaterThan(plain);
    });
});
