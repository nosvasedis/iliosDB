
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
        return <div className="p-8 text-center text-red-500">Product details not found for this batch.</div>;
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
        <div className="w-full bg-white text-slate-900 p-8 font-sans text-sm leading-normal h-full flex flex-col page-break-inside-avoid break-inside-avoid">
            {/* COMPACT HEADER */}
            <div className="flex justify-between items-center border-b border-slate-200 pb-2 mb-4">
                <div>
                    <img src={APP_LOGO} alt="ILIOS" className="h-8 object-contain" />
                </div>
                <div className="text-right">
                    <h1 className="text-lg font-black text-slate-800 uppercase tracking-tight flex items-center justify-end gap-2">
                        {batch.type === 'Φρεσκάρισμα' ? <RefreshCcw size={16} className="text-slate-600"/> : <Factory size={16} />}
                        Εντολη Παραγωγησ
                    </h1>
                    <div className="flex items-center justify-end gap-3 text-xs mt-0.5">
                        <span className="text-slate-500 font-mono font-bold">#{batch.id.slice(0,8)}</span>
                        <span className="text-slate-300">|</span>
                        <span className="text-slate-600 font-bold">{formatDate(batch.created_at)}</span>
                    </div>
                </div>
            </div>

            {/* PRODUCT INFO */}
            <section className="grid grid-cols-12 gap-4 mb-4">
                <div className="col-span-3">
                    <div className="w-full aspect-square bg-slate-50 rounded-xl overflow-hidden border border-slate-200 shadow-sm">
                        {product.image_url ? (
                            <img src={product.image_url} alt={product.sku} className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-300"><ImageIcon size={32} /></div>
                        )}
                    </div>
                </div>
                <div className="col-span-9">
                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 h-full flex flex-col justify-between">
                        <div>
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Προϊον</p>
                                    <h2 className="text-2xl font-black text-slate-800 tracking-tight leading-none">{fullSku}</h2>
                                    <p className="text-slate-600 font-bold text-sm mt-1">{description}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase">Ποσοτητα</p>
                                    <p className="text-3xl font-black text-slate-900 leading-none">{batch.quantity}</p>
                                </div>
                            </div>
                            {product.supplier_sku && (
                                <div className="mt-1 inline-block px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px] font-bold text-slate-500">
                                    Ref: {product.supplier_sku}
                                </div>
                            )}
                        </div>
                        <div className="flex gap-4 mt-2">
                            <div className="bg-white rounded px-2 py-1 border border-slate-200 text-xs">
                                <span className="text-slate-400 font-bold mr-1">Βάρος:</span>
                                <span className="font-bold text-slate-800">{product.weight_g.toFixed(2)}g</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* MAIN CONTENT GRID */}
            <main className="flex-1 grid grid-cols-2 gap-4">
                {/* Left Column: Molds & Recipe */}
                <div className="space-y-4">
                    {/* MOLDS */}
                    {product.production_type === ProductionType.InHouse && (
                        <div className="bg-white rounded-xl border border-slate-100 p-3 break-inside-avoid">
                            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-2 flex items-center gap-2 pb-1 border-b border-slate-100">
                                <MapPin size={14} className="text-slate-600" /> Λάστιχα ({requiredMolds.length})
                            </h3>
                            {requiredMolds.length > 0 ? (
                                <table className="w-full text-left">
                                    <thead className="text-[10px] font-bold text-slate-500 uppercase">
                                        <tr>
                                            <th className="py-1 pr-2 w-1/4">Κωδ.</th>
                                            <th className="py-1 px-2 w-1/4">Θέση</th>
                                            <th className="py-1 pl-2 w-1/2">Περιγραφή</th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-xs">
                                        {requiredMolds.map(mold => (
                                            <tr key={mold.code} className="border-t border-slate-50">
                                                <td className="py-1.5 pr-2 font-mono font-bold text-slate-800">{mold.code} (x{mold.quantity})</td>
                                                <td className="py-1.5 px-2 text-slate-600 font-medium">{mold.location}</td>
                                                <td className="py-1.5 pl-2 text-slate-500 truncate">{mold.description}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : <p className="text-center text-slate-400 text-xs italic py-2">Δεν απαιτούνται λάστιχα.</p>}
                        </div>
                    )}
                     {/* SUPPLIER INFO for IMPORTED */}
                    {product.production_type === ProductionType.Imported && product.supplier_details && (
                        <div className="bg-white rounded-xl border border-slate-100 p-3 break-inside-avoid">
                            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-2 flex items-center gap-2 pb-1 border-b border-slate-100">
                                <Globe size={14} className="text-slate-600" /> Προμηθευτής
                            </h3>
                            <p className="font-bold text-slate-800 text-sm">{product.supplier_details.name}</p>
                            <p className="text-xs text-slate-500">{product.supplier_details.contact_person}</p>
                        </div>
                    )}


                    {/* RECIPE */}
                    {product.production_type === ProductionType.InHouse && (
                        <div className="bg-white rounded-xl border border-slate-100 p-3 break-inside-avoid">
                            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-2 flex items-center gap-2 pb-1 border-b border-slate-100">
                                <Box size={14} className="text-slate-600" /> Υλικά ανά τεμάχιο ({recipeItems.length})
                            </h3>
                            {recipeItems.length > 0 ? (
                                <table className="w-full text-left text-xs">
                                    <tbody>
                                        {recipeItems.map((item, idx) => (
                                            <tr key={idx} className="border-t border-slate-50">
                                                <td className="py-1.5 pr-2 text-slate-700 font-medium">{item.name}</td>
                                                <td className="py-1.5 pl-2 text-right font-bold text-slate-900">{item.quantity} <span className="font-normal text-slate-500">{item.unit}</span></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : <p className="text-center text-slate-400 text-xs italic py-2">Μόνο ασήμι.</p>}
                        </div>
                    )}

                </div>

                {/* Right Column: Checklists & Notes */}
                <div className="space-y-4">
                    <div className="bg-white rounded-xl border border-slate-100 p-3 break-inside-avoid h-full">
                         <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-2 flex items-center gap-2 pb-1 border-b border-slate-100">
                            <Tag size={14} className="text-slate-600" /> Σημειώσεις
                        </h3>
                        <div className="text-slate-600 text-sm leading-relaxed p-2 bg-slate-50 rounded-lg border border-slate-50 min-h-[100px] italic">
                            {batch.notes || 'Καμία σημείωση.'}
                        </div>
                    </div>
                </div>
            </main>
            
            <footer className="mt-4 pt-2 border-t border-slate-200 text-center">
                <p className="text-[9px] text-slate-400 uppercase tracking-widest">Ilios Kosmima ERP</p>
            </footer>
        </div>
    );
}
