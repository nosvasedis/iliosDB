import type { Collection, OrderItem, Product } from '../../types';
import { getVariantComponents, splitSkuComponents } from '../../utils/pricingEngine';
import { isSpecialCreationSku } from '../../utils/specialCreationSku';

/** DA001–DA009 pair with MN901–909 / SK901–909 in the same collection (not MN001/SK001). */
const DA_LOW_SERIES_MAX = 9;

/** Min units (sum of line qty) with the same metal finish in a shared collection before inferring finish for other cores. */
export const MIN_COLLECTION_FINISH_UNITS_FOR_INFERENCE = 3;

/**
 * Ωρίων-style pairing: four parallel RN “lines”, each +300 for the PN/XR high band.
 * RN301–325↔601–625, RN401–425↔701–725, RN501–525↔801–825, RN601–625↔901–925.
 */
const ORION_RN_PN_BANDS: readonly { lowMin: number; lowMax: number }[] = [
  { lowMin: 301, lowMax: 325 },
  { lowMin: 401, lowMax: 425 },
  { lowMin: 501, lowMax: 525 },
  { lowMin: 601, lowMax: 625 },
] as const;

/** Greek capital prefixes → Latin so Ωρίων band rules apply (DB often uses ΡΝ/ΠΝ/ΧΡ). */
function normalizeOrionSkuLetters(letters: string): string {
  const u = letters.normalize('NFC');
  if (u === 'RN' || u === '\u03A1\u039D') return 'RN'; // ΡΝ (Rho Nu)
  if (u === 'PN' || u === '\u03A0\u039D') return 'PN'; // ΠΝ (Pi Nu)
  if (u === 'XR' || u === '\u03A7\u03A1') return 'XR'; // ΧΡ (Chi Rho)
  return u.toUpperCase();
}

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
  /** Collection ids whose name matches Ωρίων / Orion (informational; RN↔PN↔XR +300 pairing uses numeric bands for all shared collections). */
  orionCollectionIds: Set<number>;
}

export type SmartSuggestionVirtualRow =
  | { kind: 'header'; id: string; label: string }
  | { kind: 'product'; product: Product; sectionId: string };

export interface SmartSuggestionResult {
  topChips: Product[];
  virtualRows: SmartSuggestionVirtualRow[];
  rangeHint: string | null;
  variantSuffix: string | null;
  /** From recent order lines — used to color suffix on cards & pre-fill on select. */
  highlightVariantSuffix: string | null;
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

/**
 * All `${collectionId}|…` digit keys that mean the same numeric core (e.g. 725 vs 0725).
 * Orion adds unpadded `String(num)` while some masters are stored as PN0725 — without aliases, lookups miss.
 */
export function expandDigitCoreAliases(digits: string, num: number): string[] {
  const s = new Set<string>();
  s.add(digits);
  s.add(String(num));
  const trimmed = digits.replace(/^0+/, '') || '0';
  s.add(trimmed);
  return [...s];
}

function firstTwoKey(sku: string): string {
  const u = sku.trim().toUpperCase();
  if (u.length < 2) return u;
  return u.slice(0, 2);
}

/**
 * When the user has typed a master letter prefix (2–3 letters), optionally followed only by digits,
 * non-search sections (order / set / family) must not show other prefixes (e.g. PN164 on order while typing SK).
 */
export function lockedSkuLetterPrefix(searchTerm: string): string | null {
  const u = searchTerm.trim().toUpperCase();
  const m = u.match(/^([A-ZΑ-Ω]{2,3})/u);
  if (!m) return null;
  const letters = m[1];
  if (letters.length < 2) return null;
  const rest = u.slice(letters.length);
  if (rest !== '' && !/^\d+$/.test(rest)) return null;
  return letters;
}

function filterProductsToLetterPrefix(products: Product[], letterPrefix: string | null): Product[] {
  if (!letterPrefix) return products;
  const pre = letterPrefix.toUpperCase();
  return products.filter((p) => p.sku.toUpperCase().startsWith(pre));
}

/** Detects Ωρίων (Greek) or Orion (Latin) collection names for special RN/PN/XR pairing. */
export function isOrionCollectionName(name: string): boolean {
  const stripped = name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  if (stripped.includes('orion')) return true;
  return stripped.includes('ωριων');
}

function deriveOrionCollectionIds(collections: Collection[] | undefined): Set<number> {
  const s = new Set<number>();
  if (!collections?.length) return s;
  for (const c of collections) {
    if (isOrionCollectionName(c.name)) s.add(c.id);
  }
  return s;
}

/**
 * Extra digit cores for Orion: each RN/PN low band links to PN/XR high band (+300 on the numeric core).
 */
export function expandOrionDigitCoresForAnchor(parts: { letters: string; num: number; digits: string }): string[] | null {
  const letters = normalizeOrionSkuLetters(parts.letters);
  const { num } = parts;

  if (letters === 'RN') {
    for (const b of ORION_RN_PN_BANDS) {
      if (num >= b.lowMin && num <= b.lowMax) {
        return [String(num), String(num + 300)];
      }
    }
    return null;
  }

  if (letters === 'PN') {
    for (const b of ORION_RN_PN_BANDS) {
      if (num >= b.lowMin && num <= b.lowMax) {
        return [String(num), String(num + 300)];
      }
      const highMin = b.lowMin + 300;
      const highMax = b.lowMax + 300;
      if (num >= highMin && num <= highMax) {
        return [String(num - 300), String(num)];
      }
    }
    return null;
  }

  if (letters === 'XR') {
    for (const b of ORION_RN_PN_BANDS) {
      const highMin = b.lowMin + 300;
      const highMax = b.lowMax + 300;
      if (num >= highMin && num <= highMax) {
        return [String(num - 300), String(num)];
      }
    }
    return null;
  }

  return null;
}

export function buildProductSearchIndex(products: Product[], collections?: Collection[]): ProductSearchIndex {
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
      for (const coreAlias of expandDigitCoreAliases(parts.digits, parts.num)) {
        const ck = `${cid}|${coreAlias}`;
        if (!collectionCoreToSkus.has(ck)) collectionCoreToSkus.set(ck, []);
        const bucket = collectionCoreToSkus.get(ck)!;
        if (!bucket.includes(p.sku)) bucket.push(p.sku);
      }

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

  const orionCollectionIds = deriveOrionCollectionIds(collections);

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

  return { masters, skuMap, byFirstTwo, collectionCoreToSkus, familyClusterToSkus, orionCollectionIds };
}

export function productMatchesVariantSuffix(p: Product, suffixUpper: string | null): boolean {
  if (!suffixUpper) return true;
  const vars = p.variants;
  if (!vars || vars.length === 0) return suffixUpper === '';
  return vars.some((v) => {
    const u = (v.suffix || '').toUpperCase();
    return u === suffixUpper || u.startsWith(suffixUpper);
  });
}

/** True if this single-character hint prefix-matches more than one variant (e.g. finish X → XCO, XAI, …). */
export function isAmbiguousSingleCharVariantPrefix(h: string, master: Product): boolean {
  const t = h.trim().toUpperCase();
  if (t.length !== 1) return false;
  const vars = master.variants ?? [];
  let n = 0;
  for (const v of vars) {
    const u = (v.suffix || '').trim().toUpperCase();
    if (!u) continue;
    if (u === t || u.startsWith(t)) n++;
  }
  return n > 1;
}

/**
 * Typed tail after master SKU: single finish letters (P/X/D/H) match many stones — only keep as a hint when
 * they narrow to exactly one variant; length ≥ 2 is always kept.
 */
export function typedVariantAsHintForProduct(typedVariant: string | null, target: Product): string | null {
  if (!typedVariant?.trim()) return null;
  const t = typedVariant.trim().toUpperCase();
  if (t.length >= 2) return t;
  const vars = target.variants ?? [];
  let n = 0;
  for (const v of vars) {
    const u = (v.suffix || '').trim().toUpperCase();
    if (!u) continue;
    if (u === t || u.startsWith(t)) n++;
  }
  return n === 1 ? t : null;
}

/**
 * Whether a single master variant should show “from recent order line” styling (e.g. DA025DAI → SK025…DAI).
 * `master` optional: when set, single-char hints that match multiple variants (e.g. typed “X”) are ignored for amber.
 */
export function variantSuffixMatchesOrderHints(
  suffix: string,
  orderHints: readonly string[],
  master?: Product | null,
): boolean {
  if (!orderHints.length) return false;
  const u = (suffix || '').trim().toUpperCase();
  if (!u) return false;
  for (const raw of orderHints) {
    const h = raw.trim().toUpperCase();
    if (!h) continue;
    if (master && h.length === 1 && isAmbiguousSingleCharVariantPrefix(h, master)) continue;
    if (u === h) return true;
    if (u.startsWith(h)) return true;
    if (h.startsWith(u) && u.length >= 2) return true;
    if (u.length >= 2 && h.length >= 2 && (u.includes(h) || h.includes(u))) return true;
  }
  return false;
}

/** Single suffix to show on a suggestion card / pre-fill when it matches this product’s variants. */
export function getVariantDisplayHighlightHint(
  target: Product,
  orderItems: readonly OrderItem[],
  resolveProduct: (sku: string) => Product | undefined,
  typedVariant: string | null,
): string | null {
  const strict = getScopedVariantHintStringsForProduct(target, orderItems, resolveProduct);
  for (const s of strict) {
    const u = s.trim().toUpperCase();
    if (productMatchesVariantSuffix(target, u)) return u;
  }
  const effTyped = typedVariantAsHintForProduct(typedVariant, target);
  if (effTyped && productMatchesVariantSuffix(target, effTyped)) return effTyped;
  const finishH = getCollectionWideFinishHint(target, orderItems, resolveProduct);
  if (finishH) {
    const effFinish = finishH.length >= 2 ? finishH : typedVariantAsHintForProduct(finishH, target);
    if (effFinish && productMatchesVariantSuffix(target, effFinish)) return effFinish.trim().toUpperCase();
  }
  return null;
}

/** Digit cores to look up in `collectionCoreToSkus` incl. DA↔MN/SK 9xx crosswalk. */
export function expandCollectionDigitCoresForAnchor(parts: { letters: string; digits: string; num: number }): string[] {
  const cores = new Set<string>([parts.digits]);
  if (parts.letters === 'DA' && parts.num >= 1 && parts.num <= DA_LOW_SERIES_MAX) {
    cores.add(String(900 + parts.num));
  }
  if ((parts.letters === 'MN' || parts.letters === 'SK') && parts.num >= 901 && parts.num <= 909) {
    cores.add(String(parts.num - 900).padStart(3, '0'));
  }
  return [...cores];
}

/** Drop MNxxx/SKxxx low-series siblings when anchor is DA00n; drop MN/SK on 00n when anchor is MN/SK 90n. */
export function shouldExcludeDaMnSkCrosswalkSibling(
  anchor: { letters: string; digits: string; num: number },
  candidate: { letters: string; digits: string; num: number },
): boolean {
  if (anchor.letters === 'DA' && anchor.num >= 1 && anchor.num <= DA_LOW_SERIES_MAX) {
    if ((candidate.letters === 'MN' || candidate.letters === 'SK') && candidate.digits === anchor.digits) {
      return true;
    }
  }
  if ((anchor.letters === 'MN' || anchor.letters === 'SK') && anchor.num >= 901 && anchor.num <= 909) {
    const lowDigits = String(anchor.num - 900).padStart(3, '0');
    if ((candidate.letters === 'MN' || candidate.letters === 'SK') && candidate.digits === lowDigits) {
      return true;
    }
  }
  return false;
}

function collectionsIntersect(a?: Product, b?: Product): boolean {
  const ca = a?.collections ?? [];
  const cb = b?.collections ?? [];
  if (!ca.length || !cb.length) return false;
  const sb = new Set(cb);
  return ca.some((id) => sb.has(id));
}

function digitCoresOverlap(
  pa: { letters: string; digits: string; num: number },
  pb: { letters: string; digits: string; num: number },
): boolean {
  const sa = new Set(expandCollectionDigitCoresForAnchor(pa));
  const sb = new Set(expandCollectionDigitCoresForAnchor(pb));
  for (const x of sa) {
    if (sb.has(x)) return true;
  }
  return false;
}

function resolveOrderLineProduct(item: OrderItem, resolver: (sku: string) => Product | undefined): Product | undefined {
  return item.product_details ?? resolver(item.sku);
}

/**
 * Full variant suffixes from cart lines that match target: same gender, shared collection, same digit core
 * (incl. DA↔MN/SK 9xx core expansion).
 */
export function getScopedVariantHintStringsForProduct(
  target: Product,
  orderItems: readonly OrderItem[],
  resolveProduct: (sku: string) => Product | undefined,
): string[] {
  const targetParts = parseMasterSkuParts(target.sku);
  if (!targetParts) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of orderItems) {
    const vs = item.variant_suffix?.trim();
    if (!vs) continue;
    const op = resolveOrderLineProduct(item, resolveProduct);
    if (!op || op.is_component) continue;
    if (isSpecialCreationSku(item.sku)) continue;
    if (op.gender !== target.gender) continue;
    if (!collectionsIntersect(target, op)) continue;
    const otherParts = parseMasterSkuParts(op.sku);
    if (!otherParts || !digitCoresOverlap(targetParts, otherParts)) continue;
    const u = vs.toUpperCase();
    if (!seen.has(u)) {
      seen.add(u);
      out.push(vs);
    }
  }
  return out;
}

/**
 * When enough lines in the same collection (any core) share one metal finish, suggest that finish for new lines.
 */
export function getCollectionWideFinishHint(
  target: Product,
  orderItems: readonly OrderItem[],
  resolveProduct: (sku: string) => Product | undefined,
  minUnits: number = MIN_COLLECTION_FINISH_UNITS_FOR_INFERENCE,
): string | null {
  const cols = target.collections;
  if (!cols?.length) return null;
  const tgtSet = new Set(cols);
  const finishUnits = new Map<string, number>();
  for (const item of orderItems) {
    const vs = item.variant_suffix?.trim();
    if (!vs) continue;
    const op = resolveOrderLineProduct(item, resolveProduct);
    if (!op || op.is_component) continue;
    if (isSpecialCreationSku(item.sku)) continue;
    if (op.gender !== target.gender) continue;
    const opCols = op.collections ?? [];
    if (!opCols.some((c) => tgtSet.has(c))) continue;
    const { finish } = getVariantComponents(vs, op.gender);
    const fc = finish.code;
    if (!fc) continue;
    finishUnits.set(fc, (finishUnits.get(fc) || 0) + item.quantity);
  }
  let best: string | null = null;
  let bestN = 0;
  for (const [code, n] of finishUnits) {
    if (n >= minUnits && n > bestN) {
      best = code;
      bestN = n;
    }
  }
  return best;
}

function dedupeUpperHintStrings(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const u = raw.trim().toUpperCase();
    if (!u || seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

/** Hints for ranking/highlight: typed tail, strict same-core+same-collection suffixes, then collection-wide finish (if enough data). */
export function buildVariantHintListForRanking(
  target: Product,
  orderItems: readonly OrderItem[],
  resolveProduct: (sku: string) => Product | undefined,
  typedVariant: string | null,
): string[] {
  const strict = getScopedVariantHintStringsForProduct(target, orderItems, resolveProduct).map((s) => s.trim().toUpperCase());
  const finishConsensus = getCollectionWideFinishHint(target, orderItems, resolveProduct);
  const merged: string[] = [];
  const effTyped = typedVariantAsHintForProduct(typedVariant, target);
  if (effTyped) merged.push(effTyped);
  merged.push(...strict);
  if (finishConsensus) merged.push(finishConsensus);
  return dedupeUpperHintStrings(merged);
}

const variantHintRank = (p: Product, hints: string[]): number => {
  let best = 0;
  for (const raw of hints) {
    const h = raw.trim().toUpperCase();
    if (!h) continue;
    const vars = p.variants;
    if (!vars?.length) continue;
    for (const v of vars) {
      const u = (v.suffix || '').toUpperCase();
      if (u === h) {
        best = Math.max(best, 3000 + h.length);
      } else if (u.startsWith(h) || h.startsWith(u)) {
        best = Math.max(best, 1500 + Math.min(u.length, h.length));
      } else if (h.length >= 2 && (u.includes(h) || h.includes(u))) {
        best = Math.max(best, 500);
      }
    }
  }
  return best;
};

export interface SuggestionRankContext {
  searchTerm: string;
  typedVariant: string | null;
  /** Legacy global suffix FIFO; ignored when `orderVariantResolution` is set (cart-scoped hints win). */
  orderVariantSuffixes?: string[];
  /**
   * SKUs that share a collection “set” with a recent order line (incl. DA↔9xx crosswalk).
   * Without this, generic prefix matches tie-break on numeric sort (MN112 before MN901 for “MN”).
   */
  orderContextAffinitySkus?: Set<string>;
  /** Per-target variant hints: same collection + digit core + gender; optional collection-wide finish after enough units. */
  orderVariantResolution?: {
    orderItems: readonly OrderItem[];
    resolveProduct: (sku: string) => Product | undefined;
  };
}

/** Stronger than a plain prefix match so MN901 beats MN112 when DA001/SK901 are on the order. */
const ORDER_CONTEXT_AFFINITY_BONUS = 80_000;

function variantHintsForProduct(p: Product, ctx: SuggestionRankContext): string[] {
  const res = ctx.orderVariantResolution;
  if (res?.orderItems?.length && res.resolveProduct) {
    return buildVariantHintListForRanking(p, res.orderItems, res.resolveProduct, ctx.typedVariant);
  }
  const typed = typedVariantAsHintForProduct(ctx.typedVariant, p);
  return dedupeUpperHintStrings(
    [typed, ...(ctx.orderVariantSuffixes ?? [])]
      .filter((x): x is string => !!x && String(x).trim().length > 0)
      .map((x) => String(x).trim().toUpperCase()),
  );
}

/** Higher score = more desirable (search match + variant affinity from order / typed tail). */
export function suggestionDesirabilityScore(p: Product, ctx: SuggestionRankContext): number {
  const sku = p.sku.toUpperCase();
  const t = ctx.searchTerm.trim().toUpperCase();
  let score = 0;
  if (t.length >= 2) {
    if (sku === t) score += 100_000;
    else if (sku.startsWith(t)) score += 50_000;
    else if (t.length >= 3 && sku.includes(t)) score += 10_000;
  }
  score += variantHintRank(p, variantHintsForProduct(p, ctx));
  if (ctx.orderContextAffinitySkus?.size && ctx.orderContextAffinitySkus.has(p.sku)) {
    score += ORDER_CONTEXT_AFFINITY_BONUS;
  }
  return score;
}

export function sortProductsForSuggestions(products: Product[], ctx: SuggestionRankContext): Product[] {
  return [...products].sort((a, b) => {
    const diff = suggestionDesirabilityScore(b, ctx) - suggestionDesirabilityScore(a, ctx);
    if (diff !== 0) return diff;
    return a.sku.localeCompare(b.sku, undefined, { numeric: true });
  });
}

function pickHighlightSuffixFromContext(products: Product[], orderHints: string[], typed: string | null): string | null {
  const hints = [typed, ...orderHints]
    .filter((x): x is string => !!x && x.trim().length > 0)
    .map((x) => x.trim().toUpperCase());
  for (const h of hints) {
    if (products.some((p) => productMatchesVariantSuffix(p, h))) return h;
  }
  return null;
}

/** Same numeric core + shared collection (different master letters), incl. DA001–009 ↔ MN/SK901–909 and Ωρίων RN/PN/XR pairing. */
export function getCollectionCoreSiblings(index: ProductSearchIndex, product: Product): Product[] {
  const parts = parseMasterSkuParts(product.sku);
  if (!parts) return [];
  const out: Product[] = [];
  const seen = new Set<string>();

  for (const cid of product.collections || []) {
    const digitCores = new Set(expandCollectionDigitCoresForAnchor(parts));
    /** RN/PN/XR band SKUs (301–325, 401–425, …) always get +300 core linking in shared collections — not only when the collection is named Ωρίων (newer ring lines are often grouped without that tag). */
    const orion = expandOrionDigitCoresForAnchor(parts);
    if (orion) {
      for (const c of orion) digitCores.add(c);
    }

    const digitNums = new Set<number>();
    for (const c of digitCores) {
      const n = parseInt(c, 10);
      if (!Number.isNaN(n)) digitNums.add(n);
    }

    for (const core of digitCores) {
      const coreNum = parseInt(core, 10);
      if (Number.isNaN(coreNum)) continue;
      for (const alias of expandDigitCoreAliases(core, coreNum)) {
        const key = `${cid}|${alias}`;
        const skus = index.collectionCoreToSkus.get(key);
        if (!skus) continue;
        for (const sku of skus) {
          if (sku === product.sku) continue;
          const other = index.skuMap.get(sku);
          if (!other || !other.collections?.includes(cid)) continue;
          const op = parseMasterSkuParts(other.sku);
          if (!op || !digitNums.has(op.num)) continue;
          if (shouldExcludeDaMnSkCrosswalkSibling(parts, op)) continue;
          if (!seen.has(sku)) {
            seen.add(sku);
            out.push(other);
          }
        }
      }
    }
  }
  out.sort((a, b) => a.sku.localeCompare(b.sku, undefined, { numeric: true }));
  return out;
}

/** Masters on the order + their collection siblings — used to rank suggestions above unrelated SKUs. */
export function buildOrderContextAffinitySkuSet(
  index: ProductSearchIndex,
  orderContextMasterSkus: string[],
): Set<string> {
  const out = new Set<string>();
  for (const sku of orderContextMasterSkus) {
    const p = index.skuMap.get(sku);
    if (!p) continue;
    out.add(sku);
    for (const sib of getCollectionCoreSiblings(index, p)) {
      out.add(sib.sku);
    }
  }
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

function searchMasters(index: ProductSearchIndex, term: string, rankCtx?: SuggestionRankContext): Product[] {
  const t = term.trim().toUpperCase();
  if (t.length < 2) return [];
  const pool = t.length >= 2 ? index.byFirstTwo.get(t.slice(0, 2)) ?? index.masters : index.masters;

  const hits = pool.filter((p) => {
    const sku = p.sku.toUpperCase();
    if (sku.startsWith(t)) return true;
    if (t.length >= 3 && sku.includes(t)) return true;
    return false;
  });

  if (rankCtx) {
    return sortProductsForSuggestions(hits, rankCtx);
  }

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
  /** Legacy FIFO suffixes; superseded when `orderItems` + `resolveOrderLineProduct` are passed. */
  orderContextVariantSuffixes?: string[];
  /** Current cart lines — variant/metal hints scoped by collection, digit core, and gender. */
  orderItems?: OrderItem[];
  resolveOrderLineProduct?: (sku: string) => Product | undefined;
}

export function computeSmartSkuSuggestions(args: ComputeSmartSkuSuggestionsArgs): SmartSuggestionResult | null {
  const { index, skuPart } = args;
  const term = skuPart.trim().toUpperCase();
  if (term.length < 2) return null;

  const orderSuffixes = (args.orderContextVariantSuffixes || [])
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const { master: masterPartRaw, suffix: splitSuffix } = splitSkuComponents(term);
  const variantSuffix = splitSuffix ? splitSuffix.toUpperCase() : null;
  const masterUpper = masterPartRaw.trim().toUpperCase();
  /** Prefer master base for search when user is typing a full code with variant tail (e.g. SK025DPCO). */
  const searchTerm = masterUpper.length >= 2 && masterUpper !== term ? masterUpper : term;

  const affinitySkus = buildOrderContextAffinitySkuSet(index, args.orderContextMasterSkus);
  const useCartHints = Boolean(args.orderItems?.length && args.resolveOrderLineProduct);
  const rankCtx: SuggestionRankContext = {
    searchTerm,
    typedVariant: variantSuffix,
    orderVariantSuffixes: useCartHints ? [] : orderSuffixes,
    orderContextAffinitySkus: affinitySkus.size > 0 ? affinitySkus : undefined,
    ...(useCartHints
      ? {
          orderVariantResolution: {
            orderItems: args.orderItems!,
            resolveProduct: args.resolveOrderLineProduct!,
          },
        }
      : {}),
  };

  const searchHits = searchMasters(index, searchTerm, rankCtx);
  const rangeHint = computeRangeHint(searchTerm, searchHits);

  /** Only constrain order/set/family to this prefix when search already found hits (user is in a real family). */
  const letterLock =
    searchHits.length > 0 ? lockedSkuLetterPrefix(searchTerm) : null;

  let anchor: Product | null = index.skuMap.get(masterUpper) ?? index.skuMap.get(term) ?? null;
  if (!anchor && searchHits.length > 0) {
    anchor = searchHits[0];
  }

  let setMates: Product[] = [];
  let familyMates: Product[] = [];
  if (anchor && (anchor.collections?.length ?? 0) > 0) {
    setMates = sortProductsForSuggestions(
      filterByVariantSuffix(getCollectionCoreSiblings(index, anchor), variantSuffix),
      rankCtx,
    );
    familyMates = sortProductsForSuggestions(
      filterByVariantSuffix(getFamilyClusterSiblings(index, anchor), variantSuffix),
      rankCtx,
    );
  }

  let orderMates: Product[] = [];
  const seenOrder = new Set<string>();
  for (const sku of args.orderContextMasterSkus) {
    const p = index.skuMap.get(sku);
    if (!p) continue;
    const mates = filterByVariantSuffix(getCollectionCoreSiblings(index, p), variantSuffix);
    for (const m of sortProductsForSuggestions(mates, rankCtx)) {
      if (!seenOrder.has(m.sku)) {
        seenOrder.add(m.sku);
        orderMates.push(m);
      }
    }
  }

  if (letterLock) {
    setMates = filterProductsToLetterPrefix(setMates, letterLock);
    orderMates = filterProductsToLetterPrefix(orderMates, letterLock);
    familyMates = filterProductsToLetterPrefix(familyMates, letterLock);
  }

  const dedupe = (list: Product[], exclude: Set<string>) =>
    list.filter((p) => !exclude.has(p.sku));

  const used = new Set<string>();
  const virtualRows: SmartSuggestionVirtualRow[] = [];

  const pushSection = (id: string, label: string, list: Product[]) => {
    const sorted = sortProductsForSuggestions(list, rankCtx);
    const slice = sorted.slice(0, MAX_SECTION);
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

  const mergeTopPools = [
    ...searchHits,
    ...setMates,
    ...orderMates,
    ...familyMates,
  ];
  const topChips = sortProductsForSuggestions(mergeTopPools, rankCtx)
    .filter((p, i, arr) => arr.findIndex((x) => x.sku === p.sku) === i)
    .slice(0, MAX_TOP);

  let highlightVariantSuffix: string | null = null;
  if (useCartHints) {
    const pool = topChips.length > 0 ? topChips : searchHits.slice(0, MAX_TOP);
    for (const p of pool) {
      highlightVariantSuffix = getVariantDisplayHighlightHint(
        p,
        args.orderItems!,
        args.resolveOrderLineProduct!,
        variantSuffix,
      );
      if (highlightVariantSuffix) break;
    }
  } else {
    highlightVariantSuffix = pickHighlightSuffixFromContext(
      [...topChips, ...searchHits.slice(0, 20)],
      orderSuffixes,
      variantSuffix,
    );
  }

  return {
    topChips,
    virtualRows,
    rangeHint,
    variantSuffix,
    highlightVariantSuffix,
  };
}
