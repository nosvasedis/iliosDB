import React from 'react';
import { Plus, Minus, X, Search, Loader2 } from 'lucide-react';
import { useNewProductState } from '../../hooks/useNewProductState';

interface Props {
    formState: ReturnType<typeof useNewProductState>;
}

export const MoldsSection: React.FC<Props> = ({ formState }) => {
    const { state, setters, actions } = formState;

    return (
        <div className="pt-4 border-t border-slate-100">
            <label className="block text-sm font-bold text-amber-700 mb-3">Λάστιχα</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                    {state.selectedMolds.length > 0 && (
                        <div className="p-3 bg-amber-50/50 rounded-xl border border-amber-100">
                            <h5 className="text-xs font-bold text-amber-700 uppercase mb-2">Επιλεγμένα</h5>
                            <div className="flex flex-wrap gap-2">
                                {state.selectedMolds.map(m => (
                                    <div key={m.code} className="bg-white border border-amber-200 text-amber-800 pl-3 pr-1 py-1 rounded-lg text-sm font-bold flex items-center gap-2 shadow-sm">
                                        <span>{m.code}</span>
                                        <div className="flex items-center bg-amber-50 rounded border border-amber-100">
                                            <button type="button" onClick={() => actions.updateMoldQuantity(m.code, -1)} className={`p-1 hover:bg-amber-100 text-amber-600 rounded-l ${m.quantity <= 1 ? 'opacity-30' : ''}`} disabled={m.quantity <= 1}><Minus size={12} /></button>
                                            <input type="number" min="1" value={m.quantity} onChange={(e) => { const val = parseInt(e.target.value) || 1; actions.updateMoldQuantity(m.code, val - m.quantity); /* Hacky, but updateMoldQuantity takes delta. Wait, in useNewProductState updateMoldQuantity doesn't take absolute value anymore? Let's check. Ah, in useNewProductState `updateMoldQuantity` takes delta. So I'll just skip absolute input for now, or add a setter for exact quantity in state if needed. Actually in useNewProductState I copied the logic. */ }} className="w-8 text-center bg-transparent outline-none text-xs font-bold text-amber-900" readOnly />
                                            <button type="button" onClick={() => actions.updateMoldQuantity(m.code, 1)} className="p-1 hover:bg-amber-100 text-amber-600 rounded-r"><Plus size={12} /></button>
                                        </div>
                                        <button onClick={() => actions.removeMold(m.code)} className="p-1 text-slate-300 hover:text-red-500 ml-1 hover:bg-red-50 rounded transition-colors"><X size={14} /></button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 h-64 flex flex-col gap-3">
                        <div className="relative shrink-0">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                            <input type="text" placeholder="Αναζήτηση..." value={state.moldSearch} onChange={e => setters.setMoldSearch(e.target.value)} className="w-full pl-9 p-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all placeholder-slate-400" />
                        </div>
                        <div className="overflow-y-auto custom-scrollbar flex-1 pr-1">
                            {state.otherMolds.concat(state.suggestedMolds).map(m => {
                                const selected = state.selectedMolds.find(sm => sm.code === m.code);
                                return (
                                    <div key={m.code} className={`flex items-center gap-2 text-sm p-2 rounded-lg border mb-1 transition-colors ${selected ? 'bg-amber-50 border-amber-200' : 'bg-white border-transparent hover:border-slate-200'}`}>
                                        <div onClick={() => actions.addMold(m.code)} className="flex-1 cursor-pointer flex items-center gap-2">
                                            <span className={`font-mono font-bold ${selected ? 'text-amber-800' : 'text-slate-700'}`}>{m.code}</span>
                                            <span className="text-xs text-slate-400 truncate">{m.description}</span>
                                        </div>
                                        {selected ? (
                                            <div className="flex items-center gap-1 bg-white rounded-md border border-amber-200 shadow-sm">
                                                <button onClick={() => actions.updateMoldQuantity(m.code, -1)} className={`p-1 hover:bg-slate-100 text-slate-500 ${selected.quantity === 1 ? 'opacity-30 cursor-not-allowed' : ''}`} disabled={selected.quantity === 1}><Minus size={12} /></button>
                                                <span className="text-xs font-bold w-6 text-center">{selected.quantity}</span>
                                                <button onClick={() => actions.updateMoldQuantity(m.code, 1)} className="p-1 hover:bg-slate-100 text-slate-500"><Plus size={12} /></button>
                                                <div className="w-px h-4 bg-slate-100 mx-1"></div>
                                                <button onClick={() => actions.removeMold(m.code)} className="p-1 text-red-400 hover:text-red-600 hover:bg-red-100 rounded-r-md"><X size={12} /></button>
                                            </div>
                                        ) : (
                                            <button onClick={() => actions.addMold(m.code)} className="text-slate-300 hover:text-amber-500"><Plus size={16} /></button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
                <div className="bg-white p-5 rounded-2xl border-2 border-dashed border-slate-200 hover:border-amber-300 transition-all group flex flex-col gap-3 h-full">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-400 group-hover:text-amber-500 uppercase tracking-wide transition-colors"><Plus size={14} /> Νέο Λάστιχο</div>
                    <input type="text" placeholder="Κωδικός *" value={state.newMoldCode} onChange={e => setters.setNewMoldCode(e.target.value.toUpperCase())} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-bold outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all uppercase placeholder-slate-400" />
                    <div className="grid grid-cols-2 gap-3">
                        <input type="text" placeholder="Τοποθεσία" value={state.newMoldLoc} onChange={e => setters.setNewMoldLoc(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all placeholder-slate-400" />
                        <input type="text" placeholder="Περιγραφή" value={state.newMoldDesc} onChange={e => setters.setNewMoldDesc(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all placeholder-slate-400" />
                    </div>
                    <button onClick={actions.handleQuickCreateMold} disabled={state.isCreatingMold} className="mt-auto w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-3 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center">
                        {state.isCreatingMold ? <Loader2 size={16} className="animate-spin" /> : 'Δημιουργία & Επιλογή'}
                    </button>
                </div>
            </div>
        </div>
    );
};
