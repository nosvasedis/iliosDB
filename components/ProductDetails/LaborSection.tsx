import React, { useMemo } from 'react';
import { Activity, Coins, Eye, Flame, Gem, Hammer, Users } from 'lucide-react';
import { GlobalSettings, Product } from '../../types';
import { formatCurrency, formatDecimal, getVariantComponents } from '../../utils/pricingEngine';
import { resolveTechnicianRow } from '../ProductRegistry/TechnicianLaborFormulaRow';
import SkuColorizedText from '../SkuColorizedText';
import { FINISH_DOTS } from './DetailsHeader';
import { DetailsSection, getMarginTone } from './detailsUi';
import { LaborSheetHeader, LaborSheetRow, TechnicianTierStrip } from './LaborSheet';
import type { LaborFormulas } from './useLaborFormulas';

export interface AnalyticalCostingItem {
    key: string;
    suffix: string;
    description: string;
    costResult: { total: number; breakdown: any };
}

const COST_PARTS = [
    { key: 'silver', label: 'Ασήμι', bar: 'bg-slate-400' },
    { key: 'materials', label: 'Υλικά', bar: 'bg-sky-500' },
    { key: 'labor', label: 'Εργατικά', bar: 'bg-amber-500' },
] as const;

const LABOR_PARTS: { key: string; label: string }[] = [
    { key: 'casting_cost', label: 'Χυτήριο' },
    { key: 'technician_cost', label: 'Τεχνίτης' },
    { key: 'setter_cost', label: 'Καρφωτής' },
    { key: 'plating_cost', label: 'Επιμετ.' },
    { key: 'subcontract_cost', label: 'Φασόν' },
];

function VariantCostCard({
    item,
    product,
    price,
    retailMultiplier,
    isActive,
    onView,
}: {
    item: AnalyticalCostingItem;
    product: Product;
    price: number;
    retailMultiplier: number;
    isActive: boolean;
    onView?: () => void;
}) {
    const breakdown = item.costResult.breakdown || {};
    const details = breakdown.details || {};
    const cost = item.costResult.total;
    const partsTotal = COST_PARTS.reduce((sum, part) => sum + Math.max(0, breakdown[part.key] || 0), 0);
    const margin = price > 0 ? ((price - cost) / price) * 100 : 0;
    const tone = getMarginTone(margin);
    const finishDot = FINISH_DOTS[getVariantComponents(item.suffix, product.gender).finish.code] || FINISH_DOTS[''];

    return (
        <article className={`rounded-xl border bg-white p-4 transition-shadow ${isActive ? 'border-emerald-300 shadow-sm ring-2 ring-emerald-100' : 'border-slate-200 hover:shadow-sm'}`}>
            <header className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${finishDot}`} />
                        <SkuColorizedText sku={product.sku} suffix={item.suffix} gender={product.gender} className="text-sm font-bold" />
                        {isActive && <span className="rounded bg-emerald-100 px-1.5 py-px text-[10px] font-semibold text-emerald-700">Σε προβολή</span>}
                    </div>
                    <p className="mt-0.5 truncate pl-[1.125rem] text-xs text-slate-500">{item.description}</p>
                </div>
                <div className="flex shrink-0 items-start gap-1">
                    <div className="text-right">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Κόστος</div>
                        <div className="font-mono text-lg font-bold leading-tight text-slate-900">{formatCurrency(cost)}</div>
                    </div>
                    {onView && !isActive && (
                        <button
                            type="button"
                            onClick={onView}
                            title="Προβολή στην καρτέλα"
                            aria-label="Προβολή στην καρτέλα"
                            className="-mr-1 inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                        >
                            <Eye size={15} />
                        </button>
                    )}
                </div>
            </header>

            <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-slate-100">
                {partsTotal > 0 && COST_PARTS.map(part => (
                    <div key={part.key} className={`h-full ${part.bar}`} style={{ width: `${(Math.max(0, breakdown[part.key] || 0) / partsTotal) * 100}%` }} title={part.label} />
                ))}
            </div>

            <dl className="mt-3 grid grid-cols-3 gap-2">
                {COST_PARTS.map(part => (
                    <div key={part.key} className="rounded-lg bg-slate-50 px-2.5 py-1.5">
                        <dt className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                            <span className={`h-1.5 w-1.5 rounded-full ${part.bar}`} /> {part.label}
                        </dt>
                        <dd className="font-mono text-[13px] font-bold text-slate-800">{formatCurrency(breakdown[part.key] || 0)}</dd>
                    </div>
                ))}
            </dl>

            <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                {LABOR_PARTS.map(part => {
                    const value = details[part.key] || 0;
                    return (
                        <span key={part.key} className={value > 0 ? '' : 'text-slate-300'}>
                            {part.label} <span className="font-mono font-semibold">{formatCurrency(value)}</span>
                        </span>
                    );
                })}
            </div>

            {price > 0 && (
                <footer className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5 text-xs">
                    <span className="text-slate-500">
                        Χονδρική <span className="font-mono font-bold text-slate-800">{formatCurrency(price)}</span>
                        <span className="mx-1.5 text-slate-300">·</span>
                        Λιανική <span className="font-mono font-bold text-slate-800">{formatCurrency(price * retailMultiplier)}</span>
                    </span>
                    <span className={`rounded-md px-2 py-0.5 font-bold ${tone.bg} ${tone.text}`}>Περιθ. {formatDecimal(margin, 1)}%</span>
                </footer>
            )}
        </article>
    );
}

export default function LaborSection({
    product,
    setProduct,
    settings,
    formulas,
    variantSuffix,
    costingItems,
    retailMultiplier,
    onViewVariant,
}: {
    product: Product;
    setProduct: React.Dispatch<React.SetStateAction<Product>>;
    settings: GlobalSettings;
    formulas: LaborFormulas;
    variantSuffix: string | null;
    costingItems: AnalyticalCostingItem[];
    retailMultiplier: number;
    onViewVariant: (suffix: string) => void;
}) {
    const { castingFormula, platingXFormula, platingDFormula } = formulas;
    const setLabor = (patch: Partial<Product['labor']>) => setProduct(p => ({ ...p, labor: { ...p.labor, ...patch } }));
    const technician = useMemo(
        () => resolveTechnicianRow({
            settings,
            labor: product.labor,
            product,
            useSplitTechnician: formulas.useSplitTechnician,
            hasMixedTechnician: formulas.hasMixedTechnician,
            selectedVariantSuffix: variantSuffix,
        }),
        [settings, product, formulas.useSplitTechnician, formulas.hasMixedTechnician, variantSuffix],
    );

    const activeItem = costingItems.find(item => item.suffix === (variantSuffix ?? '')) ?? costingItems[0];
    const activeLabor = activeItem?.costResult.breakdown?.labor || 0;
    const priceFor = (suffix: string) => {
        const variant = product.variants?.find(v => v.suffix === suffix);
        return variant ? (variant.selling_price || 0) : (product.selling_price || 0);
    };

    return (
        <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <DetailsSection tone="labor" icon={Hammer} className="overflow-hidden" title="Εργατικά" subtitle="Συντελεστής × βάση βάρους · το λουκέτο κλειδώνει χειροκίνητο ποσό">
                <div className="-mx-5 -mb-5 overflow-x-auto">
                    <div className="min-w-[36rem] divide-y divide-slate-100">
                        <LaborSheetHeader />
                        <LaborSheetRow
                            icon={Flame}
                            label="Χυτήριο"
                            hint={product.is_component ? 'Εξάρτημα STX — χωρίς χυτήριο' : 'Συνολικό βάρος (βασικό + δευτερεύον)'}
                            total={castingFormula.total}
                            isOverridden={castingFormula.isOverridden}
                            formula={{
                                rate: castingFormula.rate,
                                weightBasis: castingFormula.weightBasis,
                                onRateChange: (r) => formulas.onRateChange('casting', r, castingFormula.weightBasis),
                                onWeightChange: formulas.onCastingWeightChange,
                            }}
                            onTotalChange={(t) => formulas.onTotalChange('casting', t)}
                            onToggleOverride={() => formulas.onToggleOverride('casting')}
                        />
                        <LaborSheetRow
                            icon={Hammer}
                            label="Τεχνίτης"
                            hint={technician.hint ?? (technician.readOnly ? 'Κανόνας της παραλλαγής σε προβολή' : 'Κλιμάκωση ανά συνολικό βάρος')}
                            contextLabel={technician.contextLabel}
                            readOnly={technician.readOnly}
                            total={technician.line.total}
                            isOverridden={technician.readOnly ? false : technician.line.isOverridden}
                            formula={{
                                rate: technician.line.rate,
                                weightBasis: technician.line.weightBasis,
                                onRateChange: (r) => formulas.onRateChange('technician', r, technician.line.weightBasis),
                                onWeightChange: formulas.onTechnicianWeightChange,
                            }}
                            onTotalChange={(t) => formulas.onTotalChange('technician', t)}
                            onToggleOverride={() => formulas.onToggleOverride('technician')}
                            footer={technician.showTierScale ? (
                                <TechnicianTierStrip
                                    settings={settings}
                                    primaryWeightG={technician.tierPrimaryWeight}
                                    secondaryWeightG={technician.tierSecondaryWeight}
                                />
                            ) : undefined}
                        />
                        <LaborSheetRow
                            icon={Gem}
                            label="Καρφωτής"
                            hint="Ανά τεμάχιο"
                            total={product.labor.setter_cost}
                            onTotalChange={v => setLabor({ setter_cost: v })}
                        />
                        <LaborSheetRow
                            icon={Coins}
                            label="Επιμετάλλωση X/H"
                            hint="Βασικό βάρος + εξαρτήματα συνταγής"
                            total={platingXFormula.total}
                            isOverridden={platingXFormula.isOverridden}
                            formula={{
                                rate: platingXFormula.rate,
                                weightBasis: platingXFormula.weightBasis,
                                onRateChange: (r) => formulas.onRateChange('plating_x', r, platingXFormula.weightBasis),
                            }}
                            onTotalChange={(t) => formulas.onTotalChange('plating_x', t)}
                            onToggleOverride={() => formulas.onToggleOverride('plating_x')}
                        />
                        <LaborSheetRow
                            icon={Coins}
                            label="Επιμετάλλωση D"
                            hint="Δευτερεύον βάρος + εξαρτήματα συνταγής"
                            total={platingDFormula.total}
                            isOverridden={platingDFormula.isOverridden}
                            formula={{
                                rate: platingDFormula.rate,
                                weightBasis: platingDFormula.weightBasis,
                                onRateChange: (r) => formulas.onRateChange('plating_d', r, platingDFormula.weightBasis),
                                onWeightChange: formulas.onPlatingDWeightChange,
                            }}
                            onTotalChange={(t) => formulas.onTotalChange('plating_d', t)}
                            onToggleOverride={() => formulas.onToggleOverride('plating_d')}
                        />
                        <LaborSheetRow
                            icon={Users}
                            label="Φασόν / Έξτρα"
                            hint="Εξωτερική εργασία ανά τεμάχιο"
                            total={product.labor.subcontract_cost}
                            onTotalChange={v => setLabor({ subcontract_cost: v })}
                        />
                        <div className="flex items-center justify-between gap-3 bg-slate-50 px-4 py-3">
                            <div className="min-w-0">
                                <div className="text-[11px] font-bold uppercase tracking-wide text-slate-600">Σύνολο εργατικών</div>
                                <div className="truncate text-[11px] text-slate-400">
                                    Για {activeItem ? `${product.sku}${activeItem.suffix}` : product.sku} — η επιμετάλλωση εξαρτάται από το φινίρισμα
                                </div>
                            </div>
                            <span className="font-mono text-lg font-bold text-slate-900">{formatCurrency(activeLabor)}</span>
                        </div>
                    </div>
                </div>
            </DetailsSection>

            <DetailsSection
                tone="analysis"
                icon={Activity}
                title="Ανάλυση κόστους"
                subtitle={costingItems.length > 1 ? `${costingItems.length} παραλλαγές · ασήμι, υλικά & εργατικά ανά κωδικό` : 'Ασήμι, υλικά & εργατικά'}
            >
                <div className="space-y-3">
                    {costingItems.map(item => (
                        <VariantCostCard
                            key={item.key}
                            item={item}
                            product={product}
                            price={priceFor(item.suffix)}
                            retailMultiplier={retailMultiplier}
                            isActive={(product.variants?.length ?? 0) > 0 && (variantSuffix ?? '') === item.suffix}
                            onView={(product.variants?.length ?? 0) > 0 ? () => onViewVariant(item.suffix) : undefined}
                        />
                    ))}
                </div>
            </DetailsSection>
        </div>
    );
}
