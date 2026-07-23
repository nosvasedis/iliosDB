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
};

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
  return INVENTORY_OPERATION_LABELS[operationType as InventoryOperationType] || 'Κίνηση αποθέματος';
}

const OPERATION_FAILURE_MESSAGES: Record<InventoryMutationName, string> = {
  'save-order': 'Η παραγγελία δεν αποθηκεύτηκε και δεν πραγματοποιήθηκε καμία δέσμευση αποθέματος. Ελέγξτε τη σύνδεση και δοκιμάστε ξανά.',
  'release-order': 'Η αποδέσμευση αποθέματος δεν ολοκληρώθηκε. Δεν πραγματοποιήθηκε καμία μεταβολή.',
  'set-order-status': 'Η κατάσταση της παραγγελίας δεν ενημερώθηκε. Δεν πραγματοποιήθηκε καμία μεταβολή αποθέματος.',
  'delete-order': 'Η παραγγελία δεν διαγράφηκε και το δεσμευμένο απόθεμα παρέμεινε αμετάβλητο.',
  adjustment: 'Η διόρθωση αποθέματος δεν ολοκληρώθηκε. Δεν πραγματοποιήθηκε καμία μεταβολή.',
  'inventory-posting': 'Η καταχώριση αποθέματος δεν ολοκληρώθηκε. Δεν πραγματοποιήθηκε καμία μεταβολή. Ελέγξτε τις ποσότητες, τις αποθήκες και την αιτιολογία και δοκιμάστε ξανά.',
  transfer: 'Η ενδοδιακίνηση δεν ολοκληρώθηκε. Δεν πραγματοποιήθηκε καμία μεταβολή.',
  'supplier-receipt': 'Η παραλαβή δεν ολοκληρώθηκε. Η εντολή προμηθευτή και το απόθεμα παρέμειναν αμετάβλητα.',
  'ship-order': 'Η αποστολή δεν ολοκληρώθηκε. Δεν πραγματοποιήθηκε καμία μεταβολή σε απόθεμα, παραγωγή ή παραγγελία. Ελέγξτε τις έτοιμες ποσότητες και δοκιμάστε ξανά.',
  'revert-shipment': 'Η αναίρεση αποστολής δεν ολοκληρώθηκε. Δεν πραγματοποιήθηκε καμία μεταβολή σε απόθεμα, παραγωγή ή παραγγελία. Ελέγξτε ότι πρόκειται για την τελευταία αποστολή και δοκιμάστε ξανά.',
  'offer-conversion': 'Η προσφορά δεν μετατράπηκε σε παραγγελία. Δεν δημιουργήθηκε παραγγελία και δεν δεσμεύτηκε απόθεμα.',
  'reorder-policy': 'Το σημείο αναπαραγγελίας δεν αποθηκεύτηκε. Δεν πραγματοποιήθηκε καμία μεταβολή.',
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
  if (type === 'Central') return INVENTORY_TERMS.centralWarehouse;
  if (type === 'Showroom') return INVENTORY_TERMS.showroom;
  if (type === 'Store') return 'Κατάστημα';
  return 'Λοιπή Αποθήκη';
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
