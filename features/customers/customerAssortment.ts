/**
 * «Γκάμα & Περιοχή»: what we sell to which shop, and whether nearby shops carry the same designs.
 *
 * One pass over all orders builds an index (per customer purchase lines + catalogue facts + shop
 * places). Everything else — per-customer assortment, directory filters, neighbour overlaps,
 * exclusivity breaches and «safe to sell» suggestions — is derived from that index and cached
 * per window / radius, so the UI never rescans the order history.
 */
import { OrderStatus, type Collection, type Customer, type CustomerExclusivityScope, type Order, type Product } from '../../types';
import { isSpecialCreationSku } from '../../utils/specialCreationSku';
import { RETAIL_CUSTOMER_ID, RETAIL_CUSTOMER_NAME } from '../../utils/retailConstants';
import { buildCustomerPlaces, placeKey, type LocationPrecision } from './customerLocation';
import { classifyJewelryKind, jewelryKindLabel, SPECIAL_KIND, UNMATCHED_KIND } from './jewelryKinds';
import { isExclusivityActive, readCustomerProfile } from './customerProfile';
import type { LatLng } from './greekRegions';

const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export type AssortmentWindow = '6m' | '12m' | '24m' | 'all';

export const WINDOW_OPTIONS: Array<{ id: AssortmentWindow; label: string; short: string; months: number | null }> = [
  { id: '6m', label: 'Τελευταίοι 6 μήνες', short: '6 μήνες', months: 6 },
  { id: '12m', label: 'Τελευταίοι 12 μήνες', short: '12 μήνες', months: 12 },
  { id: '24m', label: 'Τελευταία 2 χρόνια', short: '2 χρόνια', months: 24 },
  { id: 'all', label: 'Όλο το ιστορικό', short: 'Όλα', months: null },
];

export const RADIUS_OPTIONS = [0.5, 1, 2, 5, 10, 25] as const;

export function formatRadius(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} μ.` : `${km.toLocaleString('el-GR')} km`;
}

export function formatDistance(km: number | null): string {
  if (km === null) return 'Ίδια περιοχή';
  if (km < 0.05) return 'Δίπλα';
  if (km < 1) return `${Math.round(km * 1000 / 10) * 10} μ.`;
  return `${km.toLocaleString('el-GR', { maximumFractionDigits: km < 10 ? 1 : 0 })} km`;
}

function windowStart(window: AssortmentWindow, now: number): number {
  const months = WINDOW_OPTIONS.find(o => o.id === window)?.months ?? null;
  if (months === null) return -Infinity;
  const d = new Date(now);
  d.setMonth(d.getMonth() - months);
  return d.getTime();
}

// ---------------------------------------------------------------------------
// Index
// ---------------------------------------------------------------------------

export interface ProductInfo {
  sku: string;
  kindId: string;
  kindLabel: string;
  category: string | null;
  collectionIds: number[];
  description: string | null;
  image: string | null;
  /** In the current catalogue. */
  known: boolean;
  special: boolean;
  isComponent: boolean;
}

interface Line {
  sku: string;
  variant: string;
  qty: number;
  net: number;
  t: number;
  orderId: string;
}

export interface TerritoryPlace {
  label: string;
  coords: LatLng | null;
  precision: LocationPrecision;
  town: string | null;
  townKey: string | null;
  postalPrefix: string | null;
  countryCode: string;
}

export interface AssortmentIndex {
  now: number;
  customers: Map<string, Customer>;
  products: Map<string, ProductInfo>;
  collections: Map<number, string>;
  lines: Map<string, Line[]>;
  places: Map<string, TerritoryPlace[]>;
  /** Lazily filled caches (index is immutable otherwise). */
  windowCache: Map<AssortmentWindow, WindowAggregate>;
  neighborCache: Map<number, Map<string, NeighborMatch[]>>;
  overlapCache: Map<string, { ignored: ReadonlySet<string> | undefined; result: TerritoryOverlap[] }>;
}

export interface BuildAssortmentInput {
  customers: Customer[];
  orders: Order[];
  products: Product[];
  collections?: Collection[];
  now?: number;
}

export function isTerritoryCustomer(id: string): boolean {
  return id !== RETAIL_CUSTOMER_ID;
}

function productInfo(product: Product): ProductInfo {
  const kind = classifyJewelryKind(product.sku, product.category);
  return {
    sku: product.sku,
    kindId: kind.id,
    kindLabel: kind.label,
    category: product.category?.trim() || null,
    collectionIds: Array.isArray(product.collections) ? product.collections : [],
    description: product.description?.trim() || null,
    image: product.image_url || null,
    known: true,
    special: false,
    isComponent: Boolean(product.is_component),
  };
}

function unknownInfo(sku: string, fallback?: Product): ProductInfo {
  if (fallback) return { ...productInfo(fallback), sku, known: false };
  const special = isSpecialCreationSku(sku);
  const kind = special ? SPECIAL_KIND : classifyJewelryKind(sku, null);
  return {
    sku, kindId: kind.id, kindLabel: kind.label, category: null, collectionIds: [], description: null,
    image: null, known: false, special, isComponent: false,
  };
}

function territoryPlaces(customer: Customer): TerritoryPlace[] {
  return buildCustomerPlaces(customer)
    .filter(place => place.location.coords || place.location.town)
    .map(place => ({
      label: place.label,
      coords: place.location.coords,
      precision: place.location.precision,
      town: place.location.town,
      townKey: place.location.town ? placeKey(place.location.town) : null,
      postalPrefix: place.location.postalCode ? place.location.postalCode.replace(/\D/g, '').slice(0, 3) || null : null,
      countryCode: place.location.countryCode,
    }));
}

export function buildAssortmentIndex(input: BuildAssortmentInput): AssortmentIndex {
  const now = input.now ?? Date.now();
  const customers = new Map(input.customers.map(c => [c.id, c]));
  const products = new Map<string, ProductInfo>();
  for (const product of input.products) {
    if (product?.sku) products.set(product.sku, productInfo(product));
  }
  const collections = new Map((input.collections ?? []).map(c => [c.id, c.name]));

  // Legacy orders without customer_id are matched by exact name, as elsewhere in the app.
  const idByName = new Map<string, string>();
  for (const c of input.customers) {
    if (c.full_name && !idByName.has(c.full_name)) idByName.set(c.full_name, c.id);
  }

  const lines = new Map<string, Line[]>();
  for (const order of input.orders) {
    if (order.status === OrderStatus.Cancelled || !Array.isArray(order.items)) continue;
    const customerId = order.customer_id
      || (order.customer_name === RETAIL_CUSTOMER_NAME ? RETAIL_CUSTOMER_ID : idByName.get(order.customer_name));
    if (!customerId || !customers.has(customerId)) continue;
    const t = new Date(order.created_at).getTime();
    if (!Number.isFinite(t)) continue;
    const discount = 1 - (Number(order.discount_percent) || 0) / 100;
    const list = lines.get(customerId) ?? [];
    for (const item of order.items) {
      const sku = (item.sku || '').trim();
      const qty = Number(item.quantity) || 0;
      if (!sku || qty <= 0) continue;
      if (!products.has(sku)) products.set(sku, unknownInfo(sku, item.product_details));
      list.push({ sku, variant: item.variant_suffix || '', qty, net: (Number(item.price_at_order) || 0) * qty * discount, t, orderId: order.id });
    }
    lines.set(customerId, list);
  }
  lines.forEach(list => list.sort((a, b) => a.t - b.t || (a.orderId < b.orderId ? -1 : a.orderId > b.orderId ? 1 : 0)));

  const places = new Map<string, TerritoryPlace[]>();
  for (const customer of input.customers) {
    if (isTerritoryCustomer(customer.id)) places.set(customer.id, territoryPlaces(customer));
  }

  return { now, customers, products, collections, lines, places, windowCache: new Map(), neighborCache: new Map(), overlapCache: new Map() };
}

// Shared cache: the customers page, the customer card and the order builder reuse one index.
let lastIndex: { key: unknown[]; index: AssortmentIndex } | null = null;

/** Memoised by input identity (React Query keeps the arrays stable between renders). */
export function getAssortmentIndex(input: BuildAssortmentInput): AssortmentIndex {
  const key = [input.customers, input.orders, input.products, input.collections];
  if (lastIndex && lastIndex.key.every((value, i) => value === key[i]) && Math.abs((input.now ?? Date.now()) - lastIndex.index.now) < 60 * 60 * 1000) {
    return lastIndex.index;
  }
  const index = buildAssortmentIndex(input);
  lastIndex = { key, index };
  return index;
}

// ---------------------------------------------------------------------------
// Window aggregates
// ---------------------------------------------------------------------------

export interface PurchaseAgg {
  qty: number;
  net: number;
  orders: number;
  first: number;
  last: number;
  lastOrderId: string;
}

export interface CustomerWindowAgg {
  qty: number;
  net: number;
  orders: number;
  first: number;
  last: number;
  lastOrderId: string;
  skus: Map<string, PurchaseAgg & { variants: Map<string, number> }>;
  kinds: Map<string, PurchaseAgg>;
  collections: Map<number, PurchaseAgg>;
  categories: Map<string, PurchaseAgg>;
}

export interface WindowAggregate {
  window: AssortmentWindow;
  start: number;
  byCustomer: Map<string, CustomerWindowAgg>;
  /** Wholesale customers (not Λιανική) per SKU / kind / collection / category. */
  skuCustomers: Map<string, Set<string>>;
  kindCustomers: Map<string, Set<string>>;
  collectionCustomers: Map<number, Set<string>>;
  categoryCustomers: Map<string, Set<string>>;
}

function emptyAgg(): PurchaseAgg {
  return { qty: 0, net: 0, orders: 0, first: Infinity, last: -Infinity, lastOrderId: '' };
}

function addTo(agg: PurchaseAgg, line: Line) {
  agg.qty += line.qty;
  agg.net += line.net;
  if (agg.lastOrderId !== line.orderId) {
    agg.orders += 1;
    agg.lastOrderId = line.orderId;
  }
  if (line.t < agg.first) agg.first = line.t;
  if (line.t > agg.last) agg.last = line.t;
}

function bump<K>(map: Map<K, PurchaseAgg>, key: K, line: Line) {
  let agg = map.get(key);
  if (!agg) { agg = emptyAgg(); map.set(key, agg); }
  addTo(agg, line);
}

function addMember<K>(map: Map<K, Set<string>>, key: K, customerId: string) {
  let set = map.get(key);
  if (!set) { set = new Set(); map.set(key, set); }
  set.add(customerId);
}

export function getWindowAggregate(index: AssortmentIndex, window: AssortmentWindow): WindowAggregate {
  const cached = index.windowCache.get(window);
  if (cached) return cached;
  const start = windowStart(window, index.now);
  const agg: WindowAggregate = {
    window, start, byCustomer: new Map(),
    skuCustomers: new Map(), kindCustomers: new Map(), collectionCustomers: new Map(), categoryCustomers: new Map(),
  };
  index.lines.forEach((list, customerId) => {
    const territory = isTerritoryCustomer(customerId);
    let row: CustomerWindowAgg | null = null;
    for (const line of list) {
      if (line.t < start || line.t > index.now) continue;
      if (!row) {
        row = { ...emptyAgg(), skus: new Map(), kinds: new Map(), collections: new Map(), categories: new Map() };
      }
      addTo(row, line);
      const info = index.products.get(line.sku)!;
      let skuAgg = row.skus.get(line.sku);
      if (!skuAgg) { skuAgg = { ...emptyAgg(), variants: new Map() }; row.skus.set(line.sku, skuAgg); }
      addTo(skuAgg, line);
      skuAgg.variants.set(line.variant, (skuAgg.variants.get(line.variant) ?? 0) + line.qty);
      bump(row.kinds, info.kindId, line);
      if (info.category) bump(row.categories, info.category, line);
      for (const id of info.collectionIds) bump(row.collections, id, line);
      if (territory) {
        addMember(agg.skuCustomers, line.sku, customerId);
        addMember(agg.kindCustomers, info.kindId, customerId);
        if (info.category) addMember(agg.categoryCustomers, info.category, customerId);
        for (const id of info.collectionIds) addMember(agg.collectionCustomers, id, customerId);
      }
    }
    if (row) agg.byCustomer.set(customerId, row);
  });
  index.windowCache.set(window, agg);
  return agg;
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

export function collectionName(index: AssortmentIndex, id: number): string {
  return index.collections.get(id) ?? `Συλλογή #${id}`;
}

export function skuInfo(index: AssortmentIndex, sku: string): ProductInfo {
  return index.products.get(sku) ?? unknownInfo(sku);
}

export function customerName(index: AssortmentIndex, id: string): string {
  return index.customers.get(id)?.full_name ?? 'Άγνωστος πελάτης';
}

/** Excluded from overlap checks and suggestions: one-off pieces and production parts. */
function isTradeSku(info: ProductInfo): boolean {
  return !info.special && !info.isComponent;
}

// ---------------------------------------------------------------------------
// Per-customer assortment
// ---------------------------------------------------------------------------

export interface MixRow {
  key: string;
  label: string;
  qty: number;
  net: number;
  orders: number;
  last: number;
  /** Share of the customer's pieces in the window (0-100). */
  share: number;
  skuCount: number;
}

export interface SkuRow {
  sku: string;
  description: string | null;
  image: string | null;
  kindId: string;
  kindLabel: string;
  collectionNames: string[];
  qty: number;
  net: number;
  orders: number;
  first: number;
  last: number;
  variants: Array<{ suffix: string; qty: number }>;
  known: boolean;
  special: boolean;
  /** First bought inside the window. */
  isNew: boolean;
}

export interface CustomerAssortmentView {
  window: AssortmentWindow;
  hasHistory: boolean;
  totals: { qty: number; net: number; orders: number; skuCount: number; collectionCount: number; kindCount: number; newSkuCount: number; first: number | null; last: number | null };
  kinds: MixRow[];
  collections: MixRow[];
  categories: MixRow[];
  skus: SkuRow[];
}

function mixRows<K>(map: Map<K, PurchaseAgg>, totalQty: number, label: (key: K) => string, skuCount: (key: K) => number): MixRow[] {
  return [...map.entries()]
    .map(([key, a]) => ({
      key: String(key), label: label(key), qty: a.qty, net: Math.round(a.net * 100) / 100, orders: a.orders, last: a.last,
      share: totalQty > 0 ? (a.qty / totalQty) * 100 : 0, skuCount: skuCount(key),
    }))
    .sort((a, b) => b.qty - a.qty || b.net - a.net);
}

export function getCustomerAssortment(index: AssortmentIndex, customerId: string, window: AssortmentWindow): CustomerAssortmentView {
  const agg = getWindowAggregate(index, window).byCustomer.get(customerId);
  const allTime = getWindowAggregate(index, 'all').byCustomer.get(customerId);
  if (!agg) {
    return {
      window, hasHistory: Boolean(allTime),
      totals: { qty: 0, net: 0, orders: 0, skuCount: 0, collectionCount: 0, kindCount: 0, newSkuCount: 0, first: null, last: null },
      kinds: [], collections: [], categories: [], skus: [],
    };
  }
  const start = windowStart(window, index.now);
  const skusByKind = new Map<string, number>();
  const skusByCollection = new Map<number, number>();
  const skusByCategory = new Map<string, number>();
  const skus: SkuRow[] = [];
  agg.skus.forEach((a, sku) => {
    const info = skuInfo(index, sku);
    skusByKind.set(info.kindId, (skusByKind.get(info.kindId) ?? 0) + 1);
    if (info.category) skusByCategory.set(info.category, (skusByCategory.get(info.category) ?? 0) + 1);
    info.collectionIds.forEach(id => skusByCollection.set(id, (skusByCollection.get(id) ?? 0) + 1));
    const firstEver = allTime?.skus.get(sku)?.first ?? a.first;
    skus.push({
      sku, description: info.description, image: info.image, kindId: info.kindId, kindLabel: info.kindLabel,
      collectionNames: info.collectionIds.map(id => collectionName(index, id)),
      qty: a.qty, net: Math.round(a.net * 100) / 100, orders: a.orders, first: a.first, last: a.last,
      variants: [...a.variants.entries()].map(([suffix, qty]) => ({ suffix, qty })).sort((x, y) => y.qty - x.qty),
      known: info.known, special: info.special, isNew: window !== 'all' && firstEver >= start,
    });
  });
  skus.sort((a, b) => b.qty - a.qty || b.net - a.net || a.sku.localeCompare(b.sku));
  return {
    window,
    hasHistory: true,
    totals: {
      qty: agg.qty, net: Math.round(agg.net * 100) / 100, orders: agg.orders, skuCount: agg.skus.size,
      collectionCount: agg.collections.size, kindCount: agg.kinds.size,
      newSkuCount: skus.filter(s => s.isNew).length, first: agg.first, last: agg.last,
    },
    kinds: mixRows(agg.kinds, agg.qty, jewelryKindLabel, k => skusByKind.get(k) ?? 0),
    collections: mixRows(agg.collections, agg.qty, id => collectionName(index, id), id => skusByCollection.get(id) ?? 0),
    categories: mixRows(agg.categories, agg.qty, c => c, c => skusByCategory.get(c) ?? 0),
    skus,
  };
}

/** Compact «τι αγοράζει» for overview cards: kind shares over the whole history. */
export function getCustomerKindMix(index: AssortmentIndex, customerId: string, window: AssortmentWindow = 'all'): MixRow[] {
  return getCustomerAssortment(index, customerId, window).kinds;
}

// ---------------------------------------------------------------------------
// Neighbours
// ---------------------------------------------------------------------------

export interface NeighborMatch {
  customerId: string;
  /** Straight-line distance when both shops have a real position; null for «ίδια περιοχή». */
  distanceKm: number | null;
  /** This customer's shop and the neighbour's shop that are close. */
  placeLabel: string;
  otherPlaceLabel: string;
  town: string | null;
}

export function haversineKm(a: LatLng, b: LatLng): number {
  const rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad;
  const dLng = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Two shops are neighbours when:
 *  - both have a real or town position and are within the radius, or
 *  - they are in the same town (and, in cities, the same postal area: first 3 digits of the ΤΚ).
 * «Κατά προσέγγιση» positions (prefecture centre) never count by distance.
 */
export function placesNear(a: TerritoryPlace, b: TerritoryPlace, radiusKm: number): { distanceKm: number | null } | null {
  const usable = (p: TerritoryPlace) => p.coords && (p.precision === 'exact' || p.precision === 'town');
  if (usable(a) && usable(b)) {
    const d = haversineKm(a.coords!, b.coords!);
    const exact = a.precision === 'exact' && b.precision === 'exact';
    if (d <= radiusKm) return { distanceKm: exact ? d : (a.townKey && a.townKey === b.townKey ? null : d) };
    if (exact) return null;
  }
  if (a.townKey && a.townKey === b.townKey && a.countryCode === b.countryCode
    && (!a.postalPrefix || !b.postalPrefix || a.postalPrefix === b.postalPrefix)) {
    return { distanceKm: null };
  }
  return null;
}

function neighborMap(index: AssortmentIndex, radiusKm: number): Map<string, NeighborMatch[]> {
  const cached = index.neighborCache.get(radiusKm);
  if (cached) return cached;
  const ids = [...index.places.keys()].filter(id => (index.places.get(id)?.length ?? 0) > 0);
  const result = new Map<string, NeighborMatch[]>(ids.map(id => [id, []]));
  for (let i = 0; i < ids.length; i += 1) {
    const aPlaces = index.places.get(ids[i])!;
    for (let j = i + 1; j < ids.length; j += 1) {
      const bPlaces = index.places.get(ids[j])!;
      let best: { d: number | null; a: TerritoryPlace; b: TerritoryPlace } | null = null;
      for (const pa of aPlaces) {
        for (const pb of bPlaces) {
          const near = placesNear(pa, pb, radiusKm);
          if (!near) continue;
          const rank = near.distanceKm ?? radiusKm / 2;
          const bestRank = best ? (best.d ?? radiusKm / 2) : Infinity;
          if (rank < bestRank) best = { d: near.distanceKm, a: pa, b: pb };
        }
      }
      if (!best) continue;
      const town = best.a.town ?? best.b.town;
      result.get(ids[i])!.push({ customerId: ids[j], distanceKm: best.d, placeLabel: best.a.label, otherPlaceLabel: best.b.label, town });
      result.get(ids[j])!.push({ customerId: ids[i], distanceKm: best.d, placeLabel: best.b.label, otherPlaceLabel: best.a.label, town });
    }
  }
  result.forEach(list => list.sort((x, y) => (x.distanceKm ?? radiusKm / 2) - (y.distanceKm ?? radiusKm / 2)));
  index.neighborCache.set(radiusKm, result);
  return result;
}

export function findNeighbors(index: AssortmentIndex, customerId: string, radiusKm: number): NeighborMatch[] {
  return neighborMap(index, radiusKm).get(customerId) ?? [];
}

// ---------------------------------------------------------------------------
// Exclusivity
// ---------------------------------------------------------------------------

export interface ActiveExclusivity {
  holderId: string;
  radiusKm: number;
  scopes: CustomerExclusivityScope[];
}

function activeExclusivities(index: AssortmentIndex): ActiveExclusivity[] {
  const list: ActiveExclusivity[] = [];
  index.customers.forEach((customer, id) => {
    if (!isTerritoryCustomer(id)) return;
    const ex = readCustomerProfile(customer).exclusivity;
    if (isExclusivityActive(ex, index.now)) list.push({ holderId: id, radiusKm: ex.radius_km, scopes: ex.scopes });
  });
  return list;
}

export function scopeLabel(index: AssortmentIndex, scope: CustomerExclusivityScope): string {
  if (scope.kind === 'collection') return `Συλλογή ${collectionName(index, Number(scope.key))}`;
  if (scope.kind === 'jewelry_kind') return jewelryKindLabel(scope.key);
  return `Κωδικός ${scope.key}`;
}

/** Whether a SKU is covered by an exclusivity. Empty scopes = what the holder itself buys. */
function exclusivityCovers(index: AssortmentIndex, ex: ActiveExclusivity, sku: string, holderSkus: Map<string, unknown> | undefined): CustomerExclusivityScope | 'own' | null {
  const info = skuInfo(index, sku);
  if (!isTradeSku(info)) return null;
  if (ex.scopes.length === 0) return holderSkus?.has(sku) ? 'own' : null;
  return ex.scopes.find(scope => (scope.kind === 'sku' && scope.key === sku)
    || (scope.kind === 'jewelry_kind' && scope.key === info.kindId)
    || (scope.kind === 'collection' && info.collectionIds.includes(Number(scope.key)))) ?? null;
}

// ---------------------------------------------------------------------------
// Overlaps («επικαλύψεις»)
// ---------------------------------------------------------------------------

export type OverlapSeverity = 'critical' | 'high' | 'medium';

export const SEVERITY_META: Record<OverlapSeverity, { label: string; hint: string; tone: string; dot: string }> = {
  critical: { label: 'Παραβίαση αποκλειστικότητας', hint: 'Γειτονικό κατάστημα πήρε είδος που καλύπτει συμφωνία αποκλειστικότητας.', tone: 'bg-rose-50 text-rose-800 ring-rose-200', dot: 'bg-rose-600' },
  high: { label: 'Ίδιοι κωδικοί', hint: 'Τα δύο καταστήματα έχουν αγοράσει τα ίδια σχέδια.', tone: 'bg-orange-50 text-orange-800 ring-orange-200', dot: 'bg-orange-500' },
  medium: { label: 'Ίδιες συλλογές', hint: 'Διαφορετικοί κωδικοί, αλλά από τις ίδιες συλλογές.', tone: 'bg-amber-50 text-amber-800 ring-amber-200', dot: 'bg-amber-400' },
};

export interface SharedSku {
  sku: string;
  description: string | null;
  image: string | null;
  aQty: number;
  bQty: number;
  aLast: number;
  bLast: number;
}

export interface SharedCollection {
  id: number;
  name: string;
  aQty: number;
  bQty: number;
}

export interface ExclusivityBreach {
  holderId: string;
  otherId: string;
  scope: string;
  skus: string[];
}

export interface TerritoryOverlap {
  id: string;
  aId: string;
  bId: string;
  severity: OverlapSeverity;
  distanceKm: number | null;
  town: string | null;
  aPlace: string;
  bPlace: string;
  sharedSkus: SharedSku[];
  sharedCollections: SharedCollection[];
  breaches: ExclusivityBreach[];
}

export interface OverlapOptions {
  radiusKm: number;
  window: AssortmentWindow;
  /** Keys muted by the user: `sku:<SKU>` or `col:<id>`. */
  ignored?: ReadonlySet<string>;
}

export const ignoreSkuKey = (sku: string) => `sku:${sku}`;
export const ignoreCollectionKey = (id: number) => `col:${id}`;

function pairOverlap(
  index: AssortmentIndex,
  agg: WindowAggregate,
  aId: string,
  bId: string,
  near: { distanceKm: number | null; town: string | null; aPlace: string; bPlace: string },
  ignored: ReadonlySet<string> | undefined,
  breaches: ExclusivityBreach[],
): TerritoryOverlap | null {
  const a = agg.byCustomer.get(aId);
  const b = agg.byCustomer.get(bId);
  if ((!a || !b) && breaches.length === 0) return null;
  const sharedSkus: SharedSku[] = [];
  const sharedCollections: SharedCollection[] = [];
  if (a && b) {
    const [small, large, flipped] = a.skus.size <= b.skus.size ? [a, b, false] : [b, a, true];
    small.skus.forEach((sa, sku) => {
      const sb = large.skus.get(sku);
      if (!sb || ignored?.has(ignoreSkuKey(sku))) return;
      const info = skuInfo(index, sku);
      if (!isTradeSku(info)) return;
      const [x, y] = flipped ? [sb, sa] : [sa, sb];
      sharedSkus.push({ sku, description: info.description, image: info.image, aQty: x.qty, bQty: y.qty, aLast: x.last, bLast: y.last });
    });
    a.collections.forEach((ca, id) => {
      const cb = b.collections.get(id);
      if (!cb || ignored?.has(ignoreCollectionKey(id))) return;
      sharedCollections.push({ id, name: collectionName(index, id), aQty: ca.qty, bQty: cb.qty });
    });
  }
  if (sharedSkus.length === 0 && sharedCollections.length === 0 && breaches.length === 0) return null;
  sharedSkus.sort((x, y) => (y.aQty + y.bQty) - (x.aQty + x.bQty));
  sharedCollections.sort((x, y) => (y.aQty + y.bQty) - (x.aQty + x.bQty));
  const severity: OverlapSeverity = breaches.length ? 'critical' : sharedSkus.length ? 'high' : 'medium';
  return {
    id: aId < bId ? `${aId}|${bId}` : `${bId}|${aId}`,
    aId, bId, severity,
    distanceKm: near.distanceKm, town: near.town, aPlace: near.aPlace, bPlace: near.bPlace,
    sharedSkus, sharedCollections, breaches,
  };
}

/** Breaches of `holder`'s exclusivity by `other` (other must be within the holder's radius). */
function breachesBy(index: AssortmentIndex, agg: WindowAggregate, ex: ActiveExclusivity, otherId: string, ignored?: ReadonlySet<string>): ExclusivityBreach[] {
  const other = agg.byCustomer.get(otherId);
  if (!other) return [];
  const holderSkus = getWindowAggregate(index, 'all').byCustomer.get(ex.holderId)?.skus;
  const byScope = new Map<string, string[]>();
  other.skus.forEach((_s, sku) => {
    if (ignored?.has(ignoreSkuKey(sku))) return;
    const scope = exclusivityCovers(index, ex, sku, holderSkus);
    if (!scope) return;
    const label = scope === 'own' ? 'Κωδικοί του πελάτη' : scopeLabel(index, scope);
    byScope.set(label, [...(byScope.get(label) ?? []), sku]);
  });
  return [...byScope.entries()].map(([scope, skus]) => ({ holderId: ex.holderId, otherId, scope, skus }));
}

function severityRank(s: OverlapSeverity) {
  return s === 'critical' ? 0 : s === 'high' ? 1 : 2;
}

export function sortOverlaps(list: TerritoryOverlap[]): TerritoryOverlap[] {
  return list.sort((x, y) => severityRank(x.severity) - severityRank(y.severity)
    || y.breaches.length - x.breaches.length
    || y.sharedSkus.length - x.sharedSkus.length
    || y.sharedCollections.length - x.sharedCollections.length
    || (x.distanceKm ?? 0) - (y.distanceKm ?? 0));
}

/** Every pair of nearby wholesale customers whose assortments overlap. */
export function findAllOverlaps(index: AssortmentIndex, options: OverlapOptions): TerritoryOverlap[] {
  const cacheKey = `${options.window}|${options.radiusKm}`;
  const cached = index.overlapCache.get(cacheKey);
  if (cached && cached.ignored === options.ignored) return cached.result;
  const result = computeAllOverlaps(index, options);
  index.overlapCache.set(cacheKey, { ignored: options.ignored, result });
  return result;
}

function computeAllOverlaps(index: AssortmentIndex, options: OverlapOptions): TerritoryOverlap[] {
  const agg = getWindowAggregate(index, options.window);
  const pairs = new Map<string, { aId: string; bId: string; near: { distanceKm: number | null; town: string | null; aPlace: string; bPlace: string }; breaches: ExclusivityBreach[] }>();
  const pairKey = (x: string, y: string) => (x < y ? `${x}|${y}` : `${y}|${x}`);

  neighborMap(index, options.radiusKm).forEach((list, aId) => {
    for (const n of list) {
      if (aId > n.customerId) continue;
      pairs.set(pairKey(aId, n.customerId), { aId, bId: n.customerId, near: { distanceKm: n.distanceKm, town: n.town, aPlace: n.placeLabel, bPlace: n.otherPlaceLabel }, breaches: [] });
    }
  });

  for (const ex of activeExclusivities(index)) {
    for (const n of neighborMap(index, ex.radiusKm).get(ex.holderId) ?? []) {
      const breaches = breachesBy(index, agg, ex, n.customerId, options.ignored);
      if (breaches.length === 0) continue;
      const key = pairKey(ex.holderId, n.customerId);
      const pair = pairs.get(key) ?? {
        aId: ex.holderId, bId: n.customerId,
        near: { distanceKm: n.distanceKm, town: n.town, aPlace: n.placeLabel, bPlace: n.otherPlaceLabel },
        breaches: [],
      };
      pair.breaches.push(...breaches);
      pairs.set(key, pair);
    }
  }

  const result: TerritoryOverlap[] = [];
  pairs.forEach(pair => {
    const overlap = pairOverlap(index, agg, pair.aId, pair.bId, pair.near, options.ignored, pair.breaches);
    if (overlap) result.push(overlap);
  });
  return sortOverlaps(result);
}

/** Overlaps of one customer, oriented so that `aId` is that customer. */
export function overlapsForCustomer(index: AssortmentIndex, customerId: string, options: OverlapOptions): TerritoryOverlap[] {
  if (!isTerritoryCustomer(customerId)) return [];
  return findAllOverlaps(index, options)
    .filter(o => o.aId === customerId || o.bId === customerId)
    .map(o => (o.aId === customerId ? o : {
      ...o, aId: o.bId, bId: o.aId, aPlace: o.bPlace, bPlace: o.aPlace,
      sharedSkus: o.sharedSkus.map(s => ({ ...s, aQty: s.bQty, bQty: s.aQty, aLast: s.bLast, bLast: s.aLast })),
      sharedCollections: o.sharedCollections.map(c => ({ ...c, aQty: c.bQty, bQty: c.aQty })),
    }));
}

/** Customers involved in at least one overlap, with their worst severity. */
export function overlapSeverityByCustomer(overlaps: TerritoryOverlap[]): Map<string, OverlapSeverity> {
  const map = new Map<string, OverlapSeverity>();
  for (const o of overlaps) {
    for (const id of [o.aId, o.bId]) {
      const current = map.get(id);
      if (!current || severityRank(o.severity) < severityRank(current)) map.set(id, o.severity);
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Territory check for a set of SKUs (order builder)
// ---------------------------------------------------------------------------

export interface SkuTerritoryHit {
  sku: string;
  /** Neighbours that bought this SKU in the window. */
  neighbors: Array<{ customerId: string; name: string; distanceKm: number | null; qty: number; last: number }>;
  /** Exclusivities of other customers that cover this SKU here. */
  blockedBy: Array<{ customerId: string; name: string; scope: string; distanceKm: number | null }>;
}

export function checkSkusInTerritory(index: AssortmentIndex, customerId: string, skus: string[], options: OverlapOptions): SkuTerritoryHit[] {
  if (!isTerritoryCustomer(customerId) || !index.places.get(customerId)?.length) return [];
  const agg = getWindowAggregate(index, options.window);
  const neighbors = findNeighbors(index, customerId, options.radiusKm);
  const exclusivities = activeExclusivities(index).filter(ex => ex.holderId !== customerId);
  const unique = [...new Set(skus.map(s => s.trim()).filter(Boolean))];
  const hits: SkuTerritoryHit[] = [];
  for (const sku of unique) {
    const info = skuInfo(index, sku);
    if (!isTradeSku(info) || options.ignored?.has(ignoreSkuKey(sku))) continue;
    const hit: SkuTerritoryHit = { sku, neighbors: [], blockedBy: [] };
    for (const n of neighbors) {
      const s = agg.byCustomer.get(n.customerId)?.skus.get(sku);
      if (s) hit.neighbors.push({ customerId: n.customerId, name: customerName(index, n.customerId), distanceKm: n.distanceKm, qty: s.qty, last: s.last });
    }
    for (const ex of exclusivities) {
      const near = findNeighbors(index, ex.holderId, ex.radiusKm).find(n => n.customerId === customerId);
      if (!near) continue;
      const scope = exclusivityCovers(index, ex, sku, getWindowAggregate(index, 'all').byCustomer.get(ex.holderId)?.skus);
      if (scope) hit.blockedBy.push({ customerId: ex.holderId, name: customerName(index, ex.holderId), scope: scope === 'own' ? 'Κωδικοί του πελάτη' : scopeLabel(index, scope), distanceKm: near.distanceKm });
    }
    if (hit.neighbors.length || hit.blockedBy.length) hits.push(hit);
  }
  return hits.sort((x, y) => y.blockedBy.length - x.blockedBy.length || y.neighbors.length - x.neighbors.length);
}

// ---------------------------------------------------------------------------
// Suggestions: what to offer next, without stepping on a neighbour
// ---------------------------------------------------------------------------

export type TerritoryStatus = 'free' | 'nearby' | 'blocked';

export interface SkuSuggestion {
  sku: string;
  description: string | null;
  image: string | null;
  kindLabel: string;
  collectionNames: string[];
  /** Other wholesale customers that bought it in the window. */
  peerCount: number;
  peerQty: number;
  status: TerritoryStatus;
  nearbyNames: string[];
  blockedBy: string[];
}

export interface CollectionSuggestion {
  id: number;
  name: string;
  peerCount: number;
  peerQty: number;
  status: TerritoryStatus;
  nearbyNames: string[];
  blockedBy: string[];
}

export interface ReorderSuggestion {
  sku: string;
  description: string | null;
  image: string | null;
  orders: number;
  qty: number;
  cadenceDays: number;
  daysSince: number;
}

export interface CustomerSuggestions {
  skus: SkuSuggestion[];
  collections: CollectionSuggestion[];
  reorders: ReorderSuggestion[];
  /** Kinds the suggestions were limited to (the customer's own mix). */
  focusKinds: string[];
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function buildReorders(index: AssortmentIndex, customerId: string): ReorderSuggestion[] {
  const orderTimes = new Map<string, Set<number>>();
  const qty = new Map<string, number>();
  for (const line of index.lines.get(customerId) ?? []) {
    if (!isTradeSku(skuInfo(index, line.sku))) continue;
    let times = orderTimes.get(line.sku);
    if (!times) { times = new Set(); orderTimes.set(line.sku, times); }
    times.add(line.t);
    qty.set(line.sku, (qty.get(line.sku) ?? 0) + line.qty);
  }
  const result: Array<ReorderSuggestion & { score: number }> = [];
  orderTimes.forEach((times, sku) => {
    const sorted = [...times].sort((a, b) => a - b);
    if (sorted.length < 2) return;
    const gaps = sorted.slice(1).map((t, i) => (t - sorted[i]) / DAY_MS);
    const cadence = Math.max(30, Math.round(median(gaps)));
    const daysSince = Math.floor((index.now - sorted[sorted.length - 1]) / DAY_MS);
    if (daysSince < cadence * 1.25) return;
    const info = skuInfo(index, sku);
    result.push({ sku, description: info.description, image: info.image, orders: sorted.length, qty: qty.get(sku) ?? 0, cadenceDays: cadence, daysSince, score: daysSince / cadence });
  });
  return result.sort((a, b) => b.orders - a.orders || b.score - a.score).slice(0, 8).map(({ score: _s, ...row }) => row);
}

export function getCustomerSuggestions(index: AssortmentIndex, customerId: string, options: OverlapOptions & { limit?: number }): CustomerSuggestions {
  const limit = options.limit ?? 12;
  const agg = getWindowAggregate(index, options.window);
  const everBought = getWindowAggregate(index, 'all').byCustomer.get(customerId);
  const territory = isTerritoryCustomer(customerId);
  const neighbors = territory ? findNeighbors(index, customerId, options.radiusKm) : [];
  const neighborIds = new Set(neighbors.map(n => n.customerId));
  const exclusivities = territory
    ? activeExclusivities(index).filter(ex => ex.holderId !== customerId
      && findNeighbors(index, ex.holderId, ex.radiusKm).some(n => n.customerId === customerId))
    : [];

  // Focus on the kinds this shop already sells (≥ 5% of its pieces); new shops see everything.
  const kindTotal = everBought?.qty ?? 0;
  const focusKinds = everBought
    ? [...everBought.kinds.entries()].filter(([id, a]) => id !== SPECIAL_KIND.id && id !== UNMATCHED_KIND.id && a.qty / Math.max(1, kindTotal) >= 0.05).map(([id]) => id)
    : [];
  const focus = new Set(focusKinds);

  const statusFor = (members: Set<string> | undefined, covers: (ex: ActiveExclusivity) => boolean) => {
    const nearbyNames = [...(members ?? [])].filter(id => neighborIds.has(id)).map(id => customerName(index, id));
    const blockedBy = exclusivities.filter(covers).map(ex => customerName(index, ex.holderId));
    const status: TerritoryStatus = blockedBy.length ? 'blocked' : nearbyNames.length ? 'nearby' : 'free';
    return { status, nearbyNames, blockedBy };
  };

  const statusOrder = (s: TerritoryStatus) => (s === 'free' ? 0 : s === 'nearby' ? 1 : 2);

  const skus: SkuSuggestion[] = [];
  agg.skuCustomers.forEach((members, sku) => {
    if (everBought?.skus.has(sku)) return;
    const info = skuInfo(index, sku);
    if (!info.known || !isTradeSku(info)) return;
    if (focus.size && !focus.has(info.kindId)) return;
    const peers = [...members].filter(id => id !== customerId);
    if (peers.length < 2) return;
    let peerQty = 0;
    for (const id of peers) peerQty += agg.byCustomer.get(id)?.skus.get(sku)?.qty ?? 0;
    const holderSkus = (holderId: string) => getWindowAggregate(index, 'all').byCustomer.get(holderId)?.skus;
    skus.push({
      sku, description: info.description, image: info.image, kindLabel: info.kindLabel,
      collectionNames: info.collectionIds.map(id => collectionName(index, id)),
      peerCount: peers.length, peerQty,
      ...statusFor(members, ex => Boolean(exclusivityCovers(index, ex, sku, holderSkus(ex.holderId)))),
    });
  });
  skus.sort((a, b) => statusOrder(a.status) - statusOrder(b.status) || b.peerCount - a.peerCount || b.peerQty - a.peerQty);

  const collections: CollectionSuggestion[] = [];
  agg.collectionCustomers.forEach((members, id) => {
    if (everBought?.collections.has(id)) return;
    const peers = [...members].filter(m => m !== customerId);
    if (peers.length < 2) return;
    let peerQty = 0;
    for (const m of peers) peerQty += agg.byCustomer.get(m)?.collections.get(id)?.qty ?? 0;
    collections.push({
      id, name: collectionName(index, id), peerCount: peers.length, peerQty,
      ...statusFor(members, ex => ex.scopes.some(s => s.kind === 'collection' && Number(s.key) === id)),
    });
  });
  collections.sort((a, b) => statusOrder(a.status) - statusOrder(b.status) || b.peerCount - a.peerCount || b.peerQty - a.peerQty);

  return {
    skus: skus.slice(0, limit),
    collections: collections.slice(0, limit),
    reorders: buildReorders(index, customerId),
    focusKinds: focusKinds.map(jewelryKindLabel),
  };
}

// ---------------------------------------------------------------------------
// Directory filter: «ποιοι πελάτες έχουν πάρει…»
// ---------------------------------------------------------------------------

export type PurchaseFacet = 'kind' | 'collection' | 'category' | 'sku';

export interface PurchaseFilterItem {
  facet: PurchaseFacet;
  key: string;
}

export interface PurchaseFilter {
  items: PurchaseFilterItem[];
  /** bought: has bought; not_bought: never bought in the window (prospects). */
  mode: 'bought' | 'not_bought';
  /** any: at least one of the items; all: every item. */
  match: 'any' | 'all';
  window: AssortmentWindow;
}

export const EMPTY_PURCHASE_FILTER: PurchaseFilter = { items: [], mode: 'bought', match: 'any', window: 'all' };

export const FACET_META: Record<PurchaseFacet, { label: string; plural: string }> = {
  kind: { label: 'Είδος', plural: 'Είδη' },
  collection: { label: 'Συλλογή', plural: 'Συλλογές' },
  category: { label: 'Κατηγορία', plural: 'Κατηγορίες' },
  sku: { label: 'Κωδικός', plural: 'Κωδικοί' },
};

export interface PurchaseMatch {
  matched: boolean;
  /** Pieces of the selected items bought in the window. */
  qty: number;
  net: number;
  last: number | null;
}

function itemAgg(index: AssortmentIndex, row: CustomerWindowAgg | undefined, item: PurchaseFilterItem): PurchaseAgg | undefined {
  if (!row) return undefined;
  switch (item.facet) {
    case 'kind': return row.kinds.get(item.key);
    case 'collection': return row.collections.get(Number(item.key));
    case 'category': return row.categories.get(item.key);
    case 'sku': return row.skus.get(item.key);
    default: return undefined;
  }
}

export function evaluatePurchaseFilter(index: AssortmentIndex, filter: PurchaseFilter): Map<string, PurchaseMatch> {
  const agg = getWindowAggregate(index, filter.window);
  const result = new Map<string, PurchaseMatch>();
  index.customers.forEach((_c, id) => {
    const row = agg.byCustomer.get(id);
    const hits = filter.items.map(item => itemAgg(index, row, item));
    const has = filter.match === 'all' ? hits.every(Boolean) : hits.some(Boolean);
    let qty = 0;
    let net = 0;
    let last = -Infinity;
    for (const h of hits) {
      if (!h) continue;
      qty += h.qty;
      net += h.net;
      if (h.last > last) last = h.last;
    }
    // For «δεν έχουν πάρει», «all» means none of the items; «any» means missing at least one.
    const matched = filter.items.length === 0 ? true
      : filter.mode === 'bought' ? has
        : filter.match === 'all' ? hits.every(h => !h) : hits.some(h => !h);
    result.set(id, { matched, qty, net: Math.round(net * 100) / 100, last: Number.isFinite(last) ? last : null });
  });
  return result;
}

export interface FacetOption {
  facet: PurchaseFacet;
  key: string;
  label: string;
  /** Wholesale customers that bought it in the window. */
  customerCount: number;
  sub?: string | null;
  image?: string | null;
}

export function purchaseFacetOptions(index: AssortmentIndex, window: AssortmentWindow): Record<'kind' | 'collection' | 'category', FacetOption[]> {
  const agg = getWindowAggregate(index, window);
  const sortOpts = (list: FacetOption[]) => list.sort((a, b) => b.customerCount - a.customerCount || a.label.localeCompare(b.label, 'el'));
  const kinds = sortOpts([...agg.kindCustomers.entries()].map(([key, set]) => ({ facet: 'kind' as const, key, label: jewelryKindLabel(key), customerCount: set.size })));
  // Collections with no sales yet are still offered (for «δεν έχουν πάρει»).
  const collectionIds = new Set<number>([...index.collections.keys(), ...agg.collectionCustomers.keys()]);
  const collections = sortOpts([...collectionIds].map(id => ({ facet: 'collection' as const, key: String(id), label: collectionName(index, id), customerCount: agg.collectionCustomers.get(id)?.size ?? 0 })));
  const categories = sortOpts([...agg.categoryCustomers.entries()].map(([key, set]) => ({ facet: 'category' as const, key, label: key, customerCount: set.size })));
  return { kind: kinds, collection: collections, category: categories };
}

/** SKU search for the filter: catalogue + anything ever sold. */
export function searchSkuOptions(index: AssortmentIndex, query: string, window: AssortmentWindow, limit = 30): FacetOption[] {
  const q = placeKey(query);
  if (!q) return [];
  const agg = getWindowAggregate(index, window);
  const out: FacetOption[] = [];
  index.products.forEach(info => {
    if (info.isComponent) return;
    const hay = placeKey(`${info.sku} ${info.description ?? ''} ${info.category ?? ''}`);
    if (!hay.includes(q)) return;
    out.push({ facet: 'sku', key: info.sku, label: info.sku, sub: info.description ?? info.category, image: info.image, customerCount: agg.skuCustomers.get(info.sku)?.size ?? 0 });
  });
  const upper = query.trim().toUpperCase();
  return out
    .sort((a, b) => Number(b.key.toUpperCase().startsWith(upper)) - Number(a.key.toUpperCase().startsWith(upper)) || b.customerCount - a.customerCount || a.key.localeCompare(b.key))
    .slice(0, limit);
}

export function facetItemLabel(index: AssortmentIndex, item: PurchaseFilterItem): string {
  switch (item.facet) {
    case 'kind': return jewelryKindLabel(item.key);
    case 'collection': return collectionName(index, Number(item.key));
    default: return item.key;
  }
}
