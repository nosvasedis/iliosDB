import { describe, expect, it, vi } from 'vitest';
import { getProductionVirtualRowMeasureElement } from '../../components/production/VirtualizedProductionBatchGroups';

describe('VirtualizedProductionBatchGroups', () => {
  it('uses the virtualizer stable measureElement callback for row refs', () => {
    const measureElement = vi.fn();
    const virtualizer = { measureElement };

    expect(getProductionVirtualRowMeasureElement(virtualizer)).toBe(measureElement);
  });
});
