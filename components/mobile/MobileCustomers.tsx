
import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/supabase';
import { Search, Phone, Mail, User, MapPin, Globe, Plus, X, Save, Trash2, Edit, Hash, Zap, Loader2 } from 'lucide-react';
import { Customer, Supplier, VatRegime } from '../../types';
import { useUI } from '../UIProvider';
import { formatCurrency } from '../../utils/pricingEngine';
import MobileSupplierDetails from './MobileSupplierDetails';

interface Props {
    mode: 'customers' | 'suppliers';
}

export default function MobileCustomers({ mode }: Props) {
    const { data: customers } = useQuery({ queryKey: ['customers'], queryFn: api.getCustomers });
    const { data: suppliers } = useQuery({ queryKey: ['suppliers'], queryFn: api.getSuppliers });
    const { data: orders } = useQuery({ queryKey: ['orders'], queryFn: api.getOrders });
    const queryClient = useQueryClient();
    const { showToast, confirm } = useUI();

    // Internal search state still needed
    const [search, setSearch] = useState('');

    // Edit/Create State
    const [isEditing, setIsEditing] = useState(false);
    const [editType, setEditType] = useState<'customer' | 'supplier'>(mode === 'customers' ? 'customer' : 'supplier');
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
        if (mode === 'customers') {
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
    }, [customers, suppliers, mode, search]);

    const handleCreate = () => {
        setEditType(mode === 'customers' ? 'customer' : 'supplier');
        const newData = mode === 'customers' ? {
            id: crypto.randomUUID(),
            full_name: '',
            phone: '',
            email: '',
            address: '',
            vat_number: '',
            notes: '',
            vat_rate: VatRegime.Standard,
            created_at: new Date().toISOString()
        } : {
            id: crypto.randomUUID(),
            name: '',
            contact_person: '',
            phone: '',
            email: '',
            address: '',
            notes: ''
        };
        setEditData(newData);
        setIsEditing(true);
    };

    const handleItemClick = (item: any) => {
        if (mode === 'suppliers') {
            setViewSupplier(item);
        } else {
            setEditType('customer');
            setEditData({ ...item });
            setIsEditing(true);
        }
    };

    const handleSave = async () => {
        if (editType === 'customer' && !editData.full_name.trim()) { showToast('Το όνομα είναι υποχρεωτικό', 'error'); return; }
        if (editType === 'supplier' && !editData.name.trim()) { showToast('Η επωνυμία είναι υποχρεωτική', 'error'); return; }

        try {
            if (editType === 'customer') {
                // Determine if this is an update by checking the list
                const isExisting = customers?.some(c => c.id === editData.id);
                if (isExisting) await api.updateCustomer(editData.id, editData);
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
                setEditData((prev: any) => ({ ...prev, full_name: result.name, address: result.address }));
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
                        <User className={editType === 'customer' ? 'text-emerald-600' : 'text-purple-600'} />
                        {editData.full_name || editData.name ? 'Επεξεργασία' : 'Νέα Εγγραφή'}
                    </h2>
                    <button onClick={() => setIsEditing(false)} className="p-2 bg-slate-100 rounded-full text-slate-500"><X size={20} /></button>
                </div>

                <div className="p-4 flex-1 overflow-y-auto space-y-4">
                    <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-4 shadow-sm">
                        {editType === 'customer' && (
                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                <label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-1 block flex items-center gap-1">
                                    <Hash size={12} /> ΑΦΜ
                                </label>
                                <div className="flex gap-2">
                                    <input
                                        value={editData.vat_number || ''}
                                        onChange={e => setEditData({ ...editData, vat_number: e.target.value })}
                                        className="flex-1 p-3 bg-white border border-slate-200 rounded-xl outline-none text-slate-900 font-mono"
                                        placeholder="9 ψηφία..."
                                    />
                                    <button
                                        onClick={handleAfmLookup}
                                        disabled={isSearchingAfm}
                                        className="p-3 bg-blue-500 text-white rounded-xl shadow-md active:scale-95"
                                    >
                                        {isSearchingAfm ? <Loader2 size={18} className="animate-spin" /> : <Zap size={18} className="fill-current" />}
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
                                onChange={e => setEditData({ ...editData, [editType === 'customer' ? 'full_name' : 'name']: e.target.value })}
                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold text-slate-900 focus:ring-2 focus:ring-blue-500/20"
                                placeholder="Πληκτρολογήστε όνομα..."
                                autoFocus={!editData.full_name && !editData.name}
                            />
                        </div>
                        {editType === 'supplier' && (
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-1 block">Υπευθυνος Επικοινωνιας</label>
                                <input
                                    value={editData.contact_person || ''}
                                    onChange={e => setEditData({ ...editData, contact_person: e.target.value })}
                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none text-slate-900"
                                />
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-1 block">Τηλεφωνο</label>
                                <input
                                    value={editData.phone || ''}
                                    onChange={e => setEditData({ ...editData, phone: e.target.value })}
                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none text-slate-900"
                                    type="tel"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-1 block">Email</label>
                                <input
                                    value={editData.email || ''}
                                    onChange={e => setEditData({ ...editData, email: e.target.value })}
                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none text-slate-900"
                                    type="email"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-1 block">Διευθυνση</label>
                            <input
                                value={editData.address || ''}
                                onChange={e => setEditData({ ...editData, address: e.target.value })}
                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none text-slate-900"
                            />
                        </div>
                        {editType === 'customer' && (
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-1 block">Καθεστώς ΦΠΑ</label>
                                <select
                                    value={editData.vat_rate !== undefined ? editData.vat_rate : VatRegime.Standard}
                                    onChange={e => setEditData({ ...editData, vat_rate: parseFloat(e.target.value) })}
                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none text-slate-900 font-bold"
                                >
                                    <option value={VatRegime.Standard}>24% (Κανονικό)</option>
                                    <option value={VatRegime.Reduced}>17% (Μειωμένο)</option>
                                    <option value={VatRegime.Zero}>0% (Μηδενικό)</option>
                                </select>
                            </div>
                        )}
                        <div>
                            <label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-1 block">Σημειωσεις</label>
                            <textarea
                                value={editData.notes || ''}
                                onChange={e => setEditData({ ...editData, notes: e.target.value })}
                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none text-slate-900 h-24 resize-none"
                                placeholder="Πρόσθετα σχόλια..."
                            />
                        </div>
                    </div>

                    <div className="flex gap-3">
                        <button onClick={handleSave} className="p-4 bg-slate-900 text-white rounded-xl font-bold shadow-lg flex-1 flex items-center justify-center gap-2 hover:bg-black transition-all">
                            <Save size={20} /> Αποθήκευση
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="p-4 h-full flex flex-col">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
                    {mode === 'customers' ? <User className="text-blue-600" /> : <Globe className="text-purple-600" />}
                    {mode === 'customers' ? 'Πελάτες' : 'Προμηθευτές'}
                </h1>

                <div className="flex items-center gap-3 w-full md:w-auto">
                    <button onClick={handleCreate} className={`flex items-center gap-2 text-white px-4 py-2.5 rounded-xl font-black transition-all shadow-md active:scale-95 ${mode === 'customers' ? 'bg-[#060b00] hover:bg-black' : 'bg-purple-600 hover:bg-purple-700'}`}>
                        <Plus size={20} /> <span className="sm:inline">Νέα Εγγραφή</span>
                    </button>
                </div>
            </div>

            {/* Search */}
            <div className="relative shrink-0 mt-4">
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-24 mt-4 overflow-y-auto custom-scrollbar pr-1">
                {filteredList.map((item: any) => (
                    <div
                        key={item.id}
                        onClick={() => handleItemClick(item)}
                        className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md active:scale-[0.98] transition-all cursor-pointer group"
                    >
                        <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-3">
                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold border ${mode === 'customers' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-purple-50 text-purple-600 border-purple-100'}`}>
                                    {mode === 'customers' ? <User size={24} /> : <Globe size={24} />}
                                </div>
                                <div>
                                    <div className="font-bold text-slate-800 text-base">{item.full_name || item.name}</div>
                                    {mode === 'suppliers' && item.contact_person && <div className="text-xs text-slate-500 font-medium">{item.contact_person}</div>}
                                </div>
                            </div>
                            <button className="p-2 bg-slate-50 text-slate-400 rounded-lg group-hover:bg-slate-100 group-hover:text-blue-500 transition-colors">
                                <Edit size={16} />
                            </button>
                        </div>

                        <div className="space-y-2 pt-2 border-t border-slate-50">
                            {item.phone && (
                                <div className="flex items-center gap-2 text-xs text-slate-600">
                                    <Phone size={14} className="text-slate-400" /> {item.phone}
                                </div>
                            )}
                            {item.email && (
                                <div className="flex items-center gap-2 text-xs text-slate-600">
                                    <Mail size={14} className="text-slate-400" /> {item.email}
                                </div>
                            )}
                            {item.address && (
                                <div className="flex items-center gap-2 text-xs text-slate-600">
                                    <MapPin size={14} className="text-slate-400" /> {item.address}
                                </div>
                            )}
                        </div>
                    </div>
                ))}

                {filteredList.length === 0 && (
                    <div className="col-span-full text-center py-10 text-slate-400 text-sm font-medium">
                        Δεν βρέθηκαν αποτελέσματα.
                    </div>
                )}
            </div>
        </div>
    );
}
