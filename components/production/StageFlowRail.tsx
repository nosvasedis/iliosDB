import React from 'react';
import { ProductionBatch, ProductionStage } from '../../types';
import { CheckCircle, Check } from 'lucide-react';
import { STAGES, STAGE_BUTTON_COLORS, getStageColorKey } from './stageConstants';
import { isStageNotRequired } from '../../features/production/selectors';

interface StageFlowRailProps {
    batch: ProductionBatch;
    onMove: (stage: ProductionStage, options?: { pendingDispatch?: boolean }) => void;
    disabled: boolean;
}

export const StageFlowRail = React.memo(function StageFlowRail({ batch, onMove, disabled }: StageFlowRailProps) {
    const currentStageIndex = STAGES.findIndex((stage) => stage.id === batch.current_stage);

    return (
        <div className="grid grid-cols-2 gap-1.5 md:grid-cols-4 xl:grid-cols-8">
            {STAGES.map((stage, index) => {
                const stageId = stage.id as ProductionStage;
                const stageColors = STAGE_BUTTON_COLORS[getStageColorKey(stageId)];
                const isCurrentStage = stageId === batch.current_stage;
                const isCompletedStage = index < currentStageIndex;
                const isUnavailableStage = !isCurrentStage && isStageNotRequired(batch, stageId);
                const isClickable = !disabled && !batch.on_hold && !isCurrentStage && !isUnavailableStage;
                const helperText = isCurrentStage
                    ? 'Τρέχον'
                    : isUnavailableStage
                    ? 'N/A'
                    : isCompletedStage
                    ? 'ΟΚ'
                    : '';

                const className = isCurrentStage
                    ? `${stage.color} ring-2 ring-offset-1 ring-current/25 shadow-md saturate-150`
                    : isUnavailableStage
                    ? 'bg-slate-50 text-slate-400 border-slate-200'
                    : isCompletedStage
                    ? `${stageColors.bg} ${stageColors.text} ${stageColors.border} opacity-45`
                    : `${stageColors.bg} ${stageColors.text} ${stageColors.border} hover:-translate-y-0.5 hover:shadow-sm`;

                const title = isCurrentStage
                    ? `${stage.label} (τρέχον στάδιο)`
                    : isUnavailableStage
                    ? `${stage.label} (δεν απαιτείται)`
                    : `Μετακίνηση σε ${stage.label}`;

                if (stageId === ProductionStage.Polishing) {
                    const isDisabled = disabled || batch.on_hold || isUnavailableStage;
                    const isCurrentPending = isCurrentStage && !!(batch as any).pending_dispatch;
                    const isCurrentDispatched = isCurrentStage && !(batch as any).pending_dispatch;
                    const isPast = isCompletedStage && !isCurrentStage && !isUnavailableStage;

                    return (
                        <div key={stage.id} className="flex flex-col gap-1">
                            <button
                                onClick={() => !isDisabled && onMove(stageId, { pendingDispatch: true })}
                                disabled={isDisabled || isCurrentPending}
                                className={`min-h-[46px] rounded-xl border px-2.5 py-1.5 text-left transition-all ${
                                    isCurrentPending
                                        ? 'bg-teal-50 text-teal-700 border-teal-200 ring-2 ring-offset-1 ring-teal-400/25 shadow-md'
                                        : isPast
                                          ? 'bg-teal-50 text-teal-700 border-teal-200 opacity-45'
                                          : 'bg-teal-50 text-teal-700 border-teal-200 hover:-translate-y-0.5 hover:shadow-sm'
                                } ${isDisabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                                title={`${stage.label} • Αναμονή Αποστολής`}
                            >
                                <span className="text-[10px] font-black leading-tight break-words">Τεχν. • Αναμ. Αποστ.</span>
                                <span className="mt-0.5 block text-[9px] font-bold uppercase tracking-wide opacity-75">
                                    {isCurrentPending ? 'Τρέχον' : isPast ? 'ΟΚ' : ''}
                                </span>
                            </button>
                            <button
                                onClick={() => !isDisabled && onMove(stageId, { pendingDispatch: false })}
                                disabled={isDisabled || isCurrentDispatched}
                                className={`min-h-[46px] rounded-xl border px-2.5 py-1.5 text-left transition-all ${
                                    isCurrentDispatched
                                        ? 'bg-blue-50 text-blue-700 border-blue-200 ring-2 ring-offset-1 ring-blue-400/25 shadow-md'
                                        : isPast
                                          ? 'bg-blue-50 text-blue-700 border-blue-200 opacity-45'
                                          : 'bg-blue-50 text-blue-700 border-blue-200 hover:-translate-y-0.5 hover:shadow-sm'
                                } ${isDisabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                                title={`${stage.label} • Στον Τεχνίτη`}
                            >
                                <span className="text-[10px] font-black leading-tight break-words">Τεχν. • Στον Τεχνίτη</span>
                                <span className="mt-0.5 block text-[9px] font-bold uppercase tracking-wide opacity-75">
                                    {isCurrentDispatched ? 'Τρέχον' : isPast ? 'ΟΚ' : ''}
                                </span>
                            </button>
                        </div>
                    );
                }

                return (
                    <button
                        key={stage.id}
                        onClick={() => isClickable && onMove(stageId)}
                        disabled={!isClickable}
                        className={`min-h-[46px] rounded-xl border px-2.5 py-1.5 text-left transition-all ${className} ${!isClickable ? 'cursor-default' : ''}`}
                        title={title}
                    >
                        <span className="flex items-start justify-between gap-1">
                            <span className="text-[10px] font-black leading-tight break-words">{stage.label}</span>
                            {isCurrentStage && <CheckCircle size={11} className="shrink-0" />}
                            {isCompletedStage && !isCurrentStage && !isUnavailableStage && <Check size={11} className="shrink-0 opacity-80" />}
                        </span>
                        {helperText && (
                            <span className="mt-0.5 block text-[9px] font-bold uppercase tracking-wide opacity-75">
                                {helperText}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
});
