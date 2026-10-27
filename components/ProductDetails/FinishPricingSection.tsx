import { formatNumber } from '../../utils/numberFormat';
import React from 'react';
import { ArrowUpRight, Calculator, Coins, Wand2 } from 'lucide-react';
import { Product, ProductVariant } from '../../types';
import { FINISH_CODES } from '../../constants';
import { formatCurrency, formatDecimal } from '../../utils/pricingEngine';
import { DetailsSection, getMarginTone } from './detailsUi';
import type { SkuPricing } from './useSkuPricing';

const FINISH_COLORS: Record<string, { bg: string, border: string, label: string, input: string, euro: string, dot: string }> = {
    '':  { bg: 'bg-slate-50/80',  border: 'border-slate-200',  label: 'text-slate-600',  input: 'border-slate-200 text-slate-800 focus:ring-slate-400/20',  euro: 'text-slate-400',  dot: 'bg-gradient-to-br from-slate-300 to-slate-500' },
    'P': { bg: 'bg-stone-50/80',  border: 'border-stone-200',  label: 'text-stone-700',  input: 'border-stone-200 text-stone-800 focus:ring-stone-400/20',  euro: 'text-stone-400',  dot: 'bg-gradient-to-br from-stone-400 to-stone-600' },
    'X': { bg: 'bg-amber-50/80',  border: 'border-amber-200',  label: 'text-amber-700',  input: 'border-amber-200 text-amber-900 focus:ring-amber-400/20',  euro: 'text-amber-400',  dot: 'bg-gradient-to-br from-amber-400 to-yellow-600' },
    'D': { bg: 'bg-orange-50/80', border: 'border-orange-200', label: 'text-orange-700', input: 'border-orange-200 text-orange-900 focus:ring-orange-400/20', euro: 'text-orange-400', dot: 'bg-gradient-to-br from-orange-400 to-rose-500' },
    'H': { bg: 'bg-cyan-50/80',   border: 'border-cyan-200',   label: 'text-cyan-700',   input: 'border-cyan-200 text-cyan-900 focus:ring-cyan-400/20',   euro: 'text-cyan-400',   dot: 'bg-gradient-to-br from-cyan-300 to-sky-500' },
};

function FinishPriceCard({
    code,
    price,
    cost,
    variantCount,
    suggested,
    showSuggestion,
    onChange,
}: {
    code: string;
    price: number;
    cost: number;
    variantCount?: number;
    suggested: number;
    showSuggestion: boolean;
    /** `manual` is false when the user accepts the formula suggestion. */
    onChange: (value: number, manual: boolean) => void;
}) {
    const fc = FINISH_COLORS[code] || FINISH_COLORS[''];
    const label = FINISH_CODES[code] || (code === '' ? 'Λουστρέ' : code);
    const margin = price > 0 ? ((price - cost) / price) * 100 : 0;
    const tone = getMarginTone(margin);

    return (
        <div className={`${fc.bg} rounded-xl border ${fc.border} p-3.5 transition-shadow hover:shadow-md`}>
            <div className="mb-2 flex items-center justify-between gap-2">
                <span className={`flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide ${fc.label}`}>
                    <span className={`h-2.5 w-2.5 rounded-full ${fc.dot} shadow-sm`} /> {label}
                </span>
                {typeof variantCount === 'number' && (
                    <span className="rounded bg-white/80 px-1.5 py-0.5 text-[10px] font-bold text-slate-500 ring-1 ring-slate-200/70">
                        {formatNumber(variantCount)} κωδ.
                    </span>
                )}
            </div>
            <div className="relative">
                <input
                    type="number" step="0.01"
                    aria-label={`Χονδρική ${label}`}
                    className={`w-full rounded-lg border bg-white p-2.5 pr-7 font-mono text-base font-bold shadow-sm outline-none focus:ring-2 ${fc.input}`}
                    value={price}
                    onChange={e => onChange(parseFloat(e.target.value) || 0, true)}
                />
                <span className={`absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-semibold ${fc.euro}`}>€</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px]">
                <span className="text-slate-500">Κόστος <span className="font-mono font-bold text-slate-700">{formatCurrency(cost)}</span></span>
                {price > 0 && <span className={`rounded px-1.5 py-0.5 font-bold ${tone.bg} ${tone.text}`}>{formatDecimal(margin, 0)}%</span>}
            </div>
            {showSuggestion && (
                <button
                    type="button"
                    onClick={() => onChange(suggested, false)}
                    className="mt-2 flex w-full items-center justify-between rounded-lg border border-dashed border-blue-200 bg-white/70 px-2 py-1 text-[11px] font-bold text-blue-600 transition-colors hover:bg-blue-50 animate-in fade-in slide-in-from-top-1"
                    title="Εφαρμογή προτεινόμενης τιμής"
                >
                    <span className="flex items-center gap-1"><ArrowUpRight size={11} /> Πρόταση</span>
                    <span className="font-mono">{formatDecimal(suggested, 2)}€</span>
                </button>
            )}
        </div>
    );
}

/** Wholesale prices per finish group with optional bulk-repricing tools (in-house SKUs). */
export default function FinishPricingSection({
    product,
    setProduct,
    hasVariants,
    finishGroups,
    sortedFinishCodes,
    masterCost,
    pricing,
}: {
    product: Product;
    setProduct: React.Dispatch<React.SetStateAction<Product>>;
    hasVariants: boolean;
    finishGroups: Record<string, ProductVariant[]>;
    sortedFinishCodes: string[];
    masterCost: number;
    pricing: SkuPricing;
}) {
    const { showRepriceTool, toggleRepriceTool, targetMargin, setTargetMargin, getSuggestedPriceForFinishGroup, handleApplyAllSuggestions } = pricing;

    const setGroupPrice = (group: ProductVariant[], value: number, manual: boolean) => {
        const suffixes = new Set(group.map(v => v.suffix));
        setProduct(prev => ({
            ...prev,
            variants: (prev.variants || []).map(v => suffixes.has(v.suffix)
                ? { ...v, selling_price: value, selling_price_manual_override: manual }
                : v),
        }));
    };

    return (
        <DetailsSection
            tone="commerce"
            icon={Coins}
            title="Τιμές χονδρικής"
            subtitle={hasVariants ? 'Ανά φινίρισμα — εφαρμόζεται σε όλες τις παραλλαγές της ομάδας' : 'Βασική τιμή πώλησης'}
            actions={(
                <button
                    type="button"
                    onClick={toggleRepriceTool}
                    className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-all ${showRepriceTool ? 'border-emerald-200 bg-emerald-100 text-emerald-700' : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700'}`}
                    title="Εργαλείο ανατιμολόγησης"
                >
                    <Calculator size={14} /> Ανατιμολόγηση
                </button>
            )}
        >
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-5">
                {!hasVariants && (
                    <FinishPriceCard
                        code=""
                        price={product.selling_price}
                        cost={masterCost}
                        suggested={getSuggestedPriceForFinishGroup('', 'formula', targetMargin)}
                        showSuggestion={showRepriceTool}
                        onChange={(value, manual) => setProduct(prev => ({ ...prev, selling_price: value, selling_price_manual_override: manual }))}
                    />
                )}
                {hasVariants && sortedFinishCodes.map(code => {
                    const group = finishGroups[code];
                    return (
                        <FinishPriceCard
                            key={code}
                            code={code}
                            price={group[0]?.selling_price || 0}
                            cost={group[0]?.active_price || 0}
                            variantCount={group.length}
                            suggested={getSuggestedPriceForFinishGroup(code, 'formula', targetMargin)}
                            showSuggestion={showRepriceTool}
                            onChange={(value, manual) => setGroupPrice(group, value, manual)}
                        />
                    );
                })}
            </div>

            {showRepriceTool && (
                <div className="mt-4 grid gap-4 rounded-xl border border-blue-100 bg-blue-50/40 p-4 animate-in slide-in-from-top-2 md:grid-cols-[1fr_auto]">
                    <div>
                        <h4 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-blue-700">
                            <Wand2 size={13} /> Μαζική ανατιμολόγηση
                        </h4>
                        <label className="mb-1.5 block text-[10px] font-bold uppercase text-slate-500">Στόχος περιθωρίου</label>
                        <div className="flex items-center gap-3">
                            <input
                                type="range" min="10" max="90" step="5"
                                value={targetMargin}
                                onChange={e => setTargetMargin(parseInt(e.target.value))}
                                className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-slate-200 accent-emerald-500"
                            />
                            <span className="w-14 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-center text-xs font-bold text-slate-700 shadow-sm">{formatNumber(targetMargin)}%</span>
                        </div>
                    </div>
                    <div className="flex flex-col justify-end gap-2 md:w-64">
                        <button type="button" onClick={() => handleApplyAllSuggestions('margin')} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50">
                            Εφαρμογή περιθωρίου {formatNumber(targetMargin)}%
                        </button>
                        <button type="button" onClick={() => handleApplyAllSuggestions('formula')} className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-emerald-200/50 transition-all hover:bg-emerald-700 active:scale-[0.98]">
                            <Calculator size={14} /> Τύπος Ilios (Smart)
                        </button>
                    </div>
                    <p className="text-[10px] text-slate-500 md:col-span-2">Υπολογίζει ξεχωριστά για κάθε παραλλαγή βάσει υλικών & βάρους. Οι αλλαγές ισχύουν μετά την αποθήκευση.</p>
                </div>
            )}
        </DetailsSection>
    );
}
