import { describe, expect, it } from 'vitest';
import {
  canEditPendingConsignment,
  validatePendingConsignmentEdit,
} from '../../features/customerService/pendingConsignmentEdit';

const valid = {
  customerId: 'cust-1',
  sourceWarehouseId: '00000000-0000-0000-0000-000000000001',
  reviewDueAt: '2026-10-01',
  notes: 'Σημείωση',
  lines: [
    {
      id: 'line-1',
      product_sku: 'BR025',
      variant_suffix: 'DFI',
      size_info: '',
      quantity: 1,
      locked_unit_cost: 40,
      locked_unit_price: 120,
    },
  ],
};

describe('pending consignment edit', () => {
  it('allows edit only before handoff', () => {
    expect(canEditPendingConsignment('pending_handoff', null)).toBe(true);
    expect(canEditPendingConsignment('draft', null)).toBe(true);
    expect(canEditPendingConsignment('pending_handoff', '2026-09-01T07:00:00Z')).toBe(false);
    expect(canEditPendingConsignment('active', null)).toBe(false);
    expect(canEditPendingConsignment('cancelled', null)).toBe(false);
  });

  it('rejects missing client, protected warehouse, empty lines, unknown SKU and duplicates', () => {
    const catalog = new Set(['BR025', 'BR029']);
    const issues = validatePendingConsignmentEdit(
      {
        customerId: '',
        sourceWarehouseId: '00000000-0000-0000-0000-000000000003',
        reviewDueAt: '',
        lines: [
          { product_sku: '', variant_suffix: '', size_info: '', quantity: 0, locked_unit_cost: 0, locked_unit_price: -1 },
          { product_sku: 'MISSING', variant_suffix: '', size_info: '', quantity: 1, locked_unit_cost: 0, locked_unit_price: 10 },
          { product_sku: 'BR025', variant_suffix: 'DFI', size_info: '', quantity: 1, locked_unit_cost: 0, locked_unit_price: 10 },
          { product_sku: 'BR025', variant_suffix: 'DFI', size_info: '', quantity: 1, locked_unit_cost: 0, locked_unit_price: 10 },
        ],
      },
      catalog,
    );

    expect(issues.some((issue) => issue.includes('πελάτη'))).toBe(true);
    expect(issues.some((issue) => issue.includes('προστατευμένη'))).toBe(true);
    expect(issues.some((issue) => issue.includes('επανελέγχου'))).toBe(true);
    expect(issues.some((issue) => issue.includes('SKU'))).toBe(true);
    expect(issues.some((issue) => issue.includes('ποσότητα'))).toBe(true);
    expect(issues.some((issue) => issue.includes('διπλότυπη'))).toBe(true);
  });

  it('accepts a complete pending edit payload', () => {
    expect(validatePendingConsignmentEdit(valid, new Set(['BR025']))).toEqual([]);
  });
});
