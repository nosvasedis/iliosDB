import React from 'react';
import { Plus, Trash2, PackageOpen, Calculator, Hammer, Coins, Gem } from 'lucide-react';
import { ProductionType, Material, Product } from '../../types';
import { useNewProductState } from '../../hooks/useNewProductState';
import { SmartQuantityInput } from '../ProductRegistry/SmartQuantityInput';
import { LaborCostCard } from '../ProductRegistry/LaborCostCard';
import { formatCurrency, formatDecimal } from '../../utils/pricingEngine';
import { SummaryRow, getMaterialIcon } from '../ProductRegistry/utils';

interface Props {
    formState: ReturnType<typeof useNewProductState>;
    materials: Material[];
    products: Product[];
    settings?: any;
}

export const StepRecipe: React.FC<Props> = ({ formState, materials, products, settings }) => {
    const { state, setters, actions } = formState;

    if (state.productionType === ProductionType.InHouse) {
        return (
            <div className="space-y-4 animate-in slide-in-from-right duration-300">
                <h3 className="text-xl font-bold text-slate-800 border-b border-slate-100 pb-4 flex justify-between items-center">2. Συνταγή - Υλικά</h3>
                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs">
                            <tr>
                                <th className="p-3 pl-4">Περιγραφή</th>
                                <th className="p-3 text-right">Κόστος</th>
                                <th className="p-3 text-center">Ποσότητα</th>
                                <th className="p-3 text-right pr-4">Σύνολο</th>
                                <th className="w-10"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {state.recipe.map((item, idx) => {
                                const isRaw = item.type === 'raw';
                                const itemDetails = isRaw ? materials.find(m => m.id === item.id) : products.find(p => p.sku === item.sku);

                                const title = isRaw ? (itemDetails as Material | undefined)?.name || "Άγνωστο" : (itemDetails as Product | undefined)?.sku || "Άγνωστο";
                                const subtitle = isRaw ? (itemDetails as Material)?.description || (itemDetails as Material)?.type : (itemDetails as Product)?.category;
                                const extraDesc = (!isRaw && (itemDetails as Product)?.description) ? (itemDetails as Product).description : null;

                                const imageUrl = (!isRaw && (itemDetails as Product)?.image_url) ? (itemDetails as Product).image_url : null;
                                const icon = isRaw ? getMaterialIcon((itemDetails as Material)?.type) : getMaterialIcon('Component');

                                const unitCost = isRaw ? (itemDetails as Material)?.cost_per_unit || 0 : (itemDetails as Product)?.active_price || 0;
                                const lineTotal = unitCost * item.quantity;
                                const stonesPerStrand = isRaw ? (itemDetails as Material)?.stones_per_strand : undefined;

                                return (
                                    <tr key={idx} className="hover:bg-slate-50/50 transition-colors group">
                                        <td className="p-3 pl-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 bg-slate-100 rounded-lg overflow-hidden border border-slate-200 shrink-0 flex items-center justify-center">
                                                    {imageUrl ? (
                                                        <img src={imageUrl} alt={title} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <span className="text-slate-400">{icon}</span>
                                                    )}
                                                </div>
                                                <div>
                                                    <div className="font-bold text-slate-800 text-sm">{title}</div>
                                                    <div className="text-xs text-slate-500 font-medium">
                                                        {subtitle}
                                                        {extraDesc && <span className="text-slate-400 italic"> • {extraDesc}</span>}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-3 text-right font-mono text-slate-500">{formatCurrency(unitCost)}</td>
                                        <td className="p-3 text-center">
                                            <SmartQuantityInput
                                                value={item.quantity}
                                                onChange={(val) => actions.updateRecipeItem(idx, 'quantity', val)}
                                                stonesPerStrand={stonesPerStrand}
                                            />
                                        </td>
                                        <td className="p-3 text-right font-mono font-bold text-slate-800 pr-4">{formatCurrency(lineTotal)}</td>
                                        <td className="p-3 text-center">
                                            <button onClick={() => actions.removeRecipeItem(idx)} className="text-slate-300 hover:text-red-500 transition-colors p-2 rounded-lg hover:bg-red-50">
                                                <Trash2 size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                            {state.recipe.length === 0 && (<tr><td colSpan={5} className="p-8 text-center text-slate-400 italic">Δεν έχουν προστεθεί υλικά.</td></tr>)}
                        </tbody>
                        <tfoot className="bg-slate-50 border-t border-slate-200">
                            <tr><td colSpan={3} className="p-3 text-right font-bold text-slate-600 uppercase text-xs">Συνολο Υλικων:</td><td className="p-3 text-right font-black font-mono text-lg text-emerald-600 pr-4">{formatCurrency(state.recipeTotalCost)}</td><td></td></tr>
                        </tfoot>
                    </table>
                </div>
                <div className="flex gap-2 pt-2">
                    <button type="button" onClick={() => setters.setIsRecipeModalOpen('raw')} className="text-xs bg-purple-50 text-purple-700 px-4 py-3 rounded-xl font-bold border border-purple-200 flex items-center gap-2 hover:bg-purple-100 transition-all flex-1 justify-center"><Plus size={16} /> Προσθήκη Υλικού</button>
                    <button type="button" onClick={() => setters.setIsRecipeModalOpen('component')} className="text-xs bg-blue-50 text-blue-700 px-4 py-3 rounded-xl font-bold border border-blue-200 flex items-center gap-2 hover:bg-blue-100 transition-all flex-1 justify-center"><PackageOpen size={16} /> Προσθήκη STX</button>
                </div>
            </div>
        );
    }

    // Imported Costing
    return (
        <div className="space-y-6 animate-in slide-in-from-right duration-300">
            <h3 className="text-xl font-bold text-slate-800 border-b border-slate-100 pb-4">2. Κοστολόγηση Εισαγωγής</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-2xl border-2 border-emerald-100 shadow-lg shadow-emerald-50 space-y-4">
                    <div className="flex items-center gap-3 mb-4"><div className="p-3 bg-emerald-100 text-emerald-700 rounded-xl"> <Calculator size={24} /> </div><div><h4 className="font-black text-lg text-slate-800">Υπολογισμός Κόστους</h4><p className="text-xs text-slate-500 font-medium">Συμπληρώστε τα παρακάτω πεδία.</p></div></div>
                    <LaborCostCard icon={<Hammer size={14} />} label="Εργατικά (€/g)" value={state.labor.technician_cost} onChange={val => setters.setLabor({ ...state.labor, technician_cost: val })} hint="Κόστος εργασίας ανά γραμμάριο" />
                    <LaborCostCard icon={<Coins size={14} />} label="Επιμετάλλωση (€/g)" value={state.labor.plating_cost_x} onChange={val => setters.setLabor({ ...state.labor, plating_cost_x: val })} hint="Κόστος επιμετάλλωσης ανά γραμμάριο" />
                    <LaborCostCard icon={<Gem size={14} />} label="Καρφωτικά/Πέτρες (€)" value={state.labor.stone_setting_cost} onChange={val => setters.setLabor({ ...state.labor, stone_setting_cost: val })} hint="Σταθερό κόστος" />
                </div>
                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
                    <h4 className="font-bold text-slate-700 mb-4 flex items-center gap-2 uppercase text-xs tracking-wider border-b border-slate-200 pb-2"><Calculator size={14} /> Ανάλυση Κόστους (Live)</h4>
                    <div className="space-y-1 flex-1">
                        <SummaryRow label="Ασήμι" value={state.costBreakdown?.silver || 0} sub={`${state.weight}g @ ${settings?.silver_price_gram}€`} color="bg-slate-400" />
                        <SummaryRow label="Εργατικά" value={state.costBreakdown?.details?.technician_cost || 0} sub={`${formatDecimal(state.labor.technician_cost)}€ x ${state.weight}g`} color="bg-blue-400" />
                        <SummaryRow label="Επιμετάλλωση" value={state.costBreakdown?.details?.plating_cost || 0} sub={`${formatDecimal(state.labor.plating_cost_x)}€ x ${state.weight}g`} color="bg-amber-400" />
                        <SummaryRow label="Καρφωτικά" value={state.costBreakdown?.details?.stone_setting_cost || 0} sub="Σταθερό" color="bg-purple-400" />
                    </div>
                    <div className="pt-3 mt-3 border-t border-slate-200 flex justify-between items-center"><span className="font-bold text-slate-600 text-sm uppercase">Συνολο Κόστους</span><span className="font-black text-2xl text-emerald-700">{formatCurrency(state.masterEstimatedCost)}</span></div>
                </div>
            </div>
        </div>
    );
};
