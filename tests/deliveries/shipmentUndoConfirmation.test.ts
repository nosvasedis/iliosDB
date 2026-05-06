import { describe, expect, it } from 'vitest';
import {
  buildShipmentUndoConfirmationToken,
  getLatestShipmentNumber,
  getShipmentUndoItemCount,
} from '../../components/deliveries/ShipmentUndoConfirmationModal';

describe('shipment undo confirmation helpers', () => {
  it('builds the exact Greek typed-confirmation token', () => {
    expect(buildShipmentUndoConfirmationToken(3)).toBe('ΑΝΑΙΡΕΣΗ #3');
  });

  it('sums shipped quantities for the warning summary', () => {
    expect(getShipmentUndoItemCount([
      { id: 'i1', shipment_id: 's1', sku: 'A', quantity: 2, price_at_order: 10 },
      { id: 'i2', shipment_id: 's1', sku: 'B', quantity: 5, price_at_order: 12 },
    ] as any)).toBe(7);
  });

  it('selects the latest shipment number for LIFO-only undo', () => {
    expect(getLatestShipmentNumber([
      { shipment_number: 2 },
      { shipment_number: 5 },
      { shipment_number: 4 },
    ])).toBe(5);
    expect(getLatestShipmentNumber([])).toBeNull();
  });
});
