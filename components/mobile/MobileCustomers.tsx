
import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/supabase';
import { Search, Phone, Mail, User, MapPin } from 'lucide-react';

export default function MobileCustomers() {
    const { data: customers, isLoading } = useQuery({ queryKey: ['customers'], queryFn: api.getCustomers });
    const [search, setSearch] = useState('');

    const filteredCustomers = useMemo(() => {
        if (!customers) return [];
        return customers.filter(c => 
            c.full_name.toLowerCase().includes(search.toLowerCase()) || 
            (c.phone && c.phone.includes(search))
        );
    }, [customers, search]);

    if (isLoading) return <div className="p-8 text-center text-slate-400">Φόρτωση...</div>;

    return (
        <div className="p-4 h-full flex flex-col">
            <h1 className="text-2xl font-black text-slate-900 mb-4">Πελάτες</h1>

            {/* Search */}
            <div className="relative mb-4 shrink-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                    type="text" 
                    placeholder="Αναζήτηση όνομα ή τηλέφωνο..." 
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-10 p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 shadow-sm font-medium"
                />
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pb-24 custom-scrollbar">
                {filteredCustomers.map(c => (
                    <div key={c.id} className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                        <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 font-bold border border-slate-200">
                                    {c.full_name.substring(0, 2).toUpperCase()}
                                </div>
                                <div>
                                    <div className="font-bold text-slate-800 text-sm">{c.full_name}</div>
                                    {c.address && <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5"><MapPin size={10}/> {c.address}</div>}
                                </div>
                            </div>
                        </div>
                        
                        <div className="flex gap-2">
                            {c.phone && (
                                <a 
                                    href={`tel:${c.phone}`}
                                    className="flex-1 bg-emerald-50 text-emerald-700 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 border border-emerald-100 active:scale-95 transition-transform"
                                >
                                    <Phone size={14} className="fill-current"/> Κλήση
                                </a>
                            )}
                            {c.email && (
                                <a 
                                    href={`mailto:${c.email}`}
                                    className="flex-1 bg-blue-50 text-blue-700 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 border border-blue-100 active:scale-95 transition-transform"
                                >
                                    <Mail size={14}/> Email
                                </a>
                            )}
                        </div>
                    </div>
                ))}
                
                {filteredCustomers.length === 0 && (
                    <div className="text-center py-10 text-slate-400 text-sm font-medium">
                        Δεν βρέθηκαν πελάτες.
                    </div>
                )}
            </div>
        </div>
    );
}
