import React, { useState } from 'react';
import { Mold } from '../types';
import { Trash2, Plus, Save, MapPin, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Props {
  molds: Mold[];
  setMolds: React.Dispatch<React.SetStateAction<Mold[]>>;
}

export default function MoldsPage({ molds, setMolds }: Props) {
  const [newMold, setNewMold] = useState<Mold>({ code: '', location: '', description: '' });
  const [deleteCode, setDeleteCode] = useState<string | null>(null);

  const handleCreate = async () => {
      if (!newMold.code) return alert("Ο Κωδικός είναι υποχρεωτικός.");

      try {
          const { error } = await supabase.from('molds').insert(newMold);
          if (error) throw error;
          
          setMolds([...molds, newMold]);
          setNewMold({ code: '', location: '', description: '' });
          alert("Το λάστιχο προστέθηκε.");
      } catch(e) {
          console.error(e);
          alert("Σφάλμα. Πιθανώς ο κωδικός υπάρχει ήδη.");
      }
  };

  const confirmDelete = async () => {
      if (!deleteCode) return;
      try {
          const { error } = await supabase.from('molds').delete().eq('code', deleteCode);
          if (error) throw error;
          setMolds(molds.filter(m => m.code !== deleteCode));
          setDeleteCode(null);
      } catch(e) {
          console.error(e);
          alert("Σφάλμα κατά τη διαγραφή.");
      }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 relative">

      {/* Custom Delete Modal */}
      {deleteCode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <div className="p-3 bg-red-100 rounded-full">
                <AlertTriangle size={24} />
              </div>
              <h3 className="text-lg font-bold">Διαγραφή Λάστιχου</h3>
            </div>
            <p className="text-slate-600 mb-6">
              Είστε σίγουροι ότι θέλετε να διαγράψετε το λάστιχο <strong>{deleteCode}</strong>; 
            </p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setDeleteCode(null)}
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
            <MapPin className="text-amber-600" />
            Διαχείριση Λάστιχων
        </h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Add Form */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 h-fit sticky top-6">
              <h3 className="font-bold text-slate-700 mb-4 border-b pb-2">Προσθήκη Νέου</h3>
              <div className="space-y-4">
                  <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Κωδικός (Code)</label>
                      <input 
                        type="text" 
                        value={newMold.code}
                        onChange={e => setNewMold({...newMold, code: e.target.value})}
                        placeholder="π.χ. A-12"
                        className="w-full p-2 border border-slate-300 rounded bg-white text-slate-900 uppercase font-mono"
                      />
                  </div>
                  <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Τοποθεσία / Συρτάρι</label>
                      <input 
                        type="text" 
                        value={newMold.location}
                        onChange={e => setNewMold({...newMold, location: e.target.value})}
                        placeholder="π.χ. Συρτάρι 1"
                        className="w-full p-2 border border-slate-300 rounded bg-white text-slate-900"
                      />
                  </div>
                  <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Περιγραφή</label>
                      <input 
                        type="text" 
                        value={newMold.description}
                        onChange={e => setNewMold({...newMold, description: e.target.value})}
                        placeholder="π.χ. Κορμός δαχτυλιδιού"
                        className="w-full p-2 border border-slate-300 rounded bg-white text-slate-900"
                      />
                  </div>
                  <button 
                    onClick={handleCreate}
                    className="w-full bg-slate-900 text-white py-2 rounded-lg font-medium hover:bg-slate-800 flex items-center justify-center gap-2"
                  >
                      <Plus size={18} /> Προσθήκη
                  </button>
              </div>
          </div>

          {/* List */}
          <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
             <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-500 font-medium uppercase text-xs">
                   <tr>
                       <th className="p-3">Κωδικός</th>
                       <th className="p-3">Τοποθεσία</th>
                       <th className="p-3">Περιγραφή</th>
                       <th className="p-3 w-10"></th>
                   </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {molds.map(m => (
                        <tr key={m.code} className="hover:bg-slate-50">
                            <td className="p-3 font-mono font-bold text-slate-800">{m.code}</td>
                            <td className="p-3 text-slate-600">{m.location}</td>
                            <td className="p-3 text-slate-600">{m.description}</td>
                            <td className="p-3">
                                <button onClick={() => setDeleteCode(m.code)} className="p-2 text-slate-400 hover:text-red-500 rounded">
                                    <Trash2 size={16} />
                                </button>
                            </td>
                        </tr>
                    ))}
                    {molds.length === 0 && (
                        <tr><td colSpan={4} className="p-8 text-center text-slate-400">Κανένα λάστιχο.</td></tr>
                    )}
                </tbody>
             </table>
          </div>
      </div>
    </div>
  );
}