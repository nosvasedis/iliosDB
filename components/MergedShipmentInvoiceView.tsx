import React, { useMemo } from 'react';
import { Order, OrderShipment, OrderShipmentItem, Product } from '../types';
import { APP_LOGO } from '../constants';
import { ImageIcon, Phone, StickyNote, Calendar, Hash, Truck, Layers } from 'lucide-react';
import { formatOrderId } from '../utils/orderUtils';
import { buildSkuKey, sortBySkuKey } from '../utils/skuSort';
import { getProductOptionColorLabel } from '../utils/xrOptions';

export interface ShipmentPayload {
    order: Order;
    shipment: OrderShipment;
    shipmentItems: OrderShipmentItem[];
}

interface Props {
    payloads: ShipmentPayload[];
    products: Product[];
}

type MergedItem = Omit<OrderShipmentItem, 'id' | 'shipment_id'> & { quantity: number };

const company = {
    name: 'ILIOS KOSMIMA',
    address: 'Αβέρωφ 73, Κορυδαλλός, 18120',
    phone: '2104905405',
    email: 'ilioskosmima@gmail.com',
};

export default function MergedShipmentInvoiceView({ payloads, products }: Props) {
    const order = payloads[0].order;

    const sortedPayloads = useMemo(
        () => [...payloads].sort((a, b) => a.shipment.shipment_number - b.shipment.shipment_number),
        [payloads]
    );

    // Merge items by identity key; keep separate entries when prices differ
    const mergedItems = useMemo<MergedItem[]>(() => {
        const map = new Map<string, MergedItem>();
        for (const { shipmentItems } of sortedPayloads) {
            for (const item of shipmentItems) {
                const key = [
                    item.sku,
                    item.variant_suffix ?? '',
                    item.size_info ?? '',
                    item.cord_color ?? '',
                    item.enamel_color ?? '',
                    item.line_id ?? '',
                    String(item.price_at_order),
                ].join('::');

                const existing = map.get(key);
                if (existing) {
                    existing.quantity += item.quantity;
                } else {
                    map.set(key, { ...item });
                }
            }
        }
        return sortBySkuKey([...map.values()], (item) =>
            buildSkuKey(item.sku, item.variant_suffix)
        );
    }, [sortedPayloads]);

    const shipmentNumbers = sortedPayloads.map((p) => `#${p.shipment.shipment_number}`).join(', ');

    const oldestDate = sortedPayloads[0].shipment.shipped_at;
    const newestDate = sortedPayloads[sortedPayloads.length - 1].shipment.shipped_at;

    const shippedBy = [
        ...new Set(sortedPayloads.map((p) => p.shipment.shipped_by).filter(Boolean)),
    ].join(', ');

    const shipmentNotes = [
        ...new Set(sortedPayloads.map((p) => p.shipment.notes).filter(Boolean)),
    ].join(' | ');

    const vatRate = order.vat_rate !== undefined ? order.vat_rate : 0.24;
    const subtotal = mergedItems.reduce((acc, item) => acc + item.price_at_order * item.quantity, 0);
    const totalPieces = mergedItems.reduce((acc, item) => acc + item.quantity, 0);
    const discountPercent = order.discount_percent ?? 0;
    const discountAmount = subtotal * (discountPercent / 100);
    const netAmount = subtotal - discountAmount;
    const vatAmount = netAmount * vatRate;
    const grandTotal = netAmount + vatAmount;

    const isItemOverridden = (item: MergedItem) => {
        const match = order.items.find(
            (o) =>
                o.sku === item.sku &&
                (o.variant_suffix ?? null) === (item.variant_suffix ?? null) &&
                (o.size_info ?? null) === (item.size_info ?? null) &&
                (o.cord_color ?? null) === (item.cord_color ?? null) &&
                (o.enamel_color ?? null) === (item.enamel_color ?? null) &&
                (o.line_id ?? null) === (item.line_id ?? null)
        );
        return !!match?.price_override;
    };

    const hasOverriddenPrices = mergedItems.some(isItemOverridden);

    const formatDate = (d: string) =>
        new Date(d).toLocaleDateString('el-GR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
        });

    const dateLabel =
        formatDate(oldestDate) === formatDate(newestDate)
            ? formatDate(oldestDate)
            : `${formatDate(oldestDate)} – ${formatDate(newestDate)}`;

    const renderItem = (item: MergedItem, idx: number) => {
        const product = products.find((p) => p.sku === item.sku);
        const variant = product?.variants?.find((v) => v.suffix === item.variant_suffix);
        const fullSku = item.sku + (item.variant_suffix ?? '');
        const description = variant?.description ?? product?.category ?? 'Προϊόν';
        const imageUrl = product?.image_url;
        const overridden = isItemOverridden(item);
        return (
            <div key={idx} className="flex items-center py-1.5 border-b border-slate-100 break-inside-avoid">
                <div className="w-6 text-center text-slate-400 text-[11px] tabular-nums">{idx + 1}</div>
                <div className="w-8 text-center">
                    <div className="w-6 h-6 bg-slate-50 rounded overflow-hidden border border-slate-200 mx-auto flex items-center justify-center">
                        {imageUrl ? (
                            <img src={imageUrl} alt={item.sku} className="w-full h-full object-cover" />
                        ) : (
                            <ImageIcon size={10} className="text-slate-300" />
                        )}
                    </div>
                </div>
                <div className="flex-1 px-1 min-w-0">
                    <div className="flex flex-col">
                        <div className="flex items-baseline gap-1">
                            <span className="font-bold text-slate-900">{fullSku}</span>
                            {item.size_info && (
                                <span className="text-[9px] bg-slate-100 px-1 rounded text-slate-600 border border-slate-200 font-bold whitespace-nowrap">
                                    {item.size_info}
                                </span>
                            )}
                            {item.cord_color && (
                                <span className="text-[9px] bg-amber-50 px-1 rounded text-amber-700 border border-amber-100 font-bold whitespace-nowrap">
                                    Κορδόνι: {getProductOptionColorLabel(item.cord_color)}
                                </span>
                            )}
                            {item.enamel_color && (
                                <span className="text-[9px] bg-rose-50 px-1 rounded text-rose-700 border border-rose-100 font-bold whitespace-nowrap">
                                    Σμάλτο: {getProductOptionColorLabel(item.enamel_color)}
                                </span>
                            )}
                        </div>
                        <span className="text-[10px] text-slate-600 truncate max-w-[200px] font-medium">
                            {description}
                        </span>
                    </div>
                </div>
                <div className="w-8 text-center font-bold text-slate-800 text-[12px]">{item.quantity}</div>
                <div className="w-12 text-right text-slate-700 tabular-nums font-semibold text-[12px]">
                    {item.price_at_order.toFixed(2).replace('.', ',')}
                    {overridden ? '*' : ''}
                </div>
                <div className="w-14 text-right font-black text-slate-900 tabular-nums text-[12px]">
                    {(item.price_at_order * item.quantity).toFixed(2).replace('.', ',')}
                </div>
            </div>
        );
    };

    return (
        <div className="bg-white text-black font-sans w-[210mm] min-h-[297mm] p-6 mx-auto shadow-lg print:shadow-none print:p-6 page-break-after-always flex flex-col relative">
            {/* HEADER */}
            <div className="flex justify-between items-end border-b-2 border-slate-900 pb-2 mb-3 shrink-0">
                <div className="flex items-center gap-3">
                    <img src={APP_LOGO} alt="ILIOS" className="h-9 w-auto object-contain" />
                    <div className="text-[8px] text-slate-600 leading-tight border-l border-slate-300 pl-2">
                        <p className="font-bold text-slate-900 uppercase tracking-wide">{company.name}</p>
                        <p>{company.address}</p>
                        <p>{company.email} &bull; {company.phone}</p>
                    </div>
                </div>
                <div className="text-right">
                    <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight leading-none mb-0.5">
                        Συγκεντρωτικό Δελτίο
                    </h1>
                    <div className="flex items-center justify-end gap-3 text-[10px] text-slate-700 font-medium">
                        <span className="flex items-center gap-1">
                            <Layers size={10} /> Αποστολές {shipmentNumbers}
                        </span>
                        <span className="text-slate-300">|</span>
                        <span className="flex items-center gap-1">
                            <Hash size={10} /> {formatOrderId(order.id)}
                        </span>
                        <span className="text-slate-300">|</span>
                        <span className="flex items-center gap-1">
                            <Calendar size={10} /> {dateLabel}
                        </span>
                    </div>
                </div>
            </div>

            {/* INFO BAR */}
            <div className="flex gap-4 mb-3 shrink-0 bg-slate-50 rounded-lg border border-slate-200 p-2">
                <div className="flex-1 flex flex-col justify-center">
                    <div className="flex items-baseline gap-2 mb-0.5">
                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Πελάτης</span>
                        <span className="font-black text-slate-900 text-sm leading-none">{order.customer_name}</span>
                    </div>
                    {order.customer_phone && (
                        <div className="flex items-center gap-3 text-[10px] text-slate-700">
                            <span className="flex items-center gap-1">
                                <Phone size={10} className="text-slate-400" /> {order.customer_phone}
                            </span>
                        </div>
                    )}
                </div>
                <div className="w-px bg-slate-200 my-0.5" />
                <div className="flex flex-col justify-center items-end px-2 min-w-[120px]">
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Αξία Συνολική</span>
                    <span className="font-black text-xl text-slate-900 leading-none">
                        {grandTotal.toFixed(2).replace('.', ',')}&#8364;
                    </span>
                </div>
            </div>

            {/* SHIPMENT META */}
            <div className="flex flex-wrap gap-3 mb-3 text-[10px] text-slate-600 font-medium bg-amber-50 rounded-lg border border-amber-100 px-3 py-2">
                <span className="flex items-center gap-1">
                    <Truck size={10} /> {sortedPayloads.length} αποστολές ({shipmentNumbers})
                </span>
                {shippedBy && (
                    <>
                        <span className="text-amber-300">|</span>
                        <span>
                            Απεστάλη από: <span className="font-bold text-slate-800">{shippedBy}</span>
                        </span>
                    </>
                )}
                {shipmentNotes && (
                    <>
                        <span className="text-amber-300">|</span>
                        <span className="flex items-center gap-1">
                            <StickyNote size={10} /> {shipmentNotes}
                        </span>
                    </>
                )}
            </div>

            {/* ITEMS GRID */}
            <main className="flex-1 min-h-0 relative">
                <div className="flex border-b-2 border-slate-800 pb-1 mb-1 text-[10px] font-black text-slate-700 uppercase tracking-wider">
                    <div className="flex-1 flex items-center pr-3">
                        <div className="w-6 text-center text-slate-400">#</div>
                        <div className="w-8 text-center">Εικ.</div>
                        <div className="flex-1 px-1">Περιγραφή</div>
                        <div className="w-8 text-center">Ποσ.</div>
                        <div className="w-12 text-right">Τιμή</div>
                        <div className="w-14 text-right">Σύνολο</div>
                    </div>
                    <div className="flex-1 flex items-center pl-3 border-l border-slate-300">
                        <div className="w-6 text-center text-slate-400">#</div>
                        <div className="w-8 text-center">Εικ.</div>
                        <div className="flex-1 px-1">Περιγραφή</div>
                        <div className="w-8 text-center">Ποσ.</div>
                        <div className="w-12 text-right">Τιμή</div>
                        <div className="w-14 text-right">Σύνολο</div>
                    </div>
                </div>
                <div
                    className="text-[12px] leading-snug"
                    style={{
                        columnCount: 2,
                        columnGap: '1.5rem',
                        columnRuleWidth: '1px',
                        columnRuleStyle: 'dashed',
                        columnRuleColor: '#e2e8f0',
                    }}
                >
                    {mergedItems.map((item, idx) => renderItem(item, idx))}
                </div>
            </main>

            {/* FOOTER */}
            <footer className="mt-2 pt-2 border-t-2 border-slate-900 flex justify-between items-start shrink-0">
                <div className="text-[9px] text-slate-600 max-w-xs leading-snug">
                    <p className="font-bold uppercase text-slate-500 mb-0.5">Σημειώσεις</p>
                    <p className="italic bg-slate-50 p-1.5 rounded border border-slate-100">
                        {shipmentNotes || order.notes || 'Δεν υπάρχουν σημειώσεις.'}
                    </p>
                </div>
                <div className="w-48 text-[11px]">
                    <div className="flex justify-between items-center text-slate-700 mb-1 pb-1 border-b border-slate-200">
                        <span>Σύνολο Τεμαχίων:</span>
                        <span className="tabular-nums font-bold">{totalPieces}</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-600 mb-0.5">
                        <span>Καθαρή Αξία:</span>
                        <span className="tabular-nums font-bold">
                            {subtotal.toFixed(2).replace('.', ',')}&#8364;
                        </span>
                    </div>
                    {discountAmount > 0 && (
                        <div className="flex justify-between items-center text-rose-600 mb-0.5">
                            <span>Έκπτωση ({discountPercent}%):</span>
                            <span className="tabular-nums font-bold">
                                -{discountAmount.toFixed(2).replace('.', ',')}&#8364;
                            </span>
                        </div>
                    )}
                    <div className="flex justify-between items-center text-slate-600 mb-1 pb-1 border-b border-slate-200">
                        <span>Φ.Π.Α. ({(vatRate * 100).toFixed(0)}%):</span>
                        <span className="tabular-nums font-bold">
                            {vatAmount.toFixed(2).replace('.', ',')}&#8364;
                        </span>
                    </div>
                    <div className="flex justify-between items-center text-slate-900 font-black text-sm">
                        <span className="uppercase">Γενικό Σύνολο:</span>
                        <span className="tabular-nums text-base">
                            {grandTotal.toFixed(2).replace('.', ',')}&#8364;
                        </span>
                    </div>
                </div>
            </footer>

            <div className="mt-4 text-center text-[8px] text-slate-400 uppercase tracking-widest font-bold">
                Συγκεντρωτικό Δελτίο Αποστολών {shipmentNumbers} &bull; Ilios Kosmima ERP &bull;{' '}
                {new Date().toLocaleTimeString()}
            </div>
            {hasOverriddenPrices && (
                <div className="mt-1 text-center text-[8px] text-amber-700 font-bold">
                    * Τιμή ανά τεμάχιο με εξαίρεση για τη συγκεκριμένη παραγγελία.
                </div>
            )}
        </div>
    );
}
