import { describe, expect, it } from 'vitest';
import {
  clusterDraftRowsByCustomer,
  groupConsignmentDraftRows,
  parseConsignmentDraft,
  validateConsignmentDraftRows,
  type ConsignmentDraftRow,
} from '../../features/customerService/bulkConsignmentDraft';

const row = (overrides: Partial<ConsignmentDraftRow> = {}): ConsignmentDraftRow => ({
  id: 'row-1',
  blockId: 'block-1',
  customerId: 'cust-1',
  warehouseId: 'wh-1',
  sku: 'RNG001',
  variantSuffix: 'DLE',
  sizeInfo: '',
  quantity: 2,
  unitCost: 40,
  unitPrice: 120,
  reviewDate: '2026-09-30',
  notes: '',
  sourceOrderId: '',
  orderLineId: '',
  ...overrides,
});

describe('bulk consignment draft', () => {
  it('rejects missing client, unknown SKU, zero quantity and duplicate identity', () => {
    const issues = validateConsignmentDraftRows(
      [
        row({ id: 'a', customerId: '', sku: 'RNG001' }),
        row({ id: 'b', sku: 'MISSING', customerId: 'cust-1' }),
        row({ id: 'c', quantity: 0 }),
        row({ id: 'd' }),
        row({ id: 'e', sku: 'RNG001', variantSuffix: 'DLE' }),
      ],
      new Set(['RNG001']),
    );

    expect(issues.some((issue) => issue.includes('πελάτη'))).toBe(true);
    expect(issues.some((issue) => issue.includes('SKU'))).toBe(true);
    expect(issues.some((issue) => issue.includes('ποσότητα'))).toBe(true);
    expect(issues.some((issue) => issue.includes('διπλότυπη'))).toBe(true);
  });

  it('groups valid rows by client, warehouse and review date for an all-or-nothing commit', () => {
    const groups = groupConsignmentDraftRows(
      [
        row({ id: 'a', customerId: 'cust-1', quantity: 2, notes: 'A' }),
        row({ id: 'b', customerId: 'cust-1', sku: 'RNG010', variantSuffix: '', quantity: 1 }),
        row({ id: 'c', customerId: 'cust-2', warehouseId: 'wh-2', reviewDate: '2026-10-01' }),
      ],
      'seller-1',
    );

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      customer_id: 'cust-1',
      seller_id: 'seller-1',
      source_warehouse_id: 'wh-1',
    });
    expect(groups[0].lines).toHaveLength(2);
    expect(groups[1]).toMatchObject({
      customer_id: 'cust-2',
      source_warehouse_id: 'wh-2',
      review_due_at: '2026-10-01',
    });
  });

  it('keeps extra SKU lines in the same client block before a customer is selected', () => {
    const clustered = clusterDraftRowsByCustomer([
      row({ id: 'a', customerId: '', blockId: 'block-open', sku: 'RNG001' }),
      row({ id: 'b', customerId: '', blockId: 'block-open', sku: 'RNG010', variantSuffix: '' }),
      row({ id: 'c', customerId: '', blockId: 'block-other', sku: 'RNG011', variantSuffix: '' }),
    ]);

    expect(clustered).toHaveLength(2);
    expect(clustered[0]).toMatchObject({ blockId: 'block-open', customerId: '' });
    expect(clustered[0].rows.map((item) => item.id)).toEqual(['a', 'b']);
    expect(clustered[1].blockId).toBe('block-other');
  });

  it('restores older drafts by grouping known customers onto one block', () => {
    const { blockId: _unused, ...legacy } = row({ id: 'a', customerId: 'cust-1' });
    const restored = parseConsignmentDraft(JSON.stringify({ version: 1, rows: [legacy] }));
    expect(restored?.[0].blockId).toBe('cust-1');
  });
});
