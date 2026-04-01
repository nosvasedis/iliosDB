
import React, { useMemo } from 'react';
import { ProductionBatch, ProductionStage, Collection, Gender } from '../types';
import { X, FolderKanban } from 'lucide-react';
import { ProductionBatchCard } from './ProductionBatchCard';
import { PRODUCTION_STAGES, getProductionStageLabel } from '../utils/productionStages';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    filterType: 'active' | 'delayed' | 'onHold' | 'ready';
    batches: (ProductionBatch & { customer_name?: string, isDelayed?: boolean, product_details?: any })[];
    collections: Collection[];
    // Action Handlers
    onPrint: (batch: ProductionBatch) => void;
    onNextStage?: (batch: ProductionBatch) => void;
    onMoveToStage?: (batch: ProductionBatch, targetStage: ProductionStage) => void;
    onEditNote: (batch: ProductionBatch) => void;
    onToggleHold: (batch: ProductionBatch) => void;
    onDelete: (batch: ProductionBatch) => void;
    onClick: (batch: ProductionBatch) => void;
    onViewHistory?: (batch: ProductionBatch) => void;
}

const STAGES = PRODUCTION_STAGES.map((stage) => ({
    id: stage.id,
    label: getProductionStageLabel(stage.id),
    color: stage.colorKey
}));

const GENDER_CONFIG: Record<string, { label: string, style: string }> = {
    [Gender.Women]: { label: 'Γυναικεία', style: 'bg-pink-50 text-pink-700 border-pink-200 shadow-sm' },
    [Gender.Men]: { label: 'Ανδρικά', style: 'bg-blue-50 text-blue-700 border-blue-200 shadow-sm' },
    [Gender.Unisex]: { label: 'Unisex / Άλλα', style: 'bg-slate-100 text-slate-600 border-slate-200 shadow-sm' },
    'Unknown': { label: 'Ακατηγοριοποίητα', style: 'bg-gray-50 text-gray-600 border-gray-200 shadow-sm' }
};

const STAGE_COLORS: Record<string, string> = {
    indigo: 'bg-indigo-50 border-indigo-100 text-indigo-700 shadow-sm',
    slate: 'bg-slate-50 border-slate-100 text-slate-700 shadow-sm',
    orange: 'bg-orange-50 border-orange-100 text-orange-700 shadow-sm',
    purple: 'bg-purple-50 border-purple-100 text-purple-700 shadow-sm',
    blue: 'bg-blue-50 border-blue-100 text-blue-700 shadow-sm',
    pink: 'bg-pink-50 border-pink-100 text-pink-700 shadow-sm',
    yellow: 'bg-yellow-50 border-yellow-100 text-yellow-700 shadow-sm',
    emerald: 'bg-emerald-50 border-emerald-100 text-emerald-700 shadow-sm',
};

export default function ProductionOverviewModal({
    isOpen, onClose, title, filterType, batches, collections,
    onPrint, onNextStage, onMoveToStage, onEditNote, onToggleHold, onDelete, onClick, onViewHistory
}: Props) {

    // 1. Filter Batches based on type
    const filteredBatches = useMemo(() => {
        return batches.filter(b => {
            if (filterType === 'onHold') return b.on_hold;
            if (filterType === 'ready') return b.current_stage === ProductionStage.Ready;
            if (filterType === 'delayed') return b.isDelayed && !b.on_hold;
            // Active = Not Ready, Not On Hold
            return !b.on_hold && b.current_stage !== ProductionStage.Ready;
        });
    }, [batches, filterType]);

    // 2. Grouping Logic
    const groupedBatchesByStage = useMemo(() => {
        const result: Record<string, Record<string, Record<string, ProductionBatch[]>>> = {};

        filteredBatches.forEach(b => {
            const stage = b.current_stage;
            const gender = b.product_details?.gender || 'Unknown';

            let collName = 'Γενικά';
            if (b.product_details && b.product_details.collections && b.product_details.collections.length > 0) {
                const c = collections.find(col => col.id === b.product_details!.collections![0]);
                if (c) collName = c.name;
            }

            if (!result[stage]) result[stage] = {};
            if (!result[stage][gender]) result[stage][gender] = {};
            if (!result[stage][gender][collName]) result[stage][gender][collName] = [];

            result[stage][gender][collName].push(b);
        });

        // Sort inside groups alphabetically by SKU
        Object.keys(result).forEach(stage => {
            Object.keys(result[stage]).forEach(gender => {
                Object.keys(result[stage][gender]).forEach(coll => {
                    result[stage][gender][coll].sort((a, b) => {
                        const fullA = a.sku + (a.variant_suffix || '');
                        const fullB = b.sku + (b.variant_suffix || '');
                        return fullA.localeCompare(fullB, undefined, { numeric: true, sensitivity: 'base' });
                    });
                });
            });
        });

        return result;
    }, [filteredBatches, collections]);

    // Sorted Genders for display order
    const SORTED_GENDERS = [Gender.Women, Gender.Men, Gender.Unisex, 'Unknown'];

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[150] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-7xl h-[90vh] rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200">

                {/* Header */}
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white shrink-0">
                    <div>
                        <h2 className="text-2xl font-black text-slate-900 flex items-center gap-3">
                            {title}
                        </h2>
                        <p className="text-slate-500 font-medium mt-1">Συνολική προβολή {filteredBatches.length} παρτίδων.</p>
                    </div>
                    <button onClick={onClose} className="p-3 bg-slate-50 hover:bg-slate-100 rounded-full text-slate-500 transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto bg-slate-50/50 p-6 custom-scrollbar">
                    {/* Render by Stage -> Gender -> Collection */}
                    {STAGES.map(stage => {
                        const stageData = groupedBatchesByStage[stage.id];
                        if (!stageData) return null;

                        const stageColorClass = STAGE_COLORS[stage.color] || 'bg-slate-700 border-slate-800 text-white';

                        return (
                            <div key={stage.id} className="mb-8 last:mb-0">
                                {/* Stage Header */}
                                <div className={`flex items-center gap-3 p-4 rounded-2xl border mb-4 sticky top-0 z-10 shadow-md ${stageColorClass}`}>
                                    <h3 className="font-black uppercase tracking-widest text-sm">{stage.label}</h3>
                                    <span className="bg-white/20 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border border-white/20 backdrop-blur-sm">
                                        {Object.values(stageData).flatMap(g => Object.values(g).flat()).length} Παρτίδες
                                    </span>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                    {SORTED_GENDERS.map(genderKey => {
                                        const genderData = stageData[genderKey];
                                        if (!genderData) return null;

                                        const gConfig = GENDER_CONFIG[genderKey] || GENDER_CONFIG['Unknown'];
                                        const collectionKeys = Object.keys(genderData).sort();

                                        return (
                                            <div key={genderKey} className="space-y-4 bg-white p-4 rounded-3xl border border-slate-100 shadow-sm h-fit break-inside-avoid">
                                                {/* Gender Header */}
                                                <div className={`text-xs font-black uppercase tracking-widest px-3 py-1.5 rounded-xl border ${gConfig.style} flex justify-between items-center`}>
                                                    <span>{gConfig.label}</span>
                                                </div>

                                                {/* Collections */}
                                                {collectionKeys.map(collName => (
                                                    <div key={collName} className="pl-2 border-l-2 border-slate-100 ml-1 space-y-2">
                                                        <div className="flex items-center gap-2 px-1 mb-2">
                                                            <FolderKanban size={12} className="text-slate-400" />
                                                            <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">{collName}</span>
                                                        </div>

                                                        <div className="space-y-2">
                                                            {genderData[collName].map(batch => (
                                                                <ProductionBatchCard
                                                                    key={batch.id}
                                                                    batch={batch}
                                                                    onPrint={onPrint}
                                                                    onNextStage={onNextStage}
                                                                    onMoveToStage={onMoveToStage}
                                                                    onEditNote={() => onEditNote(batch)}
                                                                    onToggleHold={() => onToggleHold(batch)}
                                                                    onDelete={() => onDelete(batch)}
                                                                    onClick={() => onClick(batch)}
                                                                    onViewHistory={onViewHistory}
                                                                />
                                                            ))}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}

                    {filteredBatches.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-50">
                            <p className="text-xl font-bold">Δεν βρέθηκαν παρτίδες σε αυτή την κατηγορία.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
