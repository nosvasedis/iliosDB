import { describe, expect, it } from 'vitest';
import {
  createEmptyRepairDraftRow,
  draftRowFromPreviousRepair,
  toRepairIntakeInput,
  validateRepairDraftRows,
  type RepairDraftRow,
} from '../../features/customerService/repairIntakeDraft';

const row = (overrides: Partial<RepairDraftRow> = {}): RepairDraftRow => ({
  ...createEmptyRepairDraftRow(),
  id: 'piece-1',
  originType: 'legacy_own',
  description: 'Σπασμένος κρίκος',
  ...overrides,
});

describe('repair intake draft', () => {
  it('rejects missing customer, empty description and unlinked recorded sale', () => {
    const issues = validateRepairDraftRows(
      '',
      [
        row({ id: 'a', description: '' }),
        row({ id: 'b', originType: 'recorded_sale', orderId: '', sourceConsignmentSettlementId: '' }),
        row({ id: 'c', originType: 'recorded_sale', orderId: 'ord-1', sku: 'MISSING' }),
      ],
      new Set(['RNG001']),
    );

    expect(issues.some((issue) => issue.includes('πελάτη'))).toBe(true);
    expect(issues.some((issue) => issue.includes('περιγραφή'))).toBe(true);
    expect(issues.some((issue) => issue.includes('Παρακαταθήκης') || issue.includes('παραγγελία'))).toBe(true);
    expect(issues.some((issue) => issue.includes('SKU'))).toBe(true);
  });

  it('allows legacy and third-party pieces without SKU, and maps a valid intake payload', () => {
    const rows = [
      row({ originType: 'legacy_own', sku: '', description: 'Παλιό δαχτυλίδι χωρίς καταχώριση' }),
      row({
        id: 'piece-2',
        originType: 'recorded_sale',
        orderId: 'ord-1',
        orderLineId: 'line-1',
        sku: 'RNG001',
        variantSuffix: 'DLE',
        description: 'Φθαρμένο κούμπωμα',
      }),
    ];

    expect(validateRepairDraftRows('cust-1', rows, new Set(['RNG001']))).toEqual([]);

    const payload = toRepairIntakeInput('cust-1', rows, { sellerId: 'seller-1', notes: 'Παραλαβή Δευτέρας' });
    expect(payload.customerId).toBe('cust-1');
    expect(payload.sellerId).toBe('seller-1');
    expect(payload.items).toHaveLength(2);
    expect(payload.items[0]).toMatchObject({ origin_type: 'legacy_own', product_sku: null });
    expect(payload.items[1]).toMatchObject({
      origin_type: 'recorded_sale',
      source_order_id: 'ord-1',
      product_sku: 'RNG001',
    });
  });

  it('pre-fills a linked rework ticket without reopening the closed repair', () => {
    const linked = draftRowFromPreviousRepair({
      id: 'rep-1',
      code: 'EP-1001',
      origin_type: 'recorded_sale',
      source_order_id: 'ord-1',
      product_sku: 'RNG001',
      variant_suffix: 'DLE',
    });
    expect(linked.previousRepairItemId).toBe('rep-1');
    expect(linked.description).toContain('EP-1001');
    expect(linked.sku).toBe('RNG001');
    expect(linked.id).not.toBe('rep-1');
  });
});
