import type { BulkConsignmentGroupInput, BulkConsignmentLineInput } from './types';

export interface ConsignmentDraftRow {
  id: string;
  /** Groups SKU lines into one client card. Shared even before a customer is chosen. */
  blockId: string;
  customerId: string;
  warehouseId: string;
  sku: string;
  variantSuffix: string;
  sizeInfo: string;
  quantity: number;
  unitCost: number;
  unitPrice: number;
  reviewDate: string;
  notes: string;
  sourceOrderId: string;
  orderLineId: string;
}

export interface ConsignmentDraftCluster {
  blockId: string;
  customerId: string;
  rows: ConsignmentDraftRow[];
}

export const CONSIGNMENT_BULK_DRAFT_STORAGE_KEY = 'ilios.consignmentBulkDraft.v1';

export function plusDaysIsoDate(days: number): string {
  const value = new Date();
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

export function createEmptyConsignmentDraftRow(
  defaults: Partial<Pick<ConsignmentDraftRow, 'blockId' | 'customerId' | 'warehouseId' | 'reviewDate' | 'notes'>> = {},
): ConsignmentDraftRow {
  return {
    id: crypto.randomUUID(),
    blockId: defaults.blockId || crypto.randomUUID(),
    customerId: defaults.customerId || '',
    warehouseId: defaults.warehouseId || '',
    sku: '',
    variantSuffix: '',
    sizeInfo: '',
    quantity: 1,
    unitCost: 0,
    unitPrice: 0,
    reviewDate: defaults.reviewDate || plusDaysIsoDate(30),
    notes: defaults.notes || '',
    sourceOrderId: '',
    orderLineId: '',
  };
}

function identityKey(row: ConsignmentDraftRow): string {
  return [row.customerId, row.sku, row.variantSuffix || '', row.sizeInfo || ''].join('::');
}

export function validateConsignmentDraftRows(
  rows: ConsignmentDraftRow[],
  catalogSkus: Set<string>,
): string[] {
  const issues: string[] = [];
  if (rows.length === 0) {
    issues.push('Προσθέστε τουλάχιστον μία γραμμή Παρακαταθήκης.');
    return issues;
  }

  const seen = new Map<string, number>();
  for (const row of rows) {
    if (!row.customerId) issues.push('Κάθε γραμμή χρειάζεται πελάτη.');
    if (!row.warehouseId) issues.push('Κάθε γραμμή χρειάζεται αποθήκη προέλευσης.');
    if (!row.sku || !catalogSkus.has(row.sku)) issues.push('Επιλέξτε έγκυρο SKU από τον κατάλογο.');
    if (!(row.quantity > 0)) issues.push('Η ποσότητα πρέπει να είναι μεγαλύτερη από το μηδέν.');
    if (!(row.unitPrice >= 0)) issues.push('Η συμφωνημένη τιμή δεν μπορεί να είναι αρνητική.');
    if (!(row.unitCost >= 0)) issues.push('Το κόστος δεν μπορεί να είναι αρνητικό.');
    if (row.customerId && row.sku) {
      const key = identityKey(row);
      seen.set(key, (seen.get(key) || 0) + 1);
    }
  }

  if ([...seen.values()].some((count) => count > 1)) {
    issues.push('Υπάρχει διπλότυπη ταυτότητα γραμμής (πελάτης + SKU + παραλλαγή + μέγεθος).');
  }

  return [...new Set(issues)];
}

export function groupConsignmentDraftRows(
  rows: ConsignmentDraftRow[],
  sellerId?: string | null,
): BulkConsignmentGroupInput[] {
  const grouped = new Map<string, BulkConsignmentGroupInput>();
  for (const row of rows) {
    const key = `${row.customerId}:${row.warehouseId}:${row.reviewDate}:${row.sourceOrderId}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        customer_id: row.customerId,
        seller_id: sellerId || null,
        source_order_id: row.sourceOrderId || null,
        source_warehouse_id: row.warehouseId,
        review_due_at: row.reviewDate,
        notes: row.notes || null,
        lines: [],
      });
    }
    const line: BulkConsignmentLineInput = {
      product_sku: row.sku,
      variant_suffix: row.variantSuffix,
      size_info: row.sizeInfo,
      quantity: row.quantity,
      locked_unit_cost: row.unitCost,
      locked_unit_price: row.unitPrice,
      order_line_id: row.orderLineId || null,
    };
    grouped.get(key)!.lines.push(line);
  }
  return [...grouped.values()];
}

function clusterKey(row: ConsignmentDraftRow): string {
  return row.blockId || row.customerId || row.id;
}

export function clusterDraftRowsByCustomer(rows: ConsignmentDraftRow[]): ConsignmentDraftCluster[] {
  const order: string[] = [];
  const map = new Map<string, ConsignmentDraftRow[]>();
  for (const row of rows) {
    const key = clusterKey(row);
    if (!map.has(key)) {
      order.push(key);
      map.set(key, []);
    }
    map.get(key)!.push(row);
  }
  return order.map((key) => {
    const cluster = map.get(key)!;
    return { blockId: key, customerId: cluster[0]?.customerId || '', rows: cluster };
  });
}

export function serializeConsignmentDraft(rows: ConsignmentDraftRow[]): string {
  return JSON.stringify({ version: 1, rows });
}

export function parseConsignmentDraft(raw: string | null): ConsignmentDraftRow[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { version?: number; rows?: ConsignmentDraftRow[] };
    if (!Array.isArray(parsed?.rows) || parsed.rows.length === 0) return null;
    return parsed.rows
      .filter((row) => row && typeof row.id === 'string')
      .map((row) => ({
        ...row,
        blockId: row.blockId || row.customerId || row.id,
      }));
  } catch {
    return null;
  }
}
