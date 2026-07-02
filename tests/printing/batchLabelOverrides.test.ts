import { describe, expect, it } from 'vitest';
import { buildBatchLabelOverrideKey } from '../../features/printing/batchLabelOverrides';

describe('batch label override keys', () => {
  it('keeps row-specific overrides stable across duplicate SKUs with different rows and sizes', () => {
    expect(buildBatchLabelOverrideKey({ lineIndex: 0, rawSku: 'DM100X', quantity: 2, size: '52' })).toBe('0|DM100X|52|2');
    expect(buildBatchLabelOverrideKey({ lineIndex: 1, rawSku: 'DM100X', quantity: 2, size: '54' })).toBe('1|DM100X|54|2');
  });

  it('normalizes missing size while preserving quantity in the key', () => {
    expect(buildBatchLabelOverrideKey({ lineIndex: 3, rawSku: 'DA050XKR', quantity: 5 })).toBe('3|DA050XKR||5');
  });
});
