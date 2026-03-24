import React, { useMemo } from 'react';
import { ProductionBatch, Product, Material, MaterialType, ProductionType, Mold } from '../types';
import { APP_LOGO } from '../constants';
import { Gem, MapPin, StickyNote } from 'lucide-react';
import { getVariantComponents } from '../utils/pricingEngine';
import { buildSkuKey, compareSkuValues } from '../utils/skuSort';
import { getProductOptionColorLabel } from '../utils/xrOptions';

interface Props {
    batches: ProductionBatch[];
    allMaterials: Material[];
    allProducts: Product[];
    allMolds: Mold[];
}

type AggregatedStone = {
    key: string;
    name: string;
    description?: string;
    quantity: number;
    unit: string;
};

export default function PreparationView({ batches, allMaterials, allProducts, allMolds }: Props) {
    const sortBatches = (a: ProductionBatch, b: ProductionBatch) => {
        return compareSkuValues(buildSkuKey(a.sku, a.variant_suffix), buildSkuKey(b.sku, b.variant_suffix));
    };

    const inHouseBatches = useMemo(
        () => batches.filter(b => b.product_details?.production_type !== ProductionType.Imported).sort(sortBatches),
        [batches]
    );

    const importedBatches = useMemo(
        () => batches.filter(b => b.product_details?.production_type === ProductionType.Imported).sort(sortBatches),
        [batches]
    );

    const aggregatedMolds = useMemo(() => {
        const acc: Record<string, {
            code: string;
            desc: string;
            totalQty: number;
            loc: string;
            breakdown: Record<string, number>;
        }> = {};

        inHouseBatches.forEach(batch => {
            if (!batch.product_details?.molds) return;

            const { finish } = getVariantComponents(batch.variant_suffix || '', batch.product_details.gender);
            const finishKey = finish.code || 'STD';

            batch.product_details.molds.forEach(mold => {
                if (!acc[mold.code]) {
                    const details = allMolds.find(item => item.code === mold.code);
                    acc[mold.code] = {
                        code: mold.code,
                        desc: details?.description || '',
                        loc: details?.location || '',
                        totalQty: 0,
                        breakdown: {},
                    };
                }

                const qtyNeeded = mold.quantity * batch.quantity;
                acc[mold.code].totalQty += qtyNeeded;
                acc[mold.code].breakdown[finishKey] = (acc[mold.code].breakdown[finishKey] || 0) + qtyNeeded;
            });
        });

        return Object.values(acc).sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
    }, [allMolds, inHouseBatches]);

    const getFinishStyle = (key: string) => {
        switch (key) {
            case 'X':
                return 'bg-amber-100 text-amber-800 border-amber-200';
            case 'P':
                return 'bg-slate-200 text-slate-700 border-slate-300';
            case 'D':
                return 'bg-orange-100 text-orange-800 border-orange-200';
            case 'H':
                return 'bg-cyan-100 text-cyan-800 border-cyan-200';
            default:
                return 'bg-slate-50 text-slate-600 border-slate-200';
        }
    };

    const getBatchStoneRequirements = (batch: ProductionBatch, product: Product): AggregatedStone[] => {
        const stoneRows: AggregatedStone[] = [];
        let hasRecipeStones = false;

        product.recipe.forEach(item => {
            if (item.type !== 'raw') return;

            const material = allMaterials.find(m => m.id === item.id);
            if (!material || material.type !== MaterialType.Stone) return;

            hasRecipeStones = true;
            stoneRows.push({
                key: material.id,
                name: material.name,
                description: material.description,
                quantity: item.quantity * batch.quantity,
                unit: material.unit || 'τεμ',
            });
        });

        if (!hasRecipeStones) {
            const { stone } = getVariantComponents(batch.variant_suffix || '', product.gender);
            if (stone.code) {
                stoneRows.push({
                    key: `variant-${stone.code}`,
                    name: stone.name || stone.code,
                    quantity: batch.quantity,
                    unit: 'τεμ',
                });
            }
        }

        return stoneRows;
    };

    const aggregatedStones = useMemo(() => {
        const acc = new Map<string, AggregatedStone>();

        batches.forEach(batch => {
            const product = batch.product_details;
            if (!product) return;

            getBatchStoneRequirements(batch, product).forEach(stone => {
                const existing = acc.get(stone.key);
                if (existing) {
                    existing.quantity += stone.quantity;
                } else {
                    acc.set(stone.key, { ...stone });
                }
            });
        });

        return Array.from(acc.values()).sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name, 'el'));
    }, [batches]);

    return (
        <div className="bg-white text-slate-900 font-sans w-[210mm] min-h-[297mm] p-6 mx-auto shadow-lg print:shadow-none print:p-6 print:w-full">
            <div className="flex justify-between items-center border-b border-slate-900 pb-2 mb-4">
                <div className="w-24">
                    <img src={APP_LOGO} alt="ILIOS" className="w-full h-auto object-contain block" />
                </div>
                <div className="text-right">
                    <h1 className="text-lg font-black text-slate-900 uppercase tracking-tight">Φύλλο Προετοιμασίας</h1>
                    <p className="text-slate-600 text-xs font-bold">Ημ: {new Date().toLocaleDateString('el-GR')}</p>
                </div>
            </div>

            <main>
                {inHouseBatches.length > 0 && (
                    <div className="space-y-3">
                        <div className="grid grid-cols-3 gap-3">
                            {inHouseBatches.map(batch => {
                                const product = batch.product_details;
                                if (!product) return null;

                                const variant = product.variants?.find(v => v.suffix === batch.variant_suffix);
                                const platingDesc = variant?.description || product.category;

                                return (
                                    <div key={batch.id} className="border-2 border-slate-900 rounded-xl p-2 flex flex-row gap-2 break-inside-avoid bg-white min-h-[7rem]">
                                        <div className="flex flex-col items-center justify-between w-12 shrink-0 h-full">
                                            <div className="w-12 h-12 bg-slate-100 rounded-lg overflow-hidden border border-slate-200 shrink-0">
                                                {product.image_url ? (
                                                    <img src={product.image_url} className="w-full h-full object-cover" alt="img" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-slate-300 text-[8px]">No Img</div>
                                                )}
                                            </div>
                                            <div className="text-2xl font-black text-slate-900 leading-none text-center mt-2">x{batch.quantity}</div>
                                        </div>

                                        <div className="flex-1 min-w-0 flex flex-col gap-1">
                                            <div className="leading-tight border-b border-slate-100 pb-1">
                                                <span className="text-sm font-black text-slate-900 block truncate uppercase">{batch.sku}{batch.variant_suffix || ''}</span>
                                                <span className="text-[10px] font-bold text-slate-600 truncate block uppercase">{platingDesc}</span>

                                                {batch.size_info && (
                                                    <span className="text-[9px] font-black bg-slate-200 text-slate-800 px-1.5 py-0.5 rounded inline-block mt-0.5">
                                                        {batch.size_info}
                                                    </span>
                                                )}
                                                {batch.cord_color && (
                                                    <span className="text-[9px] font-black bg-amber-50 text-amber-800 px-1.5 py-0.5 rounded inline-block mt-0.5 border border-amber-200">
                                                        Κορδόνι: {getProductOptionColorLabel(batch.cord_color)}
                                                    </span>
                                                )}
                                                {batch.enamel_color && (
                                                    <span className="text-[9px] font-black bg-rose-50 text-rose-800 px-1.5 py-0.5 rounded inline-block mt-0.5 border border-rose-200">
                                                        Σμάλτο: {getProductOptionColorLabel(batch.enamel_color)}
                                                    </span>
                                                )}
                                            </div>

                                            <div className="text-[9px] leading-tight space-y-1">
                                                {product.recipe.length > 0 && (
                                                    <div className="text-slate-800 font-bold">
                                                        <span className="text-slate-500 uppercase text-[8px]">ΥΛΙΚΑ: </span>
                                                        {product.recipe.map((item, idx) => {
                                                            const details = item.type === 'raw'
                                                                ? allMaterials.find(m => m.id === item.id)
                                                                : allProducts.find(p => p.sku === item.sku);
                                                            let name = item.type === 'raw' ? (details as Material)?.name : item.sku;

                                                            if (item.type === 'component' && (details as Product)?.description) {
                                                                name += ` (${(details as Product).description})`;
                                                            }

                                                            return <span key={idx}>{name} ({item.quantity}){idx < product.recipe.length - 1 ? ', ' : ''}</span>;
                                                        })}
                                                    </div>
                                                )}

                                                {product.molds.length > 0 && (
                                                    <div className="text-slate-900">
                                                        <span className="font-bold text-slate-500 uppercase text-[8px] block mb-0.5">ΛΑΣΤΙΧΑ</span>
                                                        <ul className="space-y-0.5">
                                                            {product.molds.map((productMold, idx) => {
                                                                const details = allMolds.find(m => m.code === productMold.code);
                                                                return (
                                                                    <li key={idx} className="flex items-start gap-1 font-bold">
                                                                        <span className="text-slate-400">•</span>
                                                                        <span>
                                                                            {productMold.code} <span className="text-[8px] font-black">(x{productMold.quantity})</span>
                                                                            {details?.description && (
                                                                                <span className="font-medium text-[8px] text-slate-600 normal-case italic"> ({details.description})</span>
                                                                            )}
                                                                        </span>
                                                                    </li>
                                                                );
                                                            })}
                                                        </ul>
                                                    </div>
                                                )}
                                            </div>

                                            {batch.notes && (
                                                <div className="mt-auto pt-1">
                                                    <div className="text-[8px] font-black text-emerald-800 uppercase flex items-center gap-0.5 mb-0.5">
                                                        <StickyNote size={8} /> Σημείωση
                                                    </div>
                                                    <div className="bg-emerald-50 p-1 rounded border border-emerald-100 text-[9px] font-bold text-emerald-900 leading-tight">
                                                        {batch.notes}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {aggregatedMolds.length > 0 && (
                    <div className="mt-6 border-t-2 border-slate-900 pt-4 break-inside-avoid">
                        <h2 className="text-xs font-black text-slate-900 uppercase mb-3 flex items-center gap-2">
                            <MapPin size={14} /> Συγκεντρωτική Λίστα Λαστίχων
                        </h2>
                        <div className="grid grid-cols-4 gap-2">
                            {aggregatedMolds.map(mold => (
                                <div key={mold.code} className="border border-slate-300 rounded-lg p-2 bg-slate-50 flex flex-col justify-between break-inside-avoid shadow-sm">
                                    <div className="flex justify-between items-start mb-1 gap-2">
                                        <span className="font-black text-sm text-slate-900 leading-none">{mold.code}</span>
                                        <span className="font-bold text-slate-500 text-[9px]">{mold.loc}</span>
                                    </div>
                                    <div className="text-[9px] text-slate-600 truncate font-medium leading-tight mb-2">
                                        {mold.desc}
                                    </div>

                                    <div className="space-y-1 mb-1">
                                        {Object.entries(mold.breakdown).map(([key, qty]) => (
                                            <div key={key} className={`flex justify-between items-center text-[9px] font-bold px-1.5 py-0.5 rounded border ${getFinishStyle(key)}`}>
                                                <span>{key === 'STD' ? 'ΒΑΣ' : key}</span>
                                                <span className="font-black">{qty}</span>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="text-right border-t border-slate-200 pt-1 mt-1">
                                        <span className="font-black text-lg text-slate-900 leading-none">
                                            {mold.totalQty} <span className="text-[9px] font-normal text-slate-500">συν.</span>
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {aggregatedStones.length > 0 && (
                    <div className="mt-4 break-inside-avoid">
                        <h2 className="text-xs font-black text-slate-900 uppercase mb-3 flex items-center gap-2">
                            <Gem size={14} /> Συγκεντρωτική Λίστα Πετρών
                        </h2>
                        <div className="border border-slate-200 rounded-xl overflow-hidden">
                            {aggregatedStones.map((stone, idx) => (
                                <div
                                    key={stone.key}
                                    className={`grid grid-cols-[1fr_auto] gap-3 px-3 py-2 items-center ${idx < aggregatedStones.length - 1 ? 'border-b border-slate-100' : ''}`}
                                >
                                    <div className="min-w-0">
                                        <div className="text-[11px] font-black text-slate-900 leading-tight">{stone.name}</div>
                                        {stone.description && (
                                            <div className="text-[9px] text-slate-500 font-medium leading-tight">{stone.description}</div>
                                        )}
                                    </div>
                                    <div className="text-right shrink-0">
                                        <div className="text-base font-black text-slate-900 leading-none">{stone.quantity}</div>
                                        <div className="text-[9px] font-bold text-slate-500 uppercase">{stone.unit}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {importedBatches.length > 0 && (
                    <div className="mt-6 pt-2 border-t-2 border-slate-800 break-before-avoid">
                        <h2 className="text-sm font-black text-slate-900 uppercase mb-3">Είδη Εισαγωγής</h2>
                        <div className="grid grid-cols-3 gap-3">
                            {importedBatches.map(batch => {
                                const product = batch.product_details;
                                if (!product) return null;

                                return (
                                    <div key={batch.id} className="border-2 border-dashed border-slate-600 bg-slate-50 rounded-xl p-2 flex flex-row gap-2 break-inside-avoid min-h-[6rem]">
                                        <div className="flex flex-col items-center justify-between w-12 shrink-0 h-full">
                                            <div className="w-12 h-12 bg-white rounded-lg overflow-hidden border border-slate-200 shrink-0">
                                                {product.image_url && <img src={product.image_url} className="w-full h-full object-cover" alt="img" />}
                                            </div>
                                            <div className="text-2xl font-black text-slate-900 leading-none mt-2">x{batch.quantity}</div>
                                        </div>
                                        <div className="flex-1 min-w-0 flex flex-col justify-between">
                                            <div>
                                                <p className="text-sm font-black text-slate-900 tracking-tight leading-tight uppercase">{batch.sku}{batch.variant_suffix || ''}</p>
                                                {product.supplier_sku && (
                                                    <p className="text-[10px] font-bold text-slate-600 bg-white px-1 rounded border border-slate-200 w-fit mt-1">{product.supplier_sku}</p>
                                                )}
                                            </div>
                                            <div className="text-[9px] mt-2">
                                                {batch.notes ? (
                                                    <div className="bg-emerald-100 p-1 rounded border border-emerald-200 text-emerald-900 font-bold">
                                                        <span className="block text-[7px] uppercase opacity-70">Σημείωση</span>
                                                        {batch.notes}
                                                    </div>
                                                ) : (
                                                    <>
                                                        <p className="font-bold text-slate-800">ΕΙΣΑΓΩΓΗ</p>
                                                        <p className="truncate text-slate-700 font-bold">Προμ: {product.supplier_details?.name || 'Unknown'}</p>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
