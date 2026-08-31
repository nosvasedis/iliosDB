import type { RepairIntakeInput, RepairItemInput } from './types';
import type { RepairOriginType } from '../../types';

export interface RepairDraftRow {
  id: string;
  originType: RepairOriginType;
  orderId: string;
  orderLineId: string;
  sku: string;
  variantSuffix: string;
  sizeInfo: string;
  description: string;
  intakeCondition: string;
  accessories: string;
  previousRepairItemId: string;
  sourceConsignmentSettlementId: string;
}

export const REPAIR_INTAKE_DRAFT_STORAGE_KEY = 'ilios.repairIntakeDraft.v1';

export function createEmptyRepairDraftRow(previous?: Partial<RepairDraftRow>): RepairDraftRow {
  return {
    id: previous?.id || crypto.randomUUID(),
    originType: previous?.originType || 'recorded_sale',
    orderId: previous?.orderId || '',
    orderLineId: previous?.orderLineId || '',
    sku: previous?.sku || '',
    variantSuffix: previous?.variantSuffix || '',
    sizeInfo: previous?.sizeInfo || '',
    description: previous?.description || '',
    intakeCondition: previous?.intakeCondition || '',
    accessories: previous?.accessories || '',
    previousRepairItemId: previous?.previousRepairItemId || '',
    sourceConsignmentSettlementId: previous?.sourceConsignmentSettlementId || '',
  };
}

export function draftRowFromPreviousRepair(previous: {
  id: string;
  code: string;
  origin_type: RepairOriginType;
  source_order_id?: string | null;
  source_order_line_id?: string | null;
  product_sku?: string | null;
  variant_suffix?: string | null;
  size_info?: string | null;
  source_consignment_settlement_id?: string | null;
}): RepairDraftRow {
  return createEmptyRepairDraftRow({
    originType: previous.origin_type,
    orderId: previous.source_order_id || '',
    orderLineId: previous.source_order_line_id || '',
    sku: previous.product_sku || '',
    variantSuffix: previous.variant_suffix || '',
    sizeInfo: previous.size_info || '',
    description: `Επανεπισκευή μετά από ${previous.code}: `,
    previousRepairItemId: previous.id,
    sourceConsignmentSettlementId: previous.source_consignment_settlement_id || '',
  });
}

export function validateRepairDraftRows(
  customerId: string,
  rows: RepairDraftRow[],
  catalogSkus: Set<string> = new Set(),
): string[] {
  const issues: string[] = [];
  if (!customerId) issues.push('Επιλέξτε πελάτη για την παραλαβή.');
  if (rows.length === 0) issues.push('Προσθέστε τουλάχιστον ένα τεμάχιο.');

  rows.forEach((row, index) => {
    const piece = `Τεμάχιο ${index + 1}`;
    if (!row.description.trim()) issues.push(`${piece}: απαιτείται περιγραφή βλάβης.`);
    if (row.originType === 'recorded_sale' && !row.orderId && !row.sourceConsignmentSettlementId) {
      issues.push(`${piece}: συνδέστε παραγγελία ή πώληση Παρακαταθήκης, ή αλλάξτε προέλευση.`);
    }
    if (row.originType === 'recorded_sale' && row.sku && catalogSkus.size > 0 && !catalogSkus.has(row.sku)) {
      issues.push(`${piece}: επιλέξτε έγκυρο SKU από τον κατάλογο ή αλλάξτε προέλευση.`);
    }
  });

  return [...new Set(issues)];
}

export function toRepairIntakeInput(
  customerId: string,
  rows: RepairDraftRow[],
  options: { sellerId?: string | null; notes?: string | null } = {},
): RepairIntakeInput {
  return {
    customerId,
    sellerId: options.sellerId || null,
    notes: options.notes || null,
    items: rows.map((row): RepairItemInput => ({
      origin_type: row.originType,
      source_order_id: row.orderId || null,
      source_order_line_id: row.orderLineId || null,
      source_consignment_settlement_id: row.sourceConsignmentSettlementId || null,
      product_sku: row.sku || null,
      variant_suffix: row.variantSuffix,
      size_info: row.sizeInfo,
      description: row.description.trim(),
      intake_condition: row.intakeCondition || null,
      accessories: row.accessories || null,
      previous_repair_item_id: row.previousRepairItemId || null,
    })),
  };
}

export function serializeRepairIntakeDraft(payload: { customerId: string; notes: string; rows: RepairDraftRow[] }): string {
  return JSON.stringify(payload);
}

export function parseRepairIntakeDraft(raw: string | null): { customerId: string; notes: string; rows: RepairDraftRow[] } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { customerId?: string; notes?: string; rows?: RepairDraftRow[] };
    if (!Array.isArray(parsed.rows) || parsed.rows.length === 0) return null;
    return {
      customerId: parsed.customerId || '',
      notes: parsed.notes || '',
      rows: parsed.rows.map((row) => createEmptyRepairDraftRow(row)),
    };
  } catch {
    return null;
  }
}
