
import React, { useMemo } from 'react';
import { ProductionBatch, Product, Material, Mold, ProductionType } from '../types';
import { X, Box, MapPin, Info, Image as ImageIcon, Scale, Calculator, StickyNote } from 'lucide-react';
import { formatCurrency, formatDecimal, getVariantComponents } from '../utils/pricingEngine';

interface Props {
    batch: ProductionBatch;
    allMaterials: Material[];
    allMolds: Mold[];
    onClose: () => void;
}

export default function BatchBuildModal({ batch, allMaterials, allMolds, onClose }: Props) {
    const product = batch.product_details;

    const buildData = useMemo(() => {
        if (!product) return null;

        // 1. Molds
        const requiredMolds = product.molds.map(pm => {
            const details = allMolds.find(m => m.code === pm.code);
            return {
                code: pm.code,
                quantity: pm.quantity,
                location: details?.location || 'Unknown',
                description: details?.description
            };
        });

        // 2. Recipe (With Totals)
        const recipeItems = product.recipe.map(item => {
            let name = '';
            let unit = 'τεμ';
            let cost = 0;

            if (item.type === 'raw') {
                const mat = allMaterials.find(m => m.id === item.id);
                name = mat?.name || `Material #${item.id}`;
                unit = mat?.unit || 'τεμ';
                cost = mat?.cost_per_unit || 0;
            } else {
                name = item.sku; // Component SKU
                // We don't have deep access to component details here easily without passing allProducts, 
                // but SKU is usually sufficient for picking.
            }

            return {
                type: item.type,
                name,
                unit,
                qtyPerUnit: item.quantity,
                totalQtyRequired: item.quantity * batch.quantity
            };
        });

        // 3. Variant Info
        const { finish, stone } = getVariantComponents(batch.variant_suffix || '', product.gender);
        const fullDescription = [
            product.category,
            finish.name,
            stone.name
        ].filter(Boolean).join(' • ');

        return {
            molds: requiredMolds,
            recipe: recipeItems,
            description: fullDescription,
            totalSilverWeight: (product.weight_g + (product.secondary_weight_g || 0)) * batch.quantity
        };

    }, [product, batch, allMaterials, allMolds]);

    if (!product || !buildData) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
            <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                
                {/* Header */}
                <div className="p-6 border-b border-slate-100 flex justify-between items-start bg-slate-50/50">
                    <div className="flex items-center gap-4">
                        <div className="w-16 h-16 bg-white rounded-xl border border-slate-200 flex items-center justify-center overflow-hidden shrink-0 shadow-sm">
                            {product.image_url ? (
                                <img src={product.image_url} className="w-full h-full object-cover" alt={product.sku} />
                            ) : (
                                <ImageIcon size={24} className="text-slate-300" />
                            )}
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-2xl font-black text-slate-800 tracking-tight">{batch.sku}</h2>
                                {batch.variant_suffix && (
                                    <span className="bg-slate-800 text-white px-2 py-0.5 rounded-lg text-lg font-mono font-bold">
                                        {batch.variant_suffix}
                                    </span>
                                )}
                            </div>
                            <p className="text-sm text-slate-500 font-medium mt-1">{buildData.description}</p>
                            {batch.size_info && (
                                <div className="mt-2 inline-flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs font-bold border border-blue-100">
                                    <Scale size={12}/> Size: {batch.size_info}
                                </div>
                            )}
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                        <div className="text-right bg-emerald-50 px-5 py-3 rounded-2xl border border-emerald-100">
                            <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-1">Ποσοτητα Παρτιδας</div>
                            <div className="text-4xl font-black text-emerald-700 leading-none">{batch.quantity}</div>
                        </div>
                        <button onClick={onClose} className="p-3 bg-slate-100 hover:bg-slate-200 rounded-full text-slate-500 transition-colors">
                            <X size={24}/>
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        
                        {/* LEFT COLUMN: RESOURCES */}
                        <div className="space-y-6">
                            
                            {/* Notes Alert */}
                            {batch.notes && (
                                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-3 shadow-sm">
                                    <StickyNote className="text-amber-500 shrink-0" size={24}/>
                                    <div>
                                        <h4 className="font-bold text-amber-800 text-sm uppercase tracking-wide mb-1">Σημειωση Παραγωγης</h4>
                                        <p className="text-amber-900 font-medium text-sm leading-relaxed">{batch.notes}</p>
                                    </div>
                                </div>
                            )}

                            {/* Molds */}
                            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                                <div className="bg-slate-50 px-5 py-3 border-b border-slate-200 flex justify-between items-center">
                                    <h3 className="font-bold text-slate-700 flex items-center gap-2">
                                        <MapPin size={18} className="text-orange-500"/> Απαιτούμενα Λάστιχα
                                    </h3>
                                </div>
                                <div className="p-2">
                                    {buildData.molds.length > 0 ? (
                                        <div className="space-y-2">
                                            {buildData.molds.map(m => (
                                                <div key={m.code} className="flex justify-between items-center p-3 rounded-xl bg-orange-50/50 border border-orange-100">
                                                    <div className="flex flex-col">
                                                        <span className="font-black text-slate-800 text-lg">{m.code}</span>
                                                        <span className="text-xs text-slate-500">{m.description}</span>
                                                    </div>
                                                    <div className="text-right">
                                                        <span className="block text-[10px] font-bold text-slate-400 uppercase">Τοποθεσια</span>
                                                        <span className="text-sm font-bold text-orange-700">{m.location}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="p-4 text-center text-slate-400 text-sm italic">Δεν απαιτούνται λάστιχα.</div>
                                    )}
                                </div>
                            </div>

                            {/* Metal Estimation */}
                            <div className="bg-slate-100 rounded-2xl p-5 flex justify-between items-center border border-slate-200">
                                <div>
                                    <h4 className="font-bold text-slate-700 text-sm uppercase tracking-wide">Εκτιμηση Μεταλλου</h4>
                                    <p className="text-xs text-slate-500">Ασήμι 925 (χωρίς απώλεια)</p>
                                </div>
                                <div className="text-2xl font-black text-slate-600">
                                    {formatDecimal(buildData.totalSilverWeight, 1)} <span className="text-sm text-slate-400 font-bold">gr</span>
                                </div>
                            </div>
                        </div>

                        {/* RIGHT COLUMN: RECIPE / BOM */}
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden h-full min-h-[400px]">
                            <div className="bg-slate-50 px-5 py-4 border-b border-slate-200">
                                <h3 className="font-bold text-slate-700 flex items-center gap-2">
                                    <Box size={18} className="text-blue-500"/> Υλικά & Εξαρτήματα
                                </h3>
                                <p className="text-xs text-slate-400 mt-1">Λίστα συλλογής για {batch.quantity} τεμάχια.</p>
                            </div>
                            
                            <div className="flex-1 overflow-auto">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-white text-slate-400 text-[10px] uppercase font-black tracking-wider sticky top-0 shadow-sm z-10">
                                        <tr>
                                            <th className="p-4 border-b border-slate-100">Υλικο</th>
                                            <th className="p-4 border-b border-slate-100 text-center">Ανα Τμχ</th>
                                            <th className="p-4 border-b border-slate-100 text-right bg-blue-50/30 text-blue-600">Συνολο</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {buildData.recipe.length > 0 ? buildData.recipe.map((item, idx) => (
                                            <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                                <td className="p-4">
                                                    <span className={`font-bold ${item.type === 'raw' ? 'text-slate-700' : 'text-purple-700'}`}>
                                                        {item.name}
                                                    </span>
                                                    {item.type === 'component' && <span className="ml-2 text-[9px] bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded font-bold">STX</span>}
                                                </td>
                                                <td className="p-4 text-center font-mono text-slate-500">
                                                    {formatDecimal(item.qtyPerUnit, 2)}
                                                </td>
                                                <td className="p-4 text-right bg-blue-50/10">
                                                    <span className="font-black text-lg text-blue-900">{formatDecimal(item.totalQtyRequired, 2)}</span>
                                                    <span className="text-xs text-blue-400 font-medium ml-1">{item.unit}</span>
                                                </td>
                                            </tr>
                                        )) : (
                                            <tr>
                                                <td colSpan={3} className="p-12 text-center text-slate-400 italic">
                                                    Δεν απαιτούνται επιπλέον υλικά.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                    </div>
                </div>

                <div className="p-6 bg-slate-50 border-t border-slate-200 flex justify-end">
                    <button onClick={onClose} className="bg-slate-900 text-white px-8 py-3 rounded-xl font-bold hover:bg-black transition-colors shadow-lg active:scale-95">
                        Κλείσιμο
                    </button>
                </div>
            </div>
        </div>
    );
}
