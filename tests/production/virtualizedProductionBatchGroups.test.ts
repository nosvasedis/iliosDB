import { describe, expect, it, vi } from 'vitest';
import {
  getProductionVirtualBatchRowClassName,
  getProductionVirtualDomRowKey,
  getProductionVirtualRowMeasureElement,
  getProductionVirtualRowsLayoutKey,
} from '../../components/production/VirtualizedProductionBatchGroups';

describe('VirtualizedProductionBatchGroups', () => {
  it('uses the virtualizer stable measureElement callback for row refs', () => {
    const measureElement = vi.fn();
    const virtualizer = { measureElement };

    expect(getProductionVirtualRowMeasureElement(virtualizer)).toBe(measureElement);
  });

  it('keeps measured batch rows padded so movement borders cannot collide with the next row', () => {
    const className = getProductionVirtualBatchRowClassName();

    expect(className).toContain('py-1.5');
    expect(className).toContain('pr-1');
    expect(className).toContain('overflow-visible');
  });

  it('versions virtual row DOM keys when grouping or sorting changes so measured heights reset', () => {
    const rows = [
      { type: 'level', key: 'level:customer-a' },
      { type: 'collection', key: 'collection:customer-a:shirts' },
      { type: 'batch', key: 'batch:batch-1' },
    ];

    const customerLayoutKey = getProductionVirtualRowsLayoutKey('customer', 'alpha', rows);
    const genderLayoutKey = getProductionVirtualRowsLayoutKey('gender', 'alpha', rows);
    const newestLayoutKey = getProductionVirtualRowsLayoutKey('customer', 'newest', rows);

    expect(genderLayoutKey).not.toBe(customerLayoutKey);
    expect(newestLayoutKey).not.toBe(customerLayoutKey);
    expect(getProductionVirtualDomRowKey(customerLayoutKey, 'batch:batch-1')).not.toBe(
      getProductionVirtualDomRowKey(genderLayoutKey, 'batch:batch-1'),
    );
  });
});
