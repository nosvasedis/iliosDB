import { describe, expect, it } from 'vitest';
import { parseBatchLabelInputLine } from '../../features/printing/batchLabelInput';

describe('batch label input parsing', () => {
  it('treats the second token as size and the third as quantity for sized products', () => {
    expect(parseBatchLabelInputLine('DM100X 52 1', { sizes: ['50', '52', '54'] })).toEqual({
      rawToken: 'DM100X',
      size: '52',
      quantity: 1,
    });
  });

  it('keeps legacy SKU quantity input unchanged when no size is present', () => {
    expect(parseBatchLabelInputLine('DM100X 2', { sizes: ['50', '52', '54'] })).toEqual({
      rawToken: 'DM100X',
      size: undefined,
      quantity: 2,
    });
  });
});
