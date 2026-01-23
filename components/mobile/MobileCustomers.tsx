
import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/supabase';
import { Search, Phone, Mail, User, MapPin, Globe, Plus, X, Save, Trash2, Edit, Hash, Zap, Loader2 } from 'lucide-react';
import { Customer, Supplier } from '../../types';
import { useUI } from '../UIProvider';
import { formatCurrency } from '../../utils/pricingEngine';
import MobileSupplierDetails from './MobileSupplierDetails';

export default function MobileCustomers() {
    const { data: customers } = useQuery({ queryKey: ['customers'], queryFn: api.getCustomers });
    const { data: suppliers } = useQuery({ queryKey: ['suppliers'], queryFn: api.getSuppliers });
    const { data: orders } = useQuery({ queryKey: ['orders'], queryFn: api.getOrders });
    const queryClient = useQueryClient();
    const { showToast, confirm } = useUI();
    
    const [tab, setTab] = useState<'customers' | 'suppliers'>('customers');
    const [search, setSearch] = useState('');
    
    // Edit/Create State
    const [isEditing, setIsEditing] = useState(false);
    const [editType, setEditType] = useState<'customer' | 'supplier'>('customer');
    const [editData, setEditData] = useState<any>(null); // Polymorphic object
    const [isSearchingAfm, setIsSearchingAfm] = useState(false);
    
    // Supplier Detail View
    const [viewSupplier, setViewSupplier] = useState<Supplier | null>(null);

    // Calculate customer stats (Total Spent Net, etc.)
    const customerStats = useMemo(() => {
        if (!orders) return {};
        const stats: Record<string, number> = {};
        orders.forEach(o => {
            // Net Value = Total / (1 + VAT)
            const netValue = o.total_price / (1 + (o.vat_rate || 0.24));
            const cid = o.customer_id;
            if (cid) {
                stats[cid] = (stats[cid] || 0) + netValue;
            }
        });
        return stats;
    }, [orders]);

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

    const handleItemClick = (item: any) => {
        if (tab === 'suppliers') {
            setViewSupplier(item);
        } else {
            setEditType('customer');
            setEditData({ ...item });
            setIsEditing(true);
        }
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

    const handleAfmLookup = async () => {
        const afm = editData.vat_number;
        if (!afm || afm.length < 9) {
            showToast("Μη έγκυρο ΑΦΜ.", "error");
            return;
        }
        setIsSearchingAfm(true);
        try {
            const result = await api.lookupAfm(afm);
            if (result) {
                setEditData(prev => ({ ...prev, full_name: result.name, address: result.address }));
                showToast("Τα στοιχεία βρέθηκαν!", "success");
            } else {
                showToast("Δεν βρέθηκαν στοιχεία.", "info");
            }
        } catch (e: any) {
            showToast(e.message || "Σφάλμα αναζήτησης.", "error");
        } finally {
            setIsSearchingAfm(false);
        }
    };
    
    // If viewing a supplier, render the detail component
    if (viewSupplier) {
        return <MobileSupplierDetails supplier={viewSupplier} onClose={() => setViewSupplier(null)} />;
    }

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
                        {editType === 'customer' && (
                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                <label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-1 block flex items-center gap-1">
                                    <Hash size={12}/> ΑΦΜ
                                </label>
                                <div className="flex gap-2">
                                    <input 
                                        value={editData.vat_number || ''} 
                                        onChange={e => setEditData({...editData, vat_number: e.target.value})}
                                        className="flex-1 p-3 bg-white border border-slate-200 rounded-xl outline-none text-slate-900 font-mono"
                                        placeholder="9 ψηφία..."
                                    />
                                    <button 
                                        onClick={handleAfmLookup}
                                        disabled={isSearchingAfm}
                                        className="p-3 bg-blue-500 text-white rounded-xl shadow-md active:scale-95"
                                    >
                                        {isSearchingAfm ? <Loader2 size={18} className="animate-spin"/> : <Zap size={18} className="fill-current"/>}
                                    </button>
                                </div>
                            </div>
                        )}

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
                    className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${tab === 'customers' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    Πελάτες
                </button>
                <button 
                    onClick={() => setTab('suppliers')}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${tab === 'suppliers' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
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

            {/* Content List */}
            <div className="flex-1 overflow-y-auto space-y-3 pb-24 custom-scrollbar">
                {filteredList.map((item: any) => {
                    const totalSpent = tab === 'customers' ? (customerStats[item.id] || 0) : 0;
                    return (
                        <div 
                            key={item.id} 
                            onClick={() => handleItemClick(item)}
                            className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm active:scale-[0.98] transition-all cursor-pointer group"
                        >
                            <div className="flex items-start justify-between mb-3">
                                <div className="flex items-center gap-3">
                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold border ${tab === 'customers' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-purple-50 text-purple-600 border-purple-100'}`}>
                                        {tab === 'customers' ? <User size={24}/> : <Globe size={24}/>}
                                    </div>
                                    <div>
                                        <div className="font-bold text-slate-800 text-base">{item.full_name || item.name}</div>
                                        {tab === 'suppliers' && item.contact_person && <div className="text-xs text-slate-500 font-medium">{item.contact_person}</div>}
                                    </div>
                                </div>
                                <button className="p-2 bg-slate-50 text-slate-400 rounded-lg group-hover:bg-slate-100 group-hover:text-blue-500 transition-colors">
                                    <Edit size={16}/>
                                </button>
                            </div>
                            
                            <div className="space-y-2 pt-2 border-t border-slate-50">
                                {item.phone && (
                                    <div className="flex items-center gap-2 text-xs text-slate-600">
                                        <Phone size={14} className="text-slate-400"/> {item.phone}
                                    </div>
                                )}
                                {item.email && (
                                    <div className="flex items-center gap-2 text-xs text-slate-600">
                                        <Mail size={14} className="text-slate-400"/> {item.email}
                                    </div>
                                )}
                                {item.address && (
                                    <div className="flex items-center gap-2 text-xs text-slate-600">
                                        <MapPin size={14} className="text-slate-400"/> {item.address}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
                
                {filteredList.length === 0 && (
                    <div className="text-center py-10 text-slate-400 text-sm font-medium">
                        Δεν βρέθηκαν αποτελέσματα.
                    </div>
                )}
            </div>
        </div>
    );
}
