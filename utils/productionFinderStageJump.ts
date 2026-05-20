import { ProductionStage } from '../types';
import { getProductionStageLabel, getProductionStageShortLabel } from './productionStages';

/** Unique group for finder navigation (Τεχνίτης split into pending vs dispatched). */
export type FinderStageJumpGroupKey = string;

export type FinderStageJumpTarget = {
    groupKey: FinderStageJumpGroupKey;
    stage: ProductionStage;
    /** True = Τεχν. • Αναμονή Αποστολής */
    polishingPending?: boolean;
    index: number;
    label: string;
    shortLabel: string;
    buttonClass: string;
};

const JUMP_BUTTON_STYLES: Record<string, string> = {
    [ProductionStage.AwaitingDelivery]:
        'bg-indigo-50 border-indigo-300 text-indigo-800 hover:bg-indigo-100 hover:border-indigo-400',
    [ProductionStage.Waxing]:
        'bg-slate-100 border-slate-300 text-slate-800 hover:bg-slate-200 hover:border-slate-400',
    [ProductionStage.Casting]:
        'bg-orange-50 border-orange-300 text-orange-800 hover:bg-orange-100 hover:border-orange-400',
    [ProductionStage.Setting]:
        'bg-purple-50 border-purple-300 text-purple-800 hover:bg-purple-100 hover:border-purple-400',
    'Polishing:pending':
        'bg-teal-50 border-teal-300 text-teal-800 hover:bg-teal-100 hover:border-teal-400',
    'Polishing:dispatched':
        'bg-blue-50 border-blue-300 text-blue-800 hover:bg-blue-100 hover:border-blue-400',
    [ProductionStage.Assembly]:
        'bg-pink-50 border-pink-300 text-pink-800 hover:bg-pink-100 hover:border-pink-400',
    [ProductionStage.Labeling]:
        'bg-yellow-50 border-yellow-300 text-yellow-900 hover:bg-yellow-100 hover:border-yellow-400',
    [ProductionStage.Ready]:
        'bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100 hover:border-emerald-400',
};

export function getFinderJumpGroupKey(batch: {
    current_stage: ProductionStage;
    pending_dispatch?: boolean;
}): FinderStageJumpGroupKey {
    if (batch.current_stage === ProductionStage.Polishing) {
        return batch.pending_dispatch ? 'Polishing:pending' : 'Polishing:dispatched';
    }
    return batch.current_stage;
}

function buildJumpTarget(
    groupKey: FinderStageJumpGroupKey,
    stage: ProductionStage,
    index: number,
    polishingPending?: boolean,
): FinderStageJumpTarget {
    if (groupKey === 'Polishing:pending') {
        return {
            groupKey,
            stage,
            polishingPending: true,
            index,
            label: 'Τεχνίτης • Αναμονή Αποστολής',
            shortLabel: 'ΤΑ',
            buttonClass: JUMP_BUTTON_STYLES['Polishing:pending'],
        };
    }
    if (groupKey === 'Polishing:dispatched') {
        return {
            groupKey,
            stage,
            polishingPending: false,
            index,
            label: 'Τεχνίτης • Στον Τεχνίτη',
            shortLabel: 'ΤΣ',
            buttonClass: JUMP_BUTTON_STYLES['Polishing:dispatched'],
        };
    }

    return {
        groupKey,
        stage,
        index,
        label: getProductionStageLabel(stage),
        shortLabel: getProductionStageShortLabel(stage),
        buttonClass: JUMP_BUTTON_STYLES[stage] ?? JUMP_BUTTON_STYLES[ProductionStage.Waxing],
    };
}

/** First row index for each stage / Τεχνίτης sub-stage block in sorted results. */
export function getFinderStageJumpTargets(
    batches: Array<{ current_stage: ProductionStage; pending_dispatch?: boolean }>,
): FinderStageJumpTarget[] {
    const targets: FinderStageJumpTarget[] = [];
    let lastGroupKey: FinderStageJumpGroupKey | null = null;

    batches.forEach((batch, index) => {
        const groupKey = getFinderJumpGroupKey(batch);
        if (groupKey === lastGroupKey) return;
        targets.push(buildJumpTarget(groupKey, batch.current_stage, index, batch.pending_dispatch));
        lastGroupKey = groupKey;
    });

    return targets;
}

/** Which jump group the user is currently viewing (from scroll anchor row index). */
export function resolveActiveJumpGroupIndex(
    targets: FinderStageJumpTarget[],
    anchorRowIndex: number,
): number {
    if (targets.length === 0) return 0;

    let active = 0;
    for (let i = 0; i < targets.length; i++) {
        if (targets[i].index <= anchorRowIndex) active = i;
    }
    return active;
}

export function resolveNextJumpGroupIndex(
    targets: FinderStageJumpTarget[],
    anchorRowIndex: number,
): number {
    if (targets.length === 0) return 0;
    if (targets.length === 1) return 0;
    const active = resolveActiveJumpGroupIndex(targets, anchorRowIndex);
    return (active + 1) % targets.length;
}

export function resolvePreviousJumpGroupIndex(
    targets: FinderStageJumpTarget[],
    anchorRowIndex: number,
): number {
    if (targets.length === 0) return 0;
    if (targets.length === 1) return 0;
    const active = resolveActiveJumpGroupIndex(targets, anchorRowIndex);
    return (active - 1 + targets.length) % targets.length;
}

/** Step from a known active group index (used by scroll-synced jump buttons). */
export function stepJumpGroupIndex(
    activeGroupIndex: number,
    targetCount: number,
    direction: 'next' | 'prev',
): number {
    if (targetCount <= 1) return 0;
    if (direction === 'next') return (activeGroupIndex + 1) % targetCount;
    return (activeGroupIndex - 1 + targetCount) % targetCount;
}

export function getNextJumpTarget(
    targets: FinderStageJumpTarget[],
    anchorRowIndex: number,
): FinderStageJumpTarget | null {
    if (targets.length <= 1) return null;
    return targets[resolveNextJumpGroupIndex(targets, anchorRowIndex)];
}

export function getPreviousJumpTarget(
    targets: FinderStageJumpTarget[],
    anchorRowIndex: number,
): FinderStageJumpTarget | null {
    if (targets.length <= 1) return null;
    return targets[resolvePreviousJumpGroupIndex(targets, anchorRowIndex)];
}

/** Row index to scroll to for the next stage jump. */
export function resolveNextJumpRowIndex(
    targets: FinderStageJumpTarget[],
    anchorRowIndex: number,
): number {
    if (targets.length === 0) return 0;
    return targets[resolveNextJumpGroupIndex(targets, anchorRowIndex)].index;
}

/** Row index to scroll to for the previous stage jump. */
export function resolvePreviousJumpRowIndex(
    targets: FinderStageJumpTarget[],
    anchorRowIndex: number,
): number {
    if (targets.length === 0) return 0;
    return targets[resolvePreviousJumpGroupIndex(targets, anchorRowIndex)].index;
}

/**
 * Within-stage sort for Τεχνίτης: Αναμονή Αποστολής rows before Στον Τεχνίτη.
 * Call from finder batch compare after stage order is equal.
 */
export function compareFinderPolishingSubStage(
    a: { current_stage: ProductionStage; pending_dispatch?: boolean },
    b: { current_stage: ProductionStage; pending_dispatch?: boolean },
): number {
    if (a.current_stage !== ProductionStage.Polishing || b.current_stage !== ProductionStage.Polishing) {
        return 0;
    }
    const pendingA = a.pending_dispatch ? 0 : 1;
    const pendingB = b.pending_dispatch ? 0 : 1;
    return pendingA - pendingB;
}
