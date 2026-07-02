import { describe, expect, it } from 'vitest';
import {
  getProductionGroupedRowsClassName,
  getProductionVirtualBatchRowClassName,
  getProductionVirtualDomRowKey,
  getProductionVirtualRowsLayoutKey,
} from '../../components/production/VirtualizedProductionBatchGroups';

describe('VirtualizedProductionBatchGroups', () => {
  it('keeps measured batch rows padded so movement borders cannot collide with the next row', () => {
    const className = getProductionVirtualBatchRowClassName();

    expect(className).toContain('py-1.5');
    expect(className).toContain('pr-1');
    expect(className).toContain('overflow-visible');
  });

  it('renders grouped rows in normal flow with vertical spacing instead of absolute slots', () => {
    const className = getProductionGroupedRowsClassName();

    expect(className).toContain('space-y-3');
    expect(className).not.toContain('absolute');
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
