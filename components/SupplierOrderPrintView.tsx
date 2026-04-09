
import React, { useMemo } from 'react';
import { SupplierOrder, Product, Gender } from '../types';
import { APP_LOGO } from '../constants';
import { ImageIcon } from 'lucide-react';
import { getVariantComponents } from '../utils/pricingEngine';
import { buildSkuKey, sortBySkuKey } from '../utils/skuSort';

interface Props {
    order: SupplierOrder;
    products: Product[];
}

export default function SupplierOrderPrintView({ order, products }: Props) {
    const sortedItems = useMemo(
        () => sortBySkuKey(order.items, (item) =>
            item.item_type === 'Product'
                ? buildSkuKey(item.item_id, item.item_name.slice(item.item_id.length))
                : item.item_name
        ),
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

            {/* ITEMS — two-column (CSS columns, fills left first then right) */}
            <main className="flex-1">
                {/* Duplicated header for both columns */}
                <div className="flex border-b-2 border-slate-800 pb-0.5 mb-1 text-[9px] font-black text-slate-600 uppercase tracking-wider">
                    <div className="flex-1 flex items-center pr-3">
                        <div className="w-5 text-center text-slate-400">#</div>
                        <div className="w-7 text-center">Εικ.</div>
                        <div className="flex-1 px-1">Κωδ. Προμηθ. / Περιγραφή</div>
                        <div className="w-8 text-center">Ποσ.</div>
                    </div>
                    <div className="flex-1 flex items-center pl-3 border-l border-slate-300">
                        <div className="w-5 text-center text-slate-400">#</div>
                        <div className="w-7 text-center">Εικ.</div>
                        <div className="flex-1 px-1">Κωδ. Προμηθ. / Περιγραφή</div>
                        <div className="w-8 text-center">Ποσ.</div>
                    </div>
                </div>

                {/* Items — CSS column-count fills left column first, then right */}
                <div
                    className="text-[11px] leading-snug"
                    style={{ columnCount: 2, columnGap: '1.5rem', columnRuleWidth: '1px', columnRuleStyle: 'dashed', columnRuleColor: '#e2e8f0' }}
                >
                    {itemDisplayData.map(({ item, supplierSku, mainDescription, detailLine, imageUrl }, idx) => (
                        <div key={idx} className="flex items-center py-1.5 border-b border-slate-100 break-inside-avoid">
                            {/* Index */}
                            <div className="w-5 text-center text-slate-400 text-[10px] tabular-nums flex-shrink-0">{idx + 1}</div>

                            {/* Image */}
                            <div className="w-7 text-center flex-shrink-0">
                                <div className="w-6 h-6 bg-slate-50 rounded overflow-hidden border border-slate-200 mx-auto flex items-center justify-center">
                                    {imageUrl ? (
                                        <img src={imageUrl} className="w-full h-full object-cover" alt="prod" />
                                    ) : (
                                        <ImageIcon size={10} className="text-slate-300" />
                                    )}
                                </div>
                            </div>

                            {/* Info */}
                            <div className="flex-1 px-1 min-w-0">
                                <div className="flex items-baseline gap-1">
                                    <span className="font-mono font-black text-slate-900">{supplierSku}</span>
                                    {supplierSku !== item.item_name && (
                                        <span className="text-[8px] text-slate-400 truncate">({item.item_name})</span>
                                    )}
                                </div>
                                <div className="text-[9px] text-slate-600 font-medium leading-tight truncate">
                                    {mainDescription}
                                    {detailLine ? <span className="text-slate-400"> — {detailLine}</span> : null}
                                </div>
                                <div className="flex flex-wrap gap-1 mt-0.5">
                                    {item.size_info && (
                                        <span className="bg-slate-800 text-white px-1 py-px rounded text-[8px] font-bold">Νο {item.size_info}</span>
                                    )}
                                    {item.customer_reference && (
                                        <span className="text-[8px] text-slate-600 font-bold">Πελ: {item.customer_reference}</span>
                                    )}
                                </div>
                                {item.notes && (
                                    <div className="text-[8px] text-yellow-700 italic leading-tight">↳ {item.notes}</div>
                                )}
                            </div>

                            {/* Quantity */}
                            <div className="w-8 text-center font-black text-slate-900 text-[13px] flex-shrink-0">{item.quantity}</div>
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
