import { describe, expect, it } from 'vitest';
import { parseBatchLabelInputLine } from '../../features/printing/batchLabelInput';

describe('batch label input parsing', () => {
  it.each(['RN001P-62', 'DA012DLA-62', 'RN199-62'])('keeps %s size separate from quantity', sku => {
    expect(parseBatchLabelInputLine(`${sku} 62`, { sizes: ['60', '62'] })).toEqual({
      rawToken: sku, size: '62', quantity: 62,
    });
    expect(parseBatchLabelInputLine(sku, { sizes: ['60', '62'] })?.quantity).toBe(1);
  });

  it('normalizes bracelet sizes while preserving quantity and legacy ranges', () => {
    expect(parseBatchLabelInputLine('BR001-19 3', { sizes: ['17cm', '19cm'] })).toMatchObject({ size: '19cm', quantity: 3 });
    expect(parseBatchLabelInputLine('RN001P-RN003P 2', { sizes: ['62'] })).toMatchObject({ rawToken: 'RN001P-RN003P', size: undefined, quantity: 2 });
  });
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
