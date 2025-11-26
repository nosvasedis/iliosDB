

import React, { useState } from 'react';
import { Order, OrderStatus, Product, ProductVariant, OrderItem, ProductionStage, ProductionBatch, MaterialType, Customer } from '../types';
import { ShoppingCart, Plus, Search, Calendar, Phone, User, CheckCircle, Package, ArrowRight, X, Loader2, Factory, Users } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/supabase';
import { useUI } from './UIProvider';

interface Props {
  products: Product[];
}

export default function OrdersPage({ products }: Props) {
  const queryClient = useQueryClient();
  const { showToast, confirm } = useUI();
  const { data: orders, isLoading } = useQuery({ queryKey: ['orders'], queryFn: api.getOrders });
  const { data: customers } = useQuery({ queryKey: ['customers'], queryFn: api.getCustomers });

  const [isCreating, setIsCreating] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // New Order Form State
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  
  // Customer Search within Modal
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerResults, setShowCustomerResults] = useState(false);

  const [selectedItems, setSelectedItems] = useState<OrderItem[]>([]);
  const [productSearch, setProductSearch] = useState('');

  // Derived filtered products for adding to order
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
      const newItem: OrderItem = {
          sku: product.sku,
          variant_suffix: variant?.suffix,
          quantity: 1,
          price_at_order: product.selling_price,
          product_details: product
      };
      
      // Check if already exists
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

      // If selecting a new name but ID is null, we could optionally auto-create customer. 
      // For now, we allow loose coupling (guest checkout style) but recommend picking a user.

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
      
      // Reset
      setIsCreating(false);
      setCustomerName(''); setCustomerPhone(''); setSelectedItems([]); setSelectedCustomerId(null);
      showToast('Η παραγγελία δημιουργήθηκε.', 'success');
  };

  const sendToProduction = async (order: Order) => {
      const confirmed = await confirm({
          title: 'Αποστολή στην Παραγωγή',
          message: `Δημιουργία ${order.items.length} εντολών παραγωγής για την παραγγελία ${order.id};`,
          confirmText: 'Αποστολή'
      });

      if (!confirmed) return;

      try {
          for (const item of order.items) {
              const product = products.find(p => p.sku === item.sku);
              const hasStones = product?.recipe.some(r => r.type === 'raw' && r.itemDetails?.type === MaterialType.Stone) || false; 

              const batch: ProductionBatch = {
                  id: `BAT-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
                  order_id: order.id,
                  sku: item.sku,
                  variant_suffix: item.variant_suffix,
                  quantity: item.quantity,
                  current_stage: ProductionStage.Waxing, 
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                  priority: 'Normal',
                  requires_setting: hasStones
              };
              await api.createProductionBatch(batch);
          }
          
          await api.updateOrderStatus(order.id, OrderStatus.InProduction);
          queryClient.invalidateQueries({ queryKey: ['orders'] });
          showToast('Οι εντολές παραγωγής δημιουργήθηκαν.', 'success');
      } catch (e) {
          console.error(e);
          showToast('Σφάλμα κατά την αποστολή.', 'error');
      }
  };

  const getStatusColor = (status: OrderStatus) => {
      switch(status) {
          case OrderStatus.Pending: return 'bg-slate-100 text-slate-600';
          case OrderStatus.InProduction: return 'bg-blue-100 text-blue-600';
          case OrderStatus.Ready: return 'bg-emerald-100 text-emerald-600';
          case OrderStatus.Delivered: return 'bg-slate-900 text-white';
          case OrderStatus.Cancelled: return 'bg-red-50 text-red-500';
      }
  };

  if (isLoading) return <div className="flex justify-center p-12"><Loader2 className="animate-spin text-amber-500"/></div>;

  return (
    <div className="space-y-6 h-[calc(100vh-100px)] flex flex-col">
       <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-100 shrink-0">
          <div>
            <h1 className="text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-3">
                <div className="p-2 bg-indigo-100 text-indigo-600 rounded-xl">
                    <ShoppingCart size={24} />
                </div>
                Παραγγελίες Πελατών
            </h1>
            <p className="text-slate-500 mt-1 ml-14">Διαχείριση λιανικής και χονδρικής.</p>
          </div>
          <button onClick={() => setIsCreating(true)} className="flex items-center gap-2 bg-slate-900 text-white px-5 py-3 rounded-xl hover:bg-slate-800 font-bold shadow-lg shadow-slate-200 transition-all hover:-translate-y-0.5">
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
                          <label className="block text-sm font-bold text-slate-700 uppercase tracking-wide">Στοιχεία Πελάτη</label>
                          
                          {/* Smart Customer Search */}
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
                                    className={`w-full pl-10 p-3 border rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 ${selectedCustomerId ? 'border-indigo-300 bg-indigo-50 text-indigo-900 font-bold' : 'border-slate-200'}`}
                                  />
                                  {selectedCustomerId && (
                                      <button onClick={() => { setSelectedCustomerId(null); setCustomerName(''); setCustomerPhone(''); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-indigo-400 hover:text-indigo-600">
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
                              <input type="text" placeholder="Τηλέφωνο" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} className="w-full pl-10 p-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"/>
                          </div>
                      </div>
                      
                      <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                          <div className="flex justify-between items-center mb-2">
                             <span className="font-bold text-indigo-900">Σύνολο</span>
                             <span className="font-black text-2xl text-indigo-600">{calculateTotal().toFixed(2)}€</span>
                          </div>
                          <button onClick={handleCreateOrder} className="w-full bg-indigo-600 text-white py-3 rounded-lg font-bold hover:bg-indigo-700 transition-colors shadow-md">
                              Καταχώρηση
                          </button>
                      </div>
                  </div>

                  <div className="lg:col-span-2 flex flex-col h-full">
                      <label className="block text-sm font-bold text-slate-700 uppercase tracking-wide mb-2">Προϊόντα</label>
                      <div className="relative mb-4 z-20">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
                          <input 
                            type="text" 
                            placeholder="Αναζήτηση SKU..." 
                            value={productSearch} 
                            onChange={e => setProductSearch(e.target.value)} 
                            className="w-full pl-10 p-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                          {productSearch && (
                              <div className="absolute top-full left-0 right-0 bg-white shadow-xl rounded-xl border border-slate-100 mt-2 max-h-60 overflow-y-auto divide-y divide-slate-50">
                                  {filteredProducts.map(p => (
                                      <div key={p.sku} className="p-3 hover:bg-slate-50 cursor-pointer">
                                          <div className="flex justify-between font-bold text-slate-800" onClick={() => handleAddItem(p)}>
                                              <span>{p.sku}</span>
                                              <span>{p.selling_price}€</span>
                                          </div>
                                          {p.variants && p.variants.length > 0 && (
                                              <div className="mt-2 flex flex-wrap gap-2">
                                                  {p.variants.map(v => (
                                                      <span key={v.suffix} onClick={(e) => { e.stopPropagation(); handleAddItem(p, v); }} className="text-xs bg-slate-100 hover:bg-indigo-100 text-slate-600 hover:text-indigo-700 px-2 py-1 rounded cursor-pointer border border-slate-200">
                                                          {v.suffix} ({v.description})
                                                      </span>
                                                  ))}
                                              </div>
                                          )}
                                      </div>
                                  ))}
                                  {filteredProducts.length === 0 && <div className="p-4 text-center text-slate-400 text-sm">Δεν βρέθηκαν προϊόντα.</div>}
                              </div>
                          )}
                      </div>

                      <div className="flex-1 overflow-y-auto border border-slate-100 rounded-xl bg-slate-50 p-2 space-y-2">
                          {selectedItems.map((item, idx) => (
                              <div key={idx} className="bg-white p-3 rounded-lg border border-slate-100 shadow-sm flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                      {item.product_details?.image_url && <img src={item.product_details.image_url} className="w-10 h-10 rounded-md object-cover bg-slate-100"/>}
                                      <div>
                                          <div className="font-bold text-slate-800">{item.sku}{item.variant_suffix}</div>
                                          <div className="text-xs text-slate-500">{item.price_at_order}€ / τεμ</div>
                                      </div>
                                  </div>
                                  <div className="flex items-center gap-3">
                                      <input type="number" min="1" value={item.quantity} onChange={e => updateQuantity(idx, parseInt(e.target.value))} className="w-16 p-1 border border-slate-200 rounded text-center font-bold"/>
                                      <div className="font-bold w-16 text-right">{(item.price_at_order * item.quantity).toFixed(2)}€</div>
                                      <button onClick={() => updateQuantity(idx, 0)} className="text-slate-300 hover:text-red-500"><X size={18}/></button>
                                  </div>
                              </div>
                          ))}
                          {selectedItems.length === 0 && (
                              <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-50">
                                  <Package size={48} className="mb-2"/>
                                  <p>Το καλάθι είναι άδειο</p>
                              </div>
                          )}
                      </div>
                  </div>
              </div>
          </div>
      ) : (
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 flex-1 overflow-hidden flex flex-col">
              <div className="p-4 border-b border-slate-100 bg-slate-50/30 flex items-center gap-3">
                   <Search className="text-slate-400" size={20}/>
                   <input type="text" placeholder="Αναζήτηση παραγγελίας ή πελάτη..." className="bg-transparent outline-none w-full" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}/>
              </div>
              <div className="overflow-y-auto flex-1">
                  <table className="w-full text-left border-collapse">
                      <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs sticky top-0">
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
                                          {order.customer_id ? <Users size={14} className="text-blue-500"/> : null} 
                                          {order.customer_name}
                                      </div>
                                      {order.customer_phone && <div className="text-xs text-slate-500">{order.customer_phone}</div>}
                                  </td>
                                  <td className="p-4 text-sm text-slate-600">
                                      <div className="flex items-center gap-1.5"><Calendar size={14} className="opacity-50"/> {new Date(order.created_at).toLocaleDateString('el-GR')}</div>
                                  </td>
                                  <td className="p-4">
                                      <span className={`px-3 py-1 rounded-full text-xs font-bold border border-transparent ${getStatusColor(order.status)}`}>
                                          {order.status}
                                      </span>
                                  </td>
                                  <td className="p-4 text-right font-bold text-slate-800">
                                      {order.total_price.toFixed(2)}€
                                  </td>
                                  <td className="p-4 text-center">
                                      {order.status === OrderStatus.Pending && (
                                          <button onClick={() => sendToProduction(order)} className="text-xs bg-indigo-50 text-indigo-600 hover:bg-indigo-100 px-3 py-1.5 rounded-lg font-bold border border-indigo-200 transition-colors flex items-center gap-1 mx-auto">
                                              <Factory size={14}/> Παραγωγή
                                          </button>
                                      )}
                                      {order.status === OrderStatus.Ready && (
                                          <button className="text-xs bg-emerald-50 text-emerald-600 hover:bg-emerald-100 px-3 py-1.5 rounded-lg font-bold border border-emerald-200 transition-colors flex items-center gap-1 mx-auto">
                                              <CheckCircle size={14}/> Παράδοση
                                          </button>
                                      )}
                                  </td>
                              </tr>
                          ))}
                          {orders?.length === 0 && <tr><td colSpan={6} className="p-12 text-center text-slate-400">Δεν βρέθηκαν παραγγελίες.</td></tr>}
                      </tbody>
                  </table>
              </div>
          </div>
      )}
    </div>
  );
}