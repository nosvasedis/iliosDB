import React, { useMemo } from 'react';
import { AssemblyPrintRow, Product } from '../types';
import { APP_LOGO } from '../constants';
import { Layers, User, Hash } from 'lucide-react';
import { formatOrderId } from '../utils/orderUtils';
import { getVariantComponents } from '../utils/pricingEngine';

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

const TEXT_FINISH_COLORS: Record<string, string> = {
    'X': 'text-amber-600',
    'P': 'text-slate-500',
    'D': 'text-orange-600',
    'H': 'text-cyan-500',
    '': 'text-slate-400'
};

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
        <div className="bg-white text-slate-900 font-sans w-[210mm] min-h-[297mm] p-4 mx-auto shadow-lg print:shadow-none print:p-4 print:w-full">
            <div className="flex justify-between items-center border-b-2 border-slate-900 pb-3 mb-4">
                <div className="flex items-center gap-4">
                    <div className="w-16">
                        <img src={APP_LOGO} alt="ILIOS" className="w-full h-auto object-contain block" />
                    </div>
                    <div>
                        <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
                            <Layers size={22} className="text-pink-600" />
                            Συναρμολόγηση
                        </h1>
                        <p className="text-slate-500 text-xs font-bold mt-0.5">Φύλλο Εργασίας Συναρμολόγησης</p>
                    </div>
                </div>
                <div className="text-right">
                    <p className="text-slate-600 text-xs font-bold">Ημ/νία: {new Date().toLocaleDateString('el-GR')}</p>
                    <div className="flex items-center justify-end gap-2 mt-1.5 text-[11px]">
                        <span className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full font-bold border border-blue-200">
                            {totalOrders} Εντολές
                        </span>
                        <span className="bg-pink-50 text-pink-700 px-3 py-1 rounded-full font-bold border border-pink-200">
                            {totalSKUs} κωδικοί
                        </span>
                        <span className="bg-slate-100 text-slate-700 px-3 py-1 rounded-full font-bold border border-slate-200">
                            {totalItems} τεμ.
                        </span>
                    </div>
                </div>
            </div>

            <main className="space-y-2">
                {customerGroups.map((customerGroup, customerIndex) => (
                    <div key={customerGroup.customerName} className="mb-2">
                        {/* Customer header — break-after:avoid keeps it with first product row */}
                        <div
                            className="bg-pink-50 border border-pink-200 rounded-lg px-2.5 py-1.5 mb-1.5 flex items-center justify-between"
                            style={{ breakAfter: 'avoid', pageBreakAfter: 'avoid' }}
                        >
                            <div className="flex items-center gap-2">
                                <div className="w-6 h-6 bg-pink-100 rounded-full flex items-center justify-center shrink-0">
                                    <User size={13} className="text-pink-600" />
                                </div>
                                <div>
                                    <h2 className="text-sm font-black text-slate-900 leading-tight">{customerGroup.customerName}</h2>
                                    <p className="text-[10px] font-bold text-pink-600 leading-none mt-0.5">
                                        {customerGroup.orders.length} εντολές
                                    </p>
                                </div>
                            </div>
                            <div className="text-right">
                                <span className="text-lg font-black text-pink-700">
                                    {customerGroup.orders.reduce((sum, order) => sum + order.items.reduce((a, item) => a + item.row.quantity, 0), 0)}
                                </span>
                                <span className="text-[10px] font-bold text-pink-500 ml-0.5">τεμ.</span>
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            {customerGroup.orders.map((orderGroup) => (
                                <section key={`${customerGroup.customerName}_${orderGroup.orderId}`} className="space-y-1">
                                    {/* Order sub-header — break-after:avoid to stay with products */}
                                    <div
                                        className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded px-2 py-1"
                                        style={{ breakAfter: 'avoid', pageBreakAfter: 'avoid' }}
                                    >
                                        <p className="text-[10px] font-black text-slate-600 uppercase tracking-wide">
                                            Εντολή #{formatOrderId(orderGroup.orderId)}
                                        </p>
                                        <p className="text-[10px] font-bold text-slate-400">
                                            {orderGroup.items.reduce((sum, item) => sum + item.row.quantity, 0)} τεμ.
                                        </p>
                                    </div>

                                    {/* Product grid — 3 cols, horizontal, 80px image */}
                                    <div className="grid grid-cols-3 gap-1">
                                        {orderGroup.items.map((item) => {
                                            const { row, product } = item;
                                            const { finish } = getVariantComponents(row.variant_suffix || '', product?.gender);
                                            const finishColor = TEXT_FINISH_COLORS[finish.code] || TEXT_FINISH_COLORS[''];

                                            return (
                                                <div
                                                    key={row.id}
                                                    className="border border-slate-200 rounded-lg p-1 flex gap-1.5 bg-white"
                                                    style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
                                                >
                                                    {/* Image — 80×80 */}
                                                    <div className="w-20 h-20 bg-slate-100 rounded-md overflow-hidden border border-slate-200 shrink-0">
                                                        {product?.image_url ? (
                                                            <img
                                                                src={product.image_url}
                                                                alt={row.sku}
                                                                className="w-full h-full object-cover"
                                                            />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center text-slate-300 text-[8px] text-center px-1">
                                                                Χωρίς εικόνα
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Info column */}
                                                    <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                                                        {/* SKU prominent */}
                                                        <div className="flex items-baseline gap-0.5 flex-wrap">
                                                            <span className="text-sm font-black text-slate-900 tracking-tight leading-tight">
                                                                {row.sku}
                                                            </span>
                                                            <span className={`text-sm font-black leading-tight ${finishColor}`}>
                                                                {finish.code}
                                                            </span>
                                                        </div>

                                                        {/* Size */}
                                                        {row.size_info && (
                                                            <span className="text-[9px] font-bold text-slate-500 flex items-center gap-0.5">
                                                                <Hash size={8} />
                                                                {row.size_info}
                                                            </span>
                                                        )}

                                                        {/* Quantity */}
                                                        <div className="flex items-center justify-between mt-auto">
                                                            <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Ποσ.</span>
                                                            <span className="bg-pink-100 text-pink-800 px-1.5 py-0.5 rounded text-xs font-black border border-pink-200 leading-tight">
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
                            <div className="mt-2 border-b-2 border-dashed border-slate-200"></div>
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

            <footer className="mt-5 pt-3 border-t border-slate-200 text-center">
                <p className="text-xs text-slate-400 uppercase tracking-widest">
                    Ilios Kosmima ERP • Φύλλο Συναρμολόγησης
                </p>
            </footer>
        </div>
    );
}
