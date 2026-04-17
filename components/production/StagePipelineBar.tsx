import React from 'react';
import { ProductionStage } from '../../types';
import { STAGES, VIBRANT_STAGES } from './stageConstants';

interface StagePipelineBarProps {
    stageCounts: Record<string, number>;
    stageOnHoldCounts: Record<string, number>;
    totalInProduction: number;
    onStageClick: (stage: ProductionStage) => void;
}

export const StagePipelineBar = React.memo(function StagePipelineBar({
    stageCounts,
    stageOnHoldCounts,
    totalInProduction,
    onStageClick,
}: StagePipelineBarProps) {
    if (totalInProduction <= 0) return null;

    const activeStages = STAGES.filter(s => (stageCounts[s.id] || 0) > 0);

    return (
        <div className="mt-3">
            <div className="flex h-7 rounded-lg overflow-hidden border border-slate-200 bg-slate-100">
                {activeStages.map((stage, i) => {
                    const count = stageCounts[stage.id] || 0;
                    const pct = (count / totalInProduction) * 100;
                    const vibrant = VIBRANT_STAGES[stage.id] || 'bg-slate-500';
                    const onHold = stageOnHoldCounts[stage.id] || 0;

                    return (
                        <button
                            key={stage.id}
                            onClick={() => onStageClick(stage.id as ProductionStage)}
                            className={`relative group flex items-center justify-center transition-all hover:brightness-110 active:scale-y-95 ${vibrant} ${i > 0 ? 'border-l border-white/20' : ''}`}
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
