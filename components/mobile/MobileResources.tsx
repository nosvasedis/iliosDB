
import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, supabase } from '../../lib/supabase';
import { Search, Gem, Box, MapPin, Plus, X, Save, Activity, Puzzle, Scroll, Palette, Filter, Calculator, Trash2 } from 'lucide-react';
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

const TABS = [
    { id: MaterialType.Stone, label: 'Πέτρες', icon: Gem, color: 'text-purple-600', bg: 'bg-purple-50' },
    { id: MaterialType.Component, label: 'Εξαρτήματα', icon: Puzzle, color: 'text-blue-600', bg: 'bg-blue-50' },
    { id: MaterialType.Cord, label: 'Κορδόνια', icon: Activity, color: 'text-amber-600', bg: 'bg-amber-50' },
    { id: MaterialType.Leather, label: 'Δέρματα', icon: Scroll, color: 'text-orange-700', bg: 'bg-orange-50' },
    { id: MaterialType.Enamel, label: 'Σμάλτα', icon: Palette, color: 'text-rose-500', bg: 'bg-rose-50' },
];

export default function MobileResources() {
    const queryClient = useQueryClient();
    const { showToast, confirm } = useUI();
    const [viewMode, setViewMode] = useState<'materials' | 'molds'>('materials');
    
    // Material State
    const [activeTab, setActiveTab] = useState<MaterialType>(MaterialType.Stone);
    const [stoneSubFilter, setStoneSubFilter] = useState<'standard' | 'strand'>('standard');
    const [search, setSearch] = useState('');
    
    // Edit/Create State
    const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
    const [editingMold, setEditingMold] = useState<Mold | null>(null);
    const [isCreating, setIsCreating] = useState(false);

    const { data: materials } = useQuery({ queryKey: ['materials'], queryFn: api.getMaterials });
    const { data: molds } = useQuery({ queryKey: ['molds'], queryFn: api.getMolds });
    const { data: suppliers } = useQuery({ queryKey: ['suppliers'], queryFn: api.getSuppliers });

    const filteredMaterials = useMemo(() => {
        if (!materials) return [];
        return materials.filter(m => {
            if (m.type !== activeTab) return false;
            if (activeTab === MaterialType.Stone) {
                const isStrand = m.stones_per_strand !== null && m.stones_per_strand !== undefined;
                if (stoneSubFilter === 'strand' && !isStrand) return false;
                if (stoneSubFilter === 'standard' && isStrand) return false;
            }
            if (search && !m.name.toLowerCase().includes(search.toLowerCase())) return false;
            return true;
        }).sort((a,b) => a.name.localeCompare(b.name));
    }, [materials, activeTab, stoneSubFilter, search]);

    const filteredMolds = useMemo(() => {
        if (!molds) return [];
        return molds.filter(m => 
            m.code.toLowerCase().includes(search.toLowerCase()) || 
            m.description.toLowerCase().includes(search.toLowerCase())
        );
    }, [molds, search]);

    const handleEditMaterial = (m: Material) => {
        setEditingMaterial({ ...m });
        setIsCreating(false);
    };

    const handleNewMaterial = () => {
        const isStrand = activeTab === MaterialType.Stone && stoneSubFilter === 'strand';
        setEditingMaterial({
            id: '',
            name: '',
            type: activeTab,
            cost_per_unit: 0,
            unit: 'Τεμ',
            stock_qty: 0,
            stones_per_strand: isStrand ? 1 : undefined, // Initialize if strand
            description: ''
        } as Material);
        setIsCreating(true);
    };

    const handleSaveMaterial = async () => {
        if (!editingMaterial || !editingMaterial.name) return;
        try {
            await api.saveMaterial(editingMaterial);
            queryClient.invalidateQueries({ queryKey: ['materials'] });
            setEditingMaterial(null);
            showToast("Αποθηκεύτηκε.", "success");
        } catch (e) {
            showToast("Σφάλμα αποθήκευσης.", "error");
        }
    };

    const handleDeleteMaterial = async () => {
        if (!editingMaterial || !editingMaterial.id) return;
        if (await confirm({ title: 'Διαγραφή', message: 'Είστε σίγουροι;', isDestructive: true })) {
            try {
                await supabase.from('materials').delete().eq('id', editingMaterial.id);
                queryClient.invalidateQueries({ queryKey: ['materials'] });
                setEditingMaterial(null);
                showToast("Διαγράφηκε.", "success");
            } catch (e) { showToast("Σφάλμα.", "error"); }
        }
    };
    
    // Mold Handlers
    const handleSaveMold = async () => {
        if (!editingMold || !editingMold.code) return;
        try {
            if (isCreating) await supabase.from('molds').insert(editingMold);
            else await supabase.from('molds').update(editingMold).eq('code', editingMold.code);
            queryClient.invalidateQueries({ queryKey: ['molds'] });
            setEditingMold(null);
            showToast("Αποθηκεύτηκε.", "success");
        } catch (e) { showToast("Σφάλμα.", "error"); }
    };
    
    const handleDeleteMold = async () => {
         if (!editingMold || !editingMold.code) return;
         if (await confirm({ title: 'Διαγραφή', message: 'Είστε σίγουροι;', isDestructive: true })) {
            try {
                await supabase.from('molds').delete().eq('code', editingMold.code);
                queryClient.invalidateQueries({ queryKey: ['molds'] });
                setEditingMold(null);
                showToast("Διαγράφηκε.", "success");
            } catch (e) { showToast("Σφάλμα.", "error"); }
         }
    };

    return (
        <div className="flex flex-col h-full bg-slate-50">
            {/* Header */}
            <div className="p-4 bg-white border-b border-slate-100 flex justify-between items-center shadow-sm z-10 shrink-0">
                <div className="flex bg-slate-100 p-1 rounded-xl">
                    <button onClick={() => setViewMode('materials')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${viewMode === 'materials' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500'}`}>Υλικά</button>
                    <button onClick={() => setViewMode('molds')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${viewMode === 'molds' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500'}`}>Λάστιχα</button>
                </div>
                <button onClick={() => viewMode === 'materials' ? handleNewMaterial() : (setEditingMold({ code: '', location: '', description: '' }), setIsCreating(true))} className="bg-[#060b00] text-white p-2 rounded-xl shadow-md active:scale-95">
                    <Plus size={20}/>
                </button>
            </div>

            {/* Material Type Tabs */}
            {viewMode === 'materials' && (
                <div className="bg-white px-4 pb-2 border-b border-slate-100 shrink-0">
                    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                        {TABS.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as MaterialType)}
                                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all whitespace-nowrap ${activeTab === tab.id ? `${tab.bg} ${tab.color} ring-1 ring-slate-200` : 'bg-slate-50 text-slate-500 border border-slate-100'}`}
                            >
                                <tab.icon size={16}/> {tab.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Search & Filters */}
            <div className="p-4 flex flex-col gap-3 shrink-0">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input type="text" placeholder="Αναζήτηση..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-10 p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 shadow-sm font-medium"/>
                </div>
                {viewMode === 'materials' && activeTab === MaterialType.Stone && (
                    <div className="flex bg-slate-200 p-1 rounded-xl self-start">
                        <button onClick={() => setStoneSubFilter('standard')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${stoneSubFilter === 'standard' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>Standard</button>
                        <button onClick={() => setStoneSubFilter('strand')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${stoneSubFilter === 'strand' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>Κορδόνι</button>
                    </div>
                )}
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto px-4 pb-24 space-y-3 custom-scrollbar">
                {viewMode === 'materials' ? filteredMaterials.map(m => (
                    <div key={m.id} onClick={() => handleEditMaterial(m)} className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm active:scale-[0.98] transition-all flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${m.type === MaterialType.Stone ? (m.stones_per_strand ? 'bg-purple-50 text-purple-600' : 'bg-emerald-50 text-emerald-600') : 'bg-slate-100 text-slate-500'}`}>
                                {m.type === MaterialType.Stone ? <Gem size={18}/> : <Box size={18}/>}
                            </div>
                            <div>
                                <div className="font-bold text-slate-800 text-sm">{m.name}</div>
                                <div className="text-[10px] text-slate-400">
                                    {m.stones_per_strand ? `${m.stones_per_strand} πέτρες/σειρά` : (m.description || m.type)}
                                </div>
                            </div>
                        </div>
                        <div className="text-right">
                             <div className="font-mono font-bold text-slate-700">
                                 {m.stones_per_strand ? formatCurrency(m.cost_per_unit * m.stones_per_strand) : formatCurrency(m.cost_per_unit)}
                             </div>
                             <div className="text-[9px] text-slate-400 uppercase font-bold">
                                 {m.stones_per_strand ? 'ΑΝΑ ΣΕΙΡΑ' : `/${m.unit}`}
                             </div>
                        </div>
                    </div>
                )) : filteredMolds.map(m => (
                    <div key={m.code} onClick={() => { setEditingMold(m); setIsCreating(false); }} className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm active:scale-[0.98] transition-all flex justify-between items-center">
                        <div className="flex items-center gap-3">
                             <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-lg flex items-center justify-center font-black text-sm border border-amber-100">L</div>
                             <div>
                                 <div className="font-mono font-bold text-slate-800 text-lg">{m.code}</div>
                                 <div className="text-xs text-slate-500">{m.location}</div>
                             </div>
                        </div>
                        <div className="text-xs text-slate-400 italic max-w-[150px] truncate">{m.description}</div>
                    </div>
                ))}
                {((viewMode === 'materials' && filteredMaterials.length === 0) || (viewMode === 'molds' && filteredMolds.length === 0)) && (
                    <div className="text-center py-12 text-slate-400 italic">Δεν βρέθηκαν αποτελέσματα.</div>
                )}
            </div>

            {/* EDIT MATERIAL MODAL */}
            {editingMaterial && (
                <div className="fixed inset-0 z-[150] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in zoom-in-95">
                    <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
                        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h3 className="text-lg font-black text-slate-800">{isCreating ? 'Νέο Υλικό' : 'Επεξεργασία Υλικού'}</h3>
                            <button onClick={() => setEditingMaterial(null)}><X size={20} className="text-slate-400"/></button>
                        </div>
                        <div className="p-6 overflow-y-auto space-y-4">
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase ml-1">Όνομα</label>
                                <input value={editingMaterial.name} onChange={e => setEditingMaterial({...editingMaterial, name: e.target.value})} className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none font-bold text-slate-800"/>
                            </div>
                            
                            {/* Strand Calculator Logic */}
                            {editingMaterial.stones_per_strand ? (
                                <div className="bg-purple-50 p-4 rounded-xl border border-purple-100 space-y-3">
                                    <div className="flex items-center gap-2 text-purple-800 font-bold text-xs uppercase"><Calculator size={14}/> Υπολογισμός Κορδονιού</div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-[9px] font-bold text-purple-600 uppercase block mb-1">Τιμή Σειράς (€)</label>
                                            <input 
                                                type="number" step="0.01"
                                                className="w-full p-2 rounded-lg border border-purple-200 text-right font-bold text-purple-900"
                                                value={(editingMaterial.cost_per_unit * editingMaterial.stones_per_strand).toFixed(2)}
                                                onChange={e => {
                                                    const strandPrice = parseFloat(e.target.value) || 0;
                                                    const count = editingMaterial.stones_per_strand || 1;
                                                    setEditingMaterial({...editingMaterial, cost_per_unit: strandPrice / count});
                                                }}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[9px] font-bold text-purple-600 uppercase block mb-1">Πέτρες / Σειρά</label>
                                            <input 
                                                type="number"
                                                className="w-full p-2 rounded-lg border border-purple-200 text-center font-bold text-purple-900"
                                                value={editingMaterial.stones_per_strand}
                                                onChange={e => {
                                                    const count = parseInt(e.target.value) || 1;
                                                    // Preserve strand price total logic
                                                    const currentStrandPrice = editingMaterial.cost_per_unit * (editingMaterial.stones_per_strand || 1);
                                                    setEditingMaterial({...editingMaterial, stones_per_strand: count, cost_per_unit: currentStrandPrice / count});
                                                }}
                                            />
                                        </div>
                                    </div>
                                    <div className="text-right text-[10px] text-purple-500 font-medium">
                                        Κόστος ανά πέτρα: <strong>{formatCurrency(editingMaterial.cost_per_unit)}</strong>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex gap-4">
                                    <div className="flex-1">
                                        <label className="text-xs font-bold text-slate-400 uppercase ml-1">Κόστος Μονάδας</label>
                                        <input type="number" step="0.001" value={editingMaterial.cost_per_unit} onChange={e => setEditingMaterial({...editingMaterial, cost_per_unit: parseFloat(e.target.value)})} className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none font-mono font-bold"/>
                                    </div>
                                    <div className="w-24">
                                        <label className="text-xs font-bold text-slate-400 uppercase ml-1">Μονάδα</label>
                                        <input value={editingMaterial.unit} onChange={e => setEditingMaterial({...editingMaterial, unit: e.target.value})} className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none text-center font-bold"/>
                                    </div>
                                </div>
                            )}

                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase ml-1">Προμηθευτής</label>
                                <select 
                                    className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none text-sm font-medium"
                                    value={editingMaterial.supplier_id || ''}
                                    onChange={e => setEditingMaterial({...editingMaterial, supplier_id: e.target.value || undefined})}
                                >
                                    <option value="">Επιλογή...</option>
                                    {suppliers?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                            </div>
                            
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase ml-1">Απόθεμα</label>
                                <input type="number" value={editingMaterial.stock_qty} onChange={e => setEditingMaterial({...editingMaterial, stock_qty: parseInt(e.target.value)})} className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none font-bold"/>
                            </div>
                        </div>
                        <div className="p-5 border-t border-slate-100 bg-slate-50 flex gap-3">
                            {!isCreating && <button onClick={handleDeleteMaterial} className="p-3 bg-red-50 text-red-500 rounded-xl border border-red-100"><Trash2/></button>}
                            <button onClick={handleSaveMaterial} className="flex-1 bg-slate-900 text-white rounded-xl font-bold shadow-lg">Αποθήκευση</button>
                        </div>
                    </div>
                </div>
            )}

            {/* EDIT MOLD MODAL */}
            {editingMold && (
                 <div className="fixed inset-0 z-[150] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in zoom-in-95">
                    <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl p-6 space-y-4">
                        <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                            <h3 className="text-lg font-black text-slate-900">{isCreating ? 'Νέο Λάστιχο' : 'Επεξεργασία'}</h3>
                            <button onClick={() => setEditingMold(null)}><X size={20} className="text-slate-400"/></button>
                        </div>
                        <div>
                             <label className="text-xs font-bold text-slate-400 uppercase ml-1">Κωδικός</label>
                             <input value={editingMold.code} onChange={e => setEditingMold({...editingMold, code: e.target.value.toUpperCase()})} className="w-full p-3 border border-slate-200 rounded-xl font-mono font-bold uppercase"/>
                        </div>
                        <div>
                             <label className="text-xs font-bold text-slate-400 uppercase ml-1">Τοποθεσία</label>
                             <input value={editingMold.location} onChange={e => setEditingMold({...editingMold, location: e.target.value})} className="w-full p-3 border border-slate-200 rounded-xl"/>
                        </div>
                        <div>
                             <label className="text-xs font-bold text-slate-400 uppercase ml-1">Περιγραφή</label>
                             <input value={editingMold.description} onChange={e => setEditingMold({...editingMold, description: e.target.value})} className="w-full p-3 border border-slate-200 rounded-xl"/>
                        </div>
                        <div className="flex gap-3 pt-2">
                             {!isCreating && <button onClick={handleDeleteMold} className="p-3 bg-red-50 text-red-500 rounded-xl"><Trash2/></button>}
                             <button onClick={handleSaveMold} className="flex-1 bg-slate-900 text-white rounded-xl font-bold">Αποθήκευση</button>
                        </div>
                    </div>
                 </div>
            )}
        </div>
    );
}
