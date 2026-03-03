import React, { useMemo } from 'react';
import { ProductionBatch, Product } from '../types';
import { APP_LOGO } from '../constants';
import { Layers, User, Hash } from 'lucide-react';
import { formatOrderId } from '../utils/orderUtils';

interface Props {
    batches: ProductionBatch[];
    allProducts: Product[];
}

interface AssemblyItem {
    batch: ProductionBatch;
    product: Product | undefined;
    customerName: string;
}

interface CustomerGroup {
    customerName: string;
    orderId: string;
    items: AssemblyItem[];
}

export default function AssemblyPrintView({ batches, allProducts }: Props) {
    // Group batches by customer
    const customerGroups = useMemo(() => {
        const groups: Record<string, CustomerGroup> = {};

        batches.forEach(batch => {
            const product = allProducts.find(p => p.sku === batch.sku);
            const customerName = (batch as any).customer_name || 'Χωρίς Πελάτη';
            const orderId = batch.order_id || 'no_order';
            const groupKey = `${customerName}_${orderId}`;

            if (!groups[groupKey]) {
                groups[groupKey] = {
                    customerName,
                    orderId,
                    items: []
                };
            }

            groups[groupKey].items.push({
                batch,
                product,
                customerName
            });
        });

        // Sort items within each group by SKU
        Object.values(groups).forEach(group => {
            group.items.sort((a, b) => {
                const skuA = `${a.batch.sku}${a.batch.variant_suffix || ''}`.toUpperCase();
                const skuB = `${b.batch.sku}${b.batch.variant_suffix || ''}`.toUpperCase();
                return skuA.localeCompare(skuB, undefined, { numeric: true });
            });
        });

        // Convert to array and sort by customer name
        return Object.values(groups).sort((a, b) => 
            a.customerName.localeCompare(b.customerName, 'el', { sensitivity: 'base' })
        );
    }, [batches, allProducts]);

    const totalItems = useMemo(() => 
        batches.reduce((sum, b) => sum + b.quantity, 0),
    [batches]);

    const totalSKUs = useMemo(() => 
        new Set(batches.map(b => `${b.sku}${b.variant_suffix || ''}`)).size,
    [batches]);

    return (
        <div className="bg-white text-slate-900 font-sans w-[210mm] min-h-[297mm] p-6 mx-auto shadow-lg print:shadow-none print:p-6 print:w-full">
            {/* HEADER */}
            <div className="flex justify-between items-center border-b-2 border-slate-900 pb-4 mb-6">
                <div className="flex items-center gap-4">
                    <div className="w-20">
                        <img src={APP_LOGO} alt="ILIOS" className="w-full h-auto object-contain block" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
                            <Layers size={28} className="text-pink-600" />
                            Συναρμολόγηση
                        </h1>
                        <p className="text-slate-500 text-sm font-bold mt-1">Φύλλο Εργασίας Συναρμολόγησης</p>
                    </div>
                </div>
                <div className="text-right">
                    <p className="text-slate-600 text-sm font-bold">Ημ/νία: {new Date().toLocaleDateString('el-GR')}</p>
                    <div className="flex items-center justify-end gap-4 mt-2 text-xs">
                        <span className="bg-pink-50 text-pink-700 px-3 py-1 rounded-full font-bold border border-pink-200">
                            {totalSKUs} SKU
                        </span>
                        <span className="bg-slate-100 text-slate-700 px-3 py-1 rounded-full font-bold border border-slate-200">
                            {totalItems} τεμ.
                        </span>
                    </div>
                </div>
            </div>

            {/* MAIN CONTENT */}
            <main className="space-y-8">
                {customerGroups.map((group, groupIndex) => (
                    <div key={`${group.customerName}_${group.orderId}`} className="break-inside-avoid">
                        {/* Customer Header */}
                        <div className="bg-pink-50 border border-pink-200 rounded-xl p-3 mb-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-pink-100 rounded-full flex items-center justify-center">
                                    <User size={20} className="text-pink-600" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-black text-slate-900">{group.customerName}</h2>
                                    <p className="text-xs font-bold text-pink-600">
                                        Εντολή #{formatOrderId(group.orderId)}
                                    </p>
                                </div>
                            </div>
                            <div className="text-right">
                                <span className="text-2xl font-black text-pink-700">
                                    {group.items.reduce((sum, item) => sum + item.batch.quantity, 0)}
                                </span>
                                <span className="text-xs font-bold text-pink-500 ml-1">τεμ.</span>
                            </div>
                        </div>

                        {/* Items Grid */}
                        <div className="grid grid-cols-2 gap-4">
                            {group.items.map((item, itemIndex) => {
                                const { batch, product } = item;
                                const fullSku = `${batch.sku}${batch.variant_suffix || ''}`;
                                const variantDesc = product?.variants?.find(v => v.suffix === batch.variant_suffix)?.description;
                                
                                return (
                                    <div 
                                        key={batch.id} 
                                        className="border-2 border-slate-200 rounded-xl p-3 flex gap-3 bg-white hover:border-pink-300 transition-colors"
                                    >
                                        {/* Product Image */}
                                        <div className="w-24 h-24 bg-slate-100 rounded-lg overflow-hidden border border-slate-200 shrink-0">
                                            {product?.image_url ? (
                                                <img 
                                                    src={product.image_url} 
                                                    alt={batch.sku}
                                                    className="w-full h-full object-cover"
                                                />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-slate-300 text-xs">
                                                    No Img
                                                </div>
                                            )}
                                        </div>

                                        {/* Product Details */}
                                        <div className="flex-1 min-w-0 flex flex-col justify-between">
                                            <div>
                                                {/* SKU */}
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-xl font-black text-slate-900 tracking-tight">
                                                        {fullSku}
                                                    </span>
                                                    {batch.size_info && (
                                                        <span className="bg-slate-200 text-slate-700 px-2 py-0.5 rounded text-xs font-black">
                                                            <Hash size={10} className="inline mr-0.5" />
                                                            {batch.size_info}
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Description */}
                                                <p className="text-sm font-bold text-slate-600 line-clamp-2">
                                                    {product?.description || product?.category || '—'}
                                                </p>
                                                {variantDesc && (
                                                    <p className="text-xs font-medium text-pink-600 mt-0.5">
                                                        {variantDesc}
                                                    </p>
                                                )}
                                            </div>

                                            {/* Quantity Badge */}
                                            <div className="flex items-center justify-between mt-2">
                                                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                                                    Ποσότητα
                                                </span>
                                                <span className="bg-pink-100 text-pink-800 px-3 py-1 rounded-lg text-lg font-black border border-pink-200">
                                                    x{batch.quantity}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Separator between customers (except for last) */}
                        {groupIndex < customerGroups.length - 1 && (
                            <div className="mt-8 border-b-2 border-dashed border-slate-200"></div>
                        )}
                    </div>
                ))}

                {customerGroups.length === 0 && (
                    <div className="text-center py-20 text-slate-400">
                        <Layers size={48} className="mx-auto mb-4 opacity-50" />
                        <p className="text-lg font-bold">Δεν βρέθηκαν είδη για συναρμολόγηση</p>
                    </div>
                )}
            </main>

            {/* FOOTER */}
            <footer className="mt-8 pt-4 border-t border-slate-200 text-center">
                <p className="text-xs text-slate-400 uppercase tracking-widest">
                    Ilios Kosmima ERP • Φύλλο Συναρμολόγησης
                </p>
            </footer>
        </div>
    );
}
