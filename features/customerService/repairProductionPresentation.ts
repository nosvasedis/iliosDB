import type { ProductionBatch, RepairCycle, RepairItem, RepairStatus } from '../../types';
import { ProductionStage } from '../../types';
import { getPolishingSubStageLabel, getProductionStageLabel } from '../../utils/productionStages';
import { REPAIR_STATUS_LABELS } from './greek';

export type RepairProductionPresentationKind = 'production-stage' | 'repair-status';

export interface RepairProductionPresentation {
  label: string;
  className: string;
  kind: RepairProductionPresentationKind;
}

const STAGE_BADGE_CLASSES: Record<string, string> = {
  [ProductionStage.AwaitingDelivery]: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  [ProductionStage.Waxing]: 'bg-slate-50 text-slate-700 border-slate-200',
  [ProductionStage.Casting]: 'bg-orange-50 text-orange-700 border-orange-200',
  [ProductionStage.Setting]: 'bg-purple-50 text-purple-700 border-purple-200',
  [ProductionStage.Polishing]: 'bg-blue-50 text-blue-700 border-blue-200',
  [ProductionStage.Assembly]: 'bg-pink-50 text-pink-700 border-pink-200',
  [ProductionStage.Labeling]: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  [ProductionStage.Ready]: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

const POLISHING_PENDING_CLASSES = 'bg-teal-50 text-teal-700 border-teal-200';

const STATUS_BADGE_CLASSES: Record<RepairStatus, string> = {
  received: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  in_production: 'bg-slate-100 text-slate-600 border-slate-200',
  quality_check: 'bg-amber-50 text-amber-800 border-amber-200',
  ready_for_return: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  delivered: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  on_hold: 'bg-amber-50 text-amber-800 border-amber-200',
  irreparable: 'bg-rose-50 text-rose-700 border-rose-200',
  cancelled: 'bg-slate-100 text-slate-500 border-slate-200',
};

export function getRepairProductionPresentation(
  item: Pick<RepairItem, 'status'>,
  batch?: Pick<ProductionBatch, 'current_stage' | 'pending_dispatch'> | null,
): RepairProductionPresentation {
  if (batch?.current_stage) {
    if (batch.current_stage === ProductionStage.Polishing) {
      const pending = !!batch.pending_dispatch;
      return {
        label: getPolishingSubStageLabel(pending ? 'pending' : 'dispatched'),
        className: pending ? POLISHING_PENDING_CLASSES : STAGE_BADGE_CLASSES[ProductionStage.Polishing],
        kind: 'production-stage',
      };
    }
    return {
      label: getProductionStageLabel(batch.current_stage),
      className: STAGE_BADGE_CLASSES[batch.current_stage] || STATUS_BADGE_CLASSES.in_production,
      kind: 'production-stage',
    };
  }

  return {
    label: REPAIR_STATUS_LABELS[item.status],
    className: STATUS_BADGE_CLASSES[item.status] || STATUS_BADGE_CLASSES.in_production,
    kind: 'repair-status',
  };
}

export function findLiveRepairBatch(
  repairItemId: string,
  cycles: RepairCycle[],
  batches: ProductionBatch[],
): ProductionBatch | undefined {
  const linked = batches.find((candidate) => candidate.repair_item_id === repairItemId);
  if (linked) return linked;
  const current = [...cycles]
    .filter((cycle) => cycle.repair_item_id === repairItemId)
    .sort((left, right) => right.cycle_number - left.cycle_number)[0];
  if (!current) return undefined;
  return batches.find((candidate) => candidate.id === current.production_batch_id);
}

export const REPAIR_READY_CONFIRM = {
  title: 'Αφαίρεση από Παραγωγή',
  confirmText: 'Αφαίρεση',
  message(code: string): string {
    return `Η επισκευή ${code} θα μεταφερθεί σε Ποιοτικό έλεγχο και θα αφαιρεθεί από την Παραγωγή.`;
  },
};

export function repairReadyConfirmMessage(codes: string[]): string {
  if (codes.length <= 1) return REPAIR_READY_CONFIRM.message(codes[0] || '');
  return `${codes.length} επισκευές θα μεταφερθούν σε Ποιοτικό έλεγχο και θα αφαιρεθούν από την Παραγωγή.`;
}

export function isRepairProductionBatch(
  batch?: Pick<ProductionBatch, 'workflow_kind' | 'repair_item_id'> | null,
): boolean {
  return !!batch && (batch.workflow_kind === 'repair' || !!batch.repair_item_id);
}

export function countRepairsInProduction(items: RepairItem[], batches: ProductionBatch[]): number {
  const liveIds = new Set(
    batches
      .filter((candidate) => candidate.workflow_kind === 'repair' && candidate.repair_item_id)
      .map((candidate) => candidate.repair_item_id as string),
  );
  return items.filter((item) => !item.is_archived && liveIds.has(item.id)).length;
}
