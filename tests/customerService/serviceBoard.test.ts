import { describe, expect, it } from 'vitest';
import {
  buildPurchaseChips,
  buildSettlementSteps,
  consignmentColumn,
  extractCreatedConsignmentIds,
  findTaggedConsignmentOrderLines,
  nextConsignmentAction,
  nextRepairAction,
  repairColumn,
  repairOutstanding,
  summarizeConsignment,
} from '../../features/customerService/serviceBoard';
import type { ConsignmentLine, ConsignmentReturn, ConsignmentSettlement } from '../../types';

const line = (patch: Partial<ConsignmentLine> = {}): ConsignmentLine => ({
  id: 'l1', consignment_id: 'c1', product_sku: 'XR100', variant_suffix: '', size_info: '',
  quantity: 5, sold_quantity: 0, returned_quantity: 0, pending_quantity: 5,
  locked_unit_cost: 10, locked_unit_price: 20, created_at: '', updated_at: '', ...patch,
});
const settlement = (patch: Partial<ConsignmentSettlement> = {}): ConsignmentSettlement => ({
  id: 's1', consignment_line_id: 'l1', quantity: 1, unit_price: 20, total_amount: 20, paid_amount: 0,
  status: 'due', sold_at: '2026-10-01', created_at: '', updated_at: '', ...patch,
});
const ret = (patch: Partial<ConsignmentReturn> = {}): ConsignmentReturn => ({
  id: 'r1', consignment_line_id: 'l1', quantity: 1, status: 'inspection', received_at: '', created_at: '', updated_at: '', ...patch,
});

describe('Παρακαταθήκες — πίνακας', () => {
  const now = new Date('2026-10-13T10:00:00');

  it('υπολογίζει σύνοψη, οφειλή και εκπρόθεσμο', () => {
    const summary = summarizeConsignment(
      { status: 'active', review_due_at: '2026-10-01' },
      [line({ pending_quantity: 3 })],
      [settlement({ total_amount: 40, paid_amount: 15 }), settlement({ id: 's2', status: 'reversed', total_amount: 99 })],
      [ret()],
      now,
    );
    expect(summary).toMatchObject({ pending: 3, value: 60, cost: 30, due: 25, openReturns: 1, overdue: true, dueSoon: false });
  });

  it('σημειώνει «σύντομα» μέσα σε 7 ημέρες', () => {
    const summary = summarizeConsignment({ status: 'active', review_due_at: '2026-10-18' }, [line()], [], [], now);
    expect(summary.overdue).toBe(false);
    expect(summary.dueSoon).toBe(true);
  });

  it('τοποθετεί κάθε Παρακαταθήκη στη σωστή στήλη', () => {
    expect(consignmentColumn({ status: 'pending_handoff' }, { pending: 5, due: 0, openReturns: 0 })).toBe('handoff');
    expect(consignmentColumn({ status: 'active' }, { pending: 5, due: 20, openReturns: 0 })).toBe('at_customer');
    expect(consignmentColumn({ status: 'partially_settled' }, { pending: 0, due: 20, openReturns: 0 })).toBe('to_collect');
    expect(consignmentColumn({ status: 'completed' }, { pending: 0, due: 0, openReturns: 1 })).toBe('to_collect');
    expect(consignmentColumn({ status: 'completed' }, { pending: 0, due: 0, openReturns: 0 })).toBe('closed');
    expect(consignmentColumn({ status: 'cancelled' }, { pending: 0, due: 0, openReturns: 0 })).toBe('closed');
  });

  it('προτείνει μία επόμενη ενέργεια', () => {
    expect(nextConsignmentAction({ status: 'pending_handoff' }, { pending: 5, due: 0, openReturns: 0 })).toBe('handoff');
    expect(nextConsignmentAction({ status: 'active' }, { pending: 5, due: 0, openReturns: 1 })).toBe('route-return');
    expect(nextConsignmentAction({ status: 'active' }, { pending: 5, due: 30, openReturns: 0 })).toBe('settle');
    expect(nextConsignmentAction({ status: 'completed' }, { pending: 0, due: 30, openReturns: 0 })).toBe('collect');
    expect(nextConsignmentAction({ status: 'completed' }, { pending: 0, due: 0, openReturns: 0 })).toBeNull();
    expect(nextConsignmentAction({ status: 'cancelled' }, { pending: 5, due: 0, openReturns: 0 })).toBeNull();
  });

  it('μετατρέπει τον απολογισμό σε πωλήσεις και επιστροφές', () => {
    const { steps, issues } = buildSettlementSteps([
      { lineId: 'a', pending: 5, sold: 2, returned: 1, unitPrice: 20 },
      { lineId: 'b', pending: 3, sold: 0, returned: 0, unitPrice: 10 },
    ]);
    expect(issues).toEqual([]);
    expect(steps).toEqual([
      { kind: 'sale', lineId: 'a', quantity: 2, unitPrice: 20 },
      { kind: 'return', lineId: 'a', quantity: 1 },
    ]);
  });

  it('απορρίπτει απολογισμό χωρίς κινήσεις ή πάνω από τα τεμάχια', () => {
    expect(buildSettlementSteps([{ lineId: 'a', pending: 2, sold: 0, returned: 0, unitPrice: 1 }]).issues).toHaveLength(1);
    const over = buildSettlementSteps([{ lineId: 'a', pending: 2, sold: 2, returned: 1, unitPrice: 1 }]);
    expect(over.steps).toEqual([]);
    expect(over.issues[0]).toMatch(/ξεπερνούν/);
  });

  it('διαβάζει τα νέα ids από το αποτέλεσμα δημιουργίας', () => {
    expect(extractCreatedConsignmentIds({ consignments: [{ id: 'x', code: 'P-1' }, { id: 'y' }] })).toEqual(['x', 'y']);
    expect(extractCreatedConsignmentIds(null)).toEqual([]);
  });

  it('βρίσκει γραμμές παραγγελιών σημειωμένες ως Παρακαταθήκη', () => {
    const orders = [
      { id: 'o1', customer_id: 'c', items: [
        { sku: 'A', line_id: 'x', fulfillment_mode: 'consignment', quantity: 2, price_at_order: 15 },
        { sku: 'B', line_id: 'y', fulfillment_mode: 'sale', quantity: 1 },
        { sku: 'C', line_id: 'z', fulfillment_mode: 'consignment', quantity: 1 },
      ] },
      { id: 'o2', customer_id: 'other', items: [{ sku: 'D', line_id: 'w', fulfillment_mode: 'consignment' }] },
    ];
    const tagged = findTaggedConsignmentOrderLines('c', orders, new Set(['z']));
    expect(tagged.map((entry) => entry.sku)).toEqual(['A']);
    expect(tagged[0]).toMatchObject({ orderId: 'o1', orderLineId: 'x', quantity: 2, unitPrice: 15 });
  });
});

describe('Επισκευές — πίνακας', () => {
  it('τοποθετεί κάθε επισκευή στη σωστή στήλη', () => {
    expect(repairColumn({ status: 'received' })).toBe('received');
    expect(repairColumn({ status: 'received' }, true)).toBe('production');
    expect(repairColumn({ status: 'in_production' }, true, true)).toBe('on_hold');
    expect(repairColumn({ status: 'quality_check' })).toBe('quality');
    expect(repairColumn({ status: 'ready_for_return' })).toBe('ready');
    expect(repairColumn({ status: 'delivered' })).toBe('history');
    expect(repairColumn({ status: 'irreparable' })).toBe('history');
  });

  it('προτείνει μία επόμενη ενέργεια', () => {
    expect(nextRepairAction({ status: 'received' }, false)).toBe('send-to-production');
    expect(nextRepairAction({ status: 'in_production' }, true)).toBe('open-production');
    expect(nextRepairAction({ status: 'in_production' }, true, true)).toBe('resume');
    expect(nextRepairAction({ status: 'quality_check' }, false)).toBe('quality');
    expect(nextRepairAction({ status: 'ready_for_return' }, false)).toBe('deliver');
    expect(nextRepairAction({ status: 'delivered' }, false)).toBe('rework');
    expect(nextRepairAction({ status: 'cancelled' }, false)).toBeNull();
  });

  it('υπολογίζει υπόλοιπο μόνο για χρεώσιμες', () => {
    expect(repairOutstanding({ charge_type: 'chargeable', amount: 30, paid_amount: 10 })).toBe(20);
    expect(repairOutstanding({ charge_type: 'warranty', amount: 30, paid_amount: 0 })).toBe(0);
    expect(repairOutstanding(undefined)).toBe(0);
  });

  it('φτιάχνει προτάσεις από αγορές του πελάτη, νεότερες πρώτα', () => {
    const chips = buildPurchaseChips(
      'c',
      [
        { id: 'old', customer_id: 'c', created_at: '2025-01-01', items: [{ sku: 'A', line_id: '1' }] },
        { id: 'new', customer_id: 'c', created_at: '2026-01-01', items: [{ sku: 'B', line_id: '2' }] },
        { id: 'x', customer_id: 'other', items: [{ sku: 'Z', line_id: '3' }] },
      ],
      [{ id: 's', customerId: 'c', sku: 'K', variantSuffix: '', sizeInfo: '', soldAt: '2026-02-01' }],
    );
    expect(chips.map((chip) => chip.sku)).toEqual(['B', 'A', 'K']);
    expect(chips[2]).toMatchObject({ source: 'consignment', settlementId: 's' });
    expect(buildPurchaseChips('', [], [])).toEqual([]);
  });
});
