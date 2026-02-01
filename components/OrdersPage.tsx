
import React, { useState, useMemo, useEffect } from 'react';
import { Order, OrderStatus, Product, ProductVariant, ProductionStage, ProductionBatch, Material, MaterialType, VatRegime } from '../types';
import { ShoppingCart, Plus, Search, Calendar, CheckCircle, Package, ArrowRight, X, Printer, Tag, Settings, Edit, Trash2, Ban, BarChart3, Globe, Flame, Gem, Hammer, BookOpen, FileText, ChevronDown, ChevronUp, Clock, Truck, XCircle, AlertCircle, Factory, Send, RotateCcw, Archive, ArchiveRestore, Layers, CheckSquare } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/supabase';
import { useUI } from './UIProvider';
import { formatCurrency } from '../utils/pricingEngine';
import DesktopOrderBuilder from './DesktopOrderBuilder';
import ProductionSendModal from './ProductionSendModal';

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

const getStatusColor = (status: OrderStatus) => {
    switch(status) {
        case OrderStatus.Pending: return 'bg-slate-100 text-slate-600 border-slate-200';
        case OrderStatus.InProduction: return 'bg-blue-50 text-blue-600 border-blue-200';
        case OrderStatus.Ready: return 'bg-emerald-50 text-emerald-600 border-emerald-200';
        case OrderStatus.Delivered: return 'bg-[#060b00] text-white border-[#060b00]';
        case OrderStatus.Cancelled: return 'bg-red-50 text-red-500 border-red-200';
    }
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

  // View State
  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Create/Edit/Manage State
  const [isCreating, setIsCreating] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [managingOrder, setManagingOrder] = useState<Order | null>(null);
  const [printModalOrder, setPrintModalOrder] = useState<Order | null>(null);
  const [productionModalOrder, setProductionModalOrder] = useState<Order | null>(null);

  // Group Management in Modal
  const [tagInput, setTagInput] = useState('');

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

  // Derived: Filter orders based on Tab and Search
  const filteredOrders = useMemo(() => {
      if (!orders) return [];
      
      return orders.filter(o => {
          // Tab Filter
          const isArchived = o.is_archived === true;
          if (activeTab === 'active' && isArchived) return false;
          if (activeTab === 'archived' && !isArchived) return false;

          // Search Filter (ID, Name, Tags)
          if (!searchTerm) return true;
          const term = searchTerm.toLowerCase();
          return (
              o.id.toLowerCase().includes(term) ||
              o.customer_name.toLowerCase().includes(term) ||
              (o.tags && o.tags.some(t => t.toLowerCase().includes(term)))
          );
      });
  }, [orders, activeTab, searchTerm]);

  // Derived: Check if order is ready for completion
  const isOrderReady = (order: Order) => {
      // Must have batches
      const orderBatches = enrichedBatches.filter(b => b.order_id === order.id);
      if (orderBatches.length === 0) return false; // If no batches, maybe manually managed, but for "Complete" button, imply production flow
      
      // All batches must be Ready
      return orderBatches.every(b => b.current_stage === ProductionStage.Ready);
  };

  const handleEditOrder = (order: Order) => {
      setEditingOrder(order);
      setIsCreating(true);
  };

  const handleSendToProduction = async (orderId: string) => {
      const order = orders?.find(o => o.id === orderId);
      if (order) {
          setProductionModalOrder(order);
          setManagingOrder(null);
      } else {
          showToast("Σφάλμα εύρεσης παραγγελίας", "error");
      }
  };

  const onProductionSuccess = () => {
      setProductionModalOrder(null);
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['batches'] });
  };

  const handleRevertFromProduction = async (orderId: string) => {
    const yes = await confirm({
        title: 'Επαναφορά από Παραγωγή',
        message: 'Αυτή η ενέργεια θα ΔΙΑΓΡΑΨΕΙ όλες τις παρτίδες παραγωγής for αυτή την εντολή και θα την επαναφέρει σε κατάσταση "Εκκρεμεί". Συνέχεια;',
        isDestructive: true,
        confirmText: 'Επαναφορά'
    });

    if (yes) {
        try {
            await api.revertOrderFromProduction(orderId);
            queryClient.invalidateQueries({ queryKey: ['orders'] });
            queryClient.invalidateQueries({ queryKey: ['batches'] });
            setManagingOrder(null);
            showToast('Η παραγγελία επαναφέρθηκε επιτυχώς.', 'success');
        } catch (err: any) {
            showToast(`Σφάλμα: ${err.message}`, 'error');
        }
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

  // --- NEW ACTIONS ---
  const handleCompleteOrder = async (order: Order) => {
      const yes = await confirm({
          title: 'Ολοκλήρωση Παραγγελίας',
          message: 'Η παραγγελία θα σημειωθεί ως "Παραδόθηκε" (Delivered) και τα τεμάχια θα αφαιρεθούν από τη Ροή Παραγωγής. Συνέχεια;',
          confirmText: 'Ολοκλήρωση & Παράδοση'
      });
      if (yes) {
          try {
              await api.updateOrderStatus(order.id, OrderStatus.Delivered);
              queryClient.invalidateQueries({ queryKey: ['orders'] });
              queryClient.invalidateQueries({ queryKey: ['batches'] });
              if (managingOrder?.id === order.id) setManagingOrder(null);
              showToast("Η παραγγελία ολοκληρώθηκε επιτυχώς!", "success");
          } catch (e) {
              showToast("Σφάλμα ολοκλήρωσης.", "error");
          }
      }
  };

  const handleArchiveOrder = async (order: Order, archive: boolean) => {
      try {
          await api.archiveOrder(order.id, archive);
          queryClient.invalidateQueries({ queryKey: ['orders'] });
          if (managingOrder?.id === order.id) setManagingOrder(null);
          showToast(archive ? "Η παραγγελία αρχειοθετήθηκε." : "Η παραγγελία ανακτήθηκε.", "success");
      } catch (e) {
          showToast("Σφάλμα αρχειοθέτησης.", "error");
      }
  };

  const handleAddTag = async () => {
      if (!managingOrder || !tagInput.trim()) return;
      const currentTags = managingOrder.tags || [];
      if (currentTags.includes(tagInput.trim())) return;
      
      const newTags = [...currentTags, tagInput.trim()];
      try {
          await api.updateOrder({ ...managingOrder, tags: newTags });
          queryClient.invalidateQueries({ queryKey: ['orders'] });
          setManagingOrder(prev => prev ? ({ ...prev, tags: newTags }) : null);
          setTagInput('');
          showToast("Ετικέτα προστέθηκε.", "success");
      } catch (e) {
          showToast("Σφάλμα.", "error");
      }
  };

  const handleRemoveTag = async (tag: string) => {
      if (!managingOrder) return;
      const newTags = (managingOrder.tags || []).filter(t => t !== tag);
      try {
          await api.updateOrder({ ...managingOrder, tags: newTags });
          queryClient.invalidateQueries({ queryKey: ['orders'] });
          setManagingOrder(prev => prev ? ({ ...prev, tags: newTags }) : null);
          showToast("Ετικέτα αφαιρέθηκε.", "success");
      } catch (e) {
          showToast("Σφάλμα.", "error");
      }
  };

  if (isCreating) {
      return (
          <div className="bg-white rounded-3xl shadow-lg border border-slate-100 flex flex-col overflow-hidden animate-in slide-in-from-right duration-300 flex-1 h-full">
              <DesktopOrderBuilder 
                  onBack={() => { setIsCreating(false); setEditingOrder(null); }}
                  initialOrder={editingOrder}
                  products={products}
                  customers={customers || []}
              />
          </div>
      );
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
          <div className="flex gap-3">
              <div className="flex bg-slate-100 p-1 rounded-xl">
                  <button 
                      onClick={() => setActiveTab('active')} 
                      className={`px-4 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'active' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                      <ShoppingCart size={16}/> Ενεργές
                  </button>
                  <button 
                      onClick={() => setActiveTab('archived')} 
                      className={`px-4 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'archived' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                      <Archive size={16}/> Αρχείο
                  </button>
              </div>
              <button onClick={() => { setEditingOrder(null); setIsCreating(true); }} className="flex items-center gap-2 bg-[#060b00] text-white px-5 py-3 rounded-xl hover:bg-black font-bold shadow-lg shadow-slate-200 transition-all hover:-translate-y-0.5">
                  <Plus size={20} /> Νέα Παραγγελία
              </button>
          </div>
      </div>
      
      {/* SEARCH BAR */}
      <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20}/>
          <input 
              type="text" 
              placeholder="Αναζήτηση παραγγελίας, πελάτη ή ετικέτας..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 p-3 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-emerald-500/20 text-slate-700 font-medium transition-all"
          />
      </div>

      <div className="flex-1 overflow-auto">
        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
            <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs">
                    <tr>
                        <th className="p-4 pl-6">ID</th>
                        <th className="p-4">Πελάτης / Ετικέτες</th>
                        <th className="p-4">Ημερομηνία</th>
                        <th className="p-4 text-right">Ποσό (Net)</th>
                        <th className="p-4">Κατάσταση</th>
                        <th className="p-4"></th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                    {filteredOrders.map(order => {
                        // FIX: Explicitly check for 0% VAT rate by avoiding truthy checks
                        const activeVat = order.vat_rate !== undefined ? order.vat_rate : 0.24;
                        const netValue = order.total_price / (1 + activeVat);
                        const ready = isOrderReady(order);
                        
                        return (
                            <tr key={order.id} className="hover:bg-slate-50/80 transition-colors group">
                                <td className="p-4 pl-6 font-mono font-bold text-slate-800">{order.id}</td>
                                <td className="p-4">
                                    <div className="font-bold text-slate-800">{order.customer_name}</div>
                                    {order.tags && order.tags.length > 0 && (
                                        <div className="flex gap-1 mt-1 flex-wrap">
                                            {order.tags.map(t => (
                                                <span key={t} className="text-[9px] bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-100 font-bold uppercase">{t}</span>
                                            ))}
                                        </div>
                                    )}
                                </td>
                                <td className="p-4 text-slate-500">{new Date(order.created_at).toLocaleDateString('el-GR')}</td>
                                <td className="p-4 text-right font-bold text-slate-800">{formatCurrency(netValue)}</td>
                                <td className="p-4">
                                    <div className="flex items-center gap-2">
                                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${getStatusColor(order.status)}`}>{STATUS_TRANSLATIONS[order.status]}</span>
                                        {ready && order.status !== OrderStatus.Delivered && (
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); handleCompleteOrder(order); }}
                                                className="bg-emerald-500 text-white p-1 rounded-full hover:bg-emerald-600 transition-colors shadow-sm animate-pulse" 
                                                title="Έτοιμη για Ολοκλήρωση"
                                            >
                                                <CheckCircle size={14}/>
                                            </button>
                                        )}
                                    </div>
                                </td>
                                <td className="p-4 text-right">
                                    <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => setManagingOrder(order)} title="Διαχείριση" className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg"><Settings size={16}/></button>
                                        <button onClick={() => setPrintModalOrder(order)} title="Εκτύπωση Εντολών" className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg"><Printer size={16}/></button>
                                        {activeTab === 'active' && (
                                            <button onClick={() => handleArchiveOrder(order, true)} title="Αρχειοθέτηση" className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"><Archive size={16}/></button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                    {filteredOrders.length === 0 && (
                        <tr><td colSpan={6} className="p-8 text-center text-slate-400 italic">Δεν βρέθηκαν παραγγελίες.</td></tr>
                    )}
                </tbody>
            </table>
        </div>
      </div>
      
      {managingOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl animate-in zoom-in-95 border border-slate-100 flex flex-col max-h-[90vh]">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center shrink-0 bg-slate-50/50">
                    <div>
                        <h3 className="text-xl font-bold text-slate-800">Διαχείριση #{managingOrder.id}</h3>
                        <p className="text-sm text-slate-500 font-bold">{managingOrder.customer_name}</p>
                    </div>
                    <button onClick={() => setManagingOrder(null)} className="p-2 hover:bg-slate-100 rounded-full"><X size={20}/></button>
                </div>
                <div className="p-6 space-y-4 overflow-y-auto">
                    
                    {/* Tags Management */}
                    <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100">
                        <label className="text-xs font-bold text-indigo-800 uppercase mb-2 flex items-center gap-2"><Layers size={14}/> Ετικέτες / Ομαδοποίηση</label>
                        <div className="flex gap-2 mb-2">
                            <input 
                                value={tagInput}
                                onChange={e => setTagInput(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleAddTag()}
                                placeholder="Προσθήκη ετικέτας (π.χ. 'Έκθεση A')..."
                                className="flex-1 p-2 border border-indigo-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500/20"
                            />
                            <button onClick={handleAddTag} disabled={!tagInput.trim()} className="bg-indigo-600 text-white px-3 py-2 rounded-lg font-bold text-xs hover:bg-indigo-700 transition-colors disabled:opacity-50">Προσθήκη</button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {managingOrder.tags && managingOrder.tags.map(t => (
                                <span key={t} className="bg-white border border-indigo-200 text-indigo-700 px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1">
                                    {t} <button onClick={() => handleRemoveTag(t)} className="hover:text-red-500"><X size={12}/></button>
                                </span>
                            ))}
                            {(!managingOrder.tags || managingOrder.tags.length === 0) && <span className="text-xs text-slate-400 italic">Καμία ετικέτα.</span>}
                        </div>
                    </div>

                    <button onClick={() => { handleEditOrder(managingOrder); setManagingOrder(null); }} className="w-full text-left p-4 rounded-xl flex items-center gap-3 font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"><Edit size={18}/> Επεξεργασία</button>
                    
                    {isOrderReady(managingOrder) && managingOrder.status !== OrderStatus.Delivered && (
                        <button onClick={() => handleCompleteOrder(managingOrder)} className="w-full text-left p-4 rounded-xl flex items-center gap-3 font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-100">
                            <CheckSquare size={18}/> Ολοκλήρωση & Παράδοση
                        </button>
                    )}

                    {(managingOrder.status === OrderStatus.Pending || managingOrder.status === OrderStatus.InProduction) && (
                        <button onClick={() => handleSendToProduction(managingOrder.id)} className="w-full text-left p-4 rounded-xl flex items-center gap-3 font-bold bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 transition-colors">
                            <Factory size={18}/> Αποστολή στην Παραγωγή
                        </button>
                    )}
                    
                    {managingOrder.status === OrderStatus.InProduction && (
                        <button onClick={() => handleRevertFromProduction(managingOrder.id)} className="w-full text-left p-4 rounded-xl flex items-center gap-3 font-bold bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 transition-all">
                            <RotateCcw size={18}/> Επαναφορά από Παραγωγή
                        </button>
                    )}
                    
                    {/* Archive Toggle */}
                    <button onClick={() => handleArchiveOrder(managingOrder, !managingOrder.is_archived)} className="w-full text-left p-4 rounded-xl flex items-center gap-3 font-bold bg-purple-50 border border-purple-200 text-purple-700 hover:bg-purple-100 transition-colors">
                        {managingOrder.is_archived ? <ArchiveRestore size={18}/> : <Archive size={18}/>}
                        {managingOrder.is_archived ? 'Ανάκτηση από Αρχείο' : 'Αρχειοθέτηση'}
                    </button>

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

      {productionModalOrder && (
          <ProductionSendModal 
              order={productionModalOrder} 
              products={products}
              materials={materials}
              existingBatches={enrichedBatches.filter(b => b.order_id === productionModalOrder.id)}
              onClose={() => setProductionModalOrder(null)}
              onSuccess={onProductionSuccess}
          />
      )}
    </div>
  );
}
