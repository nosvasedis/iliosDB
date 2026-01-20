
import React from 'react';
import { ProductionBatch, Mold, Product, Material, RecipeItem, ProductionType } from '../types';
import { APP_LOGO } from '../constants';
import { Box, MapPin, ImageIcon, Tag, Factory, RefreshCcw, Globe } from 'lucide-react';

interface Props {
    batch: ProductionBatch;
    allMolds: Mold[];
    allProducts: Product[];
    allMaterials: Material[];
}

export default function ProductionWorkerView({ batch, allMolds, allProducts, allMaterials }: Props) {
    const product = batch.product_details;
    if (!product) {
        return <div className="p-8 text-center text-red-500">Product details not found.</div>;
    }

    const fullSku = product.sku + (batch.variant_suffix || '');
    const variant = product.variants?.find(v => v.suffix === batch.variant_suffix);
    const description = variant?.description || product.category;

    const requiredMolds = product.molds
        .map(pm => {
            const details = allMolds.find(m => m.code === pm.code);
            return details ? { ...details, quantity: pm.quantity } : null;
        })
        .filter((m): m is (Mold & { quantity: number }) => !!m);

    const recipeItems = product.recipe.map(item => {
        if (item.type === 'raw') {
            const details = allMaterials.find(m => m.id === item.id);
            return {
                name: details?.name || `Υλικό #${item.id}`,
                quantity: item.quantity,
                unit: details?.unit || 'τεμ'
            };
        } else { // component
            const details = allProducts.find(p => p.sku === item.sku);
            return {
                name: details?.sku || item.sku,
                quantity: item.quantity,
                unit: 'τεμ'
            };
        }
    });

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('el-GR', {
            day: '2-digit', month: '2-digit', year: 'numeric'
        });
    };

    return (
        // Changed from min-h-[297mm] to h-auto with border-dashed for stacking multiple on one page
        <div className="w-full bg-white text-slate-900 p-6 font-sans text-sm leading-normal h-auto border-b-2 border-dashed border-slate-300 mb-4 pb-6 print:break-inside-avoid">
            {/* COMPACT HEADER */}
            <div className="flex justify-between items-center border-b border-slate-200 pb-2 mb-3">
                <div>
                    <img src={APP_LOGO} alt="ILIOS" className="h-6 object-contain" />
                </div>
                <div className="text-right">
                    <h1 className="text-base font-black text-slate-800 uppercase tracking-tight flex items-center justify-end gap-2">
                        {batch.type === 'Φρεσκάρισμα' ? <RefreshCcw size={14} className="text-slate-600"/> : <Factory size={14} />}
                        Εντολη Παραγωγησ
                    </h1>
                    <div className="flex items-center justify-end gap-2 text-[10px] mt-0.5">
                        <span className="text-slate-500 font-mono font-bold">#{batch.id.slice(0,8)}</span>
                        <span className="text-slate-300">|</span>
                        <span className="text-slate-600 font-bold">{formatDate(batch.created_at)}</span>
                    </div>
                </div>
            </div>

            {/* PRODUCT INFO - Horizontal Compact */}
            <div className="flex gap-4 mb-4">
                <div className="w-20 h-20 bg-slate-50 rounded-lg overflow-hidden border border-slate-200 shrink-0">
                    {product.image_url ? (
                        <img src={product.image_url} alt={product.sku} className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-300"><ImageIcon size={24} /></div>
                    )}
                </div>
                <div className="flex-1">
                    <div className="flex justify-between items-start">
                        <div>
                            <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Προϊον</div>
                            <h2 className="text-2xl font-black text-slate-900 leading-none">{fullSku}</h2>
                            <p className="text-slate-600 font-bold text-xs mt-0.5">{description}</p>
                        </div>
                        <div className="text-right">
                            <div className="text-[9px] font-bold text-slate-400 uppercase">Ποσοτητα</div>
                            <div className="text-3xl font-black text-slate-900 leading-none">{batch.quantity}</div>
                        </div>
                    </div>
                    <div className="flex gap-3 mt-2">
                        {product.supplier_sku && (
                            <span className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[9px] font-bold text-slate-500">Ref: {product.supplier_sku}</span>
                        )}
                        <span className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[9px] font-bold text-slate-500">Βάρος: {product.weight_g.toFixed(2)}g</span>
                    </div>
                </div>
            </div>

            {/* MAIN CONTENT GRID - Dense */}
            <main className="grid grid-cols-2 gap-4 text-xs">
                {/* Left Column: Molds & Recipe */}
                <div className="space-y-3">
                    {/* MOLDS */}
                    {product.production_type === ProductionType.InHouse && (
                        <div className="border border-slate-200 rounded-lg p-2">
                            <h3 className="text-[10px] font-bold text-slate-500 uppercase mb-1 flex items-center gap-1 border-b border-slate-100 pb-1">
                                <MapPin size={10}/> Λάστιχα
                            </h3>
                            {requiredMolds.length > 0 ? (
                                <ul className="space-y-1">
                                    {requiredMolds.map(mold => (
                                        <li key={mold.code} className="flex justify-between">
                                            <span className="font-mono font-bold text-slate-800">{mold.code} (x{mold.quantity})</span>
                                            <span className="text-slate-500">{mold.location}</span>
                                        </li>
                                    ))}
                                </ul>
                            ) : <span className="text-[9px] text-slate-400 italic">None</span>}
                        </div>
                    )}

                    {/* RECIPE */}
                    {product.production_type === ProductionType.InHouse && (
                         <div className="border border-slate-200 rounded-lg p-2">
                            <h3 className="text-[10px] font-bold text-slate-500 uppercase mb-1 flex items-center gap-1 border-b border-slate-100 pb-1">
                                <Box size={10}/> Υλικά (ανά τμχ)
                            </h3>
                            {recipeItems.length > 0 ? (
                                <ul className="space-y-1">
                                    {recipeItems.map((item, idx) => (
                                        <li key={idx} className="flex justify-between">
                                            <span className="text-slate-700 font-medium truncate pr-2">{item.name}</span>
                                            <span className="font-bold text-slate-900 whitespace-nowrap">{item.quantity} {item.unit}</span>
                                        </li>
                                    ))}
                                </ul>
                            ) : <span className="text-[9px] text-slate-400 italic">Μόνο Ασήμι</span>}
                        </div>
                    )}
                </div>

                {/* Right Column: Notes */}
                <div>
                     <div className="border border-slate-200 rounded-lg p-2 h-full bg-slate-50/50">
                         <h3 className="text-[10px] font-bold text-slate-500 uppercase mb-1 flex items-center gap-1 border-b border-slate-200 pb-1">
                            <Tag size={10}/> Σημειώσεις
                        </h3>
                        <div className="text-slate-700 italic leading-snug min-h-[60px]">
                            {batch.notes || '-'}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
