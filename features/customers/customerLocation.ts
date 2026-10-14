import type { Customer, Order } from '../../types';
import { OrderStatus } from '../../types';
import { normalizeGreekForSearch } from '../../utils/greekSearch';
import {
  GREEK_TOWNS,
  type GreekTown,
  type LatLng,
  lookupPostalArea,
  PERIFERIA_BY_ID,
  PERIFERIA_FALLBACK_CENTER,
  REGIONAL_UNIT_BY_ID,
} from './greekRegions';

export type LocationPrecision = 'exact' | 'town' | 'area' | 'none';

export interface CustomerLocation {
  postalCode: string | null;
  /** Display name of the town (gazetteer spelling when matched). */
  town: string | null;
  unitId: string | null;
  unitLabel: string | null;
  periferiaId: string | null;
  periferiaLabel: string | null;
  coords: LatLng | null;
  precision: LocationPrecision;
}

export type CustomerActivity = 'active' | 'quiet' | 'inactive' | 'none';

export const ACTIVITY_META: Record<CustomerActivity, { label: string; hint: string; color: string; dot: string; soft: string }> = {
  active: { label: 'Ενεργός', hint: 'Παραγγελία τις τελευταίες 90 ημέρες', color: '#059669', dot: 'bg-emerald-500', soft: 'bg-emerald-50 text-emerald-700 ring-emerald-100' },
  quiet: { label: 'Σε ύφεση', hint: 'Τελευταία παραγγελία 3–12 μήνες πριν', color: '#d97706', dot: 'bg-amber-500', soft: 'bg-amber-50 text-amber-700 ring-amber-100' },
  inactive: { label: 'Ανενεργός', hint: 'Καμία παραγγελία πάνω από έναν χρόνο', color: '#e11d48', dot: 'bg-rose-500', soft: 'bg-rose-50 text-rose-700 ring-rose-100' },
  none: { label: 'Χωρίς παραγγελίες', hint: 'Δεν έχει καταχωρηθεί παραγγελία', color: '#64748b', dot: 'bg-slate-400', soft: 'bg-slate-100 text-slate-600 ring-slate-200' },
};

export const PRECISION_LABEL: Record<LocationPrecision, string> = {
  exact: 'Ακριβής θέση',
  town: 'Θέση πόλης',
  area: 'Κατά προσέγγιση (ΤΚ)',
  none: 'Χωρίς τοποθεσία',
};

const EMPTY_LOCATION: CustomerLocation = {
  postalCode: null, town: null, unitId: null, unitLabel: null,
  periferiaId: null, periferiaLabel: null, coords: null, precision: 'none',
};

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
  // No postal code: the last comma-separated part is the best guess for the place.
  const parts = raw.split(',').map(p => p.trim()).filter(Boolean);
  return { postalCode: null, place: parts.length > 1 ? parts[parts.length - 1] : null };
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

export function hasSavedCoordinates(customer: Pick<Customer, 'latitude' | 'longitude'>): boolean {
  return typeof customer.latitude === 'number' && typeof customer.longitude === 'number'
    && Number.isFinite(customer.latitude) && Number.isFinite(customer.longitude);
}

export function resolveCustomerLocation(customer: Pick<Customer, 'id' | 'address' | 'latitude' | 'longitude'>): CustomerLocation {
  const { postalCode, place } = splitGreekAddress(customer.address);
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
    postalCode,
    town,
    unitId,
    unitLabel: unitInfo?.label ?? null,
    periferiaId,
    periferiaLabel: periferiaId ? PERIFERIA_BY_ID[periferiaId]?.label ?? null : null,
    coords: null,
    precision: 'none',
  };

  if (hasSavedCoordinates(customer)) {
    return { ...base, coords: [customer.latitude as number, customer.longitude as number], precision: 'exact' };
  }
  if (matchedTown) {
    return { ...base, coords: spread(matchedTown.center, customer.id, 0.006), precision: 'town' };
  }
  const areaCenter = unitInfo?.center ?? (periferiaId ? PERIFERIA_FALLBACK_CENTER[periferiaId] : undefined);
  if (areaCenter) {
    return { ...base, coords: spread(areaCenter, customer.id, 0.02), precision: 'area' };
  }
  return postalCode || town ? base : { ...EMPTY_LOCATION };
}

// ---------------------------------------------------------------------------
// Directory (per-customer stats + location) and region filtering
// ---------------------------------------------------------------------------

export interface CustomerDirectoryEntry {
  customer: Customer;
  location: CustomerLocation;
  orderCount: number;
  revenue: number;
  lastOrderAt: string | null;
  daysSinceLastOrder: number | null;
  activity: CustomerActivity;
  isSystem: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function activityFromDays(days: number | null): CustomerActivity {
  if (days === null) return 'none';
  if (days <= 90) return 'active';
  if (days <= 365) return 'quiet';
  return 'inactive';
}

export function buildCustomerDirectory(
  customers: Customer[],
  orders: Order[] | undefined,
  options: { systemCustomerId?: string; now?: number } = {},
): CustomerDirectoryEntry[] {
  const now = options.now ?? Date.now();
  const stats = new Map<string, { count: number; revenue: number; last: string | null }>();
  for (const order of orders ?? []) {
    if (!order.customer_id || order.status === OrderStatus.Cancelled) continue;
    const s = stats.get(order.customer_id) ?? { count: 0, revenue: 0, last: null };
    s.count += 1;
    s.revenue += Number(order.total_price) || 0;
    if (!s.last || new Date(order.created_at).getTime() > new Date(s.last).getTime()) s.last = order.created_at;
    stats.set(order.customer_id, s);
  }

  return customers.map((customer) => {
    const isSystem = customer.id === options.systemCustomerId;
    const s = stats.get(customer.id);
    const lastOrderAt = s?.last ?? null;
    const lastTime = lastOrderAt ? new Date(lastOrderAt).getTime() : NaN;
    const daysSinceLastOrder = Number.isFinite(lastTime) ? Math.max(0, Math.floor((now - lastTime) / DAY_MS)) : null;
    return {
      customer,
      location: isSystem ? { ...EMPTY_LOCATION } : resolveCustomerLocation(customer),
      orderCount: s?.count ?? 0,
      revenue: s?.revenue ?? 0,
      lastOrderAt,
      daysSinceLastOrder,
      activity: activityFromDays(daysSinceLastOrder),
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

export interface RegionCounts {
  periferia: Record<string, number>;
  units: Record<string, number>;
  none: number;
}

export function countRegions(entries: CustomerDirectoryEntry[]): RegionCounts {
  const counts: RegionCounts = { periferia: {}, units: {}, none: 0 };
  for (const entry of entries) {
    if (entry.isSystem) continue;
    const { periferiaId, unitId } = entry.location;
    if (!periferiaId) { counts.none += 1; continue; }
    counts.periferia[periferiaId] = (counts.periferia[periferiaId] ?? 0) + 1;
    if (unitId) counts.units[unitId] = (counts.units[unitId] ?? 0) + 1;
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
  const { customer: c, location: l } = entry;
  const haystack = [
    c.full_name, c.profession, c.address, c.email, c.tax_office,
    l.town, l.unitLabel, l.periferiaLabel,
  ].filter(Boolean).map(v => placeKey(String(v))).join(' | ');
  if (haystack.includes(q)) return true;
  const digits = term.replace(/\s+/g, '');
  return Boolean(digits) && [c.phone, c.customer_code, c.vat_number, l.postalCode]
    .some(v => v && String(v).replace(/\s+/g, '').includes(digits));
}

export function customerInitials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = words[0][0] ?? '';
  const second = words.length > 1 ? words[1][0] : words[0][1] ?? '';
  return (first + second).normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleUpperCase('el-GR');
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
  { key: 'revenue', label: 'Τζίρος', defaultDir: 'desc' },
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
      case 'revenue': return e.orderCount ? e.revenue : null;
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
