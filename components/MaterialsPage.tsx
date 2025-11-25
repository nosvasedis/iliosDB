import React, { useState } from 'react';
import { Material, MaterialType } from '../types';
import { Trash2, Plus, Save, Loader2, Gem, AlertTriangle, X } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Props {
  materials: Material[];
  setMaterials: React.Dispatch<React.SetStateAction<Material[]>>;
}

const MAT_TYPE_MAP: Record<MaterialType, string> = {
    [MaterialType.Stone]: 'Πέτρα',
    [MaterialType.Cord]: 'Κορδόνι',
    [MaterialType.Chain]: 'Αλυσίδα',
    [MaterialType.Component]: 'Εξάρτημα'
};

export default function MaterialsPage({ materials, setMaterials }: Props) {
  const [isSaving, setIsSaving] = useState(false);
  // State for Custom Delete Modal
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handleAddMaterial = async () => {
    // Optimistic UI update
    const newMat: Material = {
      id: `temp-${Date.now()}`, // Temporary ID
      name: 'Νέο Υλικό',
      type: MaterialType.Component,
      cost_per_unit: 0,
      unit: 'Τεμ'
    };
    
    try {
        const { data, error } = await supabase.from('materials').insert({
            name: newMat.name,
            type: newMat.type,
            cost_per_unit: newMat.cost_per_unit,
            unit: newMat.unit
        }).select().single();

        if (error) throw error;
        if (data) {
             const created: Material = {
                 id: data.id,
                 name: data.name,
                 type: data.type as MaterialType,
                 cost_per_unit: data.cost_per_unit,
                 unit: data.unit
             };
             setMaterials([...materials, created]);
        }
    } catch(e) {
        console.error("Error creating material:", e);
        alert("Σφάλμα κατά τη δημιουργία.");
    }
  };

  const updateMaterial = (id: string, field: keyof Material, value: any) => {
    setMaterials(materials.map(m => m.id === id ? { ...m, [field]: value } : m));
  };

  const handleSaveRow = async (material: Material) => {
      try {
          const { error } = await supabase.from('materials').update({
              name: material.name,
              type: material.type,
              cost_per_unit: material.cost_per_unit,
              unit: material.unit
          }).eq('id', material.id);

          if (error) throw error;
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
        setMaterials(materials.filter(m => m.id !== deleteId));
        setDeleteId(null); // Close modal
    } catch(e) {
        console.error("Error deleting material:", e);
        alert("Σφάλμα διαγραφής. Το υλικό μπορεί να χρησιμοποιείται σε συνταγές.");
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 relative">
      
      {/* Custom Delete Modal */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <div className="p-3 bg-red-100 rounded-full">
                <AlertTriangle size={24} />
              </div>
              <h3 className="text-lg font-bold">Διαγραφή Υλικού</h3>
            </div>
            <p className="text-slate-600 mb-6">
              Είστε σίγουροι ότι θέλετε να διαγράψετε αυτό το υλικό; Η ενέργεια δεν μπορεί να αναιρεθεί.
            </p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setDeleteId(null)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium"
              >
                Ακύρωση
              </button>
              <button 
                onClick={confirmDelete}
                className="px-4 py-2 bg-red-600 text-white hover:bg-red-700 rounded-lg font-medium"
              >
                Διαγραφή
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Gem className="text-purple-600" />
            Διαχείριση Υλικών
        </h1>
        <button 
            onClick={handleAddMaterial} 
            className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg hover:bg-slate-800 font-medium transition-colors"
        >
            <Plus size={18} /> Νέο Υλικό
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 font-medium uppercase text-xs">
              <tr>
                <th className="p-4 rounded-tl-lg">Όνομα</th>
                <th className="p-4">Τύπος</th>
                <th className="p-4">Κόστος (€)</th>
                <th className="p-4">Μονάδα</th>
                <th className="p-4 text-center">Ενέργειες</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {materials.map(m => (
                <tr key={m.id} className="hover:bg-slate-50 group">
                  <td className="p-3">
                    <input 
                        type="text" 
                        value={m.name} 
                        onChange={(e) => updateMaterial(m.id, 'name', e.target.value)}
                        className="w-full bg-white border border-transparent hover:border-slate-200 focus:border-amber-500 rounded p-2 font-medium text-slate-800 outline-none transition-all"
                    />
                  </td>
                  <td className="p-3">
                    <select 
                        value={m.type}
                        onChange={(e) => updateMaterial(m.id, 'type', e.target.value)}
                        className="bg-white border border-transparent hover:border-slate-200 focus:border-amber-500 rounded p-2 text-slate-600 outline-none w-full"
                    >
                        {Object.values(MaterialType).map(t => <option key={t} value={t}>{MAT_TYPE_MAP[t]}</option>)}
                    </select>
                  </td>
                  <td className="p-3">
                    <input 
                        type="number" step="0.001"
                        value={m.cost_per_unit} 
                        onChange={(e) => updateMaterial(m.id, 'cost_per_unit', parseFloat(e.target.value))}
                        className="w-32 bg-white border border-transparent hover:border-slate-200 focus:border-amber-500 rounded p-2 text-right text-slate-900 font-mono outline-none"
                    />
                  </td>
                  <td className="p-3 text-slate-500">
                     <input 
                        type="text" 
                        value={m.unit} 
                        onChange={(e) => updateMaterial(m.id, 'unit', e.target.value)}
                        className="w-16 bg-white border border-transparent hover:border-slate-200 focus:border-amber-500 rounded p-2 text-center text-slate-600 outline-none"
                    />
                  </td>
                  <td className="p-3 flex justify-center gap-2">
                    <button 
                        onClick={() => handleSaveRow(m)}
                        title="Αποθήκευση αλλαγών"
                        className="p-2 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
                    >
                        <Save size={18} />
                    </button>
                    <button 
                        onClick={() => setDeleteId(m.id)} 
                        title="Διαγραφή"
                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                    >
                        <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              ))}
              {materials.length === 0 && (
                  <tr><td colSpan={5} className="p-8 text-center text-slate-400 italic">Δεν υπάρχουν υλικά. Προσθέστε το πρώτο σας υλικό.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}