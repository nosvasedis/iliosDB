import type { Collection, Mold, Product } from '../../types';
import type { FinanceLineEvent } from '../../utils/financeAnalytics';
import { isOrionCollectionName, parseMasterSkuParts } from '../orders/smartSkuSuggestions';
import type { VariantAnalyticsSort } from './dashboardAnalysisViewModels';
import type { SkuModalFilterSelection } from './skuModalFilters';

export const ORION_EXCLUDED_DESIGN_NUMBERS = new Set([12, 19, 20]);
export const ORION_DESIGN_MIN = 1;
export const ORION_DESIGN_MAX = 99;

export type OrionJewelleryType = 'ring' | 'bracelet' | 'pendant';

export const ORION_TYPE_CHIPS: Array<{ id: OrionJewelleryType; label: string }> = [
  { id: 'ring', label: 'Δαχτυλίδια' },
  { id: 'bracelet', label: 'Βραχιόλια' },
  { id: 'pendant', label: 'Μενταγιόν' },
];

export interface OrionParsedSku {
  designNo: number;
  type: OrionJewelleryType;
  prefix: 'RN' | 'PN' | 'XR';
  num: number;
}

export interface OrionDesignTypeMix {
  ring: { quantity: number; revenue: number };
  bracelet: { quantity: number; revenue: number };
  pendant: { quantity: number; revenue: number };
}

export interface OrionDesignRanking {
  designNo: number;
  label: string;
  name: string;
  displayName: string;
  quantity: number;
  revenue: number;
  estimatedCost: number;
  profit: number;
  margin: number;
  image: string | null;
  typeMix: OrionDesignTypeMix;
  rank: number;
}

const TYPE_BY_PREFIX: Record<'RN' | 'PN' | 'XR', OrionJewelleryType> = {
  RN: 'ring',
  XR: 'bracelet',
  PN: 'pendant',
};

const MOTIF_RE = /^(.+?)\s+Ωρίων\s+(?:300|600)$/u;
const IGNORED_MOTIF_RE = /^(βάση|κρίκος|σφραγίδα)/iu;

function normalizeOrionPrefix(letters: string): 'RN' | 'PN' | 'XR' | null {
  const u = letters.normalize('NFC');
  if (u === 'RN' || u === '\u03A1\u039D') return 'RN';
  if (u === 'PN' || u === '\u03A0\u039D') return 'PN';
  if (u === 'XR' || u === '\u03A7\u03A1') return 'XR';
  const upper = u.toUpperCase();
  if (upper === 'RN' || upper === 'PN' || upper === 'XR') return upper;
  return null;
}

export function formatOrionDesignLabel(designNo: number): string {
  return String(designNo).padStart(2, '0');
}

export function parseOrionDesignFromSku(sku: string): OrionParsedSku | null {
  const parts = parseMasterSkuParts(sku);
  if (!parts || parts.num < 100) return null;
  const prefix = normalizeOrionPrefix(parts.letters);
  if (!prefix) return null;
  const designNo = parts.num % 100;
  if (designNo < ORION_DESIGN_MIN || designNo > ORION_DESIGN_MAX) return null;
  if (ORION_EXCLUDED_DESIGN_NUMBERS.has(designNo)) return null;
  return { designNo, type: TYPE_BY_PREFIX[prefix], prefix, num: parts.num };
}

function motifFromMoldDescription(description: string | undefined): string | null {
  const text = (description || '').trim();
  if (!text) return null;
  const match = text.match(MOTIF_RE);
  if (!match) return null;
  const motif = match[1].trim();
  if (!motif || IGNORED_MOTIF_RE.test(motif)) return null;
  return motif;
}

export function resolveOrionDesignName(
  designNo: number,
  products: Product[],
  molds: Mold[],
): string {
  const moldByCode = new Map(molds.map((mold) => [mold.code, mold]));
  for (const product of products) {
    const parsed = parseOrionDesignFromSku(product.sku);
    if (!parsed || parsed.designNo !== designNo) continue;
    for (const link of product.molds || []) {
      const motif = motifFromMoldDescription(moldByCode.get(link.code)?.description);
      if (motif) return motif;
    }
  }
  return `Παράσταση ${designNo}`;
}

export function shouldShowOrionDesignView(
  filters: SkuModalFilterSelection,
  events: FinanceLineEvent[],
  collections: Collection[],
): boolean {
  const orionIds = new Set(
    collections.filter((collection) => isOrionCollectionName(collection.name)).map((collection) => String(collection.id)),
  );
  if (filters.collections.size > 0) {
    return [...filters.collections].every((key) => orionIds.has(key));
  }
  if (events.length === 0) return false;
  return events.every((event) => isOrionCollectionName(event.collectionName));
}

function emptyTypeMix(): OrionDesignTypeMix {
  return {
    ring: { quantity: 0, revenue: 0 },
    bracelet: { quantity: 0, revenue: 0 },
    pendant: { quantity: 0, revenue: 0 },
  };
}

function eventMatchesTypes(parsed: OrionParsedSku, types: Set<OrionJewelleryType>): boolean {
  if (types.size === 0) return true;
  return types.has(parsed.type);
}

export function filterEventsForOrionDesign(events: FinanceLineEvent[], designNo: number): FinanceLineEvent[] {
  return events.filter((event) => parseOrionDesignFromSku(event.sku)?.designNo === designNo);
}

export function aggregateOrionDesignRankings(
  events: FinanceLineEvent[],
  products: Product[],
  molds: Mold[],
  types: Set<OrionJewelleryType>,
  sort: VariantAnalyticsSort,
): OrionDesignRanking[] {
  const productsBySku = new Map(products.map((product) => [product.sku, product]));
  type Acc = {
    designNo: number;
    quantity: number;
    revenue: number;
    estimatedCost: number;
    profit: number;
    typeMix: OrionDesignTypeMix;
    images: Partial<Record<OrionJewelleryType, string>>;
  };
  const byDesign = new Map<number, Acc>();

  events.forEach((event) => {
    const parsed = parseOrionDesignFromSku(event.sku);
    if (!parsed || !eventMatchesTypes(parsed, types)) return;
    const row = byDesign.get(parsed.designNo) || {
      designNo: parsed.designNo,
      quantity: 0,
      revenue: 0,
      estimatedCost: 0,
      profit: 0,
      typeMix: emptyTypeMix(),
      images: {},
    };
    row.quantity += event.quantity;
    row.revenue += event.net;
    row.estimatedCost += event.estimatedCost;
    row.profit += event.profit;
    row.typeMix[parsed.type].quantity += event.quantity;
    row.typeMix[parsed.type].revenue += event.net;
    const image = productsBySku.get(event.sku)?.image_url || event.productImage;
    if (image && !row.images[parsed.type]) row.images[parsed.type] = image;
    byDesign.set(parsed.designNo, row);
  });

  const ranked = Array.from(byDesign.values()).map((row) => {
    const name = resolveOrionDesignName(row.designNo, products, molds);
    const label = formatOrionDesignLabel(row.designNo);
    return {
      designNo: row.designNo,
      label,
      name,
      displayName: `${label} · ${name}`,
      quantity: row.quantity,
      revenue: row.revenue,
      estimatedCost: row.estimatedCost,
      profit: row.profit,
      margin: row.revenue > 0 ? (row.profit / row.revenue) * 100 : 0,
      image: row.images.bracelet || row.images.ring || row.images.pendant || null,
      typeMix: row.typeMix,
      rank: 0,
    };
  });

  ranked.sort((a, b) => {
    if (sort === 'revenue') return b.revenue - a.revenue;
    if (sort === 'profit') return b.profit - a.profit;
    if (sort === 'margin') return b.margin - a.margin;
    return b.quantity - a.quantity;
  });

  return ranked.map((row, index) => ({ ...row, rank: index + 1 }));
}
