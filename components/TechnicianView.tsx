
import React, { useMemo } from 'react';
import { ProductionBatch, ProductionType } from '../types';
import { APP_LOGO } from '../constants';
import { Hammer } from 'lucide-react';
import { getVariantComponents } from '../utils/pricingEngine';

interface Props {
    batches: ProductionBatch[];
}

interface GroupedItem {
    sku: string;
    variantSuffix?: string;
    imageUrl?: string | null;
    platingDesc: string;
    totalQuantity: number;
    sizes: Record<string, number>;
}

export default function TechnicianView({ batches }: Props) {
    const groupedItems = useMemo(() => {
        const map = new Map<string, GroupedItem>();

        batches
            .filter(batch => batch.product_details?.production_type !== ProductionType.Imported) // Filter out imported products
            .forEach(batch => {
                const product = batch.product_details;
                if (!product) return;
                
                const { finish } = getVariantComponents(batch.variant_suffix || '', product.gender);
                const platingDesc = finish.name;

                // Group by SKU, variant, but NOT size initially
                const key = `${batch.sku}-${batch.variant_suffix || ''}`;
                
                if (map.has(key)) {
                    const existing = map.get(key)!;
                    existing.totalQuantity += batch.quantity;
                    if(batch.size_info) {
                        existing.sizes[batch.size_info] = (existing.sizes[batch.size_info] || 0) + batch.quantity;
                    }
                } else {
                    const sizes: Record<string, number> = {};
                    if(batch.size_info) {
                        sizes[batch.size_info] = batch.quantity;
                    }
                    map.set(key, {
                        sku: batch.sku,
                        variantSuffix: batch.variant_suffix,
                        imageUrl: product.image_url,
                        platingDesc,
                        totalQuantity: batch.quantity,
                        sizes
                    });
                }
            });
        return Array.from(map.values()).sort((a,b) => (a.sku + (a.variantSuffix || '')).localeCompare(b.sku + (b.variantSuffix || '')));
    }, [batches]);

    return (
        <div className="bg-white text-slate-900 font-sans w-[210mm] min-h-[297mm] p-4 mx-auto shadow-lg print:shadow-none print:p-4">
            <header className="flex justify-between items-start border-b border-slate-200 pb-2 mb-4">
                <img src={APP_LOGO} alt="ILIOS" className="w-16 object-contain" />
                <div className="text-right">
                    <h1 className="text-base font-black text-slate-800 uppercase tracking-tight flex items-center justify-end gap-2"><Hammer size={18}/> Φύλλο Τεχνίτη</h1>
                    <p className="text-slate-500 text-xs font-bold mt-1">Ημ: {new Date().toLocaleDateString('el-GR')}</p>
                </div>
            </header>

            <main className="grid grid-cols-3 gap-3">
                {groupedItems.map(item => (
                    <div key={item.sku + item.variantSuffix} className="border-2 border-slate-800 rounded-xl p-2 flex flex-col justify-between break-inside-avoid h-28 bg-white">
                        {/* Top part: SKU, Plating */}
                        <div className="flex justify-between items-start">
                            <div>
                                <p className="text-sm font-black text-slate-900 tracking-tight leading-tight uppercase">{item.sku}{item.variantSuffix}</p>
                                <p className="text-[10px] font-bold text-slate-900 mt-0.5 uppercase">{item.platingDesc}</p>
                            </div>
                            <div className="w-10 h-10 bg-slate-100 rounded overflow-hidden border border-slate-200 shrink-0">
                                {item.imageUrl && <img src={item.imageUrl} className="w-full h-full object-cover"/>}
                            </div>
                        </div>

                        {/* Middle: Sizes */}
                        {Object.keys(item.sizes).length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                                {Object.entries(item.sizes).sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true })).map(([size, qty]) => (
                                    <div key={size} className="bg-slate-100 border border-slate-300 rounded px-1.5 py-0.5 text-[9px]">
                                        <span className="font-black text-slate-800">{size}</span>: <span className="font-bold text-slate-600">{qty}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Bottom: Total Quantity */}
                        <div className="mt-auto pt-1 border-t border-slate-100 flex justify-between items-end">
                            <span className="text-[9px] font-bold text-slate-400 uppercase">Συνολο</span>
                            <span className="text-2xl font-black text-slate-900 leading-none">{item.totalQuantity}</span>
                        </div>
                    </div>
                ))}
                 {groupedItems.length === 0 && (
                    <div className="col-span-3 text-center text-slate-400 py-20">
                        <p className="font-medium">Δεν υπάρχουν προϊόντα για παραγωγή σε αυτή την επιλογή.</p>
                    </div>
                )}
            </main>
        </div>
    );
}
