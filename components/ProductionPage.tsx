import React, { useMemo, useState } from 'react';
import { ProductionBatch, ProductionStage, Product, Material, MaterialType, Mold } from '../types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/supabase';
import { Factory, Flame, Gem, Hammer, Tag, Package, ChevronRight, Clock, Siren, CheckCircle, ImageIcon, Printer, FileText, Layers, ChevronDown, RefreshCcw } from 'lucide-react';
import { useUI } from './UIProvider';

interface Props {
  products: Product[];
  materials: Material[];
  molds: Mold[];
  onPrintBatch: (batch: ProductionBatch) => void;
  onPrintAggregated: (batches: ProductionBatch[]) => void;
}

const STAGES = [
    { id: ProductionStage.Waxing, label: 'Λάστιχα / Κεριά', icon: <Package size={20} />, color: 'slate' },
    { id: ProductionStage.Casting, label: 'Χυτήριο', icon: <Flame size={20} />, color: 'orange' },
    { id: ProductionStage.Setting, label: 'Καρφωτής', icon: <Gem size={20} />, color: 'purple' },
    { id: ProductionStage.Polishing, label: 'Τεχνίτης', icon: <Hammer size={20} />, color: 'blue' },
    { id: ProductionStage.Labeling, label: 'Καρτελάκια - Πακετάρισμα', icon: <Tag size={20} />, color: 'yellow' },
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

interface BatchCardProps {
    batch: ProductionBatch;
    onDragStart: (e: React.DragEvent<HTMLDivElement>, batchId: string) => void;
    onPrint: (batch: ProductionBatch) => void;
}

const BatchCard: React.FC<BatchCardProps> = ({ batch, onDragStart, onPrint }) => {
    const isRefurbish = batch.type === 'Refurbish';
    
    return (
    <div 
        draggable 
        onDragStart={(e) => onDragStart(e, batch.id)}
        className={`bg-white p-4 rounded-2xl shadow-sm border hover:shadow-lg transition-all relative flex flex-col cursor-grab active:cursor-grabbing group
                    ${batch.isDelayed ? 'border-red-300 ring-1 ring-red-100' : (isRefurbish ? 'border-blue-300 ring-1 ring-blue-100' : 'border-slate-100')}`}
    >
        <div className="absolute top-3 right-3 flex items-center gap-2">
            {batch.isDelayed && (
                <div className="text-red-500 flex items-center gap-1 text-[10px] font-bold bg-red-50 px-2 py-1 rounded-full border border-red-100">
                    <Clock size={12} /> +{batch.diffHours}h
                </div>
            )}
            <button
                onClick={() => onPrint(batch)}
                className="p-1.5 bg-white/50 backdrop-blur-sm text-slate-400 rounded-full border border-slate-200 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity hover:bg-slate-100 hover:text-slate-700"
                title="Εκτύπωση Εντολής Παραγωγής"
            >
                <Printer size={14} />
            </button>
        </div>
        
        {isRefurbish && (
            <div className="absolute -top-2 left-3 bg-blue-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
                <RefreshCcw size={10}/> Φρεσκάρισμα
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

        <div className="mt-auto pt-3 border-t border-slate-50 flex justify-between items-end">
            {batch.order_id ? (
                <div className="text-[10px] font-mono text-slate-400 bg-slate-50 px-2 py-1 rounded w-fit">{batch.order_id}</div>
            ) : <div/>}
        </div>
    </div>
    );
};

const OrderGroupCard: React.FC<{ 
    orderId: string, 
    batches: ProductionBatch[], 
    onDragStart: (e: React.DragEvent<HTMLDivElement>, batchId: string) => void, 
    onPrint: (batch: ProductionBatch) => void
}> = ({ orderId, batches, onDragStart, onPrint }) => {
    const [expanded, setExpanded] = useState(false);
    const totalQty = batches.reduce((acc, b) => acc + b.quantity, 0);
    const hasRefurbish = batches.some(b => b.type === 'Refurbish');

    return (
        <div className={`bg-white rounded-2xl shadow-sm border transition-all ${expanded ? 'ring-2 ring-slate-200' : 'border-slate-200 hover:shadow-md'}`}>
            <div 
                className="p-4 cursor-pointer flex justify-between items-center"
                onClick={() => setExpanded(!expanded)}
            >
                <div>
                    <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-slate-600 text-xs">#{orderId}</span>
                        {hasRefurbish && <span className="w-2 h-2 rounded-full bg-blue-500" title="Περιέχει Φρεσκάρισμα"></span>}
                    </div>
                    <div className="font-black text-slate-800 text-sm mt-1">{totalQty} τεμ. <span className="text-slate-400 font-normal">({batches.length} παρτίδες)</span></div>
                </div>
                <div className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>
                    <ChevronDown size={16} className="text-slate-400"/>
                </div>
            </div>
            
            {expanded && (
                <div className="p-3 pt-0 space-y-3 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl">
                    {batches.map(batch => (
                        <div key={batch.id} className="scale-95 origin-top">
                            <BatchCard batch={batch} onDragStart={onDragStart} onPrint={onPrint} />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default function ProductionPage({ products, materials, molds, onPrintBatch, onPrintAggregated }: Props) {
  const queryClient = useQueryClient();
  const { showToast } = useUI();
  const { data: batches, isLoading } = useQuery({ queryKey: ['batches'], queryFn: api.getProductionBatches });
  
  const [draggedBatchId, setDraggedBatchId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<ProductionStage | null>(null);
  const [groupByOrder, setGroupByOrder] = useState(false);

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

      return { ...b, product_details: prod, product_image: prod?.image_url, diffHours, isDelayed, requires_setting: hasStones };
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

      if (batch.current_stage === ProductionStage.Casting && targetStage === ProductionStage.Setting && !batch.requires_setting) {
          showToast(`Το ${batch.sku} δεν έχει πέτρες. Προχωρήστε στο επόμενο στάδιο.`, 'info');
          return;
      }
      
      try {
          await api.updateBatchStage(batch.id, targetStage);
          queryClient.invalidateQueries({ queryKey: ['batches'] });
          queryClient.invalidateQueries({ queryKey: ['orders'] });
      } catch (e: any) {
          showToast(`Σφάλμα: ${e.message}`, 'error');
      }
  };

  const getGroupedBatches = (stageBatches: ProductionBatch[]) => {
      const groups: Record<string, ProductionBatch[]> = {};
      const orphans: ProductionBatch[] = [];

      stageBatches.forEach(b => {
          if (b.order_id) {
              if (!groups[b.order_id]) groups[b.order_id] = [];
              groups[b.order_id].push(b);
          } else {
              orphans.push(b);
          }
      });

      return { groups, orphans };
  };

  if (isLoading) return <div className="p-12 text-center text-slate-400">Φόρτωση παραγωγής...</div>;

  return (
    <div className="h-[calc(100vh-100px)] flex flex-col space-y-6">
        <div className="shrink-0 bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
                <h1 className="text-3xl font-bold text-[#060b00] tracking-tight flex items-center gap-3">
                    <div className="p-2 bg-[#060b00] text-white rounded-xl">
                        <Factory size={24} />
                    </div>
                    Ροή Παραγωγής
                </h1>
                <p className="text-slate-500 mt-1 ml-14">Drag & drop τις παρτίδες για να αλλάξετε το στάδιό τους.</p>
            </div>
            
            <div className="flex items-center gap-3">
                <button
                    onClick={() => setGroupByOrder(!groupByOrder)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all border ${groupByOrder ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                >
                    <Layers size={16} /> {groupByOrder ? 'Ομαδοποιημένη' : 'Αναλυτική'} Προβολή
                </button>

                <button 
                    onClick={() => onPrintAggregated(enhancedBatches)}
                    disabled={enhancedBatches.length === 0}
                    className="flex items-center gap-2 bg-slate-100 text-slate-700 px-5 py-2.5 rounded-xl hover:bg-slate-200 font-bold transition-all shadow-sm border border-slate-200 disabled:opacity-50 text-sm"
                >
                    <FileText size={16} /> Συγκεντρωτική
                </button>
            </div>
        </div>

        <div className="flex-1 overflow-x-auto overflow-y-hidden pb-4">
            <div className="flex gap-6 h-full min-w-max">
                {STAGES.map(stage => {
                    const stageBatches = enhancedBatches.filter(b => b.current_stage === stage.id);
                    const colors = STAGE_COLORS[stage.color as keyof typeof STAGE_COLORS];
                    const isTarget = dropTarget === stage.id;
                    
                    const { groups, orphans } = getGroupedBatches(stageBatches);

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
                                {groupByOrder ? (
                                    <>
                                        {Object.entries(groups).map(([orderId, batches]) => (
                                            <OrderGroupCard key={orderId} orderId={orderId} batches={batches} onDragStart={handleDragStart} onPrint={onPrintBatch} />
                                        ))}
                                        {orphans.map(batch => (
                                            <BatchCard key={batch.id} batch={batch} onDragStart={handleDragStart} onPrint={onPrintBatch} />
                                        ))}
                                    </>
                                ) : (
                                    stageBatches.map(batch => (
                                        <BatchCard key={batch.id} batch={batch} onDragStart={handleDragStart} onPrint={onPrintBatch} />
                                    ))
                                )}
                                
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