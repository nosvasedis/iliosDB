import type { Material, Product, RecipeItem } from '../types';

export type InvoiceTotalWeightSource = 'automatic' | 'manual' | 'missing';

export interface InvoiceTotalWeightResult {
  value: number | null;
  source: InvoiceTotalWeightSource;
  missingItems: string[];
}

type WeightContext = {
  productsBySku: Map<string, Product>;
  materialsById: Map<string, Material>;
};

const normalizeQuantity = (item: RecipeItem): number | null => {
  const quantity = Number(item.quantity);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : null;
};

const uniqueMissing = (items: string[]): string[] => [...new Set(items)];

function resolveProductWeight(
  product: Product,
  context: WeightContext,
  visiting: Set<string>,
): InvoiceTotalWeightResult {
  const manualWeight = Number(product.invoice_total_weight_g);
  if (Number.isFinite(manualWeight) && manualWeight > 0) {
    return { value: manualWeight, source: 'manual', missingItems: [] };
  }

  if (visiting.has(product.sku)) {
    return { value: null, source: 'missing', missingItems: [`Κυκλική συνταγή: ${product.sku}`] };
  }

  const nextVisiting = new Set(visiting).add(product.sku);
  let total = Number(product.weight_g || 0) + Number(product.secondary_weight_g || 0);
  const missingItems: string[] = [];

  for (const item of product.recipe || []) {
    const quantity = normalizeQuantity(item);
    if (quantity === null) {
      missingItems.push(item.type === 'component' ? `STX ${item.sku}: μη έγκυρη ποσότητα` : `Υλικό ${item.id}: μη έγκυρη ποσότητα`);
      continue;
    }

    if (item.type === 'component') {
      const component = context.productsBySku.get(item.sku);
      if (!component) {
        missingItems.push(`STX ${item.sku}: δεν βρέθηκε`);
        continue;
      }
      const componentWeight = resolveProductWeight(component, context, nextVisiting);
      if (componentWeight.value === null) {
        if (componentWeight.missingItems.length) missingItems.push(...componentWeight.missingItems);
        else missingItems.push(`STX ${item.sku}: λείπει βάρος`);
        continue;
      }
      total += componentWeight.value * quantity;
      continue;
    }

    const material = context.materialsById.get(item.id);
    if (!material) {
      missingItems.push(`Υλικό ${item.id}: δεν βρέθηκε`);
      continue;
    }
    if (material.unit_weight_g === null || material.unit_weight_g === undefined || !Number.isFinite(Number(material.unit_weight_g)) || Number(material.unit_weight_g) < 0) {
      missingItems.push(`Υλικό ${material.name || item.id}: λείπει βάρος μονάδας`);
      continue;
    }
    total += Number(material.unit_weight_g) * quantity;
  }

  if (missingItems.length > 0 || !Number.isFinite(total) || total <= 0) {
    if (total <= 0 && missingItems.length === 0) missingItems.push(`Προϊόν ${product.sku}: μηδενικό συνολικό βάρος`);
    return { value: null, source: 'missing', missingItems: uniqueMissing(missingItems) };
  }

  return { value: Number(total.toFixed(6)), source: 'automatic', missingItems: [] };
}

export function resolveInvoiceTotalWeight(
  product: Product,
  products: readonly Product[] = [],
  materials: readonly Material[] = [],
): InvoiceTotalWeightResult {
  const productsBySku = new Map(products.map((item) => [item.sku, item]));
  productsBySku.set(product.sku, product);
  return resolveProductWeight(product, {
    productsBySku,
    materialsById: new Map(materials.map((item) => [item.id, item])),
  }, new Set());
}
