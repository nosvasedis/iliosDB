import type { InventoryEvent } from './types';

const REVERSIBLE_MANUAL_OPERATIONS = new Set([
  'adjustment',
  'stock_count',
  'manual_stock_increase',
  'opening_reconciliation',
]);

export interface InventoryEventReversalState {
  canReverse: boolean;
  isReversal: boolean;
  isReversed: boolean;
  isTransfer: boolean;
  explanation: string;
}

/**
 * Keeps movement-action rules identical between desktop and compact layouts.
 * Business-document events are intentionally reversed through their owning
 * workflow; only manual postings and complete transfers are reversible here.
 */
export function getInventoryEventReversalState(
  event: InventoryEvent,
  events: InventoryEvent[],
  isAdmin: boolean,
): InventoryEventReversalState {
  const isReversal = event.operationType === 'movement_reversal' || Boolean(event.reversalOf);
  const isReversed = events.some((candidate) => candidate.reversalOf === event.id);
  const isTransfer = event.operationType === 'transfer_out' || event.operationType === 'transfer_in';

  if (isReversal) {
    return {
      canReverse: false,
      isReversal: true,
      isReversed: false,
      isTransfer,
      explanation: 'Η εγγραφή αποτελεί αντιλογιστική κίνηση και παραμένει στο ιστορικό για πλήρη ιχνηλασιμότητα.',
    };
  }
  if (isReversed) {
    return {
      canReverse: false,
      isReversal: false,
      isReversed: true,
      isTransfer,
      explanation: 'Η κίνηση έχει ήδη ακυρωθεί με αντιλογιστική εγγραφή.',
    };
  }
  if (!isAdmin) {
    return {
      canReverse: false,
      isReversal: false,
      isReversed: false,
      isTransfer,
      explanation: 'Η ακύρωση κίνησης επιτρέπεται μόνο σε διαχειριστή.',
    };
  }
  if (REVERSIBLE_MANUAL_OPERATIONS.has(event.operationType)) {
    return {
      canReverse: true,
      isReversal: false,
      isReversed: false,
      isTransfer: false,
      explanation: 'Η ακύρωση θα επαναφέρει ατομικά το προηγούμενο υπόλοιπο και θα καταγραφεί στο ιστορικό.',
    };
  }
  if (isTransfer) {
    const transferEvents = event.transferGroupId
      ? events.filter((candidate) => (
        candidate.transferGroupId === event.transferGroupId
        && (candidate.operationType === 'transfer_out' || candidate.operationType === 'transfer_in')
      ))
      : [];
    const completePair = transferEvents.length === 2
      && transferEvents.some((candidate) => candidate.operationType === 'transfer_out')
      && transferEvents.some((candidate) => candidate.operationType === 'transfer_in');
    const pairReversed = transferEvents.some((candidate) => (
      events.some((reversal) => reversal.reversalOf === candidate.id)
    ));
    return {
      canReverse: completePair && !pairReversed,
      isReversal: false,
      isReversed: pairReversed,
      isTransfer: true,
      explanation: completePair
        ? 'Η ακύρωση θα αντιλογίσει μαζί την εξαγωγή και την εισαγωγή της Ενδοδιακίνησης.'
        : 'Η Ενδοδιακίνηση δεν διαθέτει πλήρη συσχέτιση προέλευσης και προορισμού και δεν μπορεί να ακυρωθεί από εδώ.',
    };
  }
  return {
    canReverse: false,
    isReversal: false,
    isReversed: false,
    isTransfer: false,
    explanation: 'Η κίνηση προέρχεται από επιχειρησιακό έγγραφο. Η αναίρεση γίνεται από την αντίστοιχη παραγγελία, αποστολή ή παραλαβή.',
  };
}
