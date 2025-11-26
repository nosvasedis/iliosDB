import React, { useState } from 'react';
import { Material, MaterialType } from '../types';
import { Trash2, Plus, Save, Loader2, Gem, AlertTriangle, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { api } from '../lib/supabase';

const MAT_TYPE_MAP: Record<MaterialType, string> = {
    [MaterialType.Stone]: 'Πέτρα',
    [MaterialType.Cord]: 'Κορδόνι',
    [MaterialType.Chain]: 'Αλυσίδα',
    [MaterialType.Component]: 'Εξάρτημα'
};

export default function MaterialsPage() {
  const queryClient = useQueryClient();
  const { data: materials, isLoading } = useQuery({ queryKey: ['materials'], queryFn: api.getMaterials });

  const [editableMaterials, setEditableMaterials] = useState<Material[]>([]);
  const [deleteId, setDeleteId] = useState<string | null>(null);

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
    } catch(e) {
        console.error("Error creating material:", e);
        alert("Σφάλμα κατά τη δημιουργία.");
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
          alert("Επιτυχής αποθήκευση!");
      } catch(e) {
          console.error("Error saving material:", e);
          alert("Σφάλμα αποθήκευσης.");
      }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    
    try {
        const { error } = await supabase.from('materials').delete().eq('id', deleteId);
        if (error) throw error;
        queryClient.invalidateQueries({ queryKey: ['materials'] });
        setDeleteId(null);
    } catch(e) {
        console.error("Error deleting material:", e);
        alert("Σφάλμα διαγραφής. Το υλικό μπορεί να χρησιμοποιείται σε συνταγές.");
    }
  };

  if (isLoading) return <div className="flex justify-center items-center"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="max-w-6xl mx-auto space-y-6 relative">
      
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-red-600 mb-4"><div className="p-3 bg-red-100 rounded-full"><AlertTriangle size={24} /></div><h3 className="text-lg font-bold">Διαγραφή Υλικού</h3></div>
            <p className="text-slate-600 mb-6">Είστε σίγουροι ότι θέλετε να διαγράψετε αυτό το υλικό; Η ενέργεια δεν μπορεί να αναιρεθεί.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteId(null)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium">Ακύρωση</button>
              <button onClick={confirmDelete} className="px-4 py-2 bg-red-600 text-white hover:bg-red-700 rounded-lg font-medium">Διαγραφή</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><Gem className="text-purple-600" />Διαχείριση Υλικών</h1>
        <button onClick={handleAddMaterial} className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg hover:bg-slate-800 font-medium transition-colors"><Plus size={18} /> Νέο Υλικό</button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 font-medium uppercase text-xs">
              <tr><th className="p-4">Όνομα</th><th className="p-4">Τύπος</th><th className="p-4">Κόστος (€)</th><th className="p-4">Μονάδα</th><th className="p-4 text-center">Ενέργειες</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {editableMaterials.map(m => (
                <tr key={m.id} className="hover:bg-slate-50 group">
                  <td className="p-3"><input type="text" value={m.name} onChange={(e) => updateMaterial(m.id, 'name', e.target.value)} className="w-full bg-transparent border border-transparent hover:border-slate-200 focus:border-amber-500 rounded p-2 font-medium text-slate-800 outline-none transition-all"/></td>
                  <td className="p-3">
                    <select value={m.type} onChange={(e) => updateMaterial(m.id, 'type', e.target.value)} className="bg-transparent border border-transparent hover:border-slate-200 focus:border-amber-500 rounded p-2 text-slate-600 outline-none w-full appearance-none">
                        {Object.values(MaterialType).map(t => <option key={t} value={t}>{MAT_TYPE_MAP[t]}</option>)}
                    </select>
                  </td>
                  <td className="p-3"><input type="number" step="0.001" value={m.cost_per_unit} onChange={(e) => updateMaterial(m.id, 'cost_per_unit', parseFloat(e.target.value))} className="w-32 bg-transparent border border-transparent hover:border-slate-200 focus:border-amber-500 rounded p-2 text-right text-slate-900 font-mono outline-none"/></td>
                  <td className="p-3 text-slate-500"><input type="text" value={m.unit} onChange={(e) => updateMaterial(m.id, 'unit', e.target.value)} className="w-20 bg-transparent border border-transparent hover:border-slate-200 focus:border-amber-500 rounded p-2 text-center text-slate-600 outline-none"/></td>
                  <td className="p-3 flex justify-center gap-2">
                    <button onClick={() => handleSaveRow(m.id)} title="Αποθήκευση αλλαγών" className="p-2 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded transition-colors"><Save size={18} /></button>
                    <button onClick={() => setDeleteId(m.id)} title="Διαγραφή" className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"><Trash2 size={18} /></button>
                  </td>
                </tr>
              ))}
              {materials && materials.length === 0 && (<tr><td colSpan={5} className="p-8 text-center text-slate-400 italic">Δεν υπάρχουν υλικά. Προσθέστε το πρώτο σας υλικό.</td></tr>)}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}