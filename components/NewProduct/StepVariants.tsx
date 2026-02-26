import React from 'react';
import { Plus, Trash2, Layers, Zap } from 'lucide-react';
import { ProductionType, Gender } from '../../types';
import { useNewProductState } from '../../hooks/useNewProductState';
import { FINISH_CODES } from '../../constants';
import { estimateVariantCost, formatCurrency } from '../../utils/pricingEngine';

interface Props {
    formState: ReturnType<typeof useNewProductState>;
    settings?: any;
    materials: any[];
    products: any[];
}

export const StepVariants: React.FC<Props> = ({ formState, settings, materials, products }) => {
    const { state, setters, actions } = formState;

    return (
        <div className="space-y-6 animate-in slide-in-from-right duration-300">
            <h3 className="text-xl font-bold text-slate-800 border-b border-slate-100 pb-4 flex justify-between items-center">
                <span>{state.productionType === ProductionType.Imported ? '3. Παραλλαγές' : '4. Παραλλαγές'}</span>
                <div className="text-xs bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full border border-emerald-100 font-bold">Base: {formatCurrency(state.masterEstimatedCost)}</div>
            </h3>

            <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-200 shadow-inner space-y-4">
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-[#060b00] text-white rounded-xl shadow-md"><Zap size={18} /></div>
                    <h4 className="font-black text-slate-700 uppercase tracking-tighter text-sm">Έξυπνη Προσθήκη</h4>
                </div>

                <div className="grid gap-4 w-full items-end grid-cols-[1fr_auto]">
                    <div className="relative">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1.5 block">Κωδικός Πέτρας (π.χ. PR)</label>
                        <input
                            ref={formState.refs.stoneSuffixRef}
                            type="text" placeholder="Κενό για σκέτα μέταλλα"
                            value={state.smartAddStoneSuffix}
                            onChange={e => setters.setSmartAddStoneSuffix(e.target.value.toUpperCase())}
                            className="w-full p-3.5 border border-slate-200 rounded-2xl font-mono text-lg font-black uppercase bg-white text-slate-800 focus:ring-4 focus:ring-emerald-500/10 outline-none transition-all"
                        />
                        <p className="text-[10px] text-slate-400 mt-2 ml-1">
                            {state.bridge ? <>Ανιχνεύθηκε διαχωριστικό <strong>{state.bridge}</strong>. </> : ''}
                            Θα δημιουργηθούν αυτόματα παραλλαγές για: <strong>{state.selectedFinishes.map(f => f ? FINISH_CODES[f] : 'Λουστρέ').join(', ')}</strong>
                        </p>
                    </div>

                    <button onClick={actions.handleSmartAddBatch} className="bg-[#060b00] text-white p-4 rounded-2xl font-black hover:bg-black transition-all shadow-lg active:scale-95 h-[54px] flex items-center justify-center px-6">
                        <Plus size={20} className="mr-2" /> Δημιουργία
                    </button>
                </div>
            </div>

            <div className="space-y-3">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 mb-1">Λίστα Παραλλαγών</h4>
                {state.variants.map((variant, index) => {
                    const { color } = actions.getVariantTypeInfo(variant.suffix);
                    const breakdown = estimateVariantCost(state.currentTempProduct, variant.suffix, settings, materials, products);

                    const diff = breakdown.total - state.masterEstimatedCost;
                    const details = breakdown.breakdown.details;
                    const platingCost = details.plating_cost || 0;
                    const stoneDiff = details.stone_diff || 0;

                    let breakdownLabel: string[] = [];
                    if (platingCost > 0) breakdownLabel.push(`+${formatCurrency(platingCost)} Επιμ.`);
                    if (Math.abs(stoneDiff) > 0.01) breakdownLabel.push(`${stoneDiff > 0 ? '+' : ''}${formatCurrency(stoneDiff)} Υλικά`);

                    if (breakdownLabel.length === 0 && Math.abs(diff) > 0.01) {
                        breakdownLabel.push(`${diff > 0 ? '+' : ''}${formatCurrency(diff)}`);
                    }

                    const breakdownText = breakdownLabel.length > 0 ? breakdownLabel.join(', ') : 'Βασικό Κόστος';

                    return (
                        <div key={index} className="group flex items-center gap-4 p-5 bg-white rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-xl hover:border-emerald-200 transition-all animate-in slide-in-from-bottom-2">
                            <div className={`font-mono font-black text-xl w-24 h-14 flex items-center justify-center rounded-2xl border-2 shadow-sm ${color}`}>
                                {variant.suffix || 'L'}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <input
                                        type="text" value={variant.description}
                                        onChange={e => actions.updateVariant(index, 'description', e.target.value)}
                                        className="bg-transparent font-black text-slate-800 text-base outline-none focus:border-b-2 border-emerald-400 w-full truncate"
                                    />
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <span className="text-[10px] bg-slate-50 text-slate-500 px-2 py-0.5 rounded-full border border-slate-100 font-bold uppercase tracking-tight">
                                        Κόστος: {formatCurrency(variant.active_price)}
                                    </span>
                                    {Math.abs(diff) > 0.01 && (
                                        <span className={`text-[10px] font-bold ${diff > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                            {breakdownText}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {!state.isSTX && (
                                <div className="text-right px-4 border-l border-slate-100">
                                    <div className="text-[9px] font-black text-slate-400 uppercase mb-0.5">Χονδρική</div>
                                    <div className="w-24 bg-slate-50 text-slate-700 font-black text-base rounded-lg px-2.5 py-1.5 border border-slate-200 text-right">
                                        {formatCurrency(variant.selling_price || state.sellingPrice || 0)}
                                    </div>
                                    <div className="text-[9px] text-slate-400 mt-1">Ορισμός στο Βήμα {state.finalStepId}</div>
                                </div>
                            )}

                            <button onClick={() => actions.removeVariant(index)} className="p-3 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all opacity-0 group-hover:opacity-100">
                                <Trash2 size={20} />
                            </button>
                        </div>
                    );
                })}
                {state.variants.length === 0 && <div className="text-center text-slate-300 py-12 border-2 border-dashed border-slate-100 rounded-[2rem] flex flex-col items-center gap-2"><Layers size={40} className="opacity-20" /><p className="font-bold">Δεν υπάρχουν παραλλαγές</p><p className="text-xs">Το προϊόν θα αποθηκευτεί μόνο στην αρχική του μορφή.</p></div>}
            </div>
        </div>
    );
};
