import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { GlobalSettings, Material, Product, Supplier } from '../types';
import { formatCurrency, formatDecimal } from '../utils/pricingEngine';
import { DEFAULT_PLATING_RATE } from '../utils/laborFormula';
import { computeImportedConversion, type ImportedConversionInput } from '../features/products/convertToImported';
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle, Coins, Gem, Globe, Hammer, Info, ShoppingBag, Weight, X } from 'lucide-react';

interface Props {
    product: Product;
    settings: GlobalSettings;
    allMaterials: Material[];
    allProducts: Product[];
    suppliers?: Supplier[];
    persistOnConfirm?: boolean;
    onConfirm: (newProduct: Product) => void;
    onClose: () => void;
}

const STEPS = [
    { id: 1, label: 'Στοιχεία εισαγωγής' },
    { id: 2, label: 'Κοστολόγηση' },
    { id: 3, label: 'Επιβεβαίωση' },
];

const numberOrEmpty = (value: number | null | undefined) => (value == null || Number.isNaN(value) ? '' : String(value));

export default function ConvertToImportedModal({
    product,
    settings,
    allMaterials,
    allProducts,
    suppliers = [],
    persistOnConfirm = false,
    onConfirm,
    onClose,
}: Props) {
    const [step, setStep] = useState(1);
    const [supplierId, setSupplierId] = useState(product.supplier_id || '');
    const [supplierSku, setSupplierSku] = useState(product.supplier_sku || '');
    const [supplierCost, setSupplierCost] = useState<number | ''>(product.supplier_cost ?? '');
    const [technicianCostPerGram, setTechnicianCostPerGram] = useState<number | ''>('');
    const [platingCostPerGram, setPlatingCostPerGram] = useState<number | ''>(DEFAULT_PLATING_RATE);
    const [stoneSettingCost, setStoneSettingCost] = useState<number | ''>(product.labor.stone_setting_cost || '');
    const [weightG, setWeightG] = useState<number | ''>(product.weight_g || '');
    const [secondaryWeightG, setSecondaryWeightG] = useState<number | ''>(product.secondary_weight_g || '');

    const conversionInput: ImportedConversionInput = useMemo(() => ({
        supplierId,
        supplierSku,
        supplierCost: supplierCost === '' ? null : Number(supplierCost),
        technicianCostPerGram: technicianCostPerGram === '' ? 0 : Number(technicianCostPerGram),
        platingCostPerGram: platingCostPerGram === '' ? 0 : Number(platingCostPerGram),
        stoneSettingCost: stoneSettingCost === '' ? 0 : Number(stoneSettingCost),
        weightG: weightG === '' ? 0 : Number(weightG),
        secondaryWeightG: secondaryWeightG === '' ? 0 : Number(secondaryWeightG),
        supplierDetails: suppliers.find((supplier) => supplier.id === supplierId) || null,
    }), [platingCostPerGram, secondaryWeightG, stoneSettingCost, supplierCost, supplierId, supplierSku, suppliers, technicianCostPerGram, weightG]);

    const preview = useMemo(
        () => computeImportedConversion(product, settings, allMaterials, allProducts, conversionInput),
        [allMaterials, allProducts, conversionInput, product, settings],
    );

    const zeroWeight = (Number(weightG) || 0) <= 0;
    const recipeCount = product.recipe?.length || 0;
    const moldCount = product.molds?.length || 0;

    return createPortal(
        <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
            onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
        >
            <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl animate-in zoom-in-95 duration-200">
                <div className="flex items-start justify-between bg-gradient-to-r from-violet-600 to-purple-500 p-5">
                    <div className="flex items-center gap-3">
                        <div className="rounded-xl bg-white/20 p-2.5">
                            <Globe size={22} className="text-white" />
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-white">Μετατροπή σε Εισαγωγή</h2>
                            <p className="mt-0.5 text-sm font-medium text-violet-100">{product.sku}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="rounded-xl bg-white/20 p-2 text-white transition-colors hover:bg-white/30">
                        <X size={18} />
                    </button>
                </div>

                <div className="grid grid-cols-3 gap-2 border-b border-slate-100 bg-slate-50/80 px-5 py-3">
                    {STEPS.map((item) => (
                        <div key={item.id} className={`rounded-xl px-3 py-2 text-center text-[11px] font-bold ${step === item.id ? 'bg-white text-violet-700 shadow-sm' : step > item.id ? 'text-violet-500' : 'text-slate-400'}`}>
                            {item.id}. {item.label}
                        </div>
                    ))}
                </div>

                <div className="flex-1 space-y-4 overflow-y-auto p-5">
                    {step === 1 && (
                        <>
                            <div className="rounded-2xl border border-violet-200/70 bg-violet-50/40 p-4">
                                <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700">
                                    <ShoppingBag size={14} className="text-violet-600" /> Προμηθευτής
                                </h3>
                                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                    <div>
                                        <label className="mb-1.5 block text-[11px] font-bold uppercase text-slate-400">Προμηθευτής</label>
                                        <select value={supplierId} onChange={(event) => setSupplierId(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-sm outline-none focus:border-violet-400">
                                            <option value="">Επιλογή...</option>
                                            {suppliers.map((supplier) => (
                                                <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="mb-1.5 block text-[11px] font-bold uppercase text-slate-400">Κωδικός προμηθευτή</label>
                                        <input value={supplierSku} onChange={(event) => setSupplierSku(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white p-2.5 font-mono text-sm outline-none focus:border-violet-400" placeholder="π.χ. ITEM-123" />
                                    </div>
                                </div>
                            </div>

                            {(zeroWeight || product.skip_casting) && (
                                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                                    <div className="flex items-start gap-3">
                                        <Weight size={16} className="mt-0.5 text-amber-600" />
                                        <div className="flex-1">
                                            <p className="text-sm font-bold text-amber-800">Το βάρος χύτευσης είναι 0</p>
                                            <p className="mt-1 text-xs text-amber-700">Για σωστή κοστολόγηση εισαγωγής συμπληρώστε βάρος. Η τιμή πώλησης μένει ως έχει.</p>
                                            <div className="mt-3 grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className="mb-1 block text-[11px] font-bold uppercase text-amber-700">Βάρος (g)</label>
                                                    <input type="number" step="0.01" value={numberOrEmpty(weightG === '' ? null : Number(weightG))} onChange={(event) => setWeightG(event.target.value === '' ? '' : Number(event.target.value))} className="w-full rounded-xl border border-amber-200 bg-white p-2.5 font-mono text-sm outline-none" />
                                                </div>
                                                <div>
                                                    <label className="mb-1 block text-[11px] font-bold uppercase text-amber-700">Β' βάρος (g)</label>
                                                    <input type="number" step="0.01" value={numberOrEmpty(secondaryWeightG === '' ? null : Number(secondaryWeightG))} onChange={(event) => setSecondaryWeightG(event.target.value === '' ? '' : Number(event.target.value))} className="w-full rounded-xl border border-amber-200 bg-white p-2.5 font-mono text-sm outline-none" />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {(recipeCount > 0 || moldCount > 0) && (
                                <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4">
                                    <AlertTriangle size={16} className="mt-0.5 text-red-600" />
                                    <div>
                                        <p className="text-sm font-bold text-red-700">Συνταγή και λάστιχα θα αδειάσουν</p>
                                        <p className="mt-1 text-xs text-red-600">
                                            {recipeCount > 0 ? `${recipeCount} υλικά συνταγής` : 'Χωρίς συνταγή'}
                                            {' · '}
                                            {moldCount > 0 ? `${moldCount} λάστιχα` : 'Χωρίς λάστιχα'}
                                            . Τα εισαγόμενα δεν κρατούν συνταγή εργαστηρίου.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {step === 2 && (
                        <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                            <h3 className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700">
                                <Coins size={14} className="text-indigo-600" /> Κοστολόγηση εισαγωγής
                            </h3>
                            <p className="text-xs text-slate-500">Η τιμή χονδρικής δεν αλλάζει. Τα εργατικά εισαγωγής είναι €/g, τα καρφωτικά σταθερά.</p>
                            <label className="block">
                                <span className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase text-slate-400"><ShoppingBag size={11} /> Κόστος προμηθευτή (€)</span>
                                <input type="number" step="0.01" value={numberOrEmpty(supplierCost === '' ? null : Number(supplierCost))} onChange={(event) => setSupplierCost(event.target.value === '' ? '' : Number(event.target.value))} className="w-full rounded-xl border border-slate-200 bg-white p-2.5 font-mono text-sm outline-none focus:border-violet-400" />
                            </label>
                            <label className="block">
                                <span className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase text-slate-400"><Hammer size={11} /> Εργατικά (€/g)</span>
                                <input type="number" step="0.01" value={numberOrEmpty(technicianCostPerGram === '' ? null : Number(technicianCostPerGram))} onChange={(event) => setTechnicianCostPerGram(event.target.value === '' ? '' : Number(event.target.value))} className="w-full rounded-xl border border-slate-200 bg-white p-2.5 font-mono text-sm outline-none focus:border-violet-400" />
                            </label>
                            <label className="block">
                                <span className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase text-slate-400"><Coins size={11} /> Επιμετάλλωση (€/g)</span>
                                <input type="number" step="0.01" value={numberOrEmpty(platingCostPerGram === '' ? null : Number(platingCostPerGram))} onChange={(event) => setPlatingCostPerGram(event.target.value === '' ? '' : Number(event.target.value))} className="w-full rounded-xl border border-slate-200 bg-white p-2.5 font-mono text-sm outline-none focus:border-violet-400" />
                            </label>
                            <label className="block">
                                <span className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase text-slate-400"><Gem size={11} /> Καρφωτικά (€)</span>
                                <input type="number" step="0.01" value={numberOrEmpty(stoneSettingCost === '' ? null : Number(stoneSettingCost))} onChange={(event) => setStoneSettingCost(event.target.value === '' ? '' : Number(event.target.value))} className="w-full rounded-xl border border-slate-200 bg-white p-2.5 font-mono text-sm outline-none focus:border-violet-400" />
                            </label>
                        </div>
                    )}

                    {step === 3 && (
                        <>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                                <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-700">Κόστος — παλιό vs νέο</h3>
                                <div className="space-y-2 text-sm">
                                    <div className="flex items-center justify-between rounded-xl bg-white px-3 py-2">
                                        <span className="text-slate-500">Ιδιοπαραγωγή</span>
                                        <span className="font-mono font-bold text-slate-500 line-through">{formatCurrency(preview.oldCost.total)}</span>
                                    </div>
                                    <div className="flex items-center justify-between rounded-xl border border-violet-200 bg-violet-50 px-3 py-2">
                                        <span className="font-semibold text-violet-800">Εισαγωγή</span>
                                        <span className="font-mono font-black text-violet-800">{formatCurrency(preview.newCost.total)}</span>
                                    </div>
                                    <div className="flex items-center justify-between px-1 text-xs text-slate-400">
                                        <span>Προτεινόμενη Ilios</span>
                                        <span>{formatCurrency(preview.oldIlios)} → {formatCurrency(preview.newIlios)}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-start gap-3 rounded-2xl border border-violet-200 bg-violet-50 p-4">
                                <CheckCircle size={16} className="mt-0.5 text-violet-600" />
                                <div>
                                    <p className="text-sm font-bold text-violet-800">Τι αλλάζει</p>
                                    <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs text-violet-700">
                                        <li>Ο τύπος γίνεται <strong>Εισαγωγή</strong> — φεύγουν Συνταγή και Εργατικά εργαστηρίου</li>
                                        <li>Συνταγή και λάστιχα αδειάζουν</li>
                                        <li>Η τιμή πώλησης μένει {formatCurrency(product.selling_price)}</li>
                                        <li>Βάρος: {formatDecimal(preview.newProduct.weight_g)}g</li>
                                        <li>{persistOnConfirm ? 'Η αλλαγή αποθηκεύεται αμέσως με την εφαρμογή.' : 'Η αλλαγή δεν αποθηκεύεται μέχρι να πατήσετε Αποθήκευση.'}</li>
                                    </ul>
                                </div>
                            </div>
                            <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">
                                <Info size={14} className="mt-0.5" />
                                Αν υπάρχουν ανοιχτές παρτίδες εργαστηρίου, παραμένουν στο παλιό flow μέχρι να κλείσουν.
                            </div>
                        </>
                    )}
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/50 p-4">
                    <button onClick={step === 1 ? onClose : () => setStep((current) => current - 1)} className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-slate-600 shadow-sm hover:bg-slate-50">
                        {step === 1 ? 'Ακύρωση' : <span className="flex items-center gap-1"><ArrowLeft size={14} /> Πίσω</span>}
                    </button>
                    {step < 3 ? (
                        <button onClick={() => setStep((current) => current + 1)} className="flex items-center gap-2 rounded-xl bg-violet-600 px-6 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-violet-700">
                            Επόμενο <ArrowRight size={16} />
                        </button>
                    ) : (
                        <button onClick={() => onConfirm(preview.newProduct)} className="flex items-center gap-2 rounded-xl bg-violet-600 px-6 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-violet-700">
                            <Globe size={16} />
                            Εφαρμογή Μετατροπής
                        </button>
                    )}
                </div>
            </div>
        </div>,
        document.body,
    );
}
