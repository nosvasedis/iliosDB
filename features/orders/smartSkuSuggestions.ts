import type { Product } from '../../types';
import { splitSkuComponents } from '../../utils/pricingEngine';

/** Built once per `products` load; cheap queries per keystroke. */
export interface ProductSearchIndex {
  masters: Product[];
  skuMap: Map<string, Product>;
  /** Uppercase first two graphemes → products starting with those letters (masters only). */
  byFirstTwo: Map<string, Product[]>;
  /** Key `${collectionId}|${digitCore}` → master SKUs in that collection with that core. */
  collectionCoreToSkus: Map<string, string[]>;
  /** Key `${collectionId}|${letterPrefix}|${mod100}` when cluster size ≥ 2 and num ≥ 100. */
  familyClusterToSkus: Map<string, string[]>;
}

export type SmartSuggestionVirtualRow =
  | { kind: 'header'; id: string; label: string }
  | { kind: 'product'; product: Product; sectionId: string };

export interface SmartSuggestionResult {
  topChips: Product[];
  virtualRows: SmartSuggestionVirtualRow[];
  rangeHint: string | null;
  variantSuffix: string | null;
}

const MASTER_SKU_RE = /^([A-ZΑ-Ω]{2,3})(\d+)/i;

export function parseMasterSkuParts(sku: string): { letters: string; digits: string; num: number } | null {
  const m = sku.trim().match(MASTER_SKU_RE);
  if (!m) return null;
  const letters = m[1].toUpperCase();
  const digits = m[2];
  const num = parseInt(digits, 10);
  if (Number.isNaN(num)) return null;
  return { letters, digits, num };
}

function firstTwoKey(sku: string): string {
  const u = sku.trim().toUpperCase();
  if (u.length < 2) return u;
  return u.slice(0, 2);
}

export function buildProductSearchIndex(products: Product[]): ProductSearchIndex {
  const masters = products.filter((p) => !p.is_component);
  const skuMap = new Map<string, Product>();
  const byFirstTwo = new Map<string, Product[]>();
  const collectionCoreToSkus = new Map<string, string[]>();
  const familyBuckets = new Map<string, Set<string>>();

  for (const p of masters) {
    skuMap.set(p.sku, p);
    const key2 = firstTwoKey(p.sku);
    if (!byFirstTwo.has(key2)) byFirstTwo.set(key2, []);
    byFirstTwo.get(key2)!.push(p);

    const parts = parseMasterSkuParts(p.sku);
    if (!parts) continue;

    for (const cid of p.collections || []) {
      const ck = `${cid}|${parts.digits}`;
      if (!collectionCoreToSkus.has(ck)) collectionCoreToSkus.set(ck, []);
      collectionCoreToSkus.get(ck)!.push(p.sku);

      if (parts.num >= 100) {
        const mod = parts.num % 100;
        const fk = `${cid}|${parts.letters}|${mod}`;
        if (!familyBuckets.has(fk)) familyBuckets.set(fk, new Set());
        familyBuckets.get(fk)!.add(p.sku);
      }
    }
  }

  const familyClusterToSkus = new Map<string, string[]>();
  for (const [fk, set] of familyBuckets) {
    if (set.size >= 2) {
      familyClusterToSkus.set(fk, [...set].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })));
    }
  }

  for (const arr of collectionCoreToSkus.values()) {
    arr.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const seen = new Set<string>();
    const deduped: string[] = [];
    for (const s of arr) {
      if (!seen.has(s)) {
        seen.add(s);
        deduped.push(s);
      }
    }
    arr.length = 0;
    arr.push(...deduped);
  }

  return { masters, skuMap, byFirstTwo, collectionCoreToSkus, familyClusterToSkus };
}

function productMatchesVariantSuffix(p: Product, suffixUpper: string | null): boolean {
  if (!suffixUpper) return true;
  const vars = p.variants;
  if (!vars || vars.length === 0) return suffixUpper === '';
  return vars.some((v) => {
    const u = (v.suffix || '').toUpperCase();
    return u === suffixUpper || u.startsWith(suffixUpper);
  });
}

/** Same numeric core + shared collection (different master letters). */
export function getCollectionCoreSiblings(index: ProductSearchIndex, product: Product): Product[] {
  const parts = parseMasterSkuParts(product.sku);
  if (!parts) return [];
  const out: Product[] = [];
  const seen = new Set<string>();

  for (const cid of product.collections || []) {
    const key = `${cid}|${parts.digits}`;
    const skus = index.collectionCoreToSkus.get(key);
    if (!skus) continue;
    for (const sku of skus) {
      if (sku === product.sku) continue;
      const other = index.skuMap.get(sku);
      if (!other) continue;
      const op = parseMasterSkuParts(other.sku);
      if (op && op.digits === parts.digits && other.collections?.includes(cid)) {
        if (!seen.has(sku)) {
          seen.add(sku);
          out.push(other);
        }
      }
    }
  }
  out.sort((a, b) => a.sku.localeCompare(b.sku, undefined, { numeric: true }));
  return out;
}

export function getFamilyClusterSiblings(index: ProductSearchIndex, product: Product): Product[] {
  const parts = parseMasterSkuParts(product.sku);
  if (!parts || parts.num < 100) return [];
  const mod = parts.num % 100;
  const out: Product[] = [];
  const seen = new Set<string>();

  for (const cid of product.collections || []) {
    const fk = `${cid}|${parts.letters}|${mod}`;
    const skus = index.familyClusterToSkus.get(fk);
    if (!skus) continue;
    for (const sku of skus) {
      if (sku === product.sku) continue;
      const other = index.skuMap.get(sku);
      if (!other) continue;
      if (!seen.has(sku)) {
        seen.add(sku);
        out.push(other);
      }
    }
  }
  out.sort((a, b) => a.sku.localeCompare(b.sku, undefined, { numeric: true }));
  return out;
}

export function filterByVariantSuffix(products: Product[], suffixUpper: string | null): Product[] {
  if (!suffixUpper) return products;
  return products.filter((p) => productMatchesVariantSuffix(p, suffixUpper));
}

/** Set mates for the active master + optional variant from typed tail after master SKU. */
export function getActiveMasterSetMates(
  index: ProductSearchIndex,
  activeMaster: Product,
  scanInputFirstToken: string,
): Product[] {
  const upper = scanInputFirstToken.trim().toUpperCase();
  const masterU = activeMaster.sku.toUpperCase();
  let suffix: string | null = null;
  if (upper.startsWith(masterU) && upper.length > masterU.length) {
    suffix = upper.slice(masterU.length);
  }
  const siblings = getCollectionCoreSiblings(index, activeMaster);
  const filtered = filterByVariantSuffix(siblings, suffix);
  return filtered;
}

function searchMasters(index: ProductSearchIndex, term: string): Product[] {
  const t = term.trim().toUpperCase();
  if (t.length < 2) return [];
  const pool = t.length >= 2 ? index.byFirstTwo.get(t.slice(0, 2)) ?? index.masters : index.masters;

  const hits = pool.filter((p) => {
    const sku = p.sku.toUpperCase();
    if (sku.startsWith(t)) return true;
    if (t.length >= 3 && sku.includes(t)) return true;
    return false;
  });

  const rank = (p: Product): [number, number, string] => {
    const sku = p.sku.toUpperCase();
    const exact = sku === t ? 0 : 1;
    const starts = sku.startsWith(t) ? 0 : 1;
    return [exact, starts, sku];
  };

  hits.sort((a, b) => {
    const [ea, sa, ua] = rank(a);
    const [eb, sb, ub] = rank(b);
    if (ea !== eb) return ea - eb;
    if (sa !== sb) return sa - sb;
    if (a.sku.length !== b.sku.length) return a.sku.length - b.sku.length;
    return ua.localeCompare(ub, undefined, { numeric: true });
  });

  return hits;
}

export function computeRangeHint(term: string, matches: Product[]): string | null {
  const t = term.trim().toUpperCase();
  if (t.length < 3) return null;
  if (!/^[A-ZΑ-Ω]{2,3}\d/i.test(t)) return null;

  const withPrefix = matches.filter((p) => p.sku.toUpperCase().startsWith(t));
  if (withPrefix.length < 2) return null;

  const nums: number[] = [];
  for (const p of withPrefix) {
    const parts = parseMasterSkuParts(p.sku);
    if (parts) nums.push(parts.num);
  }
  if (nums.length < 2) return null;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  if (min === max) return null;
  return `Αριθμοί στο εύρος: ${min}–${max}`;
}

const MAX_SECTION = 120;
const MAX_TOP = 8;

export interface ComputeSmartSkuSuggestionsArgs {
  index: ProductSearchIndex;
  skuPart: string;
  orderContextMasterSkus: string[];
}

export function computeSmartSkuSuggestions(args: ComputeSmartSkuSuggestionsArgs): SmartSuggestionResult | null {
  const { index, skuPart } = args;
  const term = skuPart.trim().toUpperCase();
  if (term.length < 2) return null;

  const { master: masterPartRaw, suffix: splitSuffix } = splitSkuComponents(term);
  const variantSuffix = splitSuffix ? splitSuffix.toUpperCase() : null;
  const masterUpper = masterPartRaw.trim().toUpperCase();
  /** Prefer master base for search when user is typing a full code with variant tail (e.g. SK025DPCO). */
  const searchTerm = masterUpper.length >= 2 && masterUpper !== term ? masterUpper : term;

  const searchHits = searchMasters(index, searchTerm);
  const rangeHint = computeRangeHint(searchTerm, searchHits);

  let anchor: Product | null = index.skuMap.get(masterUpper) ?? index.skuMap.get(term) ?? null;
  if (!anchor && searchHits.length > 0) {
    anchor = searchHits[0];
  }

  let setMates: Product[] = [];
  let familyMates: Product[] = [];
  if (anchor && (anchor.collections?.length ?? 0) > 0) {
    setMates = filterByVariantSuffix(getCollectionCoreSiblings(index, anchor), variantSuffix);
    familyMates = filterByVariantSuffix(getFamilyClusterSiblings(index, anchor), variantSuffix);
  }

  const orderMates: Product[] = [];
  const seenOrder = new Set<string>();
  for (const sku of args.orderContextMasterSkus) {
    const p = index.skuMap.get(sku);
    if (!p) continue;
    const mates = filterByVariantSuffix(getCollectionCoreSiblings(index, p), variantSuffix);
    for (const m of mates) {
      if (!seenOrder.has(m.sku)) {
        seenOrder.add(m.sku);
        orderMates.push(m);
      }
    }
  }

  const dedupe = (list: Product[], exclude: Set<string>) =>
    list.filter((p) => !exclude.has(p.sku));

  const used = new Set<string>();
  const virtualRows: SmartSuggestionVirtualRow[] = [];

  const pushSection = (id: string, label: string, list: Product[]) => {
    const slice = list.slice(0, MAX_SECTION);
    if (slice.length === 0) return;
    virtualRows.push({ kind: 'header', id, label });
    for (const product of slice) {
      if (used.has(product.sku)) continue;
      used.add(product.sku);
      virtualRows.push({ kind: 'product', product, sectionId: id });
    }
  };

  pushSection('search', 'Από αναζήτηση', searchHits);

  const searchSkuSet = new Set(searchHits.map((p) => p.sku));
  pushSection('set', 'Ίδιο σετ (συλλογή)', dedupe(setMates, searchSkuSet));

  const setSkuSet = new Set(setMates.map((p) => p.sku));
  const excludeOrder = new Set([...searchSkuSet, ...setSkuSet]);
  pushSection('order', 'Σχετικά με την παραγγελία', dedupe(orderMates, excludeOrder));

  const orderSkuSet = new Set(orderMates.map((p) => p.sku));
  pushSection(
    'family',
    'Παρόμοια σειρά (ίδιο άκρο αριθμού)',
    dedupe(familyMates, new Set([...searchSkuSet, ...setSkuSet, ...orderSkuSet])),
  );

  const topChips: Product[] = [];
  const topSeen = new Set<string>();
  const addTop = (list: Product[]) => {
    for (const p of list) {
      if (topChips.length >= MAX_TOP) return;
      if (topSeen.has(p.sku)) continue;
      topSeen.add(p.sku);
      topChips.push(p);
    }
  };

  addTop(searchHits);
  addTop(setMates);
  addTop(orderMates);
  addTop(familyMates);
  addTop(searchHits.filter((p) => !topSeen.has(p.sku)));

  return {
    topChips,
    virtualRows,
    rangeHint,
    variantSuffix,
  };
}
