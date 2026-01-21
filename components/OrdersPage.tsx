
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

const STAGE_COLORS = {
    indigo: { bg: 'bg-indigo-50', text: 'text-indigo-500', border: 'border-indigo-200' },
    slate: { bg: 'bg-slate-50', text: 'text-slate-500', border: 'border-slate-200' },
    orange: { bg: 'bg-orange-50', text: 'text-orange-500', border: 'border-orange-200' },
    purple: { bg: 'bg-purple-50', text: 'text-purple-500', border: 'border-purple-200' },
    blue: { bg: 'bg-blue-50', text: 'text-blue-500', border: 'border-blue-200' },
    yellow: { bg: 'bg-yellow-50', text: 'text-yellow-500', border: 'border-yellow-200' },
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-500', border: 'border-emerald-200' },
};

const FINISH_COLORS: Record<string, string> = {
    'X': 'text-amber-500', 'P': 'text-slate-500', 'D': 'text-orange-500', 'H': 'text-cyan-400', '': 'text-slate-400'
};

const STONE_TEXT_COLORS: Record<string, string> = {
    'KR': 'text-rose-600', 'QN': 'text-slate-900', 'LA': 'text-blue-600', 'TY': 'text-teal-500',
    'TG': 'text-orange-700', 'IA': 'text-red-700', 'BSU': 'text-slate-800', 'GSU': 'text-emerald-800',
    'RSU': 'text-rose-800', 'MA': 'text-emerald-600', 'FI': 'text-slate-400', 'OP': 'text-indigo-500',
    'NF': 'text-green-700', 'CO': 'text-orange-400', 'PCO': 'text-emerald-400', 'MCO': 'text-purple-500',
    'PAX': 'text-green-500', 'MAX': 'text-blue-700', 'KAX': 'text-red-700', 'AI': 'text-slate-500',
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
  const { data: customers } = useQuery({ queryKey: ['customers'], queryFn: api.getCustomers });
  const { data: batches, isLoading: loadingBatches } = useQuery({ queryKey: ['batches'], queryFn: api.getProductionBatches });

  const [isCreating, setIsCreating] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [vatRate, setVatRate] = useState<number>(VatRegime.Standard);
  
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerResults, setShowCustomerResults] = useState(false);

  // --- SMART ENTRY STATE ---
  const [scanInput, setScanInput] = useState('');
  const [scanQty, setScanQty] = useState(1);
  const [itemNotes, setItemNotes] = useState('');
  const [candidateProducts, setCandidateProducts] = useState<Product[]>([]);
  const [activeMasterProduct, setActiveMasterProduct] = useState<Product | null>(null);
  const [filteredVariants, setFilteredVariants] = useState<{variant: ProductVariant, suffix: string, desc: string}[]>([]);
  const [selectedSize, setSelectedSize] = useState('');
  const [sizeMode, setSizeMode] = useState<{ type: 'Νούμερο' | 'Μήκος', sizes: string[] } | null>(null);
  
  const inputRef = useRef<HTMLInputElement>(null);

  const [selectedItems, setSelectedItems] = useState<OrderItem[]>([]);

  const [managingOrder, setManagingOrder] = useState<Order | null>(null);
  const [moveBatchState, setMoveBatchState] = useState<{ batch: ProductionBatch; targetStage: ProductionStage } | null>(null);
  const [isProcessingMove, setIsProcessingMove] = useState(false);
  const [printModalOrder, setPrintModalOrder] = useState<Order | null>(null);

  // --- AUTOSAVE EFFECT ---
  // Load draft on mount (only if creating a NEW order, not editing existing)
  useEffect(() => {
    if (isCreating && !editingOrder) {
        const savedDraft = localStorage.getItem(DRAFT_ORDER_KEY);
        if (savedDraft) {
            try {
                const draft = JSON.parse(savedDraft);
                setCustomerName(draft.customerName || '');
                setCustomerPhone(draft.customerPhone || '');
                setSelectedCustomerId(draft.selectedCustomerId || null);
                setOrderNotes(draft.orderNotes || '');
                setVatRate(draft.vatRate !== undefined ? draft.vatRate : VatRegime.Standard);
                setSelectedItems(draft.selectedItems || []);
                showToast("Ανακτήθηκε πρόχειρη παραγγελία.", "info");
            } catch (e) {
                console.error("Failed to load draft order", e);
            }
        }
    }
  }, [isCreating, editingOrder]);

  // Save draft on change (only if creating new order)
  useEffect(() => {
    if (isCreating && !editingOrder) {
        const draftData = {
            customerName,
            customerPhone,
            selectedCustomerId,
            orderNotes,
            vatRate,
            selectedItems,
            timestamp: Date.now()
        };
        localStorage.setItem(DRAFT_ORDER_KEY, JSON.stringify(draftData));
    }
  }, [isCreating, editingOrder, customerName, customerPhone, selectedCustomerId, orderNotes, vatRate, selectedItems]);

  const clearDraft = () => {
      localStorage.removeItem(DRAFT_ORDER_KEY);
  };

  const enrichedBatches = useMemo(() => {
      const ZIRCON_CODES = ['LE', 'PR', 'AK', 'MP', 'KO', 'MV', 'RZ'];
      return batches?.map(b => {
          const prod = products.find(p => p.sku === b.sku);
          const suffix = b.variant_suffix || '';
          const hasZircons = ZIRCON_CODES.some(code => suffix.includes(code)) || 
                             prod?.recipe.some(r => {
                                 if (r.type !== 'raw') return false;
                                 const material = materials.find(m => m.id === r.id);
                                 return material?.type === MaterialType.Stone && ZIRCON_CODES.some(code => material.name.includes(code));
                             }) || false;

          return { ...b, product_details: prod, requires_setting: hasZircons }
      }) || [];
  }, [batches, products, materials]);

  const filteredCustomers = customers?.filter(c => 
      c.full_name.toLowerCase().includes(customerSearch.toLowerCase()) || (c.phone && c.phone.includes(customerSearch))
  ).slice(0, 5) || [];

  const handleSelectCustomer = (c: Customer) => {
      setSelectedCustomerId(c.id);
      setCustomerName(c.full_name);
      setCustomerPhone(c.phone || '');
      setCustomerSearch('');
      setShowCustomerResults(false);
  };

  const handleEditOrder = (order: Order) => {
      setEditingOrder(order);
      setCustomerName(order.customer_name);
      setCustomerPhone(order.customer_phone || '');
      setSelectedCustomerId(order.customer_id || null);
      setOrderNotes(order.notes || '');
      setVatRate(order.vat_rate !== undefined ? order.vat_rate : VatRegime.Standard);
      setSelectedItems(JSON.parse(JSON.stringify(order.items)));
      setIsCreating(true);
  };

  const SkuPartVisualizer = ({ text, masterContext }: { text: string, masterContext: Product | null }) => {
      let masterStr = text;
      let suffixStr = '';

      if (masterContext) {
          const masterLen = masterContext.sku.length;
          if (text.startsWith(masterContext.sku)) {
              masterStr = text.slice(0, masterLen);
              suffixStr = text.slice(masterLen);
          }
      } else {
          const split = splitSkuComponents(text);
          masterStr = split.master;
          suffixStr = split.suffix;
      }

      const { finish, stone } = getVariantComponents(suffixStr, masterContext?.gender);
      const fColor = FINISH_COLORS[finish.code] || 'text-slate-400';
      const sColor = STONE_TEXT_COLORS[stone.code] || 'text-emerald-400';

      const renderSuffixChars = () => {
          return suffixStr.split('').map((char, i) => {
              let colorClass = 'text-slate-400';
              if (finish.code && i < finish.code.length) colorClass = fColor;
              else if (stone.code && i >= (suffixStr.length - stone.code.length)) colorClass = sColor;
              return <span key={i} className={colorClass}>{char}</span>
          });
      };

      return (
          <span>
              <span className="text-slate-900 font-black">{masterStr}</span>
              <span className="font-black">{renderSuffixChars()}</span>
          </span>
      );
  };

  const SkuVisualizer = () => {
      return (
          <div className="absolute inset-y-0 left-0 p-3.5 pointer-events-none font-mono text-xl tracking-wider flex items-center overflow-hidden z-20">
              <SkuPartVisualizer text={scanInput} masterContext={activeMasterProduct} />
          </div>
      );
  };

  const handleSmartInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value.toUpperCase();
    
    // Split input by space to detect SKU and Size parts (e.g. "RN100 52")
    const parts = rawVal.split(/\s+/);
    const skuPart = parts[0];
    const sizePart = parts.length > 1 ? parts[1] : '';

    setScanInput(rawVal); // Keep full visual input including space

    if (skuPart.length < 2) {
        setCandidateProducts([]);
        setActiveMasterProduct(null);
        setFilteredVariants([]);
        setSizeMode(null);
        return;
    }

    let bestMaster: Product | null = null;
    let suffixPart = '';
    
    const exactMaster = products.find(p => p.sku === skuPart && !p.is_component);
    const potentialMasters = products.filter(p => skuPart.startsWith(p.sku) && !p.is_component);
    const longestPrefixMaster = potentialMasters.sort((a,b) => b.sku.length - a.sku.length)[0];

    if (exactMaster) {
        bestMaster = exactMaster;
        suffixPart = '';
    } else if (longestPrefixMaster) {
        bestMaster = longestPrefixMaster;
        suffixPart = skuPart.replace(longestPrefixMaster.sku, '');
    }

    let candidates: Product[] = [];
    if (bestMaster) {
        candidates = [bestMaster]; 
    } else {
        candidates = products.filter(p => !p.is_component).filter(p => {
            if (p.sku.startsWith(skuPart)) return true;
            if (skuPart.length >= 3 && p.sku.includes(skuPart)) return true;
            return false;
        }).sort((a, b) => {
            const aExact = a.sku === skuPart;
            const bExact = b.sku === skuPart;
            if (aExact && !bExact) return -1;
            if (!aExact && bExact) return 1;

            const aStarts = a.sku.startsWith(skuPart);
            const bStarts = b.sku.startsWith(skuPart);
            if (aStarts && !bStarts) return -1;
            if (!aStarts && bStarts) return 1;

            if (a.sku.length !== b.sku.length) return a.sku.length - b.sku.length;
            return a.sku.localeCompare(b.sku);
        }).slice(0, 6);
    }
    setCandidateProducts(candidates);

    if (bestMaster) {
        setActiveMasterProduct(bestMaster);
        const sizing = getSizingInfo(bestMaster);
        setSizeMode(sizing);
        
        // AUTO-SELECT SIZE if entered after space
        if (sizing && sizePart) {
             const matchedSize = sizing.sizes.find(s => s === sizePart || (sizing.type === 'Μήκος' && s.startsWith(sizePart)));
             if (matchedSize) {
                 setSelectedSize(matchedSize);
             }
        } else if (!sizePart) {
             // Reset size if backspaced
             setSelectedSize('');
        }

        if (bestMaster.variants) {
            const validVariants = bestMaster.variants
                .filter(v => v.suffix.startsWith(suffixPart))
                .map(v => ({ variant: v, suffix: v.suffix, desc: v.description }));
            setFilteredVariants(validVariants);
        } else {
            setFilteredVariants([]);
        }
    } else {
        setActiveMasterProduct(null);
        setFilteredVariants([]);
        setSizeMode(null);
        setSelectedSize('');
    }
  };

  const selectProductCandidate = (product: Product) => {
    setScanInput(product.sku);
    setActiveMasterProduct(product);
    setCandidateProducts([product]);
    setSizeMode(getSizingInfo(product));
    if (product.variants) {
        setFilteredVariants(product.variants.map(v => ({ variant: v, suffix: v.suffix, desc: v.description })));
    } else {
        setFilteredVariants([]);
    }
    inputRef.current?.focus();
  };

  const selectVariant = (variant: ProductVariant) => {
    const fullCode = activeMasterProduct!.sku + variant.suffix;
    setScanInput(fullCode);
    setFilteredVariants([]); 
    inputRef.current?.focus();
  };

  const executeAddItem = () => {
    // Trim input to ignore size part if typed after space, as we used it to set selectedSize state already
    const skuCode = scanInput.split(/\s+/)[0]; 

    if (!skuCode) return;
    const match = findProductByScannedCode(skuCode, products);
    
    if (!match) {
        showToast(`Ο κωδικός ${skuCode} δεν βρέθηκε.`, "error");
        return;
    }

    const { product, variant } = match;

    if (product.is_component) {
        showToast(`Το ${product.sku} είναι εξάρτημα και δεν διατίθεται για πώληση.`, "error");
        return;
    }

    const unitPrice = variant?.selling_price || product.selling_price || 0;

    const newItem: OrderItem = {
        sku: product.sku,
        variant_suffix: variant?.suffix,
        quantity: scanQty,
        price_at_order: unitPrice,
        product_details: product,
        size_info: selectedSize || undefined,
        notes: itemNotes || undefined
    };

    setSelectedItems(prev => {
        const existingIdx = prev.findIndex(i => 
            i.sku === newItem.sku && 
            i.variant_suffix === newItem.variant_suffix && 
            i.size_info === newItem.size_info &&
            i.notes === newItem.notes
        );
        if (existingIdx >= 0) {
            const updated = [...prev];
            updated[existingIdx].quantity += scanQty;
            return updated;
        }
        return [newItem, ...prev];
    });

    setScanInput('');
    setScanQty(1);
    setItemNotes('');
    setSelectedSize('');
    setCandidateProducts([]);
    setActiveMasterProduct(null);
    setFilteredVariants([]);
    setSizeMode(null);
    inputRef.current?.focus();
    showToast("Το προϊόν προστέθηκε.", "success");
  };

  const updateQuantity = (index: number, qty: number) => {
      if (qty <= 0) {
          setSelectedItems(selectedItems.filter((_, i) => i !== index));
      } else {
          const updated = [...selectedItems];
          updated[index].quantity = qty;
          setSelectedItems(updated);
      }
  };

  const updateItemNotes = (index: number, notes: string) => {
      const updated = [...selectedItems];
      updated[index].notes = notes || undefined;
      setSelectedItems(updated);
  };

  const calculateTotal = () => selectedItems.reduce((acc, item) => acc + (item.price_at_order * item.quantity), 0);
  const vatAmount = calculateTotal() * vatRate;
  const grandTotal = calculateTotal() + vatAmount;

  const handleSaveOrder = async () => {
      if (!customerName) { showToast("Το όνομα πελάτη είναι υποχρεωτικό.", 'error'); return; }
      if (selectedItems.length === 0) { showToast("Προσθέστε τουλάχιστον ένα προϊόν.", 'error'); return; }

      try {
          if (editingOrder) {
              const updatedOrder: Order = {
                  ...editingOrder,
                  customer_id: selectedCustomerId || undefined,
                  customer_name: customerName,
                  customer_phone: customerPhone,
                  items: selectedItems,
                  total_price: grandTotal, // Should include VAT in stored total if necessary, or check backend logic. Usually total_price is final.
                  vat_rate: vatRate,
                  notes: orderNotes
              };
              await api.updateOrder(updatedOrder);
              showToast('Η παραγγελία ενημερώθηκε.', 'success');
          } else {
              const now = new Date();
              const year = now.getFullYear().toString().slice(-2);
              const month = (now.getMonth() + 1).toString().padStart(2, '0');
              const day = now.getDate().toString().padStart(2, '0');
              const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
              const newOrderId = `ORD-${year}${month}${day}-${random}`;

              const newOrder: Order = {
                  id: newOrderId,
                  customer_id: selectedCustomerId || undefined,
                  customer_name: customerName,
                  customer_phone: customerPhone,
                  created_at: new Date().toISOString(),
                  status: OrderStatus.Pending,
                  items: selectedItems,
                  total_price: grandTotal,
                  vat_rate: vatRate,
                  notes: orderNotes
              };
              await api.saveOrder(newOrder);
              showToast('Η παραγγελία δημιουργήθηκε.', 'success');
          }
          queryClient.invalidateQueries({ queryKey: ['orders'] });
          clearDraft(); // Clear autosave on success
          setIsCreating(false);
          setEditingOrder(null);
      } catch (err: any) {
          showToast(`Σφάλμα: ${err.message}`, 'error');
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

  const handleScanInOrder = (code: string) => {
    const match = findProductByScannedCode(code, products);
    if (match) {
        if (match.product.is_component) {
            showToast("Δεν επιτρέπεται η προσθήκη εξαρτημάτων στην εντολή.", "error");
        } else {
            const targetCode = match.product.sku + (match.variant?.suffix || '');
            setScanInput(targetCode);
            showToast(`Σάρωση: ${targetCode}`, 'success');
            setShowScanner(false);
            executeAddItem();
        }
    } else {
        showToast(`Ο κωδικός ${code} δεν βρέθηκε.`, 'error');
    }
  };

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
          <button onClick={() => { setEditingOrder(null); setIsCreating(true); setCustomerName(''); setCustomerPhone(''); setOrderNotes(''); setSelectedItems([]); setVatRate(VatRegime.Standard); clearDraft(); }} className="flex items-center gap-2 bg-[#060b00] text-white px-5 py-3 rounded-xl hover:bg-black font-bold shadow-lg shadow-slate-200 transition-all hover:-translate-y-0.5">
              <Plus size={20} /> Νέα Παραγγελία
          </button>
      </div>

      {isCreating ? (
          <div className="bg-white rounded-3xl shadow-lg border border-slate-100 flex flex-col overflow-hidden animate-in slide-in-from-right duration-300 flex-1">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
                  <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                      {editingOrder ? <Edit size={24} className="text-emerald-600"/> : <Plus size={24} className="text-[#060b00]"/>}
                      {editingOrder ? `Επεξεργασία Παραγγελίας #${editingOrder.id}` : 'Δημιουργία Παραγγελίας'}
                  </h2>
                  <button onClick={() => { setIsCreating(false); setEditingOrder(null); clearDraft(); }} className="p-2 hover:bg-slate-200 rounded-full text-slate-500 transition-colors"><X size={20}/></button>
              </div>
              <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1 overflow-hidden">
                  
                  <div className="lg:col-span-3 space-y-6 overflow-y-auto pr-2 custom-scrollbar border-r border-slate-50">
                      <div className="space-y-4">
                          <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide">Στοιχεία Πελάτη</label>
                          <div className="relative">
                              <Users className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
                              <input 
                                type="text" 
                                placeholder="Αναζήτηση Πελάτη..." 
                                value={customerName || customerSearch} 
                                onChange={e => { setCustomerSearch(e.target.value); setCustomerName(e.target.value); setShowCustomerResults(true); if (!e.target.value) setSelectedCustomerId(null); }}
                                onFocus={() => setShowCustomerResults(true)}
                                className={`w-full pl-10 p-3.5 border rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-white transition-all ${selectedCustomerId ? 'border-emerald-300 ring-2 ring-emerald-50 text-emerald-900 font-bold' : 'border-slate-200'}`}
                              />
                              {showCustomerResults && customerSearch && !selectedCustomerId && (
                                  <div className="absolute top-full left-0 right-0 bg-white shadow-xl rounded-xl border border-slate-100 mt-2 z-50 max-h-40 overflow-y-auto">
                                      {filteredCustomers.map(c => (
                                          <div key={c.id} onClick={() => handleSelectCustomer(c)} className="p-3 hover:bg-slate-50 cursor-pointer border-b border-slate-50 last:border-0 text-sm font-bold text-slate-800">
                                              {c.full_name}
                                          </div>
                                      ))}
                                  </div>
                              )}
                          </div>
                          <div className="relative">
                              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
                              <input type="text" placeholder="Τηλέφωνο" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} className="w-full pl-10 p-3.5 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 transition-all"/>
                          </div>
                          <div>
                              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">Καθεστώς ΦΠΑ</label>
                              <select 
                                  value={vatRate} 
                                  onChange={(e) => setVatRate(parseFloat(e.target.value))} 
                                  className="w-full p-3.5 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-slate-700"
                              >
                                  <option value={VatRegime.Standard}>24% (Κανονικό)</option>
                                  <option value={VatRegime.Reduced}>17% (Μειωμένο)</option>
                                  <option value={VatRegime.Zero}>0% (Μηδενικό)</option>
                              </select>
                          </div>
                      </div>
                      <div className="space-y-2">
                          <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide">Σημειώσεις Παραγγελίας</label>
                          <textarea value={orderNotes} onChange={e => setOrderNotes(e.target.value)} placeholder="Ειδικές οδηγίες για όλη την παραγγελία..." className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 text-sm h-24 resize-none transition-all"/>
                      </div>
                      <div className="bg-emerald-50 p-6 rounded-2xl border border-emerald-200 shadow-sm sticky bottom-0 space-y-2">
                          <div className="flex justify-between items-center text-emerald-800/70 text-sm">
                             <span className="font-bold">Καθαρή Αξία</span>
                             <span className="font-bold font-mono">{calculateTotal().toFixed(2)}€</span>
                          </div>
                          <div className="flex justify-between items-center text-emerald-800/70 text-sm border-b border-emerald-200 pb-2">
                             <span className="font-bold">Φ.Π.Α. ({(vatRate*100).toFixed(0)}%)</span>
                             <span className="font-bold font-mono">{vatAmount.toFixed(2)}€</span>
                          </div>
                          <div className="flex justify-between items-center mb-4">
                             <span className="font-bold text-emerald-900 text-sm uppercase">Γενικο Συνολο</span>
                             <span className="font-black text-3xl text-emerald-700">{grandTotal.toFixed(2)}€</span>
                          </div>
                          <button onClick={handleSaveOrder} className="w-full bg-[#060b00] text-white py-3.5 rounded-xl font-bold hover:bg-black transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2">
                              {editingOrder ? <><Save size={18}/> Ενημέρωση</> : <><Plus size={18}/> Καταχώρηση</>}
                          </button>
                      </div>
                  </div>

                  <div className="lg:col-span-5 flex flex-col h-full bg-slate-50/50 rounded-[2.5rem] border border-slate-200 p-6 shadow-inner overflow-y-auto custom-scrollbar">
                      {/* ... Smart Entry Section ... */}
                      <div className="flex items-center gap-3 mb-6">
                          <div className="p-2.5 bg-[#060b00] text-white rounded-xl shadow-lg"><ScanBarcode size={22} className="animate-pulse" /></div>
                          <h2 className="font-black text-slate-800 uppercase tracking-tighter text-lg">Έξυπνη Ταχεία Προσθήκη</h2>
                      </div>

                      <div className="space-y-6">
                          <div className="grid grid-cols-12 gap-4 items-end">
                              <div className="col-span-9 relative">
                                  <label className="text-[10px] text-slate-400 font-black uppercase mb-1.5 ml-1 block tracking-widest">Κωδικός / SKU</label>
                                  <div className="relative">
                                      <SkuVisualizer />
                                      <input 
                                          ref={inputRef} type="text" value={scanInput} onChange={handleSmartInput}
                                          onKeyDown={e => e.key === 'Enter' && executeAddItem()}
                                          placeholder="Πληκτρολογήστε..."
                                          className="w-full p-3.5 bg-white text-transparent caret-slate-800 font-mono text-xl font-black rounded-2xl border border-slate-200 outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 uppercase tracking-widest shadow-sm relative z-10"
                                      />
                                  </div>
                              </div>
                              <div className="col-span-3">
                                  <label className="text-[10px] text-slate-400 font-black uppercase mb-1.5 ml-1 block tracking-widest">Ποσ.</label>
                                  <input 
                                    type="number" min="1" value={scanQty} 
                                    onChange={e => setScanQty(parseInt(e.target.value)||1)} 
                                    onKeyDown={e => e.key === 'Enter' && executeAddItem()}
                                    className="w-full p-3.5 text-center font-black text-xl rounded-2xl outline-none bg-white border border-slate-200 focus:ring-4 focus:ring-emerald-500/10 shadow-sm"
                                  />
                              </div>
                          </div>

                          {candidateProducts.length > 0 && !activeMasterProduct && (
                              <div className="animate-in fade-in slide-in-from-top-2">
                                  <label className="text-[9px] text-slate-400 font-bold uppercase mb-2 ml-1 block tracking-widest">ΠΡΟΤΑΣΕΙΣ ΑΝΑΖΗΤΗΣΗΣ</label>
                                  <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                                      {candidateProducts.map(p => (
                                          <div key={p.sku} onClick={() => selectProductCandidate(p)} className="flex items-center gap-3 p-2 bg-white rounded-xl border border-slate-200 cursor-pointer hover:border-emerald-500 min-w-[160px] shadow-sm transition-all group">
                                              <div className="w-10 h-10 bg-slate-50 rounded-lg overflow-hidden shrink-0 border border-slate-100">{p.image_url ? <img src={p.image_url} className="w-full h-full object-cover"/> : <ImageIcon size={16} className="m-auto text-slate-300"/>}</div>
                                              <div className="min-w-0">
                                                  <div className="font-black text-sm text-slate-800 leading-none group-hover:text-emerald-700 transition-colors">{p.sku}</div>
                                                  <div className="text-[10px] text-slate-400 truncate">{p.category}</div>
                                              </div>
                                          </div>
                                      ))}
                                  </div>
                              </div>
                          )}

                          {activeMasterProduct && (
                              <div className="bg-white p-5 rounded-3xl border border-emerald-100 shadow-xl animate-in zoom-in-95 space-y-6">
                                  <div className="flex justify-between items-start">
                                      <div className="flex items-center gap-3">
                                          <div className="w-12 h-12 bg-slate-100 rounded-xl overflow-hidden border border-slate-200">{activeMasterProduct.image_url ? <img src={activeMasterProduct.image_url} className="w-full h-full object-cover"/> : <ImageIcon className="m-3 text-slate-300"/>}</div>
                                          <div><h3 className="font-black text-xl text-slate-900 leading-none">{activeMasterProduct.sku}</h3><p className="text-xs text-slate-500 font-bold mt-1 uppercase">{activeMasterProduct.category}</p></div>
                                      </div>
                                      <button onClick={() => { setActiveMasterProduct(null); setScanInput(''); setFilteredVariants([]); setSelectedSize(''); }} className="p-2 bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"><X size={16}/></button>
                                  </div>

                                  {sizeMode && (
                                      <div>
                                          <label className="text-[10px] font-black text-slate-400 uppercase mb-2 ml-1 block flex items-center gap-1">
                                              <Hash size={12}/> Επιλογή {sizeMode.type} <span className="font-normal text-slate-300 normal-case">(Προαιρετικό)</span>
                                          </label>
                                          <div className="flex flex-wrap gap-2">
                                              {sizeMode.sizes.map(s => (
                                                  <button key={s} onClick={() => setSelectedSize(s === selectedSize ? '' : s)} className={`px-3 py-2 rounded-xl text-sm font-bold border transition-all ${selectedSize === s ? 'bg-slate-900 text-white border-slate-900 shadow-md transform scale-105' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}>{s}</button>
                                              ))}
                                          </div>
                                      </div>
                                  )}

                                  {filteredVariants.length > 0 && (
                                      <div>
                                          <label className="text-[10px] font-black text-slate-400 uppercase mb-2 ml-1 block flex items-center gap-1"><Layers size={12}/> ΠΑΡΑΛΛΑΓΕΣ</label>
                                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                              {filteredVariants.map(v => {
                                                  const { finish, stone } = getVariantComponents(v.suffix, activeMasterProduct.gender);
                                                  return (
                                                      <button key={v.suffix} onClick={() => selectVariant(v.variant)} className={`p-3 rounded-xl border transition-all flex flex-col items-center gap-1 shadow-sm active:scale-95 bg-white border-slate-100 hover:border-emerald-500`}>
                                                          <span className={`text-sm font-black flex items-center gap-0.5`}>
                                                              <span className={FINISH_COLORS[finish.code] || 'text-slate-400'}>{finish.code || 'BAS'}</span>
                                                              <span className={STONE_TEXT_COLORS[stone.code] || 'text-emerald-500'}>{stone.code}</span>
                                                          </span>
                                                          <span className="text-[9px] font-bold text-slate-400 truncate w-full text-center">{v.desc || 'Variant'}</span>
                                                      </button>
                                                  );
                                              })}
                                          </div>
                                      </div>
                                  )}

                                  <div>
                                      <label className="text-[10px] font-black text-slate-400 uppercase mb-2 ml-1 block flex items-center gap-1">
                                          <StickyNote size={12}/> ΕΙΔΙΚΕΣ ΠΑΡΑΤΗΡΗΣΕΙΣ ΕΙΔΟΥΣ
                                      </label>
                                      <input 
                                          type="text" 
                                          value={itemNotes} 
                                          onChange={e => setItemNotes(e.target.value)}
                                          onKeyDown={e => e.key === 'Enter' && executeAddItem()}
                                          placeholder="π.χ. Αλλαγή κουμπώματος, Μακρύτερη αλυσίδα..."
                                          className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 text-sm transition-all"
                                      />
                                  </div>

                                  <button onClick={executeAddItem} className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-black shadow-lg shadow-emerald-100 active:scale-95 transition-all flex items-center justify-center gap-2 hover:bg-emerald-700">
                                      <Plus size={24}/> Προσθήκη στην Εντολή
                                  </button>
                              </div>
                          )}
                      </div>
                  </div>

                  <div className="lg:col-span-4 flex flex-col h-full overflow-hidden">
                      <div className="flex justify-between items-center mb-3 px-2 shrink-0">
                          <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Περιεχόμενα Εντολής ({selectedItems.length})</label>
                          <button onClick={() => setShowScanner(true)} className="flex items-center gap-1 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-xl border border-blue-200 transition-all active:scale-95"><Camera size={14}/> Camera Scan</button>
                      </div>
                      <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar bg-white rounded-3xl border border-slate-100 p-2 shadow-inner">
                          {selectedItems.map((item, idx) => (
                              <div key={idx} className="bg-white p-3 rounded-2xl border border-slate-50 shadow-sm flex flex-col gap-2 animate-in slide-in-from-right-4 transition-all hover:shadow-md">
                                  <div className="flex items-center justify-between gap-4">
                                      <div className="flex items-center gap-3 min-w-0">
                                          <div className="w-10 h-10 bg-slate-50 rounded-lg overflow-hidden shrink-0 border border-slate-100">{item.product_details?.image_url && <img src={item.product_details.image_url} className="w-full h-full object-cover"/>}</div>
                                          <div className="min-w-0">
                                              <div className="font-black text-slate-800 text-sm leading-none truncate">{item.sku}<span className="text-emerald-600">{item.variant_suffix}</span></div>
                                              <div className="text-[10px] text-slate-500 font-bold mt-1 flex items-center gap-1">{formatCurrency(item.price_at_order)} {item.size_info && <span className="bg-slate-100 px-1 rounded">SZ: {item.size_info}</span>}</div>
                                          </div>
                                      </div>
                                      <div className="flex items-center gap-2">
                                          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
                                              <button onClick={() => updateQuantity(idx, item.quantity - 1)} className="p-1 hover:bg-white rounded shadow-sm text-slate-600"><Minus size={12}/></button>
                                              <span className="w-6 text-center font-black text-sm">{item.quantity}</span>
                                              <button onClick={() => updateQuantity(idx, item.quantity + 1)} className="p-1 hover:bg-white rounded shadow-sm text-slate-600"><Plus size={12}/></button>
                                          </div>
                                          <button onClick={() => updateQuantity(idx, 0)} className="p-2 text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={16}/></button>
                                      </div>
                                  </div>
                                  
                                  <div className="relative group/note">
                                      <input 
                                          type="text" 
                                          value={item.notes || ''} 
                                          onChange={e => updateItemNotes(idx, e.target.value)}
                                          placeholder="Προσθήκη παρατήρησης είδους..."
                                          className="w-full pl-7 py-1.5 text-[10px] bg-slate-50/50 border border-transparent hover:border-slate-200 focus:border-emerald-300 focus:bg-white rounded-lg outline-none font-medium text-slate-600 transition-all placeholder:italic"
                                      />
                                      <StickyNote size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-300 group-hover/note:text-emerald-400" />
                                  </div>
                              </div>
                          ))}
                          {selectedItems.length === 0 && (
                            <div className="flex flex-col items-center justify-center h-full text-slate-300 italic py-10"><ShoppingCart size={48} className="opacity-20 mb-4"/><p className="text-sm font-bold">Το καλάθι είναι άδειο.</p></div>
                          )}
                      </div>
                  </div>
              </div>
          </div>
      ) : (
          <div className="flex-1 overflow-auto">
            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs">
                        <tr>
                            <th className="p-4 pl-6">ID</th>
                            <th className="p-4">Πελάτης</th>
                            <th className="p-4">Ημερομηνία</th>
                            <th className="p-4 text-right">Ποσό</th>
                            <th className="p-4">Κατάσταση</th>
                            <th className="p-4"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {orders?.map(order => (
                            <tr key={order.id} className="hover:bg-slate-50/80 transition-colors group">
                                <td className="p-4 pl-6 font-mono font-bold text-slate-800">{order.id}</td>
                                <td className="p-4 text-slate-800 font-medium">{order.customer_name}</td>
                                <td className="p-4 text-slate-500">{new Date(order.created_at).toLocaleDateString('el-GR')}</td>
                                <td className="p-4 text-right font-bold text-slate-800">{order.total_price.toFixed(2)}€</td>
                                <td className="p-4"><span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${getStatusColor(order.status)}`}>{STATUS_TRANSLATIONS[order.status]}</span></td>
                                <td className="p-4 text-right">
                                    <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => setManagingOrder(order)} title="Διαχείριση" className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg"><Settings size={16}/></button>
                                        <button onClick={() => setPrintModalOrder(order)} title="Εκτύπωση Εντολών" className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg"><Printer size={16}/></button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
          </div>
      )}

      {showScanner && <BarcodeScanner onScan={handleScanInOrder} onClose={() => setShowScanner(false)} />}
      
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
