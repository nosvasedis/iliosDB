export const ERP_CATALOG_REALTIME_TABLES = [
  'products',
  'product_variants',
  'product_collections',
  'product_molds',
  'recipes',
  'collections',
  'stock_movements',
] as const;

export interface ErpCatalogRealtimePayload {
  table?: string;
  eventType?: string;
  new?: Record<string, unknown>;
  old?: Record<string, unknown>;
}

export type ErpCatalogRealtimeResolution =
  | { type: 'ignore' }
  | { type: 'full' }
  | { type: 'skus'; skus: string[] };

const stringsFromRows = (payload: ErpCatalogRealtimePayload, field: string): string[] => {
  const values = [payload.new?.[field], payload.old?.[field]];
  return [...new Set(values.filter((value): value is string => typeof value === 'string' && value.length > 0))];
};

export function resolveErpProductRealtimePayload(
  payload: ErpCatalogRealtimePayload,
): ErpCatalogRealtimeResolution {
  switch (payload.table) {
    case 'collections':
    case 'stock_movements':
      return { type: 'full' };
    case 'products': {
      const skus = stringsFromRows(payload, 'sku');
      return skus.length > 0 ? { type: 'skus', skus } : { type: 'full' };
    }
    case 'product_variants':
    case 'product_collections':
    case 'product_molds': {
      const skus = stringsFromRows(payload, 'product_sku');
      return skus.length > 0 ? { type: 'skus', skus } : { type: 'full' };
    }
    case 'recipes': {
      const skus = stringsFromRows(payload, 'parent_sku');
      return skus.length > 0 ? { type: 'skus', skus } : { type: 'full' };
    }
    default:
      return { type: 'ignore' };
  }
}

export function createErpCatalogRealtimeScheduler(
  refresh: (skus?: readonly string[]) => Promise<unknown> | unknown,
  delayMs = 500,
  burstLimit = 50,
) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let requiresFullRefresh = false;
  const pendingSkus = new Set<string>();

  const flush = async () => {
    timer = null;
    const fullRefresh = requiresFullRefresh || pendingSkus.size > burstLimit;
    const skus = [...pendingSkus];
    requiresFullRefresh = false;
    pendingSkus.clear();
    await refresh(fullRefresh ? undefined : skus);
  };

  return {
    schedule(payload: ErpCatalogRealtimePayload) {
      const resolution = resolveErpProductRealtimePayload(payload);
      if (resolution.type === 'ignore') return;
      if (resolution.type === 'full') requiresFullRefresh = true;
      if (resolution.type === 'skus') resolution.skus.forEach((sku) => pendingSkus.add(sku));
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void flush(); }, delayMs);
    },
    dispose() {
      if (timer) clearTimeout(timer);
      timer = null;
      requiresFullRefresh = false;
      pendingSkus.clear();
    },
  };
}
