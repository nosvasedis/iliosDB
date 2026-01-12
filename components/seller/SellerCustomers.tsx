
import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/supabase';
import { Search, Phone, MapPin, User, Mail } from 'lucide-react';

export default function SellerCustomers() {
    const { data: customers } = useQuery({ queryKey: ['customers'], queryFn: api.getCustomers });
    const [search, setSearch] = useState('');

    const filteredList = useMemo(() => {
        if (!customers) return [];
        return customers.filter(c => 
            c.full_name.toLowerCase().includes(search.toLowerCase()) || 
            (c.phone && c.phone.includes(search))
        );
    }, [customers, search]);

    return (
        <div className="p-4 h-full flex flex-col">
            <h1 className="text-2xl font-black text-slate-900 mb-4">Πελατολόγιο</h1>

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
                {filteredList.map(c => (
                    <div key={c.id} className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center font-bold">
                                <User size={18}/>
                            </div>
                            <div>
                                <div className="font-bold text-slate-900">{c.full_name}</div>
                                {c.address && <div className="text-[10px] text-slate-400 flex items-center gap-1"><MapPin size={10}/> {c.address}</div>}
                            </div>
                        </div>
                        <div className="flex gap-2 mt-3 pt-2 border-t border-slate-50">
                            {c.phone && (
                                <a href={`tel:${c.phone}`} className="flex-1 bg-slate-50 py-2 rounded-lg text-xs font-bold text-slate-600 flex items-center justify-center gap-2">
                                    <Phone size={12}/> Κλήση
                                </a>
                            )}
                            {c.email && (
                                <a href={`mailto:${c.email}`} className="flex-1 bg-slate-50 py-2 rounded-lg text-xs font-bold text-slate-600 flex items-center justify-center gap-2">
                                    <Mail size={12}/> Email
                                </a>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}