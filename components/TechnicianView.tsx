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
        return Array.from(map.values()).sort((a,b) => a.sku.localeCompare(b.sku));
    }, [batches]);

    return (
        <div className="bg-white text-slate-900 font-sans w-[210mm] min-h-[297mm] p-8 mx-auto shadow-lg print:shadow-none print:p-10">
            <header className="flex justify-between items-start border-b border-slate-200 pb-4 mb-6">
                <img src={APP_LOGO} alt="ILIOS" className="w-24 object-contain" />
                <div className="text-right">
                    <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tight flex items-center justify-end gap-2"><Hammer /> Φύλλο Τεχνίτη</h1>
                    <p className="text-slate-500 text-xs mt-1">Ημερομηνία: {new Date().toLocaleDateString('el-GR')}</p>
                </div>
            </header>

            <main className="space-y-4">
                {groupedItems.map(item => (
                    <div key={item.sku + item.variantSuffix} className="grid grid-cols-12 gap-4 items-center border border-slate-800 rounded-lg p-3 break-inside-avoid">
                        <div className="col-span-3">
                            <div className="aspect-square bg-slate-100 rounded-md overflow-hidden border border-slate-200">
                                {item.imageUrl && <img src={item.imageUrl} className="w-full h-full object-cover"/>}
                            </div>
                        </div>
                        <div className="col-span-6">
                            <p className="text-4xl font-black text-slate-800 tracking-tight">{item.sku}{item.variantSuffix}</p>
                            <p className="text-lg font-semibold text-blue-700 mt-2">{item.platingDesc}</p>
                            
                            {Object.keys(item.sizes).length > 0 && (
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {Object.entries(item.sizes).sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true })).map(([size, qty]) => (
                                        <div key={size} className="bg-slate-100 border border-slate-200 rounded px-2 py-1 text-sm">
                                            <span className="font-bold">{size}</span>: <span className="font-mono">{qty} τεμ.</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="col-span-3 text-center bg-slate-50 rounded-lg p-4 border border-slate-200">
                            <p className="text-sm font-bold text-slate-500 uppercase">Ποσότητα</p>
                            <p className="text-6xl font-black text-slate-800">{item.totalQuantity}</p>
                        </div>
                    </div>
                ))}
                 {groupedItems.length === 0 && (
                    <div className="text-center text-slate-400 py-20">
                        <p className="font-medium">Δεν υπάρχουν προϊόντα για παραγωγή σε αυτή την επιλογή.</p>
                    </div>
                )}
            </main>
        </div>
    );
}
