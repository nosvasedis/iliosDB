import React, { useState, useMemo } from 'react';
import { Material, MaterialType, GlobalSettings } from '../types';
import { Trash2, Plus, Save, Loader2, Gem, AlertTriangle, X, Box, Coins, Link, Activity, Puzzle, Edit, List, Palette, Layers, Search, Scroll, User, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { api } from '../lib/supabase';
import { useUI } from './UIProvider';
import { STONE_CODES_MEN, STONE_CODES_WOMEN } from '../constants';

const MAT_TYPE_MAP: Record<MaterialType, string> = {
    [MaterialType.Stone]: 'Πέτρα',
    [MaterialType.Cord]: 'Κορδόνι',
    [MaterialType.Chain]: 'Αλυσίδα',
    [MaterialType.Component]: 'Εξάρτημα',
    [MaterialType.Enamel]: 'Σμάλτο',
    [MaterialType.Leather]: 'Δέρμα'
};

interface Props {
    settings: GlobalSettings;
}

type StoneGroupFilter = 'all' | 'men' | 'women';

export default function MaterialsPage({ settings }: Props) {
  const queryClient = useQueryClient();
  const { showToast, confirm } = useUI();
  const { data: materials, isLoading } = useQuery({ queryKey: ['materials'], queryFn: api.getMaterials });

  const [editableMaterials, setEditableMaterials] = useState<Material[]>([]);
  const [activeTab, setActiveTab] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [stoneGroup, setStoneGroup] = useState<StoneGroupFilter>('all');
  
  // Variant Pricing Modal State
  const [activeMaterial, setActiveMaterial] = useState<Material | null>(null);
  const [variantPrices, setVariantPrices] = useState<{code: string, price: number}[]>([]);

  React.useEffect(() => {
    if (materials) {
      setEditableMaterials(JSON.parse(JSON.stringify(materials)));
    }
  }, [materials]);

  /**
   * Refined Multi-Tier Gender Detection
   * Priority 1: Title Keywords (αντρική, γυναικεία, etc)
   * Priority 2: Exclusive Stone Suffixes (KR, QN vs PAX, BST)
   * Priority 3: General Dictionary matches
   */
  const detectGender = (m: Material) => {
      const nameLower = m.name.toLowerCase();
      const variantCodes = Object.keys(m.variant_prices || {});
      
      // Tier 1: High-Priority Keywords in Title
      const menKeywords = ['ανδρ', 'αντρ', 'άντρας'];
      const womenKeywords = ['γυναικ', 'γυναίκα'];

      const hasMenKw = menKeywords.some(kw => nameLower.includes(kw));
      const hasWomenKw = womenKeywords.some(kw => nameLower.includes(kw));

      if (hasMenKw && !hasWomenKw) return { isMen: true, isWomen: false };
      if (hasWomenKw && !hasMenKw) return { isMen: false, isWomen: true };

      // Tier 2: Exclusive Stone Codes in variants (Suffixes)
      // These codes are distinctively used for one gender or the other
      const menExclusiveCodes = ['KR', 'GSU', 'RSU', 'QN', 'TG', 'TY', 'IA', 'BSU', 'MA', 'OP', 'NF'];
      const womenExclusiveCodes = ['BST', 'PAX', 'MAX', 'KAX', 'PCO', 'MCO', 'CO', 'AI', 'AP', 'AM', 'LR', 'TPR', 'TKO', 'TMP', 'MP', 'PR', 'KO', 'MV', 'RZ', 'AK', 'XAL'];

      const hasMenExCode = variantCodes.some(vc => menExclusiveCodes.includes(vc));
      const hasWomenExCode = variantCodes.some(vc => womenExclusiveCodes.includes(vc));

      if (hasMenExCode && !hasWomenExCode) return { isMen: true, isWomen: false };
      if (hasWomenExCode && !hasMenExCode) return { isMen: false, isWomen: true };

      // Tier 3: Fallback - Dictionary stone names matching in title
      const menStoneNames = Object.values(STONE_CODES_MEN).map(v => v.toLowerCase());
      const womenStoneNames = Object.values(STONE_CODES_WOMEN).map(v => v.toLowerCase());

      const matchesMenName = menStoneNames.some(sn => nameLower.includes(sn));
      const matchesWomenName = womenStoneNames.some(sn => nameLower.includes(sn));

      // If it matches both (like "Λάπις" with no keywords), it shows in both
      return { isMen: matchesMenName, isWomen: matchesWomenName };
  };

  // Derived filtered list with smart stone grouping
  const filteredMaterials = useMemo(() => {
      return editableMaterials.filter(m => {
          const matchesTab = activeTab === 'ALL' || m.type === activeTab;
          const matchesSearch = m.name.toLowerCase().includes(searchTerm.toLowerCase());
          
          if (!matchesTab || !matchesSearch) return false;

          // Apply stone sub-filtering
          if (activeTab === MaterialType.Stone && stoneGroup !== 'all') {
              const { isMen, isWomen } = detectGender(m);
              if (stoneGroup === 'men') return isMen;
              if (stoneGroup === 'women') return isWomen;
          }

          return true;
      });
  }, [editableMaterials, activeTab, searchTerm, stoneGroup]);

  // Calculate counts for tabs
  const counts = useMemo(() => {
      const c: Record<string, number> = { 'ALL': editableMaterials.length };
      Object.values(MaterialType).forEach(t => c[t] = 0);
      editableMaterials.forEach(m => {
          if (c[m.type] !== undefined) c[m.type]++;
      });
      return c;
  }, [editableMaterials]);

  const handleAddMaterial = async () => {
    try {
        const defaultType = activeTab !== 'ALL' ? (activeTab as MaterialType) : MaterialType.Component;
        const { error } = await supabase.from('materials').insert({
            name: 'Νέο Υλικό', type: defaultType, cost_per_unit: 0, unit: 'Τεμ', variant_prices: {}
        });
        if (error) throw error;
        queryClient.invalidateQueries({ queryKey: ['materials'] });
        showToast('Το υλικό δημιουργήθηκε.', 'success');
    } catch(e) {
        showToast("Σφάλμα κατά τη δημιουργία.", 'error');
    }
  };

  const updateMaterial = (id: string, field: keyof Material, value: any) => {
    setEditableMaterials(editableMaterials.map(m => m.id === id ? { ...m, [field]: value } : m));
  };

  const handleSaveRow = async (materialId: string) => {
      const material = editableMaterials.find(m => m.id === materialId);
      if (!material) return;
      try {
          const { error } = await supabase.from('materials').update({
              name: material.name, type: material.type, cost_per_unit: material.cost_per_unit, unit: material.unit
          }).eq('id', material.id);
          if (error) throw error;
          queryClient.invalidateQueries({ queryKey: ['materials'] });
          showToast("Αποθηκεύτηκε επιτυχώς!", 'success');
      } catch(e) {
          showToast("Σφάλμα αποθήκευσης.", 'error');
      }
  };

  const handleDelete = async (id: string) => {
    const yes = await confirm({
        title: 'Διαγραφή Υλικού',
        message: 'Είστε σίγουροι ότι θέλετε να διαγράψετε αυτό το υλικό;',
        isDestructive: true,
        confirmText: 'Διαγραφή'
    });
    if (yes) {
        try {
            const { error } = await supabase.from('materials').delete().eq('id', id);
            if (error) throw error;
            queryClient.invalidateQueries({ queryKey: ['materials'] });
            showToast("Το υλικό διαγράφηκε.", 'info');
        } catch(e) {
            showToast("Σφάλμα διαγραφής.", 'error');
        }
    }
  };

  const openVariantEditor = (m: Material) => {
      setActiveMaterial(m);
      const variants = m.variant_prices ? Object.entries(m.variant_prices).map(([code, price]) => ({ code, price })) : [];
      setVariantPrices(variants);
  };

  const saveVariantPrices = async () => {
      if (!activeMaterial) return;
      const pricesObj: Record<string, number> = {};
      variantPrices.forEach(vp => {
          if (vp.code && vp.price > 0) pricesObj[vp.code.toUpperCase()] = parseFloat(vp.price.toString());
      });
      try {
          const { error } = await supabase.from('materials').update({ variant_prices: pricesObj }).eq('id', activeMaterial.id);
          if (error) throw error;
          queryClient.invalidateQueries({ queryKey: ['materials'] });
          setActiveMaterial(null);
          showToast("Οι ειδικές τιμές αποθηκεύτηκαν.", 'success');
      } catch ( e) {
          showToast("Σφάλμα αποθήκευσης.", 'error');
      }
  };

  const getMaterialIcon = (type: MaterialType) => {
      switch (type) {
          case MaterialType.Stone: return <Gem size={16} className="text-emerald-500" />;
          case MaterialType.Cord: return <Activity size={16} className="text-amber-600" />;
          case MaterialType.Chain: return <Link size={16} className="text-slate-500" />;
          case MaterialType.Component: return <Puzzle size={16} className="text-blue-500" />;
          case MaterialType.Enamel: return <Palette size={16} className="text-rose-500" />;
          case MaterialType.Leather: return <Scroll size={16} className="text-amber-700" />;
          default: return <Box size={16} className="text-slate-400" />;
      }
  };

  const TABS = [
      { id: 'ALL', label: 'Όλα', icon: Layers },
      { id: MaterialType.Stone, label: 'Πέτρες', icon: Gem },
      { id: MaterialType.Component, label: 'Εξαρτήματα', icon: Puzzle },
      { id: MaterialType.Chain, label: 'Αλυσίδες', icon: Link },
      { id: MaterialType.Cord, label: 'Κορδόνια', icon: Activity },
      { id: MaterialType.Leather, label: 'Δέρματα', icon: Scroll },
      { id: MaterialType.Enamel, label: 'Σμάλτα', icon: Palette },
  ];

  if (isLoading) return <div className="flex justify-center items-center h-64"><Loader2 className="animate-spin text-amber-500" size={32} /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
        <div>
           <h1 className="text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-3">
               <div className="p-2 bg-purple-100 text-purple-600 rounded-xl">
                    <Gem size={24} />
               </div>
               Διαχείριση Υλικών
           </h1>
           <p className="text-slate-500 mt-1 ml-14">Κατάλογος πρώτων υλών για κοστολόγηση.</p>
        </div>
        <button onClick={handleAddMaterial} className="flex items-center gap-2 bg-slate-900 text-white px-5 py-3 rounded-xl hover:bg-slate-800 font-bold transition-all hover:shadow-lg hover:-translate-y-0.5">
            <Plus size={20} /> Νέο {activeTab !== 'ALL' ? MAT_TYPE_MAP[activeTab as MaterialType] : 'Υλικό'}
        </button>
      </div>

      <div className="space-y-4">
          <div className="flex flex-col gap-4">
              {/* MAIN CATEGORY TABS */}
              <div className="flex gap-2 overflow-x-auto pb-2 w-full scrollbar-hide">
                  {TABS.map(tab => {
                      const isActive = activeTab === tab.id;
                      return (
                          <button
                              key={tab.id}
                              onClick={() => { setActiveTab(tab.id); setStoneGroup('all'); }}
                              className={`
                                  flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm whitespace-nowrap transition-all border
                                  ${isActive 
                                      ? 'bg-purple-600 text-white border-purple-600 shadow-md shadow-purple-200' 
                                      : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50 hover:text-slate-700'}
                              `}
                          >
                              <tab.icon size={16} />
                              {tab.label}
                              <span className={`ml-1 text-xs py-0.5 px-1.5 rounded-md ${isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-400'}`}>
                                  {counts[tab.id] || 0}
                              </span>
                          </button>
                      );
                  })}
              </div>
              
              {/* SUB-GROUPING FOR STONES */}
              {activeTab === MaterialType.Stone && (
                <div className="flex items-center gap-2 bg-white p-1.5 rounded-2xl border border-slate-200 w-fit animate-in slide-in-from-top-2">
                    <button 
                        onClick={() => setStoneGroup('all')}
                        className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${stoneGroup === 'all' ? 'bg-slate-100 text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                        Όλες
                    </button>
                    <button 
                        onClick={() => setStoneGroup('men')}
                        className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${stoneGroup === 'men' ? 'bg-blue-50 text-blue-700 border-blue-100' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                        <User size={14}/> Ανδρικές
                    </button>
                    <button 
                        onClick={() => setStoneGroup('women')}
                        className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${stoneGroup === 'women' ? 'bg-pink-50 text-pink-700 border-pink-100' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                        <User size={14}/> Γυναικείες
                    </button>
                </div>
              )}
              
              <div className="relative w-full md:w-64 self-end">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16}/>
                  <input 
                      type="text" 
                      placeholder="Αναζήτηση..." 
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      className="w-full pl-9 p-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-500/20 text-sm font-medium"
                  />
              </div>
          </div>

          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs border-b border-slate-100">
                  <tr>
                      <th className="p-5 w-16 text-center">#</th>
                      <th className="p-5">Όνομα</th>
                      <th className="p-5">Τύπος</th>
                      <th className="p-5 text-right">Κόστος (€)</th>
                      <th className="p-5 w-24 text-center">Μονάδα</th>
                      <th className="p-5 text-center w-32">Ενέργειες</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredMaterials.map((m, idx) => {
                    // Detect gender for UI badge using our Tiered logic
                    const isStone = m.type === MaterialType.Stone;
                    const { isMen, isWomen } = isStone ? detectGender(m) : { isMen: false, isWomen: false };

                    return (
                        <tr key={m.id} className="hover:bg-slate-50/80 transition-colors group">
                        <td className="p-4 text-center text-slate-400 font-mono text-xs">{idx + 1}</td>
                        <td className="p-4">
                            <div className="flex flex-col">
                                <div className="flex items-center gap-2">
                                    <input 
                                        type="text" 
                                        value={m.name} 
                                        onChange={(e) => updateMaterial(m.id, 'name', e.target.value)} 
                                        className="bg-transparent border-b border-transparent hover:border-slate-300 focus:border-purple-500 py-1 font-bold text-slate-800 outline-none transition-all placeholder-slate-300 min-w-0"
                                    />
                                    {isStone && (
                                        <div className="flex gap-1 shrink-0">
                                            {isMen && <div className="bg-blue-100 text-blue-600 p-1 rounded" title="Ανδρικό"><User size={10}/></div>}
                                            {isWomen && <div className="bg-pink-100 text-pink-600 p-1 rounded" title="Γυναικείο"><User size={10}/></div>}
                                        </div>
                                    )}
                                </div>
                                {Object.keys(m.variant_prices || {}).length > 0 && (
                                    <div className="flex items-center gap-1 text-[10px] text-blue-600 mt-1">
                                        <List size={10}/> {Object.keys(m.variant_prices || {}).length} ειδικές τιμές
                                    </div>
                                )}
                            </div>
                        </td>
                        <td className="p-4">
                            <div className="relative flex items-center gap-2">
                                {getMaterialIcon(m.type)}
                                <select 
                                    value={m.type} 
                                    onChange={(e) => updateMaterial(m.id, 'type', e.target.value)} 
                                    className="bg-transparent border-b border-transparent hover:border-slate-300 focus:border-purple-500 py-1 text-slate-600 outline-none w-full appearance-none font-medium cursor-pointer"
                                >
                                    {Object.values(MaterialType).map(t => <option key={t} value={t}>{MAT_TYPE_MAP[t]}</option>)}
                                </select>
                            </div>
                        </td>
                        <td className="p-4 text-right">
                            <input 
                                type="number" 
                                step="0.001" 
                                value={m.cost_per_unit} 
                                onChange={(e) => updateMaterial(m.id, 'cost_per_unit', parseFloat(e.target.value))} 
                                className="w-24 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-purple-500 py-1 text-right text-slate-900 font-mono font-bold outline-none"
                            />
                        </td>
                        <td className="p-4 text-center">
                            <input 
                                type="text" 
                                value={m.unit} 
                                onChange={(e) => updateMaterial(m.id, 'unit', e.target.value)} 
                                className="w-16 bg-slate-100 rounded py-1 text-center text-slate-500 text-xs font-bold outline-none focus:ring-2 focus:ring-purple-500/20"
                            />
                        </td>
                        <td className="p-4">
                            <div className="flex justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => openVariantEditor(m)} title="Ειδικές Τιμές" className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><List size={18} /></button>
                                <button onClick={() => handleSaveRow(m.id)} title="Αποθήκευση" className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"><Save size={18} /></button>
                                <button onClick={() => handleDelete(m.id)} title="Διαγραφή" className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={18} /></button>
                            </div>
                        </td>
                        </tr>
                    );
                  })}
                  {/* @FIX: Renamed filteredInventory to filteredMaterials to fix undefined variable error. */}
                  {filteredMaterials.length === 0 && (
                    <tr><td colSpan={6} className="p-16 text-center text-slate-400 flex flex-col items-center"><Box className="mb-2 opacity-50" size={32}/><span>Δεν βρέθηκαν υλικά.</span></td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
      </div>

      {/* Variant Pricing Modal */}
      {activeMaterial && (
          <div className="fixed inset-0 z-[150] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl p-6 animate-in zoom-in-95 border border-slate-100">
                  <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-100">
                      <div>
                          <h3 className="text-lg font-bold text-slate-800">Ειδικές Τιμές</h3>
                          <p className="text-sm text-slate-500">{activeMaterial.name} ({activeMaterial.cost_per_unit}€ Base)</p>
                      </div>
                      <button onClick={() => setActiveMaterial(null)} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
                  </div>
                  
                  <div className="max-h-64 overflow-y-auto space-y-2 mb-4 pr-2 custom-scrollbar">
                      {variantPrices.map((vp, idx) => (
                          <div key={idx} className="flex gap-2 items-center">
                              <input 
                                  placeholder="Κωδικός (π.χ. LA)" 
                                  value={vp.code} 
                                  onChange={e => {
                                    const code = e.target.value.toUpperCase();
                                    const updated = [...variantPrices];
                                    updated[idx] = { ...updated[idx], code };
                                    setVariantPrices(updated);
                                  }}
                                  className="flex-1 p-2 border border-slate-200 rounded-lg uppercase font-mono text-sm outline-none focus:border-blue-500"
                              />
                              <input 
                                  type="number" step="0.01" 
                                  placeholder="Τιμή" 
                                  value={vp.price} 
                                  onChange={e => {
                                    const price = parseFloat(e.target.value);
                                    const updated = [...variantPrices];
                                    updated[idx] = { ...updated[idx], price };
                                    setVariantPrices(updated);
                                  }}
                                  className="w-24 p-2 border border-slate-200 rounded-lg font-bold text-sm text-right outline-none focus:border-blue-500"
                              />
                              <button onClick={() => setVariantPrices(variantPrices.filter((_, i) => i !== idx))} className="p-2 text-slate-300 hover:text-red-500"><Trash2 size={16}/></button>
                          </div>
                      ))}
                      {variantPrices.length === 0 && <p className="text-sm text-slate-400 italic text-center py-4">Δεν υπάρχουν ειδικές τιμές.</p>}
                  </div>
                  
                  <div className="flex gap-2">
                      <button onClick={() => setVariantPrices([...variantPrices, { code: '', price: 0 }])} className="flex-1 py-2 border border-dashed border-slate-300 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-50 transition-colors flex items-center justify-center gap-2">
                          <Plus size={14}/> Προσθήκη
                      </button>
                      <button onClick={saveVariantPrices} className="flex-1 bg-blue-600 text-white py-2 rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors">
                          Αποθήκευση
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
}