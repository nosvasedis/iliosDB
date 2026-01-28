import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/supabase';
import { ProductionBatch, ProductionStage, Product, Material, MaterialType, ProductionType, Order, ProductVariant } from '../../types';
import { ChevronDown, ChevronUp, Clock, AlertTriangle, ArrowRight, CheckCircle, Factory, MoveRight, Printer, BookOpen, FileText, Hammer, Search, User, StickyNote, Hash, X, PauseCircle, PlayCircle, Check, Tag } from 'lucide-react';
import { useUI } from '../UIProvider';
import BatchBuildModal from '../BatchBuildModal';

interface Props {
    onPrintAggregated: (batches: ProductionBatch[]) => void;
    onPrintPreparation: (batches: ProductionBatch[]) => void;
    onPrintTechnician: (batches: ProductionBatch[]) => void;
    onPrintLabels?: (items: { product: Product; variant?: ProductVariant; quantity: number, format?: 'standard' | 'simple' | 'retail' }[]) => void;
}

const STAGES = [
    { id: ProductionStage.AwaitingDelivery, label: 'Αναμονή', color: 'indigo' },
    { id: ProductionStage.Waxing, label: 'Λάστιχα/Κεριά', color: 'slate' },
    { id: ProductionStage.Casting, label: 'Χυτήριο', color: 'orange' },
    { id: ProductionStage.Setting, label: 'Καρφωτής', color: 'purple' },
    { id: ProductionStage.Polishing, label: 'Τεχνίτης', color: 'blue' },
    { id: ProductionStage.Labeling, label: 'Συσκευασία', color: 'yellow' },
    { id: ProductionStage.Ready, label: 'Έτοιμα', color: 'emerald' }
];

const STAGE_COLORS: Record<string, string> = {
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    slate: 'bg-slate-50 text-slate-700 border-slate-200',
    orange: 'bg-orange-50 text-orange-700 border-orange-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    yellow: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

// Time Aging Helper
const getTimeInStage = (dateStr: string) => {
    const start = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - start.getTime();
    const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHrs / 24);

    let label = '';
    let colorClass = '';

    if (diffDays > 0) {
        label = `${diffDays}d ${diffHrs % 24}h`;
        if (diffDays >= 3) colorClass = 'bg-red-50 text-red-600 border-red-200'; // Critical
        else if (diffDays >= 1) colorClass = 'bg-orange-50 text-orange-600 border-orange-200'; // Warning
        else colorClass = 'bg-blue-50 text-blue-600 border-blue-200'; // Normal
    } else {
        label = `${diffHrs}h`;
        if (diffHrs < 4) colorClass = 'bg-emerald-50 text-emerald-600 border-emerald-200'; // Fresh
        else colorClass = 'bg-blue-50 text-blue-600 border-blue-200'; // Normal
    }

    return { label, colorClass };
};

const MobileBatchCard: React.FC<{ batch: ProductionBatch, onNext: (b: ProductionBatch) => void, onToggleHold: (b: ProductionBatch) => void, onClick: (b: ProductionBatch) => void }> = ({ batch, onNext, onToggleHold, onClick }) => {
    const isDelayed = batch.isDelayed; 
    const isReady = batch.current_stage === ProductionStage.Ready;
    const timeInfo = getTimeInStage(batch.updated_at);

    return (
        <div 
            onClick={() => onClick(batch)}
            className={`bg-white p-3 rounded-xl border shadow-sm relative transition-transform active:scale-[0.98] cursor-pointer ${batch.on_hold ? 'border-amber-400 bg-amber-50/30' : (isDelayed ? 'border-red-300 ring-1 ring-red-50' : 'border-slate-200')}`}
        >
            <div className="flex justify-between items-start mb-2">
                <div>
                    <div className="font-black text-slate-800 text-lg leading-none">{batch.sku}{batch.variant_suffix}</div>
                    {batch.size_info && <div className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-500 font-bold inline-block mt-1">{batch.size_info}</div>}
                </div>
                <div className="flex flex-col items-end gap-1">
                    <div className="text-xl font-black text-slate-900 bg-slate-50 px-2 py-1 rounded-lg border border-slate-100">
                        {batch.quantity}
                    </div>
                    {batch.on_hold && (
                        <span className="bg-amber-100 text-amber-700 border border-amber-200 text-[9px] font-black px-1.5 py-0.5 rounded flex items-center gap-1 animate-pulse">
                            <PauseCircle size={8} className="fill-current"/> ΑΝΑΜΟΝΗ
                        </span>
                    )}
                </div>
            </div>
            
            {batch.on_hold && batch.on_hold_reason && (
                 <div className="mb-3 bg-amber-100 border border-amber-200 rounded-lg p-2 flex gap-2">
                    <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5"/>
                    <span className="text-xs text-amber-800 font-bold leading-snug">{batch.on_hold_reason}</span>
                </div>
            )}

            {batch.notes && !batch.on_hold && (
                <div className="mb-3 bg-amber-50 border border-amber-100 rounded-lg p-2 flex gap-2">
                    <StickyNote size={14} className="text-amber-500 shrink-0 mt-0.5"/>
                    <span className="text-xs text-amber-800 italic font-medium leading-snug">{batch.notes}</span>
                </div>
            )}

            <div className="flex justify-between items-center mt-3 pt-2 border-t border-slate-50">
                <div className="flex gap-2">
                    <div className={`text-[9px] font-black px-1.5 py-0.5 rounded-full flex items-center gap-1 border ${timeInfo.colorClass}`}>
                        <Clock size={10} />
                        <span>{timeInfo.label}</span>
                    </div>
                    {isDelayed && !batch.on_hold && <div className="text-[10px] font-bold text-red-500 flex items-center gap-1"><AlertTriangle size={10}/> Delayed</div>}
                </div>
                
                <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                    <button 
                        onClick={() => onToggleHold(batch)}
                        className={`p-1.5 rounded-lg transition-colors border ${batch.on_hold ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-400 border-slate-200'}`}
                    >
                        {batch.on_hold ? <PlayCircle size={16} className="fill-current"/> : <PauseCircle size={16}/>}
                    </button>
                    {!isReady && !batch.on_hold && (
                        <button 
                            onClick={() => onNext(batch)}
                            className="bg-emerald-500 active:bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 shadow-sm active:scale-95 transition-all"
                        >
                            Επόμενο <MoveRight size={12}/>
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

const PrintSelectorModal = ({ isOpen, onClose, onConfirm, batches, title }: { 
    isOpen: boolean, 
    onClose: () => void, 
    onConfirm: (selected: ProductionBatch[]) => void, 
    batches: (ProductionBatch & { customer_name?: string })[],
    title: string
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
                groups[key] = { 
                    name: b.customer_name ? `${b.customer_name} (#${b.order_id?.slice(0,6)})` : (b.order_id ? `Order #${b.order_id.slice(0,6)}` : 'Χωρίς Εντολή'), 
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
                            <Printer size={18} className="text-blue-600"/> {title}
                        </h3>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-400"><X size={20}/></button>
                </div>

                <div className="p-4 border-b border-slate-100 bg-white">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16}/>
                        <input 
                            type="text" 
                            placeholder="Αναζήτηση..." 
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full pl-9 p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 text-sm font-medium"
                        />
                    </div>
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
                                        {allSelected && <Check size={14} className="text-white"/>}
                                        {someSelected && !allSelected && <div className="w-2 h-2 bg-blue-600 rounded-sm"/>}
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
                                                {selectedIds.has(item.id) && <Check size={12} className="text-white"/>}
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
                        <Printer size={18}/> Εκτύπωση ({selectedIds.size})
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
                    <h3 className="font-black text-lg text-amber-800 flex items-center gap-2"><PauseCircle/> Θέση σε Αναμονή</h3>
                    <button onClick={onClose}><X size={24} className="text-slate-400"/></button>
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

export default function MobileProduction({ onPrintAggregated, onPrintPreparation, onPrintTechnician, onPrintLabels }: Props) {
    const { data: batches, isLoading: loadingBatches } = useQuery({ queryKey: ['batches'], queryFn: api.getProductionBatches });
    const { data: products, isLoading: loadingProducts } = useQuery({ queryKey: ['products'], queryFn: api.getProducts });
    const { data: materials, isLoading: loadingMaterials } = useQuery({ queryKey: ['materials'], queryFn: api.getMaterials });
    const { data: molds, isLoading: loadingMolds } = useQuery({ queryKey: ['molds'], queryFn: api.getMolds });
    const { data: orders } = useQuery({ queryKey: ['orders'], queryFn: api.getOrders });
    
    const queryClient = useQueryClient();
    const { showToast } = useUI();
    
    const [openStage, setOpenStage] = useState<string | null>(ProductionStage.Waxing);
    const [viewBuildBatch, setViewBuildBatch] = useState<ProductionBatch | null>(null);
    const [finderTerm, setFinderTerm] = useState('');
    const [holdBatch, setHoldBatch] = useState<ProductionBatch | null>(null);

    // Print Modal State
    const [printSelectorState, setPrintSelectorState] = useState<{ isOpen: boolean, type: string, batches: any[] }>({ isOpen: false, type: '', batches: [] });

    const enrichedBatches = useMemo(() => {
        if (!batches || !products || !materials || !orders) return [];
        const ZIRCON_CODES = ['LE', 'PR', 'AK', 'MP', 'KO', 'MV', 'RZ'];
        
        return batches.map(b => {
            const prod = products.find(p => p.sku === b.sku);
            const suffix = b.variant_suffix || '';
            const hasZircons = ZIRCON_CODES.some(code => suffix.includes(code)) || 
                             prod?.recipe.some(r => {
                                 if (r.type !== 'raw') return false;
                                 const material = materials.find(m => m.id === r.id);
                                 return material?.type === MaterialType.Stone && ZIRCON_CODES.some(code => material.name.includes(code));
                             }) || false;

            const order = orders.find(o => o.id === b.order_id);

            return { 
                ...b, 
                requires_setting: hasZircons, 
                product_details: prod,
                customer_name: order?.customer_name || ''
            };
        });
    }, [batches, products, materials, orders]);

    const foundBatches = useMemo(() => {
        if (!finderTerm || finderTerm.length < 2) return [];
        const term = finderTerm.toUpperCase();
        return enrichedBatches.filter(b => {
            const fullSku = `${b.sku}${b.variant_suffix || ''}`.toUpperCase();
            return fullSku.includes(term) || (b.order_id && b.order_id.includes(term)) || (b.customer_name && b.customer_name.toUpperCase().includes(term));
        }).map(b => {
            return { ...b, customerName: b.customer_name || 'Unknown' };
        }).sort((a, b) => (a.sku+a.variant_suffix).localeCompare(b.sku+b.variant_suffix));
    }, [enrichedBatches, finderTerm]);

    const toggleStage = (stageId: string) => setOpenStage(openStage === stageId ? null : stageId);

    const getNextStage = (batch: ProductionBatch): ProductionStage | null => {
        const currentIndex = STAGES.findIndex(s => s.id === batch.current_stage);
        if (currentIndex === -1 || currentIndex === STAGES.length - 1) return null;
        let nextIndex = currentIndex + 1;
        if (STAGES[nextIndex].id === ProductionStage.Setting && !batch.requires_setting) nextIndex++;
        return STAGES[nextIndex].id as ProductionStage;
    };

    const handleNextStage = async (batch: ProductionBatch) => {
        const nextStage = getNextStage(batch);
        if (!nextStage) return;
        try {
            await api.updateBatchStage(batch.id, nextStage);
            queryClient.invalidateQueries({ queryKey: ['batches'] });
            showToast(`Το ${batch.sku} μετακινήθηκε.`, "success");
        } catch (error) {
            showToast("Σφάλμα μετακίνησης.", "error");
        }
    };
    
    const handleToggleHold = async (batch: ProductionBatch) => {
        if (batch.on_hold) {
            await api.toggleBatchHold(batch.id, false);
            queryClient.invalidateQueries({ queryKey: ['batches'] });
            showToast("Resumed.", "success");
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
            showToast("Held.", "warning");
        } catch (e) { showToast("Error.", "error"); }
    };

    // Print Handlers
    const handlePrintRequest = (batchesToPrint: ProductionBatch[], type: 'technician' | 'preparation' | 'aggregated') => {
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
        // Filter for Labeling stage specifically
        const stageBatches = enrichedBatches.filter(b => b.current_stage === ProductionStage.Labeling && !b.on_hold);
        if (stageBatches.length === 0) {
            showToast("Δεν υπάρχουν παρτίδες στη Συσκευασία.", "info");
            return;
        }
  
        const printQueue = stageBatches.map(b => {
            const product = products?.find(p => p.sku === b.sku);
            if (!product) return null;
            const variant = product.variants?.find(v => v.suffix === b.variant_suffix);
            return {
                product,
                variant,
                quantity: b.quantity,
                format: 'standard' // Wholesale format default for production flow
            };
        }).filter(item => item !== null);
  
        if (printQueue.length > 0 && onPrintLabels) {
            onPrintLabels(printQueue as any);
            showToast(`Στάλθηκαν ${printQueue.length} ετικέτες για εκτύπωση.`, "success");
        }
    };

    const executePrint = (selected: ProductionBatch[]) => {
        const type = printSelectorState.type;
        if (type === 'technician') onPrintTechnician(selected);
        else if (type === 'preparation') onPrintPreparation(selected);
        else if (type === 'aggregated') onPrintAggregated(selected);
    };

    if (loadingBatches || loadingProducts || loadingMaterials || !products || !materials || !batches) {
        return <div className="p-8 text-center text-slate-400">Φόρτωση παραγωγής...</div>;
    }
    
    const activeBatches = enrichedBatches.filter(b => b.current_stage !== ProductionStage.Ready && !b.on_hold);

    return (
        <div className="p-4 space-y-4 pb-24">
            <div className="flex justify-between items-center mb-2">
                <h1 className="text-2xl font-black text-slate-900">Ροή Παραγωγής</h1>
            </div>

            <div className="bg-slate-900 rounded-3xl p-5 shadow-lg relative overflow-hidden">
                 <div className="absolute top-0 right-0 p-4 opacity-10 text-white"><Search size={80}/></div>
                 <div className="relative z-10">
                    <h2 className="text-white font-bold text-sm mb-3 flex items-center gap-2">
                        <Search size={16} className="text-emerald-400"/> Εύρεση Εντολής / Πελάτη
                    </h2>
                    <div className="relative">
                        <input type="text" value={finderTerm} onChange={(e) => setFinderTerm(e.target.value)} placeholder="SKU ή ID..." className="w-full pl-10 p-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/40 outline-none focus:bg-white/20 font-bold transition-all uppercase"/>
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={18}/>
                        {finderTerm && <button onClick={() => setFinderTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white p-1"><X size={16}/></button>}
                    </div>
                 </div>
                 {finderTerm.length >= 2 && (
                    <div className="mt-4 space-y-2 max-h-64 overflow-y-auto custom-scrollbar relative z-10">
                        {foundBatches.map(b => (
                            <div key={b.id} onClick={() => setViewBuildBatch(b)} className="bg-white rounded-xl p-3 shadow-md border-l-4 border-emerald-500 animate-in slide-in-from-top-2 active:scale-95 transition-transform cursor-pointer">
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <div className="flex items-center gap-2"><span className="font-black text-slate-800 text-lg">{b.sku}{b.variant_suffix}</span>{b.size_info && <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs font-black flex items-center gap-1"><Hash size={10}/> {b.size_info}</span>}</div>
                                        <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5"><User size={12}/> {b.customerName}</div>
                                    </div>
                                    <div className="text-right"><div className="text-[10px] font-mono text-slate-400">#{b.order_id?.slice(0,6)}</div><div className="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded mt-1">{b.current_stage}</div></div>
                                </div>
                                {b.notes && <div className="bg-amber-50 text-amber-800 text-xs font-bold p-2 rounded-lg flex items-start gap-2 border border-amber-100"><StickyNote size={14} className="shrink-0 mt-0.5"/><span>{b.notes}</span></div>}
                            </div>
                        ))}
                    </div>
                 )}
            </div>

            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                <button 
                    onClick={() => handlePrintRequest(enrichedBatches.filter(b => [ProductionStage.Waxing, ProductionStage.Casting].includes(b.current_stage)), 'preparation')}
                    className="flex items-center gap-1 bg-white border border-slate-200 text-purple-700 px-3 py-2 rounded-xl text-xs font-bold shadow-sm whitespace-nowrap active:scale-95"
                >
                    <BookOpen size={14} /> Προετοιμασία
                </button>
                <button 
                    onClick={() => handlePrintRequest(enrichedBatches.filter(b => b.current_stage === ProductionStage.Polishing), 'technician')}
                    className="flex items-center gap-1 bg-white border border-slate-200 text-blue-700 px-3 py-2 rounded-xl text-xs font-bold shadow-sm whitespace-nowrap active:scale-95"
                >
                    <Hammer size={14} /> Τεχνίτης
                </button>
                <button 
                    onClick={() => handlePrintRequest(activeBatches, 'aggregated')}
                    className="flex items-center gap-1 bg-white border border-slate-200 text-slate-700 px-3 py-2 rounded-xl text-xs font-bold shadow-sm whitespace-nowrap active:scale-95"
                >
                    <FileText size={14} /> Συγκεντρωτική
                </button>
                <button 
                    onClick={handlePrintStageLabels}
                    className="flex items-center gap-1 bg-white border border-slate-200 text-yellow-700 px-3 py-2 rounded-xl text-xs font-bold shadow-sm whitespace-nowrap active:scale-95"
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
                                <div className="flex items-center gap-3"><span className={`px-2 py-0.5 rounded-md text-xs font-black ${stageBatches.length > 0 ? colorClass : 'bg-slate-100 text-slate-400'}`}>{stageBatches.length}</span>{isOpen ? <ChevronUp size={18} className="text-slate-400"/> : <ChevronDown size={18} className="text-slate-400"/>}</div>
                            </div>
                            {isOpen && (
                                <div className="p-3 space-y-3 bg-slate-50/50 border-t border-slate-100">
                                    {stageBatches.map(batch => <MobileBatchCard key={batch.id} batch={batch} onNext={handleNextStage} onToggleHold={handleToggleHold} onClick={setViewBuildBatch} />)}
                                    {stageBatches.length === 0 && <div className="text-center py-6 text-slate-400 text-xs italic">Κανένα προϊόν σε αυτό το στάδιο.</div>}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {holdBatch && <MobileHoldModal batch={holdBatch} onClose={() => setHoldBatch(null)} onConfirm={confirmHold} />}
            {viewBuildBatch && molds && <BatchBuildModal batch={viewBuildBatch} allMaterials={materials} allMolds={molds} onClose={() => setViewBuildBatch(null)} />}
            
            {printSelectorState.isOpen && (
                <PrintSelectorModal 
                    isOpen={printSelectorState.isOpen}
                    onClose={() => setPrintSelectorState({...printSelectorState, isOpen: false})}
                    onConfirm={executePrint}
                    batches={printSelectorState.batches}
                    title={
                        printSelectorState.type === 'technician' ? 'Εκτύπωση Τεχνίτη' :
                        printSelectorState.type === 'preparation' ? 'Εκτύπωση Προετοιμασίας' : 'Συγκεντρωτική Εκτύπωση'
                    }
                />
            )}
        </div>
    );
}