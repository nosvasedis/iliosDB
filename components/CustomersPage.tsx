
import React, { useState, useMemo } from 'react';
import { Customer, Order } from '../types';
import { Users, Plus, Search, Phone, Mail, MapPin, FileText, Save, Loader2, ArrowRight, User, TrendingUp, ShoppingBag, Calendar, PieChart, Briefcase, Trash2 } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/supabase';
import { useUI } from './UIProvider';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

export default function CustomersPage() {
    const queryClient = useQueryClient();
    const { showToast, confirm } = useUI();
    
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

    const handleDelete = async () => {
        if (!selectedCustomer) return;
        const yes = await confirm({
            title: 'Διαγραφή Πελάτη',
            message: `Είστε σίγουροι ότι θέλετε να διαγράψετε τον πελάτη "${selectedCustomer.full_name}"; Η ενέργεια είναι μη αναστρέψιμη.`,
            isDestructive: true,
            confirmText: 'Διαγραφή'
        });

        if (yes) {
            try {
                await api.deleteCustomer(selectedCustomer.id);
                queryClient.invalidateQueries({ queryKey: ['customers'] });
                setSelectedCustomer(null);
                showToast('Ο πελάτης διαγράφηκε.', 'success');
            } catch (e) {
                console.error(e);
                showToast('Σφάλμα κατά τη διαγραφή.', 'error');
            }
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
                        <button onClick={() => { setIsCreating(true); setSelectedCustomer(null); }} className="bg-slate-900 text-white p-2 rounded-lg hover:bg-slate-800 transition-colors shadow-md"><Plus size={18}/></button>
                    </div>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16}/>
                        <input 
                            type="text" 
                            placeholder="Αναζήτηση..." 
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full pl-9 p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm transition-all shadow-sm"
                        />
                    </div>
                </div>
                
                <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-slate-50/30">
                    {isCreating && (
                        <div className="p-5 bg-white rounded-2xl border border-blue-200 shadow-lg mb-4 animate-in fade-in slide-in-from-top-2 relative z-10">
                            <h3 className="font-bold text-blue-800 text-sm mb-3 flex items-center gap-2"><Plus size={14}/> Νέος Πελάτης</h3>
                            <div className="space-y-3">
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide ml-1">Ονοματεπωνυμο / Επωνυμια *</label>
                                    <input className="w-full p-2.5 rounded-xl border border-slate-200 text-sm bg-white focus:ring-2 focus:ring-blue-500/20 outline-none" value={newCustomer.full_name} onChange={e => setNewCustomer({...newCustomer, full_name: e.target.value})}/>
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide ml-1">Τηλεφωνο</label>
                                    <input className="w-full p-2.5 rounded-xl border border-slate-200 text-sm bg-white focus:ring-2 focus:ring-blue-500/20 outline-none" value={newCustomer.phone} onChange={e => setNewCustomer({...newCustomer, phone: e.target.value})}/>
                                </div>
                                <div className="flex gap-2 pt-2">
                                    <button onClick={handleCreate} className="flex-1 bg-blue-600 text-white py-2 rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors">Αποθήκευση</button>
                                    <button onClick={() => setIsCreating(false)} className="flex-1 bg-white text-slate-600 py-2 rounded-xl text-sm font-bold border border-slate-200 hover:bg-slate-50 transition-colors">Άκυρο</button>
                                </div>
                            </div>
                        </div>
                    )}

                    {filteredCustomers.map(c => (
                        <div 
                            key={c.id} 
                            onClick={() => { setSelectedCustomer(c); setIsCreating(false); setIsEditing(false); }}
                            className={`p-4 rounded-xl cursor-pointer transition-all border group ${selectedCustomer?.id === c.id ? 'bg-slate-900 text-white border-slate-800 shadow-lg transform scale-[1.02]' : 'bg-white hover:bg-white border-transparent hover:border-slate-200 text-slate-700 hover:shadow-md'}`}
                        >
                            <div className="font-bold flex items-center gap-2">
                                <Briefcase size={14} className={selectedCustomer?.id === c.id ? 'text-slate-400' : 'text-slate-300'} />
                                {c.full_name}
                            </div>
                            {c.phone && <div className={`text-xs mt-1.5 flex items-center gap-1.5 ${selectedCustomer?.id === c.id ? 'text-slate-400' : 'text-slate-400'}`}><Phone size={12}/> {c.phone}</div>}
                        </div>
                    ))}
                    {filteredCustomers.length === 0 && !isCreating && <div className="text-center text-slate-400 py-10 text-sm">Δεν βρέθηκαν πελάτες.</div>}
                </div>
            </div>

            {/* Right Column: Details */}
            <div className="lg:col-span-8 flex flex-col min-h-0 h-full">
                {selectedCustomer ? (
                    <div className="bg-white rounded-3xl shadow-sm border border-slate-100 flex flex-col h-full overflow-hidden animate-in fade-in slide-in-from-right-4">
                        {/* Header */}
                        <div className="p-8 border-b border-slate-100 bg-white flex justify-between items-start relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-64 h-64 bg-slate-50 rounded-full -translate-y-1/2 translate-x-1/3 blur-3xl opacity-50 pointer-events-none"></div>
                            
                            <div className="flex items-center gap-6 relative z-10">
                                <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-200 transform rotate-3">
                                    <User size={36}/>
                                </div>
                                <div>
                                    {isEditing ? (
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Ονοματεπωνυμο / Επωνυμια</label>
                                            <input className="text-2xl font-black text-slate-800 bg-white border border-slate-200 p-2 rounded-lg outline-none w-full focus:ring-2 focus:ring-blue-500/20" value={selectedCustomer.full_name} onChange={e => setSelectedCustomer({...selectedCustomer, full_name: e.target.value})}/>
                                        </div>
                                    ) : (
                                        <h2 className="text-3xl font-black text-slate-800 tracking-tight">{selectedCustomer.full_name}</h2>
                                    )}
                                    <div className="flex items-center gap-4 text-sm text-slate-500 mt-3">
                                        <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
                                            <Phone size={14} className="text-slate-400"/> 
                                            {isEditing ? <input className="bg-white border-b border-slate-300 outline-none w-32 text-slate-800 font-medium" value={selectedCustomer.phone || ''} onChange={e => setSelectedCustomer({...selectedCustomer, phone: e.target.value})}/> : (selectedCustomer.phone || '-')}
                                        </div>
                                        <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
                                            <Mail size={14} className="text-slate-400"/> 
                                            {isEditing ? <input className="bg-white border-b border-slate-300 outline-none w-48 text-slate-800 font-medium" value={selectedCustomer.email || ''} onChange={e => setSelectedCustomer({...selectedCustomer, email: e.target.value})}/> : (selectedCustomer.email || '-')}
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="flex gap-2 relative z-10">
                                <button onClick={() => isEditing ? handleUpdate() : setIsEditing(true)} className={`px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all ${isEditing ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-200 hover:bg-emerald-600' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
                                    {isEditing ? <><Save size={18}/> Αποθήκευση</> : <><FileText size={18}/> Επεξεργασία</>}
                                </button>
                                {!isEditing && (
                                    <button onClick={handleDelete} className="px-3 py-2.5 rounded-xl border border-red-100 text-red-500 hover:bg-red-50 hover:text-red-600 transition-colors shadow-sm" title="Διαγραφή Πελάτη">
                                        <Trash2 size={18} />
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-slate-50/30">
                            {/* Stats Cards */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="bg-white p-6 rounded-2xl border border-emerald-100 shadow-sm relative overflow-hidden group hover:-translate-y-1 transition-transform">
                                    <div className="absolute right-0 top-0 w-20 h-20 bg-emerald-50 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                                    <div className="relative z-10">
                                        <div className="text-emerald-800/60 text-xs font-bold uppercase tracking-wide mb-1 flex items-center gap-1"><TrendingUp size={14}/> Συνολικός Τζίρος</div>
                                        <div className="text-3xl font-black text-emerald-700">{customerStats?.totalSpent.toFixed(2)}€</div>
                                    </div>
                                </div>
                                <div className="bg-white p-6 rounded-2xl border border-blue-100 shadow-sm relative overflow-hidden group hover:-translate-y-1 transition-transform">
                                    <div className="absolute right-0 top-0 w-20 h-20 bg-blue-50 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                                    <div className="relative z-10">
                                        <div className="text-blue-800/60 text-xs font-bold uppercase tracking-wide mb-1 flex items-center gap-1"><ShoppingBag size={14}/> Παραγγελίες</div>
                                        <div className="text-3xl font-black text-blue-700">{customerStats?.orderCount}</div>
                                    </div>
                                </div>
                                <div className="bg-white p-6 rounded-2xl border border-amber-100 shadow-sm relative overflow-hidden group hover:-translate-y-1 transition-transform">
                                    <div className="absolute right-0 top-0 w-20 h-20 bg-amber-50 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                                    <div className="relative z-10">
                                        <div className="text-amber-800/60 text-xs font-bold uppercase tracking-wide mb-1 flex items-center gap-1"><PieChart size={14}/> Μέση Παραγγελία</div>
                                        <div className="text-3xl font-black text-amber-700">{customerStats?.avgOrderValue.toFixed(2)}€</div>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                {/* Details Form */}
                                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                                    <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2 pb-4 border-b border-slate-50"><FileText size={20} className="text-slate-400"/> Στοιχεία Τιμολόγησης</h3>
                                    <div className="space-y-5">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5">Διεύθυνση</label>
                                            {isEditing ? (
                                                <input className="w-full p-3 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-blue-500/20 outline-none" value={selectedCustomer.address || ''} onChange={e => setSelectedCustomer({...selectedCustomer, address: e.target.value})} />
                                            ) : (
                                                <div className="text-slate-800 font-medium text-base">{selectedCustomer.address || '-'}</div>
                                            )}
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5">ΑΦΜ</label>
                                            {isEditing ? (
                                                <input className="w-full p-3 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-blue-500/20 outline-none font-mono" value={selectedCustomer.vat_number || ''} onChange={e => setSelectedCustomer({...selectedCustomer, vat_number: e.target.value})} />
                                            ) : (
                                                <div className="text-slate-800 font-medium font-mono text-base">{selectedCustomer.vat_number || '-'}</div>
                                            )}
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5">Σημειώσεις</label>
                                            {isEditing ? (
                                                <textarea className="w-full p-3 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-blue-500/20 outline-none h-24 resize-none" value={selectedCustomer.notes || ''} onChange={e => setSelectedCustomer({...selectedCustomer, notes: e.target.value})} />
                                            ) : (
                                                <div className="text-slate-600 text-sm bg-slate-50 p-4 rounded-xl border border-slate-100 min-h-[80px] leading-relaxed">{selectedCustomer.notes || 'Καμία σημείωση.'}</div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Preferences Chart */}
                                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col">
                                    <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2 pb-4 border-b border-slate-50"><PieChart size={20} className="text-slate-400"/> Προτιμήσεις (Top 5)</h3>
                                    {customerStats && customerStats.prefData.length > 0 ? (
                                        <div className="flex-1 w-full h-64">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart data={customerStats.prefData} layout="vertical" margin={{ top: 0, right: 30, left: 40, bottom: 0 }}>
                                                    <XAxis type="number" hide />
                                                    <YAxis dataKey="name" type="category" width={100} tick={{fontSize: 12, fontWeight: 600, fill: '#64748b'}} axisLine={false} tickLine={false} />
                                                    <Tooltip cursor={{fill: 'transparent'}} contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                                                    <Bar dataKey="value" fill="#f59e0b" radius={[0, 6, 6, 0]} barSize={24}>
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
                                <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2 text-lg"><Calendar size={20} className="text-indigo-500"/> Ιστορικό Παραγγελιών</h3>
                                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs">
                                            <tr>
                                                <th className="p-4 pl-6">ID</th>
                                                <th className="p-4">Ημερομηνία</th>
                                                <th className="p-4 text-right">Ποσό</th>
                                                <th className="p-4">Κατάσταση</th>
                                                <th className="p-4 text-center">Είδη</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50">
                                            {customerStats?.history.map(o => (
                                                <tr key={o.id} className="hover:bg-slate-50 transition-colors">
                                                    <td className="p-4 pl-6 font-mono font-bold text-slate-700">{o.id}</td>
                                                    <td className="p-4 text-slate-600">{new Date(o.created_at).toLocaleDateString('el-GR')}</td>
                                                    <td className="p-4 text-right font-black text-slate-800">{o.total_price.toFixed(2)}€</td>
                                                    <td className="p-4"><span className="bg-slate-100 px-2.5 py-1 rounded-full text-xs font-bold text-slate-600 uppercase tracking-wide border border-slate-200">{o.status}</span></td>
                                                    <td className="p-4 text-center text-xs font-bold text-slate-500">{o.items.length}</td>
                                                </tr>
                                            ))}
                                            {customerStats?.history.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-slate-400 italic">Καμία παραγγελία μέχρι στιγμής.</td></tr>}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 bg-white rounded-3xl border border-slate-200 border-dashed m-1">
                        <div className="bg-slate-50 p-6 rounded-full mb-4">
                            <Users size={48} className="text-slate-300"/>
                        </div>
                        <p className="font-bold text-lg text-slate-500">Επιλέξτε πελάτη για προβολή</p>
                        <p className="text-sm opacity-70">ή δημιουργήστε νέο</p>
                    </div>
                )}
            </div>
        </div>
    );
}
