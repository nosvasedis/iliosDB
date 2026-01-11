
import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/supabase';
import { Search, Phone, Mail, User, MapPin, Globe } from 'lucide-react';

export default function MobileCustomers() {
    const { data: customers } = useQuery({ queryKey: ['customers'], queryFn: api.getCustomers });
    const { data: suppliers } = useQuery({ queryKey: ['suppliers'], queryFn: api.getSuppliers });
    
    const [tab, setTab] = useState<'customers' | 'suppliers'>('customers');
    const [search, setSearch] = useState('');

    const filteredList = useMemo(() => {
        if (tab === 'customers') {
            if (!customers) return [];
            return customers.filter(c => 
                c.full_name.toLowerCase().includes(search.toLowerCase()) || 
                (c.phone && c.phone.includes(search))
            );
        } else {
            if (!suppliers) return [];
            return suppliers.filter(s => 
                s.name.toLowerCase().includes(search.toLowerCase()) ||
                s.contact_person?.toLowerCase().includes(search.toLowerCase())
            );
        }
    }, [customers, suppliers, tab, search]);

    return (
        <div className="p-4 h-full flex flex-col">
            <h1 className="text-2xl font-black text-slate-900 mb-4">Επαφές</h1>

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
                    <div key={item.id} className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
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
                        </div>
                        
                        <div className="flex gap-2">
                            {item.phone && (
                                <a 
                                    href={`tel:${item.phone}`}
                                    className="flex-1 bg-slate-50 text-slate-700 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 border border-slate-100 active:scale-95 transition-transform"
                                >
                                    <Phone size={14} className="fill-current"/> Κλήση
                                </a>
                            )}
                            {item.email && (
                                <a 
                                    href={`mailto:${item.email}`}
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
