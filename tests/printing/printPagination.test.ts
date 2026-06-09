import { describe, expect, it } from 'vitest';
import { chunkPrintPages, getPrintPageItemIndex, INVOICE_PRINT_ITEMS_PER_PAGE } from '../../utils/printPagination';

describe('printPagination', () => {
  it('returns a single empty page when there are no items', () => {
    expect(chunkPrintPages([])).toEqual([[]]);
  });

  it('chunks items for explicit print pages', () => {
    const items = Array.from({ length: 45 }, (_, i) => i + 1);
    expect(chunkPrintPages(items, 38)).toEqual([
      items.slice(0, 38),
      items.slice(38),
    ]);
  });

  it('computes global item indexes across pages', () => {
    expect(getPrintPageItemIndex(1, 3)).toBe(INVOICE_PRINT_ITEMS_PER_PAGE + 3);
  });
});
