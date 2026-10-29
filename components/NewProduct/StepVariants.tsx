import { formatNumber } from '../../utils/numberFormat';
import React, { useCallback } from 'react';
import { Trash2, Layers, Wand2 } from 'lucide-react';
import { ProductionType, Gender } from '../../types';
import { useNewProductState } from '../../hooks/useNewProductState';
import { estimateVariantCost, formatCurrency } from '../../utils/pricingEngine';
import SmartVariantBuilder from '../variants/SmartVariantBuilder';
import { Panel, StepHeader, StatPill, VariantSuffixBadge } from './wizardUi';

interface Props {
    formState: ReturnType<typeof useNewProductState>;
    settings?: any;
    materials: any[];
    products: any[];
}

export const StepVariants: React.FC<Props> = ({ formState, settings, materials, products }) => {
    const { state, actions } = formState;
    const gender = (state.gender || Gender.Unisex) as Gender;
    const masterSku = (state.detectedMasterSku || state.sku || '').toUpperCase();
    const stepNumber = state.productionType === ProductionType.Imported ? 3 : 4;

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const plan = useCallback(actions.planVariantBatch, [state.variants, state.plating]);
    const estimateCost = useCallback(
        (suffix: string) => estimateVariantCost(state.currentTempProduct, suffix, settings, materials, products).total,
        [state.currentTempProduct, settings, materials, products],
    );

    return (
        <div className="animate-in fade-in slide-in-from-right-4 duration-300">
            <StepHeader
                step={stepNumber}
                icon={Layers}
                title="Παραλλαγές"
                subtitle="Επιλέξτε φινιρίσματα και πέτρες — δημιουργούνται μόνο οι συνδυασμοί που λείπουν."
                aside={<>
                    <StatPill label="Βάση" value={formatCurrency(state.masterEstimatedCost)} tone="emerald" />
                    <StatPill label="Παραλλαγές" value={formatNumber(state.variants.length)} />
                </>}
            />

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
                {/* Builder */}
                <Panel title="Έξυπνη προσθήκη" subtitle="Κάντε κλικ για επιλογή — πολλαπλές πέτρες μαζί" icon={Wand2} tone="amber">
                    <SmartVariantBuilder
                        masterSku={masterSku}
                        gender={gender}
                        initialFinishes={state.selectedFinishes.length > 0 ? state.selectedFinishes : ['']}
                        plan={plan}
                        onCreate={actions.addVariantsBatch}
                        onManualAdd={actions.addManualVariant}
                        estimateCost={estimateCost}
                    />
                </Panel>
                {/* Variant list */}
                <Panel
                    title="Λίστα παραλλαγών"
                    subtitle="Η χονδρική ορίζεται στο τελευταίο βήμα"
                    icon={Layers}
                    tone="emerald"
                    className="flex flex-col xl:max-h-[calc(100vh-260px)]"
                    bodyClassName="flex-1 overflow-y-auto custom-scrollbar space-y-2"
                    actions={state.variants.length > 0 ? (
                        <button type="button" onClick={actions.clearVariants} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600">
                            <Trash2 size={12} /> Όλες
                        </button>
                    ) : undefined}
                >
                    {state.costedVariants.map((variant, index) => {
                        const breakdown = estimateVariantCost(state.currentTempProduct, variant.suffix, settings, materials, products);
                        const liveCost = variant.active_price ?? breakdown.total;
                        const diff = liveCost - state.masterEstimatedCost;
                        const details = breakdown.breakdown.details;
                        const platingCost = details.plating_cost || 0;
                        const stoneDiff = details.stone_diff || 0;

                        return (
                            <div key={`${variant.suffix}-${index}`} className="group flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-3 transition-all hover:border-emerald-200 hover:shadow-md animate-in fade-in slide-in-from-bottom-1">
                                <VariantSuffixBadge suffix={variant.suffix} gender={gender} size="md" />
                                <div className="min-w-0 flex-1">
                                    <input
                                        type="text"
                                        value={variant.description}
                                        onChange={(e) => actions.updateVariant(index, 'description', e.target.value)}
                                        className="w-full truncate rounded-md bg-transparent px-1 py-0.5 text-sm font-bold text-slate-800 outline-none transition-colors hover:bg-slate-50 focus:bg-slate-50 focus:ring-2 focus:ring-emerald-500/20"
                                    />
                                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 px-1">
                                        <span className="font-mono text-[11px] font-bold text-slate-500">{formatCurrency(liveCost)}</span>
                                        {platingCost > 0 && <span className="rounded-md bg-amber-50 px-1.5 py-px text-[10px] font-bold text-amber-700">+{formatCurrency(platingCost)} επιμ.</span>}
                                        {Math.abs(stoneDiff) > 0.01 && <span className="rounded-md bg-violet-50 px-1.5 py-px text-[10px] font-bold text-violet-700">{stoneDiff > 0 ? '+' : ''}{formatCurrency(stoneDiff)} υλικά</span>}
                                        {platingCost === 0 && Math.abs(stoneDiff) <= 0.01 && Math.abs(diff) > 0.01 && (
                                            <span className={`text-[10px] font-bold ${diff > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{diff > 0 ? '+' : ''}{formatCurrency(diff)}</span>
                                        )}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => actions.removeVariant(index)}
                                    className="rounded-lg p-2 text-slate-300 transition-all hover:bg-rose-50 hover:text-rose-500 sm:opacity-0 sm:group-hover:opacity-100"
                                    aria-label={`Διαγραφή ${variant.suffix || 'βασικής'}`}
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        );
                    })}
                    {state.variants.length === 0 && (
                        <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 px-6 py-14 text-center">
                            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-slate-50 text-slate-300"><Layers size={28} /></div>
                            <p className="text-sm font-bold text-slate-500">Δεν υπάρχουν παραλλαγές</p>
                            <p className="max-w-xs text-xs text-slate-400">Το προϊόν θα αποθηκευτεί μόνο στην αρχική του μορφή. Χρησιμοποιήστε την έξυπνη προσθήκη για να δημιουργήσετε συνδυασμούς.</p>
                        </div>
                    )}
                </Panel>
            </div>
        </div>
    );
};
