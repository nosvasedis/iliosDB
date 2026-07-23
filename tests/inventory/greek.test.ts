import { describe, expect, it } from 'vitest';
import {
  formatInventoryDateTime,
  getDefaultWarehouseCategory,
  getWarehouseTypeLabel,
  formatInventoryInteger,
  formatInventoryQuantity,
  INVENTORY_TERMS,
  inventoryQuantityAgreement,
  OFFER_STATUS_LABELS,
  ORDER_STATUS_LABELS,
  toInventoryOperationError,
} from '../../features/inventory';

describe('Greek ERP inventory presentation', () => {
  it('uses the locked professional glossary', () => {
    expect(INVENTORY_TERMS).toMatchObject({
      onHand: 'Φυσικό Απόθεμα',
      reserved: 'Δεσμευμένο',
      available: 'Διαθέσιμο Απόθεμα',
      transfer: 'Ενδοδιακίνηση',
      movementHistory: 'Ιστορικό Κινήσεων',
      showroom: 'Εκθετήριο',
    });
  });

  it('formats quantities and numbers with el-GR singular and plural wording', () => {
    expect(formatInventoryQuantity(1)).toBe('1 τεμάχιο');
    expect(formatInventoryQuantity(2)).toBe('2 τεμάχια');
    expect(inventoryQuantityAgreement(1, 'θα δεσμευτεί', 'θα δεσμευτούν')).toBe('θα δεσμευτεί');
    expect(inventoryQuantityAgreement(2, 'θα δεσμευτεί', 'θα δεσμευτούν')).toBe('θα δεσμευτούν');
    expect(formatInventoryInteger(1234)).toMatch(/1[.\s]234/);
    expect(formatInventoryDateTime('2026-07-22T10:30:00.000Z')).not.toMatch(/Invalid|AM|PM/);
  });

  it('presents internal order and offer statuses in Greek', () => {
    expect(ORDER_STATUS_LABELS.Ready).toBe('Έτοιμη προς αποστολή');
    expect(ORDER_STATUS_LABELS.Delivered).toBe('Παραδοθείσα');
    expect(OFFER_STATUS_LABELS.Accepted).toBe('Αποδεκτή');
    expect(Object.values({ ...ORDER_STATUS_LABELS, ...OFFER_STATUS_LABELS }).join(' ')).not.toMatch(/Pending|Ready|Accepted|Declined/);
  });

  it('presents flexible warehouse roles without the misleading store label', () => {
    expect(getWarehouseTypeLabel('Central')).toBe('Προεπιλεγμένη Κεντρική');
    expect(getWarehouseTypeLabel('Showroom')).toBe('Δειγματολόγιο');
    expect(getWarehouseTypeLabel('Store')).toBe('Αποθηκευτικός χώρος');
    expect(getDefaultWarehouseCategory('Showroom')).toBe('Δειγματολόγιο πλασιέ');
    expect([
      getWarehouseTypeLabel('Central'),
      getWarehouseTypeLabel('Showroom'),
      getWarehouseTypeLabel('Store'),
    ].join(' ')).not.toContain('Κατάστημα');
  });

  it('never exposes raw database errors to the operator', () => {
    const error = toInventoryOperationError('transfer', new Error('duplicate key violates unique constraint inventory_balances_pkey'));
    expect(error.message).toContain('Η ενδοδιακίνηση δεν ολοκληρώθηκε');
    expect(error.message).toContain('Δεν πραγματοποιήθηκε καμία μεταβολή');
    expect(error.message).not.toMatch(/duplicate|constraint|inventory_balances/i);
  });

  it('preserves an operationally useful Greek transactional error', () => {
    const message = 'Η ενδοδιακίνηση δεν ολοκληρώθηκε. Το διαθέσιμο απόθεμα στην Κεντρική Αποθήκη είναι 4 τεμάχια. Δεν πραγματοποιήθηκε καμία μεταβολή.';
    expect(toInventoryOperationError('transfer', new Error(message)).message).toBe(message);
  });
});
