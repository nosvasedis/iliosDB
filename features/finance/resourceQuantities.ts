import { MaterialType, type Material, type Product } from '../../types';
import type { FinanceLineEvent } from '../../utils/financeAnalytics';

export type ResourceKind = 'stone' | 'material' | 'component';
export interface RecipeResource {
  key: string;
  id: string;
  name: string;
  description: string;
  kind: ResourceKind;
  unit: string;
  quantity: number;
}
export interface RecipeResources {
  items: RecipeResource[];
  warnings: string[];
}
export interface ResourceQuantityRow extends RecipeResource {
  products: Array<{ sku: string; variantSuffix: string; pieces: number; quantity: number }>;
}
export interface ResourceQuantities {
  rows: ResourceQuantityRow[];
  warnings: string[];
  pieces: number;
  stonePieces: number;
  componentPieces: number;
}

/** Recipes store individual stones already; stones_per_strand is an input convenience. */
export function resourceUnit(unit: string | null | undefined): string {
  const value = String(unit ?? '').trim();
  return /^(τεμ\.?|τεμάχι[αο]|pcs?\.?|pieces?)$/i.test(value) ? 'τεμ.' : value || 'μον.';
}

/** One catalogue-scoped cache, shared by shipment/backlog lines. No queries or depth cutoffs. */
export function createRecipeResourceResolver(products: readonly Product[], materials: readonly Material[]) {
  const productBySku = new Map(products.map((product) => [product.sku, product]));
  const materialById = new Map(materials.map((material) => [material.id, material]));
  const cache = new Map<string, RecipeResources>();
  return (sku: string): RecipeResources => {
    const hit = cache.get(sku);
    if (hit) return hit;
    const items = new Map<string, RecipeResource>();
    const warnings = new Set<string>();
    const path = new Set<string>();
    const stack: Array<{ sku: string; quantity: number; exit?: boolean }> = [{ sku, quantity: 1 }];
    const add = (resource: RecipeResource) => {
      const previous = items.get(resource.key);
      if (previous) previous.quantity += resource.quantity;
      else items.set(resource.key, resource);
    };
    const root = productBySku.get(sku);
    if (root?.is_component) add({ key: `component:${sku}`, id: sku, name: sku, description: root.description || '', kind: 'component', unit: 'τεμ.', quantity: 1 });
    while (stack.length) {
      const current = stack.pop()!;
      if (current.exit) { path.delete(current.sku); continue; }
      if (path.has(current.sku)) { warnings.add(`Κυκλική συνταγή: ${current.sku}`); continue; }
      const product = productBySku.get(current.sku);
      if (!product) { warnings.add(`Λείπει προϊόν/εξάρτημα: ${current.sku}`); continue; }
      path.add(current.sku);
      stack.push({ ...current, exit: true });
      for (const item of product.recipe || []) {
        const quantity = Number(item.quantity) * current.quantity;
        if (!Number.isFinite(quantity) || quantity < 0) { warnings.add(`Μη έγκυρη ποσότητα συνταγής: ${current.sku}`); continue; }
        if (quantity === 0) continue;
        if (item.type === 'component') {
          const component = productBySku.get(item.sku);
          if (path.has(item.sku)) { warnings.add(`Κυκλική συνταγή: ${item.sku}`); continue; }
          add({ key: `component:${item.sku}`, id: item.sku, name: item.sku, description: component?.description || '', kind: 'component', unit: 'τεμ.', quantity });
          stack.push({ sku: item.sku, quantity });
        } else {
          const material = materialById.get(item.id);
          if (!material) { warnings.add(`Λείπει υλικό: ${item.id} (${current.sku})`); continue; }
          add({ key: `material:${material.id}`, id: material.id, name: material.name, description: material.description || '', kind: material.type === MaterialType.Stone ? 'stone' : 'material', unit: resourceUnit(material.unit), quantity });
        }
      }
    }
    const result = { items: [...items.values()], warnings: [...warnings] };
    cache.set(sku, result);
    return result;
  };
}

/** Input events are already scoped/deduplicated by the finance pipeline. */
export function summarizeResourceQuantities(events: readonly FinanceLineEvent[]): ResourceQuantities {
  const rows = new Map<string, ResourceQuantityRow & { productIndex: Map<string, ResourceQuantityRow['products'][number]> }>();
  const warnings = new Set<string>();
  let pieces = 0;
  for (const event of events) {
    if (!Number.isFinite(event.quantity) || event.quantity <= 0) continue;
    pieces += event.quantity;
    const resources = event.recipeResources;
    if (!resources) { warnings.add(`Χωρίς στοιχεία συνταγής: ${event.sku}`); continue; }
    resources.warnings.forEach((warning) => warnings.add(`${event.sku}: ${warning}`));
    for (const resource of resources.items) {
      let row = rows.get(resource.key);
      if (!row) {
        row = { ...resource, quantity: 0, products: [], productIndex: new Map() };
        rows.set(resource.key, row);
      }
      const quantity = resource.quantity * event.quantity;
      row.quantity += quantity;
      const key = JSON.stringify([event.sku, event.variantSuffix || '']);
      let source = row.productIndex.get(key);
      if (!source) {
        source = { sku: event.sku, variantSuffix: event.variantSuffix || '', pieces: 0, quantity: 0 };
        row.productIndex.set(key, source);
        row.products.push(source);
      }
      source.pieces += event.quantity;
      source.quantity += quantity;
    }
  }
  const sorted = [...rows.values()].map(({ productIndex: _, ...row }) => ({ ...row, products: row.products.sort((a, b) => a.sku.localeCompare(b.sku, 'el', { numeric: true }) || a.variantSuffix.localeCompare(b.variantSuffix)) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'el', { numeric: true }) || a.id.localeCompare(b.id));
  return {
    rows: sorted, warnings: [...warnings], pieces,
    stonePieces: sorted.filter((row) => row.kind === 'stone' && row.unit === 'τεμ.').reduce((sum, row) => sum + row.quantity, 0),
    componentPieces: sorted.filter((row) => row.kind === 'component').reduce((sum, row) => sum + row.quantity, 0),
  };
}
