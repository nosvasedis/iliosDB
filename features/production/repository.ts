import { api, supabase } from '../../lib/supabase';
import { BatchStageHistoryEntry, Material, Order, OrderStatus, Product, ProductionBatch, ProductionStage } from '../../types';

export const productionRepository = {
  getProductionBatches: () => api.getProductionBatches(),
  getBatchStageHistoryEntries: () => api.getBatchStageHistoryEntries(),
  getOrders: () => api.getOrders(),
  getCollections: () => api.getCollections(),
  updateBatchStage: (batchId: string, stage: ProductionStage, userName?: string) => api.updateBatchStage(batchId, stage, userName),
  bulkUpdateBatchStages: (batchIds: string[], stage: ProductionStage, userName?: string) => api.bulkUpdateBatchStages(batchIds, stage, userName),
  deleteProductionBatch: (batchId: string) => api.deleteProductionBatch(batchId),
  getBatchHistory: (batchId: string): Promise<BatchStageHistoryEntry[]> => api.getBatchHistory(batchId),
  logBatchHistory: (batchId: string, fromStage: ProductionStage | null, toStage: ProductionStage, userName: string, notes?: string) =>
    api.logBatchHistory(batchId, fromStage, toStage, userName, notes),
  toggleBatchHold: (batchId: string, isHeld: boolean, reason?: string) => api.toggleBatchHold(batchId, isHeld, reason),
  updateOrderStatus: (orderId: string, status: OrderStatus) => api.updateOrderStatus(orderId, status),
  sendOrderToProduction: (orderId: string, products: Product[], materials: Material[]) =>
    api.sendOrderToProduction(orderId, products, materials),
  revertOrderFromProduction: (orderId: string) => api.revertOrderFromProduction(orderId),
  revertProductionBatch: (batchId: string) => api.revertProductionBatch(batchId),
  splitBatch: (originalBatchId: string, originalNewQty: number, newBatchData: Partial<ProductionBatch>, userName?: string) =>
    api.splitBatch(originalBatchId, originalNewQty, newBatchData, userName),
  mergeBatches: (targetBatchId: string, sourceBatchIds: string[], totalQty: number) =>
    api.mergeBatches(targetBatchId, sourceBatchIds, totalQty),
  mergeBatchParts: (batchIds: string[], targetCreatedAt: string) =>
    api.mergeBatchParts(batchIds, targetCreatedAt),
  reconcileOrderBatches: (order: Order) => api.reconcileOrderBatches(order),
  updateBatchNotes: (batchId: string, notes: string | null) =>
    supabase.from('production_batches').update({ notes, updated_at: new Date().toISOString() }).eq('id', batchId),
};
