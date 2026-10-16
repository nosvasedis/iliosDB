import { useCallback, useMemo, useSyncExternalStore } from 'react';
import type { Customer, Order } from '../../types';
import { useCustomers, useOrdersWithItems } from '../../hooks/api/useOrders';
import { useProducts } from '../../hooks/api/useProducts';
import { useCollections } from '../../hooks/api/useCollections';
import {
  getAssortmentIndex,
  RADIUS_OPTIONS,
  WINDOW_OPTIONS,
  type AssortmentIndex,
  type AssortmentWindow,
} from '../../features/customers/customerAssortment';

// ---------------------------------------------------------------------------
// Territory preferences (radius / window / muted items), shared by every view in this browser.
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'ilios.customerTerritory.v1';

export interface TerritoryPrefs {
  radiusKm: number;
  window: AssortmentWindow;
  ignored: string[];
}

const DEFAULT_PREFS: TerritoryPrefs = { radiusKm: 2, window: '12m', ignored: [] };

function readStored(): TerritoryPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<TerritoryPrefs>;
    return {
      radiusKm: RADIUS_OPTIONS.includes(parsed.radiusKm as typeof RADIUS_OPTIONS[number]) ? parsed.radiusKm as number : DEFAULT_PREFS.radiusKm,
      window: WINDOW_OPTIONS.some(o => o.id === parsed.window) ? parsed.window as AssortmentWindow : DEFAULT_PREFS.window,
      ignored: Array.isArray(parsed.ignored) ? parsed.ignored.filter((v): v is string => typeof v === 'string') : [],
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

let current: TerritoryPrefs | null = null;
const listeners = new Set<() => void>();

function getSnapshot(): TerritoryPrefs {
  if (!current) current = typeof window === 'undefined' ? DEFAULT_PREFS : readStored();
  return current;
}

function setPrefs(patch: Partial<TerritoryPrefs>) {
  current = { ...getSnapshot(), ...patch };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(current)); } catch { /* storage unavailable */ }
  listeners.forEach(fn => fn());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function useTerritoryPrefs() {
  const prefs = useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT_PREFS);
  const ignoredSet = useMemo(() => new Set(prefs.ignored), [prefs.ignored]);
  const setRadius = useCallback((radiusKm: number) => setPrefs({ radiusKm }), []);
  const setWindow = useCallback((window: AssortmentWindow) => setPrefs({ window }), []);
  const toggleIgnored = useCallback((key: string) => {
    const list = getSnapshot().ignored;
    setPrefs({ ignored: list.includes(key) ? list.filter(k => k !== key) : [...list, key] });
  }, []);
  const clearIgnored = useCallback(() => setPrefs({ ignored: [] }), []);
  return { ...prefs, ignoredSet, setRadius, setWindow, toggleIgnored, clearIgnored };
}

// ---------------------------------------------------------------------------
// Assortment index
// ---------------------------------------------------------------------------

/**
 * The shared «Γκάμα & Περιοχή» index. Pass the lists you already have; missing ones are loaded
 * (from the React Query cache when warm). Returns null while data is loading.
 */
export function useAssortmentIndex(options: { customers?: Customer[]; orders?: Order[]; enabled?: boolean } = {}): AssortmentIndex | null {
  const enabled = options.enabled ?? true;
  const customersQuery = useCustomers();
  const ordersQuery = useOrdersWithItems({ enabled: enabled && !options.orders });
  const productsQuery = useProducts({ enabled });
  const collectionsQuery = useCollections({ enabled });

  const customers = options.customers ?? customersQuery.data;
  const orders = options.orders ?? ordersQuery.data;
  const products = productsQuery.data;
  // Collections only add names; don't block on them.
  const collections = collectionsQuery.data;

  return useMemo(() => {
    if (!enabled || !customers || !orders || !products) return null;
    return getAssortmentIndex({ customers, orders, products, collections });
  }, [enabled, customers, orders, products, collections]);
}
