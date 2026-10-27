import { formatNumber } from '../../utils/numberFormat';
import React from 'react';
import { Edit3, Info, Palette, Scale, Tag, Users, Weight } from 'lucide-react';
import { Gender, Mold, PlatingType, Product, ProductVariant } from '../../types';
import { applySkipCasting } from '../../features/products';
import { InvoiceTotalWeightResult } from '../../utils/invoiceTotalWeight';
import InvoiceTotalWeightField from './InvoiceTotalWeightField';
import ProductionTypeBadge from './ProductionTypeBadge';
import FinishPricingSection from './FinishPricingSection';
import { DetailsField, DetailsSection, DetailsSwitch, detailsInputClass, detailsMonoInputClass } from './detailsUi';
import type { SkuPricing } from './useSkuPricing';

export function SkipCastingToggle({ product, setProduct }: { product: Product; setProduct: React.Dispatch<React.SetStateAction<Product>> }) {
    return (
        <DetailsSwitch
            label="Χωρίς χύτευση"
            checked={!!product.skip_casting}
            onChange={checked => setProduct(prev => applySkipCasting(prev, checked))}
        />
    );
}

export default function OverviewInHousePanel({
    product,
    setProduct,
    hasVariants,
    allMolds,
    secondaryWeightLabel,
    invoiceTotalWeightResult,
    finishGroups,
    sortedFinishCodes,
    masterCost,
    pricing,
    showToast,
}: {
    product: Product;
    setProduct: React.Dispatch<React.SetStateAction<Product>>;
    hasVariants: boolean;
    allMolds: Mold[];
    secondaryWeightLabel: string;
    invoiceTotalWeightResult: InvoiceTotalWeightResult;
    finishGroups: Record<string, ProductVariant[]>;
    sortedFinishCodes: string[];
    masterCost: number;
    pricing: SkuPricing;
    showToast: (message: string, type: 'success' | 'error' | 'info') => void;
}) {
    const skipCasting = !!product.skip_casting;

    const applyWeightFromMolds = () => {
        const total = product.molds.reduce((sum, pm) => {
            const mold = allMolds.find(m => m.code === pm.code);
            return sum + ((mold?.weight_g || 0) * pm.quantity);
        }, 0);
        if (total > 0) {
            const rounded = parseFloat(total.toFixed(2));
            setProduct(prev => ({ ...prev, weight_g: rounded }));
            showToast(`Βάρος ενημερώθηκε: ${formatNumber(rounded)}g`, 'success');
        } else {
            showToast('Δεν βρέθηκαν βάρη στα επιλεγμένα λάστιχα.', 'info');
        }
    };

    return (
        <div className="space-y-5 animate-in fade-in">
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                <DetailsSection tone="identity" icon={Info} title="Ταυτότητα" subtitle="Ταξινόμηση & βασικά χαρακτηριστικά">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                        <DetailsField label="Κατηγορία" icon={Tag}>
                            <input className={detailsInputClass} value={product.category} onChange={e => setProduct(prev => ({ ...prev, category: e.target.value }))} />
                        </DetailsField>
                        <DetailsField label="Προέλευση">
                            <ProductionTypeBadge productionType={product.production_type} />
                        </DetailsField>
                        <DetailsField label="Φύλο" icon={Users}>
                            <select className={detailsInputClass} value={product.gender} onChange={e => setProduct(prev => ({ ...prev, gender: e.target.value as Gender }))}>
                                <option value={Gender.Women}>Γυναικείο</option>
                                <option value={Gender.Men}>Ανδρικό</option>
                                <option value={Gender.Unisex}>Ουδέτερο</option>
                            </select>
                        </DetailsField>
                        {!hasVariants && (
                            <DetailsField label="Βασική Επιμετάλλωση" icon={Palette}>
                                <select className={detailsInputClass} value={product.plating_type} onChange={e => setProduct(prev => ({ ...prev, plating_type: e.target.value as PlatingType }))}>
                                    <option value={PlatingType.None}>Λουστρέ</option>
                                    <option value={PlatingType.GoldPlated}>Επίχρυσο</option>
                                    <option value={PlatingType.TwoTone}>Δίχρωμο</option>
                                    <option value={PlatingType.Platinum}>Πλατίνα</option>
                                </select>
                            </DetailsField>
                        )}
                        {product.is_component && (
                            <DetailsField label="Περιγραφή STX" icon={Edit3} className="col-span-2">
                                <input className={detailsInputClass} value={product.description || ''} onChange={e => setProduct(prev => ({ ...prev, description: e.target.value }))} placeholder="π.χ. Μικρή Πεταλούδα" />
                            </DetailsField>
                        )}
                    </div>
                </DetailsSection>

                <DetailsSection
                    tone="weight"
                    icon={Weight}
                    title="Βάρη"
                    subtitle="Βάση κοστολόγησης ασημιού & εργατικών"
                    actions={<SkipCastingToggle product={product} setProduct={setProduct} />}
                >
                    <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                        <DetailsField
                            label={`Βάρος (g)${skipCasting ? ' — 0' : ''}`}
                            icon={Weight}
                            action={product.molds.length > 0 && !skipCasting ? (
                                <button
                                    onClick={applyWeightFromMolds}
                                    className="-my-1 inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] font-semibold normal-case tracking-normal text-sky-700 transition-colors hover:bg-sky-50 hover:text-sky-800"
                                    title="Υπολογισμός βάρους από τα λάστιχα"
                                    type="button"
                                >
                                    <Scale size={12} /> Από λάστιχα
                                </button>
                            ) : undefined}
                        >
                            <input type="number" step="0.01" disabled={skipCasting} className={detailsMonoInputClass} value={product.weight_g} onChange={e => setProduct(prev => ({ ...prev, weight_g: parseFloat(e.target.value) || 0 }))} />
                        </DetailsField>
                        <DetailsField label={secondaryWeightLabel} icon={Scale}>
                            <input type="number" step="0.01" disabled={skipCasting} className={detailsMonoInputClass} value={product.secondary_weight_g} onChange={e => setProduct(prev => ({ ...prev, secondary_weight_g: parseFloat(e.target.value) || 0 }))} />
                        </DetailsField>
                        <div className="col-span-2">
                            <InvoiceTotalWeightField
                                value={product.invoice_total_weight_g}
                                result={invoiceTotalWeightResult}
                                onChange={(next) => setProduct(prev => ({ ...prev, invoice_total_weight_g: next }))}
                                onClear={() => setProduct(prev => ({ ...prev, invoice_total_weight_g: null }))}
                            />
                        </div>
                    </div>
                </DetailsSection>
            </div>

            {!product.is_component && (
                <FinishPricingSection
                    product={product}
                    setProduct={setProduct}
                    hasVariants={hasVariants}
                    finishGroups={finishGroups}
                    sortedFinishCodes={sortedFinishCodes}
                    masterCost={masterCost}
                    pricing={pricing}
                />
            )}
        </div>
    );
}
