import React from 'react';
import { ArrowRight, ImageIcon, Tag, Users, Palette, Box, PieChart, TrendingUp, Wand2, Info, Globe } from 'lucide-react';
import { ProductionType } from '../../types';
import { useNewProductState } from '../../hooks/useNewProductState';
import { formatCurrency } from '../../utils/pricingEngine';

interface Props {
    formState: ReturnType<typeof useNewProductState>;
    settings?: any;
    materials: any[];
    products: any[];
}

export const StepReview: React.FC<Props> = ({ formState, settings, materials, products }) => {
    const { state, setters, actions } = formState;

    return (
        <div className="space-y-8 animate-in slide-in-from-right duration-300 h-full flex flex-col">
            <div className="flex gap-6 items-start shrink-0">
                <div className="w-32 h-32 bg-slate-50 rounded-2xl overflow-hidden border border-slate-200 shadow-sm shrink-0">
                    {state.imagePreview ? <img src={state.imagePreview} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-slate-300"><ImageIcon size={32} /></div>}
                </div>
                <div className="flex-1">
                    <h2 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                        {state.detectedMasterSku || state.sku}
                        {state.isSTX && <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-md text-xs font-bold uppercase">Component</span>}
                        {state.productionType === ProductionType.Imported && <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded-md text-xs font-bold uppercase flex items-center gap-1"><Globe size={12} /> ΕΙΣΑΓΩΜΕΝΟ</span>}
                    </h2>
                    <div className="flex gap-4 text-sm font-medium text-slate-500 mt-2">
                        <span className="flex items-center gap-1 bg-slate-100 px-2 py-1 rounded"><Tag size={12} /> {state.category}</span>
                        <span className="flex items-center gap-1 bg-slate-100 px-2 py-1 rounded"><Users size={12} /> {state.genderLabel}</span>
                        <span className="flex items-center gap-1 bg-slate-100 px-2 py-1 rounded font-bold text-slate-600"><Palette size={12} /> {state.platingMasterLabel}</span>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1 min-h-0">
                <div className="lg:col-span-4 space-y-6 overflow-y-auto pr-2 custom-scrollbar">
                    <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200 flex flex-col gap-6">
                        <h4 className="font-bold text-slate-700 uppercase text-xs tracking-wider flex items-center gap-2 border-b border-slate-200 pb-2">
                            <PieChart size={14} /> Ανάλυση Κόστους Παραγωγής
                        </h4>

                        <div className="flex gap-4 items-end justify-center">
                            <div className="w-24 flex flex-col items-center gap-1">
                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Βασικό</div>
                                <div className="w-full flex flex-col-reverse rounded-xl overflow-hidden shadow-sm border border-slate-200 bg-white">
                                    <div className="h-12 bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600" title={`Ασήμι: ${formatCurrency(state.costBreakdown?.silver)}`}>Ag</div>
                                    <div className="h-8 bg-blue-100 flex items-center justify-center text-[10px] font-bold text-blue-600" title={`Εργατικά: ${formatCurrency(state.costBreakdown?.labor)}`}>Lab</div>
                                    <div className="h-6 bg-purple-100 flex items-center justify-center text-[10px] font-bold text-purple-600" title={`Υλικά: ${formatCurrency(state.costBreakdown?.materials)}`}>Mat</div>
                                </div>
                                <div className="font-black text-slate-800 text-lg mt-1">{formatCurrency(state.masterEstimatedCost)}</div>
                            </div>

                            <div className="text-slate-300 pb-8"><ArrowRight size={24} /></div>

                            {state.finalStacks.map((stack, idx) => (
                                <div key={idx} className="w-24 flex flex-col items-center gap-1 animate-in slide-in-from-right-4 fade-in" style={{ animationDelay: `${idx * 100}ms` }}>
                                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{stack.label}</div>
                                    <div className={`w-full flex flex-col-reverse rounded-xl overflow-hidden shadow-sm border bg-white ${stack.borderClass}`}>
                                        <div className="h-12 bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-400">Ag</div>
                                        <div className="h-8 bg-blue-100 flex items-center justify-center text-[10px] font-bold text-blue-400">Lab</div>
                                        <div className="h-6 bg-purple-100 flex items-center justify-center text-[10px] font-bold text-purple-400">Mat</div>
                                        {stack.platingCost > 0 && (
                                            <div className={`h-6 flex items-center justify-center text-[10px] font-bold border-b border-white/50 ${stack.colorClass}`} title={`Plating: +${formatCurrency(stack.platingCost)}`}>
                                                +{stack.type}
                                            </div>
                                        )}
                                    </div>
                                    <div className="font-black text-emerald-600 text-lg mt-1">{formatCurrency(stack.total)}</div>
                                </div>
                            ))}
                        </div>

                        <div className="space-y-2 mt-2">
                            <div className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 bg-slate-200 rounded-full"></div>
                                    <span className="text-slate-600 font-medium">Ασήμι ({settings?.silver_price_gram}€/g)</span>
                                </div>
                                <span className="font-bold text-slate-800">{formatCurrency(state.costBreakdown?.silver)}</span>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 bg-blue-100 rounded-full"></div>
                                    <span className="text-slate-600 font-medium">Εργατικά</span>
                                </div>
                                <span className="font-bold text-slate-800">{formatCurrency(state.costBreakdown?.labor)}</span>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 bg-purple-100 rounded-full"></div>
                                    <span className="text-slate-600 font-medium">Υλικά/Πέτρες</span>
                                </div>
                                <span className="font-bold text-slate-800">{formatCurrency(state.costBreakdown?.materials)}</span>
                            </div>
                            {state.labor.plating_cost_x > 0 && (
                                <div className="flex items-center justify-between text-xs">
                                    <div className="flex items-center gap-2">
                                        <div className="w-3 h-3 bg-amber-100 rounded-full"></div>
                                        <span className="text-slate-600 font-medium">Επιμετάλλωση X/H</span>
                                    </div>
                                    <span className="font-bold text-slate-800">+{formatCurrency(state.labor.plating_cost_x)}</span>
                                </div>
                            )}
                            {state.labor.plating_cost_d > 0 && (
                                <div className="flex items-center justify-between text-xs">
                                    <div className="flex items-center gap-2">
                                        <div className="w-3 h-3 bg-orange-100 rounded-full"></div>
                                        <span className="text-slate-600 font-medium">Επιμετάλλωση D</span>
                                    </div>
                                    <span className="font-bold text-slate-800">+{formatCurrency(state.labor.plating_cost_d)}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm space-y-4">
                        <h4 className="font-bold text-slate-700 uppercase text-xs tracking-wider border-b border-slate-100 pb-2 flex items-center gap-2"><Box size={14} /> Λεπτομέρειες</h4>
                        <div className="space-y-3">
                            <div>
                                <div className="text-xs font-bold text-slate-400 uppercase mb-1">Υλικά & Εξαρτήματα</div>
                                {state.recipe.length > 0 ? (
                                    <ul className="space-y-1">
                                        {state.recipe.map((r, idx) => {
                                            const name = r.type === 'raw'
                                                ? materials.find(m => m.id === r.id)?.name
                                                : products.find(p => p.sku === r.sku)?.category || r.sku;
                                            return (
                                                <li key={idx} className="flex items-center gap-2 text-xs font-medium text-slate-700">
                                                    <div className="w-1 h-1 bg-purple-400 rounded-full"></div>
                                                    <span>{name} <span className="text-slate-400">x{r.quantity}</span></span>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                ) : <span className="text-xs text-slate-400 italic">Κανένα υλικό</span>}
                            </div>

                            <div>
                                <div className="text-xs font-bold text-slate-400 uppercase mb-1">Λάστιχα</div>
                                {state.selectedMolds.length > 0 ? (
                                    <ul className="space-y-1">
                                        {state.selectedMolds.map((m, idx) => {
                                            return (
                                                <li key={idx} className="flex items-center gap-2 text-xs font-medium text-slate-700">
                                                    <div className="w-1 h-1 bg-amber-400 rounded-full"></div>
                                                    <span>{m.code}</span>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                ) : <span className="text-xs text-slate-400 italic">Κανένα λάστιχο</span>}
                            </div>

                            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-50">
                                <div>
                                    <span className="text-[10px] text-slate-400 font-bold block">ΒΑΡΟΣ</span>
                                    <span className="font-mono text-slate-800 font-bold text-sm">{state.weight + state.secondaryWeight}g</span>
                                </div>
                                <div>
                                    <span className="text-[10px] text-slate-400 font-bold block">ΣΥΝΟΛΟ ΕΡΓΑΤΙΚΩΝ</span>
                                    <span className="font-mono text-slate-800 font-bold text-sm">{formatCurrency(state.costBreakdown?.labor)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-8 flex flex-col min-h-0 bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-5 border-b border-slate-100 bg-slate-50/50 space-y-4">
                        <div className="flex justify-between items-center gap-3 flex-wrap">
                            <h4 className="font-bold text-slate-800 flex items-center gap-2"><TrendingUp size={18} className="text-emerald-600" /> Ανάλυση Κερδοφορίας Παραλλαγών</h4>
                            <div className="flex gap-2 items-center">
                                <span className="text-xs font-bold bg-slate-200 text-slate-600 px-2 py-1 rounded">{state.variants.length} Παραλλαγές</span>
                                {!state.isSTX && (
                                    <div className="inline-flex bg-slate-100 border border-slate-200 rounded-lg p-1">
                                        <button
                                            onClick={() => setters.setUseIliosFormula(true)}
                                            className={`px-3 py-1 text-[10px] font-bold rounded-md transition-colors ${state.useIliosFormula ? 'bg-white text-purple-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                        >
                                            Τύπος Ilios
                                        </button>
                                        <button
                                            onClick={() => setters.setUseIliosFormula(false)}
                                            className={`px-3 py-1 text-[10px] font-bold rounded-md transition-colors ${!state.useIliosFormula ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                        >
                                            Χειροκίνητη
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {!state.isSTX && state.useIliosFormula && (
                            <div className="flex items-center justify-between gap-3 bg-purple-50 border border-purple-100 rounded-2xl p-3">
                                <div className="text-xs text-purple-800 font-medium">
                                    Η τιμολόγηση θα υπολογιστεί αυτόματα με τον Τύπο Ilios.
                                </div>
                                <button
                                    onClick={actions.handleApplyIliosFormula}
                                    className="text-[10px] font-bold bg-white text-purple-700 hover:bg-purple-100 px-3 py-1.5 rounded-lg border border-purple-100 flex items-center gap-1 transition-colors shadow-sm shrink-0"
                                    title="Αυτόματη Τιμολόγηση με Τύπο Ilios"
                                >
                                    <Wand2 size={12} /> Εφαρμογή Τύπου Ilios
                                </button>
                            </div>
                        )}

                        {!state.isSTX && !state.useIliosFormula && (
                            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 space-y-3">
                                <div className="text-[10px] font-bold text-emerald-700 uppercase tracking-wide">Τιμολόγηση</div>
                                <div className="flex flex-wrap items-end gap-3">
                                    <div className="min-w-[220px] flex-1">
                                        <label className="block text-xs font-bold text-emerald-900 mb-1">Master Χονδρική</label>
                                        <div className="relative">
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={state.sellingPrice || 0}
                                                onChange={e => {
                                                    setters.setUseIliosFormula(false);
                                                    setters.setSellingPrice(parseFloat(e.target.value) || 0);
                                                }}
                                                className="w-full p-2.5 pr-7 border border-emerald-200 bg-white rounded-xl font-bold focus:ring-4 focus:ring-emerald-500/20 outline-none text-sm"
                                            />
                                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-emerald-600 font-bold text-xs">€</span>
                                        </div>
                                    </div>

                                    {state.variants.length > 0 && (
                                        <button
                                            onClick={actions.applyManualPriceToVariants}
                                            className="px-3 py-2 bg-white text-emerald-700 border border-emerald-200 rounded-xl text-[10px] font-bold hover:bg-emerald-100 transition-colors"
                                        >
                                            Αντιγραφή Master σε όλες
                                        </button>
                                    )}
                                </div>

                                {state.variants.length > 0 && (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                                        {state.variants.map((v, idx) => (
                                            <div key={`${v.suffix}-${idx}`} className="bg-white border border-emerald-100 rounded-xl p-2.5">
                                                <label className="block text-[10px] font-bold text-emerald-700 uppercase mb-1">Χονδρική ({v.suffix || 'BAS'})</label>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    value={v.selling_price ?? state.sellingPrice ?? 0}
                                                    onChange={e => actions.updateVariant(idx, 'selling_price', parseFloat(e.target.value) || 0)}
                                                    className="w-full p-2 border border-emerald-200 rounded-lg bg-white font-bold text-sm outline-none focus:ring-4 focus:ring-emerald-500/20"
                                                />
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {state.isSTX && (
                            <div className="bg-slate-100 border border-slate-200 rounded-2xl p-3 text-xs text-slate-600">
                                Το προϊόν είναι STX και αποθηκεύεται χωρίς τιμή πώλησης.
                            </div>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] sticky top-0 shadow-sm z-10">
                                <tr>
                                    <th className="p-4 pl-6">Παραλλαγή</th>
                                    <th className="p-4 text-right">Κόστος</th>
                                    <th className="p-4 text-right">Χονδρική</th>
                                    <th className="p-4 text-right text-emerald-700">Κέρδος</th>
                                    <th className="p-4 w-1/4 pr-6">Περιθώριο</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {state.variants.length > 0 ? state.variants.map((v, idx) => {
                                    const cost = v.active_price ?? 0;
                                    const price = v.selling_price || state.sellingPrice;
                                    const profit = price - cost;
                                    const margin = price > 0 ? (profit / price) * 100 : 0;

                                    return (
                                        <tr key={idx} className="hover:bg-slate-50/50 transition-colors group">
                                            <td className="p-4 pl-6">
                                                <div className="flex items-center gap-3">
                                                    <div className="font-mono font-bold bg-slate-100 text-slate-700 px-2 py-1 rounded text-xs border border-slate-200 w-12 text-center">{v.suffix || 'BAS'}</div>
                                                    <span className="font-medium text-slate-600 truncate max-w-[150px]" title={v.description}>{v.description}</span>
                                                </div>
                                            </td>
                                            <td className="p-4 text-right group-hover:bg-amber-50/30 transition-colors">
                                                <div className="font-mono font-bold text-slate-700">{formatCurrency(cost)}</div>
                                            </td>
                                            <td className="p-4 text-right">
                                                {state.isSTX ? (
                                                    <span className="text-slate-300 italic text-xs">N/A</span>
                                                ) : (
                                                    <span className="font-mono font-bold text-slate-800 text-lg">{formatCurrency(price)}</span>
                                                )}
                                            </td>
                                            <td className="p-4 text-right font-mono font-bold text-emerald-600">
                                                {state.isSTX ? '-' : formatCurrency(profit)}
                                            </td>
                                            <td className="p-4 pr-6">
                                                {!state.isSTX && (
                                                    <div className="flex items-center gap-3">
                                                        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                                                            <div
                                                                className={`h-full rounded-full ${margin < 30 ? 'bg-rose-500' : (margin < 50 ? 'bg-amber-400' : 'bg-emerald-500')}`}
                                                                style={{ width: `${Math.min(100, Math.max(0, margin))}%` }}
                                                            ></div>
                                                        </div>
                                                        <span className={`text-xs font-black w-10 text-right ${margin < 30 ? 'text-rose-600' : 'text-emerald-700'}`}>{margin.toFixed(0)}%</span>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                }) : (
                                    <tr>
                                        <td colSpan={5} className="p-8 text-center">
                                            <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 px-4 py-2 rounded-xl text-xs font-bold border border-blue-100">
                                                <Info size={14} /> Θα δημιουργηθεί μόνο το Master προϊόν (χωρίς παραλλαγές).
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};
