import { BatchStageHistoryEntry, ProductionBatch, ProductionStage, ProductionTimingStatus } from '../types';
import { getProductionStageLabel } from './productionStages';

const ONE_HOUR_MS = 1000 * 60 * 60;
const ONE_MINUTE_MS = 1000 * 60;

const REMINDER_SNOOZE_PREFIX = 'ilios.production.reminder.snooze';
const REMINDER_SEEN_PREFIX = 'ilios.production.reminder.seen';

export interface ProductionStageTimingThresholds {
  attentionHours: number;
  delayedHours: number;
  criticalHours: number;
}

export const PRODUCTION_STAGE_TIMING_RULES: Partial<Record<ProductionStage, ProductionStageTimingThresholds>> = {
  [ProductionStage.Waxing]: { attentionHours: 24 * 6, delayedHours: 24 * 7, criticalHours: 24 * 9 },
  [ProductionStage.Casting]: { attentionHours: 24 * 5, delayedHours: 24 * 6, criticalHours: 24 * 8 },
  [ProductionStage.Setting]: { attentionHours: 24 * 7, delayedHours: 24 * 8, criticalHours: 24 * 10 },
  [ProductionStage.Polishing]: { attentionHours: 24 * 6, delayedHours: 24 * 7, criticalHours: 24 * 9 },
  [ProductionStage.Assembly]: { attentionHours: 24 * 4, delayedHours: 24 * 5, criticalHours: 24 * 7 },
  [ProductionStage.Labeling]: { attentionHours: 24 * 3, delayedHours: 24 * 4, criticalHours: 24 * 6 },
};

export function formatGreekDurationFromMs(durationMs: number): string {
  const safeDuration = Math.max(0, durationMs);
  const totalMinutes = Math.floor(safeDuration / ONE_MINUTE_MS);
  const totalHours = Math.floor(safeDuration / ONE_HOUR_MS);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return hours > 0 ? `${days}ημ ${hours}ω` : `${days}ημ`;
  }

  if (totalHours > 0) {
    return minutes > 0 ? `${totalHours}ω ${minutes}λ` : `${totalHours}ω`;
  }

  return `${Math.max(1, totalMinutes)}λ`;
}

export function formatGreekDurationFromHours(hours: number): string {
  return formatGreekDurationFromMs(Math.max(0, hours) * ONE_HOUR_MS);
}

export function getProductionTimingStatusLabel(status: ProductionTimingStatus): string {
  switch (status) {
    case 'attention':
      return 'Θέλει προσοχή';
    case 'delayed':
      return 'Εκτός ορίου';
    case 'critical':
      return 'Κρίσιμη καθυστέρηση';
    default:
      return 'Εντός ορίου';
  }
}

export function getProductionTimingStatusClasses(status: ProductionTimingStatus): string {
  switch (status) {
    case 'attention':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'delayed':
      return 'bg-orange-50 text-orange-700 border-orange-200';
    case 'critical':
      return 'bg-red-50 text-red-700 border-red-200';
    default:
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  }
}

export function buildBatchStageHistoryLookup(entries: BatchStageHistoryEntry[] | undefined | null): Map<string, BatchStageHistoryEntry[]> {
  const lookup = new Map<string, BatchStageHistoryEntry[]>();
  (entries || []).forEach((entry) => {
    const existing = lookup.get(entry.batch_id);
    if (existing) {
      existing.push(entry);
    } else {
      lookup.set(entry.batch_id, [entry]);
    }
  });

  lookup.forEach((historyEntries) => {
    historyEntries.sort((a, b) => new Date(a.moved_at).getTime() - new Date(b.moved_at).getTime());
  });

  return lookup;
}

export function getStageEnteredAt(
  batch: Pick<ProductionBatch, 'id' | 'current_stage' | 'created_at'>,
  historyEntries: BatchStageHistoryEntry[] | undefined | null,
): string {
  const matchingEntry = [...(historyEntries || [])]
    .reverse()
    .find((entry) => entry.to_stage === batch.current_stage);

  return matchingEntry?.moved_at || batch.created_at;
}

export function getProductionTimingStatus(stage: ProductionStage, timeInStageHours: number): ProductionTimingStatus {
  const thresholds = PRODUCTION_STAGE_TIMING_RULES[stage];
  if (!thresholds) return 'normal';
  if (timeInStageHours >= thresholds.criticalHours) return 'critical';
  if (timeInStageHours >= thresholds.delayedHours) return 'delayed';
  if (timeInStageHours >= thresholds.attentionHours) return 'attention';
  return 'normal';
}

export function getProductionTimingInfo(
  batch: Pick<ProductionBatch, 'id' | 'current_stage' | 'created_at'>,
  historyEntries: BatchStageHistoryEntry[] | undefined | null,
  nowMs = Date.now(),
) {
  const stageEnteredAt = getStageEnteredAt(batch, historyEntries);
  const stageEnteredMs = new Date(stageEnteredAt).getTime();
  const timeInStageHours = Math.max(0, Math.floor((nowMs - stageEnteredMs) / ONE_HOUR_MS));
  const timingStatus = getProductionTimingStatus(batch.current_stage, timeInStageHours);
  const reminderKey = [batch.id, batch.current_stage, stageEnteredAt].join('::');

  return {
    stageEnteredAt,
    timeInStageHours,
    timingStatus,
    timingLabel: formatGreekDurationFromHours(timeInStageHours),
    reminderKey,
    isDelayed: timingStatus === 'delayed' || timingStatus === 'critical',
  };
}

export function getStageDeadlineSummary(stage: ProductionStage): string | null {
  const thresholds = PRODUCTION_STAGE_TIMING_RULES[stage];
  if (!thresholds) return null;
  return `${getProductionStageLabel(stage)}: ${formatGreekDurationFromHours(thresholds.delayedHours)} / ${formatGreekDurationFromHours(thresholds.criticalHours)}`;
}

export function isReminderSnoozed(reminderKey: string): boolean {
  try {
    return localStorage.getItem(`${REMINDER_SNOOZE_PREFIX}:${reminderKey}`) === '1';
  } catch {
    return false;
  }
}

export function snoozeReminder(reminderKey: string): void {
  try {
    localStorage.setItem(`${REMINDER_SNOOZE_PREFIX}:${reminderKey}`, '1');
  } catch {
    // Ignore localStorage failures.
  }
}

export function hasSeenCriticalReminder(reminderKey: string): boolean {
  try {
    return localStorage.getItem(`${REMINDER_SEEN_PREFIX}:${reminderKey}`) === '1';
  } catch {
    return false;
  }
}

export function markCriticalReminderSeen(reminderKey: string): void {
  try {
    localStorage.setItem(`${REMINDER_SEEN_PREFIX}:${reminderKey}`, '1');
  } catch {
    // Ignore localStorage failures.
  }
}
