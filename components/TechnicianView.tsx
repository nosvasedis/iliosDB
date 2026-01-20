
import React, { useMemo } from 'react';
import { ProductionBatch, ProductionType } from '../types';
import { APP_LOGO } from '../constants';
import { Hammer, StickyNote } from 'lucide-react';
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
    notes: Set<string>;
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

                // Group by SKU, variant
                const key = `${batch.sku}-${batch.variant_suffix || ''}`;
                
                if (map.has(key)) {
                    const existing = map.get(key)!;
                    existing.totalQuantity += batch.quantity;
                    if(batch.size_info) {
                        existing.sizes[batch.size_info] = (existing.sizes[batch.size_info] || 0) + batch.quantity;
                    }
                    if(batch.notes) existing.notes.add(batch.notes);
                } else {
                    const sizes: Record<string, number> = {};
                    if(batch.size_info) {
                        sizes[batch.size_info] = batch.quantity;
                    }
                    const notes = new Set<string>();
                    if(batch.notes) notes.add(batch.notes);

                    map.set(key, {
                        sku: batch.sku,
                        variantSuffix: batch.variant_suffix,
                        imageUrl: product.image_url,
                        platingDesc,
                        totalQuantity: batch.quantity,
                        sizes,
                        notes
                    });
                }
            });
        return Array.from(map.values()).sort((a,b) => (a.sku + (a.variantSuffix || '')).localeCompare(b.sku + (b.variantSuffix || '')));
    }, [batches]);

    return (
        <div className="bg-white text-slate-900 font-sans w-[210mm] min-h-[297mm] p-6 mx-auto shadow-lg print:shadow-none print:p-6 print:w-full">
            {/* HEADER changed to DIV */}
            <div className="flex justify-between items-start border-b border-slate-900 pb-2 mb-4">
                <div className="w-24">
                     <img src={APP_LOGO} alt="ILIOS" className="w-full h-auto object-contain block" />
                </div>
                <div className="text-right">
                    <h1 className="text-base font-black text-slate-800 uppercase tracking-tight flex items-center justify-end gap-2"><Hammer size={18}/> Φύλλο Τεχνίτη</h1>
                    <p className="text-slate-600 text-xs font-bold mt-1">Ημ: {new Date().toLocaleDateString('el-GR')}</p>
                </div>
            </div>

            <main className="grid grid-cols-3 gap-3">
                {groupedItems.map(item => (
                    <div key={item.sku + item.variantSuffix} className="border-2 border-slate-800 rounded-xl p-2 flex flex-col justify-between break-inside-avoid min-h-[8rem] bg-white">
                        {/* Top part: SKU, Plating */}
                        <div className="flex justify-between items-start mb-2 border-b border-slate-100 pb-1">
                            <div>
                                <p className="text-sm font-black text-slate-900 tracking-tight leading-tight uppercase">{item.sku}{item.variantSuffix}</p>
                                <p className="text-[10px] font-bold text-slate-600 mt-0.5 uppercase">{item.platingDesc}</p>
                            </div>
                            <div className="w-10 h-10 bg-slate-100 rounded overflow-hidden border border-slate-200 shrink-0">
                                {item.imageUrl && <img src={item.imageUrl} className="w-full h-full object-cover"/>}
                            </div>
                        </div>

                        {/* Middle: Sizes & Notes */}
                        <div className="flex-1 space-y-1">
                            {Object.keys(item.sizes).length > 0 && (
                                <div className="flex flex-wrap gap-1 mb-1">
                                    {Object.entries(item.sizes).sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true })).map(([size, qty]) => (
                                        <div key={size} className="bg-slate-100 border border-slate-300 rounded px-1.5 py-0.5 text-[9px]">
                                            <span className="font-black text-slate-800">{size}</span>: <span className="font-bold text-slate-600">{qty}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                            
                            {item.notes.size > 0 && (
                                <div className="space-y-1 mt-1">
                                    {Array.from(item.notes).map((note, nIdx) => (
                                        <div key={nIdx} className="bg-emerald-50 border border-emerald-100 text-emerald-900 p-1 rounded">
                                            <div className="text-[7px] font-black uppercase flex items-center gap-0.5 text-emerald-700 mb-0.5">
                                                <StickyNote size={6}/> ΣΗΜΕΙΩΣΗ
                                            </div>
                                            <div className="text-[9px] font-bold leading-tight">
                                                {note}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Bottom: Total Quantity */}
                        <div className="mt-2 pt-1 border-t border-slate-200 flex justify-between items-end">
                            <span className="text-[9px] font-bold text-slate-500 uppercase">Συνολο</span>
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
