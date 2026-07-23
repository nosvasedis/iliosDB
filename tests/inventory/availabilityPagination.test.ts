import { describe, expect, it, vi } from 'vitest';
import { loadAllInventoryAvailabilityPages } from '../../features/inventory/availabilityPagination';

type Row = {
  sku: string;
  warehouseId: string;
};

describe('complete inventory availability pagination', () => {
  it('loads every page beyond the PostgREST 1.000-row response limit', async () => {
    const source: Row[] = Array.from({ length: 2_205 }, (_, index) => ({
      sku: `SKU${String(index + 1).padStart(4, '0')}`,
      warehouseId: 'central',
    }));
    source[1_760] = { sku: 'KL201X', warehouseId: 'central' };
    const loader = vi.fn(async (from: number, to: number, includeCount: boolean) => ({
      rows: source.slice(from, to + 1),
      totalCount: includeCount ? source.length : null,
    }));

    const rows = await loadAllInventoryAvailabilityPages(
      loader,
      (row) => `${row.sku}:${row.warehouseId}`,
      1_000,
    );

    expect(rows).toHaveLength(2_205);
    expect(rows[1_760]?.sku).toBe('KL201X');
    expect(loader).toHaveBeenCalledTimes(3);
    expect(loader).toHaveBeenNthCalledWith(1, 0, 999, true);
    expect(loader).toHaveBeenNthCalledWith(2, 1_000, 1_999, false);
    expect(loader).toHaveBeenNthCalledWith(3, 2_000, 2_999, false);
  });

  it('rejects a partial result instead of allowing missing SKUs to appear as zero', async () => {
    const loader = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [{ sku: 'SKU1', warehouseId: 'central' }],
        totalCount: 2,
      });

    await expect(loadAllInventoryAvailabilityPages(
      loader,
      (row: Row) => `${row.sku}:${row.warehouseId}`,
      1_000,
    )).rejects.toThrow('Ανακτήθηκαν 1 από 2 εγγραφές');
  });

  it('rejects duplicate composite inventory identities', async () => {
    const row = { sku: 'KL201X', warehouseId: 'central' };

    await expect(loadAllInventoryAvailabilityPages(
      async () => ({ rows: [row, row], totalCount: 2 }),
      (item) => `${item.sku}:${item.warehouseId}`,
    )).rejects.toThrow('διπλή θέση αποθέματος');
  });
});
