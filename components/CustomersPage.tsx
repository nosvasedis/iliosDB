
import React, { useState, useMemo } from 'react';
import { Customer, Order, OrderStatus, VatRegime } from '../types';
import { Users, Plus, Search, Phone, Mail, MapPin, FileText, Save, Loader2, ArrowRight, User, TrendingUp, ShoppingBag, Calendar, PieChart, Briefcase, Trash2, Printer, Trophy, Globe, Zap, Hash, Percent, X, Clock, Wallet, Calculator } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/supabase';
import { useUI } from './UIProvider';
import { formatCurrency } from '../utils/pricingEngine';
import SuppliersPage from './SuppliersPage';

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
    switch(status) {
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
                        <Clock size={10}/> {new Date(latestOrderDate).toLocaleDateString('el-GR')}
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
                        <Phone size={12} className="text-slate-400"/> {customer.phone}
                    </div>
                ) : <div className="h-4"/>}
                {customer.address ? (
                     <div className="flex items-center gap-2 text-xs text-slate-600 truncate">
                        <MapPin size={12} className="text-slate-400 shrink-0"/> {customer.address}
                    </div>
                ) : <div className="h-4"/>}
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
    // If no ID, we are in CREATE mode. Force isEditing to true.
    const [isEditing, setIsEditing] = useState(!customer.id);
    const [editForm, setEditForm] = useState<Customer>(customer);
    const [isSaving, setIsSaving] = useState(false);
    const [isSearchingAfm, setIsSearchingAfm] = useState(false);
    const { showToast } = useUI();

    // Stats Calculation
    const stats = useMemo(() => {
        const customerOrders = orders.filter(o => o.status !== OrderStatus.Cancelled && (o.customer_id === customer.id || o.customer_name === customer.full_name));
        
        // Calculate Net Total Spent (Gross / (1 + VAT))
        const totalSpent = customerOrders.reduce((acc, o) => {
            const netValue = o.total_price / (1 + (o.vat_rate || 0.24));
            return acc + netValue;
        }, 0);

        const orderCount = customerOrders.length;
        const avgOrderValue = orderCount > 0 ? totalSpent / orderCount : 0;
        
        // Category Stats
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

        return { totalSpent, orderCount, avgOrderValue, history: customerOrders, prefData, totalItems };
    }, [customer, orders]);

    const handleSave = async () => {
        if (!editForm.full_name.trim()) {
            showToast("Το ονοματεπώνυμο είναι υποχρεωτικό.", "error");
            return;
        }
        setIsSaving(true);
        await onUpdate(editForm);
        setIsSaving(false);
        setIsEditing(false);
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
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-5xl h-[85vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                
                {/* Header */}
                <div className="p-6 border-b border-slate-100 flex justify-between items-start bg-slate-50/50 shrink-0">
                    <div className="flex items-center gap-5">
                        <div className="w-16 h-16 bg-[#060b00] text-white rounded-2xl flex items-center justify-center font-black text-2xl shadow-lg">
                            {customer.full_name ? customer.full_name.charAt(0) : '+'}
                        </div>
                        <div>
                            {isEditing ? (
                                <input 
                                    className="text-2xl font-black text-slate-800 bg-white border border-slate-300 rounded-lg p-1 px-2 outline-none focus:ring-2 focus:ring-blue-500 mb-1 w-full"
                                    value={editForm.full_name}
                                    onChange={e => setEditForm({...editForm, full_name: e.target.value})}
                                    placeholder="Ονοματεπώνυμο..."
                                    autoFocus
                                />
                            ) : (
                                <h2 className="text-2xl font-black text-slate-800 tracking-tight">{customer.full_name}</h2>
                            )}
                            <div className="flex items-center gap-3 text-sm text-slate-500">
                                {isEditing ? (
                                    <input 
                                        className="bg-white border border-slate-300 rounded px-2 py-0.5 text-xs font-mono"
                                        value={editForm.vat_number || ''}
                                        onChange={e => setEditForm({...editForm, vat_number: e.target.value})}
                                        placeholder="ΑΦΜ"
                                    />
                                ) : (
                                    <span className="font-mono bg-slate-100 px-2 py-0.5 rounded text-xs font-bold">ΑΦΜ: {customer.vat_number || '-'}</span>
                                )}
                                <span className="flex items-center gap-1"><MapPin size={12}/> {isEditing ? <input className="bg-white border border-slate-300 rounded px-2 py-0.5 text-xs" value={editForm.address || ''} onChange={e => setEditForm({...editForm, address: e.target.value})} placeholder="Διεύθυνση"/> : (customer.address || 'Χωρίς διεύθυνση')}</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        {isEditing ? (
                            <>
                                <button onClick={() => { if (!customer.id) onClose(); else { setEditForm(customer); setIsEditing(false); } }} className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg font-bold text-sm">Άκυρο</button>
                                <button onClick={handleSave} disabled={isSaving} className="bg-emerald-600 text-white px-4 py-2 rounded-xl font-bold shadow-md hover:bg-emerald-700 flex items-center gap-2">
                                    {isSaving ? <Loader2 size={16} className="animate-spin"/> : <Save size={16}/>} Αποθήκευση
                                </button>
                            </>
                        ) : (
                            <>
                                <button onClick={() => setIsEditing(true)} className="p-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl transition-colors shadow-sm" title="Επεξεργασία"><FileText size={18}/></button>
                                <button onClick={() => onDelete(customer.id)} className="p-2 bg-white border border-red-100 hover:bg-red-50 text-red-500 rounded-xl transition-colors shadow-sm" title="Διαγραφή"><Trash2 size={18}/></button>
                                <button onClick={onClose} className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-xl transition-colors ml-2"><X size={18}/></button>
                            </>
                        )}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 bg-slate-50/30 custom-scrollbar">
                    
                    {/* Top Stats Cards - Only visible if not creating new */}
                    {customer.id && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between h-28 relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-3 opacity-5 text-emerald-600"><TrendingUp size={64}/></div>
                                <div className="text-[10px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-2"><Wallet size={12}/> Συνολικός Τζίρος (Net)</div>
                                <div className="text-3xl font-black text-emerald-700">{formatCurrency(stats.totalSpent)}</div>
                            </div>
                            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between h-28 relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-3 opacity-5 text-blue-600"><ShoppingBag size={64}/></div>
                                <div className="text-[10px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-2"><Briefcase size={12}/> Παραγγελίες</div>
                                <div className="text-3xl font-black text-blue-700">{stats.orderCount}</div>
                            </div>
                            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between h-28 relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-3 opacity-5 text-amber-600"><Calculator size={64}/></div>
                                <div className="text-[10px] font-black text-amber-600 uppercase tracking-widest flex items-center gap-2"><PieChart size={12}/> Μέση Παραγγελία</div>
                                <div className="text-3xl font-black text-amber-700">{formatCurrency(stats.avgOrderValue)}</div>
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                        
                        {/* Details & Billing */}
                        <div className="lg:col-span-1 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm h-full">
                            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2"><FileText size={14}/> Στοιχεία Τιμολόγησης</h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase">ΑΦΜ / Auto-Fill</label>
                                    {isEditing ? (
                                        <div className="flex gap-2 mt-1">
                                            <input className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono" value={editForm.vat_number || ''} onChange={e => setEditForm({...editForm, vat_number: e.target.value})}/>
                                            <button onClick={handleAfmLookup} disabled={isSearchingAfm} className="p-2 bg-blue-100 text-blue-600 rounded-lg">{isSearchingAfm ? <Loader2 size={14} className="animate-spin"/> : <Zap size={14}/>}</button>
                                        </div>
                                    ) : (
                                        <div className="font-mono font-bold text-slate-700 text-sm mt-0.5">{customer.vat_number || '-'}</div>
                                    )}
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400 uppercase">Τηλέφωνο</label>
                                        {isEditing ? <input className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm mt-1" value={editForm.phone || ''} onChange={e => setEditForm({...editForm, phone: e.target.value})}/> : <div className="font-medium text-slate-700 text-sm mt-0.5">{customer.phone || '-'}</div>}
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400 uppercase">Email</label>
                                        {isEditing ? <input className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm mt-1" value={editForm.email || ''} onChange={e => setEditForm({...editForm, email: e.target.value})}/> : <div className="font-medium text-slate-700 text-sm mt-0.5 truncate">{customer.email || '-'}</div>}
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase">Διεύθυνση</label>
                                    {isEditing ? <input className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm mt-1" value={editForm.address || ''} onChange={e => setEditForm({...editForm, address: e.target.value})}/> : <div className="font-medium text-slate-700 text-sm mt-0.5">{customer.address || '-'}</div>}
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase">ΦΠΑ</label>
                                    {isEditing ? (
                                        <select className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm mt-1 font-bold text-slate-700" value={editForm.vat_rate} onChange={e => setEditForm({...editForm, vat_rate: parseFloat(e.target.value)})}>
                                            <option value={VatRegime.Standard}>24% (Κανονικό)</option>
                                            <option value={VatRegime.Reduced}>17% (Μειωμένο)</option>
                                            <option value={VatRegime.Zero}>0% (Μηδενικό)</option>
                                        </select>
                                    ) : (
                                        <div className="font-bold text-blue-600 text-sm mt-0.5">{((customer.vat_rate || 0.24)*100).toFixed(0)}%</div>
                                    )}
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase">Σημειώσεις</label>
                                    {isEditing ? (
                                        <textarea className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm mt-1 h-20 resize-none" value={editForm.notes || ''} onChange={e => setEditForm({...editForm, notes: e.target.value})}/>
                                    ) : (
                                        <div className="text-sm text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-100 italic min-h-[3rem]">{customer.notes || 'Καμία σημείωση.'}</div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Top Preferences */}
                        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm h-full flex flex-col">
                            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2"><Trophy size={14} className="text-amber-500"/> Προτιμήσεις (Top 5)</h3>
                            
                            <div className="space-y-3 flex-1 overflow-y-auto pr-2 custom-scrollbar">
                                {stats.prefData.length > 0 ? stats.prefData.map((item, index) => (
                                    <div key={item.name} className="flex items-center gap-4 p-3 hover:bg-slate-50 rounded-xl transition-colors border border-transparent hover:border-slate-100">
                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm shadow-sm ${index === 0 ? 'bg-amber-100 text-amber-700' : (index === 1 ? 'bg-slate-200 text-slate-600' : (index === 2 ? 'bg-orange-100 text-orange-700' : 'bg-white border border-slate-200 text-slate-400'))}`}>
                                            {index + 1}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="font-bold text-slate-700">{item.name}</span>
                                                <span className="font-mono font-bold text-slate-600 text-sm">{formatCurrency(item.value)}</span>
                                            </div>
                                            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                                                <div className={`h-full rounded-full ${index === 0 ? 'bg-amber-400' : 'bg-blue-400'}`} style={{ width: `${item.percentage}%` }}></div>
                                            </div>
                                        </div>
                                        <div className="text-right w-16">
                                            <div className="text-xs font-black text-slate-800">{item.count} τεμ</div>
                                            <div className="text-[10px] font-bold text-slate-400">{item.percentage.toFixed(0)}%</div>
                                        </div>
                                    </div>
                                )) : (
                                    <div className="h-full flex flex-col items-center justify-center text-slate-300">
                                        <PieChart size={48} className="opacity-20 mb-2"/>
                                        <p>Δεν υπάρχουν δεδομένα.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Order History Table */}
                    {customer.id && (
                        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
                                <Calendar size={16} className="text-slate-500"/> 
                                <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Ιστορικό Παραγγελιών</span>
                            </div>
                            <table className="w-full text-left text-sm">
                                <thead className="bg-white text-slate-400 font-bold text-[10px] uppercase border-b border-slate-100">
                                    <tr>
                                        <th className="p-4 pl-6">ID</th>
                                        <th className="p-4">Ημερομηνία</th>
                                        <th className="p-4 text-right">Ποσό (Net)</th>
                                        <th className="p-4 text-center">Κατάσταση</th>
                                        <th className="p-4 text-center">Είδη</th>
                                        <th className="p-4"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {stats.history.map(o => {
                                        const netValue = o.total_price / (1 + (o.vat_rate || 0.24));
                                        return (
                                            <tr key={o.id} className="hover:bg-slate-50 transition-colors group">
                                                <td className="p-4 pl-6 font-mono font-bold text-slate-600">{o.id}</td>
                                                <td className="p-4 text-slate-600">{new Date(o.created_at).toLocaleDateString('el-GR')}</td>
                                                <td className="p-4 text-right font-black text-slate-800">{formatCurrency(netValue)}</td>
                                                <td className="p-4 text-center">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase ${getStatusColor(o.status)}`}>
                                                        {STATUS_TRANSLATIONS[o.status]}
                                                    </span>
                                                </td>
                                                <td className="p-4 text-center font-medium text-slate-500">{o.items.length}</td>
                                                <td className="p-4 text-center">
                                                    {onPrintOrder && (
                                                        <button onClick={() => onPrintOrder(o)} className="p-2 text-slate-300 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">
                                                            <Printer size={16}/>
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {stats.history.length === 0 && (
                                        <tr><td colSpan={6} className="p-10 text-center text-slate-400 italic">Καμία παραγγελία.</td></tr>
                                    )}
                                </tbody>
                            </table>
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
            showToast("Πελάτης δημιουργήθηκε.", "success");
        } catch (e) {
            showToast("Σφάλμα δημιουργίας.", "error");
        }
    };

    const handleUpdateCustomer = async (c: Customer) => {
        try {
            await api.updateCustomer(c.id, c);
            queryClient.invalidateQueries({ queryKey: ['customers'] });
            setSelectedCustomer(c); // Update local view
            showToast("Ενημερώθηκε.", "success");
        } catch (e) {
            showToast("Σφάλμα ενημέρωσης.", "error");
        }
    };

    const handleDeleteCustomer = async (id: string) => {
        const yes = await confirm({ title: 'Διαγραφή', message: 'Οριστική διαγραφή πελάτη;', isDestructive: true });
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
            <div className="flex justify-between items-center bg-white p-6 rounded-3xl shadow-sm border border-slate-100 shrink-0">
                 <div>
                    <h1 className="text-3xl font-bold text-slate-800 flex items-center gap-3">
                        <div className="p-2 bg-blue-100 text-blue-600 rounded-xl"><Users size={24} /></div>
                        Πελάτες
                    </h1>
                    <p className="text-slate-500 mt-1 ml-14">Διαχείριση πελατολογίου και προμηθευτών.</p>
                 </div>
                 
                 <div className="flex gap-4">
                     <div className="flex bg-slate-100 p-1 rounded-xl">
                        <button onClick={() => setActiveTab('customers')} className={`px-6 py-2.5 rounded-lg font-bold text-sm transition-all flex items-center gap-2 ${activeTab === 'customers' ? 'bg-[#060b00] text-white shadow-md' : 'text-slate-500 hover:text-slate-700'}`}>
                            <Users size={16}/> Πελάτες
                        </button>
                        <button onClick={() => setActiveTab('suppliers')} className={`px-6 py-2.5 rounded-lg font-bold text-sm transition-all flex items-center gap-2 ${activeTab === 'suppliers' ? 'bg-purple-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-700'}`}>
                            <Globe size={16}/> Προμηθευτές
                        </button>
                     </div>
                     
                     {activeTab === 'customers' && (
                         <div className="relative group">
                            <input 
                                type="text" 
                                placeholder="Αναζήτηση..." 
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all w-64 shadow-sm font-medium"
                            />
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600" size={18}/>
                         </div>
                     )}

                     <button 
                        onClick={() => {
                             if (activeTab === 'customers') {
                                 setIsCreating(true);
                                 // Generate random ID for consistent offline-first state
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
                             }
                        }}
                        className="bg-[#060b00] text-white p-3 rounded-xl hover:bg-black shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5 active:scale-95"
                     >
                         <Plus size={20}/>
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
                                onClick={() => setSelectedCustomer(c)} 
                                latestOrderDate={latestOrdersMap[c.id]}
                            />
                        ))}
                        {filteredCustomers.length === 0 && <div className="col-span-full text-center py-20 text-slate-400 italic">Δεν βρέθηκαν πελάτες.</div>}
                    </div>
                ) : (
                    <SuppliersPage />
                )}
            </div>

            {/* Modals */}
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

            {isCreating && activeTab === 'customers' && (
                 <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
                      <CustomerDetailsModal 
                        customer={selectedCustomer!} 
                        orders={[]} 
                        onClose={() => setIsCreating(false)}
                        onUpdate={handleCreateCustomer} 
                        onDelete={async () => setIsCreating(false)}
                        onPrintOrder={undefined}
                    />
                 </div>
            )}
        </div>
    );
}
