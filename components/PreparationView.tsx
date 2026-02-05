
import React, { useMemo } from 'react';
import { ProductionBatch, Product, Material, RecipeItem, MaterialType, ProductionType, Mold } from '../types';
import { APP_LOGO } from '../constants';
import { Box, Coins, Gem, Puzzle, Globe, MapPin, StickyNote } from 'lucide-react';
import { getVariantComponents } from '../utils/pricingEngine';

interface Props {
    batches: ProductionBatch[];
    allMaterials: Material[];
    allProducts: Product[];
    allMolds: Mold[];
}

export default function PreparationView({ batches, allMaterials, allProducts, allMolds }: Props) {
    
    // Sort logic
    const sortBatches = (a: ProductionBatch, b: ProductionBatch) => {
        const keyA = (a.sku + (a.variant_suffix || '')).toUpperCase();
        const keyB = (b.sku + (b.variant_suffix || '')).toUpperCase();
        return keyA.localeCompare(keyB, undefined, { numeric: true });
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

    return (
        <div className="bg-white text-slate-900 font-sans w-[210mm] min-h-[297mm] p-8 mx-auto shadow-lg print:shadow-none print:p-8 print:w-full">
            {/* HEADER */}
            <div className="flex justify-between items-center border-b-2 border-slate-900 pb-3 mb-6">
                <div className="w-28">
                     <img src={APP_LOGO} alt="ILIOS" className="w-full h-auto object-contain block" />
                </div>
                <div className="text-right">
                    <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight">Φύλλο Προετοιμασίας</h1>
                    <p className="text-slate-600 text-sm font-bold mt-1">Ημερομηνία: {new Date().toLocaleDateString('el-GR')}</p>
                </div>
            </div>
            
            <main>
                {/* In-House Production Section */}
                {inHouseBatches.length > 0 && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            {inHouseBatches.map(batch => {
                                const product = batch.product_details;
                                if (!product) return null;
                                
                                const variant = product.variants?.find(v => v.suffix === batch.variant_suffix);
                                const platingDesc = variant?.description || product.category;

                                return (
                                    <div key={batch.id} className="border-2 border-slate-900 rounded-2xl p-3 flex flex-row gap-4 break-inside-avoid bg-white min-h-[9rem]">
                                        {/* Image & Qty Column */}
                                        <div className="flex flex-col items-center justify-between w-16 shrink-0 h-full">
                                            <div className="w-16 h-16 bg-slate-100 rounded-xl overflow-hidden border border-slate-200 shrink-0">
                                                {product.image_url ? (
                                                    <img src={product.image_url} className="w-full h-full object-cover" alt="img"/>
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-slate-300 text-[10px]">No Img</div>
                                                )}
                                            </div>
                                            <div className="text-3xl font-black text-slate-900 leading-none text-center mt-2">x{batch.quantity}</div>
                                        </div>

                                        {/* Details Column */}
                                        <div className="flex-1 min-w-0 flex flex-col gap-2">
                                            
                                            {/* Header Info */}
                                            <div className="leading-tight border-b border-slate-100 pb-1.5">
                                                <span className="text-lg font-black text-slate-900 block truncate uppercase">{batch.sku}{batch.variant_suffix || ''}</span>
                                                <span className="text-xs font-bold text-slate-600 truncate block uppercase mt-0.5">{platingDesc}</span>
                                                
                                                {batch.size_info && (
                                                    <span className="text-xs font-black bg-slate-200 text-slate-800 px-2 py-0.5 rounded inline-block mt-1">
                                                        {batch.size_info}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Materials & Molds Section */}
                                            <div className="text-[11px] leading-tight space-y-1.5">
                                                {product.recipe.length > 0 && (
                                                    <div className="text-slate-800 font-bold">
                                                        <span className="text-slate-500 uppercase text-[10px]">ΥΛΙΚΑ: </span>
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
                                                        <span className="font-bold text-slate-500 uppercase text-[10px]">ΛΑΣΤΙΧΑ: </span>
                                                        <span className="font-bold">
                                                            {product.molds.map((pm, idx) => {
                                                                const details = allMolds.find(m => m.code === pm.code);
                                                                return (
                                                                    <span key={idx}>
                                                                        {pm.code} <span className="text-[10px] font-black">(x{pm.quantity})</span>
                                                                        {details?.description && (
                                                                            <span className="font-medium text-[10px] text-slate-600 normal-case italic"> ({details.description})</span>
                                                                        )}
                                                                        {idx < product.molds.length - 1 ? ', ' : ''}
                                                                    </span>
                                                                );
                                                            })}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Notes Section */}
                                            {batch.notes && (
                                                <div className="mt-auto pt-2">
                                                    <div className="text-[9px] font-black text-emerald-800 uppercase flex items-center gap-1 mb-1">
                                                        <StickyNote size={10}/> ΣΗΜΕΙΩΣΗ
                                                    </div>
                                                    <div className="bg-emerald-50 p-2 rounded-lg border border-emerald-100 text-[11px] font-bold text-emerald-900 leading-snug">
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

                {/* Aggregated Molds Section */}
                {aggregatedMolds.length > 0 && (
                    <div className="mt-8 border-t-2 border-slate-900 pt-6 break-inside-avoid">
                        <h2 className="text-sm font-black text-slate-900 uppercase mb-4 flex items-center gap-2">
                            <MapPin size={18}/> Συγκεντρωτική Λίστα Λάστιχων
                        </h2>
                        <div className="grid grid-cols-4 gap-3">
                            {aggregatedMolds.map(m => (
                                <div key={m.code} className="border border-slate-300 rounded-xl p-3 bg-slate-50 flex flex-col justify-between break-inside-avoid shadow-sm">
                                    <div className="flex justify-between items-start mb-1.5">
                                        <span className="font-black text-lg text-slate-900 leading-none">{m.code}</span>
                                        <span className="font-bold text-slate-500 text-[10px] bg-white px-1.5 py-0.5 rounded border border-slate-100">{m.loc}</span>
                                    </div>
                                    <div className="text-[11px] text-slate-600 truncate font-medium leading-tight mb-3">
                                        {m.desc}
                                    </div>
                                    
                                    {/* Breakdown of Finishes */}
                                    <div className="space-y-1 mb-2">
                                        {Object.entries(m.breakdown).map(([key, qty]) => (
                                            <div key={key} className={`flex justify-between items-center text-[10px] font-bold px-2 py-1 rounded-lg border ${getFinishStyle(key)}`}>
                                                <span>{key === 'STD' ? 'ΒΑΣ' : key}</span>
                                                <span className="font-black">{qty}</span>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="text-right border-t border-slate-200 pt-2 mt-1">
                                         <span className="font-black text-xl text-slate-900 leading-none">{m.totalQty} <span className="text-xs font-normal text-slate-500 ml-0.5">συν.</span></span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                
                {/* Imported Products Section */}
                {importedBatches.length > 0 && (
                    <div className="mt-8 pt-4 border-t-2 border-slate-800 break-before-avoid">
                        <h2 className="text-base font-black text-slate-900 uppercase mb-4 flex items-center gap-2">
                            <Globe size={18}/> Είδη Εισαγωγής
                        </h2>
                        <div className="grid grid-cols-2 gap-4">
                        {importedBatches.map(batch => {
                            const product = batch.product_details;
                            if (!product) return null;
                            
                            return (
                                <div key={batch.id} className="border-2 border-dashed border-slate-600 bg-slate-50 rounded-2xl p-3 flex flex-row gap-4 break-inside-avoid min-h-[7rem]">
                                     <div className="flex flex-col items-center justify-between w-14 shrink-0 h-full">
                                        <div className="w-14 h-14 bg-white rounded-xl overflow-hidden border border-slate-200 shrink-0">
                                            {product.image_url && <img src={product.image_url} className="w-full h-full object-cover"/>}
                                        </div>
                                        <div className="text-3xl font-black text-slate-900 leading-none mt-2">x{batch.quantity}</div>
                                    </div>
                                    <div className="flex-1 min-w-0 flex flex-col justify-between">
                                        <div>
                                            <p className="text-base font-black text-slate-900 tracking-tight leading-tight uppercase">{batch.sku}{batch.variant_suffix || ''}</p>
                                            {product.supplier_sku && (
                                                <p className="text-xs font-bold text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200 w-fit mt-1.5 font-mono">Ref: {product.supplier_sku}</p>
                                            )}
                                        </div>
                                        <div className="text-[10px] mt-2">
                                            {batch.notes ? (
                                                <div className="bg-emerald-100 p-2 rounded-lg border border-emerald-200 text-emerald-900 font-bold">
                                                    <span className="block text-[8px] uppercase opacity-70 mb-0.5">ΣΗΜΕΙΩΣΗ</span>
                                                    {batch.notes}
                                                </div>
                                            ) : (
                                                <div className="bg-white/50 p-1.5 rounded border border-slate-100">
                                                    <p className="font-bold text-slate-800 uppercase text-[9px] mb-0.5">Προμηθευτής</p>
                                                    <p className="truncate text-slate-700 font-bold">{product.supplier_details?.name || 'Άγνωστος'}</p>
                                                </div>
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
            
            {/* Page number or footer info */}
            <footer className="mt-8 pt-4 border-t border-slate-200 text-center">
                <p className="text-[9px] text-slate-400 uppercase tracking-widest font-bold">Ilios Kosmima ERP • Σύστημα Διαχείρισης Παραγωγής</p>
            </footer>
        </div>
    );
}
