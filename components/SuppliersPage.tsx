
import React, { useState, useMemo } from 'react';
import { Supplier, Product, ProductionType, Material, SupplierOrder, SupplierOrderItem, MaterialType, SupplierOrderType, ProductionStage } from '../types';
import { Trash2, Plus, Save, Loader2, Globe, Phone, Mail, MapPin, Search, Edit, Package, X, Check, Link, ImageIcon, Box, ShoppingCart, TrendingUp, Clock, Calendar, CheckCircle, List, ArrowRight, FileText, Factory, Printer, Hash } from 'lucide-react';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { api, supabase } from '../lib/supabase';
import { useUI } from './UIProvider';
import { formatCurrency } from '../utils/pricingEngine';
import SupplierOrderPrintView from './SupplierOrderPrintView';
import DesktopPurchaseOrderBuilder from './DesktopPurchaseOrderBuilder';

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
  const [viewOrderId, setViewOrderId] = useState<string | null>(null);
  const [orderToPrint, setOrderToPrint] = useState<SupplierOrder | null>(null);

  const filteredSuppliers = useMemo(() => {
      if (!suppliers) return [];
      return suppliers.filter(s => 
          s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
          s.contact_person?.toLowerCase().includes(searchTerm.toLowerCase())
      ).sort((a, b) => a.name.localeCompare(b.name));
  }, [suppliers, searchTerm]);

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
             <div className="fixed inset-0 z-[300] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
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
                                        <div key={p.sku} className="bg-white p-3 rounded-xl border border-slate-100 flex items-center justify-between group h-fit">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="w-10 h-10 bg-slate-100 rounded-lg overflow-hidden border border-slate-200 shrink-0">
                                                    {p.image_url ? <img src={p.image_url} className="w-full h-full object-cover"/> : <ImageIcon size={16} className="m-auto text-slate-300"/>}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="font-bold text-slate-800 text-sm truncate">{p.sku}</div>
                                                    {p.supplier_sku && (
                                                        <div className="text-[9px] font-black text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100 uppercase inline-block mt-0.5 mb-1 truncate max-w-full">
                                                            Ref: {p.supplier_sku}
                                                        </div>
                                                    )}
                                                    <div className="text-[10px] text-slate-500 font-mono">Κόστος: {formatCurrency(p.active_price || p.supplier_cost || 0)}</div>
                                                </div>
                                            </div>
                                            <button onClick={() => handleUnlinkProduct(p.sku)} className="text-slate-300 hover:text-red-500 p-2 opacity-0 group-hover:opacity-100 transition-all shrink-0"><X size={16}/></button>
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
                                                        #{o.id.slice(0, 6)}
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
                                                 <tr><th className="p-3">Είδος</th><th className="p-3">Όνομα</th><th className="p-3 text-center">Ποσ.</th></tr>
                                             </thead>
                                             <tbody className="divide-y divide-slate-100">
                                                 {relatedOrders.find(o => o.id === viewOrderId)?.items.map((item, i) => (
                                                     <tr key={i}>
                                                         <td className="p-3 font-bold text-slate-600 text-xs">{item.item_type === 'Product' ? 'ΠΡΟΪΟΝ' : 'ΥΛΙΚΟ'}</td>
                                                         <td className="p-3 font-medium text-slate-800">{item.item_name}</td>
                                                         <td className="p-3 text-center font-mono">{item.quantity}</td>
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
            
            {isCreatingOrder && selectedSupplier && (
                 <DesktopPurchaseOrderBuilder 
                    supplier={selectedSupplier}
                    onClose={() => setIsCreatingOrder(false)}
                 />
            )}
        </div>
    </div>
  );
}
