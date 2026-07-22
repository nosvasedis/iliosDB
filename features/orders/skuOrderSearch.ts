import { Order, OrderItem, OrderShipment, OrderShipmentItem, OrderStatus, Product, ProductionBatch, ProductionStage } from '../../types';
import { getVariantComponents } from '../../utils/pricingEngine';
import { getProductionStageLabel, PRODUCTION_STAGE_ORDER_INDEX } from '../../utils/productionStages';
import { getOrderDisplayName } from '../../utils/deliveryLabels';
import { buildFullSku, itemMatchesSkuQuery } from '../../utils/skuSearchMatch';
import {
  getItemFulfillmentKind,
  getItemShipmentAllocations,
  getShippedQuantitiesForOrderLines,
  itemKey,
  type ItemFulfillmentKind,
  type ItemShipmentAllocation,
} from '../../utils/shipmentUtils';
import { variantRankingKey } from '../../utils/financeLineSku';

export type SkuOrderSearchFilterSelection = {
  customers: Set<string>;
  tags: Set<string>;
  sellers: Set<string>;
  statuses: Set<OrderStatus>;
  finishes: Set<string>;
  stones: Set<string>;
};

export type SkuOrderSearchMatchedItem = {
  item: OrderItem;
  totalQty: number;
  fullSku: string;
  analyticsKey: string;
  finishCode: string;
  finishName: string;
  stoneCode: string;
  stoneName: string;
  shippedQty: number;
  inProductionQty: number;
  remainingQty: number;
  fulfillmentKind: ItemFulfillmentKind;
  shipmentAllocations: ItemShipmentAllocation[];
  productionStages: SkuOrderSearchProductionStageSummary[];
  showProductionStageChips: boolean;
};

export type SkuOrderSearchProductionStageSummary = {
  key: string;
  label: string;
  qty: number;
  order: number;
  stage: ProductionStage;
  pendingDispatch?: boolean;
};

export type SkuOrderSearchMatchedOrder = {
  order: Order;
  matchedItems: SkuOrderSearchMatchedItem[];
  totalMatchedQty: number;
  uniqueVariantCount: number;
};

export type SkuOrderSearchFacetItem = {
  key: string;
  label: string;
  count: number;
  colorCode?: string;
};

export type SkuOrderSearchFacets = {
  customers: SkuOrderSearchFacetItem[];
  tags: SkuOrderSearchFacetItem[];
  sellers: SkuOrderSearchFacetItem[];
  statuses: SkuOrderSearchFacetItem[];
  finishes: SkuOrderSearchFacetItem[];
  stones: SkuOrderSearchFacetItem[];
};

export type SkuOrderSearchDataOptions = {
  shipments?: OrderShipment[];
  shipmentItems?: OrderShipmentItem[];
  batches?: ProductionBatch[];
};

export function createEmptySkuOrderSearchFilters(): SkuOrderSearchFilterSelection {
  return {
    customers: new Set(),
    tags: new Set(),
    sellers: new Set(),
    statuses: new Set(),
    finishes: new Set(),
    stones: new Set(),
  };
}

export function countActiveSkuOrderSearchFilters(filters: SkuOrderSearchFilterSelection): number {
  return (
    filters.customers.size
    + filters.tags.size
    + filters.sellers.size
    + filters.statuses.size
    + filters.finishes.size
    + filters.stones.size
  );
}

function customerKey(order: Order): string {
  const displayName = getOrderDisplayName(order);
  if (displayName !== order.customer_name) return `${order.customer_id || order.customer_name}::${displayName}`;
  return order.customer_id || order.customer_name;
}

function sellerKey(order: Order): string | null {
  return order.seller_id || order.seller_name || null;
}

function getOrderShipmentItems(
  order: Order,
  options: SkuOrderSearchDataOptions,
): { shipments: OrderShipment[]; shipmentItems: OrderShipmentItem[] } {
  const shipments = (options.shipments || []).filter((shipment) => shipment.order_id === order.id);
  const shipmentIds = new Set(shipments.map((shipment) => shipment.id));
  const shipmentItems = (options.shipmentItems || []).filter((item) => shipmentIds.has(item.shipment_id));
  return { shipments, shipmentItems };
}

function lineIdentityKey(item: Pick<OrderItem, 'sku' | 'variant_suffix' | 'size_info' | 'cord_color' | 'enamel_color' | 'line_id'>): string {
  return itemKey(item.sku, item.variant_suffix, item.size_info, item.cord_color, item.enamel_color, item.line_id);
}

function getLineBatches(order: Order, item: OrderItem, batches: ProductionBatch[] | undefined): ProductionBatch[] {
  const exactKey = lineIdentityKey(item);
  const looseKey = lineIdentityKey({ ...item, line_id: undefined });
  return (batches || [])
    .filter((batch) => batch.order_id === order.id)
    .filter((batch) => {
      const batchKey = itemKey(batch.sku, batch.variant_suffix, batch.size_info, batch.cord_color, batch.enamel_color, batch.line_id);
      if (batchKey === exactKey) return true;
      if (!item.line_id) return false;
      const looseBatchKey = itemKey(batch.sku, batch.variant_suffix, batch.size_info, batch.cord_color, batch.enamel_color, undefined);
      return looseBatchKey === looseKey;
    });
}

function getProductionStageSummaryMeta(batch: ProductionBatch): Omit<SkuOrderSearchProductionStageSummary, 'qty'> {
  if (batch.current_stage === ProductionStage.Polishing) {
    if (batch.pending_dispatch) {
      return {
        key: 'polishing_pending_dispatch',
        label: 'Τεχν. · Αναμονή',
        order: (PRODUCTION_STAGE_ORDER_INDEX[ProductionStage.Polishing] ?? 999) - 0.1,
        stage: batch.current_stage,
        pendingDispatch: true,
      };
    }
    return {
      key: 'polishing_dispatched',
      label: 'Τεχν. · Στον τεχν.',
      order: (PRODUCTION_STAGE_ORDER_INDEX[ProductionStage.Polishing] ?? 999) + 0.1,
      stage: batch.current_stage,
      pendingDispatch: false,
    };
  }

  return {
    key: String(batch.current_stage),
    label: getProductionStageLabel(batch.current_stage),
    order: PRODUCTION_STAGE_ORDER_INDEX[batch.current_stage] ?? 999,
    stage: batch.current_stage,
  };
}

function getLineProductionStages(order: Order, item: OrderItem, batches: ProductionBatch[] | undefined): SkuOrderSearchProductionStageSummary[] {
  const stageCounts = new Map<string, SkuOrderSearchProductionStageSummary>();

  getLineBatches(order, item, batches).forEach((batch) => {
    const meta = getProductionStageSummaryMeta(batch);
    const existing = stageCounts.get(meta.key);
    if (existing) {
      existing.qty += batch.quantity || 0;
    } else {
      stageCounts.set(meta.key, { ...meta, qty: batch.quantity || 0 });
    }
  });

  return Array.from(stageCounts.values()).sort((a, b) => a.order - b.order);
}

function getMatchedItem(
  order: Order,
  item: OrderItem,
  product: Product | undefined,
  shippedByLine: Map<string, number>,
  orderShipments: OrderShipment[],
  orderShipmentItems: OrderShipmentItem[],
  options: SkuOrderSearchDataOptions,
): SkuOrderSearchMatchedItem {
  const suffix = (item.variant_suffix || '').trim().toUpperCase();
  const { finish, stone } = getVariantComponents(suffix, product?.gender);
  const key = lineIdentityKey(item);
  const legacyDeliveredQty = order.status === OrderStatus.Delivered && orderShipments.length === 0 ? item.quantity : 0;
  const shippedQty = Math.max(shippedByLine.get(key) || 0, legacyDeliveredQty);
  const productionStages = getLineProductionStages(order, item, options.batches);
  const inProductionQty = productionStages.reduce((sum, stage) => sum + stage.qty, 0);
  const remainingQty = Math.max(0, item.quantity - shippedQty - inProductionQty);
  const fulfillmentKind = getItemFulfillmentKind({ quantity: item.quantity, shippedQty, remainingQty });
  return {
    item,
    totalQty: item.quantity,
    fullSku: buildFullSku(item.sku, suffix),
    analyticsKey: variantRankingKey(item.sku, suffix, item.notes),
    finishCode: finish.code,
    finishName: finish.name,
    stoneCode: stone.code,
    stoneName: stone.name,
    shippedQty,
    inProductionQty,
    remainingQty,
    fulfillmentKind,
    shipmentAllocations: getItemShipmentAllocations(key, orderShipments, orderShipmentItems),
    productionStages,
    showProductionStageChips: productionStages.length > 0 && fulfillmentKind !== 'in_production',
  };
}

function itemPassesFilters(match: SkuOrderSearchMatchedItem, filters: SkuOrderSearchFilterSelection): boolean {
  if (filters.finishes.size > 0 && !filters.finishes.has(match.finishCode)) return false;
  if (filters.stones.size > 0 && !filters.stones.has(match.stoneCode)) return false;
  return true;
}

function orderPassesFilters(order: Order, filters: SkuOrderSearchFilterSelection): boolean {
  if (filters.customers.size > 0 && !filters.customers.has(customerKey(order))) return false;

  if (filters.tags.size > 0) {
    const tags = order.tags || [];
    if (!tags.some((tag) => filters.tags.has(tag))) return false;
  }

  if (filters.sellers.size > 0) {
    const key = sellerKey(order);
    if (!key || !filters.sellers.has(key)) return false;
  }

  if (filters.statuses.size > 0 && !filters.statuses.has(order.status)) return false;

  return true;
}

export function buildSkuOrderSearchResults(
  orders: Order[],
  products: Product[],
  query: string,
  filters: SkuOrderSearchFilterSelection = createEmptySkuOrderSearchFilters(),
  options: SkuOrderSearchDataOptions = {},
): SkuOrderSearchMatchedOrder[] {
  const q = query.trim();
  if (q.length < 2) return [];

  const productsBySku = new Map(products.map((product) => [product.sku, product]));
  const matched: SkuOrderSearchMatchedOrder[] = [];

  for (const order of orders) {
    if (!orderPassesFilters(order, filters)) continue;
    const { shipments, shipmentItems } = getOrderShipmentItems(order, options);
    const shippedByLine = getShippedQuantitiesForOrderLines(order.items || [], shipmentItems);

    const matchedItems = order.items
      .filter((item) => itemMatchesSkuQuery(item, q))
      .map((item) => getMatchedItem(order, item, productsBySku.get(item.sku), shippedByLine, shipments, shipmentItems, options))
      .filter((item) => itemPassesFilters(item, filters));

    if (matchedItems.length === 0) continue;

    matched.push({
      order,
      matchedItems,
      totalMatchedQty: matchedItems.reduce((sum, match) => sum + match.totalQty, 0),
      uniqueVariantCount: new Set(matchedItems.map((match) => match.analyticsKey)).size,
    });
  }

  return matched.sort(
    (a, b) => new Date(b.order.created_at).getTime() - new Date(a.order.created_at).getTime(),
  );
}

function incrementFacet(map: Map<string, SkuOrderSearchFacetItem>, key: string, label: string, colorCode?: string) {
  const existing = map.get(key);
  if (existing) {
    existing.count += 1;
    return;
  }
  map.set(key, { key, label, count: 1, colorCode });
}

function sortedFacets(map: Map<string, SkuOrderSearchFacetItem>): SkuOrderSearchFacetItem[] {
  return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, 'el'));
}

export function buildSkuOrderSearchFacets(results: SkuOrderSearchMatchedOrder[]): SkuOrderSearchFacets {
  const customers = new Map<string, SkuOrderSearchFacetItem>();
  const tags = new Map<string, SkuOrderSearchFacetItem>();
  const sellers = new Map<string, SkuOrderSearchFacetItem>();
  const statuses = new Map<string, SkuOrderSearchFacetItem>();
  const finishes = new Map<string, SkuOrderSearchFacetItem>();
  const stones = new Map<string, SkuOrderSearchFacetItem>();

  results.forEach(({ order, matchedItems }) => {
    incrementFacet(customers, customerKey(order), getOrderDisplayName(order));
    (order.tags || []).forEach((tag) => incrementFacet(tags, tag, tag));

    const seller = sellerKey(order);
    if (seller) incrementFacet(sellers, seller, order.seller_name || seller);

    incrementFacet(statuses, order.status, order.status);

    matchedItems.forEach((match) => {
      incrementFacet(finishes, match.finishCode, match.finishName, match.finishCode);
      if (match.stoneCode) {
        incrementFacet(stones, match.stoneCode, match.stoneName || match.stoneCode, match.stoneCode);
      }
    });
  });

  return {
    customers: sortedFacets(customers),
    tags: sortedFacets(tags),
    sellers: sortedFacets(sellers),
    statuses: sortedFacets(statuses),
    finishes: sortedFacets(finishes),
    stones: sortedFacets(stones),
  };
}
