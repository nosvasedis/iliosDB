import React, { useMemo } from 'react';
import { AssemblyPrintRow, Product } from '../types';
import { APP_LOGO } from '../constants';
import { Layers, User, Hash } from 'lucide-react';
import { formatOrderId } from '../utils/orderUtils';

interface Props {
    rows: AssemblyPrintRow[];
    allProducts: Product[];
}

interface AssemblyItem {
    row: AssemblyPrintRow;
    product: Product | undefined;
}

interface OrderGroup {
    orderId: string;
    items: AssemblyItem[];
}

interface CustomerGroup {
    customerName: string;
    orders: OrderGroup[];
}

export default function AssemblyPrintView({ rows, allProducts }: Props) {
    const customerGroups = useMemo(() => {
        const customerMap = new Map<string, Map<string, AssemblyItem[]>>();

        rows.forEach((row) => {
            const product = allProducts.find((p) => p.sku === row.sku);
            const customerName = row.customer_name || 'Χωρίς Πελάτη';
            const orderId = row.order_id || 'no_order';

            if (!customerMap.has(customerName)) customerMap.set(customerName, new Map());
            const orderMap = customerMap.get(customerName)!;
            if (!orderMap.has(orderId)) orderMap.set(orderId, []);
            orderMap.get(orderId)!.push({ row, product });
        });

        const groups: CustomerGroup[] = Array.from(customerMap.entries())
            .map(([customerName, orderMap]) => {
                const orders: OrderGroup[] = Array.from(orderMap.entries())
                    .map(([orderId, items]) => ({
                        orderId,
                        items: [...items].sort((a, b) => {
                            const skuA = `${a.row.sku}${a.row.variant_suffix || ''}`.toUpperCase();
                            const skuB = `${b.row.sku}${b.row.variant_suffix || ''}`.toUpperCase();
                            const bySku = skuA.localeCompare(skuB, undefined, { numeric: true });
                            if (bySku !== 0) return bySku;
                            return (a.row.size_info || '').localeCompare(b.row.size_info || '');
                        })
                    }))
                    .sort((a, b) => a.orderId.localeCompare(b.orderId, undefined, { numeric: true }));
                return { customerName, orders };
            })
            .sort((a, b) => a.customerName.localeCompare(b.customerName, 'el', { sensitivity: 'base' }));

        return groups;
    }, [rows, allProducts]);

    const totalItems = useMemo(
        () => rows.reduce((sum, row) => sum + row.quantity, 0),
        [rows]
    );

    const totalSKUs = useMemo(
        () => new Set(rows.map((row) => `${row.order_id}::${row.sku}::${row.variant_suffix || ''}::${row.size_info || ''}`)).size,
        [rows]
    );

    const totalOrders = useMemo(
        () => new Set(rows.map((row) => row.order_id)).size,
        [rows]
    );

    return (
        <div className="bg-white text-slate-900 font-sans w-[210mm] min-h-[297mm] p-6 mx-auto shadow-lg print:shadow-none print:p-6 print:w-full">
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
                        <span className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full font-bold border border-blue-200">
                            {totalOrders} Εντολές
                        </span>
                        <span className="bg-pink-50 text-pink-700 px-3 py-1 rounded-full font-bold border border-pink-200">
                            {totalSKUs} SKU
                        </span>
                        <span className="bg-slate-100 text-slate-700 px-3 py-1 rounded-full font-bold border border-slate-200">
                            {totalItems} τεμ.
                        </span>
                    </div>
                </div>
            </div>

            <main className="space-y-8">
                {customerGroups.map((customerGroup, customerIndex) => (
                    <div key={customerGroup.customerName} className="break-inside-avoid">
                        <div className="bg-pink-50 border border-pink-200 rounded-xl p-3 mb-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-pink-100 rounded-full flex items-center justify-center">
                                    <User size={20} className="text-pink-600" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-black text-slate-900">{customerGroup.customerName}</h2>
                                    <p className="text-xs font-bold text-pink-600">
                                        {customerGroup.orders.length} εντολές
                                    </p>
                                </div>
                            </div>
                            <div className="text-right">
                                <span className="text-2xl font-black text-pink-700">
                                    {customerGroup.orders.reduce((sum, order) => sum + order.items.reduce((a, item) => a + item.row.quantity, 0), 0)}
                                </span>
                                <span className="text-xs font-bold text-pink-500 ml-1">τεμ.</span>
                            </div>
                        </div>

                        <div className="space-y-6">
                            {customerGroup.orders.map((orderGroup) => (
                                <section key={`${customerGroup.customerName}_${orderGroup.orderId}`} className="space-y-3">
                                    <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                                        <p className="text-xs font-black text-slate-700 uppercase tracking-wide">
                                            Εντολή #{formatOrderId(orderGroup.orderId)}
                                        </p>
                                        <p className="text-xs font-bold text-slate-500">
                                            {orderGroup.items.reduce((sum, item) => sum + item.row.quantity, 0)} τεμ.
                                        </p>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        {orderGroup.items.map((item) => {
                                            const { row, product } = item;
                                            const fullSku = `${row.sku}${row.variant_suffix || ''}`;
                                            const variantDesc = product?.variants?.find(v => v.suffix === row.variant_suffix)?.description;

                                            return (
                                                <div
                                                    key={row.id}
                                                    className="border-2 border-slate-200 rounded-xl p-3 flex gap-3 bg-white"
                                                >
                                                    <div className="w-24 h-24 bg-slate-100 rounded-lg overflow-hidden border border-slate-200 shrink-0">
                                                        {product?.image_url ? (
                                                            <img
                                                                src={product.image_url}
                                                                alt={row.sku}
                                                                className="w-full h-full object-cover"
                                                            />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center text-slate-300 text-xs">
                                                                No Img
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="flex-1 min-w-0 flex flex-col justify-between">
                                                        <div>
                                                            <div className="flex items-center gap-2 mb-1">
                                                                <span className="text-xl font-black text-slate-900 tracking-tight">
                                                                    {fullSku}
                                                                </span>
                                                                {row.size_info && (
                                                                    <span className="bg-slate-200 text-slate-700 px-2 py-0.5 rounded text-xs font-black">
                                                                        <Hash size={10} className="inline mr-0.5" />
                                                                        {row.size_info}
                                                                    </span>
                                                                )}
                                                            </div>

                                                            <p className="text-sm font-bold text-slate-600 line-clamp-2">
                                                                {product?.description || product?.category || '—'}
                                                            </p>
                                                            {variantDesc && (
                                                                <p className="text-xs font-medium text-pink-600 mt-0.5">
                                                                    {variantDesc}
                                                                </p>
                                                            )}
                                                        </div>

                                                        <div className="flex items-center justify-between mt-2">
                                                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                                                                Ποσότητα
                                                            </span>
                                                            <span className="bg-pink-100 text-pink-800 px-3 py-1 rounded-lg text-lg font-black border border-pink-200">
                                                                x{row.quantity}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </section>
                            ))}
                        </div>

                        {customerIndex < customerGroups.length - 1 && (
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

            <footer className="mt-8 pt-4 border-t border-slate-200 text-center">
                <p className="text-xs text-slate-400 uppercase tracking-widest">
                    Ilios Kosmima ERP • Φύλλο Συναρμολόγησης
                </p>
            </footer>
        </div>
    );
}
