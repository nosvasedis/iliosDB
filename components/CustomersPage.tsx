
import React, { useState, useMemo } from 'react';
import { Customer, Order } from '../types';
import { Users, Plus, Search, Phone, Mail, MapPin, FileText, Save, Loader2, ArrowRight, User, TrendingUp, ShoppingBag, Calendar, PieChart } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/supabase';
import { useUI } from './UIProvider';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

export default function CustomersPage() {
    const queryClient = useQueryClient();
    const { showToast } = useUI();
    
    const { data: customers, isLoading: loadingCustomers } = useQuery({ queryKey: ['customers'], queryFn: api.getCustomers });
    const { data: orders, isLoading: loadingOrders } = useQuery({ queryKey: ['orders'], queryFn: api.getOrders });
    
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    
    // New Customer Form State
    const [isCreating, setIsCreating] = useState(false);
    const [newCustomer, setNewCustomer] = useState<Partial<Customer>>({ full_name: '', phone: '' });
    
    // Analytics for Selected Customer
    const customerStats = useMemo(() => {
        if (!selectedCustomer || !orders) return null;
        const customerOrders = orders.filter(o => o.customer_id === selectedCustomer.id || o.customer_name === selectedCustomer.full_name);
        
        const totalSpent = customerOrders.reduce((acc, o) => acc + o.total_price, 0);
        const orderCount = customerOrders.length;
        const avgOrderValue = orderCount > 0 ? totalSpent / orderCount : 0;
        
        // Category Preferences
        const catCounts: Record<string, number> = {};
        customerOrders.forEach(o => {
            o.items.forEach(item => {
                const cat = item.product_details?.category || 'Άλλο';
                catCounts[cat] = (catCounts[cat] || 0) + item.quantity;
            });
        });
        
        const prefData = Object.entries(catCounts)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 5); // Top 5 categories

        return {
            totalSpent,
            orderCount,
            avgOrderValue,
            history: customerOrders,
            prefData
        };
    }, [selectedCustomer, orders]);

    const filteredCustomers = useMemo(() => {
        if (!customers) return [];
        const lowerSearch = searchTerm.toLowerCase();
        return customers.filter(c => 
            c.full_name.toLowerCase().includes(lowerSearch) || 
            (c.phone && c.phone.includes(lowerSearch))
        );
    }, [customers, searchTerm]);

    const handleCreate = async () => {
        if (!newCustomer.full_name) {
            showToast("Το όνομα είναι υποχρεωτικό.", 'error');
            return;
        }
        try {
            const created = await api.saveCustomer(newCustomer);
            queryClient.invalidateQueries({ queryKey: ['customers'] });
            setIsCreating(false);
            setNewCustomer({ full_name: '', phone: '' });
            if (created) setSelectedCustomer(created);
            showToast("Ο πελάτης δημιουργήθηκε.", 'success');
        } catch (e) {
            showToast("Σφάλμα δημιουργίας.", 'error');
        }
    };

    const handleUpdate = async () => {
        if (!selectedCustomer) return;
        try {
            await api.updateCustomer(selectedCustomer.id, {
                full_name: selectedCustomer.full_name,
                phone: selectedCustomer.phone,
                email: selectedCustomer.email,
                address: selectedCustomer.address,
                vat_number: selectedCustomer.vat_number,
                notes: selectedCustomer.notes
            });
            queryClient.invalidateQueries({ queryKey: ['customers'] });
            setIsEditing(false);
            showToast("Τα στοιχεία ενημερώθηκαν.", 'success');
        } catch (e) {
            showToast("Σφάλμα ενημέρωσης.", 'error');
        }
    };

    if (loadingCustomers || loadingOrders) return <div className="flex justify-center p-12"><Loader2 className="animate-spin text-amber-500" /></div>;

    return (
        <div className="h-[calc(100vh-100px)] grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left Column: List */}
            <div className="lg:col-span-4 bg-white rounded-3xl shadow-sm border border-slate-100 flex flex-col overflow-hidden">
                <div className="p-5 border-b border-slate-100 space-y-4">
                    <div className="flex justify-between items-center">
                        <h2 className="font-bold text-slate-800 text-lg flex items-center gap-2"><Users className="text-blue-600"/> Πελάτες</h2>
                        <button onClick={() => { setIsCreating(true); setSelectedCustomer(null); }} className="bg-slate-900 text-white p-2 rounded-lg hover:bg-slate-800 transition-colors"><Plus size={18}/></button>
                    </div>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16}/>
                        <input 
                            type="text" 
                            placeholder="Αναζήτηση..." 
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full pl-9 p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 text-sm"
                        />
                    </div>
                </div>
                
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {isCreating && (
                        <div className="p-4 bg-blue-50 rounded-xl border border-blue-100 mb-2 animate-in fade-in slide-in-from-top-2">
                            <h3 className="font-bold text-blue-800 text-sm mb-3">Νέος Πελάτης</h3>
                            <div className="space-y-2">
                                <input placeholder="Ονοματεπώνυμο *" className="w-full p-2 rounded border border-blue-200 text-sm" value={newCustomer.full_name} onChange={e => setNewCustomer({...newCustomer, full_name: e.target.value})}/>
                                <input placeholder="Τηλέφωνο" className="w-full p-2 rounded border border-blue-200 text-sm" value={newCustomer.phone} onChange={e => setNewCustomer({...newCustomer, phone: e.target.value})}/>
                                <div className="flex gap-2 pt-2">
                                    <button onClick={handleCreate} className="flex-1 bg-blue-600 text-white py-1.5 rounded-lg text-sm font-bold">Αποθήκευση</button>
                                    <button onClick={() => setIsCreating(false)} className="flex-1 bg-white text-slate-600 py-1.5 rounded-lg text-sm font-bold border border-slate-200">Άκυρο</button>
                                </div>
                            </div>
                        </div>
                    )}

                    {filteredCustomers.map(c => (
                        <div 
                            key={c.id} 
                            onClick={() => { setSelectedCustomer(c); setIsCreating(false); setIsEditing(false); }}
                            className={`p-4 rounded-xl cursor-pointer transition-all border ${selectedCustomer?.id === c.id ? 'bg-slate-800 text-white border-slate-700 shadow-md' : 'hover:bg-slate-50 border-transparent hover:border-slate-100 text-slate-700'}`}
                        >
                            <div className="font-bold">{c.full_name}</div>
                            {c.phone && <div className={`text-xs mt-1 flex items-center gap-1 ${selectedCustomer?.id === c.id ? 'text-slate-300' : 'text-slate-400'}`}><Phone size={10}/> {c.phone}</div>}
                        </div>
                    ))}
                    {filteredCustomers.length === 0 && !isCreating && <div className="text-center text-slate-400 py-8 text-sm">Δεν βρέθηκαν πελάτες.</div>}
                </div>
            </div>

            {/* Right Column: Details */}
            <div className="lg:col-span-8 flex flex-col min-h-0 h-full">
                {selectedCustomer ? (
                    <div className="bg-white rounded-3xl shadow-sm border border-slate-100 flex flex-col h-full overflow-hidden animate-in fade-in">
                        {/* Header */}
                        <div className="p-8 border-b border-slate-100 bg-slate-50/30 flex justify-between items-start">
                            <div className="flex items-center gap-5">
                                <div className="w-16 h-16 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-full flex items-center justify-center text-blue-600 border-4 border-white shadow-sm">
                                    <User size={32}/>
                                </div>
                                <div>
                                    {isEditing ? (
                                        <input className="text-2xl font-black text-slate-800 bg-transparent border-b-2 border-blue-400 outline-none w-full" value={selectedCustomer.full_name} onChange={e => setSelectedCustomer({...selectedCustomer, full_name: e.target.value})}/>
                                    ) : (
                                        <h2 className="text-2xl font-black text-slate-800 tracking-tight">{selectedCustomer.full_name}</h2>
                                    )}
                                    <div className="flex items-center gap-4 text-sm text-slate-500 mt-2">
                                        <div className="flex items-center gap-1.5"><Phone size={14}/> {isEditing ? <input className="bg-white border p-1 rounded w-32" value={selectedCustomer.phone || ''} onChange={e => setSelectedCustomer({...selectedCustomer, phone: e.target.value})}/> : (selectedCustomer.phone || '-')}</div>
                                        <div className="flex items-center gap-1.5"><Mail size={14}/> {isEditing ? <input className="bg-white border p-1 rounded w-40" value={selectedCustomer.email || ''} onChange={e => setSelectedCustomer({...selectedCustomer, email: e.target.value})}/> : (selectedCustomer.email || '-')}</div>
                                    </div>
                                </div>
                            </div>
                            <button onClick={() => isEditing ? handleUpdate() : setIsEditing(true)} className={`px-5 py-2 rounded-xl font-bold flex items-center gap-2 transition-all ${isEditing ? 'bg-emerald-500 text-white shadow-emerald-200 shadow-md' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                                {isEditing ? <><Save size={18}/> Αποθήκευση</> : <><FileText size={18}/> Επεξεργασία</>}
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-8 space-y-8">
                            {/* Stats Cards */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="bg-emerald-50 p-5 rounded-2xl border border-emerald-100">
                                    <div className="text-emerald-800/60 text-xs font-bold uppercase tracking-wide mb-1 flex items-center gap-1"><TrendingUp size={14}/> Συνολικός Τζίρος</div>
                                    <div className="text-3xl font-black text-emerald-700">{customerStats?.totalSpent.toFixed(2)}€</div>
                                </div>
                                <div className="bg-blue-50 p-5 rounded-2xl border border-blue-100">
                                    <div className="text-blue-800/60 text-xs font-bold uppercase tracking-wide mb-1 flex items-center gap-1"><ShoppingBag size={14}/> Παραγγελίες</div>
                                    <div className="text-3xl font-black text-blue-700">{customerStats?.orderCount}</div>
                                </div>
                                <div className="bg-amber-50 p-5 rounded-2xl border border-amber-100">
                                    <div className="text-amber-800/60 text-xs font-bold uppercase tracking-wide mb-1 flex items-center gap-1"><PieChart size={14}/> Μέση Παραγγελία</div>
                                    <div className="text-3xl font-black text-amber-700">{customerStats?.avgOrderValue.toFixed(2)}€</div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                {/* Details Form */}
                                <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
                                    <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><FileText size={18}/> Στοιχεία Τιμολόγησης & Σημειώσεις</h3>
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Διεύθυνση</label>
                                            {isEditing ? (
                                                <input className="w-full p-2 border border-slate-200 rounded-lg text-sm" value={selectedCustomer.address || ''} onChange={e => setSelectedCustomer({...selectedCustomer, address: e.target.value})} />
                                            ) : (
                                                <div className="text-slate-800 font-medium">{selectedCustomer.address || '-'}</div>
                                            )}
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-400 uppercase mb-1">ΑΦΜ</label>
                                            {isEditing ? (
                                                <input className="w-full p-2 border border-slate-200 rounded-lg text-sm" value={selectedCustomer.vat_number || ''} onChange={e => setSelectedCustomer({...selectedCustomer, vat_number: e.target.value})} />
                                            ) : (
                                                <div className="text-slate-800 font-medium">{selectedCustomer.vat_number || '-'}</div>
                                            )}
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Σημειώσεις</label>
                                            {isEditing ? (
                                                <textarea className="w-full p-2 border border-slate-200 rounded-lg text-sm h-24" value={selectedCustomer.notes || ''} onChange={e => setSelectedCustomer({...selectedCustomer, notes: e.target.value})} />
                                            ) : (
                                                <div className="text-slate-600 text-sm bg-slate-50 p-3 rounded-lg border border-slate-100 min-h-[60px]">{selectedCustomer.notes || 'Καμία σημείωση.'}</div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Preferences Chart */}
                                <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm flex flex-col">
                                    <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><PieChart size={18}/> Προτιμήσεις (Top 5)</h3>
                                    {customerStats && customerStats.prefData.length > 0 ? (
                                        <div className="flex-1 w-full h-64">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart data={customerStats.prefData} layout="vertical" margin={{ top: 0, right: 30, left: 40, bottom: 0 }}>
                                                    <XAxis type="number" hide />
                                                    <YAxis dataKey="name" type="category" width={100} tick={{fontSize: 12}} />
                                                    <Tooltip cursor={{fill: 'transparent'}} />
                                                    <Bar dataKey="value" fill="#f59e0b" radius={[0, 4, 4, 0]} barSize={20}>
                                                        {customerStats.prefData.map((entry, index) => (
                                                            <Cell key={`cell-${index}`} fill={['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981'][index % 5]} />
                                                        ))}
                                                    </Bar>
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    ) : (
                                        <div className="flex-1 flex items-center justify-center text-slate-400 italic">Δεν υπάρχουν αρκετά δεδομένα.</div>
                                    )}
                                </div>
                            </div>

                            {/* Order History */}
                            <div>
                                <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2 text-lg"><Calendar size={20}/> Ιστορικό Παραγγελιών</h3>
                                <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs">
                                            <tr>
                                                <th className="p-4">ID</th>
                                                <th className="p-4">Ημερομηνία</th>
                                                <th className="p-4">Ποσό</th>
                                                <th className="p-4">Κατάσταση</th>
                                                <th className="p-4">Είδη</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50">
                                            {customerStats?.history.map(o => (
                                                <tr key={o.id} className="hover:bg-slate-50 transition-colors">
                                                    <td className="p-4 font-mono font-bold text-slate-700">{o.id}</td>
                                                    <td className="p-4 text-slate-600">{new Date(o.created_at).toLocaleDateString('el-GR')}</td>
                                                    <td className="p-4 font-bold">{o.total_price.toFixed(2)}€</td>
                                                    <td className="p-4"><span className="bg-slate-100 px-2 py-1 rounded-full text-xs font-bold text-slate-600">{o.status}</span></td>
                                                    <td className="p-4 text-xs text-slate-500">{o.items.length} προϊόντα</td>
                                                </tr>
                                            ))}
                                            {customerStats?.history.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-slate-400">Καμία παραγγελία.</td></tr>}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 bg-slate-50 rounded-3xl border border-slate-200 border-dashed m-1">
                        <Users size={64} className="mb-4 opacity-20"/>
                        <p className="font-medium text-lg">Επιλέξτε πελάτη για προβολή.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
