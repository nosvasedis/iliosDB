import { OrderShipmentItem, ProductionBatch, ProductionStage } from '../../types';
import { buildOrderShipmentItemKey } from './supabaseHelpers';

export type ShipmentBatchRestoreUpdate = {
  id: string;
  quantity: number;
  current_stage: ProductionStage;
  updated_at: string;
};

export type ShipmentBatchRestorePlan = {
  inserts: ProductionBatch[];
  updates: ShipmentBatchRestoreUpdate[];
};

function shipmentItemKey(item: Pick<OrderShipmentItem, 'sku' | 'variant_suffix' | 'size_info' | 'cord_color' | 'enamel_color' | 'line_id'>): string {
  return buildOrderShipmentItemKey(
    item.sku,
    item.variant_suffix,
    item.size_info,
    item.cord_color,
    item.enamel_color,
    item.line_id,
  );
}

function batchKey(batch: Pick<ProductionBatch, 'sku' | 'variant_suffix' | 'size_info' | 'cord_color' | 'enamel_color' | 'line_id'>): string {
  return buildOrderShipmentItemKey(
    batch.sku,
    batch.variant_suffix,
    batch.size_info,
    batch.cord_color,
    batch.enamel_color,
    batch.line_id,
  );
}

/**
 * When undoing a partial shipment, merge restored quantities into existing batches
 * instead of always inserting new rows (prevents duplicate batches after a failed/partial ship).
 */
export function planShipmentBatchRestores(
  shipmentItems: OrderShipmentItem[],
  existingBatches: ProductionBatch[],
  orderId: string,
  now: string,
): ShipmentBatchRestorePlan {
  const batchesByKey = new Map<string, ProductionBatch[]>();
  for (const batch of existingBatches) {
    const key = batchKey(batch);
    const list = batchesByKey.get(key) || [];
    list.push(batch);
    batchesByKey.set(key, list);
  }

  const inserts: ProductionBatch[] = [];
  const updates: ShipmentBatchRestoreUpdate[] = [];

  for (const item of shipmentItems) {
    if (item.quantity <= 0) continue;

    const key = shipmentItemKey(item);
    const matches = batchesByKey.get(key) || [];

    if (matches.length > 0) {
      const target =
        matches.find((b) => b.current_stage === ProductionStage.Ready) ||
        [...matches].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))[0];

      const nextQty = (target.quantity || 0) + item.quantity;
      updates.push({
        id: target.id,
        quantity: nextQty,
        current_stage: ProductionStage.Ready,
        updated_at: now,
      });
      target.quantity = nextQty;
      target.current_stage = ProductionStage.Ready;
      continue;
    }

    const restoredBatch: ProductionBatch = {
      id: crypto.randomUUID(),
      order_id: orderId,
      sku: item.sku,
      variant_suffix: item.variant_suffix || undefined,
      size_info: item.size_info || undefined,
      cord_color: (item.cord_color || undefined) as ProductionBatch['cord_color'],
      enamel_color: (item.enamel_color || undefined) as ProductionBatch['enamel_color'],
      line_id: item.line_id || null,
      quantity: item.quantity,
      current_stage: ProductionStage.Ready,
      priority: 'Normal',
      requires_setting: false,
      requires_assembly: false,
      on_hold: false,
      pending_dispatch: false,
      created_at: now,
      updated_at: now,
    };
    inserts.push(restoredBatch);
    batchesByKey.set(key, [restoredBatch]);
  }

  return { inserts, updates };
}
