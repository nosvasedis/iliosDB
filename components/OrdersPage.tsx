import React, { useState } from 'react';
// FIX: Import `Material` type
import { Order, OrderStatus, Product, ProductVariant, OrderItem, ProductionStage, ProductionBatch, Material, MaterialType, Customer } from '../types';
import { ShoppingCart, Plus, Search, Calendar, Phone, User, CheckCircle, Package, ArrowRight, X, Loader2, Factory, Users, ScanBarcode, Camera, Printer, AlertTriangle, PackageCheck, PackageX, Trash2 } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, supabase, SYSTEM_IDS, recordStockMovement } from '../lib/supabase';
import { useUI } from './UIProvider';
import BarcodeScanner from './BarcodeScanner';

interface Props {
  products: Product[];
  onPrintOrder?: (order: Order) => void;
  // FIX: Add materials to props
  materials: Material[];
}

export default function OrdersPage({ products, onPrintOrder, materials }: Props) {
  const queryClient = useQueryClient();
  const { showToast, confirm } = useUI();
  const { data: orders, isLoading } = useQuery({ queryKey: ['orders'], queryFn: api.getOrders });
  const { data: customers } = useQuery({ queryKey: ['customers'], queryFn: api.getCustomers });

  const [isCreating, setIsCreating] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerResults, setShowCustomerResults] = useState(false);

  const [selectedItems, setSelectedItems] = useState<OrderItem[]>([]);
  const [productSearch, setProductSearch] = useState('');

  // NEW: Fulfillment Modal State
  const [fulfillmentOrder, setFulfillmentOrder] = useState<Order | null>(null);

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
      
      const existingIdx = selectedItems.findIndex(i => i.sku === newItem.sku && i.variant_suffix === newItem.variant_suffix);
      if (existingIdx >= 0) {
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

  const calculateTotal = () => selectedItems.reduce((acc, item) => acc + (item.price_at_order * item.quantity), 0);

  const handleCreateOrder = async () => {
      if (!customerName) {
          showToast("Το όνομα πελάτη είναι υποχρεωτικό.", 'error');
          return;
      }
      if (selectedItems.length === 0) {
          showToast("Προσθέστε τουλάχιστον ένα προϊόν.", 'error');
          return;
      }

      const newOrder: Order = {
          id: `ORD-${Date.now().toString().slice(-6)}`,
          customer_id: selectedCustomerId || undefined,
          customer_name: customerName,
          customer_phone: customerPhone,
          created_at: new Date().toISOString(),
          status: OrderStatus.Pending,
          items: selectedItems,
          total_price: calculateTotal()
      };

      await api.saveOrder(newOrder);
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      
      setIsCreating(false);
      setCustomerName(''); setCustomerPhone(''); setSelectedItems([]); setSelectedCustomerId(null);
      showToast('Η παραγγελία δημιουργήθηκε.', 'success');
  };

  const handleDeleteOrder = async (order: Order) => {
    if (order.status === OrderStatus.InProduction) {
        showToast('Δεν μπορείτε να διαγράψετε μια παραγγελία που βρίσκεται στην παραγωγή.', 'error');
        return;
    }

    const confirmed = await confirm({
        title: 'Διαγραφή Παραγγελίας',
        message: `Είστε σίγουροι ότι θέλετε να διαγράψετε οριστικά την παραγγελία ${order.id}; Αυτή η ενέργεια θα διαγράψει και τις σχετικές παρτίδες παραγωγής.`,
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

  const getStatusColor = (status: OrderStatus) => {
      switch(status) {
          case OrderStatus.Pending: return 'bg-slate-100 text-slate-600 border-slate-200';
          case OrderStatus.InProduction: return 'bg-blue-50 text-blue-600 border-blue-200';
          case OrderStatus.Ready: return 'bg-emerald-50 text-emerald-600 border-emerald-200';
          case OrderStatus.Delivered: return 'bg-[#060b00] text-white border-[#060b00]';
          case OrderStatus.Cancelled: return 'bg-red-50 text-red-500 border-red-200';
      }
  };

  if (isLoading) return <div className="flex justify-center p-12"><Loader2 className="animate-spin text-amber-500"/></div>;

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
          <button onClick={() => setIsCreating(true)} className="flex items-center gap-2 bg-[#060b00] text-white px-5 py-3 rounded-xl hover:bg-black font-bold shadow-lg shadow-slate-200 transition-all hover:-translate-y-0.5">
              <Plus size={20} /> Νέα Παραγγελία
          </button>
      </div>

      {isCreating ? (
          <div className="bg-white rounded-3xl shadow-lg border border-slate-100 flex flex-col overflow-hidden animate-in slide-in-from-right duration-300 flex-1">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                  <h2 className="text-xl font-bold text-slate-800">Δημιουργία Παραγγελίας</h2>
                  <button onClick={() => setIsCreating(false)} className="p-2 hover:bg-slate-200 rounded-full"><X size={20}/></button>
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
                      
                      <div className="bg-gradient-to-br from-[#060b00]/5 to-emerald-50 p-6 rounded-2xl border border-slate-200 shadow-sm">
                          <div className="flex justify-between items-center mb-4">
                             <span className="font-bold text-slate-900 text-sm uppercase">Σύνολο (Χονδρ.)</span>
                             <span className="font-black text-3xl text-[#060b00]">{calculateTotal().toFixed(2)}€</span>
                          </div>
                          <button onClick={handleCreateOrder} className="w-full bg-[#060b00] text-white py-3.5 rounded-xl font-bold hover:bg-black transition-all shadow-lg hover:-translate-y-0.5 active:scale-95">
                              Καταχώρηση
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
                          {selectedItems.map((item, idx) => (
                              <div key={idx} className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                      {item.product_details?.image_url && <img src={item.product_details.image_url} className="w-12 h-12 rounded-lg object-cover bg-slate-100"/>}
                                      <div>
                                          <div className="font-bold text-slate-800 text-lg leading-none">{item.sku}<span className="text-emerald-600">{item.variant_suffix}</span></div>
                                          <div className="text-xs text-slate-500 mt-1">{item.price_at_order.toFixed(2)}€ / τεμ</div>
                                      </div>
                                  </div>
                                  <div className="flex items-center gap-3">
                                      <input type="number" min="1" value={item.quantity} onChange={e => updateQuantity(idx, parseInt(e.target.value))} className="w-16 p-2 bg-white border border-slate-200 rounded-lg text-center font-bold outline-none focus:border-emerald-500 transition-colors"/>
                                      <div className="font-black w-20 text-right text-slate-800 text-lg">{(item.price_at_order * item.quantity).toFixed(2)}€</div>
                                      <button onClick={() => updateQuantity(idx, 0)} className="text-slate-300 hover:text-red-500 p-2 hover:bg-red-50 rounded-lg transition-colors"><X size={18}/></button>
                                  </div>
                              </div>
                          ))}
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
                                          {order.status}
                                      </span>
                                  </td>
                                  <td className="p-4 text-right font-black text-slate-800">
                                      {order.total_price.toFixed(2)}€
                                  </td>
                                  <td className="p-4 text-center">
                                      <div className="flex items-center justify-center gap-2">
                                          {onPrintOrder && (
                                              <button 
                                                onClick={() => onPrintOrder(order)} 
                                                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                                                title="Εκτύπωση Παραγγελίας"
                                              >
                                                  <Printer size={16} />
                                              </button>
                                          )}

                                          <button
                                            onClick={() => handleDeleteOrder(order)}
                                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                            title="Διαγραφή Παραγγελίας"
                                          >
                                            <Trash2 size={16} />
                                          </button>

                                          {order.status === OrderStatus.Pending && (
                                              <button onClick={() => setFulfillmentOrder(order)} className="text-xs bg-emerald-50 text-emerald-600 hover:bg-emerald-100 px-3 py-1.5 rounded-lg font-bold border border-emerald-200 transition-colors flex items-center gap-1 hover:shadow-sm">
                                                  <ArrowRight size={14}/> Εκτέλεση
                                              </button>
                                          )}
                                          {order.status === OrderStatus.Ready && (
                                              <button className="text-xs bg-emerald-50 text-emerald-600 hover:bg-emerald-100 px-3 py-1.5 rounded-lg font-bold border border-emerald-200 transition-colors flex items-center gap-1 hover:shadow-sm">
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
    </div>
  );
}

// NEW: Fulfillment Modal Component
const FulfillmentModal = ({ order, products, materials, onClose }: { order: Order, products: Product[], materials: Material[], onClose: () => void }) => {
    const queryClient = useQueryClient();
    const { showToast } = useUI();
    const [allocations, setAllocations] = useState<Record<string, { fromStock: number }>>({});
    const [isLoading, setIsLoading] = useState(false);

    const getAvailableStock = (item: OrderItem) => {
        const product = products.find(p => p.sku === item.sku);
        if (!product) return 0;

        if (item.variant_suffix) {
            const variant = product.variants?.find(v => v.suffix === item.variant_suffix);
            return variant?.location_stock?.[SYSTEM_IDS.CENTRAL] || variant?.stock_qty || 0;
        }
        return product.location_stock?.[SYSTEM_IDS.CENTRAL] || product.stock_qty || 0;
    };

    const handleAllocationChange = (itemId: string, value: number) => {
        const orderedItem = order.items.find(i => (i.sku + (i.variant_suffix || '')) === itemId);
        const stock = getAvailableStock(orderedItem!);
        const newStockQty = Math.max(0, Math.min(stock, value, orderedItem!.quantity));

        setAllocations(prev => ({ ...prev, [itemId]: { ...prev[itemId], fromStock: newStockQty } }));
    };

    const handleConfirmFulfillment = async () => {
        setIsLoading(true);
        try {
            for (const item of order.items) {
                const itemId = item.sku + (item.variant_suffix || '');
                const allocation = allocations[itemId] || { fromStock: 0 };
                
                const toProduce = item.quantity - allocation.fromStock;

                // 1. Deduct from stock if needed
                if (allocation.fromStock > 0) {
                    const currentStock = getAvailableStock(item);
                    const newStock = currentStock - allocation.fromStock;

                    if (item.variant_suffix) {
                        await supabase.from('product_variants').update({ stock_qty: newStock }).match({ product_sku: item.sku, suffix: item.variant_suffix });
                    } else {
                        await supabase.from('products').update({ stock_qty: newStock }).eq('sku', item.sku);
                    }
                    await recordStockMovement(item.sku, -allocation.fromStock, `Fulfillment for Order ${order.id}`, item.variant_suffix);
                }

                // 2. Create production batch if needed
                if (toProduce > 0) {
                    const product = products.find(p => p.sku === item.sku);
                    // FIX: `materials` was not defined. It's now passed in through props.
                    const hasStones = product?.recipe.some(r => r.type === 'raw' && materials.find(m => m.id === r.id)?.type === MaterialType.Stone) || false;

                    const batch: ProductionBatch = {
                        id: `BAT-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
                        order_id: order.id,
                        sku: item.sku,
                        variant_suffix: item.variant_suffix,
                        quantity: toProduce,
                        current_stage: ProductionStage.Waxing,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                        priority: 'Normal',
                        requires_setting: hasStones
                    };
                    await api.createProductionBatch(batch);
                }
            }

            // 3. Update Order Status
            await api.updateOrderStatus(order.id, OrderStatus.InProduction);
            
            queryClient.invalidateQueries({ queryKey: ['orders'] });
            queryClient.invalidateQueries({ queryKey: ['products'] });
            queryClient.invalidateQueries({ queryKey: ['batches'] });

            showToast('Η παραγγελία προωθήθηκε!', 'success');
            onClose();

        } catch (err: any) {
            showToast(`Σφάλμα: ${err.message}`, 'error');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[150] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 h-[90vh]">
                <div className="p-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800">Πλάνο Εκτέλεσης Παραγγελίας</h2>
                        <p className="text-sm text-slate-500 font-mono">{order.id}</p>
                    </div>
                    <button onClick={onClose} disabled={isLoading}><X/></button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {order.items.map(item => {
                        const itemId = item.sku + (item.variant_suffix || '');
                        const stock = getAvailableStock(item);
                        const allocatedFromStock = allocations[itemId]?.fromStock || 0;
                        const toProduce = item.quantity - allocatedFromStock;

                        return (
                            <div key={itemId} className="bg-white p-4 rounded-2xl border border-slate-200 grid grid-cols-12 gap-4 items-center shadow-sm">
                                <div className="col-span-4 flex items-center gap-3">
                                    <img src={item.product_details?.image_url || ''} className="w-12 h-12 rounded-lg object-cover bg-slate-100"/>
                                    <div>
                                        <div className="font-bold text-slate-800">{item.sku}{item.variant_suffix && `-${item.variant_suffix}`}</div>
                                        <div className="text-xs text-slate-500">Ζήτηση: <span className="font-bold text-slate-700">{item.quantity}</span></div>
                                    </div>
                                </div>
                                <div className="col-span-2 text-center">
                                    <div className="text-[10px] font-bold text-slate-400 uppercase">Διαθέσιμο</div>
                                    <div className={`font-bold text-lg ${stock > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>{stock}</div>
                                </div>
                                <div className="col-span-3 flex items-center gap-2">
                                    <label htmlFor={`stock_${itemId}`} className="text-sm font-medium text-slate-600">Από Stock:</label>
                                    <input 
                                        type="number" 
                                        id={`stock_${itemId}`}
                                        value={allocatedFromStock}
                                        onChange={e => handleAllocationChange(itemId, parseInt(e.target.value) || 0)}
                                        max={Math.min(stock, item.quantity)}
                                        min="0"
                                        className="w-20 p-2 text-center font-bold border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                                    />
                                </div>
                                <div className="col-span-3 flex justify-between items-center bg-blue-50/70 p-3 rounded-xl border border-blue-100">
                                    <span className="text-sm font-bold text-blue-800">Για Παραγωγή:</span>
                                    <span className="font-black text-xl text-blue-900">{toProduce}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="p-6 border-t border-slate-100 bg-white flex justify-end">
                    <button onClick={handleConfirmFulfillment} disabled={isLoading} className="bg-[#060b00] text-white font-bold py-3 px-6 rounded-xl flex items-center gap-2 hover:bg-black disabled:opacity-60 transition-all">
                        {isLoading ? <Loader2 className="animate-spin"/> : <CheckCircle size={18}/>}
                        {isLoading ? 'Επεξεργασία...' : 'Επιβεβαίωση & Αποστολή'}
                    </button>
                </div>
            </div>
        </div>
    );
};