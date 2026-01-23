
import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, supabase } from '../../lib/supabase';
import { Search, Gem, Box, MapPin, Layers, Plus, X, Save, Check } from 'lucide-react';
import { formatCurrency } from '../../utils/pricingEngine';
import { Material, MaterialType, Mold } from '../../types';
import { useUI } from '../UIProvider';

const MAT_TYPE_LABELS: Record<string, string> = {
    [MaterialType.Stone]: 'Πέτρα',
    [MaterialType.Cord]: 'Κορδόνι',
    [MaterialType.Component]: 'Εξάρτημα',
    [MaterialType.Enamel]: 'Σμάλτο',
    [MaterialType.Leather]: 'Δέρμα'
};

const MAT_TYPE_OPTIONS = Object.entries(MAT_TYPE_LABELS).map(([value, label]) => ({ value, label }));

export default function MobileResources() {
    const queryClient = useQueryClient();
    const { showToast } = useUI();
    const [tab, setTab] = useState<'materials' | 'molds'>('materials');
    const [search, setSearch] = useState('');
    
    // Create/Edit State
    const [isCreating, setIsCreating] = useState(false);
    const [newMaterial, setNewMaterial] = useState<Partial<Material>>({ name: '', type: MaterialType.Stone, cost_per_unit: 0, unit: 'Τεμ' });
    const [newMold, setNewMold] = useState<Partial<Mold>>({ code: '', description: '', location: '' });

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

    const handleCreateMaterial = async () => {
        if (!newMaterial.name) { showToast("Το όνομα είναι υποχρεωτικό.", "error"); return; }
        try {
            await api.saveMaterial(newMaterial as Material);
            queryClient.invalidateQueries({ queryKey: ['materials'] });
            setIsCreating(false);
            setNewMaterial({ name: '', type: MaterialType.Stone, cost_per_unit: 0, unit: 'Τεμ' });
            showToast("Υλικό δημιουργήθηκε.", "success");
        } catch (e) {
            showToast("Σφάλμα δημιουργίας.", "error");
        }
    };

    const handleCreateMold = async () => {
        if (!newMold.code) { showToast("Ο κωδικός είναι υποχρεωτικός.", "error"); return; }
        try {
            await supabase.from('molds').insert(newMold);
            queryClient.invalidateQueries({ queryKey: ['molds'] });
            setIsCreating(false);
            setNewMold({ code: '', description: '', location: '' });
            showToast("Λάστιχο δημιουργήθηκε.", "success");
        } catch (e) {
            showToast("Σφάλμα δημιουργίας.", "error");
        }
    };

    return (
        <div className="p-4 h-full flex flex-col relative">
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

            {/* FLOATING ACTION BUTTON */}
            <div className="fixed bottom-24 right-4 z-50">
                <button 
                    onClick={() => setIsCreating(true)}
                    className="flex items-center justify-center bg-[#060b00] text-white rounded-full w-14 h-14 shadow-xl active:scale-95 transition-transform border-4 border-white"
                >
                    <Plus size={24}/>
                </button>
            </div>

            {/* CREATE MODAL */}
            {isCreating && (
                <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
                    <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl space-y-4 animate-in zoom-in-95">
                        <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                            <h3 className="text-lg font-black text-slate-900">{tab === 'materials' ? 'Νέο Υλικό' : 'Νέο Λάστιχο'}</h3>
                            <button onClick={() => setIsCreating(false)}><X size={20} className="text-slate-400"/></button>
                        </div>
                        
                        {tab === 'materials' ? (
                            <div className="space-y-3">
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase">Τύπος</label>
                                    <select 
                                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold text-slate-800"
                                        value={newMaterial.type}
                                        onChange={e => setNewMaterial({...newMaterial, type: e.target.value as MaterialType})}
                                    >
                                        {MAT_TYPE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase">Όνομα</label>
                                    <input className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold text-slate-800" value={newMaterial.name} onChange={e => setNewMaterial({...newMaterial, name: e.target.value})} placeholder="π.χ. Ζιργκόν Λευκό..."/>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400 uppercase">Κόστος</label>
                                        <input type="number" step="0.001" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold text-slate-800" value={newMaterial.cost_per_unit} onChange={e => setNewMaterial({...newMaterial, cost_per_unit: parseFloat(e.target.value)||0})}/>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400 uppercase">Μονάδα</label>
                                        <input className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold text-slate-800" value={newMaterial.unit} onChange={e => setNewMaterial({...newMaterial, unit: e.target.value})}/>
                                    </div>
                                </div>
                                <button onClick={handleCreateMaterial} className="w-full py-3 bg-emerald-600 text-white rounded-xl font-bold shadow-lg mt-2">Αποθήκευση</button>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase">Κωδικός</label>
                                    <input className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold text-slate-800" value={newMold.code} onChange={e => setNewMold({...newMold, code: e.target.value.toUpperCase()})} placeholder="π.χ. L-12"/>
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase">Τοποθεσία</label>
                                    <input className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold text-slate-800" value={newMold.location} onChange={e => setNewMold({...newMold, location: e.target.value})} placeholder="π.χ. Συρτάρι 1"/>
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase">Περιγραφή</label>
                                    <input className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold text-slate-800" value={newMold.description} onChange={e => setNewMold({...newMold, description: e.target.value})} placeholder="π.χ. Κορμός..."/>
                                </div>
                                <button onClick={handleCreateMold} className="w-full py-3 bg-amber-500 text-white rounded-xl font-bold shadow-lg mt-2">Αποθήκευση</button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
