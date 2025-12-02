






import React, { useMemo, useState } from 'react';
// FIX: Import Material type
import { ProductionBatch, ProductionStage, Product, Material, MaterialType } from '../types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/supabase';
import { Factory, Flame, Gem, Hammer, Tag, Package, ChevronRight, Clock, Siren, CheckCircle, ImageIcon } from 'lucide-react';
import { useUI } from './UIProvider';

interface Props {
  products: Product[];
  materials: Material[]; // materials are needed to determine if a product has stones
}

const STAGES = [
    { id: ProductionStage.Waxing, label: 'Λάστιχα / Κεριά', icon: <Package size={20} />, color: 'slate' },
    { id: ProductionStage.Casting, label: 'Χυτήριο', icon: <Flame size={20} />, color: 'orange' },
    { id: ProductionStage.Setting, label: 'Καρφωτής', icon: <Gem size={20} />, color: 'purple' },
    { id: ProductionStage.Polishing, label: 'Τεχνίτης', icon: <Hammer size={20} />, color: 'blue' },
    { id: ProductionStage.Labeling, label: 'Καρτελάκια', icon: <Tag size={20} />, color: 'yellow' },
    { id: ProductionStage.Ready, label: 'Έτοιμα', icon: <CheckCircle size={20} />, color: 'emerald' }
];

const STAGE_LIMITS_HOURS: Record<string, number> = {
    [ProductionStage.Waxing]: 48,
    [ProductionStage.Casting]: 24,
    [ProductionStage.Setting]: 72,
    [ProductionStage.Polishing]: 48,
    [ProductionStage.Labeling]: 24
};

const STAGE_COLORS = {
    slate: { bg: 'bg-slate-50', text: 'text-slate-500', border: 'border-slate-200' },
    orange: { bg: 'bg-orange-50', text: 'text-orange-500', border: 'border-orange-200' },
    purple: { bg: 'bg-purple-50', text: 'text-purple-500', border: 'border-purple-200' },
    blue: { bg: 'bg-blue-50', text: 'text-blue-500', border: 'border-blue-200' },
    yellow: { bg: 'bg-yellow-50', text: 'text-yellow-500', border: 'border-yellow-200' },
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-500', border: 'border-emerald-200' },
};

// FIX: Changed component definition to use React.FC and a props interface
// to correctly type it and resolve the issue with the 'key' prop.
interface BatchCardProps {
    batch: ProductionBatch;
    onDragStart: (e: React.DragEvent<HTMLDivElement>, batchId: string) => void;
}

const BatchCard: React.FC<BatchCardProps> = ({ batch, onDragStart }) => (
    <div 
        draggable 
        onDragStart={(e) => onDragStart(e, batch.id)}
        className={`bg-white p-4 rounded-2xl shadow-sm border hover:shadow-lg transition-all relative flex flex-col cursor-grab active:cursor-grabbing
                    ${batch.isDelayed ? 'border-red-300 ring-1 ring-red-100' : 'border-slate-100'}`}
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
                ) : (
                    <div className="w-full h-full bg-slate-100 flex items-center justify-center">
                        <ImageIcon size={20} className="text-slate-300"/>
                    </div>
                )}
            </div>
            <div className="min-w-0">
                <div className="font-black text-slate-800 text-lg leading-tight truncate">{batch.sku}</div>
                {batch.variant_suffix && <div className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded w-fit mt-1 border border-amber-100">{batch.variant_suffix}</div>}
                <div className="text-sm font-bold text-slate-500 mt-1">{batch.quantity} τεμ.</div>
            </div>
        </div>

        <div className="mt-auto pt-3 border-t border-slate-50">
            {batch.order_id ? (
                <div className="text-[10px] font-mono text-slate-400 bg-slate-50 px-2 py-1 rounded w-fit">{batch.order_id}</div>
            ) : <div/>}
        </div>
    </div>
);

export default function ProductionPage({ products, materials }: Props) {
  const queryClient = useQueryClient();
  const { showToast } = useUI();
  const { data: batches, isLoading } = useQuery({ queryKey: ['batches'], queryFn: api.getProductionBatches });
  
  const [draggedBatchId, setDraggedBatchId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<ProductionStage | null>(null);

  // FIX: Explicitly type enhancedBatches to avoid type inference issues with the 'key' prop.
  const enhancedBatches: ProductionBatch[] = useMemo(() => {
    return batches?.map(b => {
      const prod = products.find(p => p.sku === b.sku);
      const lastUpdate = new Date(b.updated_at);
      const now = new Date();
      const diffHours = Math.floor((now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60));
      const threshold = STAGE_LIMITS_HOURS[b.current_stage] || Infinity;
      const isDelayed = b.current_stage !== ProductionStage.Ready && diffHours > threshold;
      
      const hasStones = prod?.recipe.some(r => {
          if (r.type !== 'raw') return false;
          const material = materials.find(m => m.id === r.id);
          return material?.type === MaterialType.Stone;
      }) || false;

      return { ...b, product_image: prod?.image_url, diffHours, isDelayed, requires_setting: hasStones };
    }) || [];
  }, [batches, products, materials]);

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, batchId: string) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', batchId);
      setDraggedBatchId(batchId);
  };
  
  const handleDragEnd = () => {
      setDraggedBatchId(null);
      setDropTarget(null);
  };

  const handleDrop = async (targetStage: ProductionStage) => {
      if (!draggedBatchId) return;
      
      const batch = enhancedBatches.find(b => b.id === draggedBatchId);
      if (!batch || batch.current_stage === targetStage) return;

      // SMART SKIP LOGIC
      if (batch.current_stage === ProductionStage.Casting && targetStage === ProductionStage.Setting && !batch.requires_setting) {
          showToast(`Το ${batch.sku} δεν έχει πέτρες. Προχωρήστε στο επόμενο στάδιο.`, 'info');
          return;
      }
      
      // OPTIONAL: Auto-advance if skipping
      if (batch.current_stage === ProductionStage.Casting && targetStage === ProductionStage.Polishing && !batch.requires_setting) {
          // This is a valid skip, proceed
      }

      try {
          await api.updateBatchStage(batch.id, targetStage);
          queryClient.invalidateQueries({ queryKey: ['batches'] });
          queryClient.invalidateQueries({ queryKey: ['orders'] });
      } catch (e: any) {
          showToast(`Σφάλμα: ${e.message}`, 'error');
      }
  };

  if (isLoading) return <div className="p-12 text-center text-slate-400">Φόρτωση παραγωγής...</div>;

  return (
    <div className="h-[calc(100vh-100px)] flex flex-col space-y-6">
        <div className="shrink-0 bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
            <h1 className="text-3xl font-bold text-[#060b00] tracking-tight flex items-center gap-3">
                <div className="p-2 bg-[#060b00] text-white rounded-xl">
                    <Factory size={24} />
                </div>
                Ροή Παραγωγής (Kanban)
            </h1>
            <p className="text-slate-500 mt-1 ml-14">Drag & drop τις παρτίδες για να αλλάξετε το στάδιό τους.</p>
        </div>

        <div className="flex-1 overflow-x-auto overflow-y-hidden pb-4">
            <div className="flex gap-6 h-full min-w-max">
                {STAGES.map(stage => {
                    const stageBatches = enhancedBatches.filter(b => b.current_stage === stage.id);
                    const colors = STAGE_COLORS[stage.color as keyof typeof STAGE_COLORS];
                    const isTarget = dropTarget === stage.id;
                    
                    return (
                        <div 
                            key={stage.id}
                            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDropTarget(stage.id); }}
                            onDragLeave={() => setDropTarget(null)}
                            onDrop={() => handleDrop(stage.id)}
                            className={`w-80 h-full flex flex-col rounded-3xl border transition-all duration-300 ${isTarget ? 'bg-emerald-50 border-emerald-300 shadow-2xl' : `${colors.bg} border-slate-200`}`}
                        >
                            <div className={`p-5 rounded-t-3xl border-b ${colors.border} flex justify-between items-center shrink-0`}>
                                <div className="flex items-center gap-3">
                                    <div className={`p-1.5 rounded-md ${colors.bg}`}>{stage.icon}</div>
                                    <h3 className={`font-bold ${colors.text}`}>{stage.label}</h3>
                                </div>
                                <span className={`px-2 py-0.5 rounded-md text-xs font-bold ${colors.text} ${colors.bg}`}>{stageBatches.length}</span>
                            </div>
                            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                                {stageBatches.map(batch => (
                                    <BatchCard key={batch.id} batch={batch} onDragStart={handleDragStart} />
                                ))}
                                {stageBatches.length === 0 && (
                                    <div className="h-full flex flex-col items-center justify-center text-slate-300 p-4">
                                        <Package size={32} className="mb-2"/>
                                        <p className="text-xs font-medium text-center">Κανένα στοιχείο</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    </div>
  );
}