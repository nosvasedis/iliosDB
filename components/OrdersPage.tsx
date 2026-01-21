
import React, { useState, useMemo, useEffect } from 'react';
import { Order, OrderStatus, Product, ProductVariant, ProductionStage, ProductionBatch, Material, MaterialType, VatRegime } from '../types';
import { ShoppingCart, Plus, Search, Calendar, CheckCircle, Package, ArrowRight, X, Printer, Tag, Settings, Edit, Trash2, Ban, BarChart3, Globe, Flame, Gem, Hammer, BookOpen, FileText, ChevronDown, ChevronUp, Clock, Truck, XCircle, AlertCircle, Factory } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/supabase';
import { useUI } from './UIProvider';
import { formatCurrency } from '../utils/pricingEngine';
import DesktopOrderBuilder from './DesktopOrderBuilder';

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

  const [isCreating, setIsCreating] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  
  const [managingOrder, setManagingOrder] = useState<Order | null>(null);
  const [printModalOrder, setPrintModalOrder] = useState<Order | null>(null);

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

  const handleEditOrder = (order: Order) => {
      setEditingOrder(order);
      setIsCreating(true);
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
          <button onClick={() => { setEditingOrder(null); setIsCreating(true); }} className="flex items-center gap-2 bg-[#060b00] text-white px-5 py-3 rounded-xl hover:bg-black font-bold shadow-lg shadow-slate-200 transition-all hover:-translate-y-0.5">
              <Plus size={20} /> Νέα Παραγγελία
          </button>
      </div>

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
                    {orders?.map(order => {
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
    </div>
  );
}
