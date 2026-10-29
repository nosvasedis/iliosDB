import { formatNumber } from '../../utils/numberFormat';
import React from 'react';
import { Plus, Trash2, PackageOpen, Calculator, Hammer, Coins, Gem, FlaskConical, Boxes } from 'lucide-react';
import { ProductionType, Material, Product } from '../../types';
import { useNewProductState } from '../../hooks/useNewProductState';
import { SmartQuantityInput } from '../ProductRegistry/SmartQuantityInput';
import { LaborCostCard } from '../ProductRegistry/LaborCostCard';
import { formatCurrency, formatDecimal } from '../../utils/pricingEngine';
import { SummaryRow, getMaterialIcon } from '../ProductRegistry/utils';
import { Panel, StepHeader, StatPill } from './wizardUi';

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
            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                <StepHeader
                    step={2}
                    icon={FlaskConical}
                    title="Συνταγή"
                    subtitle="Υλικά, πέτρες και εξαρτήματα STX που αποτελούν το προϊόν."
                    aside={<>
                        <StatPill label="Γραμμές" value={formatNumber(state.recipe.length)} />
                        <StatPill label="Υλικά" value={formatCurrency(state.recipeTotalCost)} tone="emerald" />
                    </>}
                />

                <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <button type="button" onClick={() => setters.setIsRecipeModalOpen('raw')} className="group flex items-center gap-3 rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-4 text-left transition-all hover:border-violet-300 hover:shadow-md active:scale-[0.99]">
                        <span className="grid h-11 w-11 place-items-center rounded-xl bg-violet-500 text-white shadow-md shadow-violet-500/25 transition-transform group-hover:scale-105"><Plus size={20} /></span>
                        <span>
                            <span className="block text-sm font-black text-violet-900">Προσθήκη υλικού</span>
                            <span className="block text-[11px] font-medium text-violet-600/70">Πέτρες, κορδόνια, σμάλτα…</span>
                        </span>
                    </button>
                    <button type="button" onClick={() => setters.setIsRecipeModalOpen('component')} className="group flex items-center gap-3 rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-white p-4 text-left transition-all hover:border-blue-300 hover:shadow-md active:scale-[0.99]">
                        <span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-500 text-white shadow-md shadow-blue-500/25 transition-transform group-hover:scale-105"><PackageOpen size={20} /></span>
                        <span>
                            <span className="block text-sm font-black text-blue-900">Προσθήκη STX</span>
                            <span className="block text-[11px] font-medium text-blue-600/70">Εξαρτήματα από το μητρώο</span>
                        </span>
                    </button>
                </div>

                <Panel bodyClassName="!p-0" className="overflow-hidden">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-400">
                            <tr>
                                <th className="p-3 pl-5">Περιγραφή</th>
                                <th className="p-3 text-right">Κόστος</th>
                                <th className="p-3 text-center">Ποσότητα</th>
                                <th className="p-3 pr-4 text-right">Σύνολο</th>
                                <th className="w-12"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
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
                                    <tr key={idx} className="group transition-colors hover:bg-slate-50/60">
                                        <td className="p-3 pl-5">
                                            <div className="flex items-center gap-3">
                                                <div className={`flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border ${isRaw ? 'border-violet-100 bg-violet-50 text-violet-500' : 'border-blue-100 bg-blue-50 text-blue-500'}`}>
                                                    {imageUrl ? <img src={imageUrl} alt={title} className="h-full w-full object-cover" /> : icon}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="truncate text-sm font-bold text-slate-800">{title}</div>
                                                    <div className="truncate text-xs font-medium text-slate-500">
                                                        {subtitle}
                                                        {extraDesc && <span className="italic text-slate-400"> • {extraDesc}</span>}
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
                                        <td className="p-3 pr-4 text-right font-mono font-bold text-slate-800">{formatCurrency(lineTotal)}</td>
                                        <td className="p-3 text-center">
                                            <button type="button" onClick={() => actions.removeRecipeItem(idx)} className="rounded-lg p-2 text-slate-300 transition-colors hover:bg-rose-50 hover:text-rose-500">
                                                <Trash2 size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                            {state.recipe.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="p-10">
                                        <div className="flex flex-col items-center gap-2 text-center">
                                            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-slate-50 text-slate-300"><Boxes size={28} /></div>
                                            <p className="text-sm font-bold text-slate-500">Δεν έχουν προστεθεί υλικά</p>
                                            <p className="text-xs text-slate-400">{state.isAssembly ? 'Ένα προϊόν συναρμολόγησης χρειάζεται τουλάχιστον ένα υλικό.' : 'Προαιρετικό — προχωρήστε αν το προϊόν είναι μόνο ασήμι.'}</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                        {state.recipe.length > 0 && (
                            <tfoot className="border-t border-slate-200 bg-slate-50">
                                <tr>
                                    <td colSpan={3} className="p-3 text-right text-[11px] font-black uppercase tracking-wider text-slate-500">Σύνολο υλικών</td>
                                    <td className="p-3 pr-4 text-right font-mono text-lg font-black text-emerald-600">{formatCurrency(state.recipeTotalCost)}</td>
                                    <td></td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </Panel>
            </div>
        );
    }

    // Imported Costing
    return (
        <div className="animate-in fade-in slide-in-from-right-4 duration-300">
            <StepHeader
                step={2}
                icon={Calculator}
                title="Κοστολόγηση εισαγωγής"
                subtitle="Εργατικά, επιμετάλλωση και καρφωτικά ανά γραμμάριο."
                aside={<StatPill label="Κόστος" value={formatCurrency(state.masterEstimatedCost)} tone="emerald" />}
            />
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <Panel title="Υπολογισμός κόστους" subtitle="Συμπληρώστε τα παρακάτω πεδία" icon={Calculator} tone="emerald" bodyClassName="space-y-3">
                    <LaborCostCard icon={<Hammer size={14} />} label="Εργατικά (€/g)" value={state.labor.technician_cost} onChange={val => setters.setLabor({ ...state.labor, technician_cost: val })} hint="Κόστος εργασίας ανά γραμμάριο" />
                    <LaborCostCard icon={<Coins size={14} />} label="Επιμετάλλωση (€/g)" value={state.labor.plating_cost_x} onChange={val => setters.setLabor({ ...state.labor, plating_cost_x: val })} hint="Κόστος επιμετάλλωσης ανά γραμμάριο" />
                    <LaborCostCard icon={<Gem size={14} />} label="Καρφωτικά/Πέτρες (€)" value={state.labor.stone_setting_cost} onChange={val => setters.setLabor({ ...state.labor, stone_setting_cost: val })} hint="Σταθερό κόστος" />
                </Panel>
                <Panel title="Ανάλυση κόστους" subtitle="Ζωντανή ενημέρωση" icon={Calculator} tone="blue" className="flex flex-col" bodyClassName="flex flex-1 flex-col">
                    <div className="flex-1 space-y-1">
                        <SummaryRow label="Ασήμι" value={state.costBreakdown?.silver || 0} sub={`${formatNumber(state.weight)}g @ ${formatDecimal(settings?.silver_price_gram)}€`} color="bg-slate-400" />
                        <SummaryRow label="Εργατικά" value={state.costBreakdown?.details?.technician_cost || 0} sub={`${formatDecimal(state.labor.technician_cost)}€ x ${formatNumber(state.weight)}g`} color="bg-blue-400" />
                        <SummaryRow label="Επιμετάλλωση" value={state.costBreakdown?.details?.plating_cost || 0} sub={`${formatDecimal(state.labor.plating_cost_x)}€ x ${formatNumber(state.weight)}g`} color="bg-amber-400" />
                        <SummaryRow label="Καρφωτικά" value={state.costBreakdown?.details?.stone_setting_cost || 0} sub="Σταθερό" color="bg-purple-400" />
                    </div>
                    <div className="mt-4 flex items-center justify-between rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-4 py-3 text-white shadow-md shadow-emerald-500/20">
                        <span className="text-xs font-black uppercase tracking-wider opacity-90">Σύνολο κόστους</span>
                        <span className="font-mono text-2xl font-black">{formatCurrency(state.masterEstimatedCost)}</span>
                    </div>
                </Panel>
            </div>
        </div>
    );
};
