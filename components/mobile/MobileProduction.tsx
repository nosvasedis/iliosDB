
import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/supabase';
import { ProductionBatch, ProductionStage, Product, Material, MaterialType, ProductionType, Order } from '../../types';
import { ChevronDown, ChevronUp, Clock, AlertTriangle, ArrowRight, CheckCircle, Factory, MoveRight, Printer, BookOpen, FileText, Hammer, Search, User, StickyNote, Hash, X } from 'lucide-react';
import { useUI } from '../UIProvider';

interface Props {
    onPrintAggregated: (batches: ProductionBatch[]) => void;
    onPrintPreparation: (batches: ProductionBatch[]) => void;
    onPrintTechnician: (batches: ProductionBatch[]) => void;
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

const MobileBatchCard: React.FC<{ batch: ProductionBatch, onNext: (b: ProductionBatch) => void }> = ({ batch, onNext }) => {
    const isDelayed = batch.isDelayed; 
    const isReady = batch.current_stage === ProductionStage.Ready;

    return (
        <div className={`bg-white p-3 rounded-xl border shadow-sm relative ${isDelayed ? 'border-red-300 ring-1 ring-red-50' : 'border-slate-200'}`}>
            <div className="flex justify-between items-start mb-2">
                <div>
                    <div className="font-black text-slate-800 text-lg leading-none">{batch.sku}{batch.variant_suffix}</div>
                    {batch.size_info && <div className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-500 font-bold inline-block mt-1">{batch.size_info}</div>}
                </div>
                <div className="text-xl font-black text-slate-900 bg-slate-50 px-2 py-1 rounded-lg border border-slate-100">
                    {batch.quantity}
                </div>
            </div>
            
            <div className="flex justify-between items-center mt-3 pt-2 border-t border-slate-50">
                <div className="flex gap-2">
                    {isDelayed && <div className="text-[10px] font-bold text-red-500 flex items-center gap-1"><AlertTriangle size={10}/> Delayed</div>}
                    <div className="text-[10px] font-bold text-slate-400 flex items-center gap-1"><Clock size={10}/> {new Date(batch.updated_at).toLocaleDateString('el-GR', {day:'2-digit', month:'2-digit'})}</div>
                </div>
                
                {!isReady && (
                    <button 
                        onClick={(e) => { e.stopPropagation(); onNext(batch); }}
                        className="bg-emerald-500 active:bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 shadow-sm active:scale-95 transition-all"
                    >
                        Επόμενο <MoveRight size={12}/>
                    </button>
                )}
            </div>
        </div>
    );
};

export default function MobileProduction({ onPrintAggregated, onPrintPreparation, onPrintTechnician }: Props) {
    const { data: batches, isLoading } = useQuery({ queryKey: ['batches'], queryFn: api.getProductionBatches });
    const { data: products } = useQuery({ queryKey: ['products'], queryFn: api.getProducts });
    const { data: materials } = useQuery({ queryKey: ['materials'], queryFn: api.getMaterials });
    const { data: orders } = useQuery({ queryKey: ['orders'], queryFn: api.getOrders }); // Needed for finder
    
    const queryClient = useQueryClient();
    const { showToast } = useUI();
    
    // Accordion State: Keep track of open stage ID
    const [openStage, setOpenStage] = useState<string | null>(ProductionStage.Waxing);

    // Finder State
    const [finderTerm, setFinderTerm] = useState('');

    const enrichedBatches = useMemo(() => {
        const ZIRCON_CODES = ['LE', 'PR', 'AK', 'MP', 'KO', 'MV', 'RZ'];
        
        return batches?.map(b => {
            const prod = products?.find(p => p.sku === b.sku);
            const suffix = b.variant_suffix || '';
            const hasZircons = ZIRCON_CODES.some(code => suffix.includes(code)) || 
                             prod?.recipe.some(r => {
                                 if (r.type !== 'raw') return false;
                                 const mat = materials?.find(m => m.id === r.id);
                                 return mat?.type === MaterialType.Stone && ZIRCON_CODES.some(code => mat.name.includes(code));
                             }) || false;

            return { ...b, requires_setting: hasZircons };
        }) || [];
    }, [batches, products, materials]);

    const foundBatches = useMemo(() => {
        if (!finderTerm || finderTerm.length < 2) return [];
        const term = finderTerm.toUpperCase();
        
        return enrichedBatches
            .filter(b => {
                const fullSku = `${b.sku}${b.variant_suffix || ''}`.toUpperCase();
                return fullSku.includes(term) || (b.order_id && b.order_id.includes(term));
            })
            .map(b => {
                const order = orders?.find(o => o.id === b.order_id);
                return { ...b, customerName: order?.customer_name || 'Unknown' };
            })
            // Sort: Exact matches first
            .sort((a, b) => {
                const aExact = `${a.sku}${a.variant_suffix || ''}` === term;
                const bExact = `${b.sku}${b.variant_suffix || ''}` === term;
                return (aExact === bExact) ? 0 : aExact ? -1 : 1;
            });
    }, [enrichedBatches, finderTerm, orders]);

    const toggleStage = (stageId: string) => {
        setOpenStage(openStage === stageId ? null : stageId);
    };

    const getNextStage = (batch: ProductionBatch): ProductionStage | null => {
        const currentIndex = STAGES.findIndex(s => s.id === batch.current_stage);
        if (currentIndex === -1 || currentIndex === STAGES.length - 1) return null;
        
        let nextIndex = currentIndex + 1;
        
        // Skip Setting if not required
        if (STAGES[nextIndex].id === ProductionStage.Setting && !batch.requires_setting) {
            nextIndex++;
        }
        
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

    if (isLoading) return <div className="p-8 text-center text-slate-400">Φόρτωση παραγωγής...</div>;

    const activeBatches = enrichedBatches.filter(b => b.current_stage !== ProductionStage.Ready);

    return (
        <div className="p-4 space-y-4 pb-24">
            <div className="flex justify-between items-center mb-2">
                <h1 className="text-2xl font-black text-slate-900">Ροή Παραγωγής</h1>
            </div>

            {/* ORDER FINDER SECTION */}
            <div className="bg-slate-900 rounded-3xl p-5 shadow-lg relative overflow-hidden">
                 <div className="absolute top-0 right-0 p-4 opacity-10 text-white"><Search size={80}/></div>
                 <div className="relative z-10">
                    <h2 className="text-white font-bold text-sm mb-3 flex items-center gap-2">
                        <Search size={16} className="text-emerald-400"/> Εύρεση Εντολής / Πελάτη
                    </h2>
                    <div className="relative">
                        <input 
                            type="text" 
                            value={finderTerm}
                            onChange={(e) => setFinderTerm(e.target.value)}
                            placeholder="Πληκτρολογήστε SKU ή ID..." 
                            className="w-full pl-10 p-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/40 outline-none focus:bg-white/20 font-bold transition-all uppercase"
                        />
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={18}/>
                        {finderTerm && (
                            <button onClick={() => setFinderTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white p-1">
                                <X size={16}/>
                            </button>
                        )}
                    </div>
                 </div>

                 {/* FINDER RESULTS */}
                 {finderTerm.length >= 2 && (
                    <div className="mt-4 space-y-2 max-h-64 overflow-y-auto custom-scrollbar relative z-10">
                        {foundBatches.map(b => (
                            <div key={b.id} className="bg-white rounded-xl p-3 shadow-md border-l-4 border-emerald-500 animate-in slide-in-from-top-2">
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-black text-slate-800 text-lg">{b.sku}{b.variant_suffix}</span>
                                            {b.size_info && <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs font-black flex items-center gap-1"><Hash size={10}/> {b.size_info}</span>}
                                        </div>
                                        <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                                            <User size={12}/> {b.customerName}
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-[10px] font-mono text-slate-400">#{b.order_id?.slice(0,6)}</div>
                                        <div className="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded mt-1">{b.current_stage}</div>
                                    </div>
                                </div>
                                {b.notes && (
                                    <div className="bg-amber-50 text-amber-800 text-xs font-bold p-2 rounded-lg flex items-start gap-2 border border-amber-100">
                                        <StickyNote size={14} className="shrink-0 mt-0.5"/>
                                        <span>{b.notes}</span>
                                    </div>
                                )}
                            </div>
                        ))}
                        {foundBatches.length === 0 && (
                            <div className="text-white/50 text-center text-xs py-2 italic">Δεν βρέθηκαν ενεργές παρτίδες.</div>
                        )}
                    </div>
                 )}
            </div>

            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                <button 
                    onClick={() => onPrintPreparation(activeBatches)}
                    className="flex items-center gap-1 bg-white border border-slate-200 text-purple-700 px-3 py-2 rounded-xl text-xs font-bold shadow-sm whitespace-nowrap"
                >
                    <BookOpen size={14} /> Προετοιμασία
                </button>
                <button 
                    onClick={() => onPrintTechnician(activeBatches)}
                    className="flex items-center gap-1 bg-white border border-slate-200 text-blue-700 px-3 py-2 rounded-xl text-xs font-bold shadow-sm whitespace-nowrap"
                >
                    <Hammer size={14} /> Τεχνίτης
                </button>
                <button 
                    onClick={() => onPrintAggregated(activeBatches)}
                    className="flex items-center gap-1 bg-white border border-slate-200 text-slate-700 px-3 py-2 rounded-xl text-xs font-bold shadow-sm whitespace-nowrap"
                >
                    <FileText size={14} /> Συγκεντρωτική
                </button>
            </div>

            <div className="space-y-3">
                {STAGES.map(stage => {
                    const stageBatches = enrichedBatches.filter(b => b.current_stage === stage.id);
                    const isOpen = openStage === stage.id;
                    const colorClass = STAGE_COLORS[stage.color];

                    return (
                        <div key={stage.id} className={`rounded-2xl border transition-all duration-300 overflow-hidden ${isOpen ? 'bg-white border-slate-300 shadow-md' : `bg-white border-slate-100 shadow-sm opacity-90`}`}>
                            <div 
                                onClick={() => toggleStage(stage.id)}
                                className={`p-4 flex justify-between items-center cursor-pointer ${isOpen ? 'bg-slate-50' : ''}`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`w-3 h-3 rounded-full ${colorClass.split(' ')[0].replace('bg-', 'bg-').replace('50', '500')}`} />
                                    <span className={`font-bold text-sm ${isOpen ? 'text-slate-900' : 'text-slate-600'}`}>{stage.label}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className={`px-2 py-0.5 rounded-md text-xs font-black ${stageBatches.length > 0 ? colorClass : 'bg-slate-100 text-slate-400'}`}>
                                        {stageBatches.length}
                                    </span>
                                    {isOpen ? <ChevronUp size={18} className="text-slate-400"/> : <ChevronDown size={18} className="text-slate-400"/>}
                                </div>
                            </div>

                            {isOpen && (
                                <div className="p-3 space-y-3 bg-slate-50/50 border-t border-slate-100">
                                    {stageBatches.map(batch => (
                                        <MobileBatchCard key={batch.id} batch={batch} onNext={handleNextStage} />
                                    ))}
                                    {stageBatches.length === 0 && (
                                        <div className="text-center py-6 text-slate-400 text-xs italic">
                                            Κανένα προϊόν σε αυτό το στάδιο.
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
