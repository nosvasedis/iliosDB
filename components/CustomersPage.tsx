
import React, { useState, useMemo, useRef } from 'react';
import { Customer, Order, OrderStatus, VatRegime } from '../types';
import { Users, Plus, Search, Phone, Mail, MapPin, FileText, Save, Loader2, ArrowRight, User, TrendingUp, ShoppingBag, Calendar, PieChart, Briefcase, Trash2, Printer, Trophy, Globe, Zap, Hash, Percent, X, Clock, Wallet, Calculator } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/supabase';
import { useUI } from './UIProvider';
import { formatCurrency } from '../utils/pricingEngine';
import SuppliersPage, { SuppliersPageHandle } from './SuppliersPage';

interface Props {
    onPrintOrder?: (order: Order) => void;
}

const STATUS_TRANSLATIONS: Record<OrderStatus, string> = {
    [OrderStatus.Pending]: 'Εκκρεμεί',
    [OrderStatus.InProduction]: 'Σε Παραγωγή',
    [OrderStatus.Ready]: 'Έτοιμο',
    [OrderStatus.Delivered]: 'Παραδόθηκε',
    [OrderStatus.Cancelled]: 'Ακυρώθηκε',
};

const getStatusColor = (status: OrderStatus) => {
    switch (status) {
        case OrderStatus.Pending: return 'bg-slate-100 text-slate-600 border-slate-200';
        case OrderStatus.InProduction: return 'bg-blue-50 text-blue-600 border-blue-200';
        case OrderStatus.Ready: return 'bg-emerald-50 text-emerald-600 border-emerald-200';
        case OrderStatus.Delivered: return 'bg-[#060b00] text-white border-[#060b00]';
        case OrderStatus.Cancelled: return 'bg-red-50 text-red-500 border-red-200';
    }
};

// --- CUSTOMER CARD COMPONENT ---
interface CustomerCardProps {
    customer: Customer;
    onClick: () => void;
    latestOrderDate?: string;
}

const CustomerCard: React.FC<CustomerCardProps> = ({ customer, onClick, latestOrderDate }) => {
    return (
        <div
            onClick={onClick}
            className="group bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:border-blue-200 transition-all cursor-pointer relative overflow-hidden flex flex-col h-full"
        >
            <div className="flex items-start justify-between mb-3">
                <div className="w-12 h-12 bg-slate-50 text-slate-500 rounded-xl flex items-center justify-center font-bold text-lg group-hover:bg-blue-600 group-hover:text-white transition-colors shadow-sm">
                    {customer.full_name.charAt(0).toUpperCase()}
                </div>
                {latestOrderDate && (
                    <div className="text-[9px] font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded-full flex items-center gap-1">
                        <Clock size={10} /> {new Date(latestOrderDate).toLocaleDateString('el-GR')}
                    </div>
                )}
            </div>

            <div className="mb-2">
                <h3 className="font-bold text-slate-800 text-base leading-tight line-clamp-1" title={customer.full_name}>
                    {customer.full_name}
                </h3>
                {customer.vat_number && (
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">ΑΦΜ: {customer.vat_number}</div>
                )}
            </div>

            <div className="mt-auto pt-3 border-t border-slate-50 space-y-1.5">
                {customer.phone ? (
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                        <Phone size={12} className="text-slate-400" /> {customer.phone}
                    </div>
                ) : <div className="h-4" />}
                {customer.address ? (
                    <div className="flex items-center gap-2 text-xs text-slate-600 truncate">
                        <MapPin size={12} className="text-slate-400 shrink-0" /> {customer.address}
                    </div>
                ) : <div className="h-4" />}
            </div>
        </div>
    );
};

// --- CUSTOMER MODAL COMPONENT ---
const CustomerDetailsModal = ({
    customer,
    orders,
    onClose,
    onUpdate,
    onDelete,
    onPrintOrder
}: {
    customer: Customer,
    orders: Order[],
    onClose: () => void,
    onUpdate: (c: Customer) => Promise<void>,
    onDelete: (id: string) => Promise<void>,
    onPrintOrder?: (o: Order) => void
}) => {
    // Start in editing mode if the customer name is empty (new creation)
    const [isEditing, setIsEditing] = useState(customer.full_name === '');
    const [editForm, setEditForm] = useState<Customer>(customer);
    const [isSaving, setIsSaving] = useState(false);
    const [isSearchingAfm, setIsSearchingAfm] = useState(false);
    const { showToast, confirm } = useUI();

    const [activeTab, setActiveTab] = useState<'info' | 'insights' | 'orders'>('info');

    // Stats Calculation
    const stats = useMemo(() => {
        const customerOrders = orders.filter(o => o.status !== OrderStatus.Cancelled && (o.customer_id === customer.id || o.customer_name === customer.full_name)).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        // Calculate Net Total Spent (Gross / (1 + VAT))
        const totalSpent = customerOrders.reduce((acc, o) => {
            const netValue = o.total_price / (1 + (o.vat_rate || 0.24));
            return acc + netValue;
        }, 0);

        const orderCount = customerOrders.length;
        const avgOrderValue = orderCount > 0 ? totalSpent / orderCount : 0;

        // Category Stats for Preferences
        const catStats: Record<string, { count: number; value: number }> = {};
        let totalItems = 0;

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

        const prefData = Object.entries(catStats)
            .map(([name, s]) => ({
                name,
                count: s.count,
                value: s.value,
                percentage: totalItems > 0 ? (s.count / totalItems) * 100 : 0
            }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        const latestOrder = customerOrders[0];
        // Calculate months since last order
        let statusMarker = 'Ενεργός';
        let statusColor = 'bg-emerald-100 text-emerald-700 border-emerald-200';
        if (latestOrder) {
            const monthsSince = (new Date().getTime() - new Date(latestOrder.created_at).getTime()) / (1000 * 60 * 60 * 24 * 30);
            if (monthsSince > 6) {
                statusMarker = 'Ανενεργός';
                statusColor = 'bg-red-100 text-red-700 border-red-200';
            } else if (monthsSince > 3) {
                statusMarker = 'Σε κίνδυνο';
                statusColor = 'bg-amber-100 text-amber-700 border-amber-200';
            }
        } else {
            statusMarker = 'Νέος';
            statusColor = 'bg-blue-100 text-blue-700 border-blue-200';
        }

        return { totalSpent, orderCount, avgOrderValue, history: customerOrders, prefData, totalItems, latestOrder, statusMarker, statusColor };
    }, [customer, orders]);

    const handleSave = async () => {
        if (!editForm.full_name.trim()) {
            showToast("Το ονοματεπώνυμο είναι υποχρεωτικό.", "error");
            return;
        }
        setIsSaving(true);
        try {
            await onUpdate(editForm);
            setIsEditing(false);
            showToast("Αποθηκεύτηκε με επιτυχία.", "success");
        } catch (e) {
            console.error("Save error:", e);
        } finally {
            setIsSaving(false);
        }
    };

    const handleAfmLookup = async () => {
        if (!editForm.vat_number || editForm.vat_number.length < 9) {
            showToast("Μη έγκυρο ΑΦΜ.", "error");
            return;
        }
        setIsSearchingAfm(true);
        try {
            const result = await api.lookupAfm(editForm.vat_number);
            if (result) {
                setEditForm(prev => ({ ...prev, full_name: result.name, address: result.address }));
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

    return (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 md:p-6 lg:p-10 animate-in fade-in">
            <div className="bg-white w-full max-w-6xl h-full max-h-[90vh] rounded-[2rem] shadow-2xl overflow-hidden border border-slate-100 flex flex-col animate-in zoom-in-95">

                {/* Modal Header */}
                <div className="p-6 md:p-8 md:pr-24 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-100 bg-slate-50 relative shrink-0">
                    <button onClick={onClose} className="absolute top-6 right-6 p-2 bg-white text-slate-400 hover:text-slate-700 rounded-full shadow-sm border border-slate-100 hover:bg-slate-50 transition-all z-10"><X size={20} /></button>

                    <div className="flex items-center gap-5 w-full md:w-auto overflow-hidden">
                        <div className={`shrink-0 w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-sm border text-2xl font-black ${stats.totalSpent > 1000 ? 'border-amber-200 text-amber-500' : 'border-blue-100 text-blue-600'}`}>
                            {customer.full_name ? customer.full_name.charAt(0).toUpperCase() : '+'}
                        </div>
                        <div className="min-w-0 flex-1">
                            {isEditing ? (
                                <input
                                    className="text-2xl font-black text-slate-800 bg-white border border-blue-300 rounded-lg p-1 px-3 outline-none focus:ring-4 focus:ring-blue-500/20 mb-1 w-full max-w-sm"
                                    value={editForm.full_name}
                                    onChange={e => setEditForm({ ...editForm, full_name: e.target.value })}
                                    placeholder="Ονοματεπώνυμο..."
                                    autoFocus
                                />
                            ) : (
                                <div className="flex items-center gap-3 flex-wrap">
                                    <h2 className="text-3xl font-black text-slate-800 tracking-tight leading-none mb-1 truncate">{customer.full_name}</h2>
                                    {stats.totalSpent > 1000 && (
                                        <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest bg-amber-100 text-amber-700 border border-amber-200 px-2 py-1 rounded-full shadow-sm">
                                            <Trophy size={10} /> VIP
                                        </span>
                                    )}
                                    {customer.id && (
                                        <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-full border ${stats.statusColor}`}>
                                            {stats.statusMarker}
                                        </span>
                                    )}
                                </div>
                            )}

                            <div className="flex flex-wrap items-center gap-3 text-sm font-medium text-slate-500 mt-2">
                                {isEditing ? (
                                    <input
                                        className="bg-white border border-slate-300 rounded-lg px-3 py-1 text-sm font-mono w-40 outline-none focus:border-blue-500"
                                        value={editForm.vat_number || ''}
                                        onChange={e => setEditForm({ ...editForm, vat_number: e.target.value })}
                                        placeholder="ΑΦΜ"
                                    />
                                ) : (
                                    <span className="font-mono bg-white border border-slate-200 shadow-sm px-2 py-0.5 rounded-lg text-xs font-bold text-slate-700">ΑΦΜ: {customer.vat_number || '-'}</span>
                                )}
                                <span className="flex items-center gap-1.5"><MapPin size={14} /> {isEditing ? <input className="bg-white border border-slate-300 rounded-lg px-3 py-1 text-sm w-48 outline-none focus:border-blue-500" value={editForm.address || ''} onChange={e => setEditForm({ ...editForm, address: e.target.value })} placeholder="Διεύθυνση" /> : (customer.address || 'Χωρίς διεύθυνση')}</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 w-full md:w-auto justify-end">
                        {isEditing ? (
                            <>
                                <button onClick={() => { if (!customer.id) onClose(); else { setEditForm(customer); setIsEditing(false); } }} className="px-5 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-50 transition-colors shadow-sm text-sm">Άκυρο</button>
                                <button onClick={handleSave} disabled={isSaving} className="px-5 py-2.5 bg-blue-600 text-white rounded-xl shadow-lg hover:bg-blue-700 font-bold transition-all flex items-center gap-2 text-sm">
                                    {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Αποθήκευση
                                </button>
                            </>
                        ) : (
                            <>
                                <button onClick={() => setIsEditing(true)} className="px-5 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm text-sm">Επεξεργασία</button>
                                <button onClick={() => onDelete(customer.id)} className="p-2.5 text-slate-400 hover:text-red-600 bg-white border border-slate-200 rounded-xl hover:bg-red-50 hover:border-red-100 transition-colors shadow-sm"><Trash2 size={18} /></button>
                            </>
                        )}
                    </div>
                </div>

                {/* Tabs (Hidden during creation of a new customer) */}
                {customer.id && (
                    <div className="flex border-b border-slate-100 px-4 md:px-8 gap-4 md:gap-8 shrink-0 bg-white overflow-x-auto custom-scrollbar">
                        {[
                            { id: 'info', label: 'Πληροφορίες' },
                            { id: 'insights', label: 'Ανάλυση & Στατιστικά' },
                            { id: 'orders', label: `Παραγγελίες (${stats.orderCount})` }
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as 'info' | 'insights' | 'orders')}
                                className={`py-4 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${activeTab === tab.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                )}

                {/* Modal Content Area */}
                <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-slate-50/50 custom-scrollbar relative">
                    {(!customer.id || activeTab === 'info') && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-4xl mx-auto md:mx-0">
                            {/* Communication Details */}
                            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-4">
                                <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2 mb-4"><Phone size={16} className="text-blue-500" /> Στοιχεία Επικοινωνίας</h3>
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1 block">Τηλέφωνο</label>
                                            {isEditing ? <input className="w-full p-3 border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 rounded-xl outline-none transition-all text-sm font-medium" value={editForm.phone || ''} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} placeholder="Προσθήκη Τηλεφώνου..." /> : <div className="font-bold text-slate-700 text-sm">{customer.phone || '-'}</div>}
                                        </div>
                                        <div>
                                            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1 block">Email</label>
                                            {isEditing ? <input className="w-full p-3 border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 rounded-xl outline-none transition-all text-sm font-medium" value={editForm.email || ''} onChange={e => setEditForm({ ...editForm, email: e.target.value })} placeholder="Προσθήκη Email..." /> : <div className="font-bold text-slate-700 text-sm">{customer.email || '-'}</div>}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Invoicing Details */}
                            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-4 h-fit">
                                <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2 mb-4"><FileText size={16} className="text-blue-500" /> Στοιχεία Τιμολόγησης</h3>
                                <div className="space-y-4">
                                    {isEditing && (
                                        <div>
                                            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1 block">Αυτόματη συμπλήρωση μέσω ΑΦΜ</label>
                                            <div className="flex gap-2">
                                                <input className="w-full p-3 border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 rounded-xl outline-none transition-all text-sm font-medium font-mono" placeholder="Καταχωρήστε ΑΦΜ..." value={editForm.vat_number || ''} onChange={e => setEditForm({ ...editForm, vat_number: e.target.value })} />
                                                <button onClick={handleAfmLookup} disabled={isSearchingAfm} className="px-4 py-3 bg-slate-800 hover:bg-black text-white rounded-xl shadow-md transition-all shrink-0">
                                                    {isSearchingAfm ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                    <div>
                                        <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1 block">Καθεστώς ΦΠΑ</label>
                                        {isEditing ? (
                                            <select className="w-full p-3 border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 rounded-xl outline-none transition-all text-sm font-bold text-slate-700" value={editForm.vat_rate} onChange={e => setEditForm({ ...editForm, vat_rate: parseFloat(e.target.value) })}>
                                                <option value={VatRegime.Standard}>24% (Κανονικό)</option>
                                                <option value={VatRegime.Reduced}>17% (Μειωμένο)</option>
                                                <option value={VatRegime.Zero}>0% (Μηδενικό)</option>
                                            </select>
                                        ) : (
                                            <div className="font-bold text-blue-600 text-sm bg-blue-50 px-3 py-1.5 rounded-lg inline-block">{((customer.vat_rate || 0.24) * 100).toFixed(0)}% ΦΠΑ</div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Notes */}
                            <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                                <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2 mb-4"><FileText size={16} className="text-blue-500" /> Σημειώσεις</h3>
                                {isEditing ? (
                                    <textarea className="w-full p-4 border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 rounded-xl outline-none transition-all text-sm font-medium h-32 resize-none" placeholder="Εσωτερικές σημειώσεις για τον πελάτη..." value={editForm.notes || ''} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} />
                                ) : (
                                    <p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-100 font-medium min-h-[100px]">{customer.notes || 'Καμία σημείωση.'}</p>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'insights' && customer.id && (
                        <div className="max-w-5xl space-y-6">
                            {/* Key Metrics */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-center relative overflow-hidden h-32 group hover:border-emerald-200 transition-colors">
                                    <div className="absolute -right-4 -bottom-4 p-3 opacity-[0.03] text-emerald-600 group-hover:scale-110 transition-transform duration-500"><TrendingUp size={100} /></div>
                                    <div className="text-[10px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-1.5 mb-2"><Wallet size={12} /> Συνολικός Τζίρος (Καθαρός)</div>
                                    <div className="text-3xl font-black text-slate-800">{formatCurrency(stats.totalSpent)}</div>
                                </div>
                                <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-center relative overflow-hidden h-32 group hover:border-blue-200 transition-colors">
                                    <div className="absolute -right-4 -bottom-4 p-3 opacity-[0.03] text-blue-600 group-hover:scale-110 transition-transform duration-500"><ShoppingBag size={100} /></div>
                                    <div className="text-[10px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-1.5 mb-2"><Briefcase size={12} /> Παραγγελίες</div>
                                    <div className="text-3xl font-black text-slate-800">{stats.orderCount} <span className="text-sm font-medium text-slate-400">τεμ.</span></div>
                                </div>
                                <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-center relative overflow-hidden h-32 group hover:border-amber-200 transition-colors">
                                    <div className="absolute -right-4 -bottom-4 p-3 opacity-[0.03] text-amber-600 group-hover:scale-110 transition-transform duration-500"><Calculator size={100} /></div>
                                    <div className="text-[10px] font-black text-amber-600 uppercase tracking-widest flex items-center gap-1.5 mb-2"><PieChart size={12} /> Μέση Αξία Παραγγελίας</div>
                                    <div className="text-3xl font-black text-slate-800">{formatCurrency(stats.avgOrderValue)}</div>
                                </div>
                            </div>

                            {/* Preferences */}
                            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                                <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2 mb-6"><Trophy size={16} className="text-amber-500" /> Αγαπημένες Κατηγορίες (Top Preferences)</h3>
                                <div className="space-y-4">
                                    {stats.prefData.length > 0 ? stats.prefData.map((item, index) => (
                                        <div key={item.name} className="flex items-center gap-4 group">
                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm shadow-sm shrink-0 border border-slate-100 ${index === 0 ? 'bg-amber-50 text-amber-600 border-amber-200' : (index === 1 ? 'bg-slate-50 text-slate-600' : (index === 2 ? 'bg-orange-50 text-orange-600' : 'bg-white text-slate-400'))}`}>
                                                {index + 1}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex justify-between items-end mb-1.5">
                                                    <span className="font-bold text-slate-700">{item.name}</span>
                                                    <div className="text-right flex flex-col items-end">
                                                        <span className="font-mono font-black text-slate-800 text-sm">{formatCurrency(item.value)}</span>
                                                        <span className="text-[10px] font-bold text-slate-500">{item.count} τεμάχια</span>
                                                    </div>
                                                </div>
                                                <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                                                    <div className="h-full rounded-full bg-gradient-to-r from-blue-400 to-indigo-500 transition-all duration-1000 ease-out" style={{ width: `${item.percentage}%` }}></div>
                                                </div>
                                            </div>
                                        </div>
                                    )) : (
                                        <div className="flex flex-col items-center justify-center text-slate-400 py-10">
                                            <PieChart size={48} className="opacity-20 mb-3" />
                                            <p className="font-medium">Δεν υπάρχουν δεδομένα αγορών.</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'orders' && customer.id && (
                        <div className="max-w-5xl space-y-4">
                            {stats.history.map(o => {
                                const netValue = o.total_price / (1 + (o.vat_rate || 0.24));
                                return (
                                    <div key={o.id} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col sm:flex-row justify-between sm:items-center gap-4 group hover:border-blue-200 transition-all">
                                        <div className="flex items-center gap-5">
                                            <div className={`w-14 h-14 rounded-xl flex items-center justify-center shadow-sm shrink-0 border ${getStatusColor(o.status)}`}>
                                                {o.status === OrderStatus.Delivered ? <Wallet size={24} /> : <Calendar size={24} />}
                                            </div>
                                            <div>
                                                <div className="font-black text-slate-800 text-lg flex items-center gap-2">
                                                    <span className="font-mono bg-slate-100 px-2 py-0.5 rounded-lg text-sm text-slate-600 shadow-inner">#{o.id.slice(0, 6).toUpperCase()}</span>
                                                    <span className={`text-[10px] font-black px-2 py-0.5 rounded border uppercase tracking-wider ${getStatusColor(o.status)}`}>
                                                        {STATUS_TRANSLATIONS[o.status]}
                                                    </span>
                                                </div>
                                                <div className="text-xs text-slate-500 font-bold mt-1.5 flex items-center gap-3">
                                                    <span className="flex items-center gap-1 text-slate-600"><Calendar size={12} /> {new Date(o.created_at).toLocaleDateString('el-GR')}</span>
                                                    <span className="flex items-center gap-1 text-slate-600"><ShoppingBag size={12} /> {o.items.length} είδη</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4 mt-2 sm:mt-0 justify-end w-full sm:w-auto">
                                            <div className="text-right px-4 border-r border-slate-200">
                                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-tight">Καθαρή Αξία</div>
                                                <div className="font-black text-lg text-slate-800">{formatCurrency(netValue)}</div>
                                            </div>
                                            {onPrintOrder && (
                                                <button onClick={() => onPrintOrder(o)} className="p-3 text-slate-400 hover:text-slate-800 bg-slate-50 hover:bg-slate-200 rounded-xl transition-colors shrink-0 shadow-sm">
                                                    <Printer size={18} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                            {stats.history.length === 0 && (
                                <div className="text-center text-slate-400 font-medium py-16">
                                    <Calendar size={48} className="mx-auto mb-4 opacity-20" />
                                    Δεν υπάρχουν παραγγελίες.
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default function CustomersPage({ onPrintOrder }: Props) {
    const queryClient = useQueryClient();
    const { showToast, confirm } = useUI();
    const [activeTab, setActiveTab] = useState<'customers' | 'suppliers'>('customers');
    const { data: customers } = useQuery({ queryKey: ['customers'], queryFn: api.getCustomers });
    const { data: orders } = useQuery({ queryKey: ['orders'], queryFn: api.getOrders });

    // UI State
    const [searchTerm, setSearchTerm] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const suppliersRef = useRef<SuppliersPageHandle>(null);

    // Filter Logic
    const filteredCustomers = useMemo(() => {
        if (!customers) return [];
        return customers.filter(c =>
            c.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (c.phone && c.phone.includes(searchTerm))
        ).sort((a, b) => a.full_name.localeCompare(b.full_name, 'el', { sensitivity: 'base' }));
    }, [customers, searchTerm]);

    // Map latest order dates for quick view
    const latestOrdersMap = useMemo(() => {
        if (!orders) return {};
        const map: Record<string, string> = {};
        orders.forEach(o => {
            const cid = o.customer_id;
            if (cid) {
                if (!map[cid] || new Date(o.created_at) > new Date(map[cid])) {
                    map[cid] = o.created_at;
                }
            }
        });
        return map;
    }, [orders]);

    const handleCreateCustomer = async (c: Customer) => {
        try {
            await api.saveCustomer(c);
            queryClient.invalidateQueries({ queryKey: ['customers'] });
            setIsCreating(false);
            setSelectedCustomer(null);
            showToast("Ο πελάτης δημιουργήθηκε επιτυχώς.", "success");
        } catch (e) {
            showToast("Σφάλμα δημιουργίας.", "error");
            throw e;
        }
    };

    const handleUpdateCustomer = async (c: Customer) => {
        try {
            await api.updateCustomer(c.id, c);
            queryClient.invalidateQueries({ queryKey: ['customers'] });
            setSelectedCustomer(c); // Update local view
            showToast("Τα στοιχεία ενημερώθηκαν.", "success");
        } catch (e) {
            showToast("Σφάλμα ενημέρωσης.", "error");
            throw e;
        }
    };

    const handleDeleteCustomer = async (id: string) => {
        const yes = await confirm({ title: 'Διαγραφή', message: 'Θέλετε να διαγράψετε οριστικά αυτόν τον πελάτη;', isDestructive: true });
        if (yes) {
            try {
                await api.deleteCustomer(id);
                queryClient.invalidateQueries({ queryKey: ['customers'] });
                setSelectedCustomer(null);
                showToast("Διαγράφηκε.", "success");
            } catch (e) {
                showToast("Σφάλμα διαγραφής.", "error");
            }
        }
    };

    return (
        <div className="h-[calc(100vh-100px)] flex flex-col gap-6">

            {/* Header Controls */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-white p-6 rounded-3xl shadow-sm border border-slate-100 shrink-0">
                <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-2xl shadow-sm transition-colors ${activeTab === 'customers' ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600'}`}>
                        {activeTab === 'customers' ? <Users size={28} /> : <Globe size={28} />}
                    </div>
                    <div>
                        <h1 className="text-3xl font-black text-slate-800 tracking-tight">
                            {activeTab === 'customers' ? 'Πελάτες' : 'Προμηθευτές'}
                        </h1>
                        <p className="text-slate-500 text-sm font-medium">
                            {activeTab === 'customers' ? 'Διαχείριση πελατολογίου και ιστορικού.' : 'Διαχείριση προμηθευτών και υλικών.'}
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 w-full md:w-auto">
                    <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200/50">
                        <button
                            onClick={() => { setActiveTab('customers'); setSearchTerm(''); }}
                            className={`px-6 py-2 rounded-xl font-bold text-sm transition-all flex items-center gap-2 ${activeTab === 'customers' ? 'bg-white text-blue-600 shadow-sm border border-slate-100' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <User size={16} /> Πελάτες
                        </button>
                        <button
                            onClick={() => { setActiveTab('suppliers'); setSearchTerm(''); }}
                            className={`px-6 py-2 rounded-xl font-bold text-sm transition-all flex items-center gap-2 ${activeTab === 'suppliers' ? 'bg-white text-purple-600 shadow-sm border border-slate-100' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <Globe size={16} /> Προμηθευτές
                        </button>
                    </div>

                    <div className="relative group flex-1 md:flex-none">
                        <input
                            type="text"
                            placeholder={activeTab === 'customers' ? "Αναζήτηση πελάτη..." : "Αναζήτηση προμηθευτή..."}
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className={`pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-4 transition-all w-full md:w-64 shadow-inner font-bold text-sm ${activeTab === 'customers' ? 'focus:ring-blue-500/10 focus:border-blue-500' : 'focus:ring-purple-500/10 focus:border-purple-500'}`}
                        />
                        <Search className={`absolute left-3 top-1/2 -translate-y-1/2 transition-colors ${activeTab === 'customers' ? 'text-slate-400 group-focus-within:text-blue-500' : 'text-slate-400 group-focus-within:text-purple-500'}`} size={18} />
                    </div>

                    <button
                        onClick={() => {
                            if (activeTab === 'customers') {
                                setSelectedCustomer({
                                    id: crypto.randomUUID(),
                                    full_name: '',
                                    phone: '',
                                    vat_number: '',
                                    vat_rate: VatRegime.Standard,
                                    address: '',
                                    notes: '',
                                    created_at: new Date().toISOString()
                                });
                                setIsCreating(true);
                            } else {
                                suppliersRef.current?.openCreateModal();
                            }
                        }}
                        className={`p-3.5 rounded-xl text-white shadow-lg transition-all hover:-translate-y-0.5 active:scale-95 ${activeTab === 'customers' ? 'bg-[#060b00] hover:bg-black' : 'bg-purple-600 hover:bg-purple-700'}`}
                        title={activeTab === 'customers' ? "Νέος Πελάτης" : "Νέος Προμηθευτής"}
                    >
                        <Plus size={22} strokeWidth={3} />
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-2 pb-20">
                {activeTab === 'customers' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {filteredCustomers.map(c => (
                            <CustomerCard
                                key={c.id}
                                customer={c}
                                onClick={() => { setSelectedCustomer(c); setIsCreating(false); }}
                                latestOrderDate={latestOrdersMap[c.id]}
                            />
                        ))}
                        {filteredCustomers.length === 0 && <div className="col-span-full text-center py-20 text-slate-400 italic">Δεν βρέθηκαν πελάτες.</div>}
                    </div>
                ) : (
                    <SuppliersPage ref={suppliersRef} searchTerm={searchTerm} />
                )}
            </div>

            {/* View/Edit Modal */}
            {selectedCustomer && activeTab === 'customers' && !isCreating && orders && (
                <CustomerDetailsModal
                    customer={selectedCustomer}
                    orders={orders}
                    onClose={() => setSelectedCustomer(null)}
                    onUpdate={handleUpdateCustomer}
                    onDelete={handleDeleteCustomer}
                    onPrintOrder={onPrintOrder}
                />
            )}

            {/* Create Modal */}
            {isCreating && activeTab === 'customers' && selectedCustomer && (
                <CustomerDetailsModal
                    customer={selectedCustomer}
                    orders={[]}
                    onClose={() => { setIsCreating(false); setSelectedCustomer(null); }}
                    onUpdate={handleCreateCustomer}
                    onDelete={async () => { setIsCreating(false); setSelectedCustomer(null); }}
                    onPrintOrder={undefined}
                />
            )}
        </div>
    );
}
