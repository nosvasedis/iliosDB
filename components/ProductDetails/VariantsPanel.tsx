import { formatNumber } from '../../utils/numberFormat';
import React from 'react';
import { Calculator, Eye, Layers, Trash2, Wand2 } from 'lucide-react';
import { GlobalSettings, Material, Product, ProductVariant } from '../../types';
import { formatCurrency, formatDecimal, getVariantComponents } from '../../utils/pricingEngine';
import SkuColorizedText from '../SkuColorizedText';
import SmartVariantAddPanel from './SmartVariantAddPanel';
import { FINISH_DOTS } from './DetailsHeader';
import { DetailsButton, DetailsIconButton, DetailsSection, getMarginTone } from './detailsUi';
import type { SkuPricing } from './useSkuPricing';

export default function VariantsPanel({
    product,
    setProduct,
    sortedVariants,
    activeSuffix,
    settings,
    allMaterials,
    allProducts,
    pricing,
    onViewVariant,
    showToast,
}: {
    product: Product;
    setProduct: React.Dispatch<React.SetStateAction<Product>>;
    sortedVariants: ProductVariant[];
    activeSuffix: string | null;
    settings: GlobalSettings;
    allMaterials: Material[];
    allProducts: Product[];
    pricing: SkuPricing;
    onViewVariant: (index: number) => void;
    showToast: (message: string, type: 'success' | 'error' | 'info') => void;
}) {
    const isComponent = !!product.is_component;

    const addVariants = (newVariants: ProductVariant[]) => {
        if (!newVariants.length) return;
        setProduct(prev => ({ ...prev, variants: [...(prev.variants || []), ...newVariants] }));
    };
    const updateVariant = (suffix: string, patch: Partial<ProductVariant>) => {
        setProduct(prev => ({
            ...prev,
            variants: (prev.variants || []).map(v => v.suffix === suffix
                ? { ...v, ...patch, ...('selling_price' in patch ? { selling_price_manual_override: true } : {}) }
                : v),
        }));
    };
    const deleteVariant = (suffix: string) => {
        setProduct(prev => ({ ...prev, variants: (prev.variants || []).filter(v => v.suffix !== suffix) }));
    };

    const pricedVariants = sortedVariants.filter(v => (v.selling_price || 0) > 0);
    const averageMargin = pricedVariants.length
        ? pricedVariants.reduce((sum, v) => sum + (((v.selling_price || 0) - (v.active_price || 0)) / (v.selling_price || 1)) * 100, 0) / pricedVariants.length
        : 0;
    const unpricedCount = sortedVariants.length - pricedVariants.length;

    return (
        <div className="space-y-5 animate-in fade-in">
            <SmartVariantAddPanel
                product={product}
                settings={settings}
                allMaterials={allMaterials}
                allProducts={allProducts}
                existingVariants={product.variants || []}
                onAddVariants={addVariants}
                showToast={showToast}
            />

            <DetailsSection
                tone="variants"
                icon={Layers}
                title={<>Παραλλαγές <span className="ml-1 text-slate-400">({formatNumber(sortedVariants.length)})</span></>}
                subtitle={!isComponent && sortedVariants.length > 0
                    ? `Μ.Ο. περιθωρίου ${formatDecimal(averageMargin, 1)}%${unpricedCount > 0 ? ` · ${formatNumber(unpricedCount)} χωρίς τιμή` : ''}`
                    : undefined}
                actions={!isComponent && sortedVariants.length > 0 ? (
                    <DetailsButton icon={Calculator} onClick={() => pricing.handleApplyAllSuggestions('formula')}>
                        Αυτόματη τιμολόγηση
                    </DetailsButton>
                ) : undefined}
            >
                {sortedVariants.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-sm italic text-slate-400">
                        Δεν υπάρχουν παραλλαγές. Χρησιμοποιήστε τα εργαλεία παραπάνω για να προσθέσετε.
                    </div>
                ) : (
                    <div className="overflow-x-auto rounded-xl border border-slate-200">
                        <table className="w-full min-w-[40rem] text-sm">
                            <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                <tr>
                                    <th className="px-3 py-2 text-left">Κωδικός</th>
                                    <th className="px-3 py-2 text-left">Περιγραφή</th>
                                    <th className="px-3 py-2 text-right">Κόστος</th>
                                    {!isComponent && <th className="px-3 py-2 text-right">Χονδρική</th>}
                                    {!isComponent && <th className="px-3 py-2 text-right">Περιθώριο</th>}
                                    <th className="w-28 px-2 py-2" />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {sortedVariants.map((v, index) => {
                                    const isActive = activeSuffix === v.suffix;
                                    const finishDot = FINISH_DOTS[getVariantComponents(v.suffix, product.gender).finish.code] || FINISH_DOTS[''];
                                    const price = v.selling_price || 0;
                                    const cost = v.active_price || 0;
                                    const margin = price > 0 ? ((price - cost) / price) * 100 : 0;
                                    const tone = getMarginTone(margin);
                                    return (
                                        <tr key={v.suffix} className={`group transition-colors ${isActive ? 'bg-emerald-50/50' : 'hover:bg-slate-50/70'}`}>
                                            <td className="whitespace-nowrap px-3 py-2">
                                                <span className="flex items-center gap-2">
                                                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${finishDot}`} />
                                                    <SkuColorizedText sku={product.sku} suffix={v.suffix} gender={product.gender} className="text-sm font-bold" />
                                                    {isActive && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-emerald-700">Σε προβολή</span>}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2">
                                                <input
                                                    value={v.description}
                                                    onChange={e => updateVariant(v.suffix, { description: e.target.value })}
                                                    aria-label={`Περιγραφή ${product.sku}${v.suffix}`}
                                                    className="w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-sm font-medium text-slate-700 outline-none transition-colors placeholder-slate-300 hover:border-slate-200 focus:border-blue-300 focus:bg-white"
                                                />
                                            </td>
                                            <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-xs font-bold text-slate-600">{formatCurrency(cost)}</td>
                                            {!isComponent && (
                                                <td className="px-3 py-2 text-right">
                                                    <div className="relative ml-auto w-24">
                                                        <input
                                                            type="number" step="0.1"
                                                            value={v.selling_price || ''}
                                                            placeholder="—"
                                                            onChange={e => updateVariant(v.suffix, { selling_price: parseFloat(e.target.value) })}
                                                            aria-label={`Χονδρική ${product.sku}${v.suffix}`}
                                                            className="w-full rounded-lg border border-emerald-100 bg-emerald-50/60 p-1.5 pr-5 text-right font-mono text-sm font-bold text-emerald-800 outline-none transition-all focus:bg-white focus:ring-2 focus:ring-emerald-200"
                                                        />
                                                        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-emerald-400">€</span>
                                                    </div>
                                                </td>
                                            )}
                                            {!isComponent && (
                                                <td className="px-3 py-2 text-right">
                                                    {price > 0
                                                        ? <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${tone.bg} ${tone.text}`}>{formatDecimal(margin, 1)}%</span>
                                                        : <span className="text-xs text-slate-300">—</span>}
                                                </td>
                                            )}
                                            <td className="px-2 py-2">
                                                <div className="flex items-center justify-end gap-0.5">
                                                    <DetailsIconButton icon={Eye} label={isActive ? 'Σε προβολή στην καρτέλα' : 'Προβολή στην καρτέλα'} active={isActive} onClick={() => onViewVariant(index)} />
                                                    {!isComponent && (
                                                        <DetailsIconButton icon={Wand2} label="Υπολογισμός τιμής με τον τύπο" onClick={() => pricing.applyFormulaToVariant(v.suffix)} />
                                                    )}
                                                    <DetailsIconButton icon={Trash2} label="Διαγραφή παραλλαγής" variant="danger" onClick={() => deleteVariant(v.suffix)} />
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </DetailsSection>
        </div>
    );
}
