import React from 'react';
import { ProductionStage } from '../../types';
import { STAGES, VIBRANT_STAGES } from './stageConstants';

export type PolishingSubStage = 'pending' | 'dispatched';

interface StagePipelineBarProps {
    stageCounts: Record<string, number>;
    stageOnHoldCounts: Record<string, number>;
    totalInProduction: number;
    onStageClick: (stage: ProductionStage, polishingSubStage?: PolishingSubStage) => void;
    // Optional split of the Polishing (Τεχνίτης) stage into its two sub-stages.
    // When provided, the bar renders two adjacent segments (teal = Αναμονή Αποστολής,
    // blue = Στον Τεχνίτη) instead of a single blue segment.
    polishingSplit?: {
        pendingCount: number;
        dispatchedCount: number;
        pendingOnHold: number;
        dispatchedOnHold: number;
    };
}

export const StagePipelineBar = React.memo(function StagePipelineBar({
    stageCounts,
    stageOnHoldCounts,
    totalInProduction,
    onStageClick,
    polishingSplit,
}: StagePipelineBarProps) {
    if (totalInProduction <= 0) return null;

    const activeStages = STAGES.filter(s => (stageCounts[s.id] || 0) > 0);

    return (
        <div className="mt-3">
            <div className="flex h-7 rounded-lg overflow-hidden border border-slate-200 bg-slate-100">
                {activeStages.map((stage, i) => {
                    const count = stageCounts[stage.id] || 0;
                    const onHold = stageOnHoldCounts[stage.id] || 0;
                    const leftBorder = i > 0 ? 'border-l border-white/20' : '';

                    // ── Split Polishing (Τεχνίτης) into two sub-segments ──
                    if (stage.id === ProductionStage.Polishing && polishingSplit && count > 0) {
                        const { pendingCount, dispatchedCount, pendingOnHold, dispatchedOnHold } = polishingSplit;
                        const pendingPct = (pendingCount / totalInProduction) * 100;
                        const dispatchedPct = (dispatchedCount / totalInProduction) * 100;

                        return (
                            <React.Fragment key={stage.id}>
                                {pendingCount > 0 && (
                                    <button
                                        onClick={() => onStageClick(stage.id as ProductionStage, 'pending')}
                                        className={`relative group flex items-center justify-center transition-all hover:brightness-110 active:scale-y-95 bg-teal-500 ${leftBorder}`}
                                        style={{ width: `${Math.max(pendingPct, 6)}%` }}
                                        title={`${stage.label} • Αναμονή Αποστολής: ${pendingCount} τμχ${pendingOnHold > 0 ? ` (${pendingOnHold} σε αναμονή)` : ''} — πατήστε για λεπτομέρειες`}
                                    >
                                        <span className="text-white text-[10px] font-black truncate px-1 drop-shadow-sm">
                                            {pendingPct >= 14 ? `Τεχν. • Αναμονή ` : ''}{pendingCount}
                                        </span>
                                        {pendingOnHold > 0 && (
                                            <span className="absolute -top-1 -right-1 w-3 h-3 bg-amber-400 rounded-full border border-white shadow-sm" />
                                        )}
                                    </button>
                                )}
                                {dispatchedCount > 0 && (
                                    <button
                                        onClick={() => onStageClick(stage.id as ProductionStage, 'dispatched')}
                                        className={`relative group flex items-center justify-center transition-all hover:brightness-110 active:scale-y-95 bg-blue-500 ${pendingCount > 0 || i > 0 ? 'border-l border-white/20' : ''}`}
                                        style={{ width: `${Math.max(dispatchedPct, 6)}%` }}
                                        title={`${stage.label} • Στον Τεχνίτη: ${dispatchedCount} τμχ${dispatchedOnHold > 0 ? ` (${dispatchedOnHold} σε αναμονή)` : ''} — πατήστε για λεπτομέρειες`}
                                    >
                                        <span className="text-white text-[10px] font-black truncate px-1 drop-shadow-sm">
                                            {dispatchedPct >= 14 ? `Τεχν. • Στον Τεχν. ` : ''}{dispatchedCount}
                                        </span>
                                        {dispatchedOnHold > 0 && (
                                            <span className="absolute -top-1 -right-1 w-3 h-3 bg-amber-400 rounded-full border border-white shadow-sm" />
                                        )}
                                    </button>
                                )}
                            </React.Fragment>
                        );
                    }

                    const pct = (count / totalInProduction) * 100;
                    const vibrant = VIBRANT_STAGES[stage.id] || 'bg-slate-500';

                    return (
                        <button
                            key={stage.id}
                            onClick={() => onStageClick(stage.id as ProductionStage)}
                            className={`relative group flex items-center justify-center transition-all hover:brightness-110 active:scale-y-95 ${vibrant} ${leftBorder}`}
                            style={{ width: `${Math.max(pct, 6)}%` }}
                            title={`${stage.label}: ${count} τμχ${onHold > 0 ? ` (${onHold} σε αναμονή)` : ''} — πατήστε για λεπτομέρειες`}
                        >
                            <span className="text-white text-[10px] font-black truncate px-1 drop-shadow-sm">
                                {pct >= 12 ? `${stage.label} ` : ''}{count}
                            </span>
                            {onHold > 0 && (
                                <span className="absolute -top-1 -right-1 w-3 h-3 bg-amber-400 rounded-full border border-white shadow-sm" />
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
});
