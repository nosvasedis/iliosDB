import { Order, OrderStatus, ProductionBatch, ProductionStage, ShipmentReadinessSummary } from '../types';
import { buildItemIdentityKey } from './itemIdentity';
import { PRODUCTION_STAGE_ORDER_INDEX } from './productionStages';

/** Orders still tied to production pipeline (incl. after a partial shipment). */
export function orderStatusShowsProductionProgress(status: OrderStatus): boolean {
  return status === OrderStatus.InProduction || status === OrderStatus.PartiallyDelivered;
}

export function getOrderBatches(orderId: string, batches: ProductionBatch[] | undefined | null): ProductionBatch[] {
  if (!batches) return [];
  return batches.filter((batch) => batch.order_id === orderId);
}

/** Group batches by their created_at timestamp (minute precision) to represent shipments/parts. */
export function groupBatchesByShipment(batches: ProductionBatch[]): [string, ProductionBatch[]][] {
  const groups: Record<string, ProductionBatch[]> = {};
  batches.forEach((b) => {
    const timeKey = new Date(b.created_at).toISOString().slice(0, 16);
    if (!groups[timeKey]) groups[timeKey] = [];
    groups[timeKey].push(b);
  });
  return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
}

/** True when every ordered piece is represented by a batch and every batch is Ready. */
export function isOrderReady(order: Order, batches: ProductionBatch[] | undefined | null): boolean {
  const orderBatches = getOrderBatches(order.id, batches);
  if (orderBatches.length === 0) return false;
  if (!orderBatches.every((batch) => batch.current_stage === ProductionStage.Ready)) return false;
  const itemsTotal = order.items.reduce((s, i) => s + (i.quantity || 0), 0);
  if (itemsTotal <= 0) return false;
  const batchTotal = orderBatches.reduce((s, b) => s + (b.quantity || 0), 0);
  return batchTotal === itemsTotal;
}

export type OrderListProgressSegment = {
  qty: number;
  pct: number;
  className: string;
  label: string;
};

export type OrderProductionStageBreakdownEntry =
  | {
      kind: 'stage';
      stage: ProductionStage;
      quantity: number;
      /** For Polishing stage only: distinguishes "Αναμονή αποστολής" (true) from "Στον Τεχνίτη" (false/undefined). */
      pendingDispatch?: boolean;
    }
  | {
      kind: 'unbatched';
      quantity: number;
    };

export type OrderProductionStageProgressSegment =
  | {
      kind: 'stage';
      stage: ProductionStage;
      quantity: number;
      pct: number;
    }
  | {
      kind: 'unbatched';
      quantity: number;
      pct: number;
    };

function sumOrderItemsQty(order: Order): number {
  return order.items.reduce((s, i) => s + (i.quantity || 0), 0);
}

function getMatchingOrderItemBatches(
  item: Pick<Order['items'][number], 'sku' | 'variant_suffix' | 'size_info' | 'cord_color' | 'enamel_color' | 'line_id'>,
  batches: ProductionBatch[] | undefined | null
): ProductionBatch[] {
  if (!batches) return [];

  const exactKey = buildItemIdentityKey(item);
  const exactMatches = batches.filter((batch) => buildItemIdentityKey(batch) === exactKey);
  if (exactMatches.length > 0 || !item.line_id) return exactMatches;

  const looseKey = buildItemIdentityKey({ ...item, line_id: null });
  return batches.filter((batch) => buildItemIdentityKey({ ...batch, line_id: null }) === looseKey);
}

/** Distribute integer percentages from quantities so they sum to 100. */
function qtysToSegmentPcts(qtys: number[], total: number): number[] {
  if (total <= 0) return qtys.map(() => 0);
  const raw = qtys.map((q) => (100 * q) / total);
  const floors = raw.map((r) => Math.floor(r));
  let sum = floors.reduce((a, b) => a + b, 0);
  const rem = 100 - sum;
  const frac = raw.map((r, i) => ({ i, f: r - floors[i] }));
  frac.sort((a, b) => b.f - a.f);
  const out = [...floors];
  for (let k = 0; k < rem; k++) out[frac[k % frac.length].i] += 1;
  return out;
}

export function getOrderItemProductionStageBreakdown(
  item: Pick<Order['items'][number], 'sku' | 'variant_suffix' | 'size_info' | 'cord_color' | 'enamel_color' | 'line_id' | 'quantity'>,
  batches: ProductionBatch[] | undefined | null
): OrderProductionStageBreakdownEntry[] {
  const matchingBatches = getMatchingOrderItemBatches(item, batches);
  // Use a compound key so Polishing pending vs dispatched are tracked separately.
  const stageCounts = new Map<string, { stage: ProductionStage; quantity: number; pendingDispatch?: boolean }>();
  let matchedQty = 0;

  for (const batch of matchingBatches) {
    const qty = batch.quantity || 0;
    matchedQty += qty;
    const isPendingDispatch = batch.current_stage === ProductionStage.Polishing ? !!batch.pending_dispatch : undefined;
    const key = batch.current_stage + (isPendingDispatch !== undefined ? `:${isPendingDispatch ? '1' : '0'}` : '');
    const existing = stageCounts.get(key);
    if (existing) {
      existing.quantity += qty;
    } else {
      stageCounts.set(key, { stage: batch.current_stage, quantity: qty, pendingDispatch: isPendingDispatch });
    }
  }

  const entries: OrderProductionStageBreakdownEntry[] = Array.from(stageCounts.values())
    .sort((a, b) => {
      const stageOrder = (PRODUCTION_STAGE_ORDER_INDEX[a.stage] ?? 99) - (PRODUCTION_STAGE_ORDER_INDEX[b.stage] ?? 99);
      if (stageOrder !== 0) return stageOrder;
      // Within Polishing: pending (awaiting dispatch) comes before dispatched
      if (a.pendingDispatch !== undefined && b.pendingDispatch !== undefined) {
        return (b.pendingDispatch ? 1 : 0) - (a.pendingDispatch ? 1 : 0);
      }
      return 0;
    })
    .map(({ stage, quantity, pendingDispatch }) => ({
      kind: 'stage' as const,
      stage,
      quantity,
      ...(pendingDispatch !== undefined ? { pendingDispatch } : {}),
    }));

  const unbatchedQty = Math.max(0, (item.quantity || 0) - matchedQty);
  if (unbatchedQty > 0) {
    entries.push({
      kind: 'unbatched',
      quantity: unbatchedQty,
    });
  }

  return entries;
}

export function buildOrderProductionStageSegments(
  order: Order,
  batches: ProductionBatch[] | undefined | null
): { segments: OrderProductionStageProgressSegment[]; totalQty: number; assignedQty: number } | null {
  const totalQty = sumOrderItemsQty(order);
  if (totalQty <= 0) return null;

  const orderBatches = getOrderBatches(order.id, batches);
  const stageCounts = new Map<ProductionStage, number>();
  let assignedQty = 0;

  for (const batch of orderBatches) {
    const qty = batch.quantity || 0;
    assignedQty += qty;
    stageCounts.set(batch.current_stage, (stageCounts.get(batch.current_stage) || 0) + qty);
  }

  const sortedStageEntries = Array.from(stageCounts.entries())
    .sort((a, b) => (PRODUCTION_STAGE_ORDER_INDEX[a[0]] ?? 99) - (PRODUCTION_STAGE_ORDER_INDEX[b[0]] ?? 99))
    .filter(([, quantity]) => quantity > 0);

  const unbatchedQty = Math.max(0, totalQty - assignedQty);
  const qtys = [...sortedStageEntries.map(([, quantity]) => quantity), ...(unbatchedQty > 0 ? [unbatchedQty] : [])];
  const pcts = qtysToSegmentPcts(qtys, totalQty);

  const segments: OrderProductionStageProgressSegment[] = sortedStageEntries.map(([stage, quantity], index) => ({
    kind: 'stage',
    stage,
    quantity,
    pct: pcts[index] || 0,
  }));

  if (unbatchedQty > 0) {
    segments.push({
      kind: 'unbatched',
      quantity: unbatchedQty,
      pct: pcts[pcts.length - 1] || 0,
    });
  }

  return {
    segments,
    totalQty,
    assignedQty,
  };
}

/**
 * Σε Παραγωγή — compact list bar: έτοιμα | όλα τα υπόλοιπα στάδια (wip) | χωρίς batch.
 * Denominator is always full order quantity so lines not yet sent to production are visible.
 */
export function buildInProductionCollapsedProgressSegments(
  order: Order,
  batches: ProductionBatch[] | undefined | null
): { segments: OrderListProgressSegment[]; summaryTitle: string; readyPercentVsOrder: number; itemsTotal: number } | null {
  const itemsTotal = sumOrderItemsQty(order);
  if (itemsTotal <= 0) return null;

  const orderBatches = getOrderBatches(order.id, batches);
  let readyQty = 0;
  let wipQty = 0;
  for (const b of orderBatches) {
    const q = b.quantity || 0;
    if (b.current_stage === ProductionStage.Ready) readyQty += q;
    else wipQty += q;
  }
  const unbatchedQty = Math.max(0, itemsTotal - readyQty - wipQty);

  const qtys = [readyQty, wipQty, unbatchedQty];
  const pcts = qtysToSegmentPcts(qtys, itemsTotal);

  const rows: OrderListProgressSegment[] = [
    {
      qty: readyQty,
      pct: pcts[0],
      className: 'bg-emerald-500',
      label: `Έτοιμα: ${readyQty} τεμ.`,
    },
    {
      qty: wipQty,
      pct: pcts[1],
      className: 'bg-amber-500',
      label: `Σε παραγωγή (όχι έτοιμα): ${wipQty} τεμ.`,
    },
    {
      qty: unbatchedQty,
      pct: pcts[2],
      className: 'bg-slate-300',
      label: unbatchedQty > 0 ? `Χωρίς ενεργή παραγωγή: ${unbatchedQty} τεμ.` : 'Χωρίς ενεργή παραγωγή',
    },
  ];

  const segments = rows.filter((s) => s.qty > 0 || s.pct > 0);

  const summaryTitle = [
    readyQty > 0 ? `Έτοιμα ${readyQty}` : null,
    wipQty > 0 ? `Σε παραγωγή ${wipQty}` : null,
    unbatchedQty > 0 ? `Χωρίς batch ${unbatchedQty}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const readyPercentVsOrder = Math.round((100 * readyQty) / itemsTotal);

  return {
    segments,
    summaryTitle: summaryTitle || `Σύνολο ${itemsTotal} τεμ.`,
    readyPercentVsOrder,
    itemsTotal,
  };
}

/**
 * Μερική Παράδοση: multi-segment model — παραδοθέντα (εκτίμηση από υπόλοιπο παρτίδων), έτοιμα, σε παραγωγή, υπόλοιπο χωρίς παραγωγή.
 * Παραδοθέντα ≈ σύνολο γραμμών − σύνολο ποσοτήτων παρτιδών (ό,τι δεν είναι πλέον στην παραγωγή).
 */
export function buildPartialDeliveryProgressSegments(
  order: Order,
  batches: ProductionBatch[] | undefined | null
): { segments: OrderListProgressSegment[]; summaryTitle: string; overallCompletePercent: number } | null {
  const itemsTotal = sumOrderItemsQty(order);
  if (itemsTotal <= 0) return null;

  const obs = getOrderBatches(order.id, batches);
  let batchTotal = 0;
  let readyQty = 0;
  for (const b of obs) {
    const q = b.quantity || 0;
    batchTotal += q;
    if (b.current_stage === ProductionStage.Ready) readyQty += q;
  }
  let wipQty = Math.max(0, batchTotal - readyQty);

  let shippedQty = itemsTotal - batchTotal;
  shippedQty = Math.max(0, Math.min(itemsTotal, shippedQty));

  const pipelineCap = Math.max(0, itemsTotal - shippedQty);
  const pipeline = readyQty + wipQty;
  if (pipeline > pipelineCap && pipeline > 0) {
    const f = pipelineCap / pipeline;
    readyQty = Math.floor(readyQty * f);
    wipQty = Math.max(0, pipelineCap - readyQty);
  }

  let remainderQty = Math.max(0, itemsTotal - shippedQty - readyQty - wipQty);

  const qtys = [shippedQty, readyQty, wipQty, remainderQty];
  const pcts = qtysToSegmentPcts(qtys, itemsTotal);

  const rows: OrderListProgressSegment[] = [
    {
      qty: shippedQty,
      pct: pcts[0],
      className: 'bg-slate-600',
      label: `Παραδόθηκαν: ${shippedQty} τεμ.`,
    },
    {
      qty: readyQty,
      pct: pcts[1],
      className: 'bg-emerald-500',
      label: `Έτοιμα (προς αποστολή): ${readyQty} τεμ.`,
    },
    {
      qty: wipQty,
      pct: pcts[2],
      className: 'bg-amber-500',
      label: `Σε παραγωγή: ${wipQty} τεμ.`,
    },
    {
      qty: remainderQty,
      pct: pcts[3],
      className: 'bg-slate-300',
      label:
        remainderQty > 0
          ? `Χωρίς ενεργή παραγωγή: ${remainderQty} τεμ.`
          : 'Χωρίς ενεργή παραγωγή',
    },
  ];

  const segments = rows.filter((s) => s.qty > 0 || s.pct > 0);

  const summaryTitle = [
    shippedQty > 0 ? `Παραδόθηκαν ${shippedQty}` : null,
    readyQty > 0 ? `Έτοιμα ${readyQty}` : null,
    wipQty > 0 ? `Σε παραγωγή ${wipQty}` : null,
    remainderQty > 0 ? `Υπόλοιπο ${remainderQty}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const overallCompletePercent = Math.round((100 * (shippedQty + readyQty)) / itemsTotal);

  return {
    segments,
    summaryTitle: summaryTitle || `Σύνολο ${itemsTotal} τεμ.`,
    overallCompletePercent,
  };
}

/** Batches for this order that are not yet Ready (for delivery info pane). */
export function getNotReadyBatches(orderId: string, batches: ProductionBatch[] | undefined | null): Array<{ sku: string; variant_suffix?: string; current_stage: ProductionStage; size_info?: string; cord_color?: ProductionBatch['cord_color']; enamel_color?: ProductionBatch['enamel_color'] }> {
  if (!batches) return [];
  return getOrderBatches(orderId, batches)
    .filter((b) => b.current_stage !== ProductionStage.Ready)
    .map((b) => ({ sku: b.sku, variant_suffix: b.variant_suffix, current_stage: b.current_stage, size_info: b.size_info, cord_color: b.cord_color, enamel_color: b.enamel_color }));
}

/** Detailed per-shipment readiness breakdown for an order. */
export function getShipmentReadiness(orderId: string, batches: ProductionBatch[] | undefined | null): ShipmentReadinessSummary {
  const orderBatches = getOrderBatches(orderId, batches);
  if (orderBatches.length === 0) {
    return {
      total_batches: 0,
      ready_batches: 0,
      total_qty: 0,
      ready_qty: 0,
      ready_fraction: 0,
      is_fully_ready: false,
      is_partially_ready: false,
      shipments: [],
    };
  }

  let orderTotalQty = 0;
  let orderReadyQty = 0;
  for (const b of orderBatches) {
    const q = b.quantity || 0;
    orderTotalQty += q;
    if (b.current_stage === ProductionStage.Ready) orderReadyQty += q;
  }

  const grouped = groupBatchesByShipment(orderBatches);
  // Reverse to ascending (oldest first) for display with 1-based index
  const ascending = [...grouped].reverse();

  const shipments = ascending.map(([timeKey, shipmentBatches], idx) => {
    const total = shipmentBatches.length;
    const ready = shipmentBatches.filter((b) => b.current_stage === ProductionStage.Ready).length;
    let total_qty = 0;
    let ready_qty = 0;
    for (const b of shipmentBatches) {
      const q = b.quantity || 0;
      total_qty += q;
      if (b.current_stage === ProductionStage.Ready) ready_qty += q;
    }
    return {
      time_key: timeKey,
      shipment_index: idx + 1,
      total,
      ready,
      total_qty,
      ready_qty,
      is_ready: ready === total,
      not_ready_batches: shipmentBatches
        .filter((b) => b.current_stage !== ProductionStage.Ready)
        .map((b) => ({
          sku: b.sku,
          variant_suffix: b.variant_suffix,
          current_stage: b.current_stage,
          size_info: b.size_info,
          cord_color: b.cord_color,
          enamel_color: b.enamel_color,
          product_image: b.product_image ?? b.product_details?.image_url ?? null,
          gender: b.product_details?.gender
        }))
    };
  });

  const totalBatches = orderBatches.length;
  const readyBatches = orderBatches.filter((b) => b.current_stage === ProductionStage.Ready).length;
  const isFullyReady = readyBatches === totalBatches;

  return {
    total_batches: totalBatches,
    ready_batches: readyBatches,
    total_qty: orderTotalQty,
    ready_qty: orderReadyQty,
    ready_fraction: orderTotalQty > 0 ? orderReadyQty / orderTotalQty : totalBatches > 0 ? readyBatches / totalBatches : 0,
    is_fully_ready: isFullyReady,
    is_partially_ready: readyBatches > 0 && !isFullyReady,
    shipments
  };
}
