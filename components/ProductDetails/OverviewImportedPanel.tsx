import { formatNumber } from '../../utils/numberFormat';
import React from 'react';
import { Activity, Calculator, Coins, DollarSign, Gem, Globe, Hammer, Info, ShoppingBag, Tag, TrendingUp, Weight } from 'lucide-react';
import { Product, Supplier } from '../../types';
import { formatCurrency, formatDecimal } from '../../utils/pricingEngine';
import { InvoiceTotalWeightResult } from '../../utils/invoiceTotalWeight';
import InvoiceTotalWeightField from './InvoiceTotalWeightField';
import ProductionTypeBadge from './ProductionTypeBadge';
import { LaborCostInput, SummaryRow } from './detailsInputs';
import { DetailsButton, DetailsField, DetailsSection, detailsInputClass, detailsMonoInputClass, getMarginTone } from './detailsUi';
import { SkipCastingToggle } from './OverviewInHousePanel';
import type { SkuPricing } from './useSkuPricing';

export interface ImportedCostAnalysis {
    silver: number;
    technician: number;
    plating: number;
    stoneSetting: number;
    weightG: number;
    total: number;
}

export default function OverviewImportedPanel({
    product,
    setProduct,
    suppliers,
    invoiceTotalWeightResult,
    importedCostAnalysis,
    masterCost,
    pricing,
    retailMultiplier,
}: {
    product: Product;
    setProduct: React.Dispatch<React.SetStateAction<Product>>;
    suppliers: Supplier[];
    invoiceTotalWeightResult: InvoiceTotalWeightResult;
    importedCostAnalysis: ImportedCostAnalysis;
    masterCost: number;
    pricing: SkuPricing;
    retailMultiplier: number;
}) {
    const { showRepriceTool, toggleRepriceTool, targetMargin, setTargetMargin, calculatedPrice, updateCalculatedPrice, handleStandardFormula, applyReprice } = pricing;
    const setLabor = (patch: Partial<Product['labor']>) => setProduct(p => ({ ...p, labor: { ...p.labor, ...patch } }));
    const margin = product.selling_price > 0 ? ((product.selling_price - masterCost) / product.selling_price) * 100 : 0;
    const tone = getMarginTone(margin);

    return (
        <div className="space-y-5 animate-in fade-in">
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                <DetailsSection tone="identity" icon={Info} title="Ταυτότητα">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                        <DetailsField label="Κατηγορία" icon={Tag}>
                            <input className={detailsInputClass} value={product.category} onChange={e => setProduct(prev => ({ ...prev, category: e.target.value }))} />
                        </DetailsField>
                        <DetailsField label="Προέλευση">
                            <ProductionTypeBadge productionType={product.production_type} />
                        </DetailsField>
                    </div>
                </DetailsSection>

                <DetailsSection tone="supplier" icon={Globe} title="Προμηθευτής">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                        <DetailsField label="Προμηθευτής" icon={ShoppingBag}>
                            <select
                                value={product.supplier_id || ''}
                                onChange={(e) => setProduct(prev => ({ ...prev, supplier_id: e.target.value || undefined }))}
                                className={detailsInputClass}
                            >
                                <option value="">Επιλογή...</option>
                                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </DetailsField>
                        <DetailsField label="Κωδικός Προμηθευτή" icon={Tag}>
                            <input type="text" className={detailsMonoInputClass} value={product.supplier_sku || ''} onChange={e => setProduct(prev => ({ ...prev, supplier_sku: e.target.value }))} placeholder="π.χ. ITEM-123" />
                        </DetailsField>
                    </div>
                </DetailsSection>
            </div>

            <DetailsSection
                tone="weight"
                icon={Weight}
                title="Βάρη"
                actions={<SkipCastingToggle product={product} setProduct={setProduct} />}
            >
                <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,14rem)_1fr]">
                    <DetailsField label={`Βάρος (g)${product.skip_casting ? ' — 0' : ''}`} icon={Weight}>
                        <input type="number" step="0.01" disabled={!!product.skip_casting} className={detailsMonoInputClass} value={product.weight_g} onChange={e => setProduct(prev => ({ ...prev, weight_g: parseFloat(e.target.value) || 0 }))} />
                    </DetailsField>
                    <InvoiceTotalWeightField
                        value={product.invoice_total_weight_g}
                        result={invoiceTotalWeightResult}
                        onChange={(next) => setProduct(prev => ({ ...prev, invoice_total_weight_g: next }))}
                        onClear={() => setProduct(prev => ({ ...prev, invoice_total_weight_g: null }))}
                        focusClass="focus:border-purple-400 focus:ring-purple-500/10"
                    />
                </div>
            </DetailsSection>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <DetailsSection tone="costing" icon={Calculator} title="Κοστολόγηση εισαγωγής">
                    <div className="space-y-2">
                        <LaborCostInput icon={<Hammer size={14} />} label="Εργατικά (€/g)" value={product.labor.technician_cost} onChange={val => setLabor({ technician_cost: val })} />
                        <LaborCostInput icon={<Coins size={14} />} label="Επιμετάλλωση (€/g)" value={product.labor.plating_cost_x} onChange={val => setLabor({ plating_cost_x: val })} />
                        <LaborCostInput icon={<Gem size={14} />} label="Καρφωτικά (€)" value={product.labor.stone_setting_cost} onChange={val => setLabor({ stone_setting_cost: val })} />
                    </div>
                </DetailsSection>

                <DetailsSection tone="analysis" icon={Activity} title="Ανάλυση κόστους">
                    <div className="space-y-1.5">
                        <SummaryRow label="Ασήμι" value={formatCurrency(importedCostAnalysis.silver)} sub={`${formatNumber(importedCostAnalysis.weightG)}g`} color="bg-slate-400" />
                        <SummaryRow label="Εργατικά" value={formatCurrency(importedCostAnalysis.technician)} sub={`/ ${formatNumber(importedCostAnalysis.weightG)}g`} color="bg-blue-400" />
                        <SummaryRow label="Επιμετάλλωση" value={formatCurrency(importedCostAnalysis.plating)} sub={`/ ${formatNumber(importedCostAnalysis.weightG)}g`} color="bg-amber-400" />
                        <SummaryRow label="Καρφωτικά" value={formatCurrency(importedCostAnalysis.stoneSetting)} sub="Σταθερό" color="bg-purple-400" />
                    </div>
                    <div className="mt-3 flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-2.5 ring-1 ring-emerald-100">
                        <span className="text-xs font-bold uppercase text-emerald-700">Τελικό Κόστος</span>
                        <span className="text-2xl font-black text-emerald-800">{formatCurrency(importedCostAnalysis.total)}</span>
                    </div>
                </DetailsSection>
            </div>

            <DetailsSection
                tone="policy"
                icon={DollarSign}
                title="Εμπορική πολιτική"
                actions={(
                    <DetailsButton icon={Calculator} pressed={showRepriceTool} onClick={toggleRepriceTool} title="Εργαλείο ανατιμολόγησης">
                        Ανατιμολόγηση
                    </DetailsButton>
                )}
            >
                <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <DetailsField label="Τιμή Πώλησης (€)" icon={Coins}>
                        <div className="relative">
                            <input type="number" step="0.01" className="w-full rounded-xl border border-amber-200 bg-white p-2.5 pr-7 font-mono text-base font-bold text-amber-900 shadow-sm outline-none transition-all focus:border-amber-300 focus:ring-2 focus:ring-amber-400/20" value={product.selling_price} onChange={e => setProduct(prev => ({ ...prev, selling_price: parseFloat(e.target.value) || 0, selling_price_manual_override: true }))} />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-amber-400">€</span>
                        </div>
                    </DetailsField>
                    <div className="rounded-xl border border-violet-100 bg-violet-50/60 px-3 py-2">
                        <div className="text-[10px] font-bold uppercase text-violet-500">Λιανική ×{formatDecimal(retailMultiplier, 2)}</div>
                        <div className="font-mono text-lg font-bold text-violet-800">{product.selling_price > 0 ? formatCurrency(product.selling_price * retailMultiplier) : '—'}</div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2">
                        <div className="text-[10px] font-bold uppercase text-slate-400">Κόστος</div>
                        <div className="font-mono text-lg font-bold text-slate-800">{formatCurrency(masterCost)}</div>
                    </div>
                    <div className={`rounded-xl px-3 py-2 ring-1 ${tone.bg} ${tone.ring}`}>
                        <div className="text-[10px] font-bold uppercase text-slate-500">Περιθώριο</div>
                        <div className={`font-mono text-lg font-black ${product.selling_price > 0 ? tone.text : 'text-slate-300'}`}>
                            {masterCost > 0 && product.selling_price > 0 ? `${formatDecimal(margin, 1)}%` : '—'}
                        </div>
                    </div>
                </div>
                {showRepriceTool && (
                    <div className="mt-4 rounded-xl border border-amber-200/60 bg-amber-50/40 p-4 animate-in slide-in-from-top-2">
                        <h4 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-amber-800"><TrendingUp size={14} /> Εργαλείο Ανατιμολόγησης</h4>
                        <div className="flex flex-wrap items-end gap-4">
                            <div>
                                <label className="text-[10px] font-bold uppercase text-amber-700">Στόχος Περιθωρίου (%)</label>
                                <input type="number" value={targetMargin} onChange={e => { setTargetMargin(parseFloat(e.target.value)); updateCalculatedPrice(parseFloat(e.target.value)); }} className="block w-24 rounded-lg border border-amber-300 bg-white p-2 text-center font-bold" />
                            </div>
                            <DetailsButton size="md" icon={Calculator} onClick={handleStandardFormula}>
                                Βασικός τύπος
                            </DetailsButton>
                            <div>
                                <label className="text-[10px] font-bold uppercase text-amber-700">Προτεινόμενη Τιμή</label>
                                <div className="font-mono text-xl font-black text-amber-900">{formatNumber(calculatedPrice)}€</div>
                            </div>
                            <DetailsButton size="md" variant="success" onClick={applyReprice} disabled={calculatedPrice <= 0}>Εφαρμογή τιμής</DetailsButton>
                        </div>
                    </div>
                )}
            </DetailsSection>
        </div>
    );
}
