import { BatchStageHistoryEntry, EnhancedProductionBatch, ProductionBatch, ProductionStage } from '../../types';
import { getProductionTimingStatusClasses } from '../../utils/productionTiming';

export const STAGE_BUTTON_COLOR_KEYS = {
  AwaitingDelivery: 'AwaitingDelivery',
  Waxing: 'Waxing',
  Casting: 'Casting',
  Setting: 'Setting',
  Polishing: 'Polishing',
  Assembly: 'Assembly',
  Labeling: 'Labeling',
  Ready: 'Ready',
} as const;

export type StageColorKey = keyof typeof STAGE_BUTTON_COLOR_KEYS;

export function getStageColorKey(stageId: ProductionStage): StageColorKey {
  switch (stageId) {
    case ProductionStage.AwaitingDelivery:
      return 'AwaitingDelivery';
    case ProductionStage.Waxing:
      return 'Waxing';
    case ProductionStage.Casting:
      return 'Casting';
    case ProductionStage.Setting:
      return 'Setting';
    case ProductionStage.Polishing:
      return 'Polishing';
    case ProductionStage.Assembly:
      return 'Assembly';
    case ProductionStage.Labeling:
      return 'Labeling';
    default:
      return 'Ready';
  }
}

export function isStageNotRequired(batch: ProductionBatch, stage: ProductionStage): boolean {
  if (stage === ProductionStage.Setting) return !batch.requires_setting;
  if (stage === ProductionStage.Assembly) return !batch.requires_assembly;
  return false;
}

export function getBatchStageChronologyTimestamp(batch: Pick<EnhancedProductionBatch, 'stageEnteredAt' | 'created_at'>): number {
  const ts = new Date(batch.stageEnteredAt || batch.created_at).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

export function getBatchAgeInfo(batch: Pick<EnhancedProductionBatch, 'timingLabel' | 'timingStatus'>) {
  return {
    label: batch.timingLabel || '0λ',
    style: getProductionTimingStatusClasses(batch.timingStatus || 'normal'),
  };
}

export function buildBatchStageHistoryMap(entries: BatchStageHistoryEntry[] | undefined | null): Map<string, BatchStageHistoryEntry[]> {
  const lookup = new Map<string, BatchStageHistoryEntry[]>();
  (entries || []).forEach((entry) => {
    const existing = lookup.get(entry.batch_id);
    if (existing) existing.push(entry);
    else lookup.set(entry.batch_id, [entry]);
  });

  lookup.forEach((historyEntries) => {
    historyEntries.sort((a, b) => new Date(a.moved_at).getTime() - new Date(b.moved_at).getTime());
  });

  return lookup;
}
