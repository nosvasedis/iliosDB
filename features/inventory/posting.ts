import type {
  InventoryAvailability,
  InventoryPostingLine,
  InventoryPostingMode,
} from './types';

export interface InventoryPostingDraftLine {
  productSku: string;
  variantSuffix?: string | null;
  sizeInfo?: string | null;
  warehouseId: string;
  quantity: string | number | null | undefined;
}

export interface RecentInventorySelection {
  productSku: string;
  variantSuffix: string;
}

export interface InventorySelectionWarehouseSummary {
  warehouseId: string;
  warehouseName: string;
  onHand: number;
  reserved: number;
  available: number;
}

function canonicalNumber(value: string): string {
  const normalized = value.replace(',', '.');
  const numberValue = Number(normalized);
  if (!Number.isFinite(numberValue)) return value;
  return Number.isInteger(numberValue)
    ? String(Math.trunc(numberValue))
    : String(numberValue);
}

/**
 * Canonical inventory-size identity used before every composite-key lookup.
 * Numeric ring sizes stay numeric, lengths use a lowercase `cm` suffix and
 * documented special values are trimmed, NFC-normalized and uppercased.
 */
export function normalizeInventorySizeInfo(value: unknown): string {
  const trimmed = String(value ?? '')
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ');
  if (!trimmed) return '';

  const numericMatch = trimmed.match(/^(\d+(?:[.,]\d+)?)$/);
  if (numericMatch) return canonicalNumber(numericMatch[1]);

  const lengthMatch = trimmed.match(/^(\d+(?:[.,]\d+)?)\s*(?:cm|εκ\.?)$/i);
  if (lengthMatch) return `${canonicalNumber(lengthMatch[1])}cm`;

  return trimmed.toUpperCase();
}

export function isValidInventorySizeInfo(value: unknown): boolean {
  const normalized = normalizeInventorySizeInfo(value);
  return normalized.length <= 40
    && (!normalized || /^[\p{L}\p{N}][\p{L}\p{N} ._/-]*$/u.test(normalized));
}

export function inventoryPostingIdentityKey(
  identity: Pick<InventoryPostingLine, 'productSku' | 'variantSuffix' | 'sizeInfo' | 'warehouseId'>,
): string {
  return [
    identity.productSku.trim().toLocaleUpperCase('el-GR'),
    (identity.variantSuffix || '').trim().toLocaleUpperCase('el-GR'),
    normalizeInventorySizeInfo(identity.sizeInfo),
    identity.warehouseId,
  ].join('::');
}

export function buildInventoryPostingLines(
  draftLines: InventoryPostingDraftLine[],
  mode: InventoryPostingMode,
): InventoryPostingLine[] {
  const lines: InventoryPostingLine[] = [];
  const identities = new Set<string>();

  draftLines.forEach((draft, index) => {
    if (typeof draft.quantity === 'string' && draft.quantity.trim() === '') return;
    if (draft.quantity == null) return;

    const productSku = draft.productSku.trim().toLocaleUpperCase('el-GR');
    const variantSuffix = (draft.variantSuffix || '').trim().toLocaleUpperCase('el-GR');
    const sizeInfo = normalizeInventorySizeInfo(draft.sizeInfo);
    const warehouseId = draft.warehouseId.trim();
    const quantity = typeof draft.quantity === 'number'
      ? draft.quantity
      : Number(draft.quantity.replace(',', '.'));

    if (!productSku || !warehouseId) {
      throw new Error(`Η γραμμή ${index + 1} δεν έχει πλήρη ταυτότητα είδους και αποθήκης.`);
    }
    if (!isValidInventorySizeInfo(sizeInfo)) {
      throw new Error(`Το ειδικό μέγεθος στη γραμμή ${index + 1} δεν είναι έγκυρο.`);
    }
    if (!Number.isInteger(quantity)) {
      throw new Error(`Η ποσότητα στη γραμμή ${index + 1} πρέπει να είναι ακέραιος αριθμός τεμαχίων.`);
    }
    if (mode === 'count' && quantity < 0) {
      throw new Error(`Η μετρημένη ποσότητα στη γραμμή ${index + 1} δεν μπορεί να είναι αρνητική.`);
    }
    if (mode === 'increase' && quantity <= 0) {
      throw new Error(`Η ποσότητα προσθήκης στη γραμμή ${index + 1} πρέπει να είναι μεγαλύτερη από μηδέν.`);
    }

    const line: InventoryPostingLine = {
      productSku,
      variantSuffix,
      sizeInfo,
      warehouseId,
      quantity,
    };
    const identityKey = inventoryPostingIdentityKey(line);
    if (identities.has(identityKey)) {
      throw new Error(`Η ίδια παραλλαγή, μέγεθος και αποθήκη εμφανίζονται περισσότερες από μία φορές στη γραμμή ${index + 1}.`);
    }
    identities.add(identityKey);
    lines.push(line);
  });

  if (lines.length === 0) {
    throw new Error('Δεν έχει καταχωριστεί καμία ποσότητα. Τα κενά πεδία δεν θεωρούνται καταμετρημένα.');
  }
  return lines;
}

export function mergeRecentInventorySelections(
  current: RecentInventorySelection[],
  selection: RecentInventorySelection,
  limit = 6,
): RecentInventorySelection[] {
  const normalized = {
    productSku: selection.productSku.trim().toLocaleUpperCase('el-GR'),
    variantSuffix: (selection.variantSuffix || '').trim().toLocaleUpperCase('el-GR'),
  };
  const targetKey = `${normalized.productSku}::${normalized.variantSuffix}`;
  return [
    normalized,
    ...current.filter((item) => `${item.productSku}::${item.variantSuffix}` !== targetKey),
  ].slice(0, Math.max(1, limit));
}

export function summarizeInventorySelectionByWarehouse(
  rows: InventoryAvailability[],
  productSku: string,
  variantSuffix: string,
): InventorySelectionWarehouseSummary[] {
  const totals = new Map<string, InventorySelectionWarehouseSummary>();
  rows
    .filter((row) => row.productSku === productSku && row.variantSuffix === variantSuffix)
    .forEach((row) => {
      const current = totals.get(row.warehouseId) || {
        warehouseId: row.warehouseId,
        warehouseName: row.warehouseName,
        onHand: 0,
        reserved: 0,
        available: 0,
      };
      current.onHand += row.onHand;
      current.reserved += row.reserved;
      current.available += row.available;
      totals.set(row.warehouseId, current);
    });
  return Array.from(totals.values()).sort((left, right) => (
    left.warehouseName.localeCompare(right.warehouseName, 'el-GR', { sensitivity: 'base' })
  ));
}
