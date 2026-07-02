import { describe, expect, it, vi } from 'vitest';
import {
  getProductionVirtualBatchRowClassName,
  getProductionVirtualRowMeasureElement,
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
});
