import { BatchStageHistoryEntry, Order, ProductionBatch, ProductionStage } from '../../types';

export function getBatchSnapshotById(batches: ProductionBatch[], batchId: string): ProductionBatch | null {
  return batches.find((batch) => batch.id === batchId) || null;
}

export function getOrderSnapshotById(orders: Order[], orderId: string): Order | null {
  return orders.find((order) => order.id === orderId) || null;
}

export function canMoveBatchToStage(batch: ProductionBatch, stage: ProductionStage): boolean {
  if (batch.on_hold) return false;
  if (batch.current_stage === stage) return false;
  if (stage === ProductionStage.Setting && !batch.requires_setting) return false;
  if (stage === ProductionStage.Assembly && !batch.requires_assembly) return false;
  return true;
}

export function buildInitialBatchHistoryEntry(
  batch: Pick<ProductionBatch, 'id' | 'current_stage' | 'created_at'>,
  userName?: string,
  notes?: string | null
): BatchStageHistoryEntry {
  return {
    id: crypto.randomUUID(),
    batch_id: batch.id,
    from_stage: null,
    to_stage: batch.current_stage,
    moved_by: userName || 'System',
    moved_at: batch.created_at,
    notes: notes ?? null,
  };
}
