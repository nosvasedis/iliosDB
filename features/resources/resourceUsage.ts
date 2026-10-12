import type { Product, ProductVariant } from '../../types';

// Same ordering as skuSort, with one reusable collator for large result sets.
const compareSkuValues = new Intl.Collator('el', { numeric: true, sensitivity: 'base' }).compare;

export interface ResourceRef {
  kind: 'material' | 'mold';
  id: string;
}

export interface ResourceUsageEntry {
  product: Product;
  direct: boolean;
  /** The component used by this product, rather than the entire dependency path. */
  viaSku?: string;
}

export type ResourceUsageRow =
  | { key: string; kind: 'product'; entry: ResourceUsageEntry }
  | { key: string; kind: 'variant'; entry: ResourceUsageEntry; variant: ProductVariant };

export const resourceKey = (resource: ResourceRef) => `${resource.kind}:${resource.id}`;

export function createResourceUsageIndex(products: readonly Product[]) {
  const bySku = new Map(products.map(product => [product.sku, product]));
  const directUses = new Map<string, Set<string>>();
  const parents = new Map<string, Set<string>>();
  const cache = new Map<string, ResourceUsageEntry[]>();
  const add = (map: Map<string, Set<string>>, key: string, sku: string) => {
    let values = map.get(key);
    if (!values) map.set(key, values = new Set());
    values.add(sku);
  };

  for (const product of products) {
    for (const item of product.recipe || []) {
      if (!(Number(item.quantity) > 0)) continue;
      if (item.type === 'raw') {
        add(directUses, resourceKey({ kind: 'material', id: item.id }), product.sku);
      } else if (bySku.has(item.sku)) {
        add(parents, item.sku, product.sku);
      }
    }
    for (const mold of product.molds || []) {
      if (Number(mold.quantity) > 0) {
        add(directUses, resourceKey({ kind: 'mold', id: mold.code }), product.sku);
      }
    }
  }

  return {
    getUsage(resource: ResourceRef): ResourceUsageEntry[] {
      const key = resourceKey(resource);
      const cached = cache.get(key);
      if (cached) return cached;
      const found = new Map<string, ResourceUsageEntry>();
      const queue = [...(directUses.get(key) || [])].sort(compareSkuValues);
      for (const sku of queue) found.set(sku, { product: bySku.get(sku)!, direct: true });
      // Iterative traversal handles arbitrarily deep graphs without stack overflow.
      // Seeding every direct use first also preserves direct precedence in cycles.
      for (let cursor = 0; cursor < queue.length; cursor++) {
        const componentSku = queue[cursor];
        for (const sku of parents.get(componentSku) || []) {
          if (found.has(sku)) continue;
          found.set(sku, { product: bySku.get(sku)!, direct: false, viaSku: componentSku });
          queue.push(sku);
        }
      }
      const result = [...found.values()].sort((a, b) =>
        Number(b.direct) - Number(a.direct) || compareSkuValues(a.product.sku, b.product.sku));
      cache.set(key, result);
      return result;
    },
  };
}

const indexes = new WeakMap<readonly Product[], ReturnType<typeof createResourceUsageIndex>>();

/** Snapshots are immutable in the catalog cache; old indexes can be garbage collected. */
export function getResourceUsageIndex(products: readonly Product[]) {
  let index = indexes.get(products);
  if (!index) {
    index = createResourceUsageIndex(products);
    indexes.set(products, index);
  }
  return index;
}

export function filterResourceUsage(entries: ResourceUsageEntry[], search: string) {
  const term = search.trim().toLocaleUpperCase('el-GR');
  if (!term) return entries;
  return entries.filter(({ product }) =>
    product.sku.toLocaleUpperCase('el-GR').includes(term) ||
    (product.variants || []).some(variant =>
      `${product.sku}${variant.suffix}`.toLocaleUpperCase('el-GR').includes(term)));
}

export function buildResourceUsageRows(entries: ResourceUsageEntry[], expandedSku: string | null, search = ''): ResourceUsageRow[] {
  const rows: ResourceUsageRow[] = [];
  const term = search.trim().toLocaleUpperCase('el-GR');
  for (const entry of entries) {
    const sku = entry.product.sku;
    rows.push({ key: `product:${sku}`, kind: 'product', entry });
    if (sku !== expandedSku) continue;
    const matchingVariants = term
      ? (entry.product.variants || []).filter(variant => `${sku}${variant.suffix}`.toLocaleUpperCase('el-GR').includes(term))
      : entry.product.variants || [];
    const variants = new Map(matchingVariants.map(variant => [variant.suffix, variant]));
    for (const variant of [...variants.values()].sort((a, b) => compareSkuValues(a.suffix, b.suffix))) {
      rows.push({ key: `variant:${sku}:${variant.suffix}`, kind: 'variant', entry, variant });
    }
  }
  return rows;
}

export function placeResourceUsagePopover(
  anchor: { left: number; right: number; top: number; bottom: number },
  viewport: { width: number; height: number; left?: number; top?: number },
) {
  const margin = 8;
  const originLeft = viewport.left || 0;
  const originTop = viewport.top || 0;
  const width = Math.max(0, Math.min(360, viewport.width - margin * 2));
  const height = Math.max(0, Math.min(380, viewport.height - margin * 2));
  const left = Math.max(originLeft + margin, Math.min(anchor.left, originLeft + viewport.width - width - margin));
  const below = anchor.bottom + 6;
  const preferredTop = below + height <= originTop + viewport.height - margin
    ? below : anchor.top - height - 6;
  const top = Math.max(originTop + margin, Math.min(preferredTop, originTop + viewport.height - height - margin));
  return { left, top, width, height };
}
