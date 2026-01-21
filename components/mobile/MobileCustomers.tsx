
import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/supabase';
import { Search, Phone, Mail, User, MapPin, Globe, Plus, X, Save, Trash2, Edit } from 'lucide-react';
import { Customer, Supplier } from '../../types';
import { useUI } from '../UIProvider';

export default function MobileCustomers() {
    const { data: customers } = useQuery({ queryKey: ['customers'], queryFn: api.getCustomers });
    const { data: suppliers } = useQuery({ queryKey: ['suppliers'], queryFn: api.getSuppliers });
    const queryClient = useQueryClient();
    const { showToast, confirm } = useUI();
    
    const [tab, setTab] = useState<'customers' | 'suppliers'>('customers');
    const [search, setSearch] = useState('');
    
    // Edit/Create State
    const [isEditing, setIsEditing] = useState(false);
    const [editType, setEditType] = useState<'customer' | 'supplier'>('customer');
    const [editData, setEditData] = useState<any>(null); // Polymorphic object

    const filteredList = useMemo(() => {
        if (tab === 'customers') {
            if (!customers) return [];
            return customers.filter(c => 
                c.full_name.toLowerCase().includes(search.toLowerCase()) || 
                (c.phone && c.phone.includes(search))
            ).sort((a, b) => a.full_name.localeCompare(b.full_name, 'el', { sensitivity: 'base' }));
        } else {
            if (!suppliers) return [];
            return suppliers.filter(s => 
                s.name.toLowerCase().includes(search.toLowerCase()) ||
                s.contact_person?.toLowerCase().includes(search.toLowerCase())
            );
        }
    }, [customers, suppliers, tab, search]);

    const handleCreate = () => {
        setEditType(tab === 'customers' ? 'customer' : 'supplier');
        setEditData(tab === 'customers' ? { full_name: '', phone: '', email: '', address: '', vat_number: '', notes: '' } : { name: '', contact_person: '', phone: '', email: '', address: '', notes: '' });
        setIsEditing(true);
    };

    const handleEdit = (item: any) => {
        setEditType(tab === 'customers' ? 'customer' : 'supplier');
        setEditData({ ...item });
        setIsEditing(true);
    };

    const handleSave = async () => {
        if (editType === 'customer' && !editData.full_name) { showToast('Το όνομα είναι υποχρεωτικό', 'error'); return; }
        if (editType === 'supplier' && !editData.name) { showToast('Η επωνυμία είναι υποχρεωτική', 'error'); return; }

        try {
            if (editType === 'customer') {
                if (editData.id) await api.updateCustomer(editData.id, editData);
                else await api.saveCustomer(editData);
                queryClient.invalidateQueries({ queryKey: ['customers'] });
            } else {
                await api.saveSupplier(editData);
                queryClient.invalidateQueries({ queryKey: ['suppliers'] });
            }
            setIsEditing(false);
            showToast("Αποθηκεύτηκε επιτυχώς.", "success");
        } catch (e) {
            showToast("Σφάλμα αποθήκευσης.", "error");
        }
    };

    const handleDelete = async () => {
        if (!editData.id) return;
        if (await confirm({ title: 'Διαγραφή', message: 'Είστε σίγουροι;', isDestructive: true })) {
            try {
                if (editType === 'customer') await api.deleteCustomer(editData.id);
                else await api.deleteSupplier(editData.id);
                
                queryClient.invalidateQueries({ queryKey: [editType === 'customer' ? 'customers' : 'suppliers'] });
                setIsEditing(false);
                showToast("Διαγράφηκε.", "success");
            } catch (e) {
                showToast("Σφάλμα διαγραφής.", "error");
            }
        }
    };

    if (isEditing) {
        return (
            <div className="flex flex-col h-full bg-slate-50">
                <div className="p-4 bg-white border-b border-slate-100 flex justify-between items-center sticky top-0 z-10">
                    <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                        {editData.id ? <Edit size={20} className="text-blue-500"/> : <Plus size={20} className="text-emerald-500"/>}
                        {editData.id ? 'Επεξεργασία' : 'Νέα Εγγραφή'}
                    </h2>
                    <button onClick={() => setIsEditing(false)} className="p-2 bg-slate-100 rounded-full text-slate-500"><X size={20}/></button>
                </div>
                
                <div className="p-4 flex-1 overflow-y-auto space-y-4">
                    <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-4">
                        <div>
                            <label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-1 block">
                                {editType === 'customer' ? 'Ονοματεπωνυμο / Επωνυμια *' : 'Επωνυμια *'}
                            </label>
                            <input 
                                value={editType === 'customer' ? editData.full_name : editData.name} 
                                onChange={e => setEditData({...editData, [editType === 'customer' ? 'full_name' : 'name']: e.target.value})}
                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold text-slate-900 focus:ring-2 focus:ring-blue-500/20"
                            />
                        </div>
                        {editType === 'supplier' && (
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-1 block">Υπευθυνος Επικοινωνιας</label>
                                <input 
                                    value={editData.contact_person || ''} 
                                    onChange={e => setEditData({...editData, contact_person: e.target.value})}
                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none text-slate-900"
                                />
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-1 block">Τηλεφωνο</label>
                                <input 
                                    value={editData.phone || ''} 
                                    onChange={e => setEditData({...editData, phone: e.target.value})}
                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none text-slate-900"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-1 block">Email</label>
                                <input 
                                    value={editData.email || ''} 
                                    onChange={e => setEditData({...editData, email: e.target.value})}
                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none text-slate-900"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-1 block">Διευθυνση</label>
                            <input 
                                value={editData.address || ''} 
                                onChange={e => setEditData({...editData, address: e.target.value})}
                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none text-slate-900"
                            />
                        </div>
                        {editType === 'customer' && (
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-1 block">ΑΦΜ</label>
                                <input 
                                    value={editData.vat_number || ''} 
                                    onChange={e => setEditData({...editData, vat_number: e.target.value})}
                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none text-slate-900"
                                />
                            </div>
                        )}
                        <div>
                            <label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-1 block">Σημειωσεις</label>
                            <textarea 
                                value={editData.notes || ''} 
                                onChange={e => setEditData({...editData, notes: e.target.value})}
                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none text-slate-900 h-24 resize-none"
                            />
                        </div>
                    </div>
                    
                    <div className="flex gap-3">
                        {editData.id && (
                            <button onClick={handleDelete} className="p-4 bg-red-50 text-red-600 rounded-xl font-bold border border-red-100 flex-1 flex items-center justify-center gap-2">
                                <Trash2 size={20}/> Διαγραφή
                            </button>
                        )}
                        <button onClick={handleSave} className="p-4 bg-slate-900 text-white rounded-xl font-bold shadow-lg flex-[2] flex items-center justify-center gap-2">
                            <Save size={20}/> Αποθήκευση
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="p-4 h-full flex flex-col">
            <div className="flex justify-between items-center mb-4">
                <h1 className="text-2xl font-black text-slate-900">Επαφές</h1>
                <button onClick={handleCreate} className="bg-slate-900 text-white p-2 rounded-xl shadow-md active:scale-95">
                    <Plus size={24}/>
                </button>
            </div>

            {/* Tabs */}
            <div className="flex p-1 bg-slate-100 rounded-xl mb-4 shrink-0">
                <button 
                    onClick={() => setTab('customers')}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${tab === 'customers' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
                >
                    Πελάτες
                </button>
                <button 
                    onClick={() => setTab('suppliers')}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${tab === 'suppliers' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
                >
                    Προμηθευτές
                </button>
            </div>

            {/* Search */}
            <div className="relative mb-4 shrink-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                    type="text" 
                    placeholder="Αναζήτηση..." 
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-10 p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 shadow-sm font-medium"
                />
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pb-24 custom-scrollbar">
                {filteredList.map((item: any) => (
                    <div 
                        key={item.id} 
                        onClick={() => handleEdit(item)}
                        className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm active:scale-95 transition-transform cursor-pointer"
                    >
                        <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold border ${tab === 'customers' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-purple-50 text-purple-600 border-purple-100'}`}>
                                    {tab === 'customers' ? <User size={20}/> : <Globe size={20}/>}
                                </div>
                                <div>
                                    <div className="font-bold text-slate-800 text-sm">{item.full_name || item.name}</div>
                                    {item.address && <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5"><MapPin size={10}/> {item.address}</div>}
                                    {tab === 'suppliers' && item.contact_person && <div className="text-[10px] text-slate-500 font-medium">{item.contact_person}</div>}
                                </div>
                            </div>
                            <Edit size={16} className="text-slate-300"/>
                        </div>
                        
                        <div className="flex gap-2">
                            {item.phone && (
                                <a 
                                    href={`tel:${item.phone}`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="flex-1 bg-slate-50 text-slate-700 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 border border-slate-100 active:scale-95 transition-transform"
                                >
                                    <Phone size={14} className="fill-current"/> Κλήση
                                </a>
                            )}
                            {item.email && (
                                <a 
                                    href={`mailto:${item.email}`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="flex-1 bg-blue-50 text-blue-700 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 border border-blue-100 active:scale-95 transition-transform"
                                >
                                    <Mail size={14}/> Email
                                </a>
                            )}
                        </div>
                    </div>
                ))}
                
                {filteredList.length === 0 && (
                    <div className="text-center py-10 text-slate-400 text-sm font-medium">
                        Δεν βρέθηκαν αποτελέσματα.
                    </div>
                )}
            </div>
        </div>
    );
}
