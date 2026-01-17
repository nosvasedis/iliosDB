
import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/supabase';
import { ProductionBatch, ProductionStage, Product, Material, MaterialType, ProductionType } from '../../types';
// @FIX: Added missing ImageIcon import
import { ChevronDown, ChevronUp, Clock, AlertTriangle, ArrowRight, CheckCircle, Factory, MoveRight, Printer, BookOpen, Hammer, FileText, X, Loader2, ImageIcon } from 'lucide-react';
import { useUI } from '../UIProvider';

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

const SplitModal = ({ batch, targetStage, onClose, onConfirm, isProcessing }: { batch: ProductionBatch, targetStage: ProductionStage, onClose: () => void, onConfirm: (qty: number) => void, isProcessing: boolean }) => {
    const [qty, setQty] = useState(batch.quantity);
    return (
        <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl animate-in zoom-in-95">
                <h3 className="font-black text-lg mb-2">Μετακίνηση Παρτίδας</h3>
                <p className="text-xs text-slate-500 mb-6">Επιλέξτε ποσότητα για μετακίνηση στο επόμενο στάδιο.</p>
                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 text-center mb-6">
                    <div className="text-[10px] font-bold text-slate-400 uppercase mb-2">Ποσοτητα (Max: {batch.quantity})</div>
                    <input type="number" value={qty} onChange={e => setQty(Math.min(batch.quantity, Math.max(1, parseInt(e.target.value)||1)))} className="w-full bg-transparent text-4xl font-black text-slate-900 text-center outline-none"/>
                </div>
                <div className="flex gap-2">
                    <button onClick={onClose} className="flex-1 py-3 font-bold text-slate-500 active:bg-slate-100 rounded-xl transition-colors">Άκυρο</button>
                    <button onClick={() => onConfirm(qty)} disabled={isProcessing} className="flex-1 bg-emerald-600 text-white py-3 font-bold rounded-xl shadow-lg flex items-center justify-center gap-2">
                        {isProcessing ? <Loader2 size={16} className="animate-spin"/> : <CheckCircle size={16}/>} Επιβεβαίωση
                    </button>
                </div>
            </div>
        </div>
    );
};

interface MobileProductionProps {
    onPrintBatch?: (b: ProductionBatch) => void;
    onPrintAggregated?: (b: ProductionBatch[]) => void;
    onPrintPreparation?: (b: ProductionBatch[]) => void;
    onPrintTechnician?: (b: ProductionBatch[]) => void;
}

export default function MobileProduction({ onPrintBatch, onPrintAggregated, onPrintPreparation, onPrintTechnician }: MobileProductionProps) {
    const { data: batches, isLoading } = useQuery({ queryKey: ['batches'], queryFn: api.getProductionBatches });
    const { data: products } = useQuery({ queryKey: ['products'], queryFn: api.getProducts });
    const { data: materials } = useQuery({ queryKey: ['materials'], queryFn: api.getMaterials });
    const queryClient = useQueryClient();
    const { showToast, confirm } = useUI();
    
    const [openStage, setOpenStage] = useState<string | null>(ProductionStage.Waxing);
    const [splitState, setSplitState] = useState<{ batch: ProductionBatch, target: ProductionStage } | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    const enrichedBatches = useMemo(() => {
        const ZIRCON_CODES = ['LE', 'PR', 'AK', 'MP', 'KO', 'MV', 'RZ'];
        return batches?.map(b => {
            const prod = products?.find(p => p.sku === b.sku);
            const suffix = b.variant_suffix || '';
            const hasZircons = ZIRCON_CODES.some(code => suffix.includes(code)) || 
                             prod?.recipe.some(r => r.type === 'raw' && materials?.find(m => m.id === r.id)?.type === MaterialType.Stone && ZIRCON_CODES.some(code => (materials?.find(m => m.id === r.id)?.name || '').includes(code))) || false;
            return { ...b, requires_setting: hasZircons, product_details: prod, product_image: prod?.image_url };
        }) || [];
    }, [batches, products, materials]);

    const getNextStage = (batch: ProductionBatch): ProductionStage | null => {
        const currentIndex = STAGES.findIndex(s => s.id === batch.current_stage);
        if (currentIndex === -1 || currentIndex === STAGES.length - 1) return null;
        let nextIndex = currentIndex + 1;
        if (batch.product_details?.production_type === ProductionType.Imported && batch.current_stage === ProductionStage.AwaitingDelivery) return ProductionStage.Labeling;
        if (STAGES[nextIndex].id === ProductionStage.Setting && !batch.requires_setting) nextIndex++;
        return STAGES[nextIndex].id as ProductionStage;
    };

    const handleConfirmMove = async (qtyToMove: number) => {
        if (!splitState) return;
        setIsProcessing(true);
        try {
            if (qtyToMove >= splitState.batch.quantity) await api.updateBatchStage(splitState.batch.id, splitState.target);
            else {
                const originalNewQty = splitState.batch.quantity - qtyToMove;
                const { id, ...dbBatch } = splitState.batch;
                const newBatchData = { ...dbBatch, quantity: qtyToMove, current_stage: splitState.target, created_at: splitState.batch.created_at, updated_at: new Date().toISOString() };
                // Need cast as any because of enriched field cleanup for API
                const cleanNewData = Object.fromEntries(Object.entries(newBatchData).filter(([k]) => !['product_details','product_image','requires_setting','isDelayed','diffHours'].includes(k)));
                await api.splitBatch(splitState.batch.id, originalNewQty, cleanNewData);
            }
            await queryClient.invalidateQueries({ queryKey: ['batches'] });
            await queryClient.invalidateQueries({ queryKey: ['orders'] });
            showToast("Η παρτίδα μετακινήθηκε.", "success");
            setSplitState(null);
        } catch (e) { showToast("Σφάλμα.", "error"); } finally { setIsProcessing(false); }
    };

    if (isLoading) return <div className="p-8 text-center text-slate-400">Φόρτωση...</div>;

    const activeBatches = enrichedBatches.filter(b => b.current_stage !== ProductionStage.Ready);

    return (
        <div className="p-4 space-y-4 pb-24 h-full flex flex-col">
            <div className="flex justify-between items-center shrink-0">
                <h1 className="text-2xl font-black text-slate-900">Ροή Παραγωγής</h1>
            </div>

            {/* Global Print Actions */}
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide shrink-0">
                <button onClick={() => onPrintPreparation?.(activeBatches)} className="flex items-center gap-1.5 bg-blue-50 text-blue-700 px-4 py-2 rounded-xl text-[10px] font-black uppercase border border-blue-100 shadow-sm"><BookOpen size={14}/> Προετοιμασία</button>
                <button onClick={() => onPrintTechnician?.(activeBatches)} className="flex items-center gap-1.5 bg-purple-50 text-purple-700 px-4 py-2 rounded-xl text-[10px] font-black uppercase border border-purple-100 shadow-sm"><Hammer size={14}/> Τεχνίτης</button>
                <button onClick={() => onPrintAggregated?.(activeBatches)} className="flex items-center gap-1.5 bg-slate-100 text-slate-700 px-4 py-2 rounded-xl text-[10px] font-black uppercase border border-slate-200 shadow-sm"><FileText size={14}/> Συγκεντρ.</button>
            </div>

            <div className="space-y-3 flex-1 overflow-y-auto custom-scrollbar">
                {STAGES.map(stage => {
                    const stageBatches = enrichedBatches.filter(b => b.current_stage === stage.id);
                    const isOpen = openStage === stage.id;
                    const colorClass = STAGE_COLORS[stage.color];
                    return (
                        <div key={stage.id} className={`rounded-2xl border overflow-hidden ${isOpen ? 'bg-white border-slate-300 shadow-md' : 'bg-white border-slate-100 opacity-90'}`}>
                            <div onClick={() => setOpenStage(isOpen ? null : stage.id)} className={`p-4 flex justify-between items-center ${isOpen ? 'bg-slate-50' : ''}`}>
                                <div className="flex items-center gap-3"><div className={`w-3 h-3 rounded-full ${colorClass.split(' ')[0].replace('50', '500')}`} /><span className="font-bold text-sm text-slate-900">{stage.label}</span></div>
                                <div className="flex items-center gap-2"><span className={`px-2 py-0.5 rounded-md text-xs font-black ${stageBatches.length > 0 ? colorClass : 'bg-slate-100 text-slate-400'}`}>{stageBatches.length}</span>{isOpen ? <ChevronUp size={18} className="text-slate-400"/> : <ChevronDown size={18} className="text-slate-400"/>}</div>
                            </div>
                            {isOpen && (
                                <div className="p-3 space-y-3 bg-slate-50/50 border-t border-slate-100">
                                    {stageBatches.map(batch => (
                                        <div key={batch.id} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                                            <div className="flex justify-between items-start">
                                                <div className="flex gap-3">
                                                    <div className="w-10 h-10 bg-slate-100 rounded-lg overflow-hidden border border-slate-200 shrink-0">{batch.product_image ? <img src={batch.product_image} className="w-full h-full object-cover"/> : <ImageIcon size={16} className="m-auto text-slate-300"/>}</div>
                                                    <div><div className="font-black text-slate-800 text-sm">{batch.sku}{batch.variant_suffix}</div><div className="text-[10px] font-bold text-slate-400">Ποσ: {batch.quantity}</div></div>
                                                </div>
                                                <button onClick={() => onPrintBatch?.(batch)} className="p-2 bg-slate-50 text-slate-400 rounded-lg"><Printer size={16}/></button>
                                            </div>
                                            <div className="flex justify-between items-center mt-3 pt-2 border-t border-slate-50">
                                                <div className="text-[10px] font-bold text-slate-400 flex items-center gap-1"><Clock size={12}/> {new Date(batch.updated_at).toLocaleDateString('el-GR', {day:'2-digit', month:'2-digit'})}</div>
                                                {getNextStage(batch) && <button onClick={() => setSplitState({ batch, target: getNextStage(batch)! })} className="bg-emerald-500 active:bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-black flex items-center gap-1 active:scale-95">Επόμενο <MoveRight size={12}/></button>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {splitState && <SplitModal batch={splitState.batch} targetStage={splitState.target} onClose={() => setSplitState(null)} onConfirm={handleConfirmMove} isProcessing={isProcessing} />}
        </div>
    );
}
