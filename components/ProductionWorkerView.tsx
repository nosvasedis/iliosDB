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
            {/* HEADER */}
            <header className="flex justify-between items-start border-b border-slate-200 pb-4 mb-6">
                <div>
                    <img src={APP_LOGO} alt="ILIOS" className="w-24 object-contain" />
                </div>
                <div className="text-right">
                    <h1 className="text-xl font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                        {batch.type === 'Φρεσκάρισμα' ? <RefreshCcw size={18} className="text-blue-600"/> : <Factory size={18} />}
                        Εντολη Παραγωγησ
                    </h1>
                    <p className="text-slate-500 font-mono font-bold">#{batch.id}</p>
                    <p className="text-slate-500 text-xs mt-1">Ημερομηνία: <span className="font-bold">{formatDate(batch.created_at)}</span></p>
                </div>
            </header>

            {/* PRODUCT INFO */}
            <section className="grid grid-cols-12 gap-6 mb-6">
                <div className="col-span-4">
                    <div className="w-full aspect-square bg-slate-100 rounded-xl overflow-hidden border border-slate-200 shadow-sm">
                        {product.image_url ? (
                            <img src={product.image_url} alt={product.sku} className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-300"><ImageIcon size={40} /></div>
                        )}
                    </div>
                </div>
                <div className="col-span-8">
                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 h-full flex flex-col justify-between">
                        <div>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Προϊον</p>
                            <h2 className="text-3xl font-black text-slate-800 tracking-tight mt-1">{fullSku}</h2>
                            <p className="text-slate-600 font-medium mt-1">{description}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-4 mt-4 text-center">
                            <div className="bg-white rounded-lg p-2 border border-slate-200">
                                <p className="text-[10px] font-bold text-slate-400 uppercase">Ποσοτητα</p>
                                <p className="text-2xl font-black text-slate-800">{batch.quantity}</p>
                            </div>
                            <div className="bg-white rounded-lg p-2 border border-slate-200">
                                <p className="text-[10px] font-bold text-slate-400 uppercase">Βαρος (g)</p>
                                <p className="text-2xl font-black text-slate-800">{product.weight_g.toFixed(2)}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* MAIN CONTENT GRID */}
            <main className="flex-1 grid grid-cols-2 gap-6">
                {/* Left Column: Molds & Recipe */}
                <div className="space-y-6">
                    {/* MOLDS */}
                    {product.production_type === ProductionType.InHouse && (
                        <div className="bg-white rounded-xl border border-slate-100 p-4 break-inside-avoid">
                            <h3 className="text-base font-bold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-2 pb-2 border-b border-slate-100">
                                <MapPin size={18} className="text-amber-500" /> Λάστιχα ({requiredMolds.length})
                            </h3>
                            {requiredMolds.length > 0 ? (
                                <table className="w-full text-left">
                                    <thead className="text-xs font-bold text-slate-400">
                                        <tr>
                                            <th className="py-1 pr-2 w-1/4">Κωδ.</th>
                                            <th className="py-1 px-2 w-1/4">Τοποθεσία</th>
                                            <th className="py-1 pl-2 w-1/2">Περιγραφή</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {requiredMolds.map(mold => (
                                            <tr key={mold.code} className="border-t border-slate-100">
                                                <td className="py-2 pr-2 font-mono font-bold text-slate-700">{mold.code} (x{mold.quantity})</td>
                                                <td className="py-2 px-2 text-slate-600 font-medium">{mold.location}</td>
                                                <td className="py-2 pl-2 text-slate-500">{mold.description}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : <p className="text-center text-slate-400 text-xs italic py-4">Δεν απαιτούνται λάστιχα.</p>}
                        </div>
                    )}
                     {/* SUPPLIER INFO for IMPORTED */}
                    {product.production_type === ProductionType.Imported && product.supplier_details && (
                        <div className="bg-white rounded-xl border border-slate-100 p-4 break-inside-avoid">
                            <h3 className="text-base font-bold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-2 pb-2 border-b border-slate-100">
                                <Globe size={18} className="text-purple-500" /> Προμηθευτής
                            </h3>
                            <p className="font-bold text-slate-800">{product.supplier_details.name}</p>
                            <p className="text-xs text-slate-500">{product.supplier_details.contact_person}</p>
                        </div>
                    )}


                    {/* RECIPE */}
                    {product.production_type === ProductionType.InHouse && (
                        <div className="bg-white rounded-xl border border-slate-100 p-4 break-inside-avoid">
                            <h3 className="text-base font-bold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-2 pb-2 border-b border-slate-100">
                                <Box size={18} className="text-purple-500" /> Υλικά ανά τεμάχιο ({recipeItems.length})
                            </h3>
                            {recipeItems.length > 0 ? (
                                <table className="w-full text-left">
                                    <tbody>
                                        {recipeItems.map((item, idx) => (
                                            <tr key={idx} className="border-t border-slate-100">
                                                <td className="py-2 pr-2 text-slate-600">{item.name}</td>
                                                <td className="py-2 pl-2 text-right font-bold text-slate-800">{item.quantity} <span className="font-normal text-slate-500">{item.unit}</span></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : <p className="text-center text-slate-400 text-xs italic py-4">Μόνο ασήμι.</p>}
                        </div>
                    )}

                </div>

                {/* Right Column: Checklists & Notes */}
                <div className="space-y-6">
                    {/* EMPTY for now */}
                </div>
            </main>
            
            <div className="bg-white rounded-xl border border-slate-100 p-4 break-inside-avoid mt-6">
                <h3 className="text-base font-bold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-2 pb-2 border-b border-slate-100">
                    <Tag size={18} className="text-emerald-500" /> Σημειώσεις Παραγγελίας
                </h3>
                <div className="text-slate-700 text-sm leading-relaxed min-h-[50px] bg-slate-50 p-3 rounded-lg border border-slate-100">
                    {batch.notes || 'Καμία σημείωση.'}
                </div>
            </div>


            <footer className="mt-8 pt-4 border-t border-slate-200 text-center">
                <p className="text-xs text-slate-400">Εντολή Παραγωγής - Ilios Kosmima ERP</p>
            </footer>
        </div>
    );
}
