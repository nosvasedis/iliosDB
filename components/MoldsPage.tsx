
import React, { useState } from 'react';
import { Mold } from '../types';
import { Trash2, Plus, Save, MapPin, Loader2, Search } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { api } from '../lib/supabase';
import { useUI } from './UIProvider';

export default function MoldsPage() {
  const queryClient = useQueryClient();
  const { showToast, confirm } = useUI();
  const { data: molds, isLoading } = useQuery<Mold[]>({ queryKey: ['molds'], queryFn: api.getMolds });

  const [editableMolds, setEditableMolds] = useState<Mold[]>([]);
  const [newMold, setNewMold] = useState<Mold>({ code: 'L', location: '', description: '' });
  const [searchTerm, setSearchTerm] = useState('');

  React.useEffect(() => {
    if (molds) {
      setEditableMolds(JSON.parse(JSON.stringify(molds)));
    }
  }, [molds]);

  const filteredMolds = editableMolds
    .filter(m => m.code.includes(searchTerm.toUpperCase()) || m.description.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: 'base' }));

  const handleCreate = async () => {
      if (!newMold.code) {
          showToast("Ο Κωδικός είναι υποχρεωτικός.", 'error');
          return;
      }

      try {
          const { error } = await supabase.from('molds').insert(newMold);
          if (error) throw error;
          
          queryClient.invalidateQueries({ queryKey: ['molds'] });
          setNewMold({ code: 'L', location: '', description: '' });
          showToast("Το λάστιχο προστέθηκε.", 'success');
      } catch(e) {
          console.error(e);
          showToast("Σφάλμα. Πιθανώς ο κωδικός υπάρχει ήδη.", 'error');
      }
  };

  const handleDelete = async (code: string) => {
      const yes = await confirm({
          title: 'Διαγραφή Λάστιχου',
          message: `Είστε σίγουροι ότι θέλετε να διαγράψετε το λάστιχο ${code};`,
          isDestructive: true,
          confirmText: 'Διαγραφή'
      });
      if (!yes) return;

      try {
          const { error } = await supabase.from('molds').delete().eq('code', code);
          if (error) throw error;
          queryClient.invalidateQueries({ queryKey: ['molds'] });
          showToast("Διαγράφηκε.", 'info');
      } catch(e) {
          console.error(e);
          showToast("Σφάλμα κατά τη διαγραφή.", 'error');
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
      showToast(`Το λάστιχο ${moldToSave.code} αποθηκεύτηκε.`, 'success');
    } catch(e) {
      console.error("Error saving mold:", e);
      showToast("Σφάλμα αποθήκευσης.", 'error');
    }
  };

  if (isLoading) return <div className="flex justify-center items-center h-64"><Loader2 className="animate-spin text-amber-500" size={32} /></div>;

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
         <div>
             <h1 className="text-3xl font-bold text-slate-800 flex items-center gap-3 tracking-tight">
                <div className="p-2 bg-amber-100 text-amber-600 rounded-xl"><MapPin size={24} /></div>
                Διαχείριση Λάστιχων
             </h1>
             <p className="text-slate-500 mt-1 ml-14">Οργάνωση καλουπιών παραγωγής.</p>
         </div>
         <div className="relative group w-full md:w-64">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-amber-500 transition-colors" size={20} />
            <input 
              type="text" 
              placeholder="Αναζήτηση..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-12 pr-4 py-3 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-amber-500/20 focus:border-amber-500 outline-none w-full bg-slate-50 focus:bg-white transition-all text-slate-900"
            />
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
              <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 h-fit sticky top-6">
                  <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2"><Plus size={20} className="text-amber-500"/> Νέο Λάστιχο</h3>
                  <div className="space-y-4">
                      <div>
                          <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wide">Κωδικός (Code)</label>
                          <input type="text" value={newMold.code} onChange={e => setNewMold({...newMold, code: e.target.value.toUpperCase()})} placeholder="π.χ. L-12" className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50 text-slate-900 uppercase font-mono font-bold focus:ring-4 focus:ring-amber-500/20 outline-none transition-all"/>
                      </div>
                      <div>
                          <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wide">Τοποθεσία</label>
                          <input type="text" value={newMold.location} onChange={e => setNewMold({...newMold, location: e.target.value})} placeholder="π.χ. Συρτάρι 1" className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50 text-slate-900 focus:ring-4 focus:ring-amber-500/20 outline-none transition-all"/>
                      </div>
                      <div>
                          <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wide">Περιγραφή</label>
                          <input type="text" value={newMold.description} onChange={e => setNewMold({...newMold, description: e.target.value})} placeholder="π.χ. Κορμός..." className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50 text-slate-900 focus:ring-4 focus:ring-amber-500/20 outline-none transition-all"/>
                      </div>
                      <button onClick={handleCreate} className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold hover:bg-slate-800 flex items-center justify-center gap-2 transition-all hover:shadow-lg mt-2">
                          Προσθήκη
                      </button>
                  </div>
              </div>
          </div>

          <div className="lg:col-span-2 bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden min-h-[500px]">
             <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs border-b border-slate-100"><tr><th className="p-4">Κωδικός</th><th className="p-4">Τοποθεσία</th><th className="p-4">Περιγραφή</th><th className="p-4 text-center"></th></tr></thead>
                <tbody className="divide-y divide-slate-50">
                    {filteredMolds.map(m => (
                        <tr key={m.code} className="hover:bg-slate-50/80 group transition-colors">
                            <td className="p-4 font-mono font-bold text-slate-800">{m.code}</td>
                            <td className="p-4"><input type="text" value={m.location} onChange={(e) => updateMold(m.code, 'location', e.target.value)} className="w-full bg-transparent border-b border-transparent hover:border-slate-300 focus:border-amber-500 rounded-none py-1 text-slate-800 outline-none transition-all"/></td>
                            <td className="p-4"><input type="text" value={m.description} onChange={(e) => updateMold(m.code, 'description', e.target.value)} className="w-full bg-transparent border-b border-transparent hover:border-slate-300 focus:border-amber-500 rounded-none py-1 text-slate-800 outline-none transition-all"/></td>
                            <td className="p-4">
                                <div className="flex justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => handleSaveRow(m.code)} title="Αποθήκευση" className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"><Save size={18} /></button>
                                    <button onClick={() => handleDelete(m.code)} title="Διαγραφή" className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={18} /></button>
                                </div>
                            </td>
                        </tr>
                    ))}
                    {molds && molds.length === 0 && (<tr><td colSpan={4} className="p-16 text-center text-slate-400 italic">Κανένα λάστιχο.</td></tr>)}
                </tbody>
             </table>
          </div>
      </div>
    </div>
  );
}
