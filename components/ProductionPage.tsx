
import React, { useMemo, useState, useEffect } from 'react';
import { ProductionBatch, ProductionStage, Product, Material, MaterialType, Mold, ProductionType } from '../types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, supabase } from '../lib/supabase';
import { Factory, Flame, Gem, Hammer, Tag, Package, ChevronRight, Clock, Siren, CheckCircle, ImageIcon, Printer, FileText, Layers, ChevronDown, RefreshCcw, ArrowRight, X, Loader2, Globe, BookOpen, Truck, AlertTriangle, ChevronUp, MoveRight, Activity } from 'lucide-react';
import { useUI } from './UIProvider';

interface Props {
  products: Product[];
  materials: Material[];
  molds: Mold[];
  onPrintBatch: (batch: ProductionBatch) => void;
  onPrintAggregated: (batches: ProductionBatch[]) => void;
  onPrintPreparation: (batches: ProductionBatch[]) => void;
  onPrintTechnician: (batches: ProductionBatch[]) => void;
}

const STAGES = [
    { id: ProductionStage.AwaitingDelivery, label: 'Αναμονή Παραλαβής', icon: <Globe size={20} />, color: 'indigo' },
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
    indigo: { bg: 'bg-indigo-50', text: 'text-indigo-600', border: 'border-indigo-200', ring: 'ring-indigo-100', header: 'bg-indigo-100/50' },
    slate: { bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200', ring: 'ring-slate-100', header: 'bg-slate-100/50' },
    orange: { bg: 'bg-orange-50', text: 'text-orange-600', border: 'border-orange-200', ring: 'ring-orange-100', header: 'bg-orange-100/50' },
    purple: { bg: 'bg-purple-50', text: 'text-purple-600', border: 'border-purple-200', ring: 'ring-purple-100', header: 'bg-purple-100/50' },
    blue: { bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200', ring: 'ring-blue-100', header: 'bg-blue-100/50' },
    yellow: { bg: 'bg-yellow-50', text: 'text-yellow-600', border: 'border-yellow-200', ring: 'ring-yellow-100', header: 'bg-yellow-100/50' },
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200', ring: 'ring-emerald-100', header: 'bg-emerald-100/50' },
};

interface BatchCardProps {
    batch: ProductionBatch;
    onDragStart: (e: React.DragEvent<HTMLDivElement>, batchId: string) => void;
    onPrint: (batch: ProductionBatch) => void;
    onMoveDirectly?: (batch: ProductionBatch, target: ProductionStage) => void;
    onNextStage?: (batch: ProductionBatch) => void;
}

const BatchCard: React.FC<BatchCardProps> = ({ batch, onDragStart, onPrint, onMoveDirectly, onNextStage }) => {
    const isRefurbish = batch.type === 'Φρεσκάρισμα';
    const isAwaiting = batch.current_stage === ProductionStage.AwaitingDelivery;
    const isReady = batch.current_stage === ProductionStage.Ready;
    
    return (
    <div 
        draggable={!isReady}
        onDragStart={(e) => onDragStart(e, batch.id)}
        className={`bg-white p-3 sm:p-4 rounded-2xl shadow-sm border transition-all relative flex flex-col group touch-manipulation
                    ${batch.isDelayed 
                        ? 'border-red-300 ring-2 ring-red-100 shadow-red-100' 
                        : (isRefurbish ? 'border-blue-300 ring-1 ring-blue-50' : 'border-slate-200 hover:border-slate-300 hover:shadow-md')}
        `}
    >
        {/* Header Badges */}
        <div className="flex justify-between items-start mb-3">
            <div className="flex flex-wrap gap-2">
                {batch.isDelayed && (
                    <div className="animate-pulse bg-red-50 text-red-600 border border-red-200 text-[10px] font-black px-2 py-1 rounded-full flex items-center gap-1">
                        <AlertTriangle size={10} className="fill-current" />
                        <span>+{batch.diffHours}h Καθυστέρηση</span>
                    </div>
                )}
                {isRefurbish && (
                    <div className="bg-blue-100 text-blue-700 border border-blue-200 text-[10px] font-black px-2 py-1 rounded-full flex items-center gap-1">
                        <RefreshCcw size={10}/> Repair
                    </div>
                )}
            </div>
            
            <button
                onClick={(e) => { e.stopPropagation(); onPrint(batch); }}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                title="Εκτύπωση Εντολής"
            >
                <Printer size={16} />
            </button>
        </div>
        
        {/* Content */}
        <div className="flex gap-3 items-center mb-3">
            <div className="w-12 h-12 bg-slate-50 rounded-xl overflow-hidden shrink-0 border border-slate-100 relative">
                {batch.product_image ? (
                    <img src={batch.product_image} className="w-full h-full object-cover" alt="prod"/>
                ) : (
                    <div className="w-full h-full bg-slate-100 flex items-center justify-center">
                        <ImageIcon size={18} className="text-slate-300"/>
                    </div>
                )}
                {batch.quantity > 1 && (
                    <div className="absolute bottom-0 right-0 bg-slate-900 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-tl-lg">
                        x{batch.quantity}
                    </div>
                )}
            </div>
            <div className="min-w-0 flex-1">
                <div className="font-black text-slate-800 text-base leading-none truncate mb-1">{batch.sku}</div>
                <div className="flex items-center gap-1.5 flex-wrap">
                    {batch.variant_suffix && <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">{batch.variant_suffix}</span>}
                    {batch.size_info && <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">{batch.size_info}</span>}
                </div>
            </div>
        </div>

        {/* Action Footer */}
        <div className="mt-auto pt-3 border-t border-slate-50 flex justify-between items-center">
            {batch.order_id ? (
                <div className="text-[10px] font-mono font-medium text-slate-400">#{batch.order_id}</div>
            ) : <div/>}

            {!isReady && onNextStage && (
                <button 
                    onClick={(e) => { e.stopPropagation(); onNextStage(batch); }}
                    className="flex items-center gap-1 bg-slate-100 hover:bg-emerald-500 hover:text-white text-slate-600 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm active:scale-95"
                >
                    {isAwaiting ? 'Παραλαβή' : 'Επόμενο'} <MoveRight size={12}/>
                </button>
            )}
        </div>
    </div>
    );
};

const ProductionHealthBar = ({ batches }: { batches: ProductionBatch[] }) => {
    const total = batches.length;
    const delayed = batches.filter(b => b.isDelayed).length;
    const ready = batches.filter(b => b.current_stage === ProductionStage.Ready).length;
    const inProgress = total - ready;
    
    const healthScore = total > 0 ? Math.max(0, 100 - (delayed / (inProgress || 1)) * 100) : 100;
    
    return (
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex flex-col md:flex-row gap-6 items-center justify-between mb-2">
            <div className="flex items-center gap-4 w-full md:w-auto">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center text-xl font-black border-4 shadow-inner ${healthScore > 80 ? 'border-emerald-100 text-emerald-600 bg-emerald-50' : (healthScore > 50 ? 'border-amber-100 text-amber-600 bg-amber-50' : 'border-red-100 text-red-600 bg-red-50')}`}>
                    {healthScore.toFixed(0)}%
                </div>
                <div>
                    <h3 className="font-bold text-slate-800">Υγεία Παραγωγής</h3>
                    <p className="text-xs text-slate-500">Βάσει χρονικών ορίων</p>
                </div>
            </div>

            <div className="flex gap-4 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
                <div className="bg-slate-50 px-5 py-3 rounded-2xl border border-slate-100 min-w-[120px]">
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1"><Activity size={12}/> Ενεργά</div>
                    <div className="text-2xl font-black text-slate-800">{inProgress}</div>
                </div>
                <div className={`px-5 py-3 rounded-2xl border min-w-[120px] ${delayed > 0 ? 'bg-red-50 border-red-100' : 'bg-slate-50 border-slate-100'}`}>
                    <div className={`text-xs font-bold uppercase tracking-wider mb-1 flex items-center gap-1 ${delayed > 0 ? 'text-red-500' : 'text-slate-400'}`}>
                        <Siren size={12} className={delayed > 0 ? 'animate-pulse' : ''}/> Καθυστέρηση
                    </div>
                    <div className={`text-2xl font-black ${delayed > 0 ? 'text-red-600' : 'text-slate-800'}`}>{delayed}</div>
                </div>
                <div className="bg-emerald-50 px-5 py-3 rounded-2xl border border-emerald-100 min-w-[120px]">
                    <div className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-1 flex items-center gap-1"><CheckCircle size={12}/> Έτοιμα</div>
                    <div className="text-2xl font-black text-emerald-700">{ready}</div>
                </div>
            </div>
        </div>
    );
}

const SplitBatchModal = ({ state, onClose, onConfirm, isProcessing }: { state: { batch: ProductionBatch, targetStage: ProductionStage }, onClose: () => void, onConfirm: (qty: number) => void, isProcessing: boolean }) => {
    const { batch, targetStage } = state;
    const [quantity, setQuantity] = useState(batch.quantity);

    const sourceStageInfo = STAGES.find(s => s.id === batch.current_stage)!;
    const targetStageInfo = STAGES.find(s => s.id === targetStage)!;

    const handleConfirmClick = () => {
        if (quantity > 0 && quantity <= batch.quantity) {
            onConfirm(quantity);
        }
    };

    return (
        <div className="fixed inset-0 z-[150] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800">Μετακίνηση Παρτίδας</h2>
                        <p className="text-sm text-slate-500 font-mono font-bold">{batch.sku}{batch.variant_suffix}</p>
                    </div>
                    <button onClick={onClose} disabled={isProcessing} className="p-2 hover:bg-slate-200 rounded-full text-slate-500"><X size={20}/></button>
                </div>
                <div className="p-8 space-y-6">
                    <div className="flex items-center justify-around text-center">
                        <div className="flex flex-col items-center gap-2">
                            <div className={`p-3 rounded-xl ${STAGE_COLORS[sourceStageInfo.color as keyof typeof STAGE_COLORS].bg} ${STAGE_COLORS[sourceStageInfo.color as keyof typeof STAGE_COLORS].text}`}>{sourceStageInfo.icon}</div>
                            <span className="text-xs font-bold">{sourceStageInfo.label}</span>
                        </div>
                        <ArrowRight size={24} className="text-slate-300 mx-4 shrink-0"/>
                        <div className="flex flex-col items-center gap-2">
                            <div className={`p-3 rounded-xl ${STAGE_COLORS[targetStageInfo.color as keyof typeof STAGE_COLORS].bg} ${STAGE_COLORS[targetStageInfo.color as keyof typeof STAGE_COLORS].text}`}>{targetStageInfo.icon}</div>
                            <span className="text-xs font-bold">{targetStageInfo.label}</span>
                        </div>
                    </div>
                    <div className="bg-slate-100 p-6 rounded-2xl border border-slate-200 text-center">
                        <label className="text-sm font-bold text-slate-600 block mb-2">Ποσότητα για μετακίνηση</label>
                        <p className="text-xs text-slate-400 mb-3">Διαθέσιμα σε αυτή την παρτίδα: {batch.quantity}</p>
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
                            className="w-48 p-4 text-center font-black text-3xl rounded-xl border-2 border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none bg-white text-slate-800"
                            autoFocus
                            onKeyDown={(e) => e.key === 'Enter' && handleConfirmClick()}
                        />
                    </div>
                </div>
                <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                    <button onClick={onClose} disabled={isProcessing} className="px-6 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-200 transition-colors">
                        Ακύρωση
                    </button>
                    <button onClick={handleConfirmClick} disabled={isProcessing} className="px-8 py-3 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-700 transition-colors flex items-center gap-2 shadow-lg shadow-emerald-200">
                        {isProcessing ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle size={18} />}
                        {isProcessing ? 'Μετακίνηση...' : 'Επιβεβαίωση'}
                    </button>
                </div>
            </div>
        </div>
    );
};


export default function ProductionPage({ products, materials, molds, onPrintBatch, onPrintAggregated, onPrintPreparation, onPrintTechnician }: Props) {
  const queryClient = useQueryClient();
  const { showToast, confirm } = useUI();
  const { data: batches, isLoading } = useQuery({ queryKey: ['batches'], queryFn: api.getProductionBatches });
  
  const [draggedBatchId, setDraggedBatchId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<ProductionStage | null>(null);
  const [isProcessingSplit, setIsProcessingSplit] = useState(false);
  
  // Mobile Accordion State
  const [expandedStageId, setExpandedStageId] = useState<string | null>(STAGES[1].id); // Default to Waxing or first active

  const [splitModalState, setSplitModalState] = useState<{
      batch: ProductionBatch;
      targetStage: ProductionStage;
  } | null>(null);

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

  const attemptMove = (batch: ProductionBatch, targetStage: ProductionStage) => {
    if (batch.current_stage === targetStage) return;

    if (batch.current_stage === ProductionStage.Casting && targetStage === ProductionStage.Setting && !batch.requires_setting) {
        showToast(`Το ${batch.sku} δεν έχει πέτρες. Προχωρήστε στο επόμενο στάδιο.`, 'info');
        return;
    }

    if (batch.current_stage === ProductionStage.AwaitingDelivery) {
        handleImportReceive(batch, targetStage);
        return; 
    }
    
    setSplitModalState({ batch, targetStage });
  };

  const handleDrop = async (targetStage: ProductionStage) => {
    if (!draggedBatchId) return;
    const batch = enhancedBatches.find(b => b.id === draggedBatchId);
    if (!batch) return;
    attemptMove(batch, targetStage);
  };

  const handleImportReceive = async (batch: ProductionBatch, targetStage: ProductionStage) => {
        const targetStageInfo = STAGES.find(s => s.id === targetStage);
        const confirmed = await confirm({
            title: 'Παραλαβή Εισαγόμενου',
            message: `Επιβεβαιώνετε την παραλαβή για την παρτίδα ${batch.sku}${batch.variant_suffix || ''} και τη μετακίνηση στο στάδιο "${targetStageInfo?.label}"?`,
            confirmText: 'Επιβεβαίωση'
        });

        if (confirmed) {
            setIsProcessingSplit(true);
            try {
                await api.updateBatchStage(batch.id, targetStage);
                queryClient.invalidateQueries({ queryKey: ['batches'] });
                queryClient.invalidateQueries({ queryKey: ['orders'] });
                showToast('Η παρτίδα μετακινήθηκε.', 'success');
            } catch (e: any) {
                showToast(`Σφάλμα: ${e.message}`, 'error');
            } finally {
                setIsProcessingSplit(false);
            }
        }
  };

  const handleConfirmSplit = async (quantityToMove: number) => {
    if (!splitModalState) return;

    const { batch, targetStage } = splitModalState;
    setIsProcessingSplit(true);

    try {
        if (quantityToMove >= batch.quantity) {
            // Move the whole batch
            await api.updateBatchStage(batch.id, targetStage);
        } else {
            // Split the batch
            const originalNewQty = batch.quantity - quantityToMove;
            const { product_details, product_image, diffHours, isDelayed, id, ...dbBatch } = batch;
            
            const newBatchData = {
                ...dbBatch,
                quantity: quantityToMove,
                current_stage: targetStage,
                created_at: batch.created_at,
                updated_at: new Date().toISOString(),
            };

            await api.splitBatch(batch.id, originalNewQty, newBatchData);
        }
        
        queryClient.invalidateQueries({ queryKey: ['batches'] });
        queryClient.invalidateQueries({ queryKey: ['orders'] });
        showToast('Η παρτίδα μετακινήθηκε.', 'success');
        setSplitModalState(null);

    } catch (e: any) {
        showToast(`Σφάλμα: ${e.message}`, 'error');
    } finally {
        setIsProcessingSplit(false);
    }
  };

  // Determines next logical stage for "Quick Move" button
  const getNextStage = (currentStage: ProductionStage, batch: ProductionBatch): ProductionStage | null => {
      const currentIndex = STAGES.findIndex(s => s.id === currentStage);
      if (currentIndex === -1 || currentIndex === STAGES.length - 1) return null;
      
      let nextIndex = currentIndex + 1;
      
      // Special logic for Imported Products: Awaiting -> Labeling
      if (batch.product_details?.production_type === ProductionType.Imported && currentStage === ProductionStage.AwaitingDelivery) {
          return ProductionStage.Labeling;
      }

      // Skip Setting if not required
      if (STAGES[nextIndex].id === ProductionStage.Setting && !batch.requires_setting) {
          nextIndex++;
      }
      
      return STAGES[nextIndex].id;
  };

  const handleQuickNext = (batch: ProductionBatch) => {
      const nextStage = getNextStage(batch.current_stage, batch);
      if (nextStage) attemptMove(batch, nextStage);
  };

  if (isLoading) return <div className="p-12 text-center text-slate-400">Φόρτωση παραγωγής...</div>;

  return (
    <div className="h-[calc(100vh-100px)] flex flex-col space-y-4">
        <ProductionHealthBar batches={enhancedBatches} />

        <div className="shrink-0 bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
            <div>
                <h1 className="text-2xl font-bold text-[#060b00] tracking-tight flex items-center gap-3">
                    <div className="p-2 bg-[#060b00] text-white rounded-xl">
                        <Factory size={24} />
                    </div>
                    Ροή Παραγωγής
                </h1>
                <p className="text-slate-500 mt-1 ml-14">Διαχείριση εντολών σε πραγματικό χρόνο.</p>
            </div>
            
            <div className="flex items-center gap-2 flex-wrap">
                <button 
                    onClick={() => onPrintPreparation(enhancedBatches)}
                    disabled={enhancedBatches.length === 0}
                    className="flex items-center gap-2 bg-blue-50 text-blue-700 px-4 py-2 rounded-xl hover:bg-blue-100 font-bold transition-all shadow-sm border border-blue-200 disabled:opacity-50 text-xs"
                >
                    <BookOpen size={14} /> Προετοιμασία
                </button>
                 <button 
                    onClick={() => onPrintTechnician(enhancedBatches)}
                    disabled={enhancedBatches.length === 0}
                    className="flex items-center gap-2 bg-purple-50 text-purple-700 px-4 py-2 rounded-xl hover:bg-purple-100 font-bold transition-all shadow-sm border border-purple-200 disabled:opacity-50 text-xs"
                >
                    <Hammer size={14} /> Τεχνίτης
                </button>
                <button 
                    onClick={() => onPrintAggregated(enhancedBatches)}
                    disabled={enhancedBatches.length === 0}
                    className="flex items-center gap-2 bg-slate-100 text-slate-700 px-4 py-2 rounded-xl hover:bg-slate-200 font-bold transition-all shadow-sm border border-slate-200 disabled:opacity-50 text-xs"
                >
                    <FileText size={14} /> Συγκεντρωτική
                </button>
            </div>
        </div>

        {/* RESPONSIVE LAYOUT CONTAINER */}
        <div className="flex-1 overflow-x-auto overflow-y-auto pb-4 custom-scrollbar lg:overflow-y-hidden">
            {/* 
                Desktop: Horizontal Flex (Kanban)
                Mobile: Vertical Flex (Stack/Accordion)
            */}
            <div className="flex flex-col lg:flex-row gap-4 h-auto lg:h-full lg:min-w-max">
                {STAGES.map(stage => {
                    const stageBatches = enhancedBatches.filter(b => b.current_stage === stage.id);
                    const colors = STAGE_COLORS[stage.color as keyof typeof STAGE_COLORS];
                    const isTarget = dropTarget === stage.id;
                    const isExpanded = expandedStageId === stage.id;
                    
                    return (
                        <div 
                            key={stage.id}
                            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDropTarget(stage.id); }}
                            onDragLeave={() => setDropTarget(null)}
                            onDrop={() => handleDrop(stage.id)}
                            className={`
                                flex flex-col rounded-3xl border transition-all duration-300
                                lg:w-80 lg:h-full
                                w-full
                                ${isTarget ? 'bg-emerald-50 border-emerald-300 shadow-2xl scale-[1.02]' : `${colors.bg} border-slate-200`}
                            `}
                        >
                            {/* Stage Header */}
                            <div 
                                className={`
                                    p-4 rounded-t-3xl lg:rounded-t-3xl border-b ${colors.border} flex justify-between items-center shrink-0 cursor-pointer lg:cursor-default transition-colors ${colors.header}
                                    ${!isExpanded ? 'rounded-b-3xl lg:rounded-b-none border-b-0 lg:border-b' : ''}
                                `}
                                onClick={() => setExpandedStageId(isExpanded ? null : stage.id)}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-lg bg-white shadow-sm text-${stage.color}-600`}>{stage.icon}</div>
                                    <h3 className={`font-bold ${colors.text} text-sm`}>{stage.label}</h3>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-black bg-white shadow-sm ${colors.text}`}>{stageBatches.length}</span>
                                    {/* Mobile Accordion Icon */}
                                    <div className="lg:hidden text-slate-400">
                                        {isExpanded ? <ChevronUp size={18}/> : <ChevronDown size={18}/>}
                                    </div>
                                </div>
                            </div>
                            
                            {/* Stage Body - Responsive Visibility */}
                            <div className={`
                                flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar
                                ${!isExpanded ? 'hidden lg:block' : 'block'}
                                min-h-[100px] lg:min-h-0
                            `}>
                                {/* Progress Bar Concept for Header */}
                                {stageBatches.length > 0 && (
                                    <div className="w-full h-1 bg-slate-200 rounded-full overflow-hidden mb-2 opacity-50 lg:hidden">
                                        <div className={`h-full bg-${stage.color}-500`} style={{ width: '100%' }}></div>
                                    </div>
                                )}

                                {stageBatches.map(batch => (
                                    <BatchCard 
                                        key={batch.id} 
                                        batch={batch} 
                                        onDragStart={handleDragStart} 
                                        onPrint={onPrintBatch} 
                                        onNextStage={handleQuickNext}
                                    />
                                ))}
                                
                                {stageBatches.length === 0 && (
                                    <div className="h-24 lg:h-full flex flex-col items-center justify-center text-slate-400/50 p-4 border-2 border-dashed border-slate-200/50 rounded-2xl">
                                        <Package size={24} className="mb-2"/>
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-center">Empty Stage</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
        
        {splitModalState && (
            <SplitBatchModal 
                state={splitModalState}
                onClose={() => setSplitModalState(null)}
                onConfirm={handleConfirmSplit}
                isProcessing={isProcessingSplit}
            />
        )}
    </div>
  );
}
