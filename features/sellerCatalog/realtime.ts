export const SELLER_CATALOG_REALTIME_TABLES = [
  'products',
  'product_variants',
  'product_collections',
  'collections',
  'inventory_balances',
] as const;

export interface SellerCatalogRealtimePayload {
  table?: string;
  eventType?: string;
  new?: Record<string, unknown>;
  old?: Record<string, unknown>;
}

export type SellerCatalogRealtimeResolution =
  | { type: 'ignore' }
  | { type: 'full' }
  | { type: 'skus'; skus: string[] };

const CENTRAL_WAREHOUSE_ID = '00000000-0000-0000-0000-000000000001';

const stringsFromRows = (payload: SellerCatalogRealtimePayload, field: string): string[] => {
  const values = [payload.new?.[field], payload.old?.[field]];
  return [...new Set(values.filter((value): value is string => typeof value === 'string' && value.length > 0))];
};

export function resolveSellerCatalogRealtimePayload(
  payload: SellerCatalogRealtimePayload,
): SellerCatalogRealtimeResolution {
  switch (payload.table) {
    case 'collections':
      return { type: 'full' };
    case 'products': {
      const skus = stringsFromRows(payload, 'sku');
      return skus.length > 0 ? { type: 'skus', skus } : { type: 'full' };
    }
    case 'product_variants':
    case 'product_collections': {
      const skus = stringsFromRows(payload, 'product_sku');
      return skus.length > 0 ? { type: 'skus', skus } : { type: 'full' };
    }
    case 'inventory_balances': {
      const warehouseIds = stringsFromRows(payload, 'warehouse_id');
      if (warehouseIds.length === 0) return { type: 'full' };
      if (!warehouseIds.includes(CENTRAL_WAREHOUSE_ID)) return { type: 'ignore' };
      const skus = stringsFromRows(payload, 'product_sku');
      return skus.length > 0 ? { type: 'skus', skus } : { type: 'full' };
    }
    default:
      return { type: 'ignore' };
  }
}

export function createSellerCatalogRealtimeScheduler(
  refresh: (skus?: readonly string[]) => Promise<unknown> | unknown,
  delayMs = 500,
) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let requiresFullRefresh = false;
  const pendingSkus = new Set<string>();

  const flush = async () => {
    timer = null;
    const fullRefresh = requiresFullRefresh || pendingSkus.size > 50;
    const skus = [...pendingSkus];
    requiresFullRefresh = false;
    pendingSkus.clear();
    await refresh(fullRefresh ? undefined : skus);
  };

  return {
    schedule(payload: SellerCatalogRealtimePayload) {
      const resolution = resolveSellerCatalogRealtimePayload(payload);
      if (resolution.type === 'ignore') return;
      if (resolution.type === 'full') requiresFullRefresh = true;
      if (resolution.type === 'skus') resolution.skus.forEach((sku) => pendingSkus.add(sku));
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void flush(); }, delayMs);
    },
    flush,
    dispose() {
      if (timer) clearTimeout(timer);
      timer = null;
      requiresFullRefresh = false;
      pendingSkus.clear();
    },
  };
}
