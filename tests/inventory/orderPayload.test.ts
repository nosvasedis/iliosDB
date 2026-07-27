import { describe, expect, it } from 'vitest';
import type { Order } from '../../types';
import { normalizeOrderInventoryIdentities } from '../../features/inventory/repository';

describe('inventory order RPC payload', () => {
  it('omits database-generated summaries and normalizes inventory identities', () => {
    const order = {
      id: 'order-payload-test',
      customer_name: 'Δοκιμαστικός πελάτης',
      created_at: '2026-07-27T00:00:00.000Z',
      status: 'Pending',
      total_price: 0,
      item_count: 99,
      item_total_qty: 99,
      items: [{
        sku: 'BR200',
        variant_suffix: 'DLE',
        size_info: '19 CM',
        quantity: 1,
      }],
    } as Order;

    const payload = normalizeOrderInventoryIdentities(order);

    expect(payload).not.toHaveProperty('item_count');
    expect(payload).not.toHaveProperty('item_total_qty');
    expect(payload.items[0]?.size_info).toBe('19cm');
    expect(order.item_count).toBe(99);
    expect(order.item_total_qty).toBe(99);
  });
});
