import React, { useState } from 'react';
import { Mold } from '../types';
import { Trash2, Plus, Save, MapPin, AlertTriangle, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { api } from '../lib/supabase';

export default function MoldsPage() {
  const queryClient = useQueryClient();
  const { data: molds, isLoading } = useQuery<Mold[]>({ queryKey: ['molds'], queryFn: api.getMolds });

  const [editableMolds, setEditableMolds] = useState<Mold[]>([]);
  const [newMold, setNewMold] = useState<Mold>({ code: '', location: '', description: '' });
  const [deleteCode, setDeleteCode] = useState<string | null>(null);

  React.useEffect(() => {
    if (molds) {
      setEditableMolds(JSON.parse(JSON.stringify(molds)));
    }
  }, [molds]);

  const handleCreate = async () => {
      if (!newMold.code) return alert("Ο Κωδικός είναι υποχρεωτικός.");

      try {
          const { error } = await supabase.from('molds').insert(newMold);
          if (error) throw error;
          
          queryClient.invalidateQueries({ queryKey: ['molds'] });
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
          queryClient.invalidateQueries({ queryKey: ['molds'] });
          setDeleteCode(null);
      } catch(e) {
          console.error(e);
          alert("Σφάλμα κατά τη διαγραφή.");
      }
  };

  const updateMold = (code: string, field: keyof Mold, value: string) => {
    setEditableMolds(editableMolds.map(m => m.code === code ? { ...m, [field]: value } : m));
  };

  const handleSaveRow = async (code: string) => {
    const moldToSave = editableMolds.find(m => m.code === code);
    if (!moldToSave) return;
    try {
      const { error } = await supabase.from('molds').update({
        location: moldToSave.location,
        description: moldToSave.description
      }).eq('code', moldToSave.code);

      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['molds'] });
      alert(`Το λάστιχο ${moldToSave.code} αποθηκεύτηκε.`);
    } catch(e) {
      console.error("Error saving mold:", e);
      alert("Σφάλμα αποθήκευσης.");
    }
  };

  if (isLoading) return <div className="flex justify-center items-center"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="max-w-5xl mx-auto space-y-6 relative">

      {deleteCode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-red-600 mb-4"><div className="p-3 bg-red-100 rounded-full"><AlertTriangle size={24} /></div><h3 className="text-lg font-bold">Διαγραφή Λάστιχου</h3></div>
            <p className="text-slate-600 mb-6">Είστε σίγουροι ότι θέλετε να διαγράψετε το λάστιχο <strong>{deleteCode}</strong>;</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteCode(null)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium">Ακύρωση</button>
              <button onClick={confirmDelete} className="px-4 py-2 bg-red-600 text-white hover:bg-red-700 rounded-lg font-medium">Διαγραφή</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center"><h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><MapPin className="text-amber-600" />Διαχείριση Λάστιχων</h1></div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 h-fit sticky top-6">
              <h3 className="font-bold text-slate-700 mb-4 border-b pb-2">Προσθήκη Νέου</h3>
              <div className="space-y-4">
                  <div><label className="block text-xs font-bold text-slate-500 mb-1">Κωδικός (Code)</label><input type="text" value={newMold.code} onChange={e => setNewMold({...newMold, code: e.target.value.toUpperCase()})} placeholder="π.χ. A-12" className="w-full p-2 border border-slate-300 rounded bg-white text-slate-900 uppercase font-mono"/></div>
                  <div><label className="block text-xs font-bold text-slate-500 mb-1">Τοποθεσία / Συρτάρι</label><input type="text" value={newMold.location} onChange={e => setNewMold({...newMold, location: e.target.value})} placeholder="π.χ. Συρτάρι 1" className="w-full p-2 border border-slate-300 rounded bg-white text-slate-900"/></div>
                  <div><label className="block text-xs font-bold text-slate-500 mb-1">Περιγραφή</label><input type="text" value={newMold.description} onChange={e => setNewMold({...newMold, description: e.target.value})} placeholder="π.χ. Κορμός δαχτυλιδιού" className="w-full p-2 border border-slate-300 rounded bg-white text-slate-900"/></div>
                  <button onClick={handleCreate} className="w-full bg-slate-900 text-white py-2 rounded-lg font-medium hover:bg-slate-800 flex items-center justify-center gap-2"><Plus size={18} /> Προσθήκη</button>
              </div>
          </div>

          <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
             <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-500 font-medium uppercase text-xs"><tr><th className="p-3">Κωδικός</th><th className="p-3">Τοποθεσία</th><th className="p-3">Περιγραφή</th><th className="p-3 text-center">Ενέργειες</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                    {editableMolds.map(m => (
                        <tr key={m.code} className="hover:bg-slate-50 group">
                            <td className="p-3 font-mono font-bold text-slate-800">{m.code}</td>
                            <td className="p-3"><input type="text" value={m.location} onChange={(e) => updateMold(m.code, 'location', e.target.value)} className="w-full bg-transparent border border-transparent hover:border-slate-200 focus:border-amber-500 rounded p-2 text-slate-800 outline-none transition-all"/></td>
                            <td className="p-3"><input type="text" value={m.description} onChange={(e) => updateMold(m.code, 'description', e.target.value)} className="w-full bg-transparent border border-transparent hover:border-slate-200 focus:border-amber-500 rounded p-2 text-slate-800 outline-none transition-all"/></td>
                            <td className="p-3 flex justify-center gap-2">
                                <button onClick={() => handleSaveRow(m.code)} title="Αποθήκευση αλλαγών" className="p-2 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded transition-colors"><Save size={16} /></button>
                                <button onClick={() => setDeleteCode(m.code)} title="Διαγραφή" className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"><Trash2 size={16} /></button>
                            </td>
                        </tr>
                    ))}
                    {molds && molds.length === 0 && (<tr><td colSpan={4} className="p-8 text-center text-slate-400">Κανένα λάστιχο.</td></tr>)}
                </tbody>
             </table>
          </div>
      </div>
    </div>
  );
}