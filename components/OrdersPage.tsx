import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Order, OrderStatus, Product, ProductVariant, OrderItem, ProductionStage, ProductionBatch, Material, MaterialType, Customer, BatchType, ProductionType, Gender, VatRegime } from '../types';
import { ShoppingCart, Plus, Search, Calendar, Phone, User, CheckCircle, Package, ArrowRight, X, Loader2, Factory, Users, ScanBarcode, Camera, Printer, AlertTriangle, PackageCheck, PackageX, Trash2, Settings, RefreshCcw, LayoutList, Edit, Save, Ruler, ChevronDown, BookOpen, Hammer, Flame, Gem, Tag, Globe, FileText, ImageIcon, ChevronLeft, ChevronRight, Hash, Layers, Minus, StickyNote, XCircle, Ban, BarChart3, Percent } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, supabase, SYSTEM_IDS, recordStockMovement } from '../lib/supabase';
import { useUI } from './UIProvider';
import BarcodeScanner from './BarcodeScanner';
import { getSizingInfo, isSizable } from '../utils/sizing';
import { findProductByScannedCode, getVariantComponents, formatCurrency, splitSkuComponents } from '../utils/pricingEngine';
import { FINISH_CODES } from '../constants';
import OrderBuilder from './OrderBuilder';

interface Props {
  products: Product[];
  onPrintOrder?: (order: Order) => void;
  onPrintLabels?: (items: { product: Product; variant?: ProductVariant; quantity: number, size?: string, format?: 'standard' | 'simple' | 'retail' }[]) => void;
  materials: Material[];
  onPrintAggregated: (batches: ProductionBatch[], orderDetails?: { orderId: string, customerName: string }) => void;
  onPrintPreparation: (batches: ProductionBatch[]) => void;
  onPrintTechnician: (batches: ProductionBatch[]) => void;
  onPrintAnalytics?: (order: Order) => void;
}

const STATUS_TRANSLATIONS: Record<OrderStatus, string> = {
    [OrderStatus.Pending]: 'Εκκρεμεί',
    [OrderStatus.InProduction]: 'Σε Παραγωγή',
    [OrderStatus.Ready]: 'Έτοιμο',
    [OrderStatus.Delivered]: 'Παραδόθηκε',
    [OrderStatus.Cancelled]: 'Ακυρώθηκε',
};

// ... (Existing STAGES, STAGE_COLORS, FINISH_COLORS, STONE_TEXT_COLORS, SplitBatchModal, PrintOptionsModal components remain unchanged) ...
const STAGES = [
    { id: ProductionStage.AwaitingDelivery, label: 'Αναμονή Παραλαβής', icon: <Globe size={20} />, color: 'indigo' },
    { id: ProductionStage.Waxing, label: 'Λάστιχα / Κεριά', icon: <Package size={20} />, color: 'slate' },
    { id: ProductionStage.Casting, label: 'Χυτήριο', icon: <Flame size={20} />, color: 'orange' },
    { id: ProductionStage.Setting, label: 'Καρφωτής', icon: <Gem size={20} />, color: 'purple' },
    { id: ProductionStage.Polishing, label: 'Τεχνίτης', icon: <Hammer size={20} />, color: 'blue' },
    { id: ProductionStage.Labeling, label: 'Καρτελάκια - Πακετάρισμα', icon: <Tag size={20} />, color: 'yellow' },
    { id: ProductionStage.Ready, label: 'Έτοιμα', icon: <CheckCircle size={20} />, color: 'emerald' }
];

// @FIX: Add missing 'header' property to STAGE_COLORS objects.
const STAGE_COLORS = {
    indigo: { bg: 'bg-indigo-50', text: 'text-indigo-500', border: 'border-indigo-200', header: 'bg-indigo-100/50' },
    slate: { bg: 'bg-slate-50', text: 'text-slate-500', border: 'border-slate-200', header: 'bg-slate-100/50' },
    orange: { bg: 'bg-orange-50', text: 'text-orange-500', border: 'border-orange-200', header: 'bg-orange-100/50' },
    purple: { bg: 'bg-purple-50', text: 'text-purple-500', border: 'border-purple-200', header: 'bg-purple-100/50' },
    blue: { bg: 'bg-blue-50', text: 'text-blue-500', border: 'border-blue-200', header: 'bg-blue-100/50' },
    yellow: { bg: 'bg-yellow-50', text: 'text-yellow-500', border: 'border-yellow-200', header: 'bg-yellow-100/50' },
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-500', border: 'border-emerald-200', header: 'bg-emerald-100/50' },
};

const FINISH_COLORS: Record<string, string> = {
    'X': 'text-amber-500', 'P': 'text-slate-500', 'D': 'text-orange-500', 'H': 'text-cyan-400', '': 'text-slate-400'
};

const STONE_TEXT_COLORS: Record<string, string> = {
    'KR': 'text-rose-600', 'QN': 'text-slate-900', 'LA': 'text-blue-600', 'TY': 'text-teal-500',
    'TG': 'text-orange-700', 'IA': 'text-red-700', 'BSU': 'text-slate-800', 'GSU': 'text-emerald-800',
    'RSU': 'text-rose-800', 'MA': 'text-emerald-600', 'FI': 'text-slate-400', 'OP': 'text-indigo-500',
    'NF': 'text-green-700', 'CO': 'text-orange-400', 'PCO': 'text-emerald-400', 'MCO': 'text-purple-500',
    'PAX': 'text-green-500', 'MAX': 'text-blue-600', 'KAX': 'text-red-600', 'AI': 'text-slate-500',
    'AP': 'text-cyan-500', 'AM': 'text-teal-600', 'LR': 'text-indigo-600', 'BST': 'text-sky-400',
    'MP': 'text-blue-400', 'LE': 'text-slate-300', 'PR': 'text-green-400', 'KO': 'text-red-500',
    'MV': 'text-purple-400', 'RZ': 'text-pink-500', 'AK': 'text-cyan-300', 'XAL': 'text-stone-400'
};

const DRAFT_ORDER_KEY = 'ilios_desktop_draft_order';

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
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
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

const PrintOptionsModal = ({ order, onClose, onPrintOrder, onPrintLabels, products, allBatches, showToast, onPrintAggregated, onPrintPreparation, onPrintTechnician, onPrintAnalytics }: {
    order: Order;
    onClose: () => void;
    onPrintOrder?: (order: Order) => void;
    onPrintLabels?: (items: { product: Product; variant?: ProductVariant; quantity: number, size?: string, format?: 'standard' | 'simple' | 'retail' }[]) => void;
    onPrintAggregated: (batches: ProductionBatch[], orderDetails?: { orderId: string, customerName: string }) => void;
    onPrintPreparation: (batches: ProductionBatch[]) => void;
    onPrintTechnician: (batches: ProductionBatch[]) => void;
    onPrintAnalytics?: (order: Order) => void;
    products: Product[];
    allBatches: ProductionBatch[] | undefined;
    showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}) => {
    const orderBatches = useMemo(() => allBatches?.filter(b => b.order_id === order.id) || [], [allBatches, order.id]);

    const handlePrintOrder = () => {
        onPrintOrder?.(order);
        onClose();
    };

    const handlePrintLabelsAction = () => {
        const itemsToPrint: any[] = [];
        for (const item of order.items) {
            const product = products.find(p => p.sku === item.sku);
            if (product) {
                const variant = product.variants?.find(v => v.suffix === item.variant_suffix);
                itemsToPrint.push({
                    product,
                    variant,
                    quantity: item.quantity,
                    size: item.size_info,
                    format: 'standard'
                });
            }
        }
        if (itemsToPrint.length > 0) {
            onPrintLabels?.(itemsToPrint);
            showToast(`Στάλθηκαν ${itemsToPrint.length} είδη ετικετών για εκτύπωση.`, "success");
        }
        onClose();
    };

    const handlePrintProductionSheet = (printFn: (batches: ProductionBatch[], details?: any) => void) => {
        if (orderBatches.length === 0) {
            showToast("Η παραγγελία δεν έχει αποσταλεί στην παραγωγή.", "info");
            return;
        }
        if (printFn === onPrintAggregated) {
            printFn(orderBatches, { orderId: order.id, customerName: order.customer_name });
        } else {
            printFn(orderBatches);
        }
        onClose();
    };
    
    const productionSheetsDisabled = orderBatches.length === 0;

    const options = [
        {
            label: "Εκτύπωση Παραγγελίας",
            icon: <Printer size={20} />,
            color: "slate",
            action: handlePrintOrder,
            disabled: !onPrintOrder,
        },
        {
            label: "Εκτύπωση Ετικετών",
            icon: <Tag size={20} />,
            color: "emerald",
            action: handlePrintLabelsAction,
            disabled: !onPrintLabels,
        },
        {
            label: "Οικονομική Ανάλυση",
            icon: <BarChart3 size={20} />,
            color: "teal",
            action: () => { onPrintAnalytics && onPrintAnalytics(order); onClose(); },
            disabled: !onPrintAnalytics,
        },
        {
            label: "Συγκεντρωτική Παραγωγής",
            icon: <FileText size={20} />,
            color: "blue",
            action: () => handlePrintProductionSheet(onPrintAggregated),
            disabled: productionSheetsDisabled,
        },
        {
            label: "Φύλλο Προετοιμασίας",
            icon: <BookOpen size={20} />,
            color: "purple",
            action: () => handlePrintProductionSheet(onPrintPreparation),
            disabled: productionSheetsDisabled,
        },
        {
            label: "Φύλλо Τεχνίτη",
            icon: <Hammer size={20} />,
            color: "orange",
            action: () => handlePrintProductionSheet(onPrintTechnician),
            disabled: productionSheetsDisabled,
        },
    ];
    
    const colors = {
        slate: { bg: 'bg-slate-100', text: 'text-slate-700', hover: 'hover:bg-slate-200', border: 'border-slate-200' },
        emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', hover: 'hover:bg-emerald-100', border: 'border-emerald-200' },
        teal: { bg: 'bg-teal-50', text: 'text-teal-700', hover: 'hover:bg-teal-100', border: 'border-teal-200' },
        blue: { bg: 'bg-blue-50', text: 'text-blue-700', hover: 'hover:bg-blue-100', border: 'border-blue-200' },
        purple: { bg: 'bg-purple-50', text: 'text-purple-700', hover: 'hover:bg-purple-100', border: 'border-purple-200' },
        orange: { bg: 'bg-orange-50', text: 'text-orange-700', hover: 'hover:bg-orange-100', border: 'border-orange-200' },
    };

    return (
        <div className="fixed inset-0 z-[150] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800">Επιλογές Εκτύπωσης</h2>
                        <p className="text-sm text-slate-500 font-mono font-bold">Παραγγελία #{order.id}</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-500"><X size={20}/></button>
                </div>
                <div className="p-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {options.map(opt => {
                        const colorClass = colors[opt.color as keyof typeof colors];
                        return (
                            <button 
                                key={opt.label}
                                onClick={opt.action}
                                disabled={opt.disabled}
                                className={`
                                    p-6 rounded-2xl flex flex-col items-center justify-center gap-3 text-center font-bold border-2 transition-all
                                    ${opt.disabled
                                        ? 'bg-slate-50 border-slate-100 text-slate-400 cursor-not-allowed'
                                        : `${colorClass.bg} ${colorClass.text} ${colorClass.border} ${colorClass.hover} transform hover:-translate-y-1`
                                    }
                                `}
                            >
                                <div className="p-3 bg-white rounded-xl shadow-sm">{opt.icon}</div>
                                <span className="text-xs uppercase tracking-wider">{opt.label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};


export default function OrdersPage({ products, onPrintOrder, onPrintLabels, materials, onPrintAggregated, onPrintPreparation, onPrintTechnician, onPrintAnalytics }: Props) {
  const queryClient = useQueryClient();
  const { showToast, confirm } = useUI();
  const { data: orders, isLoading: loadingOrders } = useQuery({ queryKey: ['orders'], queryFn: api.getOrders });
  const { data: batches, isLoading: loadingBatches } = useQuery({ queryKey: ['batches'], queryFn: api.getProductionBatches });

  const [isCreating, setIsCreating] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  
  const [managingOrder, setManagingOrder] = useState<Order | null>(null);
  const [moveBatchState, setMoveBatchState] = useState<{ batch: ProductionBatch; targetStage: ProductionStage } | null>(null);
  const [isProcessingMove, setIsProcessingMove] = useState(false);
  const [printModalOrder, setPrintModalOrder] = useState<Order | null>(null);

  const handleCreateOrder = () => {
      setEditingOrder(null);
      setIsCreating(true);
  };
  
  const handleEditOrder = (order: Order) => {
      setEditingOrder(order);
      setIsCreating(true);
  };

  const handleBackFromBuilder = () => {
      setIsCreating(false);
      setEditingOrder(null);
  }

  const handleScanInOrder = (code: string) => {
    // This logic is now inside OrderBuilder
  };

  const enrichedBatches = useMemo(() => {
      const ZIRCON_CODES = ['LE', 'PR', 'AK', 'MP', 'KO', 'MV', 'RZ'];
      return batches?.map(b => {
          const prod = products.find(p => p.sku === b.sku);
          const lastUpdate = new Date(b.updated_at);
          const now = new Date();
          const diffHours = Math.floor((now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60));
          const threshold = 48; // Simple threshold for now
          const isDelayed = diffHours > threshold;
          
          const suffix = b.variant_suffix || '';
          const hasZircons = ZIRCON_CODES.some(code => suffix.includes(code)) || 
                             prod?.recipe.some(r => {
                                 if (r.type !== 'raw') return false;
                                 const material = materials.find(m => m.id === r.id);
                                 return material?.type === MaterialType.Stone && ZIRCON_CODES.some(code => material.name.includes(code));
                             }) || false;

          return { ...b, product_details: prod, diffHours, isDelayed, requires_setting: hasZircons }
      }) || [];
  }, [batches, products, materials]);

  const handleDrop = async (batchId: string, targetStage: ProductionStage) => {
    const batch = enrichedBatches.find(b => b.id === batchId);
    if (!batch) return;
    if (batch.current_stage === targetStage) return;

    // Check for "Setter" skip logic
    if (batch.current_stage === ProductionStage.Casting && targetStage === ProductionStage.Setting && !batch.requires_setting) {
        showToast(`Το ${batch.sku} δεν έχει Ζιργκόν. Προχωρήστε στο επόμενο στάδιο.`, 'info');
        return;
    }
    
    setMoveBatchState({ batch, targetStage });
  };

  const handleConfirmMove = async (quantityToMove: number) => {
    if (!moveBatchState) return;

    const { batch, targetStage } = moveBatchState;
    setIsProcessingMove(true);

    try {
        if (quantityToMove >= batch.quantity) {
            // Move the whole batch
            await api.updateBatchStage(batch.id, targetStage);
        } else {
            // Split the batch
            const originalNewQty = batch.quantity - quantityToMove;
            const { product_details, diffHours, isDelayed, ...dbBatch } = batch as any;
            
            const newBatchData = {
                ...dbBatch,
                id: crypto.randomUUID(),
                quantity: quantityToMove,
                current_stage: targetStage,
                created_at: batch.created_at,
                updated_at: new Date().toISOString()
            };

            await api.splitBatch(batch.id, originalNewQty, newBatchData);
        }
        
        queryClient.invalidateQueries({ queryKey: ['batches'] });
        queryClient.invalidateQueries({ queryKey: ['orders'] });
        showToast('Η παρτίδα μετακινήθηκε.', 'success');
        setMoveBatchState(null);

    } catch (e: any) {
        showToast(`Σφάλμα: ${e.message}`, 'error');
    } finally {
        setIsProcessingMove(false);
    }
  };

  const handleSendToProduction = async (orderId: string) => {
      try {
          await api.sendOrderToProduction(orderId, products, materials);
          queryClient.invalidateQueries({ queryKey: ['orders'] });
          queryClient.invalidateQueries({ queryKey: ['batches'] });
          setManagingOrder(null);
          showToast('Η παραγγελία στάλθηκε στην παραγωγή.', 'success');
      } catch (err: any) {
          showToast(`Σφάλμα: ${err.message}`, 'error');
      }
  };

  const handleCancelOrder = async (orderId: string) => {
    const yes = await confirm({
        title: 'Ακύρωση Παραγγελίας',
        message: 'Είστε σίγουροι ότι θέλετε να ακυρώσετε αυτή την παραγγελία; Η ενέργεια θα αφαιρέσει τυχόν παρτίδες παραγωγής, αλλά θα διατηρήσει το ιστορικό.',
        isDestructive: true,
        confirmText: 'Ακύρωση'
    });

    if (yes) {
        try {
            await api.updateOrderStatus(orderId, OrderStatus.Cancelled);
            queryClient.invalidateQueries({ queryKey: ['orders'] });
            queryClient.invalidateQueries({ queryKey: ['batches'] });
            setManagingOrder(null);
            showToast('Η παραγγελία ακυρώθηκε.', 'info');
        } catch (err: any) {
            showToast(`Σφάλμα: ${err.message}`, 'error');
        }
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    const yes = await confirm({
        title: 'Διαγραφή Παραγγελίας',
        message: 'ΠΡΟΣΟΧΗ: Αυτή η ενέργεια θα διαγράψει ΟΡΙΣΤΙΚΑ την παραγγελία και όλα τα δεδομένα της. Δεν μπορεί να αναιρεθεί.',
        isDestructive: true,
        confirmText: 'Οριστική Διαγραφή'
    });

    if (yes) {
        try {
            await api.deleteOrder(orderId);
            queryClient.invalidateQueries({ queryKey: ['orders'] });
            queryClient.invalidateQueries({ queryKey: ['batches'] });
            setManagingOrder(null);
            showToast('Η παραγγελία διαγράφηκε οριστικά.', 'success');
        } catch (err: any) {
            showToast(`Σφάλμα: ${err.message}`, 'error');
        }
    }
  };
  
  const [viewMode, setViewMode] = useState<'list' | 'board'>('list');

  if (isCreating || editingOrder) {
      return <OrderBuilder onBack={handleBackFromBuilder} initialOrder={editingOrder} products={products} />;
  }

  return (
    <div className="space-y-6 h-full flex flex-col">
       <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-100 shrink-0">
          <div>
            <h1 className="text-3xl font-bold text-[#060b00] tracking-tight flex items-center gap-3">
                <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
                    <ShoppingCart size={24} />
                </div>
                Παραγγελίες Πελατών
            </h1>
            <p className="text-slate-500 mt-1 ml-14">Διαχείριση λιανικής και χονδρικής.</p>
          </div>
          <button onClick={handleCreateOrder} className="flex items-center gap-2 bg-[#060b00] text-white px-5 py-3 rounded-xl hover:bg-black font-bold shadow-lg shadow-slate-200 transition-all hover:-translate-y-0.5">
              <Plus size={20} /> Νέα Παραγγελία
          </button>
      </div>
      <div className="flex justify-between items-center">
        <div className="flex bg-slate-100 p-1 rounded-xl">
            <button onClick={() => setViewMode('list')} className={`px-4 py-2 rounded-lg font-bold text-sm transition-all flex items-center gap-2 ${viewMode === 'list' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><LayoutList size={16}/> Λίστα</button>
            <button onClick={() => setViewMode('board')} className={`px-4 py-2 rounded-lg font-bold text-sm transition-all flex items-center gap-2 ${viewMode === 'board' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><Factory size={16}/> Παραγωγή</button>
        </div>
        <div className="relative md:w-64">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
             <input 
                type="text" 
                placeholder="Αναζήτηση..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500/20 shadow-sm"
             />
        </div>
      </div>
      {viewMode === 'list' && (
          <div className="flex-1 overflow-auto">
            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs">
                        <tr>
                            <th className="p-4 pl-6">ID</th>
                            <th className="p-4">Πελάτης</th>
                            <th className="p-4">Ημερομηνία</th>
                            <th className="p-4 text-right">Ποσό (Net)</th>
                            <th className="p-4">Κατάσταση</th>
                            <th className="p-4"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {orders?.filter(o => o.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) || o.id.includes(searchTerm)).map(order => {
                            const netValue = order.total_price / (1 + (order.vat_rate || 0.24));
                            return (
                                <tr key={order.id} className="hover:bg-slate-50/80 transition-colors group">
                                    <td className="p-4 pl-6 font-mono font-bold text-slate-800">{order.id}</td>
                                    <td className="p-4 text-slate-800 font-medium">{order.customer_name}</td>
                                    <td className="p-4 text-slate-500">{new Date(order.created_at).toLocaleDateString('el-GR')}</td>
                                    <td className="p-4 text-right font-bold text-slate-800">{formatCurrency(netValue)}</td>
                                    <td className="p-4"><span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${getStatusColor(order.status)}`}>{STATUS_TRANSLATIONS[order.status]}</span></td>
                                    <td className="p-4 text-right">
                                        <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => setManagingOrder(order)} title="Διαχείριση" className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg"><Settings size={16}/></button>
                                            <button onClick={() => setPrintModalOrder(order)} title="Εκτύπωση Εντολών" className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg"><Printer size={16}/></button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
          </div>
      )}
      {viewMode === 'board' && (
          <div className="flex-1 overflow-x-auto pb-4">
            <div className="flex gap-4 h-full min-w-max">
                {STAGES.map(stage => {
                    const stageBatches = enrichedBatches.filter(b => b.current_stage === stage.id);
                    const colors = STAGE_COLORS[stage.color as keyof typeof STAGE_COLORS];
                    return (
                        <div key={stage.id} onDragOver={(e) => e.preventDefault()} onDrop={() => {}} className={`w-80 h-full flex flex-col rounded-2xl border ${colors.bg} border-slate-200`}>
                           <div className={`p-4 rounded-t-2xl border-b ${colors.border} flex justify-between items-center shrink-0 ${colors.header}`}>
                                <div className="flex items-center gap-3"><div className={`p-2 rounded-lg bg-white shadow-sm ${colors.text}`}>{stage.icon}</div><h3 className={`font-bold ${colors.text} text-sm`}>{stage.label}</h3></div>
                                <span className={`px-2 py-0.5 rounded-full text-xs font-black bg-white shadow-sm ${colors.text}`}>{stageBatches.length}</span>
                           </div>
                           <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
                                {stageBatches.map(batch => (
                                    <div key={batch.id} draggable={true} onDragStart={(e) => e.dataTransfer.setData('text/plain', batch.id)} onDragEnd={() => {}} className="bg-white p-3 rounded-lg shadow-sm border border-slate-100 hover:border-slate-300 transition-all cursor-grab active:cursor-grabbing">
                                        <div className="flex justify-between items-start"><div className="font-black text-slate-800 text-lg">{batch.sku}<span className="text-emerald-600">{batch.variant_suffix}</span></div><div className="text-xl font-black text-slate-900 bg-slate-50 px-2 py-1 rounded-lg border border-slate-100">{batch.quantity}</div></div>
                                        <div className="flex items-center gap-1.5 mt-2"><div className="w-1.5 h-1.5 rounded-full bg-slate-300"></div><div className="text-xs text-slate-500 font-bold">{batch.size_info || 'Standard'}</div></div>
                                        <div className="flex items-center gap-1.5 mt-1"><div className="w-1.5 h-1.5 rounded-full bg-slate-300"></div><div className="text-xs text-slate-500 font-bold">{new Date(batch.updated_at).toLocaleDateString('el-GR')}</div></div>
                                        {batch.isDelayed && <div className="mt-2 bg-red-100 text-red-600 text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1"><AlertTriangle size={10}/> Καθυστέρηση</div>}
                                    </div>
                                ))}
                           </div>
                        </div>
                    );
                })}
            </div>
          </div>
      )}
      {managingOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl animate-in zoom-in-95 border border-slate-100 flex flex-col max-h-[90vh]">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center shrink-0">
                    <div><h3 className="text-xl font-bold text-slate-800">Διαχείριση #{managingOrder.id}</h3><p className="text-sm text-slate-500">{managingOrder.customer_name}</p></div>
                    <button onClick={() => setManagingOrder(null)} className="p-2 hover:bg-slate-100 rounded-full"><X size={20}/></button>
                </div>
                <div className="p-6 space-y-4 overflow-y-auto">
                    <button onClick={() => { handleEditOrder(managingOrder); setManagingOrder(null); }} className="w-full text-left p-4 rounded-xl flex items-center gap-3 font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"><Edit size={18}/> Επεξεργασία</button>
                    {managingOrder.status === OrderStatus.Pending && (
                        <button onClick={() => handleSendToProduction(managingOrder.id)} className="w-full text-left p-4 rounded-xl flex items-center gap-3 font-bold bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 transition-colors"><Factory size={18}/> Αποστολή στην Παραγωγή</button>
                    )}
                    {managingOrder.status !== OrderStatus.Cancelled && managingOrder.status !== OrderStatus.Delivered && (
                        <button onClick={() => handleCancelOrder(managingOrder.id)} className="w-full text-left p-4 rounded-xl flex items-center gap-3 font-bold bg-orange-50 border border-orange-200 text-orange-700 hover:bg-orange-100 transition-colors">
                            <Ban size={18}/> Ακύρωση
                        </button>
                    )}
                    <button onClick={() => handleDeleteOrder(managingOrder.id)} className="w-full text-left p-4 rounded-xl flex items-center gap-3 font-bold bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 transition-colors">
                        <Trash2 size={18}/> Οριστική Διαγραφή
                    </button>
                </div>
            </div>
        </div>
      )}
      {printModalOrder && (
        <PrintOptionsModal 
            order={printModalOrder} onClose={() => setPrintModalOrder(null)}
            onPrintOrder={onPrintOrder} onPrintLabels={onPrintLabels}
            onPrintAggregated={onPrintAggregated} onPrintPreparation={onPrintPreparation} onPrintTechnician={onPrintTechnician}
            onPrintAnalytics={onPrintAnalytics}
            products={products} allBatches={enrichedBatches} showToast={showToast}
        />
      )}
      {moveBatchState && (
          <SplitBatchModal state={moveBatchState} onClose={() => setMoveBatchState(null)} onConfirm={handleConfirmMove} isProcessing={isProcessingMove}/>
      )}
    </div>
  );
}

const getStatusColor = (status: OrderStatus) => {
    switch(status) {
        case OrderStatus.Pending: return 'bg-slate-100 text-slate-600 border-slate-200';
        case OrderStatus.InProduction: return 'bg-blue-50 text-blue-600 border-blue-200';
        case OrderStatus.Ready: return 'bg-emerald-50 text-emerald-600 border-emerald-200';
        case OrderStatus.Delivered: return 'bg-[#060b00] text-white border-[#060b00]';
        case OrderStatus.Cancelled: return 'bg-red-50 text-red-500 border-red-200';
    }
};

const handleConfirmMove = async () => {};
