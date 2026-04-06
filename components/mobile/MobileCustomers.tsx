
import React, { useState, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, RETAIL_CUSTOMER_ID, RETAIL_CUSTOMER_NAME } from '../../lib/supabase';
import { Search, Phone, Mail, User, MapPin, Globe, Plus, X, Save, Trash2, Edit, Hash, Zap, Loader2, Wallet, ShoppingBag, PieChart, Package, Calendar, Clock, Trophy, Users as UsersIcon, Users, ArrowLeft, Gift } from 'lucide-react';
import MobileScreenHeader from './MobileScreenHeader';
import { Customer, Supplier, SupplierOrder, VatRegime, OrderStatus } from '../../types';
import { useUI } from '../UIProvider';
import { formatCurrency } from '../../utils/pricingEngine';
import { normalizedIncludes } from '../../utils/greekSearch';
import { getNextNamedayForName } from '../../utils/namedays';
import { formatGreekDate } from '../../utils/deliveryLabels';
import MobileSupplierDetails from './MobileSupplierDetails';
import { extractRetailClientFromNotes } from '../../utils/retailNotes';
import { retailEndClientPillClass } from '../../utils/retailPresentation';
import { ordersRepository } from '../../features/orders';
import { useCustomers, useOrders } from '../../hooks/api/useOrders';
import { useSuppliers } from '../../hooks/api/useSuppliers';

interface Props {
    mode: 'customers' | 'suppliers';
    onPrintSupplierOrder?: (order: SupplierOrder) => void;
}

export default function MobileCustomers({ mode, onPrintSupplierOrder }: Props) {
    const { data: customers } = useCustomers();
    const { data: suppliers } = useSuppliers();
    const { data: orders } = useOrders();
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
    const [showRetailStats, setShowRetailStats] = useState(false);

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
                normalizedIncludes(c.full_name, search) ||
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

    const retailStats = useMemo(() => {
        if (!orders || !editData || editData.id !== RETAIL_CUSTOMER_ID) return null;
        const customerOrders = orders.filter(o => o.status !== OrderStatus.Cancelled && (o.customer_id === RETAIL_CUSTOMER_ID)).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        const totalSpent = customerOrders.reduce((acc, o) => acc + o.total_price / (1 + (o.vat_rate || 0.24)), 0);
        const orderCount = customerOrders.length;
        const avgOrderValue = orderCount > 0 ? totalSpent / orderCount : 0;
        let totalItems = 0;
        const catStats: Record<string, { count: number; value: number }> = {};
        customerOrders.forEach(o => {
            const discountFactor = 1 - ((o.discount_percent || 0) / 100);
            o.items.forEach(item => {
                const cat = item.product_details?.category || 'Άλλο';
                if (!catStats[cat]) catStats[cat] = { count: 0, value: 0 };
                catStats[cat].count += item.quantity;
                catStats[cat].value += (item.price_at_order * item.quantity * discountFactor);
                totalItems += item.quantity;
            });
        });
        const prefData = Object.entries(catStats).map(([name, s]) => ({ name, count: s.count, value: s.value, percentage: totalItems > 0 ? (s.count / totalItems) * 100 : 0 })).sort((a, b) => b.count - a.count).slice(0, 5);

        const latestOrder = customerOrders[0];
        const oldestOrder = customerOrders[customerOrders.length - 1];
        let activeMonths = 0;
        if (latestOrder && oldestOrder) {
            activeMonths = Math.max(1, Math.round((new Date(latestOrder.created_at).getTime() - new Date(oldestOrder.created_at).getTime()) / (1000 * 60 * 60 * 24 * 30)));
        }

        const clientMap: Record<string, { name: string; orderCount: number; totalRevenue: number }> = {};
        customerOrders.forEach(o => {
            const label = extractRetailClientFromNotes(o.notes).retailClientLabel || 'Χωρίς τελικό πελάτη';
            if (!clientMap[label]) clientMap[label] = { name: label, orderCount: 0, totalRevenue: 0 };
            clientMap[label].orderCount += 1;
            clientMap[label].totalRevenue += o.total_price / (1 + (o.vat_rate || 0.24));
        });
        const topClients = Object.values(clientMap).sort((a, b) => b.totalRevenue - a.totalRevenue).slice(0, 8);

        const recentOrders = customerOrders.slice(0, 5).map(o => ({
            order: o,
            retailClientLabel: extractRetailClientFromNotes(o.notes).retailClientLabel
        }));

        return { totalSpent, orderCount, avgOrderValue, totalItems, latestOrder, activeMonths, prefData, topClients, recentOrders };
    }, [orders, editData]);

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
            if (item.id === RETAIL_CUSTOMER_ID) {
                setShowRetailStats(true);
            } else {
                setIsEditing(true);
            }
        }
    };

    const handleSave = async () => {
        if (editType === 'customer' && !editData.full_name.trim()) { showToast('Το όνομα είναι υποχρεωτικό', 'error'); return; }
        if (editType === 'supplier' && !editData.name.trim()) { showToast('Η επωνυμία είναι υποχρεωτική', 'error'); return; }

        try {
            if (editType === 'customer') {
                // Determine if this is an update by checking the list
                const isExisting = customers?.some(c => c.id === editData.id);
                if (!isExisting && editData.full_name.trim() === RETAIL_CUSTOMER_NAME) {
                    showToast("Το όνομα 'Λιανική' είναι δεσμευμένο από το σύστημα.", "error");
                    return;
                }
                if (isExisting && editData.id === RETAIL_CUSTOMER_ID) {
                    showToast("Ο πελάτης Λιανική είναι μόνο για ανάγνωση.", "error");
                    return;
                }
                if (isExisting) await ordersRepository.updateCustomer(editData.id, editData);
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
                setEditData((prev: any) => ({
                    ...prev,
                    full_name: result.name || prev.full_name,
                    address: result.address || prev.address,
                    // Fill phone / email only if the field is currently empty
                    phone: (!prev.phone && result.phone) ? result.phone : prev.phone,
                    email: (!prev.email && result.email) ? result.email : prev.email,
                }));
                const filled = ['Επωνυμία', result.address ? 'Διεύθυνση' : null, result.phone ? 'Τηλέφωνο' : null, result.email ? 'Email' : null].filter(Boolean).join(', ');
                showToast(`Βρέθηκαν: ${filled}`, "success");
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
        return (
            <MobileSupplierDetails
                supplier={viewSupplier}
                onClose={() => setViewSupplier(null)}
                onEditSupplier={() => {
                    setEditData({ ...viewSupplier });
                    setEditType('supplier');
                    setIsEditing(true);
                    setViewSupplier(null);
                }}
                onPrintSupplierOrder={onPrintSupplierOrder}
            />
        );
    }

    const isRetailSystemCustomer = editType === 'customer' && editData?.id === RETAIL_CUSTOMER_ID;

    // When retail customer is clicked, show stats view instead of edit form
    if (showRetailStats && retailStats) {
        return (
            <div className="flex flex-col h-full bg-slate-50">
                <div className="p-4 bg-white border-b border-slate-100 flex justify-between items-center sticky top-0 z-10">
                    <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                        <ShoppingBag className="text-fuchsia-600" size={20} />
                        Επισκόπηση Λιανικής
                    </h2>
                    <button onClick={() => setShowRetailStats(false)} className="p-2 bg-slate-100 rounded-full text-slate-500"><X size={20} /></button>
                </div>

                <div className="p-4 flex-1 overflow-y-auto space-y-4 pb-24">
                    {/* KPI Cards */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                            <div className="text-[9px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-1 mb-1.5"><Wallet size={10} /> Τζίρος (Καθαρός)</div>
                            <div className="text-xl font-black text-slate-800">{formatCurrency(retailStats.totalSpent)}</div>
                        </div>
                        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                            <div className="text-[9px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-1 mb-1.5"><ShoppingBag size={10} /> Παραγγελίες</div>
                            <div className="text-xl font-black text-slate-800">{retailStats.orderCount} <span className="text-xs text-slate-400">τεμ.</span></div>
                        </div>
                        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                            <div className="text-[9px] font-black text-amber-600 uppercase tracking-widest flex items-center gap-1 mb-1.5"><PieChart size={10} /> Μ.Ο. Αξίας</div>
                            <div className="text-xl font-black text-slate-800">{formatCurrency(retailStats.avgOrderValue)}</div>
                        </div>
                        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                            <div className="text-[9px] font-black text-violet-600 uppercase tracking-widest flex items-center gap-1 mb-1.5"><Package size={10} /> Τεμάχια</div>
                            <div className="text-xl font-black text-slate-800">{retailStats.totalItems}</div>
                        </div>
                        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                            <div className="text-[9px] font-black text-rose-600 uppercase tracking-widest flex items-center gap-1 mb-1.5"><Calendar size={10} /> Τελευταία Παρ.</div>
                            <div className="text-lg font-black text-slate-800">{retailStats.latestOrder ? new Date(retailStats.latestOrder.created_at).toLocaleDateString('el-GR') : '-'}</div>
                        </div>
                        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                            <div className="text-[9px] font-black text-teal-600 uppercase tracking-widest flex items-center gap-1 mb-1.5"><Clock size={10} /> Ενεργοί Μήνες</div>
                            <div className="text-xl font-black text-slate-800">{retailStats.activeMonths} <span className="text-xs text-slate-400">μήνες</span></div>
                        </div>
                    </div>

                    {/* Top Categories */}
                    <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                        <h3 className="font-bold text-slate-800 text-xs flex items-center gap-2 mb-4"><Trophy size={14} className="text-amber-500" /> Κορυφαίες Κατηγορίες</h3>
                        {retailStats.prefData.length > 0 ? (
                            <div className="space-y-3">
                                {retailStats.prefData.map((item, i) => (
                                    <div key={item.name} className="flex items-center gap-3">
                                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-black text-[10px] shrink-0 border ${i === 0 ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-slate-50 text-slate-500 border-slate-100'}`}>{i + 1}</div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="font-bold text-slate-700 text-xs truncate">{item.name}</span>
                                                <span className="font-mono font-black text-slate-800 text-xs shrink-0 ml-2">{formatCurrency(item.value)}</span>
                                            </div>
                                            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                <div className="h-full rounded-full bg-gradient-to-r from-blue-400 to-indigo-500" style={{ width: `${item.percentage}%` }}></div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : <div className="text-xs text-slate-400 text-center py-4">Δεν υπάρχουν δεδομένα.</div>}
                    </div>

                    {/* Top Retail Clients */}
                    <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                        <h3 className="font-bold text-slate-800 text-xs flex items-center gap-2 mb-4"><UsersIcon size={14} className="text-indigo-500" /> Κορυφαίοι Τελικοί Πελάτες</h3>
                        {retailStats.topClients.length > 0 ? (
                            <div className="space-y-2.5">
                                {retailStats.topClients.map((client, i) => {
                                    const maxRev = retailStats.topClients[0]?.totalRevenue || 1;
                                    const isUnlabeled = client.name === 'Χωρίς τελικό πελάτη';
                                    return (
                                        <div key={client.name} className="flex items-center gap-3">
                                            <div className={`w-6 h-6 rounded-md flex items-center justify-center font-black text-[9px] shrink-0 border ${i === 0 ? 'bg-indigo-50 text-indigo-600 border-indigo-200' : 'bg-slate-50 text-slate-500 border-slate-100'}`}>{i + 1}</div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex justify-between items-center mb-0.5">
                                                    <span className={`font-bold text-xs truncate ${isUnlabeled ? 'text-slate-400 italic' : 'text-slate-700'}`}>{client.name}</span>
                                                    <div className="flex items-center gap-2 shrink-0 ml-2">
                                                        <span className="text-[9px] font-bold text-slate-400">{client.orderCount} παρ.</span>
                                                        <span className="font-mono font-black text-slate-800 text-xs">{formatCurrency(client.totalRevenue)}</span>
                                                    </div>
                                                </div>
                                                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                    <div className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-purple-500" style={{ width: `${(client.totalRevenue / maxRev) * 100}%` }}></div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : <div className="text-xs text-slate-400 text-center py-4">Δεν υπάρχουν δεδομένα.</div>}
                    </div>

                    {/* Recent Orders */}
                    <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                        <h3 className="font-bold text-slate-800 text-xs flex items-center gap-2 mb-3"><ShoppingBag size={14} className="text-blue-500" /> Πρόσφατες Παραγγελίες</h3>
                        {retailStats.recentOrders.length > 0 ? (
                            <div className="space-y-2">
                                {retailStats.recentOrders.map(({ order, retailClientLabel }) => {
                                    const netValue = order.total_price / (1 + (order.vat_rate || 0.24));
                                    const hasLabel = !!retailClientLabel;
                                    return (
                                        <div key={order.id} className="flex items-center justify-between gap-2 bg-slate-50 rounded-xl px-3 py-2 border border-slate-100">
                                            <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                                                <span className="font-mono font-bold text-slate-700 text-[10px] leading-tight break-all">{order.id}</span>
                                                <span className="text-[10px] text-slate-400">{new Date(order.created_at).toLocaleDateString('el-GR')}</span>
                                            </div>
                                            <span
                                                className={`max-w-[120px] truncate ${hasLabel ? retailEndClientPillClass : 'inline-flex items-center rounded-md border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 tracking-tight'}`}
                                                title={hasLabel ? 'Τελικός πελάτης (λιανική)' : undefined}
                                            >
                                                {hasLabel ? retailClientLabel : '-'}
                                            </span>
                                            <span className="font-mono font-black text-xs text-slate-800 shrink-0">{formatCurrency(netValue)}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : <div className="text-xs text-slate-400 text-center py-4">Δεν υπάρχουν παραγγελίες.</div>}
                    </div>
                </div>
            </div>
        );
    }

    if (isEditing) {
        return (
            <div className="flex flex-col h-full bg-slate-50">
                <div className="p-4 bg-white border-b border-slate-100 sticky top-0 z-10">
                    <div className="flex justify-between items-center">
                        <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                            <User className={editType === 'customer' ? 'text-emerald-600' : 'text-purple-600'} />
                            {editData.full_name || editData.name ? 'Επεξεργασία' : 'Νέα Εγγραφή'}
                        </h2>
                        <button onClick={() => setIsEditing(false)} className="p-2 bg-slate-100 rounded-full text-slate-500"><X size={20} /></button>
                    </div>
                    {editType === 'customer' && editData.full_name && editData.id !== RETAIL_CUSTOMER_ID && (() => {
                        const nextNameday = getNextNamedayForName(editData.full_name);
                        return nextNameday ? (
                            <div className="mt-2 inline-flex items-center gap-1.5 text-[10px] font-bold bg-sky-50 text-sky-700 border border-sky-200 px-2.5 py-1 rounded-full w-fit">
                                <Gift size={12} className="shrink-0" />
                                {nextNameday.is_today
                                    ? `Γιορτάζει σήμερα · ${nextNameday.label}`
                                    : nextNameday.days_until <= 7
                                        ? `Ονομαστική εορτή ${formatGreekDate(nextNameday.date)} (σε ${nextNameday.days_until} ημέρες)`
                                        : `${nextNameday.label} ${formatGreekDate(nextNameday.date)}`}
                            </div>
                        ) : null;
                    })()}
                </div>

                {isRetailSystemCustomer && (
                    <div className="px-4 pt-3">
                        <button
                            onClick={() => { setIsEditing(false); setShowRetailStats(true); }}
                            className="w-full bg-fuchsia-50 border border-fuchsia-200 text-fuchsia-800 text-xs rounded-2xl px-4 py-3 flex items-center justify-between active:scale-[0.98] transition-transform"
                        >
                            <div>
                                <div className="font-bold text-[11px] uppercase tracking-wider">Συστημικός πελάτης Λιανικής</div>
                                <p className="text-[10px] mt-0.5 text-fuchsia-600">Πατήστε για επισκόπηση στατιστικών</p>
                            </div>
                            <ShoppingBag size={18} className="text-fuchsia-500" />
                        </button>
                    </div>
                )}

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
                                        disabled={isRetailSystemCustomer}
                                        className="flex-1 p-3 bg-white border border-slate-200 rounded-xl outline-none text-slate-900 font-mono"
                                        placeholder="9 ψηφία..."
                                    />
                                    <button
                                        onClick={handleAfmLookup}
                                        disabled={isSearchingAfm || isRetailSystemCustomer}
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
                                disabled={isRetailSystemCustomer}
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
                                    disabled={isRetailSystemCustomer}
                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none text-slate-900"
                                    type="tel"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-1 block">Email</label>
                                <input
                                    value={editData.email || ''}
                                    onChange={e => setEditData({ ...editData, email: e.target.value })}
                                    disabled={isRetailSystemCustomer}
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
                                disabled={isRetailSystemCustomer}
                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none text-slate-900"
                            />
                        </div>
                        {editType === 'customer' && (
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-1 block">Καθεστώς ΦΠΑ</label>
                                <select
                                    value={editData.vat_rate !== undefined ? editData.vat_rate : VatRegime.Standard}
                                    onChange={e => setEditData({ ...editData, vat_rate: parseFloat(e.target.value) })}
                                    disabled={isRetailSystemCustomer}
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
                                disabled={isRetailSystemCustomer}
                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none text-slate-900 h-24 resize-none"
                                placeholder="Πρόσθετα σχόλια..."
                            />
                        </div>
                    </div>

                    <div className="flex gap-3">
                        <button
                            onClick={handleSave}
                            disabled={isRetailSystemCustomer}
                            className="p-4 bg-slate-900 text-white rounded-xl font-bold shadow-lg flex-1 flex items-center justify-center gap-2 hover:bg-black transition-all disabled:opacity-50"
                        >
                            <Save size={20} /> {isRetailSystemCustomer ? 'Συστημικός πελάτης - Μόνο Ανάγνωση' : 'Αποθήκευση'}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-full min-h-0 flex-col bg-slate-50">
            <MobileScreenHeader
                icon={mode === 'customers' ? Users : Globe}
                title={mode === 'customers' ? 'Πελάτες' : 'Προμηθευτές'}
                subtitle={mode === 'customers' ? 'Επαφές & στοιχεία τιμολόγησης' : 'Προμηθευτές & εντολές αγοράς'}
                iconClassName={mode === 'customers' ? 'text-cyan-600' : 'text-purple-600'}
                right={
                    <button
                        type="button"
                        onClick={handleCreate}
                        className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-white shadow-md transition-all active:scale-95 sm:px-4 sm:text-sm ${mode === 'customers' ? 'bg-[#060b00] hover:bg-black' : 'bg-purple-600 hover:bg-purple-700'}`}
                    >
                        <Plus size={18} /> <span className="hidden sm:inline">Νέα Εγγραφή</span>
                    </button>
                }
            />

            <div className="flex min-h-0 flex-1 flex-col px-4 pb-24 pt-3">
            {/* Search */}
            <div className="relative shrink-0">
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
            <div className="mt-4 grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto pr-1 custom-scrollbar auto-rows-min md:grid-cols-2 lg:grid-cols-3">
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
                                    <div className="flex items-center gap-2">
                                        <div className="font-bold text-slate-800 text-base">{item.full_name || item.name}</div>
                                        {mode === 'customers' && item.id === RETAIL_CUSTOMER_ID && (
                                            <span className="text-[9px] font-black px-2 py-0.5 rounded-full border border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700 uppercase">
                                                Σύστημα
                                            </span>
                                        )}
                                    </div>
                                    {mode === 'suppliers' && item.contact_person && <div className="text-xs text-slate-500 font-medium">{item.contact_person}</div>}
                                </div>
                            </div>
                            <button className="p-2 bg-slate-50 text-slate-400 rounded-lg group-hover:bg-slate-100 group-hover:text-blue-500 transition-colors">
                                <Edit size={16} />
                            </button>
                        </div>

                        <div className="space-y-2 pt-2 border-t border-slate-50">
                            {mode === 'customers' && item.id === RETAIL_CUSTOMER_ID ? (
                                <p className="text-[11px] text-slate-500 leading-relaxed">
                                    Συλλογικός λογαριασμός για πολλούς τελικούς πελάτες· δεν εμφανίζονται κοινό ΑΦΜ, τηλέφωνο ή διεύθυνση εδώ.
                                </p>
                            ) : (
                                <>
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
                                </>
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
        </div>
    );
}
