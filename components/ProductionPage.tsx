
import React, { useMemo, useState } from 'react';
import { ProductionBatch, ProductionStage, Product, Material, MaterialType } from '../types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/supabase';
import { Factory, Flame, Gem, Hammer, Tag, Package, ChevronRight, AlertCircle, Clock, Siren, CheckCircle, ListFilter } from 'lucide-react';
import { useUI } from './UIProvider';

interface Props {
  products: Product[];
  materials: Material[];
}

const STAGES = [
    { id: ProductionStage.Waxing, label: 'Λάστιχα / Κεριά', icon: <Package size={18} />, color: 'bg-slate-100 border-slate-200 text-slate-600', activeColor: 'bg-slate-900 text-white' },
    { id: ProductionStage.Casting, label: 'Χυτήριο', icon: <Flame size={18} />, color: 'bg-orange-50 border-orange-200 text-orange-700', activeColor: 'bg-orange-600 text-white' },
    { id: ProductionStage.Setting, label: 'Καρφωτής', icon: <Gem size={18} />, color: 'bg-purple-50 border-purple-200 text-purple-700', activeColor: 'bg-purple-600 text-white' },
    { id: ProductionStage.Polishing, label: 'Τεχνίτης', icon: <Hammer size={18} />, color: 'bg-blue-50 border-blue-200 text-blue-700', activeColor: 'bg-blue-600 text-white' },
    { id: ProductionStage.Labeling, label: 'Καρτελάκια', icon: <Tag size={18} />, color: 'bg-yellow-50 border-yellow-200 text-yellow-700', activeColor: 'bg-yellow-600 text-white' },
    { id: ProductionStage.Ready, label: 'Έτοιμα', icon: <CheckCircle size={18} />, color: 'bg-emerald-50 border-emerald-200 text-emerald-700', activeColor: 'bg-emerald-600 text-white' }
];

// SLA Thresholds in Hours (Logic for "Stuck" batches)
const STAGE_LIMITS_HOURS: Record<string, number> = {
    [ProductionStage.Waxing]: 48,
    [ProductionStage.Casting]: 24,
    [ProductionStage.Setting]: 72,
    [ProductionStage.Polishing]: 48,
    [ProductionStage.Labeling]: 24
};

export default function ProductionPage({ products, materials }: Props) {
  const queryClient = useQueryClient();
  const { showToast } = useUI();
  const { data: batches, isLoading } = useQuery({ queryKey: ['batches'], queryFn: api.getProductionBatches });

  // State for Tabs
  const [activeStage, setActiveStage] = useState<ProductionStage | 'ALL'>(ProductionStage.Waxing);

  const getNextStage = (batch: ProductionBatch): ProductionStage | null => {
      const currentIdx = STAGES.findIndex(s => s.id === batch.current_stage);
      if (currentIdx === -1 || currentIdx === STAGES.length - 1) return null;

      // Smart Workflow Logic
      // If next is Setting, but product doesn't require setting, skip to Polishing
      const nextStage = STAGES[currentIdx + 1].id;
      
      if (nextStage === ProductionStage.Setting && !batch.requires_setting) {
          return ProductionStage.Polishing;
      }
      
      return nextStage as ProductionStage;
  };

  const advanceBatch = async (batch: ProductionBatch) => {
      const next = getNextStage(batch);
      if (next) {
          await api.updateBatchStage(batch.id, next);
          queryClient.invalidateQueries({ queryKey: ['batches'] });
          queryClient.invalidateQueries({ queryKey: ['orders'] }); // Status might change
          showToast(`Προωθήθηκε σε ${next}`, 'success');
      }
  };

  // Enhance batches with image/details from products prop AND calculate Delays
  const enhancedBatches = useMemo(() => {
      return batches?.map(b => {
        const prod = products.find(p => p.sku === b.sku);
        const lastUpdate = new Date(b.updated_at);
        const now = new Date();
        const diffHours = Math.floor((now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60));
        
        const threshold = STAGE_LIMITS_HOURS[b.current_stage] || 1000; // default large number if ready
        const isDelayed = b.current_stage !== ProductionStage.Ready && diffHours > threshold;

        return {
            ...b,
            product_image: prod?.image_url,
            requires_setting: prod?.recipe.some(r => r.type === 'raw' && r.itemDetails?.type === MaterialType.Stone),
            diffHours,
            isDelayed
        };
      }) || [];
  }, [batches, products]);

  const delayedBatches = enhancedBatches.filter(b => b.isDelayed);
  
  const displayedBatches = useMemo(() => {
      if (activeStage === 'ALL') return enhancedBatches;
      return enhancedBatches.filter(b => b.current_stage === activeStage);
  }, [enhancedBatches, activeStage]);

  if (isLoading) return <div className="p-12 text-center text-slate-400">Φόρτωση παραγωγής...</div>;

  return (
    <div className="h-[calc(100vh-100px)] flex flex-col space-y-6">
        {/* Header & Alerts */}
        <div className="space-y-4 shrink-0">
            <div className="flex justify-between items-center bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                <div>
                    <h1 className="text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-3">
                        <div className="p-2 bg-slate-800 text-white rounded-xl">
                            <Factory size={24} />
                        </div>
                        Ροή Παραγωγής
                    </h1>
                    <p className="text-slate-500 mt-1 ml-14">Παρακολούθηση σταδίων κατασκευής.</p>
                </div>
                
                {delayedBatches.length > 0 && (
                    <div className="bg-red-50 border border-red-100 px-4 py-2 rounded-xl flex items-center gap-3 animate-pulse">
                         <div className="bg-red-500 text-white p-1.5 rounded-full"><Siren size={16}/></div>
                         <div>
                             <span className="text-xs font-bold text-red-800 uppercase block">Καθυστερησεις</span>
                             <span className="font-bold text-red-600">{delayedBatches.length} παρτίδες</span>
                         </div>
                    </div>
                )}
            </div>
            
            {/* TABS NAVIGATION */}
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                 <button 
                    onClick={() => setActiveStage('ALL')}
                    className={`flex items-center gap-2 px-4 py-3 rounded-xl font-bold text-sm whitespace-nowrap transition-all ${activeStage === 'ALL' ? 'bg-slate-800 text-white shadow-lg' : 'bg-white text-slate-500 hover:bg-slate-50 border border-slate-100'}`}
                 >
                    <ListFilter size={16}/> Όλα
                 </button>
                 <div className="w-px bg-slate-200 mx-2 h-8 my-auto"></div>
                 {STAGES.map(stage => (
                     <button
                        key={stage.id}
                        onClick={() => setActiveStage(stage.id)}
                        className={`flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm whitespace-nowrap transition-all ${activeStage === stage.id ? stage.activeColor + ' shadow-lg transform scale-105' : 'bg-white text-slate-500 hover:bg-slate-50 border border-slate-100'}`}
                     >
                         {stage.icon}
                         {stage.label}
                         <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] ${activeStage === stage.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
                             {batches?.filter(b => b.current_stage === stage.id).length}
                         </span>
                     </button>
                 ))}
            </div>
        </div>

        {/* BATCH GRID (SLIM TICKETS) */}
        <div className="flex-1 overflow-y-auto bg-slate-50/50 rounded-3xl border border-slate-200 p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {displayedBatches.map(batch => (
                     <div 
                        key={batch.id} 
                        className={`
                            bg-white p-4 rounded-2xl shadow-sm border hover:shadow-lg transition-all relative flex flex-col
                            ${batch.isDelayed ? 'border-red-300 ring-1 ring-red-100' : 'border-slate-100'}
                        `}
                    >
                        {batch.isDelayed && (
                            <div className="absolute top-3 right-3 text-red-500 flex items-center gap-1 text-[10px] font-bold bg-red-50 px-2 py-1 rounded-full border border-red-100">
                                <Clock size={12} /> +{batch.diffHours}h
                            </div>
                        )}
                        
                        <div className="flex gap-4 items-start mb-3">
                            <div className="w-14 h-14 bg-slate-50 rounded-xl overflow-hidden shrink-0 border border-slate-100">
                                {batch.product_image ? (
                                    <img src={batch.product_image} className="w-full h-full object-cover" alt="prod"/>
                                ) : <div className="w-full h-full flex items-center justify-center text-slate-300"><Package size={20}/></div>}
                            </div>
                            <div className="min-w-0">
                                <div className="font-black text-slate-800 text-lg leading-none truncate">{batch.sku}</div>
                                {batch.variant_suffix && <div className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded w-fit mt-1">{batch.variant_suffix}</div>}
                                <div className="text-xs font-bold text-slate-400 mt-1">{batch.quantity} τεμ.</div>
                            </div>
                        </div>

                        {/* Order & Stage Info */}
                        <div className="flex items-center justify-between mt-auto pt-3 border-t border-slate-50">
                             {batch.order_id ? (
                                 <div className="text-[10px] font-mono text-slate-400 bg-slate-50 px-2 py-1 rounded">{batch.order_id}</div>
                             ) : <span></span>}

                             {/* Contextual Action Button */}
                             {batch.current_stage !== ProductionStage.Ready ? (
                                 <button 
                                    onClick={() => advanceBatch(batch)}
                                    className="flex items-center gap-1 text-xs font-bold bg-slate-900 text-white hover:bg-slate-700 px-3 py-1.5 rounded-lg transition-colors shadow-sm"
                                 >
                                     Επόμενο <ChevronRight size={12}/>
                                 </button>
                             ) : (
                                <div className="flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100">
                                    <CheckCircle size={12}/> Ολοκλήρωση
                                </div>
                             )}
                        </div>
                    </div>
                ))}
            </div>
            {displayedBatches.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-slate-300">
                    <Package size={64} className="mb-4 opacity-20"/>
                    <p className="font-medium text-lg">Κανένα στοιχείο σε αυτό το στάδιο.</p>
                </div>
            )}
        </div>
    </div>
  );
}