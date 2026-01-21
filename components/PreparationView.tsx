
import React from 'react';
import { ProductionBatch, Product, Material, RecipeItem, MaterialType, ProductionType, Mold } from '../types';
import { APP_LOGO } from '../constants';
import { Box, Coins, Gem, Puzzle, Globe, MapPin, StickyNote } from 'lucide-react';

interface Props {
    batches: ProductionBatch[];
    allMaterials: Material[];
    allProducts: Product[];
    allMolds: Mold[];
}

export default function PreparationView({ batches, allMaterials, allProducts, allMolds }: Props) {
    
    // Filter batches into In-House and Imported
    const inHouseBatches = batches.filter(b => b.product_details?.production_type !== ProductionType.Imported);
    const importedBatches = batches.filter(b => b.product_details?.production_type === ProductionType.Imported);

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
                                            </div>

                                            {/* Materials & Molds Section - Always Visible */}
                                            <div className="text-[9px] leading-tight space-y-1">
                                                {product.recipe.length > 0 && (
                                                    <div className="text-slate-800 font-bold">
                                                        <span className="text-slate-500 uppercase text-[8px]">ΥΛΙΚΑ: </span>
                                                        {product.recipe.map((item, idx) => {
                                                            const details = item.type === 'raw' ? allMaterials.find(m => m.id === item.id) : allProducts.find(p => p.sku === item.sku);
                                                            const name = item.type === 'raw' ? (details as Material)?.name : item.sku;
                                                            return <span key={idx}>{name} ({item.quantity}){idx < product.recipe.length - 1 ? ', ' : ''}</span>;
                                                        })}
                                                    </div>
                                                )}

                                                {product.molds.length > 0 && (
                                                    <div className="text-slate-900">
                                                        <span className="font-bold text-slate-500 uppercase text-[8px]">ΛΑΣΤΙΧΑ: </span>
                                                        <span className="font-bold">{product.molds.map((pm) => pm.code).join(', ')}</span>
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
