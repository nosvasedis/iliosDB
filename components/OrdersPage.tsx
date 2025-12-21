
import React, { useState, useMemo } from 'react';
import { Order, OrderStatus, Product, ProductVariant, OrderItem, ProductionStage, ProductionBatch, Material, MaterialType, Customer, BatchType, ProductionType } from '../types';
import { ShoppingCart, Plus, Search, Calendar, Phone, User, CheckCircle, Package, ArrowRight, X, Loader2, Factory, Users, ScanBarcode, Camera, Printer, AlertTriangle, PackageCheck, PackageX, Trash2, Settings, RefreshCcw, LayoutList, Edit, Save, Ruler, ChevronDown, BookOpen, Hammer, Flame, Gem, Tag, Globe, FileText } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, supabase, SYSTEM_IDS, recordStockMovement } from '../lib/supabase';
import { useUI } from './UIProvider';
import BarcodeScanner from './BarcodeScanner';
import { getSizingInfo, isSizable } from '../utils/sizing';

interface Props {
  products: Product[];
  onPrintOrder?: (order: Order) => void;
  materials: Material[];
  onPrintAggregated: (batches: ProductionBatch[], orderDetails?: { orderId: string, customerName: string }) => void;
  onPrintPreparation: (batches: ProductionBatch[]) => void;
  onPrintTechnician: (batches: ProductionBatch[]) => void;
}

const STATUS_TRANSLATIONS: Record<OrderStatus, string> = {
    [OrderStatus.Pending]: 'Εκκρεμεί',
    [OrderStatus.InProduction]: 'Σε Παραγωγή',
    [OrderStatus.Ready]: 'Έτοιμο',
    [OrderStatus.Delivered]: 'Παραδόθηκε',
    [OrderStatus.Cancelled]: 'Ακυρώθηκε',
};

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

const PrintOptionsModal = ({ order, onClose, onPrintOrder, onPrintAggregated, onPrintPreparation, onPrintTechnician, allBatches, showToast }: {
    order: Order;
    onClose: () => void;
    onPrintOrder?: (order: Order) => void;
    onPrintAggregated: (batches: ProductionBatch[], orderDetails?: { orderId: string, customerName: string }) => void;
    onPrintPreparation: (batches: ProductionBatch[]) => void;
    onPrintTechnician: (batches: ProductionBatch[]) => void;
    allBatches: ProductionBatch[] | undefined;
    showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}) => {
    const orderBatches = useMemo(() => allBatches?.filter(b => b.order_id === order.id) || [], [allBatches, order.id]);

    const handlePrintOrder = () => {
        onPrintOrder?.(order);
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
        blue: { bg: 'bg-blue-50', text: 'text-blue-700', hover: 'hover:bg-blue-100', border: 'border-blue-200' },
        purple: { bg: 'bg-purple-50', text: 'text-purple-700', hover: 'hover:bg-purple-100', border: 'border-purple-200' },
        orange: { bg: 'bg-orange-50', text: 'text-orange-700', hover: 'hover:bg-orange-100', border: 'border-orange-200' },
    };

    return (
        <div className="fixed inset-0 z-[150] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800">Επιλογές Εκτύπωσης</h2>
                        <p className="text-sm text-slate-500 font-mono font-bold">Παραγγελία #{order.id}</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-500"><X size={20}/></button>
                </div>
                <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                                <span className="text-sm">{opt.label}</span>
                            </button>
                        );
                    })}
                </div>
                {productionSheetsDisabled && (
                    <div className="px-6 pb-6 -mt-2">
                        <p className="text-xs text-center text-slate-400 bg-slate-50 p-2 rounded-lg border border-slate-100">
                            Οι εκτυπώσεις παραγωγής είναι διαθέσιμες μόνο για παραγγελίες που έχουν σταλθεί στην παραγωγή.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};


export default function OrdersPage({ products, onPrintOrder, materials, onPrintAggregated, onPrintPreparation, onPrintTechnician }: Props) {
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
  
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerResults, setShowCustomerResults] = useState(false);

  const [selectedItems, setSelectedItems] = useState<OrderItem[]>([]);
  const [productSearch, setProductSearch] = useState('');

  const [fulfillmentOrder, setFulfillmentOrder] = useState<Order | null>(null);
  const [managingOrder, setManagingOrder] = useState<Order | null>(null);
  
  const [moveBatchState, setMoveBatchState] = useState<{ batch: ProductionBatch; targetStage: ProductionStage } | null>(null);
  const [isProcessingMove, setIsProcessingMove] = useState(false);
  
  const [printModalOrder, setPrintModalOrder] = useState<Order | null>(null);

  const enrichedBatches = useMemo(() => {
      return batches?.map(b => ({
          ...b,
          product_details: products.find(p => p.sku === b.sku)
      })) || [];
  }, [batches, products]);


  const filteredProducts = products.filter(p => 
      !p.is_component && (p.sku.includes(productSearch.toUpperCase()) || p.category.toLowerCase().includes(productSearch.toLowerCase()))
  ).slice(0, 5); 

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
      setSelectedItems(JSON.parse(JSON.stringify(order.items)));
      setIsCreating(true);
  };

  const handleAddItem = (product: Product, variant?: ProductVariant) => {
      const unitPrice = (variant?.selling_price && variant.selling_price > 0) 
          ? variant.selling_price 
          : (product.selling_price || 0);

      const newItem: OrderItem = {
          sku: product.sku,
          variant_suffix: variant?.suffix,
          quantity: 1,
          price_at_order: unitPrice,
          product_details: product
      };
      
      const existingIdx = selectedItems.findIndex(i => i.sku === newItem.sku && i.variant_suffix === newItem.variant_suffix && !i.size_info);
      
      if (isSizable(product)) {
           setSelectedItems([...selectedItems, newItem]);
      } else if (existingIdx >= 0) {
          const updated = [...selectedItems];
          updated[existingIdx].quantity += 1;
          setSelectedItems(updated);
      } else {
          setSelectedItems([...selectedItems, newItem]);
      }
      setProductSearch('');
  };

  const handleScanItem = (code: string) => {
      let product = products.find(p => p.sku === code);
      let variant = undefined;

      if (product) {
          if (product.variants && product.variants.length > 0) {
              showToast(`Το προϊόν έχει παραλλαγές. Σκανάρετε το barcode της παραλλαγής.`, 'error');
              return;
          }
      } else {
          const potentialProducts = products
            .filter(p => code.startsWith(p.sku))
            .sort((a, b) => b.sku.length - a.sku.length);
          
          if (potentialProducts.length > 0) {
              product = potentialProducts[0];
              const suffix = code.replace(product.sku, '');
              variant = product.variants?.find(v => v.suffix === suffix);
              
              if (!variant && product.variants && product.variants.length > 0) {
                   showToast(`Η παραλλαγή '${suffix}' δεν βρέθηκε για το ${product.sku}`, 'error');
                   return;
              }
          }
      }

      if (!product) {
          showToast(`Ο κωδικός ${code} δεν βρέθηκε`, 'error');
          return;
      }

      handleAddItem(product, variant);
      showToast(`Προστέθηκε: ${product.sku}${variant ? variant.suffix : ''}`, 'success');
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
  
  const updateItemSize = (index: number, size: string) => {
      const updated = [...selectedItems];
      updated[index].size_info = size;
      setSelectedItems(updated);
  };

  const calculateTotal = () => selectedItems.reduce((acc, item) => acc + (item.price_at_order * item.quantity), 0);

  const handleSaveOrder = async () => {
      if (!customerName) {
          showToast("Το όνομα πελάτη είναι υποχρεωτικό.", 'error');
          return;
      }
      if (selectedItems.length === 0) {
          showToast("Προσθέστε τουλάχιστον ένα προϊόν.", 'error');
          return;
      }

      try {
          if (editingOrder) {
              const updatedOrder: Order = {
                  ...editingOrder,
                  customer_id: selectedCustomerId || undefined,
                  customer_name: customerName,
                  customer_phone: customerPhone,
                  items: selectedItems,
                  total_price: calculateTotal(),
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
                  total_price: calculateTotal(),
                  notes: orderNotes
              };

              await api.saveOrder(newOrder);
              showToast('Η παραγγελία δημιουργήθηκε.', 'success');
          }

          queryClient.invalidateQueries({ queryKey: ['orders'] });
          queryClient.invalidateQueries({ queryKey: ['batches'] });
          
          setIsCreating(false);
          setEditingOrder(null);
          setCustomerName(''); 
          setCustomerPhone(''); 
          setOrderNotes('');
          setSelectedItems([]); 
          setSelectedCustomerId(null);

      } catch (err: any) {
          console.error(err);
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
          console.error(err);
          showToast(`Σφάλμα: ${err.message}`, 'error');
      }
  };

  const handleDeleteOrder = async (order: Order) => {
    if (order.status === OrderStatus.InProduction) {
        showToast('Δεν μπορείτε να διαγράψετε μια παραγγελία που βρίσκεται στην παραγωγή.', 'error');
        return;
    }

    const confirmed = await confirm({
        title: 'Διαγραφή Παραγγελίας',
        message: `Είστε σίγουροι ότι θέλετε να διαγράψετε οριστικά την παραγγελία ${order.id};`,
        isDestructive: true,
        confirmText: 'Διαγραφή'
    });

    if (confirmed) {
        try {
            await api.deleteOrder(order.id);
            queryClient.invalidateQueries({ queryKey: ['orders'] });
            showToast('Η παραγγελία διαγράφηκε.', 'success');
        } catch (err: any) {
            showToast(`Σφάλμα διαγραφής: ${err.message}`, 'error');
        }
    }
  };

    const handleUpdateStatus = async (orderId: string, status: OrderStatus) => {
        try {
            await api.updateOrderStatus(orderId, status);
            queryClient.invalidateQueries({ queryKey: ['orders'] });
            const message = status === OrderStatus.Delivered ? 'Η παραγγελία σημειώθηκε ως παραδομένη.' : `Η κατάσταση άλλαξε σε ${STATUS_TRANSLATIONS[status]}.`;
            showToast(message, 'success');
        } catch (err: any) {
            showToast(`Σφάλμα: ${err.message}`, 'error');
        }
    };

    const handleMoveRequest = async (batch: ProductionBatch, targetStage: ProductionStage) => {
        if (batch.current_stage === ProductionStage.AwaitingDelivery) {
            const confirmed = await confirm({
                title: 'Παραλαβή Εισαγόμενου',
                message: `Επιβεβαιώνετε την παραλαβή για την παρτίδα ${batch.sku}${batch.variant_suffix || ''} και τη μετακίνηση στο στάδιο "${targetStage}"?`,
                confirmText: 'Επιβεβαίωση'
            });
            if (!confirmed) return;
            
            setIsProcessingMove(true);
            try {
                await api.updateBatchStage(batch.id, targetStage);
                queryClient.invalidateQueries({ queryKey: ['batches'] });
                queryClient.invalidateQueries({ queryKey: ['orders'] });
                showToast('Η παρτίδα μετακινήθηκε.', 'success');
            } catch (e: any) { showToast(`Σφάλμα: ${e.message}`, 'error'); } 
            finally { setIsProcessingMove(false); }
        } else {
            setMoveBatchState({ batch, targetStage });
        }
    };
    
    const handleConfirmMove = async (quantityToMove: number) => {
        if (!moveBatchState) return;
        const { batch, targetStage } = moveBatchState;
        setIsProcessingMove(true);
        try {
            if (quantityToMove >= batch.quantity) {
                await api.updateBatchStage(batch.id, targetStage);
            } else {
                const originalNewQty = batch.quantity - quantityToMove;
                const { product_details, product_image, diffHours, isDelayed, id, ...dbBatch } = batch;
                const newBatchData = { ...dbBatch, quantity: quantityToMove, current_stage: targetStage, created_at: batch.created_at, updated_at: new Date().toISOString() };
                await api.splitBatch(batch.id, originalNewQty, newBatchData);
            }
            queryClient.invalidateQueries({ queryKey: ['batches'] });
            queryClient.invalidateQueries({ queryKey: ['orders'] });
            showToast('Η παρτίδα μετακινήθηκε.', 'success');
            setMoveBatchState(null);
        } catch (e: any) { showToast(`Σφάλμα: ${e.message}`, 'error'); } 
        finally { setIsProcessingMove(false); }
    };


  const getStatusColor = (status: OrderStatus) => {
      switch(status) {
          case OrderStatus.Pending: return 'bg-slate-100 text-slate-600 border-slate-200';
          case OrderStatus.InProduction: return 'bg-blue-50 text-blue-600 border-blue-200';
          case OrderStatus.Ready: return 'bg-emerald-50 text-emerald-600 border-emerald-200';
          case OrderStatus.Delivered: return 'bg-[#060b00] text-white border-[#060b00]';
          case OrderStatus.Cancelled: return 'bg-red-50 text-red-500 border-red-200';
      }
  };
    
    const getAvailableStock = (item: OrderItem) => {
        const product = products.find(p => p.sku === item.sku);
        if (!product) return 0;

        if (item.variant_suffix) {
            const variant = product.variants?.find(v => v.suffix === item.variant_suffix);
            return variant?.location_stock?.[SYSTEM_IDS.CENTRAL] || variant?.stock_qty || 0;
        }
        return product.location_stock?.[SYSTEM_IDS.CENTRAL] || product.stock_qty || 0;
    };


  if (loadingOrders || loadingBatches) return <div className="flex justify-center p-12"><Loader2 className="animate-spin text-amber-500"/></div>;

  return (
    <div className="space-y-6 h-[calc(100vh-100px)] flex flex-col">
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
          <button onClick={() => { setEditingOrder(null); setIsCreating(true); setCustomerName(''); setCustomerPhone(''); setOrderNotes(''); setSelectedItems([]); }} className="flex items-center gap-2 bg-[#060b00] text-white px-5 py-3 rounded-xl hover:bg-black font-bold shadow-lg shadow-slate-200 transition-all hover:-translate-y-0.5">
              <Plus size={20} /> Νέα Παραγγελία
          </button>
      </div>

      {isCreating ? (
          <div className="bg-white rounded-3xl shadow-lg border border-slate-100 flex flex-col overflow-hidden animate-in slide-in-from-right duration-300 flex-1">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                  <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                      {editingOrder ? <Edit size={24} className="text-emerald-600"/> : <Plus size={24} className="text-[#060b00]"/>}
                      {editingOrder ? `Επεξεργασία Παραγγελίας #${editingOrder.id}` : 'Δημιουργία Παραγγελίας'}
                  </h2>
                  <button onClick={() => { setIsCreating(false); setEditingOrder(null); }} className="p-2 hover:bg-slate-200 rounded-full"><X size={20}/></button>
              </div>
              <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-8 flex-1 overflow-y-auto">
                  <div className="lg:col-span-1 space-y-6">
                      <div className="space-y-4">
                          <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide">Στοιχεία Πελάτη</label>
                          
                          <div className="relative">
                              <div className="relative">
                                  <Users className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
                                  <input 
                                    type="text" 
                                    placeholder="Αναζήτηση Πελάτη ή Όνομα..." 
                                    value={customerName || customerSearch} 
                                    onChange={e => {
                                        setCustomerSearch(e.target.value);
                                        setCustomerName(e.target.value);
                                        setShowCustomerResults(true);
                                        if (!e.target.value) setSelectedCustomerId(null);
                                    }}
                                    onFocus={() => setShowCustomerResults(true)}
                                    className={`w-full pl-10 p-3.5 border rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-white transition-all ${selectedCustomerId ? 'border-emerald-300 ring-2 ring-emerald-50 text-emerald-900 font-bold' : 'border-slate-200'}`}
                                  />
                                  {selectedCustomerId && (
                                      <button onClick={() => { setSelectedCustomerId(null); setCustomerName(''); setCustomerPhone(''); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                                          <X size={16}/>
                                      </button>
                                  )}
                              </div>
                              
                              {showCustomerResults && customerSearch && !selectedCustomerId && (
                                  <div className="absolute top-full left-0 right-0 bg-white shadow-xl rounded-xl border border-slate-100 mt-2 z-50 max-h-40 overflow-y-auto">
                                      {filteredCustomers.length > 0 ? filteredCustomers.map(c => (
                                          <div key={c.id} onClick={() => handleSelectCustomer(c)} className="p-3 hover:bg-slate-50 cursor-pointer border-b border-slate-50 last:border-0">
                                              <div className="font-bold text-slate-800 text-sm">{c.full_name}</div>
                                              {c.phone && <div className="text-xs text-slate-400">{c.phone}</div>}
                                          </div>
                                      )) : (
                                          <div className="p-3 text-xs text-slate-400 italic">Ο πελάτης δεν βρέθηκε. Θα δημιουργηθεί ως νέο όνομα στην παραγγελία.</div>
                                      )}
                                  </div>
                              )}
                          </div>

                          <div className="relative">
                              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
                              <input type="text" placeholder="Τηλέφωνο" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} className="w-full pl-10 p-3.5 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 transition-all"/>
                          </div>
                      </div>

                      <div className="space-y-2">
                          <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide">Σημειώσεις</label>
                          <textarea 
                            value={orderNotes}
                            onChange={e => setOrderNotes(e.target.value)}
                            placeholder="Ειδικές οδηγίες..."
                            className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-sm h-24 resize-none"
                          />
                      </div>
                      
                      <div className="bg-gradient-to-br from-[#060b00]/5 to-emerald-50 p-6 rounded-2xl border border-slate-200 shadow-sm">
                          <div className="flex justify-between items-center mb-4">
                             <span className="font-bold text-slate-900 text-sm uppercase">Σύνολο (Χονδρ.)</span>
                             <span className="font-black text-3xl text-[#060b00]">{calculateTotal().toFixed(2)}€</span>
                          </div>
                          <button onClick={handleSaveOrder} className="w-full bg-[#060b00] text-white py-3.5 rounded-xl font-bold hover:bg-black transition-all shadow-lg hover:-translate-y-0.5 active:scale-95 flex items-center justify-center gap-2">
                              {editingOrder ? <><Save size={18}/> Ενημέρωση</> : <><Plus size={18}/> Καταχώρηση</>}
                          </button>
                      </div>
                  </div>

                  <div className="lg:col-span-2 flex flex-col h-full">
                      <div className="flex justify-between items-center mb-2">
                          <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide">Προϊόντα</label>
                          <button onClick={() => setShowScanner(true)} className="flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg transition-colors border border-emerald-200 shadow-sm">
                              <Camera size={14}/> Scan
                          </button>
                      </div>
                      <div className="relative mb-4 z-20">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
                          <input 
                            type="text" 
                            placeholder="Αναζήτηση SKU..." 
                            value={productSearch} 
                            onChange={e => setProductSearch(e.target.value)} 
                            className="w-full pl-10 p-3.5 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                          />
                          {productSearch && (
                              <div className="absolute top-full left-0 right-0 bg-white shadow-xl rounded-xl border border-slate-100 mt-2 max-h-60 overflow-y-auto divide-y divide-slate-50">
                                  {filteredProducts.map(p => {
                                      const hasVariants = p.variants && p.variants.length > 0;
                                      
                                      return (
                                      <div key={p.sku} className="p-3 hover:bg-slate-50 transition-colors">
                                          <div 
                                            className={`flex justify-between items-center ${!hasVariants ? 'cursor-pointer' : 'opacity-70 cursor-default'}`} 
                                            onClick={() => { if(!hasVariants) handleAddItem(p); }}
                                          >
                                              <div className="font-bold text-slate-800">{p.sku} <span className="text-xs font-normal text-slate-500 ml-1">{p.category}</span></div>
                                              <div className="flex items-center gap-2">
                                                  {!hasVariants && <span className="font-mono font-bold">{p.selling_price.toFixed(2)}€</span>}
                                                  {hasVariants && <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-500">Master</span>}
                                              </div>
                                          </div>
                                          
                                          {hasVariants && (
                                              <div className="mt-2 flex flex-wrap gap-2">
                                                  {p.variants?.map(v => {
                                                      const vPrice = (v.selling_price && v.selling_price > 0) ? v.selling_price : p.selling_price;
                                                      return (
                                                      <span 
                                                        key={v.suffix} 
                                                        onClick={(e) => { e.stopPropagation(); handleAddItem(p, v); }} 
                                                        className="text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-800 px-2 py-1.5 rounded cursor-pointer border border-emerald-100 font-medium flex items-center gap-1.5 transition-all active:scale-95"
                                                      >
                                                          <b>{v.suffix}</b>
                                                          <span className="opacity-70 text-[10px]">{v.description}</span>
                                                          <span className="ml-1 bg-white px-1 rounded text-emerald-900 font-bold">{vPrice.toFixed(0)}€</span>
                                                      </span>
                                                  )})}
                                              </div>
                                          )}
                                      </div>
                                  )})}
                                  {filteredProducts.length === 0 && <div className="p-4 text-center text-slate-400 text-sm">Δεν βρέθηκαν προϊόντα.</div>}
                              </div>
                          )}
                      </div>

                      <div className="flex-1 overflow-y-auto border border-slate-200 rounded-2xl bg-slate-50/50 p-2 space-y-2">
                          {selectedItems.map((item, idx) => {
                              const sizingInfo = item.product_details ? getSizingInfo(item.product_details) : null;
                              return (
                              <div key={idx} className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3 animate-in slide-in-from-bottom-1">
                                  <div className="flex items-center gap-3 flex-1 min-w-0">
                                      {item.product_details?.image_url && <img src={item.product_details.image_url} className="w-12 h-12 rounded-lg object-cover bg-slate-100 shrink-0"/>}
                                      <div className="min-w-0">
                                          <div className="font-bold text-slate-800 text-lg leading-none truncate">{item.sku}<span className="text-emerald-600">{item.variant_suffix}</span></div>
                                          <div className="text-xs text-slate-500 mt-1">{item.price_at_order.toFixed(2)}€ / τεμ</div>
                                      </div>
                                  </div>
                                  
                                  <div className="flex items-center gap-3">
                                      {sizingInfo && (
                                          <div className="flex flex-col items-start w-24">
                                              <label className="text-[9px] text-slate-400 uppercase font-bold flex items-center gap-1"><Ruler size={9}/> {sizingInfo.type}</label>
                                              <select 
                                                value={item.size_info || ''} 
                                                onChange={(e) => updateItemSize(idx, e.target.value)}
                                                className="w-full p-1.5 bg-white border border-slate-200 rounded-md text-sm font-medium outline-none"
                                              >
                                                <option value="">Επιλογή</option>
                                                {sizingInfo.sizes.map(s => <option key={s} value={s}>{s}</option>)}
                                              </select>
                                          </div>
                                      )}

                                      <input 
                                        type="number" 
                                        value={item.quantity} 
                                        onChange={e => updateQuantity(idx, parseInt(e.target.value))} 
                                        className="w-16 p-2 rounded-lg text-center font-bold border border-slate-200 outline-none" 
                                      />
                                      <button onClick={() => updateQuantity(idx, 0)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={16}/></button>
                                  </div>
                              </div>
                          )})}
                          {selectedItems.length === 0 && (
                            <div className="flex items-center justify-center h-full text-slate-400 text-center flex-col">
                                <Package size={32} className="mb-2 opacity-50"/>
                                <p className="font-medium">Δεν υπάρχουν προϊόντα στην παραγγελία.</p>
                            </div>
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
                                        <button onClick={() => setManagingOrder(order)} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg"><Settings size={16}/></button>
                                        <button onClick={() => setPrintModalOrder(order)} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg"><Printer size={16}/></button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
          </div>
      )}

      {showScanner && <BarcodeScanner onScan={handleScanItem} onClose={() => setShowScanner(false)} />}
      
      {managingOrder && (
        <div className="fixed inset-0 z-[150] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl animate-in zoom-in-95 border border-slate-100 flex flex-col max-h-[90vh]">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center shrink-0">
                    <div>
                        <h3 className="text-xl font-bold text-slate-800">Διαχείριση #{managingOrder.id}</h3>
                        <p className="text-sm text-slate-500">{managingOrder.customer_name}</p>
                    </div>
                    <button onClick={() => setManagingOrder(null)} className="p-2 hover:bg-slate-100 rounded-full"><X size={20}/></button>
                </div>
                <div className="p-6 space-y-4 overflow-y-auto">
                    <h4 className="font-bold text-slate-500 text-xs uppercase tracking-wider">Ενέργειες Παραγγελίας</h4>
                    <div className="space-y-3">
                        <button onClick={() => { handleEditOrder(managingOrder); setManagingOrder(null); }} className="w-full text-left p-4 rounded-xl flex items-center gap-3 font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors"><Edit size={18}/> Επεξεργασία</button>
                        {managingOrder.status === OrderStatus.Pending && (
                            <button onClick={() => handleSendToProduction(managingOrder.id)} className="w-full text-left p-4 rounded-xl flex items-center gap-3 font-bold bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 hover:border-blue-300 transition-colors"><Factory size={18}/> Αποστολή στην Παραγωγή</button>
                        )}
                        {managingOrder.status === OrderStatus.Ready && (
                            <button onClick={() => { handleUpdateStatus(managingOrder.id, OrderStatus.Delivered); setManagingOrder(null); }} className="w-full text-left p-4 rounded-xl flex items-center gap-3 font-bold bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 hover:border-emerald-300 transition-colors"><PackageCheck size={18}/> Σήμανση ως "Παραδόθηκε"</button>
                        )}
                        {(managingOrder.status === OrderStatus.InProduction || managingOrder.status === OrderStatus.Ready) && (
                            <button onClick={() => { handleUpdateStatus(managingOrder.id, OrderStatus.Pending); setManagingOrder(null); }} className="w-full text-left p-4 rounded-xl flex items-center gap-3 font-bold bg-yellow-50 border border-yellow-200 text-yellow-700 hover:bg-yellow-100 hover:border-yellow-300 transition-colors"><RefreshCcw size={18}/> Επαναφορά σε "Εκκρεμεί"</button>
                        )}
                        <div className="!mt-6 pt-4 border-t border-slate-100">
                            <button onClick={() => { handleDeleteOrder(managingOrder); setManagingOrder(null); }} className="w-full text-left p-4 rounded-xl flex items-center gap-3 font-bold bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 hover:border-red-300 transition-colors"><Trash2 size={18}/> Οριστική Διαγραφή</button>
                        </div>
                    </div>

                    {(() => {
                        const enhancedBatches = batches?.filter(b => b.order_id === managingOrder.id).map(b => ({...b, product_details: products.find(p => p.sku === b.sku)})) || [];
                        if (enhancedBatches.length > 0) {
                            return (
                                <div className="!mt-6 pt-6 border-t border-slate-200">
                                    <h4 className="font-bold text-slate-500 text-xs uppercase tracking-wider mb-3">Διαχείριση Παραγωγής</h4>
                                    <div className="space-y-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
                                        {enhancedBatches.map(batch => {
                                            const currentStageInfo = STAGES.find(s => s.id === batch.current_stage);
                                            const nextStages = STAGES.filter(s => {
                                                const currentIndex = STAGES.findIndex(cs => cs.id === batch.current_stage);
                                                const targetIndex = STAGES.findIndex(ts => ts.id === s.id);
                                                if (targetIndex <= currentIndex) return false;
                                                
                                                // Specific logic for imported products
                                                if (batch.product_details?.production_type === ProductionType.Imported) {
                                                    return [ProductionStage.Labeling, ProductionStage.Ready].includes(s.id);
                                                }

                                                if (batch.current_stage === ProductionStage.Casting && !batch.requires_setting && s.id === ProductionStage.Setting) return false;
                                                if (batch.current_stage === ProductionStage.AwaitingDelivery && !(batch.requires_setting ? [ProductionStage.Setting, ProductionStage.Labeling].includes(s.id) : [ProductionStage.Labeling].includes(s.id))) return false;
                                                return true;
                                            });
                                            
                                            return (
                                            <div key={batch.id} className="bg-white p-3 rounded-lg shadow-sm border border-slate-100 flex items-center justify-between gap-4">
                                                <div className="flex items-center gap-3">
                                                    <div className={`p-2 rounded-lg ${STAGE_COLORS[currentStageInfo?.color as keyof typeof STAGE_COLORS].bg} ${STAGE_COLORS[currentStageInfo?.color as keyof typeof STAGE_COLORS].text}`}>{currentStageInfo?.icon}</div>
                                                    <div>
                                                        <div className="font-bold text-slate-800">{batch.sku}{batch.variant_suffix}<span className="ml-2 font-normal text-slate-500">x{batch.quantity}</span></div>
                                                        <div className="text-xs text-slate-500">{currentStageInfo?.label}</div>
                                                    </div>
                                                </div>
                                                <div className="relative group">
                                                    <button className="px-3 py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 text-xs font-bold rounded-md flex items-center gap-1">Μετακίνηση <ChevronDown size={14}/></button>
                                                    <div className="absolute top-full right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl p-2 w-48 z-10 hidden group-hover:block">
                                                        {nextStages.map(stage => (
                                                            <button key={stage.id} onClick={() => handleMoveRequest(batch, stage.id)} className="w-full text-left p-2 rounded hover:bg-slate-100 text-sm flex items-center gap-2">
                                                                {stage.icon} {stage.label}
                                                            </button>
                                                        ))}
                                                        {nextStages.length === 0 && <span className="text-xs text-slate-400 p-2">Ολοκληρωμένο</span>}
                                                    </div>
                                                </div>
                                            </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        }
                        return null;
                    })()}

                </div>
            </div>
        </div>
      )}
      
      {printModalOrder && (
        <PrintOptionsModal 
            order={printModalOrder}
            onClose={() => setPrintModalOrder(null)}
            onPrintOrder={onPrintOrder}
            onPrintAggregated={onPrintAggregated}
            onPrintPreparation={onPrintPreparation}
            onPrintTechnician={onPrintTechnician}
            allBatches={enrichedBatches} 
            showToast={showToast}
        />
      )}

      {moveBatchState && (
          <SplitBatchModal 
              state={moveBatchState}
              onClose={() => setMoveBatchState(null)}
              onConfirm={handleConfirmMove}
              isProcessing={isProcessingMove}
          />
      )}
    </div>
  );
}
