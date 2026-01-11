
import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/supabase';
import { ProductionBatch, ProductionStage } from '../../types';
import { 
    Clock, 
    CheckCircle, 
    Factory, 
    MoveRight, 
    Loader2, 
    Hammer, 
    Tag, 
    Package 
} from 'lucide-react';
import { useUI } from '../UIProvider';

const ClerkBatchCard: React.FC<{ batch: ProductionBatch, onMove: (b: ProductionBatch, target: ProductionStage) => void, isLoading: boolean }> = ({ batch, onMove, isLoading }) => {
    // Determine possible actions based on current stage
    let nextAction = null;
    let buttonLabel = '';
    
    // Store clerks only care about Labeling -> Ready workflow usually
    // Or potentially receiving from Polishing if they do the packaging
    if (batch.current_stage === ProductionStage.Polishing) {
        nextAction = ProductionStage.Labeling;
        buttonLabel = 'Παραλαβή για Συσκευασία';
    } else if (batch.current_stage === ProductionStage.Labeling) {
        nextAction = ProductionStage.Ready;
        buttonLabel = 'Έτοιμο για Παράδοση';
    }

    return (
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-3">
            <div className="flex justify-between items-start">
                <div>
                    <div className="font-black text-slate-800 text-lg">{batch.sku}{batch.variant_suffix}</div>
                    <div className="text-xs text-slate-500 font-bold bg-slate-100 px-2 py-0.5 rounded w-fit mt-1">
                        {batch.quantity} τεμάχια
                    </div>
                </div>
                {batch.order_id && (
                    <div className="text-[10px] font-mono text-slate-400">Order #{batch.order_id.slice(0,6)}</div>
                )}
            </div>
            
            <div className="flex justify-between items-center pt-3 border-t border-slate-50 mt-auto">
                <div className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                    <Clock size={12}/> {new Date(batch.updated_at).toLocaleDateString('el-GR')}
                </div>
                
                {nextAction && (
                    <button 
                        onClick={() => onMove(batch, nextAction!)}
                        disabled={isLoading}
                        className="bg-emerald-600 text-white px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-2 shadow-md active:scale-95 transition-all hover:bg-emerald-700 disabled:opacity-50"
                    >
                        {isLoading ? <Loader2 size={14} className="animate-spin"/> : <MoveRight size={14}/>}
                        {buttonLabel}
                    </button>
                )}
            </div>
        </div>
    );
};

export default function EmployeeProduction() {
    const { data: batches, isLoading } = useQuery({ queryKey: ['batches'], queryFn: api.getProductionBatches });
    const queryClient = useQueryClient();
    const { showToast } = useUI();
    const [processingId, setProcessingId] = React.useState<string | null>(null);

    const handleMoveStage = async (batch: ProductionBatch, targetStage: ProductionStage) => {
        setProcessingId(batch.id);
        try {
            await api.updateBatchStage(batch.id, targetStage);
            // Refresh logic
            await queryClient.invalidateQueries({ queryKey: ['batches'] });
            await queryClient.invalidateQueries({ queryKey: ['orders'] });
            showToast("Η κατάσταση ενημερώθηκε.", "success");
        } catch (e) {
            showToast("Σφάλμα ενημέρωσης.", "error");
        } finally {
            setProcessingId(null);
        }
    };

    if (isLoading) return <div className="flex justify-center p-10"><Loader2 className="animate-spin text-slate-400"/></div>;

    // Filter batches relevant to the store clerk
    // 1. Coming from Polishing (Arriving at store/packaging)
    // 2. Currently in Labeling (Being packaged)
    const arrivingBatches = batches?.filter(b => b.current_stage === ProductionStage.Polishing) || [];
    const packagingBatches = batches?.filter(b => b.current_stage === ProductionStage.Labeling) || [];
    const readyBatches = batches?.filter(b => b.current_stage === ProductionStage.Ready) || [];

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-black text-slate-800 flex items-center gap-3">
                <Factory className="text-emerald-600"/> Ροή Παραγωγής Καταστήματος
            </h1>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* COLUMN 1: ARRIVING (From Technician) */}
                <div className="bg-blue-50/50 rounded-2xl p-4 border border-blue-100">
                    <h3 className="font-bold text-blue-800 mb-4 flex items-center gap-2 uppercase text-xs tracking-wide">
                        <Hammer size={16}/> Αναμονη απο Τεχνιτη
                        <span className="bg-white px-2 py-0.5 rounded-full shadow-sm text-blue-600">{arrivingBatches.length}</span>
                    </h3>
                    <div className="space-y-3">
                        {arrivingBatches.map(b => (
                            <ClerkBatchCard 
                                key={b.id} 
                                batch={b} 
                                onMove={handleMoveStage} 
                                isLoading={processingId === b.id} 
                            />
                        ))}
                        {arrivingBatches.length === 0 && <div className="text-center py-10 text-blue-300 text-sm italic">Κανένα προϊόν σε αναμονή.</div>}
                    </div>
                </div>

                {/* COLUMN 2: IN PACKAGING (Labeling) */}
                <div className="bg-amber-50/50 rounded-2xl p-4 border border-amber-100">
                    <h3 className="font-bold text-amber-800 mb-4 flex items-center gap-2 uppercase text-xs tracking-wide">
                        <Tag size={16}/> Συσκευασια & Barcode
                        <span className="bg-white px-2 py-0.5 rounded-full shadow-sm text-amber-600">{packagingBatches.length}</span>
                    </h3>
                    <div className="space-y-3">
                        {packagingBatches.map(b => (
                            <ClerkBatchCard 
                                key={b.id} 
                                batch={b} 
                                onMove={handleMoveStage} 
                                isLoading={processingId === b.id} 
                            />
                        ))}
                        {packagingBatches.length === 0 && <div className="text-center py-10 text-amber-300 text-sm italic">Κανένα προϊόν στη συσκευασία.</div>}
                    </div>
                </div>

                {/* COLUMN 3: READY */}
                <div className="bg-emerald-50/50 rounded-2xl p-4 border border-emerald-100 opacity-80 hover:opacity-100 transition-opacity">
                    <h3 className="font-bold text-emerald-800 mb-4 flex items-center gap-2 uppercase text-xs tracking-wide">
                        <CheckCircle size={16}/> Ετοιμα για Παραδοση
                        <span className="bg-white px-2 py-0.5 rounded-full shadow-sm text-emerald-600">{readyBatches.length}</span>
                    </h3>
                    <div className="space-y-3">
                        {readyBatches.slice(0, 10).map(b => ( // Limit shown ready batches
                            <div key={b.id} className="bg-white p-3 rounded-xl border border-emerald-100 opacity-60">
                                <div className="font-bold text-slate-700">{b.sku}</div>
                                <div className="text-xs text-emerald-600 font-medium">Ολοκληρώθηκε</div>
                            </div>
                        ))}
                        {readyBatches.length > 10 && <div className="text-center text-xs text-slate-400">...και {readyBatches.length - 10} ακόμη</div>}
                    </div>
                </div>

            </div>
        </div>
    );
}
