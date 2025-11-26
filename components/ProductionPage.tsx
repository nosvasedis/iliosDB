
import React from 'react';
import { ProductionBatch, ProductionStage, Product, Material, MaterialType } from '../types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/supabase';
import { Factory, Flame, Gem, Hammer, Tag, Package, ChevronRight, AlertCircle } from 'lucide-react';
import { useUI } from './UIProvider';

interface Props {
  products: Product[];
  materials: Material[];
}

const STAGES = [
    { id: ProductionStage.Waxing, label: 'Λάστιχα / Κεριά', icon: <Package size={18} />, color: 'bg-slate-100 border-slate-200 text-slate-600' },
    { id: ProductionStage.Casting, label: 'Χυτήριο', icon: <Flame size={18} />, color: 'bg-orange-50 border-orange-200 text-orange-700' },
    { id: ProductionStage.Setting, label: 'Καρφωτής', icon: <Gem size={18} />, color: 'bg-purple-50 border-purple-200 text-purple-700' },
    { id: ProductionStage.Polishing, label: 'Τεχνίτης', icon: <Hammer size={18} />, color: 'bg-blue-50 border-blue-200 text-blue-700' },
    { id: ProductionStage.Labeling, label: 'Καρτελάκια', icon: <Tag size={18} />, color: 'bg-yellow-50 border-yellow-200 text-yellow-700' },
    { id: ProductionStage.Ready, label: 'Έτοιμα', icon: <Package size={18} />, color: 'bg-emerald-50 border-emerald-200 text-emerald-700' }
];

export default function ProductionPage({ products, materials }: Props) {
  const queryClient = useQueryClient();
  const { showToast } = useUI();
  const { data: batches, isLoading } = useQuery({ queryKey: ['batches'], queryFn: api.getProductionBatches });

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

  // Enhance batches with image/details from products prop
  const enhancedBatches = batches?.map(b => {
      const prod = products.find(p => p.sku === b.sku);
      return {
          ...b,
          product_image: prod?.image_url,
          requires_setting: prod?.recipe.some(r => r.type === 'raw' && r.itemDetails?.type === MaterialType.Stone)
      };
  });

  if (isLoading) return <div className="p-12 text-center text-slate-400">Φόρτωση παραγωγής...</div>;

  return (
    <div className="h-[calc(100vh-100px)] flex flex-col space-y-6">
        <div className="flex justify-between items-center shrink-0 bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
            <div>
                 <h1 className="text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-3">
                    <div className="p-2 bg-slate-800 text-white rounded-xl">
                        <Factory size={24} />
                    </div>
                    Ροή Παραγωγής
                </h1>
                <p className="text-slate-500 mt-1 ml-14">Παρακολούθηση σταδίων κατασκευής.</p>
            </div>
            <div className="flex gap-2 text-sm text-slate-500 font-medium bg-slate-50 px-4 py-2 rounded-xl">
                <span>Σύνολο: {batches?.length} παρτίδες</span>
            </div>
        </div>

        <div className="flex-1 overflow-x-auto overflow-y-hidden pb-4">
            <div className="flex gap-4 h-full min-w-[1200px]">
                {STAGES.map(stage => (
                    <div key={stage.id} className="flex-1 flex flex-col min-w-[280px] h-full">
                        {/* Column Header */}
                        <div className={`p-4 rounded-t-2xl border-b-0 border ${stage.color} flex items-center justify-between shadow-sm z-10 relative`}>
                            <div className="flex items-center gap-2 font-bold">
                                {stage.icon}
                                {stage.label}
                            </div>
                            <span className="bg-white/50 px-2 py-0.5 rounded text-xs font-black">
                                {batches?.filter(b => b.current_stage === stage.id).length}
                            </span>
                        </div>
                        
                        {/* Column Body */}
                        <div className="bg-slate-50/50 border-x border-b border-slate-200 rounded-b-2xl p-3 flex-1 overflow-y-auto space-y-3 custom-scrollbar">
                            {enhancedBatches?.filter(b => b.current_stage === stage.id).map(batch => (
                                <div key={batch.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 group hover:shadow-md transition-all">
                                    <div className="flex gap-3 mb-3">
                                        <div className="w-12 h-12 bg-slate-100 rounded-lg overflow-hidden shrink-0 border border-slate-200">
                                            {batch.product_image ? (
                                                <img src={batch.product_image} className="w-full h-full object-cover" alt="prod"/>
                                            ) : <div className="w-full h-full flex items-center justify-center text-slate-300"><Package size={16}/></div>}
                                        </div>
                                        <div>
                                            <div className="font-bold text-slate-800 leading-tight">{batch.sku}</div>
                                            {batch.variant_suffix && <div className="text-xs text-amber-600 font-bold bg-amber-50 px-1 rounded w-fit mt-0.5">{batch.variant_suffix}</div>}
                                            <div className="text-xs text-slate-500 mt-1">{batch.quantity} τεμ.</div>
                                        </div>
                                    </div>
                                    
                                    {batch.order_id && (
                                        <div className="mb-3">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Order</span>
                                            <div className="text-xs font-mono bg-slate-50 p-1 rounded text-slate-600 border border-slate-100">{batch.order_id}</div>
                                        </div>
                                    )}

                                    {/* Action Footer */}
                                    <div className="pt-3 border-t border-slate-50 flex justify-between items-center">
                                        {batch.requires_setting && stage.id === ProductionStage.Casting && (
                                             <div className="text-[10px] flex items-center gap-1 text-purple-600 font-bold bg-purple-50 px-2 py-1 rounded-full"><Gem size={10}/> Stones</div>
                                        )}
                                        
                                        {stage.id !== ProductionStage.Ready && (
                                            <button 
                                                onClick={() => advanceBatch(batch)}
                                                className="ml-auto flex items-center gap-1 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 px-3 py-1.5 rounded-lg transition-all shadow-md shadow-slate-200 active:scale-95"
                                            >
                                                Next <ChevronRight size={12}/>
                                            </button>
                                        )}
                                        {stage.id === ProductionStage.Ready && (
                                            <div className="w-full text-center text-xs font-bold text-emerald-600 flex items-center justify-center gap-1 bg-emerald-50 py-1.5 rounded-lg border border-emerald-100">
                                                <AlertCircle size={12}/> Complete
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {batches?.filter(b => b.current_stage === stage.id).length === 0 && (
                                <div className="h-32 flex items-center justify-center text-slate-300 text-sm border-2 border-dashed border-slate-200 rounded-xl">
                                    Empty
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    </div>
  );
}
