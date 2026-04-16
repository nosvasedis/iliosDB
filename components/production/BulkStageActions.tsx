import React from 'react';
import { ProductionStage } from '../../types';
import { STAGES, STAGE_BUTTON_COLORS, getStageColorKey } from './stageConstants';

interface BulkStageActionsProps {
    onMove: (stage: ProductionStage, options?: { pendingDispatch?: boolean }) => void;
    disabled: boolean;
}

export const BulkStageActions = React.memo(function BulkStageActions({ onMove, disabled }: BulkStageActionsProps) {
    return (
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 xl:grid-cols-8">
            {STAGES.map((stage) => {
                const stageId = stage.id as ProductionStage;
                const stageColors = STAGE_BUTTON_COLORS[getStageColorKey(stageId)];

                if (stageId === ProductionStage.Polishing) {
                    return (
                        <div key={`bulk-stage-${stage.id}`} className="flex flex-col gap-1">
                            <button
                                onClick={() => onMove(stageId, { pendingDispatch: true })}
                                disabled={disabled}
                                className="min-h-[38px] rounded-lg border px-2 py-1.5 text-[10px] font-black leading-tight transition-all bg-teal-50 text-teal-700 border-teal-200 hover:shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                                title={`Μετακίνηση επιλεγμένων σε ${stage.label} • Αναμονή Αποστολής`}
                            >
                                <span className="block text-center break-words leading-tight">Τεχν. • Αναμ.</span>
                            </button>
                            <button
                                onClick={() => onMove(stageId, { pendingDispatch: false })}
                                disabled={disabled}
                                className="min-h-[38px] rounded-lg border px-2 py-1.5 text-[10px] font-black leading-tight transition-all bg-blue-50 text-blue-700 border-blue-200 hover:shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                                title={`Μετακίνηση επιλεγμένων σε ${stage.label} • Στον Τεχνίτη`}
                            >
                                <span className="block text-center break-words leading-tight">Τεχν. • Αποστ.</span>
                            </button>
                        </div>
                    );
                }

                return (
                    <button
                        key={`bulk-stage-${stage.id}`}
                        onClick={() => onMove(stageId)}
                        disabled={disabled}
                        className={`min-h-[38px] rounded-lg border px-2 py-1.5 text-[10px] font-black leading-tight transition-all ${stageColors.bg} ${stageColors.text} ${stageColors.border} hover:shadow-sm disabled:opacity-40 disabled:cursor-not-allowed`}
                        title={`Μετακίνηση επιλεγμένων σε ${stage.label}`}
                    >
                        <span className="block text-center break-words leading-tight">{stage.label}</span>
                    </button>
                );
            })}
        </div>
    );
});
