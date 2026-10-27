import React from 'react';
import { Activity, Coins, Flame, Gem, Hammer, Users } from 'lucide-react';
import { GlobalSettings, Product } from '../../types';
import { formatCurrency } from '../../utils/pricingEngine';
import { LaborCostFormulaRow } from '../ProductRegistry/LaborCostFormulaRow';
import { TechnicianLaborFormulaRow } from '../ProductRegistry/TechnicianLaborFormulaRow';
import SkuColorizedText from '../SkuColorizedText';
import { LaborCostInput } from './detailsInputs';
import { DetailsSection } from './detailsUi';
import type { LaborFormulas } from './useLaborFormulas';

export interface AnalyticalCostingItem {
    key: string;
    suffix: string;
    description: string;
    costResult: { total: number; breakdown: any };
}

export default function LaborSection({
    product,
    setProduct,
    settings,
    formulas,
    variantSuffix,
    costingItems,
}: {
    product: Product;
    setProduct: React.Dispatch<React.SetStateAction<Product>>;
    settings: GlobalSettings;
    formulas: LaborFormulas;
    variantSuffix: string | null;
    costingItems: AnalyticalCostingItem[];
}) {
    const { castingFormula, platingXFormula, platingDFormula } = formulas;
    const setLabor = (patch: Partial<Product['labor']>) => setProduct(p => ({ ...p, labor: { ...p.labor, ...patch } }));

    return (
        <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <DetailsSection tone="labor" icon={Hammer} title="Εργατικά" subtitle="Τύπος: συντελεστής × βάση βάρους — κλειδώστε για χειροκίνητη τιμή">
                <div className="space-y-2">
                    <LaborCostFormulaRow
                        icon={<Flame size={14} />}
                        label="Χυτήριο (€)"
                        rate={castingFormula.rate}
                        weightBasis={castingFormula.weightBasis}
                        total={castingFormula.total}
                        isOverridden={castingFormula.isOverridden}
                        onRateChange={(r) => formulas.onRateChange('casting', r, castingFormula.weightBasis)}
                        onWeightChange={formulas.onCastingWeightChange}
                        onTotalChange={(t) => formulas.onTotalChange('casting', t)}
                        onToggleOverride={() => formulas.onToggleOverride('casting')}
                        hint={product.is_component ? 'Εξάρτημα STX — χωρίς χυτήριο' : 'Από συνολικό βάρος (βασικό + δευτερεύον)'}
                    />
                    <LaborCostInput label="Καρφωτής (€)" value={product.labor.setter_cost} onChange={v => setLabor({ setter_cost: v })} icon={<Gem size={14} />} />
                    <TechnicianLaborFormulaRow
                        settings={settings}
                        icon={<Hammer size={14} />}
                        labor={product.labor}
                        product={product}
                        useSplitTechnician={formulas.useSplitTechnician}
                        hasMixedTechnician={formulas.hasMixedTechnician}
                        selectedVariantSuffix={variantSuffix}
                        onRateChange={(r, basis) => formulas.onRateChange('technician', r, basis)}
                        onWeightChange={formulas.onTechnicianWeightChange}
                        onTotalChange={(t) => formulas.onTotalChange('technician', t)}
                        onToggleOverride={() => formulas.onToggleOverride('technician')}
                    />
                    <LaborCostFormulaRow
                        icon={<Coins size={14} />}
                        label="Επιμετάλλωση X/H (€)"
                        rate={platingXFormula.rate}
                        weightBasis={platingXFormula.weightBasis}
                        total={platingXFormula.total}
                        isOverridden={platingXFormula.isOverridden}
                        onRateChange={(r) => formulas.onRateChange('plating_x', r, platingXFormula.weightBasis)}
                        onWeightChange={() => { /* weight basis includes recipe — read-only */ }}
                        onTotalChange={(t) => formulas.onTotalChange('plating_x', t)}
                        onToggleOverride={() => formulas.onToggleOverride('plating_x')}
                        weightReadOnly
                        hint="Από συνολικό βάρος (βασικό + εξαρτήματα συνταγής)"
                    />
                    <LaborCostFormulaRow
                        icon={<Coins size={14} />}
                        label="Επιμετάλλωση D (€)"
                        rate={platingDFormula.rate}
                        weightBasis={platingDFormula.weightBasis}
                        total={platingDFormula.total}
                        isOverridden={platingDFormula.isOverridden}
                        onRateChange={(r) => formulas.onRateChange('plating_d', r, platingDFormula.weightBasis)}
                        onWeightChange={formulas.onPlatingDWeightChange}
                        onTotalChange={(t) => formulas.onTotalChange('plating_d', t)}
                        onToggleOverride={() => formulas.onToggleOverride('plating_d')}
                        hint="Από δευτερεύον βάρος (+ εξαρτήματα συνταγής)"
                    />
                    <LaborCostInput label="Φασόν/Έξτρα (€)" value={product.labor.subcontract_cost} onChange={v => setLabor({ subcontract_cost: v })} icon={<Users size={14} />} />
                </div>
            </DetailsSection>

            <DetailsSection tone="analysis" icon={Activity} title="Ανάλυση ανά παραλλαγή">
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full min-w-[30rem] text-xs">
                        <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            <tr>
                                <th className="px-3 py-2 text-left">Κωδικός</th>
                                <th className="px-2 py-2 text-right">Ασήμι</th>
                                <th className="px-2 py-2 text-right">Υλικά</th>
                                <th className="px-2 py-2 text-right">Εργατικά</th>
                                <th className="px-3 py-2 text-right">Σύνολο</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {costingItems.map(({ key, suffix, description, costResult }) => {
                                const d = costResult.breakdown.details || {};
                                const isActive = (variantSuffix ?? '') === suffix;
                                return (
                                    <tr
                                        key={key}
                                        className={isActive ? 'bg-emerald-50/60' : 'hover:bg-slate-50'}
                                    >
                                        <td className="px-3 py-2">
                                            <div className="font-bold"><SkuColorizedText sku={product.sku} suffix={suffix} gender={product.gender} /></div>
                                            <div className="truncate text-[10px] text-slate-400">{description}</div>
                                            <div className="mt-0.5 flex flex-wrap gap-x-2 font-mono text-[10px] text-slate-400">
                                                <span>Χυτ {formatCurrency(d.casting_cost || 0)}</span>
                                                <span>Τεχν {formatCurrency(d.technician_cost || 0)}</span>
                                                <span>Καρφ {formatCurrency(d.setter_cost || 0)}</span>
                                                <span>Επιμ {formatCurrency(d.plating_cost || 0)}</span>
                                                <span>Φασόν {formatCurrency(d.subcontract_cost || 0)}</span>
                                            </div>
                                        </td>
                                        <td className="px-2 py-2 text-right font-mono text-slate-600">{formatCurrency(costResult.breakdown.silver)}</td>
                                        <td className="px-2 py-2 text-right font-mono text-slate-600">{formatCurrency(costResult.breakdown.materials)}</td>
                                        <td className="px-2 py-2 text-right font-mono text-slate-600">{formatCurrency(costResult.breakdown.labor)}</td>
                                        <td className="px-3 py-2 text-right font-mono text-sm font-black text-emerald-700">{formatCurrency(costResult.total)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </DetailsSection>
        </div>
    );
}
