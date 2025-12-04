

import React, { useState } from 'react';
import { Material, MaterialType, GlobalSettings } from '../types';
import { Trash2, Plus, Save, Loader2, Gem, AlertTriangle, X, Box, Coins, Link, Activity, Puzzle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { api } from '../lib/supabase';
import { useUI } from './UIProvider';
import { formatDecimal } from '../utils/pricingEngine';

const MAT_TYPE_MAP: Record<MaterialType, string> = {
    [MaterialType.Stone]: 'Πέτρα',
    [MaterialType.Cord]: 'Κορδόνι',
    [MaterialType.Chain]: 'Αλυσίδα',
    [MaterialType.Component]: 'Εξάρτημα'
};

interface Props {
    settings: GlobalSettings;
}

export default function MaterialsPage({ settings }: Props) {
  const queryClient = useQueryClient();
  const { showToast, confirm } = useUI();
  const { data: materials, isLoading } = useQuery({ queryKey: ['materials'], queryFn: api.getMaterials });

  const [editableMaterials, setEditableMaterials] = useState<Material[]>([]);

  React.useEffect(() => {
    if (materials) {
      setEditableMaterials(JSON.parse(JSON.stringify(materials)));
    }
  }, [materials]);

  const handleAddMaterial = async () => {
    try {
        const { error } = await supabase.from('materials').insert({
            name: 'Νέο Υλικό', type: MaterialType.Component, cost_per_unit: 0, unit: 'Τεμ'
        });
        if (error) throw error;
        queryClient.invalidateQueries({ queryKey: ['materials'] });
        showToast('Το υλικό δημιουργήθηκε.', 'success');
    } catch(e) {
        console.error("Error creating material:", e);
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
          console.error("Error saving material:", e);
          showToast("Σφάλμα αποθήκευσης.", 'error');
      }
  };

  const handleDelete = async (id: string) => {
    const yes = await confirm({
        title: 'Διαγραφή Υλικού',
        message: 'Είστε σίγουροι ότι θέλετε να διαγράψετε αυτό το υλικό; Η ενέργεια δεν μπορεί να αναιρεθεί.',
        isDestructive: true,
        confirmText: 'Διαγραφή'
    });
    
    if (!yes) return;
    
    try {
        const { error } = await supabase.from('materials').delete().eq('id', id);
        if (error) throw error;
        queryClient.invalidateQueries({ queryKey: ['materials'] });
        showToast("Το υλικό διαγράφηκε.", 'info');
    } catch(e) {
        console.error("Error deleting material:", e);
        showToast("Σφάλμα διαγραφής. Το υλικό μπορεί να χρησιμοποιείται σε συνταγές.", 'error');
    }
  };

  const getMaterialIcon = (type: MaterialType) => {
      switch (type) {
          case MaterialType.Stone: return <Gem size={16} className="text-emerald-500" />;
          case MaterialType.Cord: return <Activity size={16} className="text-amber-600" />;
          case MaterialType.Chain: return <Link size={16} className="text-slate-500" />;
          case MaterialType.Component: return <Puzzle size={16} className="text-blue-500" />;
          default: return <Box size={16} className="text-slate-400" />;
      }
  };

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
            <Plus size={20} /> Νέο Υλικό
        </button>
      </div>

      <div className="bg-gradient-to-br from-slate-800 to-slate-900 text-white p-6 rounded-3xl shadow-lg border border-slate-700 flex flex-col md:flex-row justify-between items-start gap-4">
          <div>
              <div className="flex items-center gap-3">
                  <div className="bg-white/10 p-2 rounded-lg">
                      <Coins size={20} />
                  </div>
                  <h2 className="font-bold text-lg">Βασική Πρώτη Ύλη: Ασήμι 925</h2>
              </div>
              <p className="text-sm text-slate-300 mt-2 max-w-md">
                  Το ασήμι δεν προστίθεται χειροκίνητα. Το κόστος του υπολογίζεται αυτόματα σε κάθε προϊόν βάσει του βάρους του και της τρέχουσας τιμής αγοράς.
              </p>
          </div>
          <div className="bg-white/5 p-4 rounded-xl text-center border border-white/10 w-full md:w-auto mt-2 md:mt-0">
              <span className="text-xs font-bold uppercase text-slate-400 tracking-wider">Τρεχουσα Τιμη</span>
              <div className="font-mono font-black text-3xl text-amber-400 mt-1">
                  {formatDecimal(settings.silver_price_gram, 3)}€<span className="text-lg text-slate-400">/g</span>
              </div>
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
              {editableMaterials.map((m, idx) => (
                <tr key={m.id} className="hover:bg-slate-50/80 transition-colors group">
                  <td className="p-4 text-center text-slate-400 font-mono text-xs">{idx + 1}</td>
                  <td className="p-4">
                      <input 
                        type="text" 
                        value={m.name} 
                        onChange={(e) => updateMaterial(m.id, 'name', e.target.value)} 
                        className="w-full bg-transparent border-b border-transparent hover:border-slate-300 focus:border-amber-500 py-1 font-bold text-slate-800 outline-none transition-all placeholder-slate-300"
                      />
                  </td>
                  <td className="p-4">
                    <div className="relative flex items-center gap-2">
                        {getMaterialIcon(m.type)}
                        <select 
                            value={m.type} 
                            onChange={(e) => updateMaterial(m.id, 'type', e.target.value)} 
                            className="bg-transparent border-b border-transparent hover:border-slate-300 focus:border-amber-500 py-1 text-slate-600 outline-none w-full appearance-none font-medium cursor-pointer"
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
                        className="w-24 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-amber-500 py-1 text-right text-slate-900 font-mono font-bold outline-none"
                      />
                  </td>
                  <td className="p-4 text-center">
                      <input 
                        type="text" 
                        value={m.unit} 
                        onChange={(e) => updateMaterial(m.id, 'unit', e.target.value)} 
                        className="w-16 bg-slate-100 rounded py-1 text-center text-slate-500 text-xs font-bold outline-none focus:ring-2 focus:ring-amber-500/20"
                      />
                  </td>
                  <td className="p-4">
                    <div className="flex justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => handleSaveRow(m.id)} title="Αποθήκευση" className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"><Save size={18} /></button>
                        <button onClick={() => handleDelete(m.id)} title="Διαγραφή" className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={18} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {materials && materials.length === 0 && (
                <tr><td colSpan={6} className="p-16 text-center text-slate-400 flex flex-col items-center"><Box className="mb-2 opacity-50" size={32}/><span>Δεν υπάρχουν υλικά. Προσθέστε το πρώτο σας υλικό.</span></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
