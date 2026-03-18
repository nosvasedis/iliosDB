
import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, supabase } from '../../lib/supabase';
import { ProductionBatch, ProductionStage, Product, Material, MaterialType, ProductionType, Order, ProductVariant } from '../../types';
import { ChevronDown, ChevronUp, Clock, AlertTriangle, ArrowRight, ArrowLeft, CheckCircle, Factory, MoveRight, Printer, BookOpen, FileText, Hammer, Search, User, StickyNote, Hash, X, PauseCircle, PlayCircle, Check, Tag, Loader2, Save, Square, CheckSquare, Image as ImageIcon, Gem } from 'lucide-react';
import { useUI } from '../UIProvider';
import BatchBuildModal from '../BatchBuildModal';
import { formatOrderId } from '../../utils/orderUtils';
import { formatCurrency, formatDecimal, getVariantComponents } from '../../utils/pricingEngine';
import { requiresAssemblyStage } from '../../constants';

interface Props {
    allProducts: Product[];
    onPrintAggregated: (batches: ProductionBatch[]) => void;
    onPrintPreparation: (batches: ProductionBatch[]) => void;
    onPrintTechnician: (batches: ProductionBatch[]) => void;
    onPrintLabels?: (items: { product: Product; variant?: ProductVariant; quantity: number, size?: string, format?: 'standard' | 'simple' | 'retail' }[]) => void;
}

const STAGES = [
    { id: ProductionStage.AwaitingDelivery, label: 'Αναμονή Παραλαβής', color: 'indigo' },
    { id: ProductionStage.Waxing, label: 'Παρασκευή', color: 'slate' },
    { id: ProductionStage.Casting, label: 'Χυτήριο', color: 'orange' },
    { id: ProductionStage.Setting, label: 'Καρφωτής', color: 'purple' },
    { id: ProductionStage.Polishing, label: 'Τεχνίτης', color: 'blue' },
    { id: ProductionStage.Assembly, label: 'Συναρμολόγηση', color: 'pink' },
    { id: ProductionStage.Labeling, label: 'Συσκευασία & Πακετάρισμα', color: 'yellow' },
    { id: ProductionStage.Ready, label: 'Έτοιμα', color: 'emerald' }
];

const STAGE_COLORS: Record<string, string> = {
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    slate: 'bg-slate-50 text-slate-700 border-slate-200',
    orange: 'bg-orange-50 text-orange-700 border-orange-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    pink: 'bg-pink-50 text-pink-700 border-pink-200',
    yellow: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

const STAGE_LIMITS_HOURS: Record<string, number> = {
    [ProductionStage.Waxing]: 120,    // 5 Days
    [ProductionStage.Casting]: 96,    // 4 Days
    [ProductionStage.Setting]: 144,   // 6 Days
    [ProductionStage.Polishing]: 120, // 5 Days
    [ProductionStage.Assembly]: 72,   // 3 Days
    [ProductionStage.Labeling]: 72    // 3 Days
};

const getTimeInStage = (dateStr: string) => {
    const start = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - start.getTime();
    const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHrs / 24);

    let label = '';
    let colorClass = '';

    if (diffDays > 0) {
        label = `${diffDays}ημ ${diffHrs % 24}ω`;
        if (diffDays >= 6) colorClass = 'bg-red-50 text-red-600 border-red-200';
        else if (diffDays >= 4) colorClass = 'bg-orange-50 text-orange-600 border-orange-200';
        else colorClass = 'bg-blue-50 text-blue-600 border-blue-200';
    } else {
        label = `${diffHrs}ω`;
        if (diffHrs < 4) colorClass = 'bg-emerald-50 text-emerald-600 border-emerald-200';
        else colorClass = 'bg-blue-50 text-blue-600 border-blue-200';
    }

    return { label, colorClass };
};

type PrintSelectorType = 'technician' | 'preparation' | 'aggregated' | 'labels';
type LabelPrintSortMode = 'as_sent' | 'customer';

const TEXT_FINISH_COLORS: Record<string, string> = {
    'X': 'text-amber-600',
    'P': 'text-stone-500',
    'D': 'text-orange-500',
    'H': 'text-cyan-600',
    '': 'text-slate-400'
};

const TEXT_STONE_COLORS: Record<string, string> = {
    'KR': 'text-rose-600', 'QN': 'text-slate-900', 'LA': 'text-blue-600', 'TY': 'text-teal-500',
    'TG': 'text-orange-700', 'IA': 'text-red-800', 'BSU': 'text-slate-800', 'GSU': 'text-emerald-800',
    'RSU': 'text-rose-800', 'MA': 'text-emerald-600', 'FI': 'text-slate-400', 'OP': 'text-indigo-500',
    'NF': 'text-green-700', 'CO': 'text-cyan-600', 'TPR': 'text-emerald-500', 'TKO': 'text-rose-600',
    'TMP': 'text-blue-600', 'PCO': 'text-teal-500', 'MCO': 'text-purple-500', 'PAX': 'text-green-600',
    'MAX': 'text-blue-700', 'KAX': 'text-red-700', 'AI': 'text-slate-500', 'AP': 'text-cyan-500',
    'AM': 'text-teal-700', 'LR': 'text-indigo-700', 'BST': 'text-sky-400', 'MP': 'text-blue-400',
    'LE': 'text-slate-400', 'PR': 'text-green-500', 'KO': 'text-red-500', 'MV': 'text-purple-400',
    'RZ': 'text-pink-500', 'AK': 'text-cyan-300', 'XAL': 'text-stone-400', 'SD': 'text-blue-800',
    'AX': 'text-emerald-700',
    'S': 'text-emerald-500', 'R': 'text-red-500', 'B': 'text-blue-500', 'W': 'text-slate-400', 'BK': 'text-slate-900', 'TU': 'text-cyan-500', 'AQ': 'text-sky-400', 'PE': 'text-lime-500', 'TO': 'text-orange-400'
};

const SkuColored = ({ sku, suffix, gender }: { sku: string, suffix?: string, gender?: any }) => {
    const { finish, stone } = getVariantComponents(suffix || '', gender);
    const fColor = TEXT_FINISH_COLORS[finish.code] || 'text-slate-400';
    const sColor = TEXT_STONE_COLORS[stone.code] || 'text-emerald-500';

    return (
        <span className="font-black text-lg tracking-tight">
            <span className="text-slate-800">{sku}</span>
            <span className={fColor}>{finish.code}</span>
            <span className={sColor}>{stone.code}</span>
        </span>
    );
};

const MobileBatchCard: React.FC<{ 
    batch: ProductionBatch & { isDelayed?: boolean, customer_name?: string, product_image?: string | null }, 
    onNext: (b: ProductionBatch) => void, 
    onMoveToStage?: (b: ProductionBatch, stage: ProductionStage) => void,
    onToggleHold: (b: ProductionBatch) => void, 
    onClick: (b: ProductionBatch) => void 
}> = ({ batch, onNext, onMoveToStage, onToggleHold, onClick }) => {
    const isDelayed = batch.isDelayed;
    const isReady = batch.current_stage === ProductionStage.Ready;
    const timeInfo = getTimeInStage(batch.updated_at);
    const [stageSelectorOpen, setStageSelectorOpen] = useState(false);
    
    // Get current stage index
    const currentStageIndex = STAGES.findIndex(s => s.id === batch.current_stage);
    
    // Determine which stages should be disabled (skipped)
    const isStageDisabled = (stageId: ProductionStage): boolean => {
        if (stageId === ProductionStage.Setting && !batch.requires_setting) return true;
        if (stageId === ProductionStage.Assembly && !batch.requires_assembly) return true;
        return false;
    };
    
    // Handle stage selection
    const handleStageSelect = (targetStage: ProductionStage) => {
        if (isStageDisabled(targetStage)) return;
        if (targetStage === batch.current_stage) return;
        setStageSelectorOpen(false);
        if (onMoveToStage) {
            onMoveToStage(batch, targetStage);
        }
    };

    return (
        <div
            onClick={() => onClick(batch)}
            className={`bg-white p-3 rounded-2xl border shadow-sm relative transition-transform active:scale-[0.98] cursor-pointer touch-manipulation ${batch.on_hold ? 'border-amber-400 bg-amber-50/30' : (isDelayed ? 'border-red-300 ring-1 ring-red-50' : 'border-slate-200 hover:border-slate-300')}`}
        >
            <div className="flex justify-between items-start gap-3 mb-2">
                <div className="w-11 h-11 shrink-0 rounded-xl overflow-hidden border border-slate-100 bg-slate-50 flex items-center justify-center">
                    {(batch as any).product_image ? (
                        <img src={(batch as any).product_image} alt="" className="w-full h-full object-cover" />
                    ) : (
                        <ImageIcon size={20} className="text-slate-300" />
                    )}
                </div>
                <div className="min-w-0 flex-1">
                    <SkuColored sku={batch.sku} suffix={batch.variant_suffix || ''} gender={batch.product_details?.gender} />
                    {batch.size_info && <div className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-500 font-bold inline-block mt-1">{batch.size_info}</div>}
                    {batch.customer_name && <div className="text-[10px] font-bold text-slate-500 mt-1 uppercase tracking-tight">{batch.customer_name}</div>}
                </div>
                <div className="flex flex-col items-end gap-1">
                    <div className="text-xl font-black text-slate-900 bg-slate-50 px-2.5 py-1 rounded-xl border border-slate-100 shadow-sm">
                        {batch.quantity}
                    </div>
                    {batch.on_hold && (
                        <span className="bg-amber-100 text-amber-700 border border-amber-200 text-[10px] font-black px-1.5 py-0.5 rounded flex items-center gap-1 animate-pulse">
                            <PauseCircle size={8} className="fill-current" /> ΑΝΑΜΟΝΗ
                        </span>
                    )}
                </div>
            </div>

            {batch.on_hold && batch.on_hold_reason && (
                <div className="mb-3 bg-amber-100 border border-amber-200 rounded-lg p-2.5 flex gap-2">
                    <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
                    <span className="text-xs text-amber-800 font-bold leading-snug">{batch.on_hold_reason}</span>
                </div>
            )}

            {batch.notes && !batch.on_hold && (
                <div className="mb-3 bg-amber-50 border border-amber-100 rounded-lg p-2.5 flex gap-2">
                    <StickyNote size={14} className="text-amber-500 shrink-0 mt-0.5" />
                    <span className="text-xs text-amber-800 italic font-medium leading-snug">"{batch.notes}"</span>
                </div>
            )}

            <div className="flex justify-between items-center mt-3 pt-2.5 border-t border-slate-50">
                <div className="flex gap-2">
                    <div className={`text-[10px] font-black px-2 py-1 rounded-full flex items-center gap-1 border ${timeInfo.colorClass}`}>
                        <Clock size={10} />
                        <span>{timeInfo.label}</span>
                    </div>
                    {isDelayed && !batch.on_hold && (
                        <div className="text-[10px] font-bold text-red-500 bg-red-50 px-2 py-1 rounded-full border border-red-100 flex items-center gap-1">
                            <AlertTriangle size={10} /> Καθυστέρηση
                        </div>
                    )}
                </div>

                <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                    <button
                        onClick={() => onToggleHold(batch)}
                        className={`p-2 rounded-xl transition-colors border ${batch.on_hold ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-400 border-slate-200'}`}
                    >
                        {batch.on_hold ? <PlayCircle size={18} className="fill-current" /> : <PauseCircle size={18} />}
                    </button>
                    {!isReady && !batch.on_hold && (
                        <div className="relative">
                            <button
                                onClick={() => {
                                    if (onMoveToStage) {
                                        setStageSelectorOpen(!stageSelectorOpen);
                                    } else {
                                        onNext(batch);
                                    }
                                }}
                                className="bg-slate-600 active:bg-slate-700 text-white px-3 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"
                            >
                                <MoveRight size={14} /> Μετακίνηση {stageSelectorOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                            </button>
                            
                            {/* Expanding stage selector */}
                            {stageSelectorOpen && onMoveToStage && (
                                <div className="absolute bottom-full right-0 mb-2 bg-white rounded-2xl shadow-xl border border-slate-200 p-2 z-50 min-w-[130px]">
                                    <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2 px-2">Στάδια</div>
                                    <div className="space-y-1 max-h-[280px] overflow-y-auto">
                                        {STAGES.map((stage, index) => {
                                            const isCurrent = stage.id === batch.current_stage;
                                            const isDisabled = isStageDisabled(stage.id);
                                            const isPast = index < currentStageIndex;
                                            const stageColors = STAGE_COLORS[stage.color];
                                            
                                            return (
                                                <button
                                                    key={stage.id}
                                                    onClick={() => handleStageSelect(stage.id)}
                                                    disabled={isDisabled}
                                                    className={`w-full text-left px-2.5 py-2 rounded-xl text-[11px] font-bold transition-all flex items-center justify-between
                                                        ${isCurrent 
                                                            ? `${stageColors} ring-2 ring-offset-1 ring-current/30` 
                                                            : isDisabled
                                                            ? 'bg-slate-50/50 text-slate-300/50 cursor-not-allowed blur-[1px] opacity-50'
                                                            : isPast
                                                            ? 'bg-slate-50 text-slate-500 border border-slate-100'
                                                            : `${stageColors} hover:shadow-md`
                                                        }
                                                    `}
                                                >
                                                    <span className="truncate">{stage.label}</span>
                                                    {isCurrent && <span className="text-[8px]">●</span>}
                                                    {isDisabled && <span className="text-[7px] opacity-50">παράλειψη</span>}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const PrintSelectorModal = ({ isOpen, onClose, onConfirm, batches, title, labelSortMode, onLabelSortModeChange }: {
    isOpen: boolean,
    onClose: () => void,
    onConfirm: (selected: ProductionBatch[]) => void,
    batches: (ProductionBatch & { customer_name?: string })[],
    title: string,
    labelSortMode?: LabelPrintSortMode,
    onLabelSortModeChange?: (mode: LabelPrintSortMode) => void
}) => {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(batches.map(b => b.id)));
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        if (isOpen) setSelectedIds(new Set(batches.map(b => b.id)));
    }, [isOpen, batches]);

    const groupedBatches = useMemo(() => {
        const groups: Record<string, { name: string, items: typeof batches }> = {};

        batches.forEach(b => {
            const key = b.order_id || 'no_order';
            if (!groups[key]) {
                const order = groups[key] = {
                    name: b.customer_name ? `${b.customer_name} (#${formatOrderId(b.order_id)})` : (b.order_id ? `Παραγγελία #${formatOrderId(b.order_id)}` : 'Χωρίς Παραγγελία'),
                    items: []
                };
            }
            groups[key].items.push(b);
        });

        return Object.entries(groups)
            .sort((a, b) => b[1].items.length - a[1].items.length)
            .filter(([_, group]) => group.name.toLowerCase().includes(searchTerm.toLowerCase()) || group.items.some(i => i.sku.toLowerCase().includes(searchTerm.toLowerCase())));
    }, [batches, searchTerm]);

    const toggleBatch = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    };

    const toggleGroup = (batchIds: string[]) => {
        const allSelected = batchIds.every(id => selectedIds.has(id));
        const next = new Set(selectedIds);
        if (allSelected) {
            batchIds.forEach(id => next.delete(id));
        } else {
            batchIds.forEach(id => next.add(id));
        }
        setSelectedIds(next);
    };

    const toggleAll = () => {
        if (selectedIds.size === batches.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(batches.map(b => b.id)));
        }
    };

    const handleConfirm = () => {
        const selected = batches.filter(b => selectedIds.has(b.id));
        onConfirm(selected);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-white w-full max-w-lg max-h-[85vh] rounded-3xl shadow-2xl flex flex-col animate-in zoom-in-95">
                <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div>
                        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                            <Printer size={18} className="text-blue-600" /> {title}
                        </h3>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-400"><X size={20} /></button>
                </div>

                <div className="p-4 border-b border-slate-100 bg-white space-y-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input
                            type="text"
                            placeholder="Αναζήτηση..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full pl-9 p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 text-sm font-medium"
                        />
                    </div>
                    <button
                        onClick={toggleAll}
                        className="w-full py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border border-slate-100 bg-slate-50 text-slate-500 flex items-center justify-center gap-2 active:bg-slate-100"
                    >
                        {selectedIds.size === batches.length ? (
                            <><Square size={14} /> Αποεπιλογη ολων</>
                        ) : (
                            <><CheckSquare size={14} /> Επιλογη ολων</>
                        )}
                    </button>
                    {labelSortMode && onLabelSortModeChange && (
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                onClick={() => onLabelSortModeChange('as_sent')}
                                className={`py-2 rounded-xl text-[11px] font-black border transition-all ${labelSortMode === 'as_sent' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}
                            >
                                Όπως Στάλθηκαν
                            </button>
                            <button
                                onClick={() => onLabelSortModeChange('customer')}
                                className={`py-2 rounded-xl text-[11px] font-black border transition-all ${labelSortMode === 'customer' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}
                            >
                                Ανά Πελάτη
                            </button>
                        </div>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-4 bg-slate-50/30">
                    {groupedBatches.map(([key, group]) => {
                        const allSelected = group.items.every(b => selectedIds.has(b.id));
                        const someSelected = group.items.some(b => selectedIds.has(b.id));

                        return (
                            <div key={key} className={`bg-white rounded-xl border transition-all ${allSelected ? 'border-blue-300 ring-1 ring-blue-100' : 'border-slate-200'}`}>
                                <div
                                    className="p-3 border-b border-slate-100 flex items-center gap-3 cursor-pointer hover:bg-slate-50 rounded-t-xl"
                                    onClick={() => toggleGroup(group.items.map(b => b.id))}
                                >
                                    <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${allSelected ? 'bg-blue-600 border-blue-600' : (someSelected ? 'bg-blue-100 border-blue-300' : 'bg-white border-slate-300')}`}>
                                        {allSelected && <Check size={14} className="text-white" />}
                                        {someSelected && !allSelected && <div className="w-2 h-2 bg-blue-600 rounded-sm" />}
                                    </div>
                                    <div className="flex-1">
                                        <div className="font-bold text-slate-800 text-sm">{group.name}</div>
                                        <div className="text-[10px] text-slate-500">{group.items.length} είδη</div>
                                    </div>
                                </div>
                                <div className="p-2 space-y-1">
                                    {group.items.map(item => (
                                        <div
                                            key={item.id}
                                            onClick={() => toggleBatch(item.id)}
                                            className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded-lg cursor-pointer"
                                        >
                                            <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${selectedIds.has(item.id) ? 'bg-blue-500 border-blue-500' : 'bg-white border-slate-300'}`}>
                                                {selectedIds.has(item.id) && <Check size={12} className="text-white" />}
                                            </div>
                                            <div className="flex-1 flex justify-between items-center">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-mono font-bold text-sm text-slate-700">{item.sku}{item.variant_suffix}</span>
                                                    {item.size_info && <span className="text-[9px] bg-slate-100 px-1.5 rounded border border-slate-200 font-bold text-slate-500">{item.size_info}</span>}
                                                </div>
                                                <div className="text-xs font-black bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                                                    {item.quantity} τμχ
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                    {groupedBatches.length === 0 && <div className="text-center py-10 text-slate-400 italic">Δεν βρέθηκαν παρτίδες.</div>}
                </div>

                <div className="p-4 border-t border-slate-100 bg-white flex justify-end gap-3 rounded-b-3xl">
                    <button onClick={onClose} className="px-5 py-2.5 rounded-xl text-slate-600 font-bold hover:bg-slate-100 transition-colors flex-1">
                        Άκυρο
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={selectedIds.size === 0}
                        className="px-6 py-2.5 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 flex-[2]"
                    >
                        <Printer size={18} /> Εκτύπωση ({selectedIds.size})
                    </button>
                </div>
            </div>
        </div>
    );
};

const MobileHoldModal = ({ batch, onClose, onConfirm }: { batch: ProductionBatch, onClose: () => void, onConfirm: (reason: string) => void }) => {
    const [reason, setReason] = useState('');
    return (
        <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex flex-col justify-end">
            <div className="bg-white rounded-t-3xl p-6 animate-in slide-in-from-bottom-full duration-300">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-black text-lg text-amber-800 flex items-center gap-2"><PauseCircle /> Θέση σε Αναμονή</h3>
                    <button onClick={onClose}><X size={24} className="text-slate-400" /></button>
                </div>
                <p className="text-sm font-bold text-slate-600 mb-2">Αιτιολογία για {batch.sku}:</p>
                <textarea
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    className="w-full p-4 border-2 border-amber-200 rounded-xl bg-amber-50/50 outline-none text-slate-800 font-bold h-32 mb-4 focus:bg-white focus:border-amber-400"
                    placeholder="π.χ. Έλλειψη, Σπάσιμο..."
                    autoFocus
                />
                <button
                    onClick={() => onConfirm(reason)}
                    disabled={!reason.trim()}
                    className="w-full bg-amber-500 text-white py-4 rounded-xl font-black text-lg shadow-lg disabled:opacity-50"
                >
                    Επιβεβαίωση
                </button>
            </div>
        </div>
    );
};

const EditBatchNoteModal = ({ batch, onClose, onSave, isProcessing }: { batch: ProductionBatch, onClose: () => void, onSave: (notes: string) => void, isProcessing: boolean }) => {
    const [note, setNote] = useState(batch.notes || '');

    return (
        <div className="fixed inset-0 z-[200] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-amber-50/50">
                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <StickyNote size={18} className="text-amber-500" /> Σημειώσεις Παρτίδας
                    </h3>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-400"><X size={20} /></button>
                </div>
                <div className="p-6">
                    <div className="mb-4 text-xs text-slate-500">
                        Προσθέστε οδηγίες ή παρατηρήσεις για την παρτίδα <strong>{batch.sku}</strong>.
                    </div>
                    <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-amber-500/20 h-32 resize-none text-sm font-medium"
                        placeholder="Γράψτε εδώ..."
                        autoFocus
                    />
                </div>
                <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
                    <button onClick={onClose} className="px-5 py-2.5 rounded-xl text-slate-500 font-bold hover:bg-slate-200 transition-colors">Άκυρο</button>
                    <button
                        onClick={() => onSave(note)}
                        disabled={isProcessing}
                        className="px-6 py-2.5 rounded-xl bg-slate-900 text-white font-bold hover:bg-black transition-colors flex items-center gap-2 shadow-lg"
                    >
                        {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Αποθήκευση
                    </button>
                </div>
            </div>
        </div>
    );
};

const SplitBatchModal = ({ state, onClose, onConfirm, isProcessing }: { state: { batch: ProductionBatch, targetStage: ProductionStage }, onClose: () => void, onConfirm: (qty: number, targetStage: ProductionStage) => void, isProcessing: boolean }) => {
    const { batch, targetStage } = state;
    const [quantity, setQuantity] = useState(batch.quantity);
    const [selectedTarget, setSelectedTarget] = useState<ProductionStage>(targetStage);

    const handleConfirmClick = () => {
        if (quantity > 0 && quantity <= batch.quantity) {
            onConfirm(quantity, selectedTarget);
        }
    };

    return (
        <div className="fixed inset-0 z-[250] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div>
                        <h2 className="text-xl font-black text-slate-800">Μετακίνηση Παρτίδας</h2>
                        <p className="text-sm text-slate-500 font-mono font-bold tracking-wider">{batch.sku}{batch.variant_suffix}</p>
                    </div>
                    <button onClick={onClose} disabled={isProcessing} className="p-2 hover:bg-slate-200 rounded-full text-slate-500"><X size={24} /></button>
                </div>
                <div className="p-8 space-y-6">
                    <div className="flex flex-col gap-4">
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Σταδιο Προορισμου</label>
                        <select
                            value={selectedTarget}
                            onChange={(e) => setSelectedTarget(e.target.value as ProductionStage)}
                            className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-slate-800 outline-none focus:border-emerald-500 transition-all appearance-none"
                        >
                            {STAGES.map(s => {
                                // Check if stage is disabled for this batch
                                const isStageDisabled = 
                                    (s.id === ProductionStage.Setting && !batch.requires_setting) ||
                                    (s.id === ProductionStage.Assembly && !batch.requires_assembly);
                                
                                return (
                                    <option 
                                        key={s.id} 
                                        value={s.id} 
                                        disabled={s.id === batch.current_stage || isStageDisabled}
                                    >
                                        {s.label}{isStageDisabled ? ' (παραλείπεται)' : ''}
                                    </option>
                                );
                            })}
                        </select>
                    </div>

                    <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 text-center">
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-1">Ποσοτητα προς Μετακινηση</label>
                        <div className="flex items-center justify-center gap-4">
                            <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="w-12 h-12 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-600 font-black text-xl">-</button>
                            <input
                                type="number"
                                value={quantity}
                                onChange={(e) => {
                                    const val = parseInt(e.target.value);
                                    if (isNaN(val)) setQuantity(1);
                                    else if (val > batch.quantity) setQuantity(batch.quantity);
                                    else if (val < 1) setQuantity(1);
                                    else setQuantity(val);
                                }}
                                className="w-24 p-3 text-center font-black text-3xl bg-transparent outline-none text-slate-800"
                                autoFocus
                            />
                            <button onClick={() => setQuantity(Math.min(batch.quantity, quantity + 1))} className="w-12 h-12 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-600 font-black text-xl">+</button>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-2 font-bold">Διαθέσιμα: {batch.quantity}</p>
                    </div>
                </div>
                <div className="p-6 bg-white border-t border-slate-50 flex gap-3">
                    <button onClick={onClose} disabled={isProcessing} className="flex-1 py-4 rounded-2xl font-black text-slate-500 bg-slate-50 hover:bg-slate-100 transition-colors">
                        ΑΚΥΡΟ
                    </button>
                    <button onClick={handleConfirmClick} disabled={isProcessing} className="flex-[2] py-4 rounded-2xl bg-emerald-600 text-white font-black hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-emerald-200">
                        {isProcessing ? <Loader2 size={20} className="animate-spin" /> : <CheckCircle size={20} />}
                        ΕΠΙΒΕΒΑΙΩΣΗ
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── SettingStoneModal ────────────────────────────────────────────────────────
const SettingStoneModal: React.FC<{
    batches: Array<ProductionBatch & { requires_setting?: boolean; requires_assembly?: boolean; product_details?: Product; product_image?: string | null; customer_name?: string; isDelayed?: boolean }>;
    orders: Order[];
    allProducts: Product[];
    allMaterials: Material[];
    onClose: () => void;
}> = ({ batches, orders, allProducts, allMaterials, onClose }) => {
    const settingBatches = batches.filter(b => b.current_stage === ProductionStage.Setting);

    const orderGroups = useMemo(() => {
        const map = new Map<string, typeof settingBatches>();
        settingBatches.forEach(b => {
            const key = b.order_id || '__none__';
            const arr = map.get(key) || [];
            arr.push(b);
            map.set(key, arr);
        });
        return map;
    }, [settingBatches]);

    const [selectedOrderKey, setSelectedOrderKey] = useState<string | null>(
        () => orderGroups.size === 1 ? Array.from(orderGroups.keys())[0] : null
    );

    const orderList = useMemo(() =>
        Array.from(orderGroups.entries()).map(([key, bs]) => {
            const order = key !== '__none__' ? orders.find(o => o.id === key) : null;
            return {
                key,
                orderId: key !== '__none__' ? key : null,
                customerName: order?.customer_name || bs[0]?.customer_name || 'Χωρίς Πελάτη',
                batchCount: bs.length,
            };
        }), [orderGroups, orders]);

    const stones = useMemo(() => {
        if (!selectedOrderKey) return [];
        const orderBatches = orderGroups.get(selectedOrderKey) || [];
        const stoneMap = new Map<string, { name: string; description?: string; quantity: number; unit: string }>();

        orderBatches.forEach(batch => {
            const product = allProducts.find(p => p.sku === batch.sku);
            if (!product) return;

            let hasRecipeStones = false;
            product.recipe.forEach(item => {
                if (item.type !== 'raw') return;
                const mat = allMaterials.find(m => m.id === item.id);
                if (!mat || mat.type !== MaterialType.Stone) return;
                hasRecipeStones = true;
                const totalQty = item.quantity * batch.quantity;
                const existing = stoneMap.get(mat.id);
                if (existing) existing.quantity += totalQty;
                else stoneMap.set(mat.id, { name: mat.name, description: mat.description, quantity: totalQty, unit: mat.unit || 'τεμ' });
            });

            // Fallback: use suffix stone when no explicit recipe entry
            if (!hasRecipeStones) {
                const { stone } = getVariantComponents(batch.variant_suffix || '', product.gender);
                if (stone.code) {
                    const key = `sfx_${stone.code}`;
                    const existing = stoneMap.get(key);
                    if (existing) existing.quantity += batch.quantity;
                    else stoneMap.set(key, { name: stone.name || stone.code, quantity: batch.quantity, unit: 'τεμ' });
                }
            }
        });
        return Array.from(stoneMap.values()).sort((a, b) => b.quantity - a.quantity);
    }, [selectedOrderKey, orderGroups, allProducts, allMaterials]);

    const selectedBatches = selectedOrderKey ? (orderGroups.get(selectedOrderKey) || []) : [];
    const selectedOrderInfo = orderList.find(o => o.key === selectedOrderKey);

    return (
        <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-end justify-center animate-in fade-in" onClick={onClose}>
            <div
                className="bg-white w-full max-w-lg rounded-t-3xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-full duration-300"
                style={{ maxHeight: '85vh' }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex-shrink-0 p-5 border-b border-slate-100 bg-purple-50/60">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                            {selectedOrderKey ? (
                                <button
                                    onClick={() => setSelectedOrderKey(null)}
                                    className="p-1.5 bg-purple-100 text-purple-700 rounded-xl hover:bg-purple-200 transition-colors active:scale-90"
                                >
                                    <ArrowLeft size={16} />
                                </button>
                            ) : (
                                <div className="p-2 bg-purple-100 rounded-xl">
                                    <Gem size={18} className="text-purple-700" />
                                </div>
                            )}
                            <div>
                                <h3 className="font-black text-slate-900 text-base">Πέτρες Καρφωτή</h3>
                                <p className="text-[10px] text-slate-500 font-medium">
                                    {selectedOrderInfo
                                        ? selectedOrderInfo.customerName
                                        : `${settingBatches.length} παρτίδες σε εξέλιξη`}
                                </p>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-400">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {!selectedOrderKey ? (
                        /* ── Order selection ── */
                        <div className="p-4 space-y-2.5">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Επιλέξτε Παραγγελία</p>
                            {orderList.map(order => (
                                <button
                                    key={order.key}
                                    onClick={() => setSelectedOrderKey(order.key)}
                                    className="w-full bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between hover:border-purple-300 hover:bg-purple-50/30 transition-all active:scale-[0.98] shadow-sm"
                                >
                                    <div className="text-left">
                                        <div className="font-black text-slate-800 text-sm">{order.customerName}</div>
                                        {order.orderId && (
                                            <div className="text-[10px] text-slate-400 font-mono mt-0.5">#{formatOrderId(order.orderId)}</div>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-black bg-purple-50 text-purple-700 border border-purple-100 px-2 py-1 rounded-lg">
                                            {order.batchCount} παρτ.
                                        </span>
                                        <ArrowRight size={16} className="text-slate-400" />
                                    </div>
                                </button>
                            ))}
                            {orderList.length === 0 && (
                                <div className="text-center py-12 text-slate-400 text-sm italic">
                                    Κανένα στάδιο Καρφωτή αυτή τη στιγμή.
                                </div>
                            )}
                        </div>
                    ) : (
                        /* ── Stones breakdown for selected order ── */
                        <div className="p-4 space-y-5">
                            {/* Batches */}
                            <div>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Παρτίδες</p>
                                <div className="space-y-2">
                                    {selectedBatches.map(b => (
                                        <div key={b.id} className="bg-slate-50 rounded-xl px-3 py-2.5 flex items-center justify-between border border-slate-100">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <SkuColored sku={b.sku} suffix={b.variant_suffix || ''} gender={(b as any).product_details?.gender} />
                                                {b.size_info && (
                                                    <span className="text-[9px] bg-slate-200 px-1.5 rounded-md font-bold text-slate-600 shrink-0">{b.size_info}</span>
                                                )}
                                            </div>
                                            <span className="text-sm font-black text-slate-700 bg-white border border-slate-100 px-2.5 py-0.5 rounded-xl shadow-sm shrink-0">
                                                {b.quantity} τμχ
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Stones */}
                            <div>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Απαιτούμενες Πέτρες</p>
                                {stones.length > 0 ? (
                                    <div className="space-y-2">
                                        {stones.map((stone, i) => (
                                            <div key={i} className="bg-white border border-purple-100 rounded-2xl p-4 flex items-center justify-between shadow-sm ring-1 ring-purple-50">
                                                <div className="flex-1 min-w-0 pr-3">
                                                    <div className="font-black text-slate-800 text-sm leading-tight">{stone.name}</div>
                                                    {stone.description && (
                                                        <div className="text-[11px] text-slate-500 font-medium mt-0.5">{stone.description}</div>
                                                    )}
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <div className="text-3xl font-black text-purple-700 leading-none">{stone.quantity}</div>
                                                    <div className="text-[10px] text-slate-400 font-bold mt-0.5">{stone.unit}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5 text-amber-700 text-sm font-bold text-center">
                                        Δεν βρέθηκαν πέτρες στη Λίστα Υλικών για αυτή την παραγγελία.
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default function MobileProduction({ allProducts, onPrintAggregated, onPrintPreparation, onPrintTechnician, onPrintLabels }: Props) {
    const { data: batches, isLoading: loadingBatches } = useQuery({ queryKey: ['batches'], queryFn: api.getProductionBatches });
    const { data: materials, isLoading: loadingMaterials } = useQuery({ queryKey: ['materials'], queryFn: api.getMaterials });
    const { data: molds, isLoading: loadingMolds } = useQuery({ queryKey: ['molds'], queryFn: api.getMolds });
    const { data: orders } = useQuery({ queryKey: ['orders'], queryFn: api.getOrders });

    const queryClient = useQueryClient();
    const { showToast } = useUI();

    const [openStage, setOpenStage] = useState<string | null>(ProductionStage.Waxing);
    const [viewBuildBatch, setViewBuildBatch] = useState<ProductionBatch | null>(null);
    const [finderTerm, setFinderTerm] = useState('');
    const [holdBatch, setHoldBatch] = useState<ProductionBatch | null>(null);
    const [showSettingStones, setShowSettingStones] = useState(false);

    // Note Saving Handler
    const [editingNoteBatch, setEditingNoteBatch] = useState<ProductionBatch | null>(null);
    const [isSavingNote, setIsSavingNote] = useState(false);

    // Split/Move State
    const [splitModalState, setSplitModalState] = useState<{ batch: ProductionBatch, targetStage: ProductionStage } | null>(null);
    const [isProcessingSplit, setIsProcessingSplit] = useState(false);

    // Print Modal State
    const [printSelectorState, setPrintSelectorState] = useState<{ isOpen: boolean, type: PrintSelectorType | '', batches: (ProductionBatch & { customer_name?: string })[] }>({ isOpen: false, type: '', batches: [] });
    const [labelPrintSortMode, setLabelPrintSortMode] = useState<LabelPrintSortMode>('as_sent');

    const enrichedBatches = useMemo(() => {
        if (!batches || !allProducts || !materials || !orders) return [];
        const ZIRCON_CODES = ['LE', 'PR', 'AK', 'MP', 'KO', 'MV', 'RZ'];
        const NON_ZIRCON_STONE_CODES = ['TKO', 'TPR', 'TMP'];

        return batches.map(b => {
            const prod = allProducts.find(p => p.sku === b.sku);
            const suffix = b.variant_suffix || '';
            const stone = getVariantComponents(suffix, prod?.gender).stone;
            const hasZirconsFromSuffix = stone?.code && ZIRCON_CODES.includes(stone.code) && !NON_ZIRCON_STONE_CODES.includes(stone.code);
            const hasZirconsFromRecipe = prod?.recipe.some(r => {
                if (r.type !== 'raw') return false;
                const material = materials.find(m => m.id === r.id);
                return material?.type === MaterialType.Stone && ZIRCON_CODES.some(code => material.name.includes(code));
            }) || false;
            const hasZircons = hasZirconsFromSuffix || hasZirconsFromRecipe;

            const order = orders.find(o => o.id === b.order_id);

            const lastUpdate = new Date(b.updated_at);
            const now = new Date();
            const diffHours = Math.floor((now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60));
            const threshold = STAGE_LIMITS_HOURS[b.current_stage] || Infinity;
            const isDelayed = b.current_stage !== ProductionStage.Ready && diffHours > threshold;

            // Check if assembly stage is required based on SKU
            const requires_assembly = requiresAssemblyStage(b.sku);

            return {
                ...b,
                requires_setting: hasZircons,
                requires_assembly,
                product_details: prod,
                product_image: prod?.image_url,
                customer_name: order?.customer_name || '',
                isDelayed
            };
        });
    }, [batches, allProducts, materials, orders]);

    const foundBatches = useMemo(() => {
        if (!finderTerm || finderTerm.length < 2) return [];
        const term = finderTerm.toUpperCase();
        return enrichedBatches.filter(b => {
            const fullSku = `${b.sku}${b.variant_suffix || ''}`.toUpperCase();
            return fullSku.includes(term) || (b.order_id && b.order_id.includes(term)) || (b.customer_name && b.customer_name.toUpperCase().includes(term));
        }).map(b => {
            return { ...b, customerName: b.customer_name || 'Άγνωστο' };
        }).sort((a, b) => (a.sku + a.variant_suffix).localeCompare(b.sku + b.variant_suffix));
    }, [enrichedBatches, finderTerm]);

    const toggleStage = (stageId: string) => setOpenStage(openStage === stageId ? null : stageId);

    const getNextStage = (batch: ProductionBatch): ProductionStage | null => {
        const currentIndex = STAGES.findIndex(s => s.id === batch.current_stage);
        if (currentIndex === -1 || currentIndex === STAGES.length - 1) return null;

        // Shortcut for Imported Items: Awaiting -> Labeling
        if (batch.product_details?.production_type === ProductionType.Imported && batch.current_stage === ProductionStage.AwaitingDelivery) {
            return ProductionStage.Labeling;
        }

        let nextIndex = currentIndex + 1;
        // Skip Setting if not required
        if (STAGES[nextIndex].id === ProductionStage.Setting && !batch.requires_setting) nextIndex++;
        // Skip Assembly if not required
        if (STAGES[nextIndex].id === ProductionStage.Assembly && !batch.requires_assembly) nextIndex++;
        return STAGES[nextIndex].id as ProductionStage;
    };

    const handleNextStage = async (batch: ProductionBatch) => {
        const nextStage = getNextStage(batch);
        if (!nextStage) return;
        try {
            await api.updateBatchStage(batch.id, nextStage);
            queryClient.invalidateQueries({ queryKey: ['batches'] });
            showToast(`Το ${batch.sku} μετακινήθηκε στο στάδιο ${STAGES.find(s => s.id === nextStage)?.label}.`, "success");
        } catch (error) {
            showToast("Σφάλμα μετακίνησης.", "error");
        }
    };

    const handleToggleHold = async (batch: ProductionBatch) => {
        if (batch.on_hold) {
            await api.toggleBatchHold(batch.id, false);
            queryClient.invalidateQueries({ queryKey: ['batches'] });
            showToast("Η παραγωγή συνεχίζεται.", "success");
        } else {
            setHoldBatch(batch);
        }
    };

    const confirmHold = async (reason: string) => {
        if (!holdBatch) return;
        try {
            await api.toggleBatchHold(holdBatch.id, true, reason);
            queryClient.invalidateQueries({ queryKey: ['batches'] });
            setHoldBatch(null);
            showToast("Τέθηκε σε αναμονή.", "warning");
        } catch (e) { showToast("Σφάλμα.", "error"); }
    };

    const handleMoveBatch = async (batch: ProductionBatch, stage: ProductionStage) => {
        if (batch.on_hold) {
            showToast("Η παρτίδα είναι σε αναμονή.", "error");
            return;
        }
        if (batch.current_stage === stage) return;

        if (batch.current_stage === ProductionStage.AwaitingDelivery) {
            handleImportReceive(batch, stage);
            return;
        }

        setSplitModalState({ batch, targetStage: stage });
    };

    const handleImportReceive = async (batch: ProductionBatch, targetStage: ProductionStage) => {
        const confirmed = window.confirm(`Επιβεβαιώνετε την παραλαβή για την παρτίδα ${batch.sku}${batch.variant_suffix || ''}?`);
        if (confirmed) {
            setIsProcessingSplit(true);
            try {
                await api.updateBatchStage(batch.id, targetStage);
                queryClient.invalidateQueries({ queryKey: ['batches'] });
                showToast('Η παρτίδα παρελήφθη.', 'success');
            } catch (e: any) {
                showToast(`Σφάλμα: ${e.message}`, 'error');
            } finally {
                setIsProcessingSplit(false);
            }
        }
    };

    const handleConfirmSplit = async (quantityToMove: number, targetStage: ProductionStage) => {
        if (!splitModalState) return;
        const { batch } = splitModalState;

        setIsProcessingSplit(true);
        try {
            if (quantityToMove >= batch.quantity) {
                await api.updateBatchStage(batch.id, targetStage);
            } else {
                const originalNewQty = batch.quantity - quantityToMove;
                const { product_details, isDelayed, customer_name, ...dbBatch } = batch as any;

                const newBatchData = {
                    ...dbBatch,
                    id: crypto.randomUUID(),
                    quantity: quantityToMove,
                    current_stage: targetStage,
                    updated_at: new Date().toISOString()
                };

                await api.splitBatch(batch.id, originalNewQty, newBatchData);
            }
            queryClient.invalidateQueries({ queryKey: ['batches'] });
            showToast('Η μετακίνηση ολοκληρώθηκε.', 'success');
            setSplitModalState(null);
        } catch (e: any) {
            showToast(`Σφάλμα: ${e.message}`, 'error');
        } finally {
            setIsProcessingSplit(false);
        }
    };

    const handlePrintRequest = (batchesToPrint: (ProductionBatch & { customer_name?: string })[], type: PrintSelectorType) => {
        const validBatches = batchesToPrint.filter(b => !b.on_hold);

        if (validBatches.length === 0) {
            showToast("Δεν υπάρχουν επιλέξιμες παρτίδες για εκτύπωση.", "info");
            return;
        }

        setPrintSelectorState({
            isOpen: true,
            type: type,
            batches: validBatches
        });
    };

    const handlePrintStageLabels = () => {
        const stageBatches = enrichedBatches.filter(b => b.current_stage === ProductionStage.Labeling && !b.on_hold);
        if (stageBatches.length === 0) {
            showToast("Δεν υπάρχουν παρτίδες στη Συσκευασία.", "info");
            return;
        }

        setLabelPrintSortMode('as_sent');
        setPrintSelectorState({
            isOpen: true,
            type: 'labels',
            batches: stageBatches
        });
    };

    const buildLabelPrintQueue = (selected: ProductionBatch[], mode: LabelPrintSortMode) => {
        const sortedBatches = [...selected].sort((a, b) => {
            if (mode === 'customer') {
                const clientA = (a as ProductionBatch & { customer_name?: string }).customer_name || '';
                const clientB = (b as ProductionBatch & { customer_name?: string }).customer_name || '';
                const byCustomer = clientA.localeCompare(clientB, 'el', { sensitivity: 'base' });
                if (byCustomer !== 0) return byCustomer;
            }

            const byUpdatedAt = new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
            if (byUpdatedAt !== 0) return byUpdatedAt;

            const byCreatedAt = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
            if (byCreatedAt !== 0) return byCreatedAt;

            return `${a.sku}${a.variant_suffix || ''}`.localeCompare(`${b.sku}${b.variant_suffix || ''}`, undefined, { numeric: true, sensitivity: 'base' });
        });

        return sortedBatches.map(b => {
            const product = allProducts?.find(p => p.sku === b.sku);
            if (!product) return null;
            const batchSuffix = b.variant_suffix || '';
            const variant = product.variants?.find(v => (v.suffix || '') === batchSuffix);
            return {
                product,
                variant,
                quantity: b.quantity,
                size: b.size_info || undefined,
                format: 'standard'
            };
        }).filter(item => item !== null);
    };

    const executePrint = (selected: ProductionBatch[]) => {
        const type = printSelectorState.type;
        if (type === 'technician') onPrintTechnician(selected);
        else if (type === 'preparation') onPrintPreparation(selected);
        else if (type === 'aggregated') onPrintAggregated(selected);
        else if (type === 'labels') {
            const printQueue = buildLabelPrintQueue(selected, labelPrintSortMode);
            if (printQueue.length > 0 && onPrintLabels) {
                onPrintLabels(printQueue as any);
                const modeLabel = labelPrintSortMode === 'as_sent' ? 'Σειρά Αποστολής' : 'Ταξινόμηση ανά Πελάτη';
                showToast(`Στάλθηκαν ${printQueue.length} ετικέτες για εκτύπωση (${modeLabel}).`, "success");
            } else {
                showToast("Δεν βρέθηκαν προϊόντα για τις παρτίδες.", "error");
            }
        }
    };

    // Note Saving Handler
    const handleSaveNote = async (newNote: string) => {
        if (!editingNoteBatch) return;
        setIsSavingNote(true);
        try {
            const { error } = await supabase
                .from('production_batches')
                .update({ notes: newNote || null })
                .eq('id', editingNoteBatch.id);
            if (error) throw error;
            queryClient.invalidateQueries({ queryKey: ['batches'] });
            showToast("Η σημείωση αποθηκεύτηκε.", "success");
            setEditingNoteBatch(null);
        } catch (e) {
            showToast("Σφάλμα αποθήκευσης.", "error");
        } finally {
            setIsSavingNote(false);
        }
    };

    if (loadingBatches || loadingMaterials || !allProducts || !materials || !batches) {
        return <div className="p-8 text-center text-slate-400">Φόρτωση παραγωγής...</div>;
    }

    const activeBatchesCount = enrichedBatches.filter(b => b.current_stage !== ProductionStage.Ready && !b.on_hold).length;

    return (
        <div className="p-4 space-y-4 pb-24">
            <div className="flex justify-between items-center mb-2">
                <h1 className="text-2xl font-black text-slate-900">Ροή Παραγωγής</h1>
                <span className="bg-slate-900 text-white text-[10px] font-black px-2 py-1 rounded-lg uppercase tracking-widest">{activeBatchesCount} ΕΝΕΡΓΑ</span>
            </div>

            <div className="bg-slate-900 rounded-3xl p-5 shadow-lg relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10 text-white"><Search size={80} /></div>
                <div className="relative z-10">
                    <div className="flex items-center justify-between mb-3 text-white">
                        <h2 className="font-bold text-sm flex items-center gap-2">
                            <Search size={16} className="text-emerald-400" /> Εύρεση Παρτίδας
                        </h2>
                        {finderTerm && <div className="text-[10px] font-black bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-lg border border-emerald-500/20">{foundBatches.length} ΑΠΟΤΕΛΕΣΜΑΤΑ</div>}
                    </div>
                    <div className="relative">
                        <input type="text" value={finderTerm} onChange={(e) => setFinderTerm(e.target.value)} placeholder="SKU ή Πελάτης..." className="w-full pl-10 p-4 rounded-2xl bg-white/10 border border-white/20 text-white placeholder-white/40 outline-none focus:bg-white/20 focus:ring-2 focus:ring-emerald-500/20 font-bold transition-all uppercase" />
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" size={20} />
                        {finderTerm && <button onClick={() => setFinderTerm('')} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white p-1.5 bg-white/5 rounded-full"><X size={16} /></button>}
                    </div>
                </div>
                {finderTerm.length >= 2 && (
                    <div className="mt-4 space-y-3 max-h-80 overflow-y-auto custom-scrollbar relative z-10">
                        {foundBatches.map(b => (
                            <div key={b.id} onClick={() => setViewBuildBatch(b)} className="bg-white rounded-2xl p-4 shadow-xl border-l-8 border-emerald-500 animate-in slide-in-from-top-2 active:scale-95 transition-transform cursor-pointer">
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <SkuColored sku={b.sku} suffix={b.variant_suffix} gender={b.product_details?.gender} />
                                            {b.size_info && <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded-lg text-xs font-black border border-blue-100 flex items-center gap-1"> {b.size_info}</span>}
                                        </div>
                                        <div className="text-xs text-slate-500 font-bold flex items-center gap-1.5 uppercase tracking-tight py-1 inline-block"><User size={12} className="text-slate-400" /> {b.customerName}</div>
                                    </div>
                                    <div className="text-right flex flex-col items-end gap-1">
                                        <div className="text-[10px] font-mono font-bold text-slate-400 select-all tracking-wider">#{formatOrderId(b.order_id)}</div>
                                        <div className={`text-[10px] font-black px-2 py-1 rounded-full border ${STAGE_COLORS[STAGES.find(s => s.id === b.current_stage)?.color || 'slate']}`}>
                                            {STAGES.find(s => s.id === b.current_stage)?.label}
                                        </div>
                                    </div>
                                </div>
                                {b.notes && <div className="mt-2 bg-amber-50 text-amber-800 text-xs font-bold p-3 rounded-xl flex items-start gap-2 border border-amber-100"><StickyNote size={14} className="shrink-0 mt-0.5 text-amber-500" /><span>"{b.notes}"</span></div>}
                            </div>
                        ))}
                        {foundBatches.length === 0 && <div className="text-center py-8 text-white/40 italic font-bold">Δεν βρέθηκαν παρτίδες.</div>}
                    </div>
                )}
            </div>

            <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-100 flex items-center gap-4 mb-2">
                <div className={`w-14 h-14 rounded-full flex items-center justify-center text-lg font-black border-4 shrink-0 ${(enrichedBatches.filter(b => b.isDelayed && !b.on_hold).length / (activeBatchesCount || 1)) > 0.3 ? 'border-red-100 text-red-600 bg-red-50' : 'border-emerald-100 text-emerald-600 bg-emerald-50'}`}>
                    {Math.max(0, 100 - (enrichedBatches.filter(b => b.isDelayed && !b.on_hold).length / (activeBatchesCount || 1)) * 100).toFixed(0)}%
                </div>
                <div>
                    <h3 className="font-bold text-slate-800 text-sm">Κατάσταση Παραγωγής</h3>
                    <div className="flex gap-3 items-center mt-1">
                        <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full"><Clock size={10} /> {activeBatchesCount} Ενεργά</div>
                        <div className="flex items-center gap-1 text-[10px] font-bold text-red-500 bg-red-50 px-2 py-0.5 rounded-full"><AlertTriangle size={10} /> {enrichedBatches.filter(b => b.isDelayed && !b.on_hold).length} Καθυστέρηση</div>
                    </div>
                </div>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                <button
                    onClick={() => handlePrintRequest(enrichedBatches.filter(b => [ProductionStage.Waxing, ProductionStage.Casting].includes(b.current_stage)), 'preparation')}
                    className="flex items-center gap-1.5 bg-white border border-slate-200 text-purple-700 px-4 py-2.5 rounded-2xl text-xs font-black shadow-sm whitespace-nowrap active:scale-95 transition-all"
                >
                    <BookOpen size={14} /> Προετοιμασία
                </button>
                <button
                    onClick={() => handlePrintRequest(enrichedBatches.filter(b => b.current_stage === ProductionStage.Polishing), 'technician')}
                    className="flex items-center gap-1.5 bg-white border border-slate-200 text-blue-700 px-4 py-2.5 rounded-2xl text-xs font-black shadow-sm whitespace-nowrap active:scale-95 transition-all"
                >
                    <Hammer size={14} /> Τεχνίτης
                </button>
                <button
                    onClick={() => handlePrintRequest(enrichedBatches.filter(b => b.current_stage !== ProductionStage.Ready), 'aggregated')}
                    className="flex items-center gap-1.5 bg-white border border-slate-200 text-slate-700 px-4 py-2.5 rounded-2xl text-xs font-black shadow-sm whitespace-nowrap active:scale-95 transition-all"
                >
                    <FileText size={14} /> Συγκεντρωτική
                </button>
                <button
                    onClick={handlePrintStageLabels}
                    className="flex items-center gap-1.5 bg-white border border-slate-200 text-yellow-700 px-4 py-2.5 rounded-2xl text-xs font-black shadow-sm whitespace-nowrap active:scale-95 transition-all"
                >
                    <Tag size={14} /> Ετικέτες
                </button>
            </div>

            <div className="space-y-3">
                {STAGES.map(stage => {
                    const stageBatches = enrichedBatches.filter(b => b.current_stage === stage.id);
                    const isOpen = openStage === stage.id;
                    const colorClass = STAGE_COLORS[stage.color];
                    return (
                        <div key={stage.id} className={`rounded-2xl border transition-all duration-300 overflow-hidden ${isOpen ? 'bg-white border-slate-300 shadow-md' : `bg-white border-slate-100 shadow-sm opacity-90`}`}>
                            <div onClick={() => toggleStage(stage.id)} className={`p-4 flex justify-between items-center cursor-pointer ${isOpen ? 'bg-slate-50' : ''}`}>
                                <div className="flex items-center gap-3"><div className={`w-3 h-3 rounded-full ${colorClass.split(' ')[0].replace('bg-', 'bg-').replace('50', '500')}`} /><span className={`font-bold text-sm ${isOpen ? 'text-slate-900' : 'text-slate-600'}`}>{stage.label}</span></div>
                                <div className="flex items-center gap-3">
                                    {stage.id === ProductionStage.Setting && (
                                        <button
                                            onClick={e => { e.stopPropagation(); setShowSettingStones(true); }}
                                            className="p-1.5 bg-purple-100 text-purple-600 rounded-xl hover:bg-purple-200 active:scale-90 transition-all"
                                            title="Πέτρες Καρφωτή"
                                        >
                                            <Gem size={13} />
                                        </button>
                                    )}
                                    <span className={`px-2 py-0.5 rounded-md text-xs font-black ${stageBatches.length > 0 ? colorClass : 'bg-slate-100 text-slate-400'}`}>{stageBatches.length}</span>{isOpen ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
                                </div>
                            </div>
                            {isOpen && (
                                <div className="p-3 space-y-3 bg-slate-50/50 border-t border-slate-100">
                                    {stageBatches.map(batch => <MobileBatchCard key={batch.id} batch={batch} onNext={handleNextStage} onMoveToStage={handleMoveBatch} onToggleHold={handleToggleHold} onClick={setViewBuildBatch} />)}
                                    {stageBatches.length === 0 && <div className="text-center py-6 text-slate-400 text-xs italic">Κανένα προϊόν σε αυτό το στάδιο.</div>}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {holdBatch && <MobileHoldModal batch={holdBatch} onClose={() => setHoldBatch(null)} onConfirm={confirmHold} />}

            {showSettingStones && orders && (
                <SettingStoneModal
                    batches={enrichedBatches}
                    orders={orders}
                    allProducts={allProducts}
                    allMaterials={materials}
                    onClose={() => setShowSettingStones(false)}
                />
            )}

            {viewBuildBatch && molds && (
                <BatchBuildModal
                    batch={viewBuildBatch}
                    allMaterials={materials}
                    allMolds={molds}
                    allProducts={allProducts}
                    onClose={() => setViewBuildBatch(null)}
                    onMove={handleMoveBatch}
                    onEditNote={(b) => setEditingNoteBatch(b)}
                />
            )}

            {/* Edit Note Modal */}
            {editingNoteBatch && (
                <EditBatchNoteModal
                    batch={editingNoteBatch}
                    onClose={() => setEditingNoteBatch(null)}
                    onSave={handleSaveNote}
                    isProcessing={isSavingNote}
                />
            )}

            {/* Split Modal */}
            {splitModalState && (
                <SplitBatchModal
                    state={splitModalState}
                    onClose={() => setSplitModalState(null)}
                    onConfirm={handleConfirmSplit}
                    isProcessing={isProcessingSplit}
                />
            )}

            {printSelectorState.isOpen && (
                <PrintSelectorModal
                    isOpen={printSelectorState.isOpen}
                    onClose={() => setPrintSelectorState({ ...printSelectorState, isOpen: false })}
                    onConfirm={executePrint}
                    batches={printSelectorState.batches}
                    title={
                        printSelectorState.type === 'technician' ? 'Εκτύπωση Τεχνίτη' :
                            printSelectorState.type === 'preparation' ? 'Εκτύπωση Προετοιμασίας' :
                                printSelectorState.type === 'labels' ? 'Εκτύπωση Ετικετών' : 'Συγκεντρωτική Εκτύπωση'
                    }
                    labelSortMode={printSelectorState.type === 'labels' ? labelPrintSortMode : undefined}
                    onLabelSortModeChange={printSelectorState.type === 'labels' ? setLabelPrintSortMode : undefined}
                />
            )}
        </div>
    );
}
