import { useRestartDraft } from '../../hooks/useRestartBlocker';
import { INTERNAL_CUSTOMER_ID } from '../../utils/retailConstants';

import React, { useState, useMemo, useDeferredValue } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/supabase';
import { Phone, Mail, MapPin, Globe, Plus, X, Save, Trash2, Edit, Users } from 'lucide-react';
import { useUI } from '../UIProvider';
import { normalizedIncludes } from '../../utils/greekSearch';
import { ordersRepository } from '../../features/orders';
import { useCustomers } from '../../hooks/api/useOrders';
import { useSuppliers } from '../../hooks/api/useSuppliers';
import { formatNumber } from '../../utils/numberFormat';
import { HeaderPrimaryButton } from '../DesktopPageHeader';
import PageHeader, { SearchField } from '../shell/PageHeader';
import { useViewport } from '../shell/viewport';
import { useIncrementalList } from '../shell/useIncrementalList';

const nameCollator = new Intl.Collator('el', { sensitivity: 'base' });
const initialsOf = (name: string) =>
    name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase() || '?';

export default function EmployeeCustomers() {
    const { data: customers } = useCustomers();
    const { data: suppliers } = useSuppliers();
    const queryClient = useQueryClient();
    const { showToast, confirm } = useUI();
    
    const [tab, setTab] = useState<'customers' | 'suppliers'>('customers');
    const [search, setSearch] = useState('');
    const deferredSearch = useDeferredValue(search);
    const { isDesktop } = useViewport();
    
    // Edit/Create State
    const [isEditing, setIsEditing] = useState(false);
    const [editType, setEditType] = useState<'customer' | 'supplier'>('customer');
    const [editData, setEditData] = useState<any>(null); // Polymorphic object
    useRestartDraft('Στοιχεία επαφής', editData, { enabled: isEditing, identity: editData?.id });

    const customerCount = useMemo(() => (customers || []).filter((c) => c.id !== INTERNAL_CUSTOMER_ID).length, [customers]);

    const filteredList = useMemo(() => {
        const q = deferredSearch.trim();
        if (tab === 'customers') {
            if (!customers) return [];
            return customers.filter(c => c.id !== INTERNAL_CUSTOMER_ID).filter(c =>
                !q || normalizedIncludes(c.full_name, q) ||
                (c.phone && c.phone.includes(q))
            ).sort((a, b) => nameCollator.compare(a.full_name, b.full_name));
        } else {
            if (!suppliers) return [];
            const lower = q.toLowerCase();
            return suppliers.filter(s =>
                !lower || s.name.toLowerCase().includes(lower) ||
                s.contact_person?.toLowerCase().includes(lower)
            ).sort((a, b) => nameCollator.compare(a.name, b.name));
        }
    }, [customers, suppliers, tab, deferredSearch]);

    const { visible, hasMore, sentinelRef } = useIncrementalList<any>(filteredList, `${tab}|${deferredSearch}`);

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
                if (editData.id) await ordersRepository.updateCustomer(editData.id, editData);
                else await ordersRepository.saveCustomer(editData);
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
                if (editType === 'customer') await ordersRepository.deleteCustomer(editData.id);
                else await api.deleteSupplier(editData.id);
                
                queryClient.invalidateQueries({ queryKey: [editType === 'customer' ? 'customers' : 'suppliers'] });
                setIsEditing(false);
                showToast("Διαγράφηκε.", "success");
            } catch (e) {
                showToast("Σφάλμα διαγραφής.", "error");
            }
        }
    };

    const tabs = (
        <div className="inline-flex shrink-0 self-start rounded-xl border border-slate-200/60 bg-slate-100 p-0.5">
            {(['customers', 'suppliers'] as const).map((key) => (
                <button
                    key={key}
                    type="button"
                    onClick={() => setTab(key)}
                    className={`rounded-lg px-4 py-2 text-xs font-bold transition-colors ${tab === key ? 'bg-white text-[#060b00] shadow-sm ring-1 ring-slate-200/90' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    {key === 'customers' ? `Πελάτες · ${formatNumber(customerCount)}` : `Προμηθευτές · ${formatNumber(suppliers?.length || 0)}`}
                </button>
            ))}
        </div>
    );

    return (
        <div className="flex h-full min-h-0 flex-col bg-slate-50">
            <PageHeader
                icon={Users}
                title="Επαφές"
                subtitle={tab === 'customers' ? 'Πελάτες καταστήματος' : 'Προμηθευτές'}
                actions={isDesktop ? (
                    <HeaderPrimaryButton icon={Plus} onClick={handleCreate}>{tab === 'customers' ? 'Νέος πελάτης' : 'Νέος προμηθευτής'}</HeaderPrimaryButton>
                ) : (
                    <button type="button" onClick={handleCreate} className="flex h-10 items-center gap-1.5 rounded-xl bg-[#060b00] pl-2.5 pr-3.5 text-[13px] font-bold text-white active:scale-95">
                        <Plus size={17} className="text-amber-300" /> Νέα
                    </button>
                )}
                below={
                    <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
                        {tabs}
                        <SearchField value={search} onChange={setSearch} placeholder={tab === 'customers' ? 'Όνομα ή τηλέφωνο…' : 'Επωνυμία ή υπεύθυνος…'} />
                    </div>
                }
            />

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain custom-scrollbar">
                <div className="grid grid-cols-1 gap-2 p-2 min-[400px]:p-3 md:grid-cols-2 lg:gap-3 lg:px-0 lg:pt-4 2xl:grid-cols-3">
                    {visible.map((item: any) => {
                        const name: string = item.full_name || item.name || '';
                        return (
                            <div
                                key={item.id}
                                className="flex items-center gap-3 rounded-2xl border border-slate-200/70 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
                                style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 76px' }}
                            >
                                <button type="button" onClick={() => handleEdit(item)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                                    <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[13px] font-black ${tab === 'customers' ? 'bg-gradient-to-br from-[#1c2812] to-[#060b00] text-amber-300' : 'bg-violet-50 text-violet-700'}`}>
                                        {tab === 'customers' ? initialsOf(name) : <Globe size={18} />}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-[14px] font-bold text-slate-900">{name}</span>
                                        {item.contact_person && <span className="block truncate text-[11px] font-medium text-slate-500">{item.contact_person}</span>}
                                        {item.address && (
                                            <span className="flex min-w-0 items-center gap-1 text-[11px] text-slate-500"><MapPin size={11} className="shrink-0 text-slate-400" /><span className="truncate">{item.address}</span></span>
                                        )}
                                        {!item.address && item.phone && <span className="block truncate text-[11px] text-slate-500">{item.phone}</span>}
                                    </span>
                                </button>
                                <div className="flex shrink-0 gap-1.5">
                                    {item.phone && (
                                        <a href={`tel:${item.phone}`} aria-label={`Κλήση ${name}`} className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 active:scale-95">
                                            <Phone size={16} />
                                        </a>
                                    )}
                                    {item.email && (
                                        <a href={`mailto:${item.email}`} aria-label={`Email ${name}`} className="hidden h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600 active:scale-95 min-[400px]:flex">
                                            <Mail size={16} />
                                        </a>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
                {hasMore && <div ref={sentinelRef} className="h-10" />}
                {filteredList.length === 0 && (
                    <div className="flex flex-col items-center gap-3 py-16 text-slate-400">
                        <Users size={34} className="opacity-25" />
                        <p className="text-sm font-bold">Δεν βρέθηκαν αποτελέσματα.</p>
                    </div>
                )}
            </div>

            {/* Edit Modal */}
            {isEditing && (
                <div className="fixed inset-0 z-[80] flex items-end justify-center bg-[#060b00]/50 sm:items-center sm:p-4">
                    <div className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
                        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                                {editData.id ? <Edit size={20} className="text-blue-500"/> : <Plus size={20} className="text-emerald-500"/>}
                                {editData.id ? 'Επεξεργασία' : 'Νέα Εγγραφή'}
                            </h2>
                            <button onClick={() => setIsEditing(false)} className="p-2 bg-white rounded-full text-slate-500 hover:text-slate-800 shadow-sm transition-colors"><X size={20}/></button>
                        </div>
                        
                        <div className="p-6 overflow-y-auto space-y-4">
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-1 block">
                                    {editType === 'customer' ? 'Ονοματεπωνυμο / Επωνυμια *' : 'Επωνυμια *'}
                                </label>
                                <input 
                                    value={editType === 'customer' ? editData.full_name : editData.name} 
                                    onChange={e => setEditData({...editData, [editType === 'customer' ? 'full_name' : 'name']: e.target.value})}
                                    className="w-full p-3 text-[16px] sm:text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold text-slate-900 focus:ring-2 focus:ring-blue-500/20"
                                />
                            </div>
                            {editType === 'supplier' && (
                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-1 block">Υπευθυνος Επικοινωνιας</label>
                                    <input 
                                        value={editData.contact_person || ''} 
                                        onChange={e => setEditData({...editData, contact_person: e.target.value})}
                                        className="w-full p-3 text-[16px] sm:text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none text-slate-900"
                                    />
                                </div>
                            )}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-1 block">Τηλεφωνο</label>
                                    <input 
                                        value={editData.phone || ''} 
                                        onChange={e => setEditData({...editData, phone: e.target.value})}
                                        className="w-full p-3 text-[16px] sm:text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none text-slate-900"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-1 block">Ηλ. ταχυδρομείο</label>
                                    <input 
                                        value={editData.email || ''} 
                                        onChange={e => setEditData({...editData, email: e.target.value})}
                                        className="w-full p-3 text-[16px] sm:text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none text-slate-900"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-1 block">Διευθυνση</label>
                                <input 
                                    value={editData.address || ''} 
                                    onChange={e => setEditData({...editData, address: e.target.value})}
                                    className="w-full p-3 text-[16px] sm:text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none text-slate-900"
                                />
                            </div>
                            {editType === 'customer' && (
                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-1 block">ΑΦΜ</label>
                                    <input 
                                        value={editData.vat_number || ''} 
                                        onChange={e => setEditData({...editData, vat_number: e.target.value})}
                                        className="w-full p-3 text-[16px] sm:text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none text-slate-900"
                                    />
                                </div>
                            )}
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-1 block">Σημειωσεις</label>
                                <textarea 
                                    value={editData.notes || ''} 
                                    onChange={e => setEditData({...editData, notes: e.target.value})}
                                    className="w-full p-3 text-[16px] sm:text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none text-slate-900 h-24 resize-none"
                                />
                            </div>
                        </div>
                        
                        <div className="flex gap-3 border-t border-slate-100 bg-slate-50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                            {editData.id && (
                                <button onClick={handleDelete} className="h-12 bg-red-50 text-red-600 rounded-xl font-bold border border-red-100 flex-1 flex items-center justify-center gap-2 hover:bg-red-100 transition-colors">
                                    <Trash2 size={20}/> Διαγραφή
                                </button>
                            )}
                            <button onClick={handleSave} className="h-12 bg-slate-900 text-white rounded-xl font-bold shadow-lg flex-[2] flex items-center justify-center gap-2 hover:bg-black transition-colors">
                                <Save size={20}/> Αποθήκευση
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
