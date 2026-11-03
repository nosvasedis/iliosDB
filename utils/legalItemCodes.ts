export const LEGAL_SHIPPING_ITEM_CODE = '000';
export const LEGAL_SHIPPING_ITEM_DESCRIPTION = 'Μεταφορικά';
export const LEGAL_REPAIR_ITEM_CODE = '001';
export const LEGAL_REPAIR_ITEM_NAME = 'Επισκευή';
export const LEGAL_REPAIR_ITEM_DESCRIPTION = 'Επισκευή Κοσμημάτων';

export const LEGAL_RESERVED_ITEM_CODES = [LEGAL_SHIPPING_ITEM_CODE, LEGAL_REPAIR_ITEM_CODE] as const;

/** Presentation within Παραστατικά only. These are never normal catalogue categories. */
export type LegalDocumentItemKind = 'goods' | 'repair' | 'shipping';
export const LEGAL_DOCUMENT_ITEM_KINDS: Array<{ id: LegalDocumentItemKind; label: string }> = [
  { id: 'goods', label: 'Προϊόντα' },
  { id: 'repair', label: 'Υπηρεσίες · Επισκευές' },
  { id: 'shipping', label: 'Χρεώσεις · Μεταφορικά' },
];
export function getLegalDocumentItemKind(code?: string | null): LegalDocumentItemKind {
  if (isLegalShippingItemCode(code)) return 'shipping';
  if (isLegalRepairItemCode(code)) return 'repair';
  return 'goods';
}

function normalizeReservedCode(value?: string | null): string {
  return String(value || '').trim().toUpperCase();
}

export function isLegalShippingItemCode(value?: string | null): boolean {
  return normalizeReservedCode(value) === LEGAL_SHIPPING_ITEM_CODE;
}

export function isLegalRepairItemCode(value?: string | null): boolean {
  return normalizeReservedCode(value) === LEGAL_REPAIR_ITEM_CODE;
}

export function isLegalReservedItemCode(value?: string | null): boolean {
  return (LEGAL_RESERVED_ITEM_CODES as readonly string[]).includes(normalizeReservedCode(value));
}
