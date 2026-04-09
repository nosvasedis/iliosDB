
import React, { useMemo } from 'react';
import { SupplierOrder, Product, Gender } from '../types';
import { APP_LOGO } from '../constants';
import { ImageIcon } from 'lucide-react';
import { getVariantComponents } from '../utils/pricingEngine';
import { compareSkuValues } from '../utils/skuSort';

interface Props {
    order: SupplierOrder;
    products: Product[];
}

export default function SupplierOrderPrintView({ order, products }: Props) {
    const sortedItems = useMemo(
        () => [...order.items].sort((a, b) => {
            const keyA = a.item_type === 'Product' ? a.item_id : a.item_name;
            const keyB = b.item_type === 'Product' ? b.item_id : b.item_name;
            return compareSkuValues(keyA, keyB);
        }),
        [order.items]
    );

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('el-GR', {
            day: '2-digit', month: '2-digit', year: 'numeric'
        });
    };

    const company = {
        name: "ILIOS KOSMIMA",
        address: "Αβέρωφ 73, Κορυδαλλός, 18120",
        phone: "2104905405",
        email: "ilioskosmima@gmail.com"
    };

    // Pre-compute display data for all items
    const itemDisplayData = useMemo(() => sortedItems.map((item) => {
        let product: Product | undefined;
        if (item.item_type === 'Product') {
            product = products.find(p => p.sku === item.item_id);
        }

        let supplierSku = '-';
        let mainDescription = item.item_name;
        let detailLine = '';
        let imageUrl: string | null = null;

        if (product) {
            supplierSku = product.supplier_sku || product.sku;
            imageUrl = product.image_url;
            let suffixStr = '';
            if (item.item_name.startsWith(product.sku)) {
                suffixStr = item.item_name.slice(product.sku.length);
            }
            const { finish, stone } = getVariantComponents(suffixStr, product.gender || Gender.Unisex);
            let finishDesc = 'Λουστρέ';
            if (finish.name) finishDesc = finish.name;
            let stoneDesc = '';
            if (stone.name) stoneDesc = ` • ${stone.name}`;
            mainDescription = product.category;
            detailLine = `${finishDesc}${stoneDesc}`;
        } else if (item.item_type === 'Material') {
            mainDescription = item.item_name;
            detailLine = 'Υλικό';
        }

        return { item, supplierSku, mainDescription, detailLine, imageUrl };
    }), [sortedItems, products]);

    return (
        <div className="bg-white text-black font-sans w-[210mm] min-h-[297mm] p-6 mx-auto shadow-lg print:shadow-none print:p-6 page-break-after-always relative flex flex-col">
            <style>{`
                @page { size: A4; margin: 0; }
                .break-avoid { break-inside: avoid; }
                .item-card { break-inside: avoid; }
            `}</style>

            {/* COMPACT HEADER */}
            <div className="flex justify-between items-center border-b-2 border-slate-900 pb-2 mb-3">
                <div className="flex items-center gap-3">
                    <img src={APP_LOGO} alt="ILIOS" className="h-8 object-contain" />
                    <div className="text-[8px] text-slate-500 leading-tight">
                        <p className="font-bold text-slate-800 uppercase text-[9px]">{company.name}</p>
                        <p>{company.address}</p>
                        <p>{company.phone} • {company.email}</p>
                    </div>
                </div>
                <div className="text-right">
                    <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight leading-none">ΕΝΤΟΛΗ ΑΓΟΡΑΣ</h1>
                    <div className="flex items-center justify-end gap-3 mt-1">
                        <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Αρ. <span className="font-mono font-black text-slate-900">#{order.id.slice(0, 8).toUpperCase()}</span></span>
                        <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Ημ/νία <span className="font-semibold text-slate-800 normal-case">{formatDate(order.created_at)}</span></span>
                    </div>
                </div>
            </div>

            {/* SUPPLIER INFO — compact single line */}
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 mb-3">
                <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Προμηθευτής:</span>
                <span className="font-black text-slate-900 text-sm">{order.supplier_name}</span>
            </div>

            {/* ITEMS — two-column grid */}
            <main className="flex-1">
                {/* Column headers */}
                <div className="grid grid-cols-2 gap-x-3 mb-1">
                    {[0, 1].map(col => (
                        <div key={col} className="grid gap-x-1 border-b-2 border-slate-800 pb-0.5" style={{ gridTemplateColumns: '28px 1fr auto' }}>
                            <span className="text-[8px] font-black text-slate-500 uppercase tracking-wider text-center">Εικ.</span>
                            <span className="text-[8px] font-black text-slate-500 uppercase tracking-wider">Κωδ. / Περιγραφή</span>
                            <span className="text-[8px] font-black text-slate-500 uppercase tracking-wider text-center">Ποσ.</span>
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-2 gap-x-3">
                    {itemDisplayData.map(({ item, supplierSku, mainDescription, detailLine, imageUrl }, idx) => (
                        <div key={idx} className="item-card flex items-start gap-1.5 border-b border-slate-100 py-1.5" style={{ gridColumn: undefined }}>
                            {/* Image */}
                            <div className="w-7 h-7 flex-shrink-0 bg-slate-50 border border-slate-200 rounded overflow-hidden flex items-center justify-center mt-0.5">
                                {imageUrl ? (
                                    <img src={imageUrl} className="w-full h-full object-cover" alt="prod" />
                                ) : (
                                    <ImageIcon size={12} className="text-slate-300" />
                                )}
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-baseline gap-1">
                                    <span className="font-mono font-black text-[11px] text-slate-900 leading-tight">{supplierSku}</span>
                                    <span className="text-[7px] text-slate-400 truncate">({item.item_name})</span>
                                </div>
                                <div className="text-[9px] text-slate-600 font-semibold leading-tight">
                                    {mainDescription}
                                    {detailLine ? <span className="text-slate-400 font-normal"> — {detailLine}</span> : null}
                                </div>
                                {item.size_info && (
                                    <span className="bg-slate-900 text-white px-1 py-px rounded text-[7px] font-bold">Νο {item.size_info}</span>
                                )}
                                {item.customer_reference && (
                                    <div className="text-[8px] text-slate-600 font-bold leading-tight">Πελ: {item.customer_reference}</div>
                                )}
                                {item.notes && (
                                    <div className="text-[8px] text-yellow-700 italic leading-tight bg-yellow-50 px-1 rounded mt-0.5">↳ {item.notes}</div>
                                )}
                            </div>

                            {/* Quantity */}
                            <div className="flex-shrink-0 bg-slate-900 text-white px-1.5 py-0.5 rounded text-sm font-black leading-tight min-w-[22px] text-center mt-0.5">
                                {item.quantity}
                            </div>
                        </div>
                    ))}
                </div>
            </main>

            {/* FOOTER */}
            <div className="mt-4 border-t-2 border-slate-900 pt-2">
                <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider mb-1">Γενικές Σημειώσεις</p>
                <div className="bg-slate-50 p-2 rounded-lg border border-slate-100 text-xs italic text-slate-600 min-h-[36px]">
                    {order.notes || "Δεν υπάρχουν επιπλέον σημειώσεις."}
                </div>
            </div>

            <div className="mt-3 text-center text-[7px] text-slate-300 uppercase tracking-widest">
                Ilios Kosmima ERP • Generated Purchase Order
            </div>
        </div>
    );
}
