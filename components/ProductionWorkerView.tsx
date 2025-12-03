
import React from 'react';
import { ProductionBatch, Mold, Product, Material, RecipeItem } from '../types';
import { APP_LOGO } from '../constants';
import { Box, MapPin, ImageIcon, Tag, Factory, RefreshCcw } from 'lucide-react';

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
        .map(code => allMolds.find(m => m.code === code))
        .filter((m): m is Mold => !!m);

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
            <header className="flex justify-between items-center border-b border-slate-200 pb-4 mb-6">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-slate-800 text-white rounded-xl">
                        <Factory size={24} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Εντολη Παραγωγησ</h1>
                        <div className="flex items-center gap-2">
                            <p className="text-slate-500 font-mono font-bold">{batch.id}</p>
                            {batch.type === 'Refurbish' && (
                                <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2 py-0.5 rounded flex items-center gap-1 border border-blue-200">
                                    <RefreshCcw size={12}/> Φρεσκάρισμα
                                </span>
                            )}
                        </div>
                    </div>
                </div>
                <div className="text-right">
                    <p className="text-slate-500 text-xs">Ημερομηνία: <span className="font-bold">{formatDate(batch.created_at)}</span></p>
                    {batch.order_id && <p className="text-slate-500 text-xs mt-1">Παραγγελία: <span className="font-bold font-mono">{batch.order_id}</span></p>}
                </div>
            </header>

            {/* PRODUCT INFO */}
            <section className="bg-slate-50 rounded-xl p-6 mb-6 border border-slate-100 grid grid-cols-12 gap-6 items-center">
                <div className="col-span-4">
                    <div className="w-full aspect-square bg-white rounded-lg overflow-hidden border border-slate-200 shadow-sm">
                        {product.image_url ? (
                            <img src={product.image_url} alt={product.sku} className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-300">
                                <ImageIcon size={40} />
                            </div>
                        )}
                    </div>
                </div>
                <div className="col-span-8 space-y-4">
                    <div className="border-b border-slate-200 pb-2">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">SKU</p>
                        <p className="text-4xl font-black text-slate-800 font-mono tracking-tighter">{fullSku}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Περιγραφη</p>
                            <p className="text-lg font-bold text-slate-700">{description}</p>
                        </div>
                        <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Ποσοτητα</p>
                            <p className="text-3xl font-black text-emerald-600">{batch.quantity} <span className="text-lg font-bold text-slate-500">τεμάχια</span></p>
                        </div>
                    </div>
                </div>
            </section>

            {/* MANUFACTURING DETAILS */}
            <main className="flex-1 grid grid-cols-2 gap-6">
                {/* MOLDS */}
                <div className="bg-white rounded-xl border border-slate-100 p-5">
                    <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-4 flex items-center gap-2 pb-3 border-b border-slate-100">
                        <MapPin size={16} className="text-amber-500" /> Απαιτούμενα Λάστιχα
                    </h3>
                    {requiredMolds.length > 0 ? (
                        <table className="w-full text-left text-xs">
                            <thead className="font-bold text-slate-400">
                                <tr>
                                    <th className="py-1 pr-2">Κωδ.</th>
                                    <th className="py-1 px-2">Περιγραφή</th>
                                    <th className="py-1 pl-2">Τοποθεσία</th>
                                </tr>
                            </thead>
                            <tbody>
                                {requiredMolds.map(mold => (
                                    <tr key={mold.code} className="border-t border-slate-100">
                                        <td className="py-2 pr-2 font-mono font-bold text-slate-700">{mold.code}</td>
                                        <td className="py-2 px-2 text-slate-600">{mold.description}</td>
                                        <td className="py-2 pl-2 text-slate-500 font-medium">{mold.location}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <p className="text-center text-slate-400 text-xs italic py-8">Δεν απαιτούνται λάστιχα.</p>
                    )}
                </div>

                {/* MATERIALS */}
                <div className="bg-white rounded-xl border border-slate-100 p-5">
                    <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-4 flex items-center gap-2 pb-3 border-b border-slate-100">
                        <Box size={16} className="text-purple-500" /> Απαιτούμενα Υλικά (ανά τεμάχιο)
                    </h3>
                    <table className="w-full text-left text-xs">
                        <thead className="font-bold text-slate-400">
                            <tr>
                                <th className="py-1 pr-2">Υλικό / Εξάρτημα</th>
                                <th className="py-1 pl-2 text-right">Ποσότητα</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr className="border-t border-slate-100">
                                <td className="py-2 pr-2 text-slate-600 font-medium">Ασήμι 925 (Βάση)</td>
                                <td className="py-2 pl-2 text-right font-bold text-slate-700">{product.weight_g} g</td>
                            </tr>
                            {recipeItems.map((item, index) => (
                                <tr key={index} className="border-t border-slate-100">
                                    <td className="py-2 pr-2 text-slate-600">{item.name}</td>
                                    <td className="py-2 pl-2 text-right font-bold text-slate-700">{item.quantity} {item.unit}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </main>

            <footer className="mt-8 pt-4 border-t border-slate-200 text-center">
                <p className="text-xs text-slate-400">Εσωτερικό έγγραφο παραγωγής - Ilios Kosmima ERP</p>
            </footer>
        </div>
    );
}