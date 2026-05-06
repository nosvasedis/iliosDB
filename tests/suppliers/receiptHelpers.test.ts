import { describe, expect, it } from 'vitest';
import { addReceivedSizeQuantity, resolveSupplierOrderProductReceiptTarget } from '../../features/suppliers/receiptHelpers';

describe('supplier receipt helpers', () => {
  it('targets an existing variant when the purchase line name includes a suffix', () => {
    expect(
      resolveSupplierOrderProductReceiptTarget(
        { item_id: 'KN005', item_name: 'KN005X' },
        [{ suffix: 'X' }, { suffix: 'P' }],
      ),
    ).toEqual({ sku: 'KN005', variantSuffix: 'X' });
  });

  it('falls back to master stock when the line has no known variant suffix', () => {
    expect(
      resolveSupplierOrderProductReceiptTarget(
        { item_id: 'KN005', item_name: 'KN005' },
        [{ suffix: 'X' }],
      ),
    ).toEqual({ sku: 'KN005', variantSuffix: null });

    expect(
      resolveSupplierOrderProductReceiptTarget(
        { item_id: 'KN005', item_name: 'KN005Z' },
        [{ suffix: 'X' }],
      ),
    ).toEqual({ sku: 'KN005', variantSuffix: null });
  });

  it('adds received quantity to a size bucket only when a size is present', () => {
    expect(addReceivedSizeQuantity({ '52': 2 }, '52', 3)).toEqual({ '52': 5 });
    expect(addReceivedSizeQuantity({ '52': 2 }, '', 3)).toBeUndefined();
  });
});
