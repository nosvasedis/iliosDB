import React, { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Product, GlobalSettings, Material, ProductionType, PlatingType } from '../types';
import {
    calculateProductCost,
    calculateTechnicianCost,
    estimateVariantCost,
    getIliosSuggestedPriceForProduct,
    calculateSuggestedWholesalePrice,
    formatCurrency,
    formatDecimal,
} from '../utils/pricingEngine';
import { AlertTriangle, X, ArrowRight, CheckCircle, Info, Hammer, Coins, Gem, Box, Activity, Flame, Sparkles } from 'lucide-react';

interface Props {
    product: Product;
    settings: GlobalSettings;
    allMaterials: Material[];
    allProducts: Product[];
    onConfirm: (newProduct: Product) => void;
    onClose: () => void;
}

/** Pure function: builds the converted InHouse product and computes all cost previews. */
function computeInhouseConversion(
    product: Product,
    settings: GlobalSettings,
    allMaterials: Material[],
    allProducts: Product[]
): { newProduct: Product; oldCost: ReturnType<typeof calculateProductCost>; newCost: ReturnType<typeof calculateProductCost>; oldIlios: number; newIlios: number } {
    if (product.production_type !== ProductionType.Imported) {
        throw new Error('computeInhouseConversion called on a non-Imported product');
    }
    const w = product.weight_g;
    const sw = product.secondary_weight_g || 0;

    // --- Calculate new InHouse labor values ---
    // Technician: useEffect uses weight_g only, but engine recalculates from totalWeight when override=false — match useEffect stored value
    const newTechnicianCost = calculateTechnicianCost(w);
    const newCastingCost = parseFloat(((w * 0.15) + (sw * 0.15)).toFixed(4));
    // plating_cost_x useEffect: totalPlatingWeight = weight_g + recipe component weights (recipe empty → weight_g only)
    const newPlatingX = parseFloat((w * 0.60).toFixed(2));
    // plating_cost_d useEffect: totalSecondaryWeight = secondary_weight_g + recipe component secondary weights (recipe empty → secondary_weight_g only)
    const newPlatingD = parseFloat((sw * 0.60).toFixed(2));

    const newProduct: Product = {
        ...product,
        production_type: ProductionType.InHouse,
        // Clear supplier fields
        supplier_id: undefined,
        supplier_sku: undefined,
        supplier_cost: undefined,
        supplier_details: undefined,
        // Reset labor to InHouse auto-calculated values
        labor: {
            casting_cost: newCastingCost,
            casting_cost_manual_override: false,
            setter_cost: 0,
            technician_cost: newTechnicianCost,
            technician_cost_manual_override: false,
            stone_setting_cost: 0,
            plating_cost_x: newPlatingX,
            plating_cost_x_manual_override: false,
            plating_cost_d: newPlatingD,
            plating_cost_d_manual_override: false,
            subcontract_cost: product.labor.subcontract_cost || 0,
        },
        // recipe and molds stay empty (were already empty for Imported)
        recipe: [],
        molds: [],
    };

    // Re-estimate variant costs with new InHouse product
    const updatedVariants = (product.variants || []).map(v => {
        const { total: newVariantCost } = estimateVariantCost(newProduct, v.suffix, settings, allMaterials, allProducts);
        return { ...v, active_price: newVariantCost };
    });
    newProduct.variants = updatedVariants;

    // Compute costs
    const oldCost = calculateProductCost(product, settings, allMaterials, allProducts);
    const newCost = calculateProductCost(newProduct, settings, allMaterials, allProducts);

    // Ilios prices — for the master (no variant suffix)
    const oldIlios = getIliosSuggestedPriceForProduct(product, null, settings, allMaterials, allProducts);
    const newIlios = getIliosSuggestedPriceForProduct(newProduct, null, settings, allMaterials, allProducts);

    return { newProduct, oldCost, newCost, oldIlios, newIlios };
}

const DiffValue = ({ oldVal, newVal }: { oldVal: number; newVal: number }) => {
    const diff = newVal - oldVal;
    const isZero = Math.abs(diff) < 0.005;
    return (
        <span className={`text-xs font-semibold ml-1 ${isZero ? 'text-slate-400' : diff > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
            {isZero ? '' : diff > 0 ? `+${formatDecimal(diff)}€` : `${formatDecimal(diff)}€`}
        </span>
    );
};

interface CostRowProps {
    label: string;
    oldVal: number;
    newVal: number;
    sub?: string;
    highlight?: boolean;
    isIlios?: boolean;
}

const CostRow = ({ label, oldVal, newVal, sub, highlight, isIlios }: CostRowProps) => {
    const diff = newVal - oldVal;
    const hasDiff = Math.abs(diff) > 0.005;
    return (
        <div className={`grid grid-cols-[1fr_auto_auto] items-center gap-3 py-2 px-3 rounded-xl ${highlight ? 'bg-emerald-50 border border-emerald-200/70' : isIlios ? 'bg-blue-50 border border-blue-200/70' : 'bg-slate-50/60'}`}>
            <div>
                <span className={`text-sm font-semibold ${highlight || isIlios ? 'text-slate-800' : 'text-slate-600'}`}>{label}</span>
                {sub && <span className="text-xs text-slate-400 ml-1.5">{sub}</span>}
            </div>
            <div className="text-right min-w-[72px]">
                <span className="font-mono text-sm text-slate-500 line-through decoration-slate-400">{formatCurrency(oldVal)}</span>
            </div>
            <div className="text-right min-w-[88px] flex items-center justify-end gap-1">
                <span className={`font-mono font-bold text-sm ${highlight ? 'text-emerald-700' : isIlios ? 'text-blue-700' : 'text-slate-800'}`}>{formatCurrency(newVal)}</span>
                {hasDiff && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${diff > 0 ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'}`}>
                        {diff > 0 ? '+' : ''}{formatDecimal(diff)}€
                    </span>
                )}
            </div>
        </div>
    );
};

export default function ConvertToInhouseModal({ product, settings, allMaterials, allProducts, onConfirm, onClose }: Props) {
    const { newProduct, oldCost, newCost, oldIlios, newIlios } = useMemo(
        () => computeInhouseConversion(product, settings, allMaterials, allProducts),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [product.sku, settings.silver_price_gram]
    );

    const supplierName = product.supplier_details?.name
        || (product.supplier_id ? `Προμηθευτής #${product.supplier_id.slice(0, 6)}` : null);
    const hasVariants = (product.variants || []).length > 0;

    // Old breakdown shortcuts
    const od = oldCost.breakdown?.details || {};
    const nd = newCost.breakdown?.details || {};

    const oldSilver = oldCost.breakdown?.silver ?? 0;
    const newSilver = newCost.breakdown?.silver ?? 0;

    const oldTech = od.technician_cost ?? 0;
    const newTech = nd.technician_cost ?? 0;

    const oldPlating = od.plating_cost ?? od.plating_cost_x ?? 0;
    const newPlating = nd.plating_cost ?? 0;

    const oldStone = od.stone_setting_cost ?? 0;

    const oldCasting = 0; // Imported has no casting
    const newCasting = nd.casting_cost ?? 0;

    const oldSetter = 0; // Imported has no setter
    const newSetter = 0; // User adds manually

    const oldSubcontract = product.labor.subcontract_cost || 0;
    const newSubcontract = newProduct.labor.subcontract_cost || 0;

    const handleConfirm = () => {
        onConfirm(newProduct);
    };

    return createPortal(
        <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">

                {/* ── Header ── */}
                <div className="bg-gradient-to-r from-orange-500 to-amber-500 p-5 flex items-start justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-white/20 rounded-xl">
                            <Flame size={22} className="text-white" />
                        </div>
                        <div>
                            <h2 className="font-black text-white text-lg">Μετατροπή σε Ιδιοπαραγωγή</h2>
                            <p className="text-orange-100 text-sm font-medium mt-0.5">
                                {product.sku} — {product.weight_g}g
                                {(product.secondary_weight_g || 0) > 0 && ` + ${product.secondary_weight_g}g`}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 bg-white/20 hover:bg-white/30 rounded-xl text-white transition-colors">
                        <X size={18} />
                    </button>
                </div>

                {/* ── Scrollable Body ── */}
                <div className="flex-1 overflow-y-auto p-5 space-y-4">

                    {/* ── Supplier cleared notice ── */}
                    {(supplierName || product.supplier_sku || (product.supplier_cost || 0) > 0) && (
                        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
                            <div className="p-1.5 bg-red-100 rounded-lg mt-0.5">
                                <X size={14} className="text-red-600" />
                            </div>
                            <div>
                                <p className="font-bold text-red-700 text-sm">Στοιχεία Προμηθευτή — θα διαγραφούν</p>
                                <div className="mt-1 text-xs text-red-600 space-y-0.5">
                                    {supplierName && <div>• Προμηθευτής: <strong>{supplierName}</strong></div>}
                                    {product.supplier_sku && <div>• Κωδικός Προμηθευτή: <strong>{product.supplier_sku}</strong></div>}
                                    {(product.supplier_cost || 0) > 0 && <div>• Κόστος Προμηθευτή: <strong>{formatCurrency(product.supplier_cost)}</strong></div>}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── Cost Comparison Table ── */}
                    <div className="bg-slate-50/50 rounded-2xl border border-slate-200/80 p-4">
                        <h3 className="font-bold text-slate-700 text-xs uppercase tracking-wider flex items-center gap-2 mb-3">
                            <div className="p-1.5 bg-indigo-100 rounded-lg"><Activity size={12} className="text-indigo-600" /></div>
                            Ανάλυση Κόστους — Παλιό vs Νέο
                        </h3>
                        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide grid grid-cols-[1fr_auto_auto] gap-3 px-3 mb-2">
                            <span>Στοιχείο</span>
                            <span className="min-w-[72px] text-right">Εισαγωγή</span>
                            <span className="min-w-[88px] text-right">Ιδιοπαραγωγή</span>
                        </div>
                        <div className="space-y-1.5">
                            <CostRow label="Ασήμι" oldVal={oldSilver} newVal={newSilver} sub={`${formatDecimal(product.weight_g + (product.secondary_weight_g || 0))}g`} />
                            <CostRow label="Χύτευση" oldVal={oldCasting} newVal={newCasting} sub={`${formatDecimal(product.weight_g + (product.secondary_weight_g || 0))}g × 0,15`} />
                            <CostRow label="Τεχνίτης" oldVal={oldTech} newVal={newTech} sub={`Κλιμακωτή χρέωση`} />
                            <CostRow label="Καρφωτικά" oldVal={oldStone} newVal={0} sub="→ 0 (Ιδιοπαραγωγή)" />
                            <CostRow label="Τεχνίτης Καρφ." oldVal={oldSetter} newVal={newSetter} sub="Προσθήκη από καρτέλα Εργατικά" />
                            <CostRow label="Επιμετάλλωση X/H" oldVal={oldPlating} newVal={newPlating} sub={`${formatDecimal(product.weight_g + (product.secondary_weight_g || 0))}g × 0,60`} />
                            {(oldSubcontract > 0 || newSubcontract > 0) && (
                                <CostRow label="Υπεργολαβία" oldVal={oldSubcontract} newVal={newSubcontract} />
                            )}
                        </div>
                        <div className="mt-3 pt-3 border-t border-slate-200 space-y-1.5">
                            <CostRow label="Σύνολο Κόστους" oldVal={oldCost.total} newVal={newCost.total} highlight />
                            <CostRow label="Τιμή Ilios (Προτεινόμενη)" oldVal={oldIlios} newVal={newIlios} isIlios />
                        </div>
                    </div>

                    {/* ── Variant changes ── */}
                    {hasVariants && (
                        <div className="bg-slate-50/50 rounded-2xl border border-slate-200/80 p-4">
                            <h3 className="font-bold text-slate-700 text-xs uppercase tracking-wider flex items-center gap-2 mb-3">
                                <div className="p-1.5 bg-purple-100 rounded-lg"><Sparkles size={12} className="text-purple-600" /></div>
                                Κόστος Παραλλαγών
                            </h3>
                            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide grid grid-cols-[auto_1fr_auto_auto] gap-3 px-3 mb-2">
                                <span>Παραλλαγή</span>
                                <span></span>
                                <span className="min-w-[72px] text-right">Παλιό</span>
                                <span className="min-w-[88px] text-right">Νέο</span>
                            </div>
                            <div className="space-y-1.5">
                                {(product.variants || []).map((v, i) => {
                                    const oldVariantCost = v.active_price ?? 0;
                                    const newVariantCost = (newProduct.variants || [])[i]?.active_price ?? 0;
                                    const diff = newVariantCost - oldVariantCost;
                                    const hasDiff = Math.abs(diff) > 0.005;
                                    return (
                                        <div key={v.suffix} className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 py-2 px-3 rounded-xl bg-slate-50/60">
                                            <span className="font-mono font-bold text-slate-700 text-sm bg-slate-200/60 px-2 py-0.5 rounded-lg min-w-[36px] text-center">{v.suffix || 'Lustre'}</span>
                                            <span className="text-xs text-slate-500 truncate">{v.description}</span>
                                            <span className="font-mono text-sm text-slate-500 line-through decoration-slate-400 min-w-[72px] text-right">{formatCurrency(oldVariantCost)}</span>
                                            <div className="min-w-[88px] text-right flex items-center justify-end gap-1">
                                                <span className="font-mono font-bold text-sm text-slate-800">{formatCurrency(newVariantCost)}</span>
                                                {hasDiff && (
                                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${diff > 0 ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'}`}>
                                                        {diff > 0 ? '+' : ''}{formatDecimal(diff)}€
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* ── Warning: recipe & molds empty ── */}
                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
                        <div className="p-1.5 bg-amber-100 rounded-lg mt-0.5">
                            <AlertTriangle size={14} className="text-amber-600" />
                        </div>
                        <div>
                            <p className="font-bold text-amber-800 text-sm">Συνταγή & Φόρμες — χρειάζονται συμπλήρωση</p>
                            <p className="text-xs text-amber-700 mt-1">
                                Μετά τη μετατροπή, η συνταγή υλικών (καρτέλα <strong>Συνταγή</strong>) και οι φόρμες χύτευσης (καρτέλα <strong>Στοιχεία</strong>) θα είναι κενές.
                                Πρέπει να προστεθούν χειροκίνητα ώστε το κόστος να υπολογίζεται πλήρως.
                            </p>
                        </div>
                    </div>

                    {/* ── InHouse after conversion info ── */}
                    <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-start gap-3">
                        <div className="p-1.5 bg-emerald-100 rounded-lg mt-0.5">
                            <CheckCircle size={14} className="text-emerald-600" />
                        </div>
                        <div>
                            <p className="font-bold text-emerald-800 text-sm">Τι αλλάζει μετά τη μετατροπή</p>
                            <ul className="text-xs text-emerald-700 mt-1 space-y-0.5 list-disc list-inside">
                                <li>Ο τύπος γίνεται <strong>Ιδιοπαραγωγή</strong> — εμφανίζονται οι καρτέλες Συνταγή & Εργατικά</li>
                                <li>Εργατικά τεχνίτη υπολογίζονται αυτόματα με κλιμακωτή χρέωση βάσει βάρους</li>
                                <li>Χύτευση: <strong>{formatDecimal(product.weight_g + (product.secondary_weight_g || 0))}g × 0,15 = {formatCurrency(newCasting)}</strong></li>
                                <li>Καρφωτικά μηδενίζονται — προσθέστε χειροκίνητα από καρτέλα <strong>Εργατικά</strong></li>
                                <li>Η αλλαγή δεν αποθηκεύεται μέχρι να πατήσετε <strong>Αποθήκευση</strong></li>
                            </ul>
                        </div>
                    </div>
                </div>

                {/* ── Footer ── */}
                <div className="border-t border-slate-100 p-4 flex items-center justify-between gap-3 bg-slate-50/50">
                    <button
                        onClick={onClose}
                        className="px-5 py-2.5 rounded-xl font-bold text-sm text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 active:bg-slate-100 transition-colors shadow-sm"
                    >
                        Ακύρωση
                    </button>
                    <div className="flex items-center gap-3">
                        <div className="text-right">
                            <div className="text-[10px] font-bold text-slate-400 uppercase">Νέο Κόστος</div>
                            <div className="font-mono font-black text-lg text-emerald-700">{formatCurrency(newCost.total)}</div>
                        </div>
                        <button
                            onClick={handleConfirm}
                            className="flex items-center gap-2 px-6 py-2.5 bg-orange-600 hover:bg-orange-700 active:bg-orange-800 text-white rounded-xl font-bold text-sm transition-colors shadow-sm"
                        >
                            <Flame size={16} />
                            Εφαρμογή Μετατροπής
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
