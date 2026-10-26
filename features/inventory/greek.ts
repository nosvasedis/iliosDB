import type { OfferStatus, OrderStatus } from '../../types';
import type { InventoryMutationName, InventoryOperationType } from './types';

export const INVENTORY_TERMS = Object.freeze({
  pageTitle: 'Αποθήκη & Απόθεμα',
  onHand: 'Φυσικό Απόθεμα',
  reserved: 'Δεσμευμένο',
  available: 'Διαθέσιμο Απόθεμα',
  incoming: 'Αναμενόμενο Απόθεμα',
  outstandingDemand: 'Ανεκτέλεστη Ζήτηση',
  projectedAvailable: 'Προβλεπόμενο Διαθέσιμο',
  openOrderQuantity: 'Ποσότητα Ενεργών Παραγγελιών',
  shippedQuantity: 'Ήδη Αποσταλμένα',
  remainingOrderQuantity: 'Υπόλοιπο προς Εκπλήρωση',
  allocatedQuantity: 'Καλυμμένο με Δέσμευση',
  reservation: 'Δέσμευση Αποθέματος',
  adjustment: 'Διόρθωση Αποθέματος',
  stockCount: 'Απογραφή Αποθέματος',
  manualStockIncrease: 'Χειροκίνητη Προσθήκη Αποθέματος',
  transfer: 'Ενδοδιακίνηση',
  receipt: 'Παραλαβή Αποθέματος',
  issue: 'Εξαγωγή Αποθέματος',
  sourceWarehouse: 'Αποθήκη Προέλευσης',
  destinationWarehouse: 'Αποθήκη Προορισμού',
  reorderPoint: 'Σημείο Αναπαραγγελίας',
  movementHistory: 'Ιστορικό Κινήσεων',
  centralWarehouse: 'Κεντρική Αποθήκη',
  showroom: 'Εκθετήριο',
} as const);

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  Pending: 'Σε αναμονή',
  'In Production': 'Σε παραγωγή',
  Ready: 'Έτοιμη προς αποστολή',
  'Partially Delivered': 'Μερικώς παραδοθείσα',
  Delivered: 'Παραδοθείσα',
  Cancelled: 'Ακυρωμένη',
};

export const OFFER_STATUS_LABELS: Record<OfferStatus, string> = {
  Pending: 'Σε εκκρεμότητα',
  Accepted: 'Αποδεκτή',
  Declined: 'Απορριφθείσα',
};

export const INVENTORY_OPERATION_LABELS: Record<InventoryOperationType, string> = {
  order_reservation: 'Δέσμευση για παραγγελία',
  reservation_release: 'Αποδέσμευση παραγγελίας',
  adjustment: INVENTORY_TERMS.adjustment,
  stock_count: INVENTORY_TERMS.stockCount,
  manual_stock_increase: INVENTORY_TERMS.manualStockIncrease,
  transfer_out: 'Εξαγωγή ενδοδιακίνησης',
  transfer_in: 'Εισαγωγή ενδοδιακίνησης',
  supplier_receipt: INVENTORY_TERMS.receipt,
  shipment_issue: 'Εξαγωγή λόγω αποστολής',
  shipment_reversal: 'Επαναφορά λόγω αναίρεσης αποστολής',
  legacy_issue_reversal: 'Επαναφορά παλαιάς πρόωρης εξαγωγής',
  opening_reconciliation: 'Αρχική Συμφωνία Αποθέματος',
  movement_reversal: 'Ακύρωση Κίνησης Αποθέματος',
};

/**
 * Movements written by neighbouring workflows (consignments, repairs) share
 * the same ledger. Paired moves are stored as `<base>_out` / `<base>_in`.
 */
const WORKFLOW_OPERATION_LABELS: Record<string, string> = {
  consignment_handoff: 'Παράδοση σε Παρακαταθήκη',
  consignment_direct_in: 'Απευθείας καταχώριση σε Παρακαταθήκη',
  consignment_sale: 'Πώληση από Παρακαταθήκη',
  consignment_sale_reversal: 'Αναίρεση πώλησης Παρακαταθήκης',
  consignment_return: 'Επιστροφή από Παρακαταθήκη',
  consignment_return_reversal: 'Αναίρεση επιστροφής Παρακαταθήκης',
  consignment_restock: 'Επανένταξη επιστροφής στο απόθεμα',
  consignment_delete: 'Επαναφορά αποθέματος λόγω διαγραφής Παρακαταθήκης',
  consignment_damage: 'Ακατάλληλη επιστροφή Παρακαταθήκης',
  repair_consumption: 'Ανάλωση υλικού επισκευής',
};

export interface InventoryOperationCategory {
  id: 'manual' | 'count' | 'transfer' | 'order' | 'shipment' | 'receipt' | 'consignment' | 'reversal' | 'other';
  label: string;
}

export const INVENTORY_OPERATION_CATEGORIES: InventoryOperationCategory[] = [
  { id: 'count', label: 'Απογραφές' },
  { id: 'manual', label: 'Χειροκίνητες καταχωρίσεις' },
  { id: 'transfer', label: 'Ενδοδιακινήσεις' },
  { id: 'order', label: 'Δεσμεύσεις παραγγελιών' },
  { id: 'shipment', label: 'Αποστολές' },
  { id: 'receipt', label: 'Παραλαβές' },
  { id: 'consignment', label: 'Παρακαταθήκες & επισκευές' },
  { id: 'reversal', label: 'Ακυρώσεις' },
  { id: 'other', label: 'Λοιπές κινήσεις' },
];

export function getInventoryOperationCategory(operationType: string): InventoryOperationCategory['id'] {
  if (operationType === 'stock_count' || operationType === 'opening_reconciliation') return 'count';
  if (operationType === 'adjustment' || operationType === 'manual_stock_increase') return 'manual';
  if (operationType === 'transfer_out' || operationType === 'transfer_in') return 'transfer';
  if (operationType === 'order_reservation' || operationType === 'reservation_release') return 'order';
  if (operationType.startsWith('shipment_') || operationType === 'legacy_issue_reversal') return 'shipment';
  if (operationType === 'supplier_receipt') return 'receipt';
  if (operationType === 'movement_reversal') return 'reversal';
  if (operationType.startsWith('consignment_') || operationType.startsWith('repair_')) return 'consignment';
  return 'other';
}

const MOJIBAKE_PATTERN = /[ΞΟ][\u0080-ÿŒ-™]/;
const WINDOWS_1253_HIGH: Record<string, number> = {
  '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87,
  '‰': 0x89, '‹': 0x8b, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95,
  '–': 0x96, '—': 0x97, '™': 0x99, '›': 0x9b, '΅': 0xa1, 'Ά': 0xa2, '£': 0xa3,
  '¤': 0xa4, '¥': 0xa5, '¦': 0xa6, '§': 0xa7, '¨': 0xa8, '©': 0xa9, '«': 0xab,
  '¬': 0xac, '­': 0xad, '®': 0xae, '―': 0xaf, '°': 0xb0, '±': 0xb1, '²': 0xb2,
  '³': 0xb3, '΄': 0xb4, 'µ': 0xb5, '¶': 0xb6, '·': 0xb7, 'Έ': 0xb8, 'Ή': 0xb9,
  'Ί': 0xba, '»': 0xbb, 'Ό': 0xbc, '½': 0xbd, 'Ύ': 0xbe, 'Ώ': 0xbf,
};

function windows1253Byte(character: string): number | null {
  const code = character.codePointAt(0) ?? 0;
  if (code < 0x80) return code;
  if (WINDOWS_1253_HIGH[character] !== undefined) return WINDOWS_1253_HIGH[character];
  // Greek block: U+0386..U+03CE map linearly onto 0xB6..0xFE.
  if (code >= 0x0388 && code <= 0x03ce) return code - 0x0388 + 0xb8;
  if (code >= 0x80 && code <= 0xff) return code;
  return null;
}

/**
 * Restores Greek text that was stored as UTF-8 decoded through Windows-1253
 * (e.g. «Ξ‘Ο…Ο„ΟΞΌΞ±Ο„Ξ·» → «Αυτόματη»). Immutable ledger rows written before the
 * server repair keep their bytes; only their display is repaired. Text that is
 * not mojibake is returned unchanged.
 */
export function repairGreekMojibake(value: string | null | undefined): string {
  const text = String(value ?? '');
  if (!MOJIBAKE_PATTERN.test(text)) return text;
  const bytes: number[] = [];
  for (const character of text) {
    const byte = windows1253Byte(character);
    if (byte === null) return text;
    bytes.push(byte);
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes));
  } catch {
    return text;
  }
}

const integerFormatter = new Intl.NumberFormat('el-GR', { maximumFractionDigits: 0 });
const dateTimeFormatter = new Intl.DateTimeFormat('el-GR', {
  dateStyle: 'short',
  timeStyle: 'short',
});

export function formatInventoryInteger(value: number): string {
  return integerFormatter.format(Number.isFinite(value) ? value : 0);
}

export function formatInventoryQuantity(value: number, withUnit = true): string {
  const quantity = Number.isFinite(value) ? Math.trunc(value) : 0;
  const formatted = formatInventoryInteger(quantity);
  if (!withUnit) return formatted;
  return `${formatted} ${Math.abs(quantity) === 1 ? 'τεμάχιο' : 'τεμάχια'}`;
}

export function inventoryQuantityAgreement(value: number, singular: string, plural: string): string {
  return Math.abs(Math.trunc(Number.isFinite(value) ? value : 0)) === 1 ? singular : plural;
}

export function formatInventoryDateTime(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : dateTimeFormatter.format(date);
}

export function getInventoryOperationLabel(operationType: string): string {
  const known = INVENTORY_OPERATION_LABELS[operationType as InventoryOperationType]
    || WORKFLOW_OPERATION_LABELS[operationType];
  if (known) return known;
  const paired = operationType.match(/^(.+)_(out|in)$/);
  if (paired && WORKFLOW_OPERATION_LABELS[paired[1]]) {
    return `${WORKFLOW_OPERATION_LABELS[paired[1]]} · ${paired[2] === 'out' ? 'εξαγωγή' : 'εισαγωγή'}`;
  }
  return 'Κίνηση αποθέματος';
}

const OPERATION_FAILURE_MESSAGES: Record<InventoryMutationName, string> = {
  'availability-read': 'Η φόρτωση των υπολοίπων αποθέματος δεν ολοκληρώθηκε. Δεν μεταβλήθηκε κανένα δεδομένο. Ελέγξτε τη σύνδεση και πατήστε «Επανάληψη».',
  'count-session-start': 'Η Συνεδρία Απογραφής δεν δημιουργήθηκε. Δεν πραγματοποιήθηκε καμία μεταβολή. Ελέγξτε τα στοιχεία και τη σύνδεση και δοκιμάστε ξανά.',
  'count-session-batch': 'Η παρτίδα της Συνεδρίας Απογραφής δεν καταχωρίστηκε. Δεν πραγματοποιήθηκε καμία μεταβολή για την παρτίδα. Οι καταμετρήσεις παραμένουν αποθηκευμένες και μπορείτε να δοκιμάσετε ξανά.',
  'count-session-complete': 'Η Συνεδρία Απογραφής δεν ολοκληρώθηκε. Οι ήδη επιβεβαιωμένες παρτίδες παραμένουν καταχωρισμένες. Ελέγξτε τις εκκρεμότητες και δοκιμάστε ξανά.',
  'count-session-read': 'Οι Συνεδρίες Απογραφής δεν φορτώθηκαν. Δεν μεταβλήθηκε κανένα δεδομένο. Ελέγξτε τη σύνδεση και δοκιμάστε ξανά.',
  'count-session-abandon': 'Η Συνεδρία Απογραφής δεν εγκαταλείφθηκε. Δεν πραγματοποιήθηκε καμία μεταβολή. Ελέγξτε τη σύνδεση και δοκιμάστε ξανά.',
  'save-order':'Η παραγγελία δεν αποθηκεύτηκε και δεν πραγματοποιήθηκε καμία δέσμευση αποθέματος. Ελέγξτε τα στοιχεία της παραγγελίας, ανανεώστε τη σελίδα και δοκιμάστε ξανά. Αν το πρόβλημα επιμένει, ενημερώστε τον διαχειριστή.',
  'release-order': 'Η αποδέσμευση αποθέματος δεν ολοκληρώθηκε. Δεν πραγματοποιήθηκε καμία μεταβολή.',
  'set-order-status': 'Η κατάσταση της παραγγελίας δεν ενημερώθηκε. Δεν πραγματοποιήθηκε καμία μεταβολή αποθέματος.',
  'delete-order': 'Η παραγγελία δεν διαγράφηκε και το δεσμευμένο απόθεμα παρέμεινε αμετάβλητο.',
  adjustment: 'Η διόρθωση αποθέματος δεν ολοκληρώθηκε. Δεν πραγματοποιήθηκε καμία μεταβολή.',
  'inventory-posting': 'Η καταχώριση αποθέματος δεν ολοκληρώθηκε. Δεν πραγματοποιήθηκε καμία μεταβολή. Ελέγξτε τις ποσότητες, τις αποθήκες και την αιτιολογία και δοκιμάστε ξανά.',
  transfer: 'Η ενδοδιακίνηση δεν ολοκληρώθηκε. Δεν πραγματοποιήθηκε καμία μεταβολή.',
  'supplier-receipt': 'Η παραλαβή δεν ολοκληρώθηκε. Η εντολή προμηθευτή και το απόθεμα παρέμειναν αμετάβλητα.',
  'ship-order': 'Η αποστολή δεν ολοκληρώθηκε. Δεν πραγματοποιήθηκε καμία μεταβολή σε απόθεμα, παραγωγή ή παραγγελία. Ελέγξτε τις έτοιμες ποσότητες και δοκιμάστε ξανά.',
  'revert-shipment': 'Η αναίρεση αποστολής δεν ολοκληρώθηκε. Δεν πραγματοποιήθηκε καμία μεταβολή σε απόθεμα, παραγωγή ή παραγγελία. Ελέγξτε ότι πρόκειται για την τελευταία αποστολή και δοκιμάστε ξανά.',
  'reverse-movement': 'Η ακύρωση κίνησης δεν ολοκληρώθηκε. Δεν πραγματοποιήθηκε καμία μεταβολή στο απόθεμα ή στο Ιστορικό Κινήσεων. Ελέγξτε αν η κίνηση έχει ήδη ακυρωθεί ή αν πρέπει να αναιρεθεί από το αντίστοιχο επιχειρησιακό έγγραφο.',
  'offer-conversion': 'Η προσφορά δεν μετατράπηκε σε παραγγελία. Δεν δημιουργήθηκε παραγγελία και δεν δεσμεύτηκε απόθεμα.',
  'reorder-policy': 'Το σημείο αναπαραγγελίας δεν αποθηκεύτηκε. Δεν πραγματοποιήθηκε καμία μεταβολή.',
  'warehouse-save': 'Η αποθήκη δεν αποθηκεύτηκε. Δεν πραγματοποιήθηκε καμία μεταβολή. Ελέγξτε την ονομασία, την κατηγορία και τη λειτουργία αποθέματος και δοκιμάστε ξανά.',
  'warehouse-delete': 'Η αποθήκη δεν διαγράφηκε. Δεν πραγματοποιήθηκε καμία μεταβολή. Ελέγξτε αν διαθέτει υπόλοιπα, δεσμεύσεις ή ιστορικό κινήσεων.',
};

export class InventoryOperationError extends Error {
  constructor(
    public readonly operation: InventoryMutationName,
    message: string,
    public readonly causeValue?: unknown,
  ) {
    super(message);
    this.name = 'InventoryOperationError';
  }
}

export function isSafeGreekBusinessMessage(message: string): boolean {
  if (!/[\u0370-\u03ff\u1f00-\u1fff]/i.test(message)) return false;
  return !/(PGRST|SQLSTATE|relation |column |function |duplicate key|violates |schema cache|JWT)/i.test(message);
}

export function getGreekOperationalErrorMessage(error: unknown, fallback: string): string {
  const rawMessage = error instanceof Error
    ? error.message
    : typeof error === 'object' && error && 'message' in error
      ? String((error as { message?: unknown }).message || '')
      : '';
  return isSafeGreekBusinessMessage(rawMessage) ? rawMessage : fallback;
}

export function toInventoryOperationError(
  operation: InventoryMutationName,
  error: unknown,
): InventoryOperationError {
  if (error instanceof InventoryOperationError) return error;
  const message = getGreekOperationalErrorMessage(error, OPERATION_FAILURE_MESSAGES[operation]);
  return new InventoryOperationError(operation, message, error);
}

export function getWarehouseTypeLabel(type: string): string {
  if (type === 'Central') return 'Προεπιλεγμένη Κεντρική';
  if (type === 'Showroom') return 'Δειγματολόγιο';
  if (type === 'Store') return 'Αποθηκευτικός χώρος';
  return 'Λοιπή θέση αποθέματος';
}

export function getDefaultWarehouseCategory(type: string): string {
  if (type === 'Central') return 'Κεντρική λειτουργία';
  if (type === 'Showroom') return 'Δειγματολόγιο πλασιέ';
  if (type === 'Store') return 'Αποθηκευτικός χώρος';
  return 'Λοιπή θέση αποθέματος';
}

const RECONCILIATION_ISSUE_LABELS: Record<string, string> = {
  negative_opening_balance: 'Αρνητικό αρχικό υπόλοιπο',
  product_size_total_mismatch: 'Απόκλιση συνόλου προϊόντος και μεγεθών',
  variant_size_total_mismatch: 'Απόκλιση συνόλου παραλλαγής και μεγεθών',
  unknown_warehouse: 'Μη αναγνωρισμένη αποθήκη',
  duplicate_location_rows: 'Διπλές εγγραφές στην ίδια θέση αποθέματος',
  legacy_movement_inconsistency: 'Ασυνέπεια παλαιού ιστορικού κινήσεων',
  reservation_backfill_failed: 'Εκκρεμής αρχική δέσμευση παραγγελίας',
};

export function getReconciliationIssueLabel(issueType: string): string {
  return RECONCILIATION_ISSUE_LABELS[issueType] || 'Εκκρεμότητα συμφωνίας αποθέματος';
}
