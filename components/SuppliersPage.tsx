
import React, { useState, useMemo } from 'react';
import { Supplier, Product } from '../types';
import { Trash2, Plus, Save, Loader2, Globe, Phone, Mail, MapPin, Search, Edit, Package, X, Check, Link } from 'lucide-react';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { api, supabase } from '../lib/supabase';
import { useUI } from './UIProvider';

export default function SuppliersPage() {
  const queryClient = useQueryClient();
  const { showToast, confirm } = useUI();
  const { data: suppliers, isLoading } = useQuery({ queryKey: ['suppliers'], queryFn: api.getSuppliers });
  const { data: products } = useQuery({ queryKey: ['products'], queryFn: api.getProducts });

  const [isEditing, setIsEditing] = useState(false);
  const [currentSupplier, setCurrentSupplier] = useState<Partial<Supplier>>({ name: '', contact_person: '', phone: '', email: '', address: '', notes: '' });
  const [searchTerm, setSearchTerm] = useState('');
  
  // Product Assignment State
  const [productSearchTerm, setProductSearchTerm] = useState('');

  const filteredSuppliers = suppliers?.filter(s => 
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      s.contact_person?.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const handleEdit = (s: Supplier) => {
      setCurrentSupplier(s);
      setIsEditing(true);
      setProductSearchTerm('');
  };

  const handleNew = () => {
      setCurrentSupplier({ name: '', contact_person: '', phone: '', email: '', address: '', notes: '' });
      setIsEditing(true);
      setProductSearchTerm('');
  };

  const handleSave = async () => {
      if (!currentSupplier.name) {
          showToast("Το όνομα είναι υποχρεωτικό.", 'error');
          return;
      }
      try {
          await api.saveSupplier(currentSupplier);
          queryClient.invalidateQueries({ queryKey: ['suppliers'] });
          setIsEditing(false);
          showToast("Αποθηκεύτηκε επιτυχώς.", 'success');
      } catch(e) {
          showToast("Σφάλμα αποθήκευσης.", 'error');
      }
  };

  const handleDelete = async (id: string) => {
      if (!await confirm({ title: 'Διαγραφή', message: 'Είστε σίγουροι;', isDestructive: true })) return;
      try {
          await api.deleteSupplier(id);
          queryClient.invalidateQueries({ queryKey: ['suppliers'] });
          showToast("Διαγράφηκε.", 'info');
      } catch(e) {
          showToast("Σφάλμα διαγραφής. Πιθανώς χρησιμοποιείται σε προϊόντα.", 'error');
      }
  };

  const handleAssignProduct = async (sku: string) => {
      if (!currentSupplier.id) return;
      try {
          // Direct update for speed and isolation
          const { error } = await supabase.from('products').update({ supplier_id: currentSupplier.id }).eq('sku', sku);
          if (error) throw error;
          queryClient.invalidateQueries({ queryKey: ['products'] });
          showToast(`Το προϊόν ${sku} ανατέθηκε στον προμηθευτή.`, "success");
      } catch (e: any) {
          showToast(`Σφάλμα ανάθεσης: ${e.message}`, "error");
      }
  };

  const handleUnassignProduct = async (sku: string) => {
      try {
          const { error } = await supabase.from('products').update({ supplier_id: null }).eq('sku', sku);
          if (error) throw error;
          queryClient.invalidateQueries({ queryKey: ['products'] });
          showToast(`Αφαιρέθηκε η ανάθεση για το ${sku}.`, "success");
      } catch (e: any) {
          showToast(`Σφάλμα: ${e.message}`, "error");
      }
  };

  // Memoized Lists for Product Assignment
  const assignedProducts = useMemo(() => {
      if (!products || !currentSupplier.id) return [];
      return products.filter(p => p.supplier_id === currentSupplier.id);
  }, [products, currentSupplier.id]);

  const searchResults = useMemo(() => {
      if (!products || !productSearchTerm || productSearchTerm.length < 2) return [];
      const lowerTerm = productSearchTerm.toLowerCase();
      // Filter out products already assigned to THIS supplier
      return products
        .filter(p => p.sku.toLowerCase().includes(lowerTerm) && p.supplier_id !== currentSupplier.id)
        .slice(0, 10);
  }, [products, productSearchTerm, currentSupplier.id]);

  if (isLoading) return <div className="flex justify-center items-center h-64"><Loader2 className="animate-spin text-amber-500" size={32} /></div>;

  return (
    <div className="space-y-6 h-full flex flex-col">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-100 shrink-0">
            <div>
                <h1 className="text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-3">
                    <div className="p-2 bg-blue-100 text-blue-600 rounded-xl">
                        <Globe size={24} />
                    </div>
                    Προμηθευτές
                </h1>
                <p className="text-slate-500 mt-1 ml-14">Διαχείριση εξωτερικών συνεργατών.</p>
            </div>
            {!isEditing && (
                <button onClick={handleNew} className="flex items-center gap-2 bg-slate-900 text-white px-5 py-3 rounded-xl hover:bg-slate-800 font-bold transition-all">
                    <Plus size={20} /> Νέος Προμηθευτής
                </button>
            )}
        </div>

        {isEditing ? (
            <div className="flex-1 bg-white rounded-3xl shadow-lg border border-blue-100 flex flex-col overflow-hidden animate-in slide-in-from-top-4">
                <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        {currentSupplier.id ? <Edit size={20} className="text-blue-600"/> : <Plus size={20} className="text-blue-600"/>}
                        {currentSupplier.id ? 'Επεξεργασία Προμηθευτή' : 'Νέος Προμηθευτής'}
                    </h2>
                    <button onClick={() => setIsEditing(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"><X size={20}/></button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* FORM SECTION */}
                        <div className="space-y-6">
                            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 space-y-4">
                                <h3 className="font-bold text-slate-700 mb-2 uppercase text-xs tracking-wider">Βασικά Στοιχεία</h3>
                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase">Επωνυμία *</label>
                                    <input value={currentSupplier.name} onChange={e => setCurrentSupplier({...currentSupplier, name: e.target.value})} className="w-full p-3 border border-slate-200 rounded-xl bg-white font-bold outline-none focus:ring-2 focus:ring-blue-500/20"/>
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase">Υπεύθυνος Επικοινωνίας</label>
                                    <input value={currentSupplier.contact_person} onChange={e => setCurrentSupplier({...currentSupplier, contact_person: e.target.value})} className="w-full p-3 border border-slate-200 rounded-xl bg-white outline-none focus:ring-2 focus:ring-blue-500/20"/>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-xs font-bold text-slate-500 uppercase">Τηλέφωνο</label>
                                        <input value={currentSupplier.phone} onChange={e => setCurrentSupplier({...currentSupplier, phone: e.target.value})} className="w-full p-3 border border-slate-200 rounded-xl bg-white outline-none focus:ring-2 focus:ring-blue-500/20"/>
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-slate-500 uppercase">Email</label>
                                        <input value={currentSupplier.email} onChange={e => setCurrentSupplier({...currentSupplier, email: e.target.value})} className="w-full p-3 border border-slate-200 rounded-xl bg-white outline-none focus:ring-2 focus:ring-blue-500/20"/>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase">Διεύθυνση</label>
                                    <input value={currentSupplier.address} onChange={e => setCurrentSupplier({...currentSupplier, address: e.target.value})} className="w-full p-3 border border-slate-200 rounded-xl bg-white outline-none focus:ring-2 focus:ring-blue-500/20"/>
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase">Σημειώσεις</label>
                                    <textarea value={currentSupplier.notes} onChange={e => setCurrentSupplier({...currentSupplier, notes: e.target.value})} className="w-full p-3 border border-slate-200 rounded-xl h-24 resize-none bg-white outline-none focus:ring-2 focus:ring-blue-500/20"/>
                                </div>
                            </div>
                            <div className="flex justify-end gap-3 pt-2">
                                <button onClick={() => setIsEditing(false)} className="px-6 py-3 rounded-xl border border-slate-200 font-bold text-slate-600 hover:bg-slate-50">Ακύρωση</button>
                                <button onClick={handleSave} className="px-6 py-3 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 shadow-md flex items-center gap-2"><Save size={18}/> Αποθήκευση</button>
                            </div>
                        </div>

                        {/* PRODUCTS SECTION */}
                        {currentSupplier.id && (
                            <div className="flex flex-col h-full bg-blue-50/50 rounded-2xl border border-blue-100 overflow-hidden">
                                <div className="p-6 border-b border-blue-100 bg-white/50">
                                    <h3 className="font-bold text-blue-900 flex items-center gap-2 uppercase text-xs tracking-wider mb-4"><Package size={16}/> Συνδεδεμένα Προϊόντα ({assignedProducts.length})</h3>
                                    
                                    <div className="relative group">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={16}/>
                                        <input 
                                            type="text" 
                                            placeholder="Αναζήτηση προϊόντος για ανάθεση..." 
                                            value={productSearchTerm}
                                            onChange={e => setProductSearchTerm(e.target.value)}
                                            className="w-full pl-9 p-3 border border-blue-200 rounded-xl bg-white outline-none focus:ring-2 focus:ring-blue-500/20 text-sm font-bold text-slate-700 placeholder-slate-400"
                                        />
                                        {searchResults.length > 0 && (
                                            <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-slate-100 z-50 max-h-60 overflow-y-auto">
                                                {searchResults.map(p => (
                                                    <button 
                                                        key={p.sku} 
                                                        onClick={() => handleAssignProduct(p.sku)}
                                                        className="w-full text-left p-3 hover:bg-blue-50 flex justify-between items-center group border-b border-slate-50 last:border-0"
                                                    >
                                                        <div>
                                                            <div className="font-bold text-slate-800 text-sm">{p.sku}</div>
                                                            <div className="text-[10px] text-slate-500">{p.category}</div>
                                                        </div>
                                                        <div className="text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-xs font-bold bg-blue-100 px-2 py-1 rounded">
                                                            <Link size={12}/> Ανάθεση
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                
                                <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                                    {assignedProducts.map(p => (
                                        <div key={p.sku} className="bg-white p-3 rounded-xl border border-slate-100 flex justify-between items-center group hover:border-blue-200 transition-all shadow-sm">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 bg-slate-100 rounded-lg overflow-hidden border border-slate-200">
                                                    {p.image_url ? <img src={p.image_url} className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center text-slate-300"><Package size={16}/></div>}
                                                </div>
                                                <div>
                                                    <div className="font-bold text-slate-800 text-sm">{p.sku}</div>
                                                    <div className="text-[10px] text-slate-500 font-mono">{p.supplier_sku ? `Ref: ${p.supplier_sku}` : 'No Ref Code'}</div>
                                                </div>
                                            </div>
                                            <button onClick={() => handleUnassignProduct(p.sku)} className="text-slate-300 hover:text-red-500 p-2 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100" title="Αφαίρεση Ανάθεσης">
                                                <X size={16}/>
                                            </button>
                                        </div>
                                    ))}
                                    {assignedProducts.length === 0 && (
                                        <div className="text-center py-10 text-slate-400 text-sm italic">
                                            Δεν υπάρχουν προϊόντα συνδεδεμένα με αυτόν τον προμηθευτή.
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        ) : (
            <div className="flex-1 overflow-y-auto custom-scrollbar p-1">
                <div className="space-y-4">
                    <div className="relative max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
                        <input 
                            type="text" 
                            placeholder="Αναζήτηση..." 
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full pl-10 p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 shadow-sm"
                        />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredSuppliers.map(s => (
                            <div key={s.id} onClick={() => handleEdit(s)} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all group relative cursor-pointer active:scale-[0.98]">
                                <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }} className="p-2 bg-slate-100 hover:bg-red-50 text-slate-600 hover:text-red-600 rounded-lg"><Trash2 size={16}/></button>
                                </div>
                                <h3 className="font-bold text-lg text-slate-800 mb-1">{s.name}</h3>
                                {s.contact_person && <p className="text-sm text-slate-500 mb-4">{s.contact_person}</p>}
                                
                                <div className="space-y-2 text-sm text-slate-600">
                                    {s.phone && <div className="flex items-center gap-2"><Phone size={14} className="text-blue-500"/> {s.phone}</div>}
                                    {s.email && <div className="flex items-center gap-2"><Mail size={14} className="text-amber-500"/> {s.email}</div>}
                                    {s.address && <div className="flex items-center gap-2"><MapPin size={14} className="text-emerald-500"/> {s.address}</div>}
                                </div>
                                
                                {/* Product Count Badge */}
                                {(() => {
                                    const count = products?.filter(p => p.supplier_id === s.id).length || 0;
                                    if (count > 0) return (
                                        <div className="absolute bottom-4 right-4 text-[10px] font-bold bg-blue-50 text-blue-600 px-2 py-1 rounded border border-blue-100">
                                            {count} προϊόντα
                                        </div>
                                    );
                                })()}
                            </div>
                        ))}
                        {filteredSuppliers.length === 0 && <div className="col-span-full text-center py-10 text-slate-400 italic">Δεν βρέθηκαν προμηθευτές.</div>}
                    </div>
                </div>
            </div>
        )}
    </div>
  );
}
