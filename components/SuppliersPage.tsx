
import React, { useState, useMemo } from 'react';
import { Supplier, Product, ProductionType, Material, SupplierOrder, SupplierOrderItem, MaterialType, SupplierOrderType, ProductionStage } from '../types';
import { Trash2, Plus, Save, Loader2, Globe, Phone, Mail, MapPin, Search, Edit, Package, X, Check, Link, ImageIcon, Box, ShoppingCart, TrendingUp, Clock, Calendar, CheckCircle, List, ArrowRight, FileText, Factory, Printer, StickyNote, Gem, AlertCircle } from 'lucide-react';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { api, supabase } from '../lib/supabase';
import { useUI } from './UIProvider';
import { formatCurrency } from '../utils/pricingEngine';
import SupplierOrderPrintView from './SupplierOrderPrintView';

const MATERIAL_TYPE_LABELS: Record<string, string> = {
    'Stone': 'Πέτρα',
    'Cord': 'Κορδόνι',
    'Component': 'Εξάρτημα',
    'Enamel': 'Σμάλτο',
    'Leather': 'Δέρμα'
};

export default function SuppliersPage() {
  const queryClient = useQueryClient();
  const { showToast, confirm } = useUI();
  
  // Data Fetching
  const { data: suppliers, isLoading: loadingSuppliers } = useQuery({ queryKey: ['suppliers'], queryFn: api.getSuppliers });
  const { data: products } = useQuery({ queryKey: ['products'], queryFn: api.getProducts });
  const { data: materials } = useQuery({ queryKey: ['materials'], queryFn: api.getMaterials });
  const { data: supplierOrders } = useQuery({ queryKey: ['supplier_orders'], queryFn: api.getSupplierOrders });
  const { data: productionBatches } = useQuery({ queryKey: ['batches'], queryFn: api.getProductionBatches });
  const { data: orders } = useQuery({ queryKey: ['orders'], queryFn: api.getOrders });

  // UI State
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [activeTab, setActiveTab] = useState<'info' | 'products' | 'materials' | 'orders'>('info');
  const [isEditing, setIsEditing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Create/Edit Supplier Form
  const [supplierForm, setSupplierForm] = useState<Partial<Supplier>>({});

  // Product Assignment State
  const [productSearchTerm, setProductSearchTerm] = useState('');
  
  // Purchase Order State
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [orderItems, setOrderItems] = useState<SupplierOrderItem[]>([]);
  const [orderNotes, setOrderNotes] = useState('');
  const [viewOrderId, setViewOrderId] = useState<string | null>(null);
  const [orderToPrint, setOrderToPrint] = useState<SupplierOrder | null>(null);
  
  // PO Item Selection
  const [poSearch, setPoSearch] = useState('');
  const [poType, setPoType] = useState<SupplierOrderType>('Material');
  const [showAllProducts, setShowAllProducts] = useState(false); 

  const filteredSuppliers = useMemo(() => {
      if (!suppliers) return [];
      return suppliers.filter(s => 
          s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
          s.contact_person?.toLowerCase().includes(searchTerm.toLowerCase())
      ).sort((a, b) => a.name.localeCompare(b.name));
  }, [suppliers, searchTerm]);

  // Production Needs Intelligence
  const productionNeeds = useMemo(() => {
      if (!productionBatches || !products || !orders) return { linked: [], other: [] };
      
      const awaiting = productionBatches.filter(b => b.current_stage === ProductionStage.AwaitingDelivery);
      
      // Group by SKU + Variant to sum quantities
      const groupedNeeds: Record<string, { sku: string, variant?: string, totalQty: number, requirements: { orderId: string, customer: string }[], product?: Product }> = {};

      awaiting.forEach(b => {
          const key = `${b.sku}-${b.variant_suffix || ''}`;
          if (!groupedNeeds[key]) {
              const product = products.find(p => p.sku === b.sku);
              groupedNeeds[key] = {
                  sku: b.sku,
                  variant: b.variant_suffix || undefined,
                  totalQty: 0,
                  requirements: [],
                  product
              };
          }
          groupedNeeds[key].totalQty += b.quantity;
          if (b.order_id) {
              const order = orders.find(o => o.id === b.order_id);
              groupedNeeds[key].requirements.push({
                  orderId: b.order_id,
                  customer: order?.customer_name || 'Άγνωστος'
              });
          }
      });

      const needsList = Object.values(groupedNeeds);
      
      // Split into "Linked" vs "Other"
      const linked = needsList.filter(n => n.product?.supplier_id === selectedSupplier?.id);
      const other = needsList.filter(n => n.product?.supplier_id !== selectedSupplier?.id);

      return { linked, other };
  }, [productionBatches, products, selectedSupplier, orders]);

  // Supplier Actions
  const handleSaveSupplier = async () => {
      if (!supplierForm.name) { showToast("Η επωνυμία είναι υποχρεωτική", 'error'); return; }
      try {
          await api.saveSupplier(supplierForm);
          queryClient.invalidateQueries({ queryKey: ['suppliers'] });
          setIsEditing(false);
          showToast("Αποθηκεύτηκε επιτυχώς.", 'success');
          if (selectedSupplier && supplierForm.id === selectedSupplier.id) {
              setSelectedSupplier({ ...selectedSupplier, ...supplierForm } as Supplier);
          }
      } catch(e) { showToast("Σφάλμα αποθήκευσης.", 'error'); }
  };

  const handleDeleteSupplier = async (id: string) => {
      if (!await confirm({ title: 'Διαγραφή', message: 'Είστε σίγουροι;', isDestructive: true })) return;
      try {
          await api.deleteSupplier(id);
          queryClient.invalidateQueries({ queryKey: ['suppliers'] });
          if (selectedSupplier?.id === id) setSelectedSupplier(null);
          showToast("Διαγράφηκε.", 'info');
      } catch(e) { showToast("Σφάλμα διαγραφής.", 'error'); }
  };

  const assignedProducts = useMemo(() => {
      return (products?.filter(p => p.supplier_id === selectedSupplier?.id) || [])
          .sort((a, b) => a.sku.localeCompare(b.sku, undefined, { numeric: true }));
  }, [products, selectedSupplier]);

  const assignedMaterials = useMemo(() => {
      return (materials?.filter(m => m.supplier_id === selectedSupplier?.id) || [])
          .sort((a, b) => a.name.localeCompare(b.name));
  }, [materials, selectedSupplier]);

  const relatedOrders = useMemo(() => supplierOrders?.filter(o => o.supplier_id === selectedSupplier?.id) || [], [supplierOrders, selectedSupplier]);

  const availableProductsForLink = useMemo(() => {
      if (!products || !selectedSupplier) return [];
      const lower = productSearchTerm.toLowerCase();
      return products
        .filter(p => p.supplier_id !== selectedSupplier.id)
        .filter(p => p.sku.toLowerCase().includes(lower))
        .sort((a, b) => a.sku.localeCompare(b.sku, undefined, { numeric: true }))
        .slice(0, 20);
  }, [products, selectedSupplier, productSearchTerm]);

  const handleLinkProduct = async (sku: string) => {
      if (!selectedSupplier) return;
      try {
          await supabase.from('products').update({ supplier_id: selectedSupplier.id }).eq('sku', sku);
          queryClient.invalidateQueries({ queryKey: ['products'] });
          showToast("Προϊόν συνδέθηκε.", "success");
      } catch (e) { showToast("Σφάλμα.", "error"); }
  };

  const handleUnlinkProduct = async (sku: string) => {
      try {
          await supabase.from('products').update({ supplier_id: null }).eq('sku', sku);
          queryClient.invalidateQueries({ queryKey: ['products'] });
          showToast("Σύνδεση αφαιρέθηκε.", "success");
      } catch (e) { showToast("Σφάλμα.", "error"); }
  };

  const handleAddToOrder = (item: any, type: SupplierOrderType, qty: number = 1) => {
      const id = type === 'Product' ? item.sku : item.id;
      const name = type === 'Product' ? item.sku : item.name;
      
      // IMPROVED COST LOGIC: Supplier Cost > Active Price > Draft Price > 0
      let cost = 0;
      if (type === 'Product') {
          cost = (item.supplier_cost && item.supplier_cost > 0) 
                 ? item.supplier_cost 
                 : (item.active_price || item.draft_price || 0);
      } else {
          cost = item.cost_per_unit || 0;
      }
      
      setOrderItems(prev => {
          const existingIdx = prev.findIndex(i => i.item_id === id && i.item_type === type);
          if (existingIdx >= 0) {
              const updated = [...prev];
              updated[existingIdx].quantity += qty;
              updated[existingIdx].total_cost = updated[existingIdx].quantity * updated[existingIdx].unit_cost;
              return updated;
          }
          return [...prev, {
              id: Math.random().toString(36),
              item_type: type,
              item_id: id,
              item_name: name,
              quantity: qty,
              unit_cost: cost,
              total_cost: cost * qty,
              notes: ''
          }];
      });
  };

  const updateOrderItem = (index: number, field: string, value: any) => {
      setOrderItems(prev => {
          const updated = [...prev];
          const item = { ...updated[index] };
          if (field === 'qty') item.quantity = parseInt(value) || 1;
          else if (field === 'cost') item.unit_cost = parseFloat(value) || 0;
          else if (field === 'notes') item.notes = value;
          
          item.total_cost = item.quantity * item.unit_cost;
          updated[index] = item;
          return updated;
      });
  };

  const saveOrder = async () => {
      if (!selectedSupplier || orderItems.length === 0) return;
      try {
          const total = orderItems.reduce((s, i) => s + i.total_cost, 0);
          const order: SupplierOrder = {
              id: crypto.randomUUID(),
              supplier_id: selectedSupplier.id,
              supplier_name: selectedSupplier.name,
              created_at: new Date().toISOString(),
              status: 'Pending',
              total_amount: total,
              items: orderItems,
              notes: orderNotes
          };
          await api.saveSupplierOrder(order);
          queryClient.invalidateQueries({ queryKey: ['supplier_orders'] });
          setIsCreatingOrder(false);
          setOrderItems([]);
          setOrderNotes('');
          showToast("Εντολή Αγοράς δημιουργήθηκε!", "success");
      } catch (e) { showToast("Σφάλμα.", "error"); }
  };

  const handleReceiveOrder = async (order: SupplierOrder) => {
      const yes = await confirm({ title: 'Παραλαβή', message: 'Θέλετε να παραλάβετε τα προϊόντα; Θα ενημερωθεί το απόθεμα.', confirmText: 'Παραλαβή' });
      if (!yes) return;
      try {
          await api.receiveSupplierOrder(order);
          queryClient.invalidateQueries({ queryKey: ['supplier_orders'] });
          queryClient.invalidateQueries({ queryKey: ['products'] }); 
          queryClient.invalidateQueries({ queryKey: ['materials'] }); 
          showToast("Παραλαβή ολοκληρώθηκε.", "success");
      } catch (e) { showToast("Σφάλμα παραλαβής.", "error"); }
  };

  return (
    <div className="h-[calc(100vh-100px)] flex gap-6">
        
        {orderToPrint && products && (
             <div className="fixed inset-0 z-[300] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4">
                 <div className="bg-white rounded-3xl w-full max-w-4xl h-[90vh] overflow-hidden flex flex-col shadow-2xl">
                     <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                         <h3 className="font-bold text-slate-800 flex items-center gap-2"><Printer size={18}/> Προεπισκόπηση Εκτύπωσης</h3>
                         <button onClick={() => setOrderToPrint(null)} className="p-2 hover:bg-slate-200 rounded-full text-slate-500"><X size={20}/></button>
                     </div>
                     <div className="flex-1 overflow-auto bg-slate-200 p-8 flex justify-center">
                         <div className="scale-[0.8] origin-top">
                            <SupplierOrderPrintView order={orderToPrint} products={products} />
                         </div>
                     </div>
                     <div className="p-4 border-t border-slate-100 flex justify-end gap-3 bg-white">
                         <button onClick={() => window.print()} className="px-6 py-2 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 shadow-lg">Εκτύπωση</button>
                     </div>
                 </div>
             </div>
        )}

        <div className="w-1/3 bg-white rounded-3xl border border-slate-100 flex flex-col overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-100 space-y-3">
                <div className="flex justify-between items-center">
                    <h2 className="font-bold text-slate-800 flex items-center gap-2"><Globe className="text-blue-500"/> Προμηθευτές</h2>
                    <button onClick={() => { setSelectedSupplier(null); setSupplierForm({}); setIsEditing(true); }} className="p-2 bg-slate-900 text-white rounded-lg hover:bg-black transition-colors shadow-md"><Plus size={18}/></button>
                </div>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16}/>
                    <input className="w-full pl-9 p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/20" placeholder="Αναζήτηση..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
                {filteredSuppliers.map(s => (
                    <div key={s.id} onClick={() => { setSelectedSupplier(s); setActiveTab('info'); setIsEditing(false); }} className={`p-4 rounded-xl border cursor-pointer transition-all ${selectedSupplier?.id === s.id ? 'bg-blue-50 border-blue-200 shadow-sm ring-1 ring-blue-100' : 'bg-white border-transparent hover:bg-slate-50'}`}>
                        <div className="font-bold text-slate-800">{s.name}</div>
                        {s.contact_person && <div className="text-xs text-slate-500 mt-1">{s.contact_person}</div>}
                    </div>
                ))}
            </div>
        </div>

        <div className="flex-1 bg-white rounded-3xl border border-slate-100 flex flex-col overflow-hidden shadow-sm relative">
            {selectedSupplier ? (
                <>
                    <div className="p-6 border-b border-slate-100 flex justify-between items-start bg-slate-50/50">
                        <div className="flex items-center gap-4">
                            <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-blue-600 shadow-sm border border-blue-100">
                                <Globe size={32}/>
                            </div>
                            <div>
                                <h1 className="text-2xl font-black text-slate-900">{selectedSupplier.name}</h1>
                                <div className="flex gap-4 text-sm text-slate-500 mt-1">
                                    {selectedSupplier.phone && <span className="flex items-center gap-1"><Phone size={14}/> {selectedSupplier.phone}</span>}
                                    {selectedSupplier.email && <span className="flex items-center gap-1"><Mail size={14}/> {selectedSupplier.email}</span>}
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-2">
                             <button onClick={() => { setSupplierForm(selectedSupplier); setIsEditing(true); }} className="px-4 py-2 bg-white border border-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-50">Επεξεργασία</button>
                             <button onClick={() => handleDeleteSupplier(selectedSupplier.id)} className="p-2 text-slate-300 hover:text-red-500 rounded-xl hover:bg-red-50 transition-colors"><Trash2 size={20}/></button>
                        </div>
                    </div>

                    <div className="flex border-b border-slate-100 px-6 gap-6">
                        <button onClick={() => setActiveTab('info')} className={`py-4 text-sm font-bold border-b-2 transition-colors ${activeTab === 'info' ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>Πληροφορίες</button>
                        <button onClick={() => setActiveTab('products')} className={`py-4 text-sm font-bold border-b-2 transition-colors ${activeTab === 'products' ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>Προϊόντα ({assignedProducts.length})</button>
                        <button onClick={() => setActiveTab('materials')} className={`py-4 text-sm font-bold border-b-2 transition-colors ${activeTab === 'materials' ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>Υλικά ({assignedMaterials.length})</button>
                        <button onClick={() => setActiveTab('orders')} className={`py-4 text-sm font-bold border-b-2 transition-colors ${activeTab === 'orders' ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>Παραγγελίες ({relatedOrders.length})</button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 bg-slate-50/30 custom-scrollbar">
                        {activeTab === 'info' && (
                            <div className="space-y-6 max-w-2xl">
                                <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-4">
                                    <h3 className="font-bold text-slate-800 uppercase text-xs tracking-wider">Στοιχεία Επικοινωνίας</h3>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div><label className="text-xs text-slate-400 font-bold block mb-1">Υπεύθυνος</label><div className="font-medium text-slate-700">{selectedSupplier.contact_person || '-'}</div></div>
                                        <div><label className="text-xs text-slate-400 font-bold block mb-1">Τηλέφωνο</label><div className="font-medium text-slate-700">{selectedSupplier.phone || '-'}</div></div>
                                        <div><label className="text-xs text-slate-400 font-bold block mb-1">Email</label><div className="font-medium text-slate-700">{selectedSupplier.email || '-'}</div></div>
                                        <div><label className="text-xs text-slate-400 font-bold block mb-1">Διεύθυνση</label><div className="font-medium text-slate-700">{selectedSupplier.address || '-'}</div></div>
                                    </div>
                                </div>
                                <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                                    <h3 className="font-bold text-slate-800 uppercase text-xs tracking-wider mb-2">Σημειώσεις</h3>
                                    <p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">{selectedSupplier.notes || 'Καμία σημείωση.'}</p>
                                </div>
                            </div>
                        )}

                        {activeTab === 'products' && (
                            <div className="space-y-4">
                                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
                                    <Search className="text-slate-400"/>
                                    <input className="flex-1 outline-none text-sm font-medium" placeholder="Αναζήτηση προϊόντος για σύνδεση..." value={productSearchTerm} onChange={e => setProductSearchTerm(e.target.value)}/>
                                </div>
                                {productSearchTerm && availableProductsForLink.length > 0 && (
                                    <div className="bg-white rounded-xl border border-slate-100 shadow-lg p-2 space-y-1">
                                        {availableProductsForLink.map(p => (
                                            <div key={p.sku} className="flex justify-between items-center p-2 hover:bg-slate-50 rounded-lg">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 bg-slate-100 rounded overflow-hidden">{p.image_url && <img src={p.image_url} className="w-full h-full object-cover"/>}</div>
                                                    <span className="font-bold text-sm text-slate-700">{p.sku}</span>
                                                </div>
                                                <button onClick={() => handleLinkProduct(p.sku)} className="text-xs bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg font-bold hover:bg-blue-100">Σύνδεση</button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {assignedProducts.map(p => (
                                        <div key={p.sku} className="bg-white p-3 rounded-xl border border-slate-100 flex items-center justify-between group">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 bg-slate-100 rounded-lg overflow-hidden border border-slate-200">
                                                    {p.image_url ? <img src={p.image_url} className="w-full h-full object-cover"/> : <ImageIcon size={16} className="m-auto text-slate-300"/>}
                                                </div>
                                                <div>
                                                    <div className="font-bold text-slate-800 text-sm">{p.sku}</div>
                                                    <div className="text-[10px] text-slate-500 font-mono">Κόστος: {formatCurrency(p.active_price || p.supplier_cost || 0)}</div>
                                                </div>
                                            </div>
                                            <button onClick={() => handleUnlinkProduct(p.sku)} className="text-slate-300 hover:text-red-500 p-2 opacity-0 group-hover:opacity-100 transition-all"><X size={16}/></button>
                                        </div>
                                    ))}
                                    {assignedProducts.length === 0 && <div className="col-span-full text-center py-10 text-slate-400 italic">Κανένα συνδεδεμένο προϊόν.</div>}
                                </div>
                            </div>
                        )}

                        {activeTab === 'materials' && (
                             <div className="space-y-4">
                                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {assignedMaterials.map(m => (
                                        <div key={m.id} className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex items-center gap-3">
                                            <div className="w-10 h-10 bg-purple-50 text-purple-600 rounded-lg flex items-center justify-center shrink-0">
                                                <Box size={18}/>
                                            </div>
                                            <div>
                                                <div className="font-bold text-slate-800 text-sm">{m.name}</div>
                                                <div className="text-xs text-slate-500">{MATERIAL_TYPE_LABELS[m.type] || m.type} • {formatCurrency(m.cost_per_unit)} / {m.unit}</div>
                                            </div>
                                        </div>
                                    ))}
                                    {assignedMaterials.length === 0 && <div className="col-span-full text-center py-10 text-slate-400 italic">Κανένα συνδεδεμένο υλικό. (Ορίστε τον προμηθευτή στη σελίδα Υλικών)</div>}
                                 </div>
                             </div>
                        )}

                        {activeTab === 'orders' && (
                            <div className="space-y-6">
                                <button onClick={() => setIsCreatingOrder(true)} className="w-full py-3 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 font-bold hover:border-emerald-400 hover:text-emerald-600 hover:bg-emerald-50 transition-all flex items-center justify-center gap-2">
                                    <Plus size={20}/> Νέα Εντολή Αγοράς
                                </button>
                                <div className="space-y-3">
                                    {relatedOrders.map(o => (
                                        <div key={o.id} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex justify-between items-center group hover:border-blue-200 transition-all">
                                            <div className="flex items-center gap-4">
                                                <div className={`p-3 rounded-xl ${o.status === 'Pending' ? 'bg-amber-100 text-amber-600' : (o.status === 'Received' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600')}`}>
                                                    {o.status === 'Pending' ? <Clock size={20}/> : (o.status === 'Received' ? <CheckCircle size={20}/> : <X size={20}/>)}
                                                </div>
                                                <div>
                                                    <div className="font-black text-slate-800 text-lg flex items-center gap-2">
                                                        {formatCurrency(o.total_amount)}
                                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${o.status === 'Pending' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>{o.status}</span>
                                                    </div>
                                                    <div className="text-xs text-slate-500 font-medium">
                                                        {new Date(o.created_at).toLocaleDateString('el-GR')} • {o.items.length} είδη
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex gap-2">
                                                <button onClick={() => setOrderToPrint(o)} className="p-2 text-slate-400 hover:text-slate-800"><Printer size={18}/></button>
                                                <button onClick={() => setViewOrderId(viewOrderId === o.id ? null : o.id)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-bold text-slate-600 transition-colors">Λεπτομέρειες</button>
                                                {o.status === 'Pending' && (
                                                    <button onClick={() => handleReceiveOrder(o)} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors shadow-md">Παραλαβή</button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                    {relatedOrders.length === 0 && <div className="text-center text-slate-400 italic py-10">Δεν υπάρχουν παραγγελίες.</div>}
                                </div>
                            </div>
                        )}
                        
                        {viewOrderId && (
                             <div className="fixed inset-0 z-[150] bg-black/50 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in">
                                 <div className="bg-white w-full max-w-2xl rounded-3xl p-6 shadow-2xl relative">
                                     <button onClick={() => setViewOrderId(null)} className="absolute top-4 right-4 p-2 bg-slate-100 rounded-full text-slate-500 hover:bg-slate-200"><X size={20}/></button>
                                     <h3 className="text-xl font-black text-slate-800 mb-4 flex items-center gap-2"><FileText size={24}/> Λεπτομέρειες Εντολής</h3>
                                     <div className="max-h-[60vh] overflow-y-auto custom-scrollbar border rounded-xl border-slate-200">
                                         <table className="w-full text-sm text-left">
                                             <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold">
                                                 <tr><th className="p-3">Είδος</th><th className="p-3">Όνομα</th><th className="p-3 text-center">Ποσ.</th><th className="p-3 text-right">Σύνολο</th></tr>
                                             </thead>
                                             <tbody className="divide-y divide-slate-100">
                                                 {relatedOrders.find(o => o.id === viewOrderId)?.items.map((item, i) => (
                                                     <tr key={i}>
                                                         <td className="p-3 font-bold text-slate-600 text-xs">{item.item_type}</td>
                                                         <td className="p-3 font-medium text-slate-800">{item.item_name}</td>
                                                         <td className="p-3 text-center font-mono">{item.quantity}</td>
                                                         <td className="p-3 text-right font-black">{formatCurrency(item.total_cost)}</td>
                                                     </tr>
                                                 ))}
                                             </tbody>
                                         </table>
                                     </div>
                                 </div>
                             </div>
                        )}
                    </div>
                </>
            ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-10">
                    <Globe size={64} className="opacity-20 mb-4"/>
                    <p className="font-bold">Επιλέξτε προμηθευτή</p>
                </div>
            )}
            
            {isEditing && (
                <div className="absolute inset-0 bg-white z-50 flex flex-col animate-in slide-in-from-bottom-4">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                        <h2 className="text-xl font-black text-slate-800">{supplierForm.id ? 'Επεξεργασία' : 'Νέος Προμηθευτής'}</h2>
                        <button onClick={() => setIsEditing(false)} className="p-2 bg-slate-100 rounded-full"><X size={20}/></button>
                    </div>
                    <div className="p-8 space-y-4 flex-1 overflow-y-auto max-w-2xl mx-auto w-full">
                        <input value={supplierForm.name || ''} onChange={e => setSupplierForm({...supplierForm, name: e.target.value})} placeholder="Επωνυμία *" className="w-full p-4 border border-slate-200 rounded-xl font-bold outline-none focus:ring-2 focus:ring-blue-500/20"/>
                        <input value={supplierForm.contact_person || ''} onChange={e => setSupplierForm({...supplierForm, contact_person: e.target.value})} placeholder="Υπεύθυνος" className="w-full p-4 border border-slate-200 rounded-xl outline-none"/>
                        <div className="grid grid-cols-2 gap-4">
                            <input value={supplierForm.phone || ''} onChange={e => setSupplierForm({...supplierForm, phone: e.target.value})} placeholder="Τηλέφωνο" className="w-full p-4 border border-slate-200 rounded-xl outline-none"/>
                            <input value={supplierForm.email || ''} onChange={e => setSupplierForm({...supplierForm, email: e.target.value})} placeholder="Email" className="w-full p-4 border border-slate-200 rounded-xl outline-none"/>
                        </div>
                        <input value={supplierForm.address || ''} onChange={e => setSupplierForm({...supplierForm, address: e.target.value})} placeholder="Διεύθυνση" className="w-full p-4 border border-slate-200 rounded-xl outline-none"/>
                        <textarea value={supplierForm.notes || ''} onChange={e => setSupplierForm({...supplierForm, notes: e.target.value})} placeholder="Σημειώσεις" className="w-full p-4 border border-slate-200 rounded-xl h-32 resize-none outline-none"/>
                        <button onClick={handleSaveSupplier} className="w-full py-4 bg-slate-900 text-white font-bold rounded-xl shadow-lg hover:bg-black transition-colors">Αποθήκευση</button>
                    </div>
                </div>
            )}
            
            {/* Desktop Order Builder Modal */}
            {isCreatingOrder && selectedSupplier && (
                <div className="absolute inset-0 bg-white z-50 flex flex-col animate-in slide-in-from-right-4">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                        <div>
                            <h2 className="text-xl font-black text-slate-800">Νέα Εντολή Αγοράς</h2>
                            <p className="text-sm text-slate-500">{selectedSupplier.name}</p>
                        </div>
                        <button onClick={() => setIsCreatingOrder(false)} className="p-2 bg-white rounded-full text-slate-500"><X size={20}/></button>
                    </div>
                    
                    <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
                        {/* LEFT: CONTROLS */}
                        <div className="lg:w-1/3 p-6 border-r border-slate-100 overflow-y-auto space-y-6 custom-scrollbar bg-white">
                            {(productionNeeds.linked.length > 0 || productionNeeds.other.length > 0) && (
                                <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 space-y-3 shadow-inner">
                                    <div className="flex justify-between items-center">
                                        <h3 className="font-bold text-indigo-900 text-xs uppercase flex items-center gap-2">
                                            <Factory size={14}/> Ανάγκες Παραγωγής
                                        </h3>
                                        <span className="bg-white text-indigo-600 px-2 py-0.5 rounded-full text-[10px] font-black shadow-sm">
                                            {productionNeeds.linked.length} Συνδεδεμένα
                                        </span>
                                    </div>
                                    
                                    <div className="max-h-48 overflow-y-auto custom-scrollbar pr-1 space-y-2">
                                        {productionNeeds.linked.map((n, idx) => (
                                            <div key={idx} className="bg-white p-2 rounded-lg border border-indigo-200 flex justify-between items-center shadow-sm">
                                                <div className="flex items-center gap-2">
                                                    {n.product?.image_url && <div className="w-8 h-8 rounded bg-slate-100 overflow-hidden border border-slate-200"><img src={n.product.image_url} className="w-full h-full object-cover"/></div>}
                                                    <div className="min-w-0">
                                                        <div className="font-black text-slate-800 text-xs truncate">{n.sku}{n.variant}</div>
                                                        <div className="text-[9px] text-slate-500 font-bold uppercase mt-0.5 truncate max-w-[120px]">
                                                            {n.requirements.map(r => `${r.customer}`).join(', ')}
                                                        </div>
                                                    </div>
                                                </div>
                                                <button 
                                                    onClick={() => handleAddToOrder(n.product, 'Product', n.totalQty)}
                                                    className="bg-indigo-100 text-indigo-700 px-2 py-1 rounded text-xs font-bold hover:bg-indigo-200 shrink-0"
                                                >
                                                    +{n.totalQty}
                                                </button>
                                            </div>
                                        ))}
                                        
                                        {productionNeeds.other.length > 0 && (
                                            <div className="mt-2 pt-2 border-t border-indigo-200/50">
                                                 <p className="text-[9px] font-bold text-indigo-400 uppercase mb-2">Άλλα ({productionNeeds.other.length})</p>
                                                 {productionNeeds.other.map((n, idx) => (
                                                    <div key={`other-${idx}`} className="bg-white/50 p-2 rounded-lg border border-slate-200 flex justify-between items-center mb-1">
                                                        <span className="font-bold text-slate-600 text-xs">{n.sku}{n.variant}</span>
                                                        <button 
                                                            onClick={() => handleAddToOrder(n.product, 'Product', n.totalQty)}
                                                            className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-[10px] font-bold hover:bg-slate-200 shrink-0"
                                                        >
                                                            Add {n.totalQty}
                                                        </button>
                                                    </div>
                                                 ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            <div className="flex gap-2 p-1 bg-slate-100 rounded-xl">
                                <button onClick={() => setPoType('Material')} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${poType === 'Material' ? 'bg-white shadow-sm text-purple-600' : 'text-slate-500'}`}>Υλικά</button>
                                <button onClick={() => setPoType('Product')} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${poType === 'Product' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500'}`}>Προϊόντα</button>
                            </div>
                            
                            {poType === 'Product' && (
                                <div className="flex items-center gap-2 px-1">
                                    <input type="checkbox" checked={showAllProducts} onChange={e => setShowAllProducts(e.target.checked)} id="deskShowAll" className="w-4 h-4 text-blue-600 rounded"/>
                                    <label htmlFor="deskShowAll" className="text-xs font-bold text-slate-600 cursor-pointer">Εμφάνιση όλων (όχι μόνο συνδεδεμένων)</label>
                                </div>
                            )}

                            <div className="relative group">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500" size={16}/>
                                <input 
                                    className="w-full pl-9 p-3 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all" 
                                    placeholder={`Αναζήτηση ${poType === 'Material' ? 'υλικού' : 'προϊόντος'}...`} 
                                    value={poSearch} 
                                    onChange={e => setPoSearch(e.target.value)}
                                />
                                {poSearch && (
                                    <div className="absolute top-full left-0 right-0 bg-white border border-slate-100 rounded-xl shadow-xl mt-2 z-50 max-h-60 overflow-y-auto custom-scrollbar">
                                        {(poType === 'Material' ? materials : products)?.filter((i: any) => {
                                            const matchesSearch = (i.name || i.sku).toLowerCase().includes(poSearch.toLowerCase());
                                            if (poType === 'Product' && !showAllProducts) return matchesSearch && i.supplier_id === selectedSupplier.id;
                                            return matchesSearch;
                                        }).slice(0, 20).map((item: any) => (
                                            <div key={item.id || item.sku} onClick={() => { handleAddToOrder(item, poType); setPoSearch(''); }} className="w-full text-left p-2 hover:bg-slate-50 border-b border-slate-50 flex justify-between items-center text-sm cursor-pointer group">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center shrink-0">
                                                        {item.image_url ? <img src={item.image_url} className="w-full h-full object-cover"/> : (poType==='Material'?<Box size={14} className="text-slate-400"/>:<ImageIcon size={14} className="text-slate-400"/>)}
                                                    </div>
                                                    <div>
                                                        <span className="font-bold text-slate-700 block">{item.name || item.sku}</span>
                                                        <span className="text-[10px] text-slate-400 block">{poType === 'Product' ? item.category : item.type}</span>
                                                    </div>
                                                </div>
                                                <Plus size={16} className="text-slate-300 group-hover:text-emerald-500"/>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            
                            <div className="pt-4 border-t border-slate-50">
                                <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Γενικές Σημειώσεις</label>
                                <textarea value={orderNotes} onChange={e => setOrderNotes(e.target.value)} className="w-full p-3 border border-slate-200 rounded-xl text-sm h-24 resize-none outline-none focus:ring-2 focus:ring-slate-200" placeholder="Οδηγίες προς προμηθευτή..."/>
                            </div>
                        </div>

                        {/* RIGHT: LIST */}
                        <div className="flex-1 bg-slate-50/50 p-6 flex flex-col overflow-hidden">
                            <div className="flex-1 overflow-y-auto space-y-2 mb-4 custom-scrollbar pr-2">
                                {orderItems.map((item, idx) => (
                                    <div key={idx} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between group hover:border-blue-300 transition-all">
                                        <div className="flex items-center gap-4">
                                            {item.item_type === 'Product' && (
                                                <div className="w-10 h-10 bg-slate-100 rounded-lg overflow-hidden border border-slate-200 shrink-0">
                                                    {(() => {
                                                        const p = products?.find(x => x.sku === item.item_id);
                                                        return p?.image_url ? <img src={p.image_url} className="w-full h-full object-cover"/> : <ImageIcon className="m-auto text-slate-300" size={16}/>;
                                                    })()}
                                                </div>
                                            )}
                                            <div>
                                                <div className="font-black text-slate-800 text-sm">{item.item_name}</div>
                                                <div className="text-[10px] text-slate-400 font-bold uppercase flex items-center gap-2">
                                                    {item.item_type === 'Product' ? 'ΠΡΟΪΟΝ' : 'ΥΛΙΚΟ'}
                                                    <input 
                                                        className="bg-slate-50 border-b border-slate-200 text-slate-600 w-32 focus:w-48 outline-none transition-all placeholder:italic"
                                                        placeholder="Σημείωση είδους..."
                                                        value={item.notes || ''}
                                                        onChange={e => updateOrderItem(idx, 'notes', e.target.value)}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-6">
                                            <div className="flex flex-col items-end">
                                                <label className="text-[8px] font-bold text-slate-400 uppercase">Κοστος</label>
                                                <div className="flex items-center gap-1">
                                                    <input type="number" value={item.unit_cost} onChange={e => updateOrderItem(idx, 'cost', parseFloat(e.target.value)||0)} className="w-16 p-1 border rounded text-right text-sm font-mono font-bold text-slate-700 bg-slate-50 focus:bg-white"/>
                                                    <span className="text-xs text-slate-400">€</span>
                                                </div>
                                            </div>
                                            <div className="flex flex-col items-center">
                                                 <label className="text-[8px] font-bold text-slate-400 uppercase">Ποσοτητα</label>
                                                 <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5 border border-slate-200">
                                                     <button onClick={() => updateOrderItem(idx, 'qty', Math.max(1, item.quantity - 1))} className="w-6 h-6 flex items-center justify-center hover:bg-white rounded shadow-sm transition-all text-slate-500 font-bold">-</button>
                                                     <input type="number" value={item.quantity} onChange={e => updateOrderItem(idx, 'qty', parseInt(e.target.value)||1)} className="w-10 text-center bg-transparent text-sm font-black outline-none"/>
                                                     <button onClick={() => updateOrderItem(idx, 'qty', item.quantity + 1)} className="w-6 h-6 flex items-center justify-center hover:bg-white rounded shadow-sm transition-all text-slate-500 font-bold">+</button>
                                                 </div>
                                            </div>
                                            <div className="w-24 text-right">
                                                 <div className="text-[8px] font-bold text-slate-400 uppercase">Συνολο</div>
                                                 <div className="font-black text-slate-900 text-lg">{formatCurrency(item.total_cost)}</div>
                                            </div>
                                            <button onClick={() => setOrderItems(prev => prev.filter((_, i) => i !== idx))} className="text-slate-300 hover:text-red-500 p-2 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={18}/></button>
                                        </div>
                                    </div>
                                ))}
                                {orderItems.length === 0 && (
                                    <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-50">
                                        <ShoppingCart size={48} className="mb-2"/>
                                        <p className="font-bold">Η λίστα είναι κενή</p>
                                    </div>
                                )}
                            </div>
                            
                            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-lg flex justify-between items-center">
                                <div>
                                    <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Γενικο Συνολο</div>
                                    <div className="text-3xl font-black text-emerald-600 tracking-tight">{formatCurrency(orderItems.reduce((s,i) => s + i.total_cost, 0))}</div>
                                </div>
                                <button onClick={saveOrder} className="bg-slate-900 text-white px-8 py-4 rounded-xl font-bold hover:bg-black transition-all shadow-xl active:scale-95 flex items-center gap-2">
                                    <Save size={20}/> Δημιουργία Εντολής
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
