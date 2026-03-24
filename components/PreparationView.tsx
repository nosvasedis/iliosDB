
import React, { useMemo } from 'react';
import { ProductionBatch, Product, Material, RecipeItem, MaterialType, ProductionType, Mold } from '../types';
import { APP_LOGO } from '../constants';
import { Box, Coins, Gem, Puzzle, Globe, MapPin, StickyNote } from 'lucide-react';
import { getVariantComponents } from '../utils/pricingEngine';
import { buildSkuKey, compareSkuValues } from '../utils/skuSort';
import { getProductOptionColorLabel } from '../utils/xrOptions';

interface Props {
    batches: ProductionBatch[];
    allMaterials: Material[];
    allProducts: Product[];
    allMolds: Mold[];
}

export default function PreparationView({ batches, allMaterials, allProducts, allMolds }: Props) {
    
    // Sort logic
    const sortBatches = (a: ProductionBatch, b: ProductionBatch) => {
        return compareSkuValues(buildSkuKey(a.sku, a.variant_suffix), buildSkuKey(b.sku, b.variant_suffix));
    };

    // Filter batches into In-House and Imported and Sort them
    const inHouseBatches = useMemo(() => 
        batches
            .filter(b => b.product_details?.production_type !== ProductionType.Imported)
            .sort(sortBatches)
    , [batches]);

    const importedBatches = useMemo(() => 
        batches
            .filter(b => b.product_details?.production_type === ProductionType.Imported)
            .sort(sortBatches)
    , [batches]);

    // Aggregate Molds Logic with Breakdown
    const aggregatedMolds = useMemo(() => {
        const acc: Record<string, { 
            code: string, 
            desc: string, 
            totalQty: number, 
            loc: string,
            breakdown: Record<string, number> 
        }> = {};

        inHouseBatches.forEach(b => {
            if (!b.product_details?.molds) return;
            
            // Identify Finish Code (e.g. 'P', 'X', or 'STD' for Lustre)
            const { finish } = getVariantComponents(b.variant_suffix || '', b.product_details.gender);
            const finishKey = finish.code || 'STD'; 

            b.product_details.molds.forEach(m => {
                // Initialize mold entry if missing
                if (!acc[m.code]) {
                    const details = allMolds.find(am => am.code === m.code);
                    acc[m.code] = {
                        code: m.code,
                        desc: details?.description || '',
                        loc: details?.location || '',
                        totalQty: 0,
                        breakdown: {}
                    };
                }

                // Calculate required quantity for this batch
                const qtyNeeded = m.quantity * b.quantity;

                // Add to Total
                acc[m.code].totalQty += qtyNeeded;

                // Add to Breakdown bucket
                acc[m.code].breakdown[finishKey] = (acc[m.code].breakdown[finishKey] || 0) + qtyNeeded;
            });
        });

        return Object.values(acc).sort((a,b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
    }, [inHouseBatches, allMolds]);

    const getFinishStyle = (key: string) => {
        switch(key) {
            case 'X': return 'bg-amber-100 text-amber-800 border-amber-200'; // Gold
            case 'P': return 'bg-slate-200 text-slate-700 border-slate-300'; // Patina
            case 'D': return 'bg-orange-100 text-orange-800 border-orange-200'; // Two-Tone
            case 'H': return 'bg-cyan-100 text-cyan-800 border-cyan-200'; // Platinum
            default: return 'bg-slate-50 text-slate-600 border-slate-200'; // Standard/Lustre
        }
    };

    const getStoneRequirementsPerUnit = (product: Product): Array<{ key: string; name: string; quantity: number }> => {
        const stoneTotals = new Map<string, { name: string; quantity: number }>();

        const collectFromProduct = (currentProduct: Product, multiplier: number, ancestry: Set<string>) => {
            currentProduct.recipe.forEach(recipeItem => {
                if (recipeItem.type === 'raw') {
                    const material = allMaterials.find(m => m.id === recipeItem.id);
                    if (!material || material.type !== MaterialType.Stone) return;

                    const key = material.id || material.name;
                    const existing = stoneTotals.get(key);
                    const qty = recipeItem.quantity * multiplier;
                    if (existing) {
                        existing.quantity += qty;
                    } else {
                        stoneTotals.set(key, { name: material.name, quantity: qty });
                    }
                    return;
                }

                const component = allProducts.find(p => p.sku === recipeItem.sku);
                if (!component || ancestry.has(component.sku)) return;
                const nextAncestry = new Set(ancestry);
                nextAncestry.add(component.sku);
                collectFromProduct(component, multiplier * recipeItem.quantity, nextAncestry);
            });
        };

        const rootAncestry = new Set<string>([product.sku]);
        collectFromProduct(product, 1, rootAncestry);

        return Array.from(stoneTotals.entries())
            .map(([key, value]) => ({ key, name: value.name, quantity: value.quantity }))
            .sort((a, b) => a.name.localeCompare(b.name));
    };

    return (
        <div className="bg-white text-slate-900 font-sans w-[210mm] min-h-[297mm] p-6 mx-auto shadow-lg print:shadow-none print:p-6 print:w-full">
            {/* HEADER changed to DIV */}
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
                {/* In-House Production Section */}
                {inHouseBatches.length > 0 && (
                    <div className="space-y-3">
                        <div className="grid grid-cols-3 gap-3">
                            {inHouseBatches.map(batch => {
                                const product = batch.product_details;
                                if (!product) return null;
                                const stoneRequirementsPerUnit = getStoneRequirementsPerUnit(product);
                                
                                const variant = product.variants?.find(v => v.suffix === batch.variant_suffix);
                                const platingDesc = variant?.description || product.category;

                                return (
                                    <div key={batch.id} className="border-2 border-slate-900 rounded-xl p-2 flex flex-row gap-2 break-inside-avoid bg-white min-h-[7rem]">
                                        {/* Image & Qty Column */}
                                        <div className="flex flex-col items-center justify-between w-12 shrink-0 h-full">
                                            <div className="w-12 h-12 bg-slate-100 rounded-lg overflow-hidden border border-slate-200 shrink-0">
                                                {product.image_url ? (
                                                    <img src={product.image_url} className="w-full h-full object-cover" alt="img"/>
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-slate-300 text-[8px]">No Img</div>
                                                )}
                                            </div>
                                            <div className="text-2xl font-black text-slate-900 leading-none text-center mt-2">x{batch.quantity}</div>
                                        </div>

                                        {/* Details Column - Stacked Flex for Safety */}
                                        <div className="flex-1 min-w-0 flex flex-col gap-1">
                                            
                                            {/* Header Info */}
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

                                            {/* Materials & Molds Section - Always Visible */}
                                            <div className="text-[9px] leading-tight space-y-1">
                                                {product.recipe.length > 0 && (
                                                    <div className="text-slate-800 font-bold">
                                                        <span className="text-slate-500 uppercase text-[8px]">ΥΛΙΚΑ: </span>
                                                        {product.recipe.map((item, idx) => {
                                                            const details = item.type === 'raw' ? allMaterials.find(m => m.id === item.id) : allProducts.find(p => p.sku === item.sku);
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
                                                        <span className="font-bold text-slate-500 uppercase text-[8px]">ΛΑΣΤΙΧΑ:</span>
                                                        <ul className="font-bold list-disc pl-3 mt-0.5 space-y-0.5">
                                                            {product.molds.map((pm, idx) => {
                                                                const details = allMolds.find(m => m.code === pm.code);
                                                                return (
                                                                    <li key={idx} className="leading-tight">
                                                                        {pm.code} <span className="text-[8px] font-black">(x{pm.quantity * batch.quantity})</span>
                                                                        {details?.description && (
                                                                            <span className="font-medium text-[8px] text-slate-600 normal-case italic"> ({details.description})</span>
                                                                        )}
                                                                    </li>
                                                                );
                                                            })}
                                                        </ul>
                                                    </div>
                                                )}

                                                {stoneRequirementsPerUnit.length > 0 && (
                                                    <div className="text-slate-900">
                                                        <span className="font-bold text-slate-500 uppercase text-[8px]">ΠΕΤΡΕΣ:</span>
                                                        <ul className="font-bold list-disc pl-3 mt-0.5 space-y-0.5">
                                                            {stoneRequirementsPerUnit.map(stone => (
                                                                <li key={stone.key} className="leading-tight">
                                                                    {stone.name} <span className="text-[8px] font-black">(x{stone.quantity * batch.quantity})</span>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Notes Section - Stacked at bottom, doesn't hide materials */}
                                            {batch.notes && (
                                                <div className="mt-auto pt-1">
                                                    <div className="text-[8px] font-black text-emerald-800 uppercase flex items-center gap-0.5 mb-0.5">
                                                        <StickyNote size={8}/> ΣΗΜΕΙΩΣΗ
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

                {/* NEW: Aggregated Molds Section */}
                {aggregatedMolds.length > 0 && (
                    <div className="mt-6 border-t-2 border-slate-900 pt-4 break-inside-avoid">
                        <h2 className="text-xs font-black text-slate-900 uppercase mb-3 flex items-center gap-2">
                            <MapPin size={14}/> Συγκεντρωτικη Λιστα Λαστιχων
                        </h2>
                        <div className="grid grid-cols-4 gap-2">
                            {aggregatedMolds.map(m => (
                                <div key={m.code} className="border border-slate-300 rounded-lg p-2 bg-slate-50 flex flex-col justify-between break-inside-avoid shadow-sm">
                                    <div className="flex justify-between items-start mb-1">
                                        <span className="font-black text-sm text-slate-900 leading-none">{m.code}</span>
                                        <span className="font-bold text-slate-500 text-[9px]">{m.loc}</span>
                                    </div>
                                    <div className="text-[9px] text-slate-600 truncate font-medium leading-tight mb-2">
                                        {m.desc}
                                    </div>
                                    
                                    {/* Breakdown of Finishes */}
                                    <div className="space-y-1 mb-1">
                                        {Object.entries(m.breakdown).map(([key, qty]) => (
                                            <div key={key} className={`flex justify-between items-center text-[9px] font-bold px-1.5 py-0.5 rounded border ${getFinishStyle(key)}`}>
                                                <span>{key === 'STD' ? 'ΒΑΣ' : key}</span>
                                                <span className="font-black">{qty}</span>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="text-right border-t border-slate-200 pt-1 mt-1">
                                         <span className="font-black text-lg text-slate-900 leading-none">{m.totalQty} <span className="text-[9px] font-normal text-slate-500">συν.</span></span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                
                {/* Imported Products Section */}
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
                                            {product.image_url && <img src={product.image_url} className="w-full h-full object-cover"/>}
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
                                                    <span className="block text-[7px] uppercase opacity-70">ΣΗΜΕΙΩΣΗ</span>
                                                    {batch.notes}
                                                </div>
                                            ) : (
                                                <>
                                                    <p className="font-bold text-slate-800">ΕΙΣΑΓΩΓΗ</p>
                                                    <p className="truncate text-slate-700 font-bold">ΠΡΟΜ: {product.supplier_details?.name || 'Unknown'}</p>
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
