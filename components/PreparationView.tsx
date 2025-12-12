
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
    
    // Filter batches into In-House and Imported
    const inHouseBatches = batches.filter(b => b.product_details?.production_type !== ProductionType.Imported);
    const importedBatches = batches.filter(b => b.product_details?.production_type === ProductionType.Imported);

    return (
        <div className="bg-white text-slate-900 font-sans w-[210mm] min-h-[297mm] p-4 mx-auto shadow-lg print:shadow-none print:p-4">
            <header className="flex justify-between items-center border-b border-slate-200 pb-2 mb-3">
                <img src={APP_LOGO} alt="ILIOS" className="w-16 object-contain" />
                <div className="text-right">
                    <h1 className="text-base font-black text-slate-800 uppercase tracking-tight">Φύλλο Προετοιμασίας</h1>
                    <p className="text-slate-500 text-xs font-bold">Ημ: {new Date().toLocaleDateString('el-GR')}</p>
                </div>
            </header>
            
            <main>
                {/* In-House Production Section */}
                {inHouseBatches.length > 0 && (
                    <div className="space-y-2">
                        <div className="grid grid-cols-3 gap-3">
                            {inHouseBatches.map(batch => {
                                const product = batch.product_details;
                                if (!product) return null;
                                
                                const variant = product.variants?.find(v => v.suffix === batch.variant_suffix);
                                const platingDesc = variant?.description || product.category;

                                return (
                                    <div key={batch.id} className="border-2 border-slate-800 rounded-xl p-2 flex flex-row gap-2 break-inside-avoid h-28 bg-white overflow-hidden relative">
                                        {/* Image & Qty Column */}
                                        <div className="flex flex-col items-center justify-between w-14 shrink-0 h-full">
                                            <div className="w-14 h-14 bg-slate-100 rounded-lg overflow-hidden border border-slate-200 shrink-0">
                                                {product.image_url ? (
                                                    <img src={product.image_url} className="w-full h-full object-cover" alt="img"/>
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-slate-300 text-[8px]">No Img</div>
                                                )}
                                            </div>
                                            <div className="text-2xl font-black text-slate-900 leading-none text-center">x{batch.quantity}</div>
                                        </div>

                                        {/* Details Column */}
                                        <div className="flex-1 min-w-0 flex flex-col justify-between">
                                            <div>
                                                <div className="leading-tight">
                                                    <span className="text-sm font-black text-slate-900 block truncate uppercase">{batch.sku}{batch.variant_suffix || ''}</span>
                                                    <span className="text-[10px] font-bold text-blue-700 truncate block uppercase">{platingDesc}</span>
                                                </div>
                                                {batch.size_info && <span className="text-[10px] font-black bg-slate-200 text-slate-800 px-1.5 py-0.5 rounded inline-block mt-1">{batch.size_info}</span>}
                                            </div>

                                            <div className="text-[9px] leading-tight mt-1">
                                                {/* Materials Inline */}
                                                {product.recipe.length > 0 ? (
                                                    <div className="text-slate-800 line-clamp-2">
                                                        <span className="font-bold">Υλικά: </span>
                                                        {product.recipe.map((item, idx) => {
                                                            const details = item.type === 'raw' ? allMaterials.find(m => m.id === item.id) : allProducts.find(p => p.sku === item.sku);
                                                            const name = item.type === 'raw' ? (details as Material)?.name : item.sku;
                                                            return <span key={idx}>{name} <b>({item.quantity})</b>{idx < product.recipe.length - 1 ? ', ' : ''}</span>;
                                                        })}
                                                    </div>
                                                ) : null}

                                                {/* Molds Inline */}
                                                {product.molds.length > 0 && (
                                                    <div className="text-slate-900 mt-0.5 font-bold">
                                                        <span className="font-normal text-slate-500">Λάστιχα: </span>
                                                        {product.molds.map((mold, idx) => {
                                                            return <span key={idx} className="uppercase">{mold.code} (x{mold.quantity}){idx < product.molds.length - 1 ? ', ' : ''}</span>;
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
                    <div className="mt-6 pt-2 border-t-2 border-slate-800 break-before-avoid">
                        <h2 className="text-sm font-black text-slate-900 uppercase mb-3">Είδη Εισαγωγής</h2>
                        <div className="grid grid-cols-3 gap-3">
                        {importedBatches.map(batch => {
                            const product = batch.product_details;
                            if (!product) return null;
                            
                            return (
                                <div key={batch.id} className="border-2 border-purple-300 bg-purple-50 rounded-xl p-2 flex flex-row gap-2 break-inside-avoid h-28 overflow-hidden">
                                     <div className="flex flex-col items-center justify-between w-14 shrink-0 h-full">
                                        <div className="w-14 h-14 bg-white rounded-lg overflow-hidden border border-purple-200 shrink-0">
                                            {product.image_url && <img src={product.image_url} className="w-full h-full object-cover"/>}
                                        </div>
                                        <div className="text-2xl font-black text-purple-900 leading-none">x{batch.quantity}</div>
                                    </div>
                                    <div className="flex-1 min-w-0 flex flex-col justify-between">
                                        <div>
                                            <p className="text-sm font-black text-slate-900 tracking-tight leading-tight uppercase">{batch.sku}{batch.variant_suffix || ''}</p>
                                            {product.supplier_sku && (
                                                <p className="text-[10px] font-bold text-slate-600 bg-white px-1 rounded border border-slate-200 w-fit mt-1">{product.supplier_sku}</p>
                                            )}
                                        </div>
                                        <div className="text-[9px]">
                                            <p className="font-bold text-purple-800">ΕΙΣΑΓΩΓΗ</p>
                                            <p className="truncate text-slate-700">Προμ: <b>{product.supplier_details?.name || 'Unknown'}</b></p>
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
