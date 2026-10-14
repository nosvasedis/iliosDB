import type { Customer, CustomerBranch, Order } from '../../types';
import { OrderStatus } from '../../types';
import { normalizeGreekForSearch } from '../../utils/greekSearch';
import {
  ABROAD_PERIFERIA_ID,
  COUNTRY_ALIASES,
  COUNTRY_CENTERS,
  countryDisplayName,
  countryUnitId,
  GREEK_TOWNS,
  type GreekTown,
  type LatLng,
  lookupPostalArea,
  PERIFERIA_BY_ID,
  PERIFERIA_FALLBACK_CENTER,
  REGIONAL_UNIT_BY_ID,
  US_STATE_CENTERS,
  WORLD_CITIES,
  type WorldCity,
} from './greekRegions';

export type LocationPrecision = 'exact' | 'town' | 'area' | 'none';

export interface CustomerLocation {
  /** ISO-3166 alpha-2 (GR for domestic). */
  countryCode: string;
  postalCode: string | null;
  /** Display name of the town (gazetteer spelling when matched). */
  town: string | null;
  unitId: string | null;
  unitLabel: string | null;
  periferiaId: string | null;
  periferiaLabel: string | null;
  coords: LatLng | null;
  precision: LocationPrecision;
  /**
   * The record says Greece but the address clearly names another country
   * (e.g. "…, NJ 07676, Ηνωμένες Πολιτείες"). Location uses the detected country;
   * the UI should ask to fix the country field (it drives myDATA).
   */
  countryInferred?: boolean;
}

export type CustomerActivity = 'active' | 'quiet' | 'inactive' | 'none';

/** Calendar-year order turnover, net of VAT; cancelled orders are excluded. */
export const QUIET_THRESHOLD_EUR = 500;

export const ACTIVITY_META: Record<CustomerActivity, { label: string; plural: string; hint: string; color: string; dot: string; soft: string }> = {
  active: { label: 'Ενεργός', plural: 'Ενεργοί', hint: 'Αγορές από 500 € φέτος, χωρίς ΦΠΑ', color: '#059669', dot: 'bg-emerald-500', soft: 'bg-emerald-50 text-emerald-700 ring-emerald-100' },
  quiet: { label: 'Σε ύφεση', plural: 'Σε ύφεση', hint: 'Παραγγελία φέτος, με καθαρό τζίρο κάτω από 500 €', color: '#d97706', dot: 'bg-amber-500', soft: 'bg-amber-50 text-amber-700 ring-amber-100' },
  inactive: { label: 'Ανενεργός', plural: 'Ανενεργοί', hint: 'Καμία αγορά στο τρέχον ημερολογιακό έτος', color: '#e11d48', dot: 'bg-rose-500', soft: 'bg-rose-50 text-rose-700 ring-rose-100' },
  none: { label: 'Χωρίς παραγγελίες', plural: 'Χωρίς παραγγελίες', hint: 'Δεν έχει καταχωρηθεί μη ακυρωμένη παραγγελία', color: '#64748b', dot: 'bg-slate-400', soft: 'bg-slate-100 text-slate-600 ring-slate-200' },
};

export type CustomerTier = 'top' | 'key' | 'steady' | 'regular';
export const TIER_ORDER: CustomerTier[] = ['top', 'key', 'steady', 'regular'];
export const TIER_META: Record<CustomerTier, { label: string; plural: string; min: number; max: number | null; color: string; dot: string; soft: string }> = {
  top: { label: 'Κορυφαίος', plural: 'Κορυφαίοι', min: 10000, max: null, color: '#7c3aed', dot: 'bg-violet-600', soft: 'bg-violet-50 text-violet-800 ring-violet-200' },
  key: { label: 'Βασικός', plural: 'Βασικοί', min: 5000, max: 10000, color: '#047857', dot: 'bg-emerald-700', soft: 'bg-emerald-100 text-emerald-900 ring-emerald-200' },
  steady: { label: 'Σταθερός', plural: 'Σταθεροί', min: 2000, max: 5000, color: '#059669', dot: 'bg-emerald-500', soft: 'bg-emerald-50 text-emerald-800 ring-emerald-100' },
  regular: { label: 'Τακτικός', plural: 'Τακτικοί', min: QUIET_THRESHOLD_EUR, max: 2000, color: '#0d9488', dot: 'bg-teal-500', soft: 'bg-teal-50 text-teal-800 ring-teal-100' },
};

export function tierRangeLabel(tier: CustomerTier): string {
  const { min, max } = TIER_META[tier];
  const fmt = (value: number) => `${value.toLocaleString('el-GR')} €`;
  return max === null ? `Από ${fmt(min)}` : `${fmt(min)} έως < ${fmt(max)}`;
}

export interface CustomerClassification {
  activity: CustomerActivity;
  tier: CustomerTier | null;
}

export function classifyCustomer(yearNet: number, hasAnyOrder: boolean, hasYearOrder = yearNet > 0): CustomerClassification {
  if (!hasAnyOrder) return { activity: 'none', tier: null };
  if (!hasYearOrder) return { activity: 'inactive', tier: null };
  if (yearNet < QUIET_THRESHOLD_EUR) return { activity: 'quiet', tier: null };
  return { activity: 'active', tier: TIER_ORDER.find(tier => yearNet >= TIER_META[tier].min) ?? 'regular' };
}

export function nextCategoryGap(yearNet: number): { label: string; missing: number } | null {
  const next = [...TIER_ORDER].reverse().find(tier => TIER_META[tier].min > yearNet);
  return next ? { label: TIER_META[next].label, missing: Math.round((TIER_META[next].min - yearNet) * 100) / 100 } : null;
}

/** Order totals already include discounts and VAT. Keep money at cent precision. */
export function orderNetValue(order: Pick<Order, 'total_price' | 'vat_rate'>): number {
  const gross = Number(order.total_price);
  const vat = order.vat_rate ?? 0.24;
  if (!Number.isFinite(gross) || !Number.isFinite(vat) || vat < 0) return 0;
  return Math.round((gross / (1 + vat) + Number.EPSILON) * 100) / 100;
}

const revenueYearFormatter = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Athens', year: 'numeric' });

export interface CustomerOrderSummary extends CustomerClassification {
  orderCount: number;
  /** All-time net order value. */
  revenue: number;
  /** Current calendar-year net order value in the business timezone (Greece). */
  yearRevenue: number;
  yearOrderCount: number;
  lastOrderAt: string | null;
  daysSinceLastOrder: number | null;
}

/** Shared by directory, customer profiles and mobile. Ignores future/invalid dates. */
export function summarizeCustomerOrders(orders: Order[] | undefined, now = Date.now()): CustomerOrderSummary {
  const year = revenueYearFormatter.format(now);
  let orderCount = 0;
  let revenueCents = 0;
  let yearRevenueCents = 0;
  let yearOrderCount = 0;
  let lastOrderAt: string | null = null;
  let lastTime = -Infinity;
  for (const order of orders ?? []) {
    const time = new Date(order.created_at).getTime();
    if (order.status === OrderStatus.Cancelled || !Number.isFinite(time) || time > now) continue;
    const cents = Math.round(orderNetValue(order) * 100);
    orderCount += 1;
    revenueCents += cents;
    if (revenueYearFormatter.format(time) === year) {
      yearOrderCount += 1;
      yearRevenueCents += cents;
    }
    if (time > lastTime) { lastTime = time; lastOrderAt = order.created_at; }
  }
  const yearRevenue = yearRevenueCents / 100;
  return {
    orderCount, revenue: revenueCents / 100, yearRevenue, yearOrderCount, lastOrderAt,
    daysSinceLastOrder: lastOrderAt ? Math.floor((now - lastTime) / DAY_MS) : null,
    ...classifyCustomer(yearRevenue, orderCount > 0, yearOrderCount > 0),
  };
}

export const PRECISION_LABEL: Record<LocationPrecision, string> = {
  exact: 'Ακριβής θέση',
  town: 'Θέση πόλης',
  area: 'Κατά προσέγγιση',
  none: 'Χωρίς τοποθεσία',
};

const EMPTY_LOCATION: CustomerLocation = {
  countryCode: 'GR', postalCode: null, town: null, unitId: null, unitLabel: null,
  periferiaId: null, periferiaLabel: null, coords: null, precision: 'none',
};

/** ISO-3166 alpha-2, treating EL/GRC/empty as GR. */
export function normalizeCountry(country?: string | null): string {
  const value = String(country ?? '').trim().toUpperCase();
  if (!value || value === 'EL' || value === 'GRC') return 'GR';
  return value;
}

export const isDomesticCountry = (country?: string | null) => normalizeCountry(country) === 'GR';

/** Accent/case/final-sigma insensitive key with punctuation collapsed. */
export function placeKey(value: string): string {
  return normalizeGreekForSearch(value)
    .replace(/ς/g, 'σ')
    .replace(/[.,;:()\-–—/'"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const TOWN_INDEX: Map<string, GreekTown[]> = (() => {
  const index = new Map<string, GreekTown[]>();
  for (const t of GREEK_TOWNS) {
    for (const name of t.names) {
      const key = placeKey(name);
      const list = index.get(key) ?? [];
      if (!list.includes(t)) list.push(t);
      index.set(key, list);
    }
  }
  return index;
})();

const CITY_INDEX: Map<string, WorldCity[]> = (() => {
  const index = new Map<string, WorldCity[]>();
  for (const c of WORLD_CITIES) {
    for (const name of c.names) {
      const key = placeKey(name);
      index.set(key, [...(index.get(key) ?? []), c]);
    }
  }
  return index;
})();

/** Country names (Greek, English, common aliases) → ISO code. */
const COUNTRY_NAME_INDEX: Map<string, string> = (() => {
  const index = new Map<string, string>();
  const add = (name: string, code: string) => {
    const key = placeKey(name);
    if (key && !index.has(key)) index.set(key, code);
  };
  const codes = new Set(['GR', ...Object.keys(COUNTRY_CENTERS), ...Object.keys(COUNTRY_ALIASES)]);
  codes.forEach((code) => {
    for (const locale of ['el', 'en']) {
      try {
        const name = new Intl.DisplayNames([locale], { type: 'region' }).of(code);
        if (name && name !== code) add(name, code);
      } catch { /* Intl.DisplayNames unavailable */ }
    }
    (COUNTRY_ALIASES[code] ?? []).forEach(alias => add(alias, code));
  });
  ['Ελλάς', 'Hellas', 'Greece'].forEach(name => add(name, 'GR'));
  return index;
})();

const addressParts = (address?: string | null) =>
  String(address ?? '').split(/[,\n]/).map(p => p.trim()).filter(Boolean);

/** Country named as a whole part of the address ("…, 07676, Ηνωμένες Πολιτείες" → US). */
export function detectCountryInAddress(address?: string | null): string | null {
  const parts = addressParts(address);
  for (const part of parts.slice(-2).reverse()) {
    const code = COUNTRY_NAME_INDEX.get(placeKey(part.replace(/\d+/g, ' ')));
    if (code) return code;
  }
  return null;
}

const isCountryPart = (part: string) => COUNTRY_NAME_INDEX.has(placeKey(part.replace(/\d+/g, ' ')));

/** Extracts the postal code (last 5-digit group, also "123 45") and the place text that follows it. */
export function splitGreekAddress(address?: string | null): { postalCode: string | null; place: string | null } {
  const raw = String(address ?? '').replace(/\s+/g, ' ').trim();
  if (!raw) return { postalCode: null, place: null };
  const matches = [...raw.matchAll(/(?:^|[^\d])(\d{3}) ?(\d{2})(?!\d)/g)];
  const last = matches[matches.length - 1];
  if (last) {
    const after = raw.slice((last.index ?? 0) + last[0].length);
    const place = after.replace(/^[\s,\-–—.]+/, '').replace(/[\s,.]+$/, '').trim();
    return { postalCode: `${last[1]}${last[2]}`, place: place || null };
  }
  // No postal code: the last comma-separated part is the best guess for the place
  // ("Οδός 3, Ρόδος"), or the whole text when it is just a place name ("Σαντορίνη").
  const parts = raw.split(',').map(p => p.trim()).filter(Boolean);
  if (parts.length > 1) return { postalCode: null, place: parts[parts.length - 1] };
  return { postalCode: null, place: /\d|@/.test(raw) ? null : raw };
}

function townCandidates(place: string): GreekTown[] {
  const variants = [place, ...place.split(/[-–—/]/)].map(placeKey).filter(Boolean);
  for (const key of variants) {
    const exact = TOWN_INDEX.get(key);
    if (exact?.length) return exact;
  }
  // AADE truncates long place names ("ΛΙΜΕΝΑΣ ΧΕΡΣ"); accept a unique-enough prefix.
  for (const key of variants) {
    if (key.length < 5) continue;
    const found: GreekTown[] = [];
    TOWN_INDEX.forEach((towns, name) => {
      if (name.startsWith(key)) towns.forEach(t => { if (!found.includes(t)) found.push(t); });
    });
    if (found.length) return found;
  }
  return [];
}

function titleCase(value: string): string {
  return value
    .toLocaleLowerCase('el-GR')
    .replace(/(^|[\s\-–/])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toLocaleUpperCase('el-GR'));
}

function hashString(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic small offset so customers of the same town don't stack on one point. */
function spread(center: LatLng, seed: string, radius: number): LatLng {
  const h = hashString(seed);
  const angle = ((h & 0xffff) / 0xffff) * Math.PI * 2;
  const dist = (0.35 + ((h >>> 16) / 0xffff) * 0.65) * radius;
  return [center[0] + Math.sin(angle) * dist, center[1] + Math.cos(angle) * dist * 1.3];
}

export function hasSavedCoordinates(point: { latitude?: number | null; longitude?: number | null }): boolean {
  return typeof point.latitude === 'number' && typeof point.longitude === 'number'
    && Number.isFinite(point.latitude) && Number.isFinite(point.longitude);
}

/** Anything that has an address: the fiscal seat or a shop. */
export interface PlaceInput {
  /** Stable seed for the pin offset. */
  id: string;
  address?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

function resolveAbroadLocation(input: PlaceInput, countryCode: string, countryInferred = false): CustomerLocation {
  const unitInfo = REGIONAL_UNIT_BY_ID[countryUnitId(countryCode)];
  // Drop the country itself ("Ηνωμένες Πολιτείες", "USA") — it is not a place inside the country.
  const parts = addressParts(input.address).filter(part => !isCountryPart(part));

  // US: "Township of Washington, NJ 07676" / "… NJ" → state for an area pin, city before it.
  let usState: string | null = null;
  let usCity: string | null = null;
  if (countryCode === 'US') {
    for (let i = parts.length - 1; i >= 0 && !usState; i--) {
      const withoutZip = parts[i].replace(/\b\d{5}(?:-\d{4})?\b/g, ' ').replace(/^[\s\-–]+|[\s\-–]+$/g, '').replace(/\s+/g, ' ').trim();
      const m = withoutZip.match(/(?:^|\s)([A-Z]{2})$/);
      if (m && US_STATE_CENTERS[m[1]]) {
        usState = m[1];
        const before = withoutZip.slice(0, withoutZip.length - 2).trim();
        usCity = before || (i > 0 && !/^\d/.test(parts[i - 1]) ? parts[i - 1].replace(/^\d{5}\s*[-–]\s*/, '').trim() : null);
      }
    }
  }

  let matched: WorldCity | null = null;
  let rawPlace: string | null = null;
  for (const part of [...parts].reverse()) {
    const cleaned = part.replace(/\b[A-Z]{0,2}-?\d[\d\s-]*\b/g, ' ').replace(/^[\s\-–]+/, '').replace(/\s+/g, ' ').trim();
    if (!cleaned || (usState && cleaned === usState)) continue;
    rawPlace = rawPlace ?? cleaned;
    const key = placeKey(cleaned);
    // Exact names only: "Township of Washington, NJ" must not become Washington DC.
    const hit = (CITY_INDEX.get(key) ?? []).find(c => c.country === countryCode && (!usState || !c.state || c.state === usState));
    if (hit) { matched = hit; break; }
  }

  const townLabel = matched ? matched.names[0] : usCity ? `${usCity}, ${usState}` : rawPlace;
  const base: CustomerLocation = {
    countryCode,
    postalCode: null,
    town: townLabel,
    unitId: unitInfo?.id ?? countryUnitId(countryCode),
    unitLabel: unitInfo?.label ?? countryDisplayName(countryCode),
    periferiaId: ABROAD_PERIFERIA_ID,
    periferiaLabel: PERIFERIA_BY_ID[ABROAD_PERIFERIA_ID]?.label ?? 'Εξωτερικό',
    coords: null,
    precision: 'none',
    countryInferred,
  };
  if (hasSavedCoordinates(input)) return { ...base, coords: [input.latitude as number, input.longitude as number], precision: 'exact' };
  if (matched) return { ...base, coords: spread(matched.center, input.id, 0.01), precision: 'town' };
  if (usState) return { ...base, coords: spread(US_STATE_CENTERS[usState], input.id, 0.08), precision: 'area' };
  if (unitInfo) return { ...base, coords: spread(unitInfo.center, input.id, 0.05), precision: 'area' };
  return base;
}

/** Region + map position of any address (fiscal seat or shop). */
export function resolvePlaceLocation(input: PlaceInput): CustomerLocation {
  const explicit = normalizeCountry(input.country);
  if (explicit !== 'GR') return resolveAbroadLocation(input, explicit);
  // Country left at the default (Greece) but the address names another country.
  const detected = detectCountryInAddress(input.address);
  if (detected && detected !== 'GR') return resolveAbroadLocation(input, detected, true);
  const countryCode = explicit;

  const { postalCode, place } = splitGreekAddress(input.address);
  const postal = postalCode ? lookupPostalArea(postalCode) : null;

  let matchedTown: GreekTown | null = null;
  if (place) {
    const candidates = townCandidates(place);
    const samePeriferia = (t: GreekTown) => REGIONAL_UNIT_BY_ID[t.unitId]?.periferiaId === postal?.periferiaId;
    if (postal) {
      // Exact ΠΕ first; otherwise a town of the same area (islands sharing a postal prefix, e.g. Νίσυρος 853xx).
      matchedTown = (postal.unitId ? candidates.find(t => t.unitId === postal.unitId) : undefined)
        ?? candidates.find(samePeriferia)
        ?? null;
    } else {
      matchedTown = candidates[0] ?? null;
    }
  }

  const unitId = matchedTown?.unitId ?? postal?.unitId ?? null;
  const unitInfo = unitId ? REGIONAL_UNIT_BY_ID[unitId] : null;
  const periferiaId = unitInfo?.periferiaId ?? postal?.periferiaId ?? null;
  const town = matchedTown ? matchedTown.names[0] : place ? titleCase(place) : null;

  const base: CustomerLocation = {
    countryCode,
    postalCode,
    town,
    unitId,
    unitLabel: unitInfo?.label ?? null,
    periferiaId,
    periferiaLabel: periferiaId ? PERIFERIA_BY_ID[periferiaId]?.label ?? null : null,
    coords: null,
    precision: 'none',
  };

  if (hasSavedCoordinates(input)) {
    return { ...base, coords: [input.latitude as number, input.longitude as number], precision: 'exact' };
  }
  if (matchedTown) {
    return { ...base, coords: spread(matchedTown.center, input.id, 0.006), precision: 'town' };
  }
  const areaCenter = unitInfo?.center ?? (periferiaId ? PERIFERIA_FALLBACK_CENTER[periferiaId] : undefined);
  if (areaCenter) {
    return { ...base, coords: spread(areaCenter, input.id, 0.02), precision: 'area' };
  }
  return postalCode || town ? base : { ...EMPTY_LOCATION };
}

/** Location of the fiscal seat (φορολογική έδρα). */
export function resolveCustomerLocation(customer: Pick<Customer, 'id' | 'address' | 'latitude' | 'longitude' | 'country'>): CustomerLocation {
  return resolvePlaceLocation({
    id: customer.id,
    address: customer.address,
    country: customer.country,
    latitude: customer.latitude,
    longitude: customer.longitude,
  });
}

// ---------------------------------------------------------------------------
// Shops (υποκαταστήματα)
// ---------------------------------------------------------------------------

/** "Οδός 12, 84600 - Μύκονος" — the same shape AADE uses, so the resolver and legal parser understand it. */
export function composeBranchAddress(branch: Pick<CustomerBranch, 'street' | 'postal_code' | 'city'>): string {
  const street = String(branch.street ?? '').trim();
  const place = [String(branch.postal_code ?? '').trim(), String(branch.city ?? '').trim()].filter(Boolean).join(' - ');
  return [street, place].filter(Boolean).join(', ');
}

/** Valid shops, main one first. Tolerates legacy/null JSON. */
export function customerBranches(customer: Pick<Customer, 'branches'>): CustomerBranch[] {
  const list = Array.isArray(customer.branches) ? customer.branches.filter(b => b && typeof b === 'object' && b.id) : [];
  return [...list].sort((a, b) => Number(Boolean(b.is_primary)) - Number(Boolean(a.is_primary)));
}

export function primaryBranch(customer: Pick<Customer, 'branches'>): CustomerBranch | null {
  return customerBranches(customer)[0] ?? null;
}

export function resolveBranchLocation(customer: Pick<Customer, 'id' | 'country'>, branch: CustomerBranch): CustomerLocation {
  return resolvePlaceLocation({
    id: `${customer.id}:${branch.id}`,
    address: composeBranchAddress(branch),
    country: branch.country || customer.country,
    latitude: branch.latitude,
    longitude: branch.longitude,
  });
}

/** A point of presence of a customer: each shop, or the fiscal seat when no shops are registered. */
export interface CustomerPlace {
  key: string;
  kind: 'fiscal' | 'branch';
  branchId: string | null;
  label: string;
  address: string | null;
  location: CustomerLocation;
  isPrimary: boolean;
}

export function buildCustomerPlaces(customer: Customer): CustomerPlace[] {
  const branches = customerBranches(customer);
  if (branches.length > 0) {
    return branches.map((branch, index) => ({
      key: `b:${branch.id}`,
      kind: 'branch' as const,
      branchId: branch.id,
      label: branch.label?.trim() || `Κατάστημα ${index + 1}`,
      address: composeBranchAddress(branch) || null,
      location: resolveBranchLocation(customer, branch),
      isPrimary: index === 0,
    }));
  }
  return [{
    key: 'fiscal',
    kind: 'fiscal',
    branchId: null,
    label: 'Φορολογική έδρα',
    address: customer.address || null,
    location: resolveCustomerLocation(customer),
    isPrimary: true,
  }];
}

// ---------------------------------------------------------------------------
// Directory (per-customer stats + location) and region filtering
// ---------------------------------------------------------------------------

export interface CustomerDirectoryEntry extends CustomerOrderSummary {
  customer: Customer;
  /** Main location (main shop, else fiscal seat) — used for badges and sorting. */
  location: CustomerLocation;
  /** Fiscal seat location (for documents / reference). */
  fiscalLocation: CustomerLocation;
  /** Map points: every shop, or the fiscal seat when there are no shops. */
  places: CustomerPlace[];
  /** Locations considered by the Περιοχή filter (never empty). */
  regionLocations: CustomerLocation[];
  isSystem: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function buildCustomerDirectory(
  customers: Customer[],
  orders: Order[] | undefined,
  options: { systemCustomerId?: string; now?: number } = {},
): CustomerDirectoryEntry[] {
  const now = options.now ?? Date.now();
  const ordersByCustomer = new Map<string, Order[]>();
  for (const order of orders ?? []) {
    if (!order.customer_id) continue;
    const list = ordersByCustomer.get(order.customer_id) ?? [];
    list.push(order);
    ordersByCustomer.set(order.customer_id, list);
  }

  return customers.map((customer) => {
    const isSystem = customer.id === options.systemCustomerId;
    const summary = summarizeCustomerOrders(ordersByCustomer.get(customer.id), now);

    const fiscalLocation = isSystem ? { ...EMPTY_LOCATION } : resolveCustomerLocation(customer);
    const places = isSystem ? [] : buildCustomerPlaces(customer);
    const placed = places.map(p => p.location).filter(l => l.periferiaId);
    // Shops without a recognisable address fall back to the fiscal seat for the region filter.
    const regionLocations = placed.length > 0 ? placed : [fiscalLocation];
    const location = places.find(p => p.location.periferiaId)?.location ?? places[0]?.location ?? fiscalLocation;

    return {
      customer,
      location: location.periferiaId ? location : (fiscalLocation.periferiaId ? fiscalLocation : location),
      fiscalLocation,
      places,
      regionLocations,
      ...summary,
      isSystem,
    };
  });
}

/** Region filter keys: `p:<periferiaId>`, `u:<unitId>` or `none` (no detectable region). */
export type RegionFilterKey = string;
export const NO_REGION_KEY = 'none';

export function matchesRegionFilter(location: CustomerLocation, selection: RegionFilterKey[]): boolean {
  if (selection.length === 0) return true;
  return selection.some((key) => {
    if (key === NO_REGION_KEY) return !location.periferiaId;
    if (key.startsWith('p:')) return location.periferiaId === key.slice(2);
    if (key.startsWith('u:')) return location.unitId === key.slice(2);
    return false;
  });
}

/** A customer matches when any of its shops (or its fiscal seat) is in the selected areas. */
export function matchesEntryRegion(entry: Pick<CustomerDirectoryEntry, 'regionLocations'>, selection: RegionFilterKey[]): boolean {
  if (selection.length === 0) return true;
  return entry.regionLocations.some(location => matchesRegionFilter(location, selection));
}

export interface RegionCounts {
  periferia: Record<string, number>;
  units: Record<string, number>;
  none: number;
}

/** Customers per area (a customer with shops in two areas counts in both). */
export function countRegions(entries: CustomerDirectoryEntry[]): RegionCounts {
  const counts: RegionCounts = { periferia: {}, units: {}, none: 0 };
  for (const entry of entries) {
    if (entry.isSystem) continue;
    const periferies = new Set<string>();
    const units = new Set<string>();
    entry.regionLocations.forEach(l => {
      if (l.periferiaId) periferies.add(l.periferiaId);
      if (l.unitId) units.add(l.unitId);
    });
    if (periferies.size === 0) { counts.none += 1; continue; }
    periferies.forEach(id => { counts.periferia[id] = (counts.periferia[id] ?? 0) + 1; });
    units.forEach(id => { counts.units[id] = (counts.units[id] ?? 0) + 1; });
  }
  return counts;
}

export function regionFilterLabel(key: RegionFilterKey): string {
  if (key === NO_REGION_KEY) return 'Χωρίς περιοχή';
  if (key.startsWith('p:')) return PERIFERIA_BY_ID[key.slice(2)]?.label ?? key;
  if (key.startsWith('u:')) return REGIONAL_UNIT_BY_ID[key.slice(2)]?.label ?? key;
  return key;
}

export function formatDaysAgo(days: number | null): string {
  if (days === null) return '—';
  if (days === 0) return 'Σήμερα';
  if (days === 1) return 'Χθες';
  if (days < 30) return `πριν ${days} ημ.`;
  if (days < 365) {
    const months = Math.round(days / 30);
    return `πριν ${months} ${months === 1 ? 'μήνα' : 'μήνες'}`;
  }
  const years = Math.floor(days / 365);
  return `πριν ${years} ${years === 1 ? 'χρόνο' : 'χρόνια'}`;
}

/** Customer search across identity, contact and location fields. */
export function matchesCustomerSearch(entry: CustomerDirectoryEntry, term: string): boolean {
  const q = placeKey(term);
  if (!q) return true;
  const { customer: c } = entry;
  const locations = [entry.fiscalLocation, ...entry.places.map(p => p.location)];
  const haystack = [
    c.full_name, c.profession, c.address, c.email, c.tax_office,
    ...entry.places.flatMap(p => [p.label, p.address]),
    ...locations.flatMap(l => [l.town, l.unitLabel, l.periferiaLabel]),
  ].filter(Boolean).map(v => placeKey(String(v))).join(' | ');
  if (haystack.includes(q)) return true;
  const digits = term.replace(/\s+/g, '');
  return Boolean(digits) && [c.phone, c.customer_code, c.vat_number, ...customerBranches(c).map(b => b.phone), ...locations.map(l => l.postalCode)]
    .some(v => v && String(v).replace(/\s+/g, '').includes(digits));
}

export function customerInitials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = words[0][0] ?? '';
  const second = words.length > 1 ? words[1][0] : words[0][1] ?? '';
  return (first + second).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleUpperCase('el-GR');
}

const AVATAR_GRADIENTS = [
  ['#0ea5e9', '#6366f1'], ['#10b981', '#0d9488'], ['#f59e0b', '#ef4444'], ['#8b5cf6', '#d946ef'],
  ['#14b8a6', '#3b82f6'], ['#f43f5e', '#f97316'], ['#64748b', '#0f172a'], ['#84cc16', '#16a34a'],
] as const;

export function customerAvatarGradient(seed: string): string {
  const [a, b] = AVATAR_GRADIENTS[hashString(seed) % AVATAR_GRADIENTS.length];
  return `linear-gradient(135deg, ${a}, ${b})`;
}

export type CustomerSortKey = 'name' | 'recent' | 'revenue' | 'orders' | 'region';
export type SortDirection = 'asc' | 'desc';

export const CUSTOMER_SORT_OPTIONS: Array<{ key: CustomerSortKey; label: string; defaultDir: SortDirection }> = [
  { key: 'name', label: 'Αλφαβητικά', defaultDir: 'asc' },
  { key: 'recent', label: 'Πρόσφατη παραγγελία', defaultDir: 'desc' },
  { key: 'revenue', label: 'Τζίρος φέτος', defaultDir: 'desc' },
  { key: 'orders', label: 'Παραγγελίες', defaultDir: 'desc' },
  { key: 'region', label: 'Περιοχή', defaultDir: 'asc' },
];

const byName = (a: CustomerDirectoryEntry, b: CustomerDirectoryEntry) =>
  a.customer.full_name.localeCompare(b.customer.full_name, 'el', { sensitivity: 'base' });

/** Stable sort; entries without a value (no orders / no region) always go last. */
export function sortCustomerDirectory(entries: CustomerDirectoryEntry[], key: CustomerSortKey, dir: SortDirection): CustomerDirectoryEntry[] {
  const sign = dir === 'asc' ? 1 : -1;
  const value = (e: CustomerDirectoryEntry): number | string | null => {
    switch (key) {
      case 'recent': return e.lastOrderAt ? new Date(e.lastOrderAt).getTime() : null;
      case 'revenue': return e.orderCount ? e.yearRevenue : null;
      case 'orders': return e.orderCount || null;
      case 'region': return e.location.periferiaLabel
        ? `${e.location.periferiaLabel}|${e.location.unitLabel ?? ''}|${e.location.town ?? ''}` : null;
      default: return null;
    }
  };
  return [...entries].sort((a, b) => {
    if (key === 'name') return sign * byName(a, b);
    const va = value(a);
    const vb = value(b);
    if (va === null && vb === null) return byName(a, b);
    if (va === null) return 1;
    if (vb === null) return -1;
    const cmp = typeof va === 'string' ? va.localeCompare(vb as string, 'el', { sensitivity: 'base' }) : (va as number) - (vb as number);
    return cmp !== 0 ? sign * cmp : byName(a, b);
  });
}

/**
 * Splits a non-Greek address into shop fields:
 * "280 Main St #1, Springfield, NJ 07676, USA" → street / city "Springfield, NJ" / postal "07676".
 */
export function splitForeignAddress(address?: string | null): { street: string; postal_code: string; city: string } {
  const parts = addressParts(address).filter(part => !isCountryPart(part));
  const street = parts[0] ?? '';
  const rest = parts.slice(1).join(', ');
  const zip = rest.match(/\b[A-Z]{0,2}-?\d{4,6}(?:-\d{4})?\b/);
  const city = (zip ? rest.replace(zip[0], ' ') : rest).replace(/\s+,/g, ',').replace(/\s+/g, ' ').replace(/^[\s,\-–]+|[\s,\-–]+$/g, '');
  return { street, postal_code: zip ? zip[0] : '', city };
}
