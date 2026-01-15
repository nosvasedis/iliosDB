
import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/supabase';
import { Search, Gem, Box, MapPin, Layers } from 'lucide-react';
import { formatCurrency } from '../../utils/pricingEngine';
import { Material, MaterialType, Mold } from '../../types';

const MAT_TYPE_LABELS: Record<string, string> = {
    [MaterialType.Stone]: 'Πέτρα',
    [MaterialType.Cord]: 'Κορδόνι',
    [MaterialType.Component]: 'Εξάρτημα',
    [MaterialType.Enamel]: 'Σμάλτο',
    [MaterialType.Leather]: 'Δέρμα'
};

export default function MobileResources() {
    const [tab, setTab] = useState<'materials' | 'molds'>('materials');
    const [search, setSearch] = useState('');

    const { data: materials } = useQuery({ queryKey: ['materials'], queryFn: api.getMaterials });
    const { data: molds } = useQuery({ queryKey: ['molds'], queryFn: api.getMolds });

    const filteredMaterials = useMemo(() => {
        if (!materials) return [];
        return materials.filter(m => m.name.toLowerCase().includes(search.toLowerCase()));
    }, [materials, search]);

    const filteredMolds = useMemo(() => {
        if (!molds) return [];
        return molds.filter(m => 
            m.code.toLowerCase().includes(search.toLowerCase()) || 
            m.description.toLowerCase().includes(search.toLowerCase())
        );
    }, [molds, search]);

    return (
        <div className="p-4 h-full flex flex-col">
            <h1 className="text-2xl font-black text-slate-900 mb-4">Πόροι</h1>

            {/* Tabs */}
            <div className="flex p-1 bg-slate-100 rounded-xl mb-4 shrink-0">
                <button 
                    onClick={() => setTab('materials')}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${tab === 'materials' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
                >
                    Υλικά
                </button>
                <button 
                    onClick={() => setTab('molds')}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${tab === 'molds' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
                >
                    Λάστιχα
                </button>
            </div>

            {/* Search */}
            <div className="relative mb-4 shrink-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                    type="text" 
                    placeholder={tab === 'materials' ? "Αναζήτηση υλικών..." : "Κωδικός ή περιγραφή..."}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-10 p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 shadow-sm font-medium"
                />
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto space-y-3 pb-24 custom-scrollbar">
                {tab === 'materials' && filteredMaterials.map(m => (
                    <div key={m.id} className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${m.type === MaterialType.Stone ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-500'}`}>
                            {m.type === MaterialType.Stone ? <Gem size={20}/> : <Box size={20}/>}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="font-bold text-slate-800 text-sm truncate">{m.name}</div>
                            <div className="text-[10px] text-slate-400 font-medium">{MAT_TYPE_LABELS[m.type] || m.type}</div>
                        </div>
                        <div className="text-right">
                            <div className="font-mono font-bold text-slate-700">{formatCurrency(m.cost_per_unit)}</div>
                            <div className="text-[10px] text-slate-400">/{m.unit}</div>
                        </div>
                    </div>
                ))}

                {tab === 'molds' && filteredMolds.map(m => (
                    <div key={m.code} className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm flex items-center gap-3">
                        <div className="w-12 h-12 bg-amber-50 text-amber-700 rounded-lg flex flex-col items-center justify-center shrink-0 border border-amber-100">
                            <MapPin size={16} className="mb-0.5"/>
                            <span className="text-[9px] font-black uppercase">Loc</span>
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                                <span className="font-mono font-black text-lg text-slate-800">{m.code}</span>
                                {m.location && <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 font-bold uppercase">{m.location}</span>}
                            </div>
                            <div className="text-xs text-slate-500 truncate">{m.description}</div>
                        </div>
                    </div>
                ))}

                {(tab === 'materials' ? filteredMaterials.length : filteredMolds.length) === 0 && (
                    <div className="text-center py-10 text-slate-400 text-sm font-medium">
                        Δεν βρέθηκαν αποτελέσματα.
                    </div>
                )}
            </div>
        </div>
    );
}
