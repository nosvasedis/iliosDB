import { Order, OrderItem, OrderStatus } from '../../types';

export function orderNeedsProductionEditDialog(status: OrderStatus): boolean {
  return (
    status === OrderStatus.InProduction ||
    status === OrderStatus.Ready ||
    status === OrderStatus.PartiallyDelivered
  );
}

function orderItemsEqualForProductionEdit(a: OrderItem, b: OrderItem): boolean {
  return (
    a.sku === b.sku &&
    (a.variant_suffix || '') === (b.variant_suffix || '') &&
    (a.size_info || '') === (b.size_info || '') &&
    (a.cord_color ?? null) === (b.cord_color ?? null) &&
    (a.enamel_color ?? null) === (b.enamel_color ?? null) &&
    (a.notes || '') === (b.notes || '') &&
    a.quantity === b.quantity &&
    a.price_at_order === b.price_at_order
  );
}

function sameOptionalText(a?: string | null, b?: string | null): boolean {
  return (a || '') === (b || '');
}

function sameNullableNumber(a?: number | null, b?: number | null): boolean {
  return (a ?? null) === (b ?? null);
}

function orderHeadersEqualForNewPart(before: Order, after: Order): boolean {
  const tagsEqual = JSON.stringify(before.tags || []) === JSON.stringify(after.tags || []);
  return (
    before.customer_id === after.customer_id &&
    before.customer_name === after.customer_name &&
    sameOptionalText(before.customer_phone, after.customer_phone) &&
    before.seller_id === after.seller_id &&
    sameOptionalText(before.seller_name, after.seller_name) &&
    sameNullableNumber(before.seller_commission_percent, after.seller_commission_percent) &&
    before.vat_rate === after.vat_rate &&
    before.discount_percent === after.discount_percent &&
    sameOptionalText(before.notes, after.notes) &&
    tagsEqual
  );
}

/** True only when existing lines are untouched and at least one new line was added. */
export function allowsNewProductionPart(beforeItems: OrderItem[], afterItems: OrderItem[]): boolean {
  const beforeByLineId = new Map(
    beforeItems.filter((item) => item.line_id).map((item) => [item.line_id!, item]),
  );

  for (const [lineId, beforeItem] of beforeByLineId) {
    const afterItem = afterItems.find((item) => item.line_id === lineId);
    if (!afterItem || !orderItemsEqualForProductionEdit(beforeItem, afterItem)) {
      return false;
    }
  }

  return afterItems.some((item) => !item.line_id || !beforeByLineId.has(item.line_id));
}

/** «Νέο Τμήμα» is valid only when the edit strictly adds new catalog lines with no other order changes. */
export function allowsNewProductionPartOrderEdit(before: Order, after: Order): boolean {
  if (!orderHeadersEqualForNewPart(before, after)) return false;
  return allowsNewProductionPart(before.items, after.items);
}

export const PRODUCTION_EDIT_NEW_PART_HINT =
  'Το «Νέο Τμήμα» είναι διαθέσιμο μόνο όταν προστίθενται νέα είδη, χωρίς αλλαγές, διαγραφές ή τροποποιήσεις στα υπάρχοντα.';

export const PRODUCTION_EDIT_CHOICE_MESSAGE =
  'Αυτές οι αλλαγές αποτελούν νέο τμήμα παραγγελίας ή είναι τροποποιήσεις του υπάρχοντος τμήματος;';
