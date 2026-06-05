import { RETAIL_CUSTOMER_ID, RETAIL_CUSTOMER_NAME } from '../../lib/supabase';
import { requiresAssemblyStage, requiresSettingStage } from '../../constants';
import {
  AssemblyPrintRow,
  BatchStageHistoryEntry,
  EnhancedProductionBatch,
  Material,
  MaterialType,
  Order,
  OrderStatus,
  Product,
  ProductionBatch,
  ProductionStage,
} from '../../types';
import { extractRetailClientFromNotes } from '../../utils/retailNotes';
import { getVariantComponents } from '../../utils/pricingEngine';
import { getProductionTimingInfo } from '../../utils/productionTiming';
import { getSpecialCreationProductStub, isSpecialCreationSku } from '../../utils/specialCreationSku';
import { getBatchStageChronologyTimestamp } from './selectors';

const ZIRCON_CODES = ['LE', 'PR', 'AK', 'MP', 'KO', 'MV', 'RZ'];
const NON_ZIRCON_STONE_CODES = ['TKO', 'TPR', 'TMP'];

export type ProductionTimingSnapshot = Pick<
  EnhancedProductionBatch,
  'diffHours' | 'isDelayed' | 'stageEnteredAt' | 'timeInStageHours' | 'timingStatus' | 'timingLabel' | 'reminderKey'
>;

export type ProductionQuickPickViewEntry = {
  order: Order;
  batchesCount: number;
  totalQty: number;
  readyQty: number;
  inProgressQty: number;
  latestUpdate: number;
  stageBreakdown: Record<string, number>;
  onHoldByStage: Record<string, number>;
};

export type ProductionAssemblyOrderCandidate = {
  order: Order;
  rows: AssemblyPrintRow[];
  assemblySkuCount: number;
  totalAssemblyQty: number;
  stageBreakdown: Partial<Record<ProductionStage, number>>;
  polishingPendingQty: number;
  polishingActiveQty: number;
};

function getDisplayCustomerName(order: Order | undefined): string {
  if (!order) return '';
  const isRetailOrder = order.customer_id === RETAIL_CUSTOMER_ID || order.customer_name === RETAIL_CUSTOMER_NAME;
  const { retailClientLabel } = extractRetailClientFromNotes(order.notes);
  return isRetailOrder && retailClientLabel
    ? `${RETAIL_CUSTOMER_NAME} • ${retailClientLabel}`
    : (order.customer_name || '');
}

export function enrichProductionBatchesForBoard(
  batches: ProductionBatch[] | undefined | null,
  productsMap: Map<string, Product>,
  materialsMap: Map<string, Material>,
  ordersMap: Map<string, Order>,
): EnhancedProductionBatch[] {
  return (batches || []).map((batch) => {
    const product = isSpecialCreationSku(batch.sku) ? getSpecialCreationProductStub() : productsMap.get(batch.sku);
    const suffix = batch.variant_suffix || '';
    const stone = getVariantComponents(suffix, product?.gender).stone;
    const hasZirconsFromSuffix =
      !!stone?.code && ZIRCON_CODES.includes(stone.code) && !NON_ZIRCON_STONE_CODES.includes(stone.code);
    const hasZirconsFromRecipe = !!product?.recipe?.some((recipeItem) => {
      if (recipeItem.type !== 'raw') return false;
      const material = materialsMap.get(recipeItem.id);
      return material?.type === MaterialType.Stone && ZIRCON_CODES.some((code) => material.name.includes(code));
    });
    const order = batch.order_id ? ordersMap.get(batch.order_id) : undefined;
    const orderItems = Array.isArray(order?.items) ? order.items : [];
    const matchingOrderItem = orderItems.find((item) => {
      if (item.sku !== batch.sku) return false;
      if ((item.variant_suffix || '') !== (batch.variant_suffix || '')) return false;
      if (batch.line_id && item.line_id) return item.line_id === batch.line_id;
      return true;
    });

    return {
      ...batch,
      product_details: product,
      product_image: product?.image_url ?? null,
      requires_setting: hasZirconsFromSuffix || hasZirconsFromRecipe || requiresSettingStage(batch.sku),
      requires_assembly: isSpecialCreationSku(batch.sku) ? false : requiresAssemblyStage(batch.sku),
      customer_name: getDisplayCustomerName(order),
      overridden_price:
        matchingOrderItem && (matchingOrderItem.price_override === true || isSpecialCreationSku(batch.sku))
          ? matchingOrderItem.price_at_order
          : undefined,
    };
  }) as EnhancedProductionBatch[];
}

export function buildProductionTimingSnapshots(
  batches: EnhancedProductionBatch[],
  batchHistoryLookup: Map<string, BatchStageHistoryEntry[]>,
  now: number,
): Map<string, ProductionTimingSnapshot> {
  const timingByBatchId = new Map<string, ProductionTimingSnapshot>();
  batches.forEach((batch) => {
    const timingInfo = getProductionTimingInfo(batch, batchHistoryLookup.get(batch.id), now);
    timingByBatchId.set(batch.id, {
      diffHours: timingInfo.timeInStageHours,
      isDelayed: timingInfo.isDelayed,
      stageEnteredAt: timingInfo.stageEnteredAt,
      timeInStageHours: timingInfo.timeInStageHours,
      timingStatus: timingInfo.timingStatus,
      timingLabel: timingInfo.timingLabel,
      reminderKey: timingInfo.reminderKey,
    });
  });
  return timingByBatchId;
}

export function withProductionTiming<T extends EnhancedProductionBatch>(
  batch: T,
  timingByBatchId: Map<string, ProductionTimingSnapshot>,
): T {
  const timing = timingByBatchId.get(batch.id);
  return timing ? ({ ...batch, ...timing } as T) : batch;
}

export function buildTimedProductionBatches(
  batches: EnhancedProductionBatch[],
  timingByBatchId: Map<string, ProductionTimingSnapshot>,
): EnhancedProductionBatch[] {
  return batches.map((batch) => withProductionTiming(batch, timingByBatchId));
}

export function buildBatchesByOrderId(
  batches: EnhancedProductionBatch[],
): Map<string, EnhancedProductionBatch[]> {
  const map = new Map<string, EnhancedProductionBatch[]>();
  batches.forEach((batch) => {
    if (!batch.order_id) return;
    const existing = map.get(batch.order_id);
    if (existing) existing.push(batch);
    else map.set(batch.order_id, [batch]);
  });
  return map;
}

export function buildProductionHealthSummary(
  batches: EnhancedProductionBatch[],
  timingByBatchId: Map<string, ProductionTimingSnapshot>,
) {
  let delayed = 0;
  let ready = 0;
  let onHold = 0;
  batches.forEach((batch) => {
    if (batch.current_stage === ProductionStage.Ready) ready += 1;
    if (batch.on_hold) onHold += 1;
    if (timingByBatchId.get(batch.id)?.isDelayed && !batch.on_hold) delayed += 1;
  });
  const total = batches.length;
  const inProgress = total - ready - onHold;
  const healthScore = (inProgress + ready) > 0 ? Math.max(0, 100 - (delayed / (inProgress || 1)) * 100) : 100;
  return { healthScore, delayed, ready, onHold, inProgress };
}

export function buildActiveProductionNotes(
  orders: Order[] | undefined | null,
  batchesByOrderId: Map<string, EnhancedProductionBatch[]>,
) {
  return (orders || [])
    .filter((order) =>
      order.status === OrderStatus.InProduction &&
      !!order.notes &&
      order.notes.trim().length > 0 &&
      batchesByOrderId.has(order.id),
    )
    .map((order) => ({
      id: order.id,
      customer: order.customer_name,
      note: order.notes || '',
    }));
}

export function buildProductionQuickPickEntries(
  orders: Order[] | undefined | null,
  batchesByOrderId: Map<string, EnhancedProductionBatch[]>,
): ProductionQuickPickViewEntry[] {
  if (!orders || orders.length === 0 || batchesByOrderId.size === 0) return [];
  const orderMap = new Map(orders.map((order) => [order.id, order]));

  return Array.from(batchesByOrderId.entries())
    .map(([orderId, orderBatches]) => {
      const order = orderMap.get(orderId);
      if (!order) return null;

      let totalQty = 0;
      let readyQty = 0;
      let latestUpdate = 0;
      const stageBreakdown: Record<string, number> = {};
      const onHoldByStage: Record<string, number> = {};

      orderBatches.forEach((batch) => {
        totalQty += batch.quantity;
        if (batch.current_stage === ProductionStage.Ready) readyQty += batch.quantity;
        latestUpdate = Math.max(latestUpdate, getBatchStageChronologyTimestamp(batch));
        stageBreakdown[batch.current_stage] = (stageBreakdown[batch.current_stage] || 0) + batch.quantity;
        if (batch.on_hold) {
          onHoldByStage[batch.current_stage] = (onHoldByStage[batch.current_stage] || 0) + batch.quantity;
        }
      });

      return {
        order,
        batchesCount: orderBatches.length,
        totalQty,
        readyQty,
        inProgressQty: Math.max(0, totalQty - readyQty),
        latestUpdate,
        stageBreakdown,
        onHoldByStage,
      };
    })
    .filter((entry): entry is ProductionQuickPickViewEntry => entry !== null)
    .sort((a, b) => b.latestUpdate - a.latestUpdate);
}

export function buildProductionAssemblyCandidates(
  orders: Order[] | undefined | null,
  batches: EnhancedProductionBatch[],
  batchesByOrderId: Map<string, EnhancedProductionBatch[]>,
): ProductionAssemblyOrderCandidate[] {
  if (!orders || orders.length === 0) return [];

  const readyQtyByKey = new Map<string, number>();
  batches.forEach((batch) => {
    if (!batch.order_id || batch.current_stage !== ProductionStage.Ready) return;
    const key = [batch.order_id, batch.sku, batch.variant_suffix || '', batch.size_info || ''].join('::');
    readyQtyByKey.set(key, (readyQtyByKey.get(key) || 0) + (batch.quantity || 0));
  });

  return orders
    .filter((order) =>
      !order.is_archived &&
      order.status !== OrderStatus.Delivered &&
      order.status !== OrderStatus.Cancelled &&
      (Array.isArray(order.items) ? order.items : []).some((item) => requiresAssemblyStage(item.sku) && !isSpecialCreationSku(item.sku)),
    )
    .map((order) => {
      const qtyByKey = new Map<string, number>();
      const notesByKey = new Map<string, Set<string>>();
      const displayCustomerName = getDisplayCustomerName(order);

      const orderItems = Array.isArray(order.items) ? order.items : [];
      orderItems.forEach((item) => {
        if (!requiresAssemblyStage(item.sku) || isSpecialCreationSku(item.sku)) return;
        const key = [order.id, item.sku, item.variant_suffix || '', item.size_info || ''].join('::');
        qtyByKey.set(key, (qtyByKey.get(key) || 0) + (item.quantity || 0));
        if (item.notes && item.notes.trim()) {
          if (!notesByKey.has(key)) notesByKey.set(key, new Set());
          notesByKey.get(key)!.add(item.notes.trim());
        }
      });

      const rows = Array.from(qtyByKey.entries())
        .map(([key, orderedQty], idx) => {
          const [orderId, sku, variantSuffix, sizeInfo] = key.split('::');
          const remainingQty = Math.max(0, orderedQty - (readyQtyByKey.get(key) || 0));
          if (remainingQty <= 0) return null;
          const notes = Array.from(notesByKey.get(key) || []).filter(Boolean).join(' • ');
          return {
            id: `assembly-order-${order.id}-${idx}`,
            order_id: orderId,
            customer_name: displayCustomerName,
            sku,
            variant_suffix: variantSuffix || undefined,
            size_info: sizeInfo || undefined,
            quantity: remainingQty,
            notes: notes || undefined,
          } as AssemblyPrintRow;
        })
        .filter((row): row is AssemblyPrintRow => row !== null)
        .sort((a, b) => {
          const bySku = `${a.sku}${a.variant_suffix || ''}`.toUpperCase()
            .localeCompare(`${b.sku}${b.variant_suffix || ''}`.toUpperCase(), undefined, { numeric: true });
          return bySku !== 0 ? bySku : (a.size_info || '').localeCompare(b.size_info || '');
        });

      const orderBatches = (batchesByOrderId.get(order.id) || []).filter(
        (batch) => requiresAssemblyStage(batch.sku) && !isSpecialCreationSku(batch.sku),
      );
      const stageBreakdown: Partial<Record<ProductionStage, number>> = {};
      let polishingPendingQty = 0;
      let polishingActiveQty = 0;
      orderBatches.forEach((batch) => {
        const qty = batch.quantity || 0;
        stageBreakdown[batch.current_stage] = (stageBreakdown[batch.current_stage] || 0) + qty;
        if (batch.current_stage === ProductionStage.Polishing) {
          if (batch.pending_dispatch) polishingPendingQty += qty;
          else polishingActiveQty += qty;
        }
      });

      return {
        order,
        rows,
        assemblySkuCount: rows.length,
        totalAssemblyQty: rows.reduce((sum, row) => sum + row.quantity, 0),
        stageBreakdown,
        polishingPendingQty,
        polishingActiveQty,
      };
    })
    .filter((candidate) => candidate.rows.length > 0)
    .sort((a, b) => new Date(b.order.created_at).getTime() - new Date(a.order.created_at).getTime());
}
