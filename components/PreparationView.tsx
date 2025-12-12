
import React from 'react';
import { ProductionBatch, Product, Material, RecipeItem, MaterialType, ProductionType, Mold } from '../types';
import { APP_LOGO } from '../constants';
import { Box, Coins, Gem, Puzzle, Globe, MapPin } from 'lucide-react';

interface Props {
    batches: ProductionBatch[];
    allMaterials: Material[];
    allProducts: Product[];
    allMolds: Mold[];
}

interface AggregatedResource {
    name: string;
    unit: string;
    totalQuantity: number;
    type: 'material' | 'component' | 'stone';
}

export default function PreparationView({ batches, allMaterials, allProducts, allMolds }: Props) {
    
    const aggregatedResources = new Map<string, AggregatedResource>();

    // Filter batches into In-House and Imported
    const inHouseBatches = batches.filter(b => b.product_details?.production_type !== ProductionType.Imported);
    const importedBatches = batches.filter(b => b.product_details?.production_type === ProductionType.Imported);

    // Only aggregate resources for in-house production
    inHouseBatches.forEach(batch => {
        const product = batch.product_details;
        if (!product) return;

        product.recipe.forEach(item => {
            const requiredQuantity = item.quantity * batch.quantity;
            if (item.type === 'raw') {
                const details = allMaterials.find(m => m.id === item.id);
                if (!details) return;

                const key = `raw-${details.id}`;
                const isStone = details.type === MaterialType.Stone;

                if (aggregatedResources.has(key)) {
                    aggregatedResources.get(key)!.totalQuantity += requiredQuantity;
                } else {
                    aggregatedResources.set(key, {
                        name: details.name,
                        unit: details.unit,
                        totalQuantity: requiredQuantity,
                        type: isStone ? 'stone' : 'material'
                    });
                }
            } else { // component
                const details = allProducts.find(p => p.sku === item.sku);
                if (!details) return;

                const key = `comp-${details.sku}`;
                if (aggregatedResources.has(key)) {
                    aggregatedResources.get(key)!.totalQuantity += requiredQuantity;
                } else {
                    aggregatedResources.set(key, {
                        name: details.sku,
                        unit: 'τεμ',
                        totalQuantity: requiredQuantity,
                        type: 'component'
                    });
                }
            }
        });
    });

    return (
        <div className="bg-white text-slate-900 font-sans w-[210mm] min-h-[297mm] p-4 mx-auto shadow-lg print:shadow-none print:p-4">
            <header className="flex justify-between items-center border-b border-slate-200 pb-2 mb-3">
                <img src={APP_LOGO} alt="ILIOS" className="w-16 object-contain" />
                <div className="text-right">
                    <h1 className="text-sm font-black text-slate-800 uppercase tracking-tight">Φύλλο Προετοιμασίας</h1>
                    <p className="text-slate-500 text-[10px]">Ημ: {new Date().toLocaleDateString('el-GR')}</p>
                </div>
            </header>
            
            <main>
                {/* In-House Production Section */}
                {inHouseBatches.length > 0 && (
                    <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                            {inHouseBatches.map(batch => {
                                const product = batch.product_details;
                                if (!product) return null;
                                
                                const variant = product.variants?.find(v => v.suffix === batch.variant_suffix);
                                const platingDesc = variant?.description || product.category;

                                return (
                                    <div key={batch.id} className="border border-slate-200 rounded-lg p-1.5 flex flex-row gap-2 break-inside-avoid h-fit bg-white">
                                        {/* Image & Qty Column */}
                                        <div className="flex flex-col items-center gap-1 w-12 shrink-0">
                                            <div className="w-12 h-12 bg-slate-100 rounded overflow-hidden border border-slate-200 shrink-0">
                                                {product.image_url ? (
                                                    <img src={product.image_url} className="w-full h-full object-cover" alt="img"/>
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-slate-300 text-[8px]">No Img</div>
                                                )}
                                            </div>
                                            <div className="text-base font-black text-slate-800 leading-none bg-slate-50 px-1 rounded border border-slate-100">x{batch.quantity}</div>
                                        </div>

                                        {/* Details Column */}
                                        <div className="flex-1 min-w-0 flex flex-col">
                                            <div className="flex justify-between items-start border-b border-slate-100 pb-0.5 mb-0.5">
                                                <div className="leading-tight">
                                                    <span className="text-xs font-black text-slate-800 block truncate">{batch.sku}{batch.variant_suffix || ''}</span>
                                                    <span className="text-[9px] text-blue-600 truncate block max-w-[120px]">{platingDesc}</span>
                                                </div>
                                                {batch.size_info && <span className="text-[9px] font-bold bg-amber-50 text-amber-700 px-1 rounded border border-amber-100 whitespace-nowrap">{batch.size_info}</span>}
                                            </div>

                                            <div className="text-[8px] leading-tight space-y-0.5">
                                                {/* Materials Inline */}
                                                {product.recipe.length > 0 ? (
                                                    <div className="text-slate-700">
                                                        <span className="font-bold text-slate-400">Υλικά: </span>
                                                        {product.recipe.map((item, idx) => {
                                                            const details = item.type === 'raw' ? allMaterials.find(m => m.id === item.id) : allProducts.find(p => p.sku === item.sku);
                                                            const name = item.type === 'raw' ? (details as Material)?.name : item.sku;
                                                            return <span key={idx}>{name} <b>({item.quantity})</b>{idx < product.recipe.length - 1 ? ', ' : ''}</span>;
                                                        })}
                                                    </div>
                                                ) : <div className="text-[8px] text-slate-400 italic">Μόνο μέταλλο.</div>}

                                                {/* Molds Inline */}
                                                {product.molds.length > 0 && (
                                                    <div className="text-slate-700 mt-0.5">
                                                        <span className="font-bold text-slate-400">Λάστιχα: </span>
                                                        {product.molds.map((mold, idx) => {
                                                            const moldDetails = allMolds.find(m => m.code === mold.code);
                                                            return <span key={idx} className="font-mono font-bold text-slate-600">{mold.code}{moldDetails?.location ? `[${moldDetails.location}]` : ''}{idx < product.molds.length - 1 ? ', ' : ''}</span>;
                                                        })}
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
                
                {/* Imported Products Section */}
                {importedBatches.length > 0 && (
                    <div className="mt-4 pt-2 border-t-2 border-slate-800 break-before-avoid">
                        <h2 className="text-xs font-bold text-slate-800 uppercase mb-2">Είδη Εισαγωγής</h2>
                        <div className="grid grid-cols-2 gap-2">
                        {importedBatches.map(batch => {
                            const product = batch.product_details;
                            if (!product) return null;
                            
                            return (
                                <div key={batch.id} className="border border-purple-200 bg-purple-50/30 rounded-lg p-1.5 flex flex-row gap-2 break-inside-avoid h-fit">
                                     <div className="flex flex-col items-center gap-1 w-12 shrink-0">
                                        <div className="w-12 h-12 bg-white rounded overflow-hidden border border-purple-100 shrink-0">
                                            {product.image_url && <img src={product.image_url} className="w-full h-full object-cover"/>}
                                        </div>
                                        <div className="text-base font-black text-purple-900 leading-none">x{batch.quantity}</div>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-black text-slate-800 tracking-tight leading-tight">{batch.sku}{batch.variant_suffix || ''}</p>
                                        <p className="text-[9px] text-slate-500 mt-0.5 flex items-center gap-1"><Globe size={10}/> Εισαγόμενο</p>
                                        <p className="text-[9px] mt-0.5 truncate text-slate-600">Προμ: <b>{product.supplier_details?.name || 'Unknown'}</b></p>
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
