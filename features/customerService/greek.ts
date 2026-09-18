import type {
  ConsignmentStatus,
  FinancialStatus,
  RepairOriginType,
  RepairStatus,
} from '../../types';

export const CONSIGNMENT_STATUS_LABELS: Record<ConsignmentStatus, string> = {
  draft: 'Πρόχειρη',
  pending_handoff: 'Προς παράδοση',
  active: 'Ενεργή',
  partially_settled: 'Μερικώς τακτοποιημένη',
  completed: 'Ολοκληρωμένη',
  cancelled: 'Ακυρωμένη',
};

export const FINANCIAL_STATUS_LABELS: Record<FinancialStatus, string> = {
  not_due: 'Δεν οφείλεται ακόμη',
  due: 'Οφειλή',
  partial: 'Μερική εξόφληση',
  paid: 'Εξοφλημένη',
};

export const SETTLEMENT_STATUS_LABELS = {
  due: 'Οφειλή',
  partial: 'Μερική εξόφληση',
  paid: 'Εξοφλημένη',
  reversed: 'Αντεστραμμένη',
} as const;

export const CONSIGNMENT_RETURN_STATUS_LABELS = {
  inspection: 'Σε έλεγχο',
  restocked: 'Επανατοποθετήθηκε',
  production: 'Στην Παραγωγή',
  damaged: 'Ζημιά / διαφορά',
  reversed: 'Αντεστραμμένη',
} as const;

export const REPAIR_STATUS_LABELS: Record<RepairStatus, string> = {
  received: 'Παραλήφθηκε',
  in_production: 'Στην Παραγωγή',
  quality_check: 'Ποιοτικός έλεγχος',
  ready_for_return: 'Έτοιμο για παράδοση',
  delivered: 'Παραδόθηκε',
  on_hold: 'Σε αναμονή',
  irreparable: 'Μη επισκευάσιμο',
  cancelled: 'Ακυρώθηκε',
};

export const REPAIR_ORIGIN_LABELS: Record<RepairOriginType, string> = {
  recorded_sale: 'Καταγεγραμμένη πώληση',
  legacy_own: 'Παλαιό δικό μας χωρίς καταχώριση',
  third_party: 'Προϊόν άλλης προέλευσης',
};

export const REPAIR_CHARGE_TYPE_LABELS = {
  warranty: 'Δωρεάν / εγγύηση',
  chargeable: 'Χρεώσιμη',
  unrecorded: 'Χωρίς καταχώριση χρέωσης',
} as const;

export const REPAIR_COST_TYPE_LABELS = {
  labor: 'Εργασία',
  material: 'Υλικό',
  component: 'Εξάρτημα',
  external: 'Εξωτερική εργασία',
} as const;

export const WORKFLOW_KIND_LABELS = {
  order: 'Παραγγελία',
  consignment: 'Παρακαταθήκη',
  repair: 'Επισκευή',
} as const;

export const FULFILLMENT_MODE_LABELS = {
  sale: 'Πώληση',
  consignment: 'Παρακαταθήκη',
} as const;

export const REPAIR_EVENT_LABELS: Record<string, string> = {
  received: 'Παραλαβή',
  production_stage_changed: 'Αλλαγή σταδίου Παραγωγής',
  production_completed: 'Ολοκλήρωση Παραγωγής',
  removed_from_production: 'Αφαίρεση από Παραγωγή',
  returned_to_production: 'Επιστροφή στην Παραγωγή',
  archived: 'Αρχειοθέτηση',
  unarchived: 'Ανάκτηση από αρχείο',
  quality_passed: 'Επιτυχής ποιοτικός έλεγχος',
  quality_failed_rework: 'Αποτυχία ελέγχου / επανεργασία',
  delivered: 'Παράδοση',
  status_changed: 'Αλλαγή κατάστασης',
  cost_recorded: 'Καταγραφή κόστους',
  charge_updated: 'Ενημέρωση χρέωσης',
  legal_draft_created: 'Πρόχειρο παραστατικό',
};

export const REPAIR_ATTACHMENT_TYPE_LABELS = {
  intake: 'Παραλαβή',
  quality: 'Ποιοτικός έλεγχος',
  other: 'Άλλο',
} as const;

export const REPAIR_QUALITY_STATUS_LABELS = {
  pending: 'Εκκρεμεί',
  passed: 'Επιτυχής',
  failed: 'Αποτυχία',
} as const;

export const CONSIGNMENT_EVENT_LABELS: Record<string, string> = {
  created: 'Δημιουργία',
  updated: 'Επεξεργασία',
  handed_off: 'Παράδοση στον πελάτη',
  price_overridden: 'Αλλαγή κλειδωμένης τιμής',
  sale_recorded: 'Δήλωση πώλησης',
  payment_recorded: 'Είσπραξη',
  return_received: 'Παραλαβή επιστροφής',
  return_routed: 'Δρομολόγηση επιστροφής',
  sale_reversed: 'Αντιστροφή πώλησης',
  return_reversed: 'Αντιστροφή επιστροφής',
  cancelled: 'Ακύρωση',
  legal_draft_created: 'Πρόχειρο παραστατικό',
};

export function formatGreekMoney(value: number): string {
  return new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR' }).format(value || 0);
}

export function formatGreekNumber(value: number): string {
  return new Intl.NumberFormat('el-GR', { maximumFractionDigits: 2 }).format(value || 0);
}

export function formatGreekDateTime(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('el-GR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatGreekDateOnly(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('el-GR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

export function customerServiceErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String((error as any)?.message || error || '');
  if (!message) return 'Η ενέργεια δεν ολοκληρώθηκε.';
  if (/network|fetch|offline/i.test(message)) {
    return 'Η ενέργεια απαιτεί ενεργή σύνδεση. Δεν πραγματοποιήθηκε καμία μεταβολή.';
  }
  return message;
}
