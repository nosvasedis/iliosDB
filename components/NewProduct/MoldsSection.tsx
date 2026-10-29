import { formatNumber } from '../../utils/numberFormat';
import React from 'react';
import { Plus, Minus, X, Search, Loader2, CircleDashed, Sparkles } from 'lucide-react';
import { useNewProductState } from '../../hooks/useNewProductState';
import { Panel, npInputClass, npMonoInputClass } from './wizardUi';

interface Props {
    formState: ReturnType<typeof useNewProductState>;
}

export const MoldsSection: React.FC<Props> = ({ formState }) => {
    const { state, setters, actions } = formState;
    const suggestedCodes = new Set(state.suggestedMolds.map(m => m.code));

    return (
        <Panel
            title="Λάστιχα"
            subtitle="Επιλέξτε υπάρχοντα ή δημιουργήστε νέο"
            icon={CircleDashed}
            tone="amber"
            className="mt-6"
            actions={state.selectedMolds.length > 0 ? <span className="rounded-lg bg-amber-100 px-2 py-1 text-[11px] font-black text-amber-800">{formatNumber(state.selectedMolds.length)} επιλεγμένα</span> : undefined}
        >
            <div className="grid grid-cols-1 gap-5 md:grid-cols-[minmax(0,1fr)_300px]">
                <div className="space-y-3">
                    {state.selectedMolds.length > 0 && (
                        <div className="flex flex-wrap gap-2 rounded-xl border border-amber-100 bg-amber-50/60 p-3">
                            {state.selectedMolds.map(m => (
                                <div key={m.code} className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-white py-1 pl-3 pr-1 text-sm font-bold text-amber-800 shadow-sm">
                                    <span className="font-mono">{m.code}</span>
                                    <div className="flex items-center rounded-md border border-amber-100 bg-amber-50">
                                        <button type="button" onClick={() => actions.updateMoldQuantity(m.code, -1)} className="rounded-l-md p-1 text-amber-600 hover:bg-amber-100 disabled:opacity-30" disabled={m.quantity <= 1}><Minus size={12} /></button>
                                        <span className="w-6 text-center text-xs font-black text-amber-900">{formatNumber(m.quantity)}</span>
                                        <button type="button" onClick={() => actions.updateMoldQuantity(m.code, 1)} className="rounded-r-md p-1 text-amber-600 hover:bg-amber-100"><Plus size={12} /></button>
                                    </div>
                                    <button type="button" onClick={() => actions.removeMold(m.code)} className="rounded-md p-1 text-slate-300 transition-colors hover:bg-rose-50 hover:text-rose-500"><X size={14} /></button>
                                </div>
                            ))}
                        </div>
                    )}
                    <div className="flex h-72 flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                        <div className="relative shrink-0">
                            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                            <input type="text" placeholder="Αναζήτηση λάστιχου…" value={state.moldSearch} onChange={e => setters.setMoldSearch(e.target.value)} className={`${npInputClass} pl-9`} />
                        </div>
                        <div className="flex-1 space-y-1 overflow-y-auto pr-1 custom-scrollbar">
                            {state.suggestedMolds.concat(state.otherMolds).map(m => {
                                const selected = state.selectedMolds.find(sm => sm.code === m.code);
                                return (
                                    <div key={m.code} className={`flex items-center gap-2 rounded-lg border p-2 text-sm transition-colors ${selected ? 'border-amber-200 bg-amber-50' : 'border-transparent bg-white hover:border-slate-200'}`}>
                                        <button type="button" onClick={() => actions.addMold(m.code)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                                            <span className={`font-mono font-bold ${selected ? 'text-amber-800' : 'text-slate-700'}`}>{m.code}</span>
                                            {suggestedCodes.has(m.code) && <span className="inline-flex items-center gap-0.5 rounded bg-emerald-50 px-1.5 text-[9px] font-black uppercase text-emerald-700"><Sparkles size={9} /> Πρόταση</span>}
                                            <span className="truncate text-xs text-slate-400">{m.description}</span>
                                        </button>
                                        {selected ? (
                                            <div className="flex items-center gap-1 rounded-md border border-amber-200 bg-white shadow-sm">
                                                <button type="button" onClick={() => actions.updateMoldQuantity(m.code, -1)} className="p-1 text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30" disabled={selected.quantity === 1}><Minus size={12} /></button>
                                                <span className="w-6 text-center text-xs font-bold">{formatNumber(selected.quantity)}</span>
                                                <button type="button" onClick={() => actions.updateMoldQuantity(m.code, 1)} className="p-1 text-slate-500 hover:bg-slate-100"><Plus size={12} /></button>
                                                <div className="mx-1 h-4 w-px bg-slate-100"></div>
                                                <button type="button" onClick={() => actions.removeMold(m.code)} className="rounded-r-md p-1 text-rose-400 hover:bg-rose-100 hover:text-rose-600"><X size={12} /></button>
                                            </div>
                                        ) : (
                                            <button type="button" onClick={() => actions.addMold(m.code)} className="rounded-md p-1 text-slate-300 hover:bg-amber-50 hover:text-amber-500"><Plus size={16} /></button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                <div className="flex flex-col gap-3 rounded-xl border-2 border-dashed border-slate-200 bg-white p-4 transition-colors hover:border-amber-300">
                    <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-slate-400"><Plus size={14} /> Νέο λάστιχο</div>
                    <input type="text" placeholder="Κωδικός *" value={state.newMoldCode} onChange={e => setters.setNewMoldCode(e.target.value.toUpperCase())} className={npMonoInputClass} />
                    <input type="text" placeholder="Τοποθεσία" value={state.newMoldLoc} onChange={e => setters.setNewMoldLoc(e.target.value)} className={npInputClass} />
                    <input type="text" placeholder="Περιγραφή" value={state.newMoldDesc} onChange={e => setters.setNewMoldDesc(e.target.value)} className={npInputClass} />
                    <button type="button" onClick={actions.handleQuickCreateMold} disabled={state.isCreatingMold} className="mt-auto flex w-full items-center justify-center gap-1.5 rounded-xl bg-amber-500 py-3 text-sm font-black text-white shadow-md shadow-amber-500/20 transition-all hover:bg-amber-600 active:scale-[0.98] disabled:opacity-50">
                        {state.isCreatingMold ? <Loader2 size={16} className="animate-spin" /> : <><Plus size={15} /> Δημιουργία & επιλογή</>}
                    </button>
                </div>
            </div>
        </Panel>
    );
};
