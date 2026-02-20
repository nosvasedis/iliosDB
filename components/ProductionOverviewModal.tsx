
import React, { useMemo } from 'react';
import { ProductionBatch, ProductionStage, Collection, Gender } from '../types';
import { X, FolderKanban } from 'lucide-react';
import { ProductionBatchCard } from './ProductionBatchCard';
import { getVariantComponents } from '../utils/pricingEngine';

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
    onEditNote: (batch: ProductionBatch) => void;
    onToggleHold: (batch: ProductionBatch) => void; 
    onDelete: (batch: ProductionBatch) => void;
    onClick: (batch: ProductionBatch) => void;
}

const STAGES = [
    { id: ProductionStage.AwaitingDelivery, label: 'Αναμονή', color: 'indigo' },
    { id: ProductionStage.Waxing, label: 'Λάστιχα / Κεριά', color: 'slate' },
    { id: ProductionStage.Casting, label: 'Χυτήριο', color: 'orange' },
    { id: ProductionStage.Setting, label: 'Καρφωτής', color: 'purple' },
    { id: ProductionStage.Polishing, label: 'Τεχνίτης', color: 'blue' },
    { id: ProductionStage.Labeling, label: 'Καρτελάκια - Πακετάρισμα', color: 'yellow' },
    { id: ProductionStage.Ready, label: 'Έτοιμα', color: 'emerald' }
];

const GENDER_CONFIG: Record<string, { label: string, style: string }> = {
    [Gender.Women]: { label: 'Γυναικεία', style: 'bg-pink-600 text-white border-pink-700 shadow-sm' },
    [Gender.Men]: { label: 'Ανδρικά', style: 'bg-blue-600 text-white border-blue-700 shadow-sm' },
    [Gender.Unisex]: { label: 'Unisex / Άλλα', style: 'bg-slate-600 text-white border-slate-700 shadow-sm' },
    'Unknown': { label: 'Ακατηγοριοποίητα', style: 'bg-gray-600 text-white border-gray-700 shadow-sm' }
};

const STAGE_COLORS: Record<string, string> = {
    indigo: 'bg-indigo-600 border-indigo-700 text-white shadow-indigo-200',
    slate: 'bg-slate-700 border-slate-800 text-white shadow-slate-200',
    orange: 'bg-orange-600 border-orange-700 text-white shadow-orange-200',
    purple: 'bg-purple-600 border-purple-700 text-white shadow-purple-200',
    blue: 'bg-blue-600 border-blue-700 text-white shadow-blue-200',
    yellow: 'bg-amber-500 border-amber-600 text-white shadow-amber-200',
    emerald: 'bg-emerald-600 border-emerald-700 text-white shadow-emerald-200',
};

export default function ProductionOverviewModal({ 
    isOpen, onClose, title, filterType, batches, collections,
    onPrint, onNextStage, onEditNote, onToggleHold, onDelete, onClick
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
                        <X size={24}/>
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
                                                            <FolderKanban size={12} className="text-slate-400"/>
                                                            <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">{collName}</span>
                                                        </div>
                                                        
                                                        <div className="space-y-2">
                                                            {genderData[collName].map(batch => (
                                                                <ProductionBatchCard 
                                                                    key={batch.id} 
                                                                    batch={batch} 
                                                                    onPrint={onPrint} 
                                                                    onNextStage={onNextStage}
                                                                    onEditNote={() => onEditNote(batch)}
                                                                    onToggleHold={() => onToggleHold(batch)}
                                                                    onDelete={() => onDelete(batch)}
                                                                    onClick={() => onClick(batch)}
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
