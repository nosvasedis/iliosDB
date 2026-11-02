import { MaterialType, type Material, type Product, type Supplier, type SupplierOrder } from '../../types';
import { roundMoney } from './financeMath';
import type { FinanceBilling, FinanceCategory, FinanceCategoryLinkKind, FinanceExpense } from './types';

export interface PurchaseBookingLine {
  itemId: string;
  itemType: 'Material' | 'Product';
  label: string;
  quantity: number;
  unitCost: number;
  /** Catalogue cost before this purchase (to offer a cost update). */
  catalogCost: number | null;
  categoryId: string;
}

/** Stones → Πέτρες, other materials → Υλικά, STX → Εξαρτήματα, everything else → Υλικά. */
export function purchaseLinkKind(item: { item_type: string; item_id: string }, materialsById: ReadonlyMap<string, Material>, productsBySku: ReadonlyMap<string, Product>): FinanceCategoryLinkKind {
  if (item.item_type === 'Material') {
    return materialsById.get(item.item_id)?.type === MaterialType.Stone ? 'stones' : 'materials';
  }
  return productsBySku.get(item.item_id)?.is_component ? 'stx' : 'materials';
}

export function categoryForLinkKind(kind: FinanceCategoryLinkKind, categories: readonly FinanceCategory[], fallback?: string | null): string {
  const active = categories.filter((category) => !category.is_archived);
  return active.find((category) => category.link_kind === kind)?.id
    || (fallback && active.some((category) => category.id === fallback) ? fallback : undefined)
    || active.find((category) => category.link_kind === 'materials')?.id
    || '';
}

export function buildPurchaseBooking(params: {
  order: SupplierOrder;
  supplier?: Supplier;
  materials: readonly Material[];
  products: readonly Product[];
  categories: readonly FinanceCategory[];
}): PurchaseBookingLine[] {
  const materialsById = new Map(params.materials.map((material) => [material.id, material]));
  const productsBySku = new Map(params.products.map((product) => [product.sku, product]));
  return (params.order.items || []).filter((item) => Number(item.quantity) > 0).map((item) => {
    const catalogCost = item.item_type === 'Material'
      ? materialsById.get(item.item_id)?.cost_per_unit ?? null
      : productsBySku.get(item.item_id)?.supplier_cost ?? null;
    return {
      itemId: item.item_id,
      itemType: item.item_type as 'Material' | 'Product',
      label: item.item_name || item.item_id,
      quantity: Number(item.quantity),
      unitCost: Number(item.unit_cost) > 0 ? Number(item.unit_cost) : Number(catalogCost || 0),
      catalogCost: catalogCost === null ? null : Number(catalogCost),
      categoryId: categoryForLinkKind(purchaseLinkKind(item, materialsById, productsBySku), params.categories, params.supplier?.default_category_id),
    };
  });
}

/** One expense per category, so the purchase lands in the right Ενότητες. */
export function purchaseExpenses(params: {
  order: SupplierOrder;
  lines: readonly PurchaseBookingLine[];
  billing: FinanceBilling;
  vatRate: number;
  date: string;
  docRef?: string;
  dueDate?: string | null;
}): Array<Partial<FinanceExpense>> {
  const groups = new Map<string, PurchaseBookingLine[]>();
  params.lines.filter((line) => line.categoryId && line.unitCost * line.quantity > 0).forEach((line) => {
    groups.set(line.categoryId, [...(groups.get(line.categoryId) || []), line]);
  });
  const vat = params.billing === 'X' ? 0 : params.vatRate;
  return [...groups.entries()].map(([categoryId, lines]) => {
    const net = roundMoney(lines.reduce((sum, line) => sum + line.quantity * line.unitCost, 0));
    const vatAmount = roundMoney(net * vat);
    return {
      category_id: categoryId,
      party_id: params.order.supplier_id,
      expense_date: params.date,
      due_date: params.dueDate || null,
      description: `Παραλαβή εντολής ${params.order.supplier_name || ''} #${params.order.id.slice(0, 8)}`.replace(/\s+/g, ' ').trim(),
      doc_ref: params.docRef || null,
      lines: lines.map((line) => ({
        label: line.label,
        qty: line.quantity,
        unit_price: line.unitCost,
        ...(line.itemType === 'Material' ? { material_id: line.itemId } : { sku: line.itemId }),
      })),
      amount_net: net,
      vat_rate: vat,
      vat_amount: vatAmount,
      amount_gross: roundMoney(net + vatAmount),
      billing: params.billing,
      source_kind: 'supplier_order',
      source_id: `${params.order.id}:${categoryId}`,
      status: 'unpaid',
    };
  });
}

/** Materials whose purchase price moved by more than 1% from the catalogue. */
export const changedMaterialCosts = (lines: readonly PurchaseBookingLine[]) =>
  lines.filter((line) => line.itemType === 'Material' && line.unitCost > 0
    && (line.catalogCost === null || Math.abs(line.unitCost - line.catalogCost) > Math.max(0.0001, line.catalogCost * 0.01)));
