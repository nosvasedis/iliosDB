
import React, { useState, useMemo, useEffect } from 'react';
import { Material, MaterialType, GlobalSettings } from '../types';
import { Trash2, Plus, Save, Loader2, Gem, Box, Activity, Puzzle, Palette, Scroll, Search, X, Globe, Package, MoreHorizontal, User, CircleDollarSign, Check, XCircle, LayoutGrid, List as ListIcon, Calculator } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { api } from '../lib/supabase';
import { useUI } from './UIProvider';
import { STONE_CODES_MEN, STONE_CODES_WOMEN } from '../constants';
import { formatCurrency } from '../utils/pricingEngine';

const MAT_TYPE_MAP: Record<MaterialType, string> = {
    [MaterialType.Stone]: 'Πέτρα',
    [MaterialType.Cord]: 'Κορδόνι',
    [MaterialType.Component]: 'Εξάρτημα',
    [MaterialType.Enamel]: 'Σμάλτο',
    [MaterialType.Leather]: 'Δέρμα'
};

interface Props {
    settings: GlobalSettings;
}

// Simplified Filter: Only Standard vs Strand for stones
type StoneSubFilter = 'standard' | 'strand';

// -- HELPER COMPONENTS --

interface MaterialCardProps {
    material: Material;
    suppliers: any[];
    onSave: (m: Material) => Promise<void> | void;
    onDelete: (id: string) => Promise<void> | void;
    onEditVariants: (m: Material) => void;
}

const MaterialCard: React.FC<MaterialCardProps> = ({ 
    material, 
    suppliers, 
    onSave, 
    onDelete, 
    onEditVariants 
}) => {
    const [isEditing, setIsEditing] = useState(!material.id.includes('-') && material.name.includes('Νέο')); // Auto-edit if new
    const [editForm, setEditForm] = useState<Material>(material);
    
    // Smart Strand Calculation State
    const [strandPrice, setStrandPrice] = useState<number>(0);

    // Sync external updates
    useEffect(() => {
        if (!isEditing) setEditForm(material);
    }, [material, isEditing]);

    // Initialize Strand Price for UI
    useEffect(() => {
        if (material.stones_per_strand && material.stones_per_strand > 0) {
            setStrandPrice(material.cost_per_unit * material.stones_per_strand);
        }
    }, [material.cost_per_unit, material.stones_per_strand]);

    // Auto-calculate unit cost when Strand Price or Count changes
    useEffect(() => {
        if (isEditing && editForm.stones_per_strand && editForm.stones_per_strand > 0 && strandPrice > 0) {
            const unitCost = strandPrice / editForm.stones_per_strand;
            // Only update if significantly different to avoid loop
            if (Math.abs(unitCost - editForm.cost_per_unit) > 0.0001) {
                setEditForm(prev => ({ ...prev, cost_per_unit: unitCost }));
            }
        }
    }, [strandPrice, editForm.stones_per_strand, isEditing]);

    const handleSave = () => {
        onSave(editForm);
        setIsEditing(false);
    };

    const handleCancel = () => {
        setEditForm(material);
        if (material.stones_per_strand && material.stones_per_strand > 0) {
            setStrandPrice(material.cost_per_unit * material.stones_per_strand);
        }
        setIsEditing(false);
    };

    const isStone = material.type === MaterialType.Stone;
    const isStrand = material.stones_per_strand !== null && material.stones_per_strand !== undefined;

    // Gender Detection for Visuals
    const detectGender = () => {
        const nameLower = material.name.toLowerCase();
        const variantCodes = Object.keys(material.variant_prices || {});
        
        const menKeywords = ['ανδρ', 'αντρ', 'άντρας'];
        const womenKeywords = ['γυναικ', 'γυναίκα'];

        if (menKeywords.some(kw => nameLower.includes(kw))) return 'men';
        if (womenKeywords.some(kw => nameLower.includes(kw))) return 'women';

        // Code based heuristics
        const hasMenCode = variantCodes.some(vc => ['KR','GSU','RSU','QN','TG','IA','BSU','MA'].includes(vc));
        const hasWomenCode = variantCodes.some(vc => ['BST','PAX','MAX','KAX','PCO','MCO','CO','AP','AM'].includes(vc));
        
        if (hasMenCode && !hasWomenCode) return 'men';
        if (hasWomenCode && !hasMenCode) return 'women';
        return 'neutral';
    };

    const gender = detectGender();

    return (
        <div className={`
            bg-white rounded-2xl border transition-all duration-200 flex flex-col justify-between
            ${isEditing ? 'border-amber-400 shadow-lg ring-4 ring-amber-500/10 z-10' : 'border-slate-100 hover:border-slate-300 hover:shadow-md'}
        `}>
            {/* Header / Main Info */}
            <div className="p-4 space-y-3">
                <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3 w-full">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                            isStone 
                                ? (isStrand ? 'bg-purple-100 text-purple-600' : (gender === 'men' ? 'bg-blue-100 text-blue-600' : (gender === 'women' ? 'bg-pink-100 text-pink-600' : 'bg-emerald-100 text-emerald-600'))) 
                                : 'bg-slate-100 text-slate-500'
                        }`}>
                            {isStone ? <Gem size={20}/> : (material.type === 'Cord' ? <Activity size={20}/> : (material.type === 'Component' ? <Puzzle size={20}/> : <Box size={20}/>))}
                        </div>
                        <div className="flex-1 min-w-0">
                            {isEditing ? (
                                <input 
                                    className="font-bold text-slate-900 border-b border-amber-300 outline-none w-full text-sm"
                                    value={editForm.name}
                                    onChange={e => setEditForm({...editForm, name: e.target.value})}
                                    placeholder="Όνομα Υλικού"
                                    autoFocus
                                />
                            ) : (
                                <h3 className="font-bold text-slate-800 text-sm break-words leading-tight" title={material.name}>{material.name}</h3>
                            )}
                            
                            <div className="flex items-center gap-2 mt-1">
                                {isEditing ? (
                                    <input 
                                        className="text-xs text-slate-500 border-b border-slate-200 outline-none w-full"
                                        value={editForm.description || ''}
                                        onChange={e => setEditForm({...editForm, description: e.target.value})}
                                        placeholder="Περιγραφή..."
                                    />
                                ) : (
                                    <span className="text-xs text-slate-500 max-w-[150px] block min-h-[1rem]">
                                        {/* FIX: Use Greek Map */}
                                        {material.description || MAT_TYPE_MAP[material.type] || material.type}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                    
                    {/* Actions */}
                    {!isEditing && (
                        <button onClick={() => setIsEditing(true)} className="text-slate-300 hover:text-slate-600 p-1 shrink-0">
                            <MoreHorizontal size={18}/>
                        </button>
                    )}
                </div>

                {/* Data Grid */}
                <div className="grid grid-cols-2 gap-3 pt-2">
                    
                    {isStrand ? (
                        /* Smart Strand Inputs */
                        <div className="col-span-2 bg-purple-50 p-2 rounded-lg border border-purple-100 space-y-2">
                            <div className="flex justify-between items-center">
                                <div className="text-[9px] font-bold text-purple-700 uppercase">Τιμη / Σειρα</div>
                                {isEditing ? (
                                    <input 
                                        type="number" step="0.01"
                                        className="w-16 bg-white border border-purple-200 rounded px-1 text-sm font-bold text-purple-800 outline-none text-right"
                                        value={strandPrice}
                                        onChange={e => setStrandPrice(parseFloat(e.target.value) || 0)}
                                    />
                                ) : (
                                    <span className="text-sm font-bold text-purple-800">{formatCurrency(material.cost_per_unit * (material.stones_per_strand || 0))}</span>
                                )}
                            </div>
                            <div className="flex justify-between items-center border-t border-purple-200/50 pt-1">
                                <div className="text-[9px] font-bold text-purple-700 uppercase">Πετρες / Σειρα</div>
                                {isEditing ? (
                                    <input 
                                        type="number"
                                        className="w-16 bg-white border border-purple-200 rounded px-1 text-sm font-bold text-purple-800 outline-none text-right"
                                        value={editForm.stones_per_strand || 0}
                                        onChange={e => setEditForm({...editForm, stones_per_strand: parseInt(e.target.value) || 0})}
                                    />
                                ) : (
                                    <span className="text-xs font-bold text-purple-800">{material.stones_per_strand}</span>
                                )}
                            </div>
                            <div className="text-[9px] text-purple-500 text-right italic mt-1">
                                = {formatCurrency(isEditing ? editForm.cost_per_unit : material.cost_per_unit)} / πέτρα
                            </div>
                        </div>
                    ) : (
                        /* Standard Inputs */
                        <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                            <div className="text-[9px] font-bold text-slate-400 uppercase mb-1">Κοστος Mον.</div>
                            <div className="flex items-center gap-1">
                                {isEditing ? (
                                    <input 
                                        type="number" step="0.001"
                                        className="w-16 bg-white border border-slate-300 rounded px-1 text-sm font-mono font-bold outline-none text-right"
                                        value={editForm.cost_per_unit}
                                        onChange={e => setEditForm({...editForm, cost_per_unit: parseFloat(e.target.value) || 0})}
                                    />
                                ) : (
                                    <span className="text-sm font-mono font-bold text-slate-700">{formatCurrency(material.cost_per_unit)}</span>
                                )}
                                <span className="text-[10px] text-slate-400">
                                    /{isEditing ? (
                                        <input className="w-8 border-b bg-transparent outline-none" value={editForm.unit} onChange={e => setEditForm({...editForm, unit: e.target.value})}/>
                                    ) : material.unit}
                                </span>
                            </div>
                        </div>
                    )}

                    {!isStrand && (
                        <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                            <div className="text-[9px] font-bold text-slate-400 uppercase mb-1">Αποθεμα</div>
                            <div className="flex items-center gap-1">
                                <Package size={12} className="text-slate-400"/>
                                {isEditing ? (
                                    <input 
                                        type="number"
                                        className="w-16 bg-white border border-slate-300 rounded px-1 text-sm font-bold outline-none"
                                        value={editForm.stock_qty}
                                        onChange={e => setEditForm({...editForm, stock_qty: parseInt(e.target.value) || 0})}
                                    />
                                ) : (
                                    <span className={`text-sm font-bold ${material.stock_qty <= 5 ? 'text-amber-600' : 'text-slate-700'}`}>
                                        {material.stock_qty}
                                    </span>
                                )}
                            </div>
                        </div>
                    )}
                    
                    <div className="col-span-2">
                        {isEditing ? (
                            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg p-1.5">
                                <Globe size={14} className="text-slate-400"/>
                                <select 
                                    className="w-full text-xs outline-none bg-transparent"
                                    value={editForm.supplier_id || ''}
                                    onChange={e => setEditForm({...editForm, supplier_id: e.target.value || null})}
                                >
                                    <option value="">Επιλογή Προμηθευτή...</option>
                                    {suppliers?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                            </div>
                        ) : (
                             <div className="flex items-center gap-2 px-1">
                                <Globe size={12} className="text-slate-300"/>
                                <span className="text-xs text-slate-500 truncate">
                                    {suppliers?.find(s => s.id === material.supplier_id)?.name || 'N/A'}
                                </span>
                             </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Footer Actions */}
            <div className="p-3 border-t border-slate-50 bg-slate-50/50 rounded-b-2xl flex justify-between items-center min-h-[56px]">
                {isEditing ? (
                    <div className="flex gap-2 w-full">
                        <button onClick={handleCancel} className="flex-1 py-1.5 text-xs font-bold text-slate-500 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"><X size={14} className="mx-auto"/></button>
                        <button onClick={handleSave} className="flex-[2] py-1.5 text-xs font-bold text-white bg-slate-900 rounded-lg hover:bg-black flex items-center justify-center gap-2"><Check size={14}/> Αποθήκευση</button>
                        <button onClick={() => onDelete(material.id)} className="p-2 text-red-500 bg-red-50 rounded-lg hover:bg-red-100 border border-red-100"><Trash2 size={14}/></button>
                    </div>
                ) : (
                    <>
                        <button onClick={() => onEditVariants(material)} className="text-xs font-bold text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1">
                            {(Object.keys(material.variant_prices || {}).length > 0) ? (
                                <><span className="bg-blue-100 px-1.5 rounded text-[9px]">{Object.keys(material.variant_prices || {}).length}</span> Ειδικές Τιμές</>
                            ) : '+ Ειδικές Τιμές'}
                        </button>
                    </>
                )}
            </div>
        </div>
    );
};

export default function MaterialsPage({ settings }: Props) {
  const queryClient = useQueryClient();
  const { showToast, confirm } = useUI();
  
  const { data: materials, isLoading } = useQuery({ queryKey: ['materials'], queryFn: api.getMaterials });
  const { data: suppliers } = useQuery({ queryKey: ['suppliers'], queryFn: api.getSuppliers });

  // State
  const [activeTab, setActiveTab] = useState<MaterialType>(MaterialType.Stone);
  const [stoneSubFilter, setStoneSubFilter] = useState<StoneSubFilter>('standard');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modals
  const [isVariantModalOpen, setIsVariantModalOpen] = useState(false);
  const [activeMaterialForVariants, setActiveMaterialForVariants] = useState<Material | null>(null);
  const [variantPrices, setVariantPrices] = useState<{code: string, price: number}[]>([]);

  // Filtering Logic
  const filteredMaterials = useMemo(() => {
      if (!materials) return [];
      
      const filtered = materials.filter(m => {
          // 1. Main Type Filter
          if (m.type !== activeTab) return false;

          // 2. Stone Sub-Filter
          if (activeTab === MaterialType.Stone) {
              const hasStrandData = m.stones_per_strand !== null && m.stones_per_strand !== undefined;
              if (stoneSubFilter === 'strand') {
                  // Must be explicitly a strand type
                  if (!hasStrandData) return false;
              } else {
                  // Standard: Must NOT be strand
                  if (hasStrandData) return false;
              }
          }

          // 3. Search
          if (searchTerm) {
              return m.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                     m.description?.toLowerCase().includes(searchTerm.toLowerCase());
          }
          
          return true;
      });

      // Sort: Newest first (assuming higher IDs are newer or based on name)
      return filtered.sort((a, b) => a.name.localeCompare(b.name));
  }, [materials, activeTab, stoneSubFilter, searchTerm]);

  // Statistics
  const stats = useMemo(() => {
      const count = filteredMaterials.length;
      const totalValue = filteredMaterials.reduce((acc, m) => acc + (m.stock_qty || 0) * m.cost_per_unit, 0);
      return { count, totalValue };
  }, [filteredMaterials]);

  // Actions
  const handleCreate = async () => {
      const isStrand = activeTab === MaterialType.Stone && stoneSubFilter === 'strand';
      
      const newMat: Partial<Material> = {
          name: isStrand ? 'Νέο Κορδόνι' : `Νέο ${MAT_TYPE_MAP[activeTab]}`,
          type: activeTab,
          cost_per_unit: 0,
          unit: 'Τεμ',
          variant_prices: {},
          stock_qty: 0,
          // CRITICAL: Set stones_per_strand to 1 (not 0) if Strand mode, null otherwise. 
          // This ensures database sees a value and not NULL/Falsy issues.
          stones_per_strand: isStrand ? 1 : null 
      };

      try {
          const { data } = await api.saveMaterial(newMat as Material);
          queryClient.invalidateQueries({ queryKey: ['materials'] });
          showToast('Δημιουργήθηκε επιτυχώς. Συμπληρώστε τα στοιχεία.', 'success');
      } catch (e) {
          showToast("Σφάλμα δημιουργίας.", 'error');
      }
  };

  const handleUpdate = async (m: Material) => {
      try {
          await api.saveMaterial(m);
          queryClient.invalidateQueries({ queryKey: ['materials'] });
          showToast("Αποθηκεύτηκε.", 'success');
      } catch (e) {
          showToast("Σφάλμα αποθήκευσης.", 'error');
      }
  };

  const handleDelete = async (id: string) => {
      if (await confirm({ title: 'Διαγραφή', message: 'Είστε σίγουροι;', isDestructive: true })) {
          try {
              await supabase.from('materials').delete().eq('id', id);
              queryClient.invalidateQueries({ queryKey: ['materials'] });
              showToast("Διαγράφηκε.", 'info');
          } catch (e) {
              showToast("Σφάλμα.", 'error');
          }
      }
  };

  const handleEditVariants = (m: Material) => {
      setActiveMaterialForVariants(m);
      const vars = m.variant_prices ? Object.entries(m.variant_prices).map(([code, price]) => ({ code, price })) : [];
      setVariantPrices(vars);
      setIsVariantModalOpen(true);
  };

  const saveVariantPrices = async () => {
      if (!activeMaterialForVariants) return;
      const pricesObj: Record<string, number> = {};
      variantPrices.forEach(vp => {
          if (vp.code && vp.price > 0) pricesObj[vp.code.toUpperCase()] = parseFloat(vp.price.toString());
      });
      
      try {
          await supabase.from('materials').update({ variant_prices: pricesObj }).eq('id', activeMaterialForVariants.id);
          queryClient.invalidateQueries({ queryKey: ['materials'] });
          setIsVariantModalOpen(false);
          showToast("Ειδικές τιμές αποθηκεύτηκαν.", 'success');
      } catch (e) {
          showToast("Σφάλμα.", 'error');
      }
  };

  if (isLoading) return <div className="flex justify-center p-20"><Loader2 className="animate-spin text-amber-500"/></div>;

  const TABS = [
      { id: MaterialType.Stone, label: 'Πέτρες', icon: Gem, color: 'text-purple-600', bg: 'bg-purple-50' },
      { id: MaterialType.Component, label: 'Εξαρτήματα', icon: Puzzle, color: 'text-blue-600', bg: 'bg-blue-50' },
      { id: MaterialType.Cord, label: 'Κορδόνια', icon: Activity, color: 'text-amber-600', bg: 'bg-amber-50' },
      { id: MaterialType.Leather, label: 'Δέρματα', icon: Scroll, color: 'text-orange-700', bg: 'bg-orange-50' },
      { id: MaterialType.Enamel, label: 'Σμάλτα', icon: Palette, color: 'text-rose-500', bg: 'bg-rose-50' },
  ];

  return (
    <div className="space-y-6 h-full flex flex-col">
        {/* HEADER & TABS */}
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm shrink-0">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
                        <div className="p-2 bg-slate-900 text-white rounded-xl"><Gem size={24} /></div>
                        Αποθήκη Υλικών
                    </h1>
                    <p className="text-slate-500 mt-1 ml-14 font-medium">Διαχείριση πρώτων υλών & εξαρτημάτων.</p>
                </div>
                <div className="text-right">
                     <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Αξια Αποθηκης</div>
                     <div className="text-2xl font-black text-emerald-600">{formatCurrency(stats.totalValue)}</div>
                </div>
            </div>

            <div className="flex gap-2 bg-slate-50 p-1.5 rounded-2xl overflow-x-auto">
                {TABS.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => { setActiveTab(tab.id as MaterialType); }}
                        className={`
                            flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm transition-all whitespace-nowrap
                            ${activeTab === tab.id 
                                ? 'bg-white text-slate-900 shadow-md ring-1 ring-slate-100' 
                                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200'}
                        `}
                    >
                        <tab.icon size={18} className={activeTab === tab.id ? tab.color : 'text-slate-400'}/>
                        {tab.label}
                    </button>
                ))}
            </div>
        </div>

        {/* CONTROLS & CONTENT */}
        <div className="flex-1 min-h-0 flex flex-col">
            <div className="flex items-center justify-between mb-4 shrink-0 px-2">
                <div className="flex items-center gap-4">
                    {/* SUB-FILTER FOR STONES */}
                    {activeTab === MaterialType.Stone && (
                        <div className="bg-white border border-slate-200 p-1 rounded-xl flex shadow-sm">
                            <button 
                                onClick={() => setStoneSubFilter('standard')}
                                className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all ${stoneSubFilter === 'standard' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Συμβατικές
                            </button>
                            <button 
                                onClick={() => setStoneSubFilter('strand')}
                                className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all ${stoneSubFilter === 'strand' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Κορδόνι
                            </button>
                        </div>
                    )}
                    
                    <div className="bg-white border border-slate-200 p-1 rounded-xl flex items-center shadow-sm w-64">
                         <Search size={16} className="ml-3 text-slate-400"/>
                         <input 
                            placeholder="Αναζήτηση..." 
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full bg-transparent p-1.5 pl-2 text-sm font-bold outline-none text-slate-700"
                         />
                         {searchTerm && <button onClick={() => setSearchTerm('')} className="mr-2 text-slate-400 hover:text-slate-600"><X size={14}/></button>}
                    </div>
                </div>

                <button 
                    onClick={handleCreate}
                    className="bg-[#060b00] text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg hover:bg-slate-800 transition-all hover:-translate-y-0.5"
                >
                    <Plus size={18}/> Νέο Υλικό
                </button>
            </div>

            {/* GRID */}
            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                {filteredMaterials.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-20">
                        {filteredMaterials.map(material => (
                            <MaterialCard 
                                key={material.id}
                                material={material}
                                suppliers={suppliers || []}
                                onSave={handleUpdate}
                                onDelete={handleDelete}
                                onEditVariants={handleEditVariants}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                        <Box size={48} className="mb-4 opacity-20"/>
                        <p className="font-bold">Δεν βρέθηκαν υλικά.</p>
                        <p className="text-sm">Δοκιμάστε άλλη κατηγορία ή προσθέστε νέο.</p>
                    </div>
                )}
            </div>
        </div>

        {/* VARIANT PRICING MODAL */}
        {isVariantModalOpen && activeMaterialForVariants && (
             <div className="fixed inset-0 z-[150] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
                 <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl p-6 animate-in zoom-in-95 border border-slate-100">
                      <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-100">
                          <div>
                              <h3 className="text-lg font-black text-slate-800">Ειδικές Τιμές</h3>
                              <p className="text-xs text-slate-500 font-bold">{activeMaterialForVariants.name}</p>
                          </div>
                          <button onClick={() => setIsVariantModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
                      </div>
                      
                      <div className="space-y-2 mb-4 max-h-64 overflow-y-auto custom-scrollbar pr-1">
                          {variantPrices.map((vp, idx) => (
                              <div key={idx} className="flex gap-2 items-center bg-slate-50 p-2 rounded-xl border border-slate-100">
                                  <input 
                                      placeholder="Κωδικός (π.χ. LA)" 
                                      value={vp.code} 
                                      onChange={e => {
                                        const code = e.target.value.toUpperCase();
                                        const updated = [...variantPrices];
                                        updated[idx] = { ...updated[idx], code };
                                        setVariantPrices(updated);
                                      }}
                                      className="flex-1 p-2 bg-white border border-slate-200 rounded-lg uppercase font-mono text-sm font-bold outline-none focus:border-blue-500"
                                  />
                                  <div className="relative w-24">
                                      <input 
                                          type="number" step="0.01" 
                                          value={vp.price} 
                                          onChange={e => {
                                            const price = parseFloat(e.target.value);
                                            const updated = [...variantPrices];
                                            updated[idx] = { ...updated[idx], price };
                                            setVariantPrices(updated);
                                          }}
                                          className="w-full p-2 pr-6 bg-white border border-slate-200 rounded-lg font-bold text-sm text-right outline-none focus:border-blue-500"
                                      />
                                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">€</span>
                                  </div>
                                  <button onClick={() => setVariantPrices(variantPrices.filter((_, i) => i !== idx))} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={16}/></button>
                              </div>
                          ))}
                          {variantPrices.length === 0 && <p className="text-sm text-slate-400 italic text-center py-6">Δεν υπάρχουν ειδικές τιμές.</p>}
                      </div>
                      
                      <div className="flex gap-3">
                          <button onClick={() => setVariantPrices([...variantPrices, { code: '', price: 0 }])} className="flex-1 py-3 border-2 border-dashed border-slate-200 rounded-xl text-sm font-bold text-slate-500 hover:border-slate-300 hover:bg-slate-50 transition-colors flex items-center justify-center gap-2">
                              <Plus size={16}/> Προσθήκη
                          </button>
                          <button onClick={saveVariantPrices} className="flex-[2] bg-slate-900 text-white py-3 rounded-xl text-sm font-bold hover:bg-black transition-colors shadow-lg">
                              Αποθήκευση
                          </button>
                      </div>
                 </div>
             </div>
        )}
    </div>
  );
}
