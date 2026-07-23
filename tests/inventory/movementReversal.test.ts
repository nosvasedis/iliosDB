import { describe, expect, it } from 'vitest';
import { getInventoryEventReversalState, type InventoryEvent } from '../../features/inventory';

function event(overrides: Partial<InventoryEvent> = {}): InventoryEvent {
  return {
    id: 'event-1',
    sequenceNo: 1,
    operationType: 'stock_count',
    productSku: 'KL201',
    variantSuffix: 'X',
    sizeInfo: '',
    warehouseId: 'central',
    onHandDelta: 2,
    reservedDelta: 0,
    onHandAfter: 2,
    reservedAfter: 0,
    referenceType: null,
    referenceId: null,
    referenceLineId: null,
    transferGroupId: null,
    reversalOf: null,
    actorUserId: 'admin-1',
    actorName: 'Διαχειριστής',
    reason: 'Αρχική απογραφή',
    createdAt: '2026-07-23T08:00:00.000Z',
    ...overrides,
  };
}

describe('inventory movement reversal rules', () => {
  it('allows an administrator to reverse a manual stock count', () => {
    const target = event();
    expect(getInventoryEventReversalState(target, [target], true)).toEqual(
      expect.objectContaining({ canReverse: true, isReversed: false, isTransfer: false }),
    );
  });

  it('marks the immutable source as reversed after its compensating event exists', () => {
    const target = event();
    const reversal = event({
      id: 'reversal-1',
      operationType: 'movement_reversal',
      onHandDelta: -2,
      onHandAfter: 0,
      reversalOf: target.id,
    });
    expect(getInventoryEventReversalState(target, [target, reversal], true)).toEqual(
      expect.objectContaining({ canReverse: false, isReversed: true }),
    );
    expect(getInventoryEventReversalState(reversal, [target, reversal], true)).toEqual(
      expect.objectContaining({ canReverse: false, isReversal: true }),
    );
  });

  it('allows only a complete linked transfer pair', () => {
    const outgoing = event({
      id: 'out',
      operationType: 'transfer_out',
      transferGroupId: 'transfer-1',
      onHandDelta: -2,
      onHandAfter: 0,
    });
    const incoming = event({
      id: 'in',
      operationType: 'transfer_in',
      transferGroupId: 'transfer-1',
      warehouseId: 'showroom',
    });
    expect(getInventoryEventReversalState(outgoing, [outgoing], true).canReverse).toBe(false);
    expect(getInventoryEventReversalState(outgoing, [outgoing, incoming], true)).toEqual(
      expect.objectContaining({ canReverse: true, isTransfer: true }),
    );
  });

  it('protects business-document movements from history-level cancellation', () => {
    const shipment = event({ operationType: 'shipment_issue', referenceType: 'shipment', referenceId: 'ship-1' });
    const state = getInventoryEventReversalState(shipment, [shipment], true);
    expect(state.canReverse).toBe(false);
    expect(state.explanation).toContain('επιχειρησιακό έγγραφο');
  });
});
