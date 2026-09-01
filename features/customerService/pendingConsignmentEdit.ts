export const PROTECTED_CONSIGNMENT_SOURCE_WAREHOUSE_IDS = new Set([
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000004',
]);

export interface PendingConsignmentEditLine {
  id?: string;
  product_sku: string;
  variant_suffix?: string;
  size_info?: string;
  quantity: number;
  locked_unit_cost: number;
  locked_unit_price: number;
}

export interface PendingConsignmentEditInput {
  customerId: string;
  sourceWarehouseId: string;
  reviewDueAt: string;
  notes?: string | null;
  lines: PendingConsignmentEditLine[];
}

export function canEditPendingConsignment(status: string, handedOffAt?: string | null): boolean {
  return (status === 'draft' || status === 'pending_handoff') && !handedOffAt;
}

export function validatePendingConsignmentEdit(
  input: PendingConsignmentEditInput,
  catalogSkus: Set<string>,
): string[] {
  const issues: string[] = [];
  if (!input.customerId.trim()) issues.push('Επιλέξτε πελάτη.');
  if (!input.sourceWarehouseId.trim()) issues.push('Επιλέξτε αποθήκη προέλευσης.');
  if (PROTECTED_CONSIGNMENT_SOURCE_WAREHOUSE_IDS.has(input.sourceWarehouseId)) {
    issues.push('Η αποθήκη προέλευσης δεν μπορεί να είναι προστατευμένη θέση.');
  }
  if (!input.reviewDueAt.trim()) issues.push('Ορίστε ημερομηνία επανελέγχου.');
  if (!Array.isArray(input.lines) || input.lines.length === 0) {
    issues.push('Χρειάζεται τουλάχιστον μία γραμμή SKU.');
  }

  const seen = new Map<string, number>();
  for (const line of input.lines) {
    const sku = (line.product_sku || '').trim();
    if (!sku) {
      issues.push('Κάθε γραμμή χρειάζεται SKU.');
    } else if (!catalogSkus.has(sku)) {
      issues.push(`Άγνωστο SKU: ${sku}`);
    }
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
      issues.push('Κάθε γραμμή χρειάζεται θετική ποσότητα.');
    }
    if (!Number.isFinite(line.locked_unit_price) || line.locked_unit_price < 0) {
      issues.push('Η τιμή γραμμής δεν είναι έγκυρη.');
    }
    const key = `${sku}|${line.variant_suffix || ''}|${line.size_info || ''}`;
    seen.set(key, (seen.get(key) || 0) + 1);
  }

  if ([...seen.values()].some((count) => count > 1)) {
    issues.push('Υπάρχει διπλότυπη ταυτότητα γραμμής (SKU + παραλλαγή + μέγεθος).');
  }

  return [...new Set(issues)];
}
