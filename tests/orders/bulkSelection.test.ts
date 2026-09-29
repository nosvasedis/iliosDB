import { describe, expect, it } from 'vitest';
import { OrderStatus } from '../../types';
import type { Order } from '../../types';
import {
    canBulkCancel,
    getSelectAllState,
    mergeOrderTags,
    pruneSelectedIds,
    selectedOrdersFromIds,
    selectVisibleIds,
    toggleSelectedId,
} from '../../features/orders/bulkSelection';

const order = (overrides: Partial<Order> & Pick<Order, 'id'>): Order => ({
    customer_name: 'Πελάτης',
    status: OrderStatus.Pending,
    created_at: '2026-01-01T00:00:00Z',
    items: [],
    total_price: 100,
    ...overrides,
});

describe('toggleSelectedId', () => {
    it('adds an id that is not selected', () => {
        const next = toggleSelectedId(new Set(['a']), 'b');
        expect([...next].sort()).toEqual(['a', 'b']);
    });

    it('removes an id that is already selected', () => {
        const next = toggleSelectedId(new Set(['a', 'b']), 'a');
        expect([...next]).toEqual(['b']);
    });

    it('does not mutate the original set', () => {
        const original = new Set(['a']);
        toggleSelectedId(original, 'b');
        expect([...original]).toEqual(['a']);
    });
});

describe('selectVisibleIds', () => {
    it('selects every visible order id', () => {
        const next = selectVisibleIds(
            new Set(),
            [order({ id: '1' }), order({ id: '2' })],
        );
        expect([...next].sort()).toEqual(['1', '2']);
    });

    it('clears the selection when every visible id is already selected', () => {
        const next = selectVisibleIds(
            new Set(['1', '2']),
            [order({ id: '1' }), order({ id: '2' })],
        );
        expect(next.size).toBe(0);
    });

    it('selects remaining visible ids when only some are selected', () => {
        const next = selectVisibleIds(
            new Set(['1']),
            [order({ id: '1' }), order({ id: '2' })],
        );
        expect([...next].sort()).toEqual(['1', '2']);
    });
});

describe('pruneSelectedIds', () => {
    it('drops ids that are no longer in the available orders', () => {
        const next = pruneSelectedIds(
            new Set(['keep', 'gone']),
            [order({ id: 'keep' })],
        );
        expect([...next]).toEqual(['keep']);
    });
});

describe('selectedOrdersFromIds', () => {
    it('returns selected orders in visible-list order', () => {
        const orders = [order({ id: 'a' }), order({ id: 'b' }), order({ id: 'c' })];
        expect(selectedOrdersFromIds(new Set(['c', 'a']), orders).map((item) => item.id)).toEqual(['a', 'c']);
    });
});

describe('getSelectAllState', () => {
    it('is none when nothing is selected', () => {
        expect(getSelectAllState(new Set(), [order({ id: '1' })])).toBe('none');
    });

    it('is all when every visible id is selected', () => {
        expect(getSelectAllState(new Set(['1', '2']), [order({ id: '1' }), order({ id: '2' })])).toBe('all');
    });

    it('is some when only part of the visible list is selected', () => {
        expect(getSelectAllState(new Set(['1']), [order({ id: '1' }), order({ id: '2' })])).toBe('some');
    });

    it('is none when the visible list is empty', () => {
        expect(getSelectAllState(new Set(['1']), [])).toBe('none');
    });
});

describe('canBulkCancel', () => {
    it('allows cancel when every selected order is still cancellable', () => {
        expect(canBulkCancel([
            order({ id: '1', status: OrderStatus.Pending }),
            order({ id: '2', status: OrderStatus.InProduction }),
        ])).toBe(true);
    });

    it('blocks cancel when any selected order is cancelled', () => {
        expect(canBulkCancel([
            order({ id: '1', status: OrderStatus.Pending }),
            order({ id: '2', status: OrderStatus.Cancelled }),
        ])).toBe(false);
    });

    it('blocks cancel when any selected order is delivered', () => {
        expect(canBulkCancel([
            order({ id: '1', status: OrderStatus.Ready }),
            order({ id: '2', status: OrderStatus.Delivered }),
        ])).toBe(false);
    });

    it('blocks cancel when nothing is selected', () => {
        expect(canBulkCancel([])).toBe(false);
    });
});

describe('mergeOrderTags', () => {
    it('appends a new tag without duplicating existing ones', () => {
        expect(mergeOrderTags(['VIP'], 'Έκθεση')).toEqual(['VIP', 'Έκθεση']);
        expect(mergeOrderTags(['VIP'], 'VIP')).toEqual(['VIP']);
    });

    it('trims the new tag and ignores blanks', () => {
        expect(mergeOrderTags(['VIP'], '  Νέα  ')).toEqual(['VIP', 'Νέα']);
        expect(mergeOrderTags(['VIP'], '   ')).toEqual(['VIP']);
    });
});
