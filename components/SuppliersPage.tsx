
import React, { useState } from 'react';
import { Supplier } from '../types';
import { Trash2, Plus, Save, Loader2, Globe, Phone, Mail, MapPin, Search, Edit } from 'lucide-react';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { api } from '../lib/supabase';
import { useUI } from './UIProvider';

export default function SuppliersPage() {
  const queryClient = useQueryClient();
  const { showToast, confirm } = useUI();
  const { data: suppliers, isLoading } = useQuery({ queryKey: ['suppliers'], queryFn: api.getSuppliers });

  const [isEditing, setIsEditing] = useState(false);
  const [currentSupplier, setCurrentSupplier] = useState<Partial<Supplier>>({ name: '', contact_person: '', phone: '', email: '', address: '', notes: '' });
  const [searchTerm, setSearchTerm] = useState('');

  const filteredSuppliers = suppliers?.filter(s => 
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      s.contact_person?.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const handleEdit = (s: Supplier) => {
      setCurrentSupplier(s);
      setIsEditing(true);
  };

  const handleNew = () => {
      setCurrentSupplier({ name: '', contact_person: '', phone: '', email: '', address: '', notes: '' });
      setIsEditing(true);
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

  if (isLoading) return <div className="flex justify-center items-center h-64"><Loader2 className="animate-spin text-amber-500" size={32} /></div>;

  return (
    <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
            <div>
                <h1 className="text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-3">
                    <div className="p-2 bg-blue-100 text-blue-600 rounded-xl">
                        <Globe size={24} />
                    </div>
                    Προμηθευτές
                </h1>
                <p className="text-slate-500 mt-1 ml-14">Διαχείριση εξωτερικών συνεργατών.</p>
            </div>
            <button onClick={handleNew} className="flex items-center gap-2 bg-slate-900 text-white px-5 py-3 rounded-xl hover:bg-slate-800 font-bold transition-all">
                <Plus size={20} /> Νέος Προμηθευτής
            </button>
        </div>

        {isEditing ? (
            <div className="bg-white p-8 rounded-3xl shadow-lg border border-blue-100 animate-in slide-in-from-top-4">
                <h2 className="text-xl font-bold text-slate-800 mb-6">{currentSupplier.id ? 'Επεξεργασία' : 'Νέος Προμηθευτής'}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase">Επωνυμία *</label>
                            <input value={currentSupplier.name} onChange={e => setCurrentSupplier({...currentSupplier, name: e.target.value})} className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50 font-bold"/>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase">Υπεύθυνος Επικοινωνίας</label>
                            <input value={currentSupplier.contact_person} onChange={e => setCurrentSupplier({...currentSupplier, contact_person: e.target.value})} className="w-full p-3 border border-slate-200 rounded-xl"/>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase">Τηλέφωνο</label>
                            <input value={currentSupplier.phone} onChange={e => setCurrentSupplier({...currentSupplier, phone: e.target.value})} className="w-full p-3 border border-slate-200 rounded-xl"/>
                        </div>
                    </div>
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase">Email</label>
                            <input value={currentSupplier.email} onChange={e => setCurrentSupplier({...currentSupplier, email: e.target.value})} className="w-full p-3 border border-slate-200 rounded-xl"/>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase">Διεύθυνση</label>
                            <input value={currentSupplier.address} onChange={e => setCurrentSupplier({...currentSupplier, address: e.target.value})} className="w-full p-3 border border-slate-200 rounded-xl"/>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase">Σημειώσεις</label>
                            <textarea value={currentSupplier.notes} onChange={e => setCurrentSupplier({...currentSupplier, notes: e.target.value})} className="w-full p-3 border border-slate-200 rounded-xl h-24 resize-none"/>
                        </div>
                    </div>
                </div>
                <div className="flex justify-end gap-3 mt-6">
                    <button onClick={() => setIsEditing(false)} className="px-6 py-3 rounded-xl border border-slate-200 font-bold text-slate-600 hover:bg-slate-50">Ακύρωση</button>
                    <button onClick={handleSave} className="px-6 py-3 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 shadow-md">Αποθήκευση</button>
                </div>
            </div>
        ) : (
            <div className="space-y-4">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
                    <input 
                        type="text" 
                        placeholder="Αναζήτηση..." 
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full pl-10 p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredSuppliers.map(s => (
                        <div key={s.id} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all group relative">
                            <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => handleEdit(s)} className="p-2 bg-slate-100 hover:bg-blue-50 text-slate-600 hover:text-blue-600 rounded-lg"><Edit size={16}/></button>
                                <button onClick={() => handleDelete(s.id)} className="p-2 bg-slate-100 hover:bg-red-50 text-slate-600 hover:text-red-600 rounded-lg"><Trash2 size={16}/></button>
                            </div>
                            <h3 className="font-bold text-lg text-slate-800 mb-1">{s.name}</h3>
                            {s.contact_person && <p className="text-sm text-slate-500 mb-4">{s.contact_person}</p>}
                            
                            <div className="space-y-2 text-sm text-slate-600">
                                {s.phone && <div className="flex items-center gap-2"><Phone size={14} className="text-blue-500"/> {s.phone}</div>}
                                {s.email && <div className="flex items-center gap-2"><Mail size={14} className="text-amber-500"/> {s.email}</div>}
                                {s.address && <div className="flex items-center gap-2"><MapPin size={14} className="text-emerald-500"/> {s.address}</div>}
                            </div>
                        </div>
                    ))}
                    {filteredSuppliers.length === 0 && <div className="col-span-full text-center py-10 text-slate-400 italic">Δεν βρέθηκαν προμηθευτές.</div>}
                </div>
            </div>
        )}
    </div>
  );
}
