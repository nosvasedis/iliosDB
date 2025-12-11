import React, { useState, useMemo } from 'react';
import { Order, OrderStatus, Product, ProductVariant, OrderItem, ProductionStage, ProductionBatch, Material, MaterialType, Customer, BatchType } from '../types';
import { ShoppingCart, Plus, Search, Calendar, Phone, User, CheckCircle, Package, ArrowRight, X, Loader2, Factory, Users, ScanBarcode, Camera, Printer, AlertTriangle, PackageCheck, PackageX, Trash2, Settings, RefreshCcw, LayoutList, Edit, Save, Ruler, ChevronDown } from 'lucide-react';
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
}

const STATUS_TRANSLATIONS: Record<OrderStatus, string> = {
    [OrderStatus.Pending]: 'Εκκρεμεί',
    [OrderStatus.InProduction]: 'Σε Παραγωγή',
    [OrderStatus.Ready]: 'Έτοιμο',
    [OrderStatus.Delivered]: 'Παραδόθηκε',
    [OrderStatus.Cancelled]: 'Ακυρώθηκε',
};

export default function OrdersPage({ products, onPrintOrder, materials, onPrintAggregated }: Props) {
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

  // NEW: Fulfillment Modal State
  const [fulfillmentOrder, setFulfillmentOrder] = useState<Order | null>(null);
  // NEW: Manage Modal State
  const [managingOrder, setManagingOrder] = useState<Order | null>(null);

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

  // --- EDIT HANDLER ---
  const handleEditOrder = (order: Order) => {
      setEditingOrder(order);
      setCustomerName(order.customer_name);
      setCustomerPhone(order.customer_phone || '');
      setSelectedCustomerId(order.customer_id || null);
      setOrderNotes(order.notes || '');
      // Deep copy to ensure we don't mutate state directly before saving
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
      
      // If product is sizable, we don't merge immediately unless size is also same (which is undefined initially)
      // Actually, standard behavior is to merge same sku+variant. Sizing is an attribute.
      // We'll just add it, user can set size.
      
      const existingIdx = selectedItems.findIndex(i => i.sku === newItem.sku && i.variant_suffix === newItem.variant_suffix && !i.size_info);
      
      // If product is sizable, we prefer adding a NEW row so they can choose a different size
      // unless they haven't picked a size for the existing row yet.
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
              // UPDATE EXISTING ORDER
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
              // CREATE NEW ORDER
              const now = new Date();
              const year = now.getFullYear().toString().slice(-2);
              const month = (now.getMonth() + 1).toString().padStart(2, '0');
              const day = now.getDate().toString().padStart(2, '0');
              const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
              const newOrderId = `${year}${month}${day}${random}`;

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
          
          // Reset State
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
                                                className="w-full text-xs font-bold p-1.5 rounded border border-slate-200 bg-slate-50 outline-none focus:border-emerald-500"
                                              >
                                                  <option value="">Προεπιλογή</option>
                                                  {sizingInfo.sizes.map(s => <option key={s} value={s}>{s}</option>)}
                                              </select>
                                          </div>
                                      )}
                                      <input type="number" min="1" value={item.quantity} onChange={e => updateQuantity(idx, parseInt(e.target.value))} className="w-16 p-2 bg-white border border-slate-200 rounded-lg text-center font-bold outline-none focus:border-emerald-500 transition-colors"/>
                                      <div className="font-black w-20 text-right text-slate-800 text-lg">{(item.price_at_order * item.quantity).toFixed(2)}€</div>
                                      <button onClick={() => updateQuantity(idx, 0)} className="text-slate-300 hover:text-red-500 p-2 hover:bg-red-50 rounded-lg transition-colors"><X size={18}/></button>
                                  </div>
                              </div>
                          )})}
                          {selectedItems.length === 0 && (
                              <div className="h-full flex flex-col items-center justify-center text-slate-300 opacity-60">
                                  <Package size={64} className="mb-3"/>
                                  <p className="font-medium">Το καλάθι είναι άδειο</p>
                              </div>
                          )}
                      </div>
                  </div>
              </div>
          </div>
      ) : (
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 flex-1 overflow-hidden flex flex-col">
              <div className="p-5 border-b border-slate-100 bg-white flex items-center gap-3">
                   <Search className="text-slate-400" size={20}/>
                   <input 
                    type="text" 
                    placeholder="Αναζήτηση παραγγελίας ή πελάτη..." 
                    className="bg-transparent outline-none w-full text-slate-800 placeholder-slate-400" 
                    value={searchTerm} 
                    onChange={e => setSearchTerm(e.target.value)}
                   />
              </div>
              <div className="overflow-y-auto flex-1">
                  <table className="w-full text-left border-collapse">
                      <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs sticky top-0 border-b border-slate-100">
                          <tr>
                              <th className="p-4 pl-6">ID</th>
                              <th className="p-4">Πελάτης</th>
                              <th className="p-4">Ημερομηνία</th>
                              <th className="p-4">Κατάσταση</th>
                              <th className="p-4 text-right">Ποσό</th>
                              <th className="p-4 text-center">Ενέργειες</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                          {orders?.filter(o => o.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) || o.id.includes(searchTerm)).map(order => (
                              <tr key={order.id} className="hover:bg-slate-50/80 transition-colors group">
                                  <td className="p-4 pl-6 font-mono font-bold text-slate-700">{order.id}</td>
                                  <td className="p-4">
                                      <div className="font-bold text-slate-800 flex items-center gap-2">
                                          {order.customer_id ? <Users size={14} className="text-emerald-500"/> : null} 
                                          {order.customer_name}
                                      </div>
                                      {order.customer_phone && <div className="text-xs text-slate-500 mt-0.5">{order.customer_phone}</div>}
                                  </td>
                                  <td className="p-4 text-sm text-slate-600">
                                      <div className="flex items-center gap-1.5"><Calendar size={14} className="opacity-50"/> {new Date(order.created_at).toLocaleDateString('el-GR')}</div>
                                  </td>
                                  <td className="p-4">
                                      <span className={`px-3 py-1 rounded-full text-xs font-bold border ${getStatusColor(order.status)}`}>
                                          {STATUS_TRANSLATIONS[order.status]}
                                      </span>
                                  </td>
                                  <td className="p-4 text-right font-black text-slate-800">
                                      {order.total_price.toFixed(2)}€
                                  </td>
                                  <td className="p-4 text-center">
                                      <div className="flex items-center justify-center gap-2 opacity-70 group-hover:opacity-100 transition-opacity">
                                          <button
                                            onClick={() => handleEditOrder(order)}
                                            className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                            title="Επεξεργασία"
                                          >
                                            <Edit size={16} />
                                          </button>

                                          <button
                                            onClick={() => setManagingOrder(order)}
                                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                            title="Διαχείριση Παραγωγής"
                                          >
                                            <Settings size={16} />
                                          </button>

                                          {onPrintOrder && (
                                              <button 
                                                onClick={() => onPrintOrder(order)} 
                                                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                                                title="Εκτύπωση"
                                              >
                                                  <Printer size={16} />
                                              </button>
                                          )}

                                          <button
                                            onClick={() => handleDeleteOrder(order)}
                                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                            title="Διαγραφή"
                                          >
                                            <Trash2 size={16} />
                                          </button>

                                          {order.status === OrderStatus.Pending && (
                                              <button onClick={() => setFulfillmentOrder(order)} className="text-xs bg-emerald-50 text-emerald-600 hover:bg-emerald-100 px-3 py-1.5 rounded-lg font-bold border border-emerald-200 transition-colors flex items-center gap-1 hover:shadow-sm">
                                                  <ArrowRight size={14}/> Εκτέλεση
                                              </button>
                                          )}
                                          {order.status === OrderStatus.Ready && (
                                              <button onClick={() => handleUpdateStatus(order.id, OrderStatus.Delivered)} className="text-xs bg-emerald-50 text-emerald-600 hover:bg-emerald-100 px-3 py-1.5 rounded-lg font-bold border border-emerald-200 transition-colors flex items-center gap-1 hover:shadow-sm">
                                                  <CheckCircle size={14}/> Παράδοση
                                              </button>
                                          )}
                                      </div>
                                  </td>
                              </tr>
                          ))}
                          {orders?.length === 0 && <tr><td colSpan={6} className="p-16 text-center text-slate-400 italic">Δεν βρέθηκαν παραγγελίες.</td></tr>}
                      </tbody>
                  </table>
              </div>
          </div>
      )}

      {showScanner && (
          <BarcodeScanner 
            onScan={handleScanItem}
            onClose={() => setShowScanner(false)}
            continuous={true} 
          />
      )}

      {fulfillmentOrder && (
          <FulfillmentModal 
            order={fulfillmentOrder}
            products={products}
            materials={materials}
            onClose={() => setFulfillmentOrder(null)}
          />
      )}

      {managingOrder && batches && (
          <OrderProductionManager
            order={managingOrder}
            products={products}
            allBatches={batches}
            onClose={() => setManagingOrder(null)}
            onPrintAggregated={onPrintAggregated}
          />
      )}
    </div>
  );
}

// Minimal Definitions to fix build errors
interface FulfillmentModalProps {
    order: Order;
    products: Product[];
    materials: Material[];
    onClose: () => void;
}

const FulfillmentModal: React.FC<FulfillmentModalProps> = ({ order, onClose }) => {
    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-white rounded-xl p-6 w-full max-w-2xl shadow-2xl">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-slate-800">Εκτέλεση Παραγγελίας #{order.id}</h3>
                    <button onClick={onClose}><X size={20}/></button>
                </div>
                <div className="space-y-4 text-center py-8">
                    <p className="text-slate-500">Η λειτουργία εκτέλεσης και ελέγχου αποθέματος είναι υπό κατασκευή.</p>
                </div>
            </div>
        </div>
    );
};

const STAGE_OPTIONS = [
    { id: ProductionStage.Waxing, label: 'Λάστιχα / Κεριά' },
    { id: ProductionStage.Casting, label: 'Χυτήριο' },
    { id: ProductionStage.Setting, label: 'Καρφωτής' },
    { id: ProductionStage.Polishing, label: 'Τεχνίτης' },
    { id: ProductionStage.Labeling, label: 'Καρτελάκια' },
];

interface OrderProductionManagerProps {
    order: Order;
    products: Product[];
    allBatches: ProductionBatch[];
    onClose: () => void;
    onPrintAggregated: (batches: ProductionBatch[], orderDetails: { orderId: string, customerName: string }) => void;
}

const OrderProductionManager: React.FC<OrderProductionManagerProps> = ({ order, products, allBatches, onClose, onPrintAggregated }) => {
    const queryClient = useQueryClient();
    const { showToast } = useUI();
    const [updatingBatchId, setUpdatingBatchId] = useState<string | null>(null);

    const orderBatches = useMemo(() => {
        return allBatches
            .filter(b => b.order_id === order.id)
            .map(b => {
                const product_details = products.find(p => p.sku === b.sku);
                return { ...b, product_details, product_image: product_details?.image_url };
            })
            .sort((a,b) => {
                const skuA = a.sku + (a.variant_suffix || '');
                const skuB = b.sku + (b.variant_suffix || '');
                if (skuA < skuB) return -1;
                if (skuA > skuB) return 1;
                return 0;
            });
    }, [allBatches, order.id, products]);

    const handleStageChange = async (batchId: string, newStage: ProductionStage) => {
        setUpdatingBatchId(batchId);
        try {
            await api.updateBatchStage(batchId, newStage);
            queryClient.invalidateQueries({ queryKey: ['batches'] });
            queryClient.invalidateQueries({ queryKey: ['orders'] }); // To update order status if all are ready
            showToast('Η κατάσταση ενημερώθηκε.', 'success');
        } catch (err: any) {
            showToast(`Σφάλμα: ${err.message}`, 'error');
        } finally {
            setUpdatingBatchId(null);
        }
    };

    const handlePrint = () => {
        onPrintAggregated(orderBatches, { orderId: order.id, customerName: order.customer_name });
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-white rounded-3xl p-0 w-full max-w-4xl h-[90vh] flex flex-col shadow-2xl border border-slate-100">
                {/* Header */}
                <div className="flex justify-between items-center p-6 border-b border-slate-100 bg-slate-50 rounded-t-3xl">
                    <div>
                        <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Settings size={20} className="text-blue-600"/> Διαχείριση Παραγωγής</h3>
                        <p className="text-sm text-slate-500 font-mono font-bold mt-1">Παραγγελία #{order.id} - <span className="text-blue-700">{order.customer_name}</span></p>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-500 hover:bg-slate-200 rounded-full transition-colors"><X size={20}/></button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {orderBatches.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-slate-400">
                            <Factory size={48} className="opacity-30 mb-4"/>
                            <p className="font-medium">Δεν υπάρχουν παρτίδες παραγωγής για αυτή την παραγγελία.</p>
                        </div>
                    ) : (
                        orderBatches.map(batch => (
                            <div key={batch.id} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
                                <div className="w-16 h-16 bg-slate-100 rounded-xl overflow-hidden shrink-0">
                                    {batch.product_details?.image_url && <img src={batch.product_details.image_url} className="w-full h-full object-cover"/>}
                                </div>
                                <div className="flex-1">
                                    <div className="font-bold text-slate-800 text-lg flex items-center gap-2">
                                        {batch.sku}{batch.variant_suffix}
                                        {batch.size_info && <span className="text-xs font-normal text-slate-500 bg-slate-100 px-1.5 rounded-md border border-slate-200">{batch.size_info}</span>}
                                    </div>
                                    <div className="text-sm text-slate-500">{batch.quantity} τεμάχια</div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="relative w-48">
                                        <select
                                            value={batch.current_stage}
                                            onChange={(e) => handleStageChange(batch.id, e.target.value as ProductionStage)}
                                            disabled={updatingBatchId === batch.id}
                                            className="w-full appearance-none bg-slate-50 border border-slate-200 text-slate-700 font-bold text-sm p-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-200 cursor-pointer"
                                        >
                                            {STAGE_OPTIONS.map(stage => (
                                                <option key={stage.id} value={stage.id}>{stage.label}</option>
                                            ))}
                                            <option value={ProductionStage.Ready}>Έτοιμο</option>
                                        </select>
                                        {updatingBatchId === batch.id ? (
                                            <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-blue-600"/>
                                        ) : (
                                            <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"/>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-slate-100 bg-slate-50 rounded-b-3xl flex justify-end">
                    <button 
                        onClick={handlePrint} 
                        disabled={orderBatches.length === 0}
                        className="flex items-center gap-2 bg-slate-800 text-white px-6 py-3 rounded-xl hover:bg-black font-bold transition-all shadow-md disabled:opacity-50"
                    >
                        <Printer size={18}/> Εκτύπωση Εντολής
                    </button>
                </div>
            </div>
        </div>
    );
};
