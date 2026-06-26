import React, { useMemo } from 'react';
import { Order, OrderShipment, OrderShipmentItem, Product, Customer } from '../types';
import { APP_LOGO } from '../constants';
import { ImageIcon, Phone, MapPin, Calendar, Hash, Truck } from 'lucide-react';
import { formatOrderId } from '../utils/orderUtils';
import { buildSkuKey, sortBySkuKey } from '../utils/skuSort';
import { getProductOptionColorLabel } from '../utils/xrOptions';
import CustomerPrintItemsGrid from './CustomerPrintItemsGrid';
import {
    CUSTOMER_PRINT_CSS,
    CUSTOMER_PRINT_MAIN_CLASS,
    CUSTOMER_PRINT_PAGE_CLASS,
    CustomerPrintSummaryFooter,
} from './customerPrintShared';

interface Props {
    order: Order;
    shipment: OrderShipment;
    shipmentItems: OrderShipmentItem[];
    products: Product[];
    customer?: Customer;
}

export default function ShipmentInvoiceView({ order, shipment, shipmentItems, products, customer }: Props) {
    const sortedShipmentItems = useMemo(
        () => sortBySkuKey(shipmentItems, (item) => buildSkuKey(item.sku, item.variant_suffix)),
        [shipmentItems]
    );

    const isShipmentItemOverridden = (item: OrderShipmentItem) => {
        const match = order.items.find((orderItem) =>
            orderItem.sku === item.sku &&
            (orderItem.variant_suffix || null) === (item.variant_suffix || null) &&
            (orderItem.size_info || null) === (item.size_info || null) &&
            (orderItem.cord_color || null) === (item.cord_color || null) &&
            (orderItem.enamel_color || null) === (item.enamel_color || null) &&
            (orderItem.line_id || null) === (item.line_id || null)
        );
        return !!match?.price_override;
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('el-GR', {
            day: '2-digit', month: '2-digit', year: 'numeric'
        });
    };

    const vatRate = order.vat_rate !== undefined ? order.vat_rate : 0.24;
    const subtotal = shipmentItems.reduce((acc, item) => acc + (item.price_at_order * item.quantity), 0);
    const totalPieces = shipmentItems.reduce((acc, item) => acc + item.quantity, 0);
    const discountPercent = order.discount_percent || 0;
    const discountAmount = subtotal * (discountPercent / 100);
    const netAmount = subtotal - discountAmount;
    const vatAmount = netAmount * vatRate;
    const grandTotal = netAmount + vatAmount;
    const hasOverriddenPrices = sortedShipmentItems.some((item) => isShipmentItemOverridden(item));

    const company = {
        name: "ILIOS KOSMIMA",
        address: "Αβέρωφ 73, Κορυδαλλός, 18120",
        phone: "2104905405",
        email: "ilioskosmima@gmail.com"
    };

    const renderShipmentItem = (item: OrderShipmentItem, globalIndex: number) => {
        const product = products.find(p => p.sku === item.sku);
        const variant = product?.variants?.find(v => v.suffix === item.variant_suffix);
        const fullSku = item.sku + (item.variant_suffix || '');
        const imageUrl = product?.image_url;
        const description = variant?.description || product?.category || 'Προϊόν';
        const isOverridden = isShipmentItemOverridden(item);
        return (
            <div
                key={globalIndex}
                className="flex items-center min-h-[52px] py-0.5 border-b border-slate-100 break-inside-avoid"
            >
                <div className="w-6 text-center text-slate-400 text-[11px] tabular-nums">{globalIndex + 1}</div>
                <div className="w-14 text-center flex-shrink-0">
                    <div className="w-12 h-12 bg-slate-50 rounded overflow-hidden border border-slate-200 mx-auto flex items-center justify-center">
                        {imageUrl ? (
                            <img src={imageUrl} alt={item.sku} className="w-full h-full object-cover" />
                        ) : (
                            <ImageIcon size={16} className="text-slate-300" />
                        )}
                    </div>
                </div>
                <div className="flex-1 px-1 min-w-0">
                    <div className="flex flex-col">
                        <div className="flex items-baseline gap-1 min-w-0">
                            <span className="font-bold text-slate-900 truncate">{fullSku}</span>
                            {item.size_info && <span className="text-[9px] bg-slate-100 px-1 rounded text-slate-600 border border-slate-200 font-bold whitespace-nowrap">{item.size_info}</span>}
                            {item.cord_color && <span className="text-[9px] bg-amber-50 px-1 rounded text-amber-700 border border-amber-100 font-bold whitespace-nowrap">Κορδόνι: {getProductOptionColorLabel(item.cord_color)}</span>}
                            {item.enamel_color && <span className="text-[9px] bg-rose-50 px-1 rounded text-rose-700 border border-rose-100 font-bold whitespace-nowrap">Σμάλτο: {getProductOptionColorLabel(item.enamel_color)}</span>}
                        </div>
                        <span className="block text-[9px] text-slate-600 font-medium leading-[1.15] whitespace-normal break-words">{description}</span>
                    </div>
                </div>
                <div className="w-14 text-right font-black text-slate-900 tabular-nums text-[10px] whitespace-nowrap">
                    <div>{item.quantity} x {item.price_at_order.toFixed(2).replace('.', ',')}{isOverridden ? '*' : ''}</div>
                    {item.quantity !== 1 && (
                        <div className="mt-0.5 text-[9px] leading-none text-slate-400">
                            {(item.quantity * item.price_at_order).toFixed(2).replace('.', ',')}
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className={CUSTOMER_PRINT_PAGE_CLASS}>
            <style>{CUSTOMER_PRINT_CSS}</style>

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
                    <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight leading-none mb-0.5">ΜΕΡΙΚΗ ΠΡΟΣΦΟΡΑ</h1>
                    <div className="flex items-center justify-end gap-3 text-[10px] text-slate-700 font-medium">
                        <span className="flex items-center gap-1"><Truck size={10}/> Τμήμα Προσφοράς #{shipment.shipment_number}</span>
                        <span className="text-slate-300">|</span>
                        <span className="flex items-center gap-1"><Hash size={10}/> {formatOrderId(order.id)}</span>
                        <span className="text-slate-300">|</span>
                        <span className="flex items-center gap-1"><Calendar size={10}/> {formatDate(shipment.shipped_at)}</span>
                    </div>
                </div>
            </div>

            {/* INFO BAR — customer, shipment meta, value in one compact strip */}
            <div className="mb-2 flex shrink-0 gap-3 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0 leading-tight">
                        <span className="text-[8px] font-bold uppercase tracking-wider text-slate-500">Πελάτης</span>
                        <span className="text-[11px] font-black leading-none text-slate-900">
                            {customer?.full_name || order.customer_name}
                        </span>
                        {(customer?.phone || order.customer_phone) && (
                            <span className="inline-flex items-center gap-0.5 text-[9px] text-slate-600">
                                <Phone size={9} className="text-slate-400" />
                                {customer?.phone || order.customer_phone}
                            </span>
                        )}
                        {customer?.vat_number && (
                            <span className="font-mono text-[9px] text-slate-500">ΑΦΜ {customer.vat_number}</span>
                        )}
                    </div>
                    {customer?.address && (
                        <p className="mt-0.5 truncate text-[9px] leading-tight text-slate-600">
                            <MapPin size={9} className="mr-0.5 inline text-slate-400" />
                            {customer.address}
                        </p>
                    )}
                    <p className="mt-0.5 text-[9px] leading-tight text-slate-600">
                        <span className="font-bold text-slate-500">Απεστάλη από:</span>{' '}
                        <span className="font-semibold text-slate-800">{shipment.shipped_by}</span>
                    </p>
                </div>

                <div className="my-0.5 w-px shrink-0 bg-slate-200" />

                <div className="flex shrink-0 flex-col justify-center px-1 text-right">
                    <span className="text-[8px] font-bold uppercase tracking-wider text-slate-500">Αξία Αποστολής</span>
                    <span className="text-lg font-black leading-none text-slate-900 tabular-nums">
                        {grandTotal.toFixed(2).replace('.', ',')}&#8364;
                    </span>
                </div>
            </div>

            {/* CUSTOMER ITEMS GRID */}
            <main className={CUSTOMER_PRINT_MAIN_CLASS}>
                <CustomerPrintItemsGrid
                    items={sortedShipmentItems}
                    renderItem={renderShipmentItem}
                    descriptionLabel="Περιγραφή"
                    textClassName="text-[10px] leading-tight"
                    footer={
                        <CustomerPrintSummaryFooter
                            notes={shipment.notes || order.notes}
                            notesFallback="Δεν υπάρχουν σημειώσεις."
                            totalPieces={totalPieces}
                            subtotal={subtotal}
                            discountPercent={discountPercent}
                            discountAmount={discountAmount}
                            vatRate={vatRate}
                            vatAmount={vatAmount}
                            grandTotal={grandTotal}
                            trailing={
                                <>
                                    <p className="mt-1.5 text-center text-[7px] font-bold uppercase tracking-widest text-slate-400">
                                        ILIOS KOSMIMA ERP &bull; {new Date().toLocaleTimeString()}
                                    </p>
                                    {hasOverriddenPrices && (
                                        <p className="mt-0.5 text-center text-[7px] font-bold text-amber-700">
                                            * Τιμή ανά τεμάχιο με εξαίρεση για τη συγκεκριμένη παραγγελία.
                                        </p>
                                    )}
                                </>
                            }
                        />
                    }
                />
            </main>
        </div>
    );
}
