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
        <div className="bg-white text-slate-900 font-sans w-[210mm] min-h-[297mm] p-6 mx-auto shadow-lg print:shadow-none print:p-6">
            <header className="flex justify-between items-start border-b border-slate-200 pb-3 mb-4">
                <img src={APP_LOGO} alt="ILIOS" className="w-20 object-contain" />
                <div className="text-right">
                    <h1 className="text-xl font-black text-slate-800 uppercase tracking-tight flex items-center justify-end gap-2"><Hammer /> Φύλλο Τεχνίτη</h1>
                    <p className="text-slate-500 text-xs mt-1">Ημερομηνία: {new Date().toLocaleDateString('el-GR')}</p>
                </div>
            </header>

            <main className="grid grid-cols-2 gap-x-3 gap-y-2">
                {groupedItems.map(item => (
                    <div key={item.sku + item.variantSuffix} className="border border-slate-800 rounded-lg p-1.5 flex flex-col break-inside-avoid">
                        {/* Top part: SKU, Plating, Sizes */}
                        <div className="flex-1">
                            <p className="text-lg font-black text-slate-800 tracking-tight leading-tight">{item.sku}{item.variantSuffix}</p>
                            <p className="text-xs font-semibold text-blue-700 mt-0.5">{item.platingDesc}</p>
                            
                            {Object.keys(item.sizes).length > 0 && (
                                <div className="mt-1 flex flex-wrap gap-0.5">
                                    {Object.entries(item.sizes).sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true })).map(([size, qty]) => (
                                        <div key={size} className="bg-slate-100 border border-slate-200 rounded px-1 py-0.5 text-[8px]">
                                            <span className="font-bold">{size}</span>: <span className="font-mono">{qty}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Bottom part: Image and Quantity */}
                        <div className="flex items-end gap-1.5 mt-1.5 pt-1.5 border-t border-slate-200">
                            <div className="w-10 h-10 bg-slate-100 rounded-md overflow-hidden border border-slate-200 shrink-0">
                                {item.imageUrl && <img src={item.imageUrl} className="w-full h-full object-cover"/>}
                            </div>
                            <div className="flex-1"></div> {/* Spacer */}
                            <div className="text-center pr-1">
                                <p className="text-[8px] font-bold text-slate-500 uppercase">Ποσότητα</p>
                                <p className="text-2xl font-black text-slate-800 leading-none">{item.totalQuantity}</p>
                            </div>
                        </div>
                    </div>
                ))}
                 {groupedItems.length === 0 && (
                    <div className="col-span-2 text-center text-slate-400 py-20">
                        <p className="font-medium">Δεν υπάρχουν προϊόντα για παραγωγή σε αυτή την επιλογή.</p>
                    </div>
                )}
            </main>
        </div>
    );
}