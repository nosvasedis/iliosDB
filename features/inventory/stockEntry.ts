import type { Product } from '../../types';
import { getSizingInfo } from '../../utils/sizing';
import { resolveSkuSizeInput } from '../../utils/skuSizeInput';
import { allowsBareMasterSkuResolution } from '../../utils/skuProductPicker';
import { normalizeInventorySizeInfo } from './posting';
import type { InventoryAvailability, InventoryPostingLine } from './types';

export const NO_SIZE_LABEL = 'Χωρίς μέγεθος';

export function formatSizeLabel(sizeInfo: string | null | undefined): string {
  return sizeInfo ? sizeInfo : NO_SIZE_LABEL;
}

/**
 * Size choices for a product. «Χωρίς μέγεθος» ('') is always first: a size is
 * never required, even for rings and bracelets.
 */
export function stockSizeOptions(product: Product | null | undefined, extraSizes: string[] = []): string[] {
  const sizing = product ? getSizingInfo(product) : null;
  const options = [''];
  [...(sizing?.sizes || []), ...extraSizes].forEach((size) => {
    const normalized = normalizeInventorySizeInfo(size);
    if (!options.includes(normalized)) options.push(normalized);
  });
  return options;
}

export interface ParsedStockEntry {
  product: Product;
  variantSuffix: string;
  sizeInfo: string;
  /** null when the text carried no quantity (callers default to 1). */
  quantity: number | null;
}

export type StockEntryParseResult =
  | { ok: true; entry: ParsedStockEntry }
  | { ok: false; reason: 'empty' | 'not-found' | 'needs-variant' | 'bad-quantity'; sku?: string };

const QTY_PREFIXED = /^[X×*](\d+)$/;

/**
 * Parses quick-entry text such as `RN001P 62 x3`, `BR020P-19 2`, `DA010P x2`
 * or `RN001P62`. Size and quantity are both optional; a lone numeric tail that
 * is not a valid size for the product is read as the quantity.
 */
export function parseStockEntryInput(text: string, products: Product[]): StockEntryParseResult {
  const tokens = text.trim().toUpperCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { ok: false, reason: 'empty' };

  let quantity: number | null = null;
  const last = tokens[tokens.length - 1];
  const prefixed = last.match(QTY_PREFIXED);
  if (prefixed && tokens.length > 1) {
    quantity = Number(prefixed[1]);
    tokens.pop();
  } else if (tokens.length >= 3 && /^\d+$/.test(last)) {
    quantity = Number(last);
    tokens.pop();
  }

  let resolved = resolveSkuSizeInput(tokens.join(' '), products, true);
  if (resolved.invalidSize && quantity === null && resolved.sizeToken && /^\d+$/.test(resolved.sizeToken)) {
    // `DA010P 3`: 3 is not a ring size, so it is the quantity.
    quantity = Number(resolved.sizeToken);
    resolved = resolveSkuSizeInput(resolved.sku, products, false);
  }
  if (quantity !== null && (!Number.isSafeInteger(quantity) || quantity <= 0)) {
    return { ok: false, reason: 'bad-quantity' };
  }

  const match = resolved.match;
  if (!match) return { ok: false, reason: 'not-found', sku: resolved.sku };
  const product = match.product as Product;
  const variants = product.variants || [];
  if (!match.variant && variants.length > 0 && !allowsBareMasterSkuResolution(product)) {
    return { ok: false, reason: 'needs-variant', sku: product.sku };
  }
  const variantSuffix = match.variant?.suffix ?? (variants.length === 1 ? variants[0].suffix : '');

  return {
    ok: true,
    entry: {
      product,
      variantSuffix,
      sizeInfo: resolved.size ? normalizeInventorySizeInfo(resolved.size) : '',
      quantity,
    },
  };
}

export interface ConsignmentDrawPlan {
  fromStock: number;
  direct: number;
  sources: Array<{ sizeInfo: string; quantity: number }>;
}

/**
 * Mirrors `private.consignment_draw_line_stock`: what a consignment handoff
 * will take from the source warehouse and what is booked directly.
 * Sized lines: exact size → unsized. Unsized lines: unsized → any size,
 * largest available first.
 */
export function planConsignmentDraw(
  line: { productSku: string; variantSuffix?: string | null; sizeInfo?: string | null; quantity: number },
  availability: InventoryAvailability[],
  sourceWarehouseId: string,
): ConsignmentDrawPlan {
  const variantSuffix = line.variantSuffix || '';
  const sizeInfo = normalizeInventorySizeInfo(line.sizeInfo);
  const rank = (size: string) => (size === sizeInfo ? 0 : size === '' ? 1 : 2);
  const candidates = availability
    .filter((row) => (
      row.productSku === line.productSku
      && row.variantSuffix === variantSuffix
      && row.warehouseId === sourceWarehouseId
      && row.onHand - row.reserved > 0
      && (sizeInfo === '' || row.sizeInfo === sizeInfo || row.sizeInfo === '')
    ))
    .sort((left, right) => (
      rank(left.sizeInfo) - rank(right.sizeInfo)
      || (right.onHand - right.reserved) - (left.onHand - left.reserved)
      || left.sizeInfo.localeCompare(right.sizeInfo)
    ));

  let remaining = Math.max(0, Math.trunc(line.quantity));
  const sources: ConsignmentDrawPlan['sources'] = [];
  for (const row of candidates) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, row.onHand - row.reserved);
    sources.push({ sizeInfo: row.sizeInfo, quantity: take });
    remaining -= take;
  }
  return { fromStock: Math.max(0, Math.trunc(line.quantity)) - remaining, direct: remaining, sources };
}

/**
 * Plans consignment lines that compete for the same stock, in order, so the
 * preview of line 2 accounts for what line 1 already takes.
 */
export function planConsignmentDraws(
  lines: Array<{ productSku: string; variantSuffix?: string | null; sizeInfo?: string | null; quantity: number }>,
  availability: InventoryAvailability[],
  sourceWarehouseId: string,
): ConsignmentDrawPlan[] {
  const working = availability.map((row) => ({ ...row }));
  return lines.map((line) => {
    const plan = planConsignmentDraw(line, working, sourceWarehouseId);
    plan.sources.forEach((source) => {
      const row = working.find((candidate) => (
        candidate.productSku === line.productSku
        && candidate.variantSuffix === (line.variantSuffix || '')
        && candidate.sizeInfo === source.sizeInfo
        && candidate.warehouseId === sourceWarehouseId
      ));
      if (row) row.onHand -= source.quantity;
    });
    return plan;
  });
}

export function describeConsignmentDraw(plan: ConsignmentDrawPlan): string {
  if (plan.direct === 0) return 'Όλα από αποθήκη';
  if (plan.fromStock === 0) return 'Νέα καταχώριση (δεν υπάρχουν στην αποθήκη)';
  return `${plan.fromStock} από αποθήκη · ${plan.direct} νέα καταχώριση`;
}

export interface StockEntryLineDraft {
  productSku: string;
  variantSuffix: string;
  sizeInfo: string;
  quantity: number;
}

/**
 * Builds the posting payload for one warehouse. In count mode, an unsized
 * total for an item that is stocked by size replaces the whole picture: the
 * unsized bucket gets the total and every sized bucket is counted as zero.
 */
export function buildStockEntryPostingLines(
  drafts: StockEntryLineDraft[],
  mode: 'count' | 'increase',
  warehouseId: string,
  availability: InventoryAvailability[],
): InventoryPostingLine[] {
  const merged = new Map<string, InventoryPostingLine>();
  drafts.forEach((draft) => {
    const line: InventoryPostingLine = {
      productSku: draft.productSku.trim().toUpperCase(),
      variantSuffix: (draft.variantSuffix || '').trim().toUpperCase(),
      sizeInfo: normalizeInventorySizeInfo(draft.sizeInfo),
      warehouseId,
      quantity: Math.trunc(draft.quantity),
    };
    const key = `${line.productSku}::${line.variantSuffix}::${line.sizeInfo}`;
    const existing = merged.get(key);
    if (existing) existing.quantity += line.quantity;
    else merged.set(key, line);
  });

  if (mode === 'count') {
    const additions: InventoryPostingLine[] = [];
    merged.forEach((line) => {
      if (line.sizeInfo !== '') return;
      const variantHasSizedDraft = Array.from(merged.values()).some((other) => (
        other.productSku === line.productSku && other.variantSuffix === line.variantSuffix && other.sizeInfo !== ''
      ));
      if (variantHasSizedDraft) return;
      availability
        .filter((row) => (
          row.productSku === line.productSku
          && row.variantSuffix === line.variantSuffix
          && row.warehouseId === warehouseId
          && row.sizeInfo !== ''
          && row.onHand !== 0
        ))
        .forEach((row) => {
          if (row.reserved > 0) {
            throw new Error(`Το ${line.productSku}${line.variantSuffix} έχει ${row.reserved} δεσμευμένα στο μέγεθος ${row.sizeInfo}. Καταμετρήστε ανά μέγεθος.`);
          }
          additions.push({ ...line, sizeInfo: row.sizeInfo, quantity: 0 });
        });
    });
    additions.forEach((line) => merged.set(`${line.productSku}::${line.variantSuffix}::${line.sizeInfo}`, line));
  }

  return Array.from(merged.values());
}

/** Unsized-count lines that will zero sized buckets, for the inline warning. */
export function countConsolidationWarnings(
  drafts: StockEntryLineDraft[],
  warehouseId: string,
  availability: InventoryAvailability[],
): string[] {
  const warnings = new Set<string>();
  drafts.forEach((draft) => {
    if (draft.sizeInfo) return;
    if (drafts.some((other) => other.productSku === draft.productSku && other.variantSuffix === draft.variantSuffix && other.sizeInfo)) return;
    const sized = availability.filter((row) => (
      row.productSku === draft.productSku
      && row.variantSuffix === draft.variantSuffix
      && row.warehouseId === warehouseId
      && row.sizeInfo !== ''
      && row.onHand !== 0
    ));
    if (sized.length > 0) warnings.add(`${draft.productSku}${draft.variantSuffix}`);
  });
  return Array.from(warnings);
}

/** Inline size summary such as `62×2 · 64×1 · χωρίς×3`. */
export function summarizeSizes(rows: Array<{ sizeInfo: string; onHand: number }>): string {
  const totals = new Map<string, number>();
  rows.forEach((row) => totals.set(row.sizeInfo, (totals.get(row.sizeInfo) || 0) + row.onHand));
  return Array.from(totals.entries())
    .filter(([, quantity]) => quantity !== 0)
    .sort(([left], [right]) => (left === '' ? 1 : right === '' ? -1 : left.localeCompare(right, 'el-GR', { numeric: true })))
    .map(([size, quantity]) => `${size || 'χωρίς'}×${quantity}`)
    .join(' · ');
}
