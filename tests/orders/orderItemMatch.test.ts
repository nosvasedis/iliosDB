import { describe, expect, it } from 'vitest';
import { OrderItem } from '../../types';
import { assignMissingOrderLineIds, getOrderItemMatchKey } from '../../utils/orderItemMatch';

describe('order item matching', () => {
  it('assigns stable line ids when same catalog identity has distinct notes', () => {
    const items: OrderItem[] = [
      { sku: 'BDA001', variant_suffix: 'XPR', quantity: 1, price_at_order: 67, notes: 'KO-PR-KO' },
      { sku: 'BDA001', variant_suffix: 'XPR', quantity: 1, price_at_order: 67 },
      { sku: 'RN100', variant_suffix: 'X', quantity: 1, price_at_order: 20 },
    ];

    let n = 0;
    const normalized = assignMissingOrderLineIds(items, () => `line-${++n}`);

    expect(normalized[0].line_id).toBe('line-1');
    expect(normalized[1].line_id).toBe('line-2');
    expect(normalized[2].line_id).toBeUndefined();
    expect(getOrderItemMatchKey(normalized[0])).not.toBe(getOrderItemMatchKey(normalized[1]));
  });

  it('keeps existing line ids unchanged', () => {
    const normalized = assignMissingOrderLineIds([
      { sku: 'BDA001', variant_suffix: 'XPR', quantity: 1, price_at_order: 67, notes: 'KO-PR-KO', line_id: 'existing-1' },
      { sku: 'BDA001', variant_suffix: 'XPR', quantity: 1, price_at_order: 67 },
    ], () => 'new-id');

    expect(normalized[0].line_id).toBe('existing-1');
    expect(normalized[1].line_id).toBe('new-id');
  });
});
