import React, { useMemo } from 'react';
import { Order, OrderShipment, OrderShipmentItem, Product, Customer } from '../types';
import { APP_LOGO } from '../constants';
import { ImageIcon, Phone, MapPin, StickyNote, Calendar, Hash, Truck } from 'lucide-react';
import { formatOrderId } from '../utils/orderUtils';
import { buildSkuKey, sortBySkuKey } from '../utils/skuSort';
import { getProductOptionColorLabel } from '../utils/xrOptions';

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

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('el-GR', {
            day: '2-digit', month: '2-digit', year: 'numeric'
        });
    };

    const vatRate = order.vat_rate !== undefined ? order.vat_rate : 0.24;
    const subtotal = shipmentItems.reduce((acc, item) => acc + (item.price_at_order * item.quantity), 0);
    const discountPercent = order.discount_percent || 0;
    const discountAmount = subtotal * (discountPercent / 100);
    const netAmount = subtotal - discountAmount;
    const vatAmount = netAmount * vatRate;
    const grandTotal = netAmount + vatAmount;

    const company = {
        name: "ILIOS KOSMIMA",
        address: "Αβέρωφ 73, Κορυδαλλός, 18120",
        phone: "2104905405",
        email: "ilioskosmima@gmail.com"
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
                    <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight leading-none mb-0.5">Δελτίο Αποστολής</h1>
                    <div className="flex items-center justify-end gap-3 text-[10px] text-slate-700 font-medium">
                        <span className="flex items-center gap-1"><Truck size={10}/> Αποστολή #{shipment.shipment_number}</span>
                        <span className="text-slate-300">|</span>
                        <span className="flex items-center gap-1"><Hash size={10}/> {formatOrderId(order.id)}</span>
                        <span className="text-slate-300">|</span>
                        <span className="flex items-center gap-1"><Calendar size={10}/> {formatDate(shipment.shipped_at)}</span>
                    </div>
                </div>
            </div>

            {/* INFO BAR */}
            <div className="flex gap-4 mb-3 shrink-0 bg-slate-50 rounded-lg border border-slate-200 p-2">
                <div className="flex-1 flex flex-col justify-center">
                    <div className="flex items-baseline gap-2 mb-0.5">
                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Πελάτης</span>
                        <span className="font-black text-slate-900 text-sm leading-none">{customer?.full_name || order.customer_name}</span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-slate-700">
                        {(customer?.phone || order.customer_phone) && (
                            <span className="flex items-center gap-1"><Phone size={10} className="text-slate-400"/> {customer?.phone || order.customer_phone}</span>
                        )}
                        {customer?.address && (
                            <span className="flex items-center gap-1"><MapPin size={10} className="text-slate-400"/> {customer.address}</span>
                        )}
                        {customer?.vat_number && (
                            <span className="font-mono text-slate-600">ΑΦΜ: {customer.vat_number}</span>
                        )}
                    </div>
                </div>

                <div className="w-px bg-slate-200 my-0.5"></div>

                <div className="flex flex-col justify-center items-end px-2 min-w-[120px]">
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Αξία Αποστολής</span>
                    <span className="font-black text-xl text-slate-900 leading-none">{grandTotal.toFixed(2).replace('.', ',')}&#8364;</span>
                </div>
            </div>

            {/* Shipment meta */}
            <div className="flex gap-4 mb-3 text-[10px] text-slate-600 font-medium bg-amber-50 rounded-lg border border-amber-100 px-3 py-2">
                <span>Απεστάλη από: <span className="font-bold text-slate-800">{shipment.shipped_by}</span></span>
                {shipment.notes && (
                    <>
                        <span className="text-slate-300">|</span>
                        <span className="flex items-center gap-1"><StickyNote size={10}/> {shipment.notes}</span>
                    </>
                )}
            </div>

            {/* DUAL COLUMN ITEMS GRID */}
            <main className="flex-1 min-h-0 relative">
                <div className="flex border-b-2 border-slate-800 pb-1 mb-1 text-[10px] font-black text-slate-700 uppercase tracking-wider">
                    <div className="flex-1 flex items-center pr-3">
                        <div className="w-6 text-center text-slate-400">#</div>
                        <div className="w-8 text-center">Eik.</div>
                        <div className="flex-1 px-1">Περιγραφή</div>
                        <div className="w-8 text-center">Ποσ.</div>
                        <div className="w-12 text-right">Τιμή</div>
                        <div className="w-14 text-right">Σύνολο</div>
                    </div>
                    <div className="flex-1 flex items-center pl-3 border-l border-slate-300">
                        <div className="w-6 text-center text-slate-400">#</div>
                        <div className="w-8 text-center">Eik.</div>
                        <div className="flex-1 px-1">Περιγραφή</div>
                        <div className="w-8 text-center">Ποσ.</div>
                        <div className="w-12 text-right">Τιμή</div>
                        <div className="w-14 text-right">Σύνολο</div>
                    </div>
                </div>

                <div className="grid grid-cols-2 text-[12px] leading-snug auto-rows-min">
                    {sortedShipmentItems.map((item, index) => {
                        const product = products.find(p => p.sku === item.sku);
                        const variant = product?.variants?.find(v => v.suffix === item.variant_suffix);
                        const fullSku = item.sku + (item.variant_suffix || '');
                        const imageUrl = product?.image_url;
                        const description = variant?.description || product?.category || 'Προϊόν';

                        return (
                            <div
                                key={index}
                                className={`
                                    flex items-center py-1.5 border-b border-slate-100 break-inside-avoid
                                    ${index % 2 === 0 ? 'pr-3 border-r border-dashed border-slate-200' : 'pl-3'}
                                `}
                            >
                                <div className="w-6 text-center text-slate-400 text-[11px] tabular-nums">{index + 1}</div>
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
                                            {item.size_info && <span className="text-[9px] bg-slate-100 px-1 rounded text-slate-600 border border-slate-200 font-bold whitespace-nowrap">{item.size_info}</span>}
                                            {item.cord_color && <span className="text-[9px] bg-amber-50 px-1 rounded text-amber-700 border border-amber-100 font-bold whitespace-nowrap">Κορδόνι: {getProductOptionColorLabel(item.cord_color)}</span>}
                                            {item.enamel_color && <span className="text-[9px] bg-rose-50 px-1 rounded text-rose-700 border border-rose-100 font-bold whitespace-nowrap">Σμάλτο: {getProductOptionColorLabel(item.enamel_color)}</span>}
                                        </div>
                                        <span className="text-[10px] text-slate-600 truncate max-w-[200px] font-medium">{description}</span>
                                    </div>
                                </div>
                                <div className="w-8 text-center font-bold text-slate-800 text-[12px]">{item.quantity}</div>
                                <div className="w-12 text-right text-slate-700 tabular-nums font-semibold text-[12px]">{item.price_at_order.toFixed(2).replace('.', ',')}</div>
                                <div className="w-14 text-right font-black text-slate-900 tabular-nums text-[12px]">{(item.price_at_order * item.quantity).toFixed(2).replace('.', ',')}</div>
                            </div>
                        );
                    })}
                </div>
            </main>

            {/* FOOTER */}
            <footer className="mt-2 pt-2 border-t-2 border-slate-900 flex justify-between items-start shrink-0">
                <div className="text-[9px] text-slate-600 max-w-xs leading-snug">
                    <p className="font-bold uppercase text-slate-500 mb-0.5">Σημειώσεις</p>
                    <p className="italic bg-slate-50 p-1.5 rounded border border-slate-100">{shipment.notes || order.notes || "Δεν υπάρχουν σημειώσεις."}</p>
                </div>

                <div className="w-48 text-[11px]">
                    <div className="flex justify-between items-center text-slate-600 mb-0.5">
                        <span>Καθαρή Αξία:</span>
                        <span className="tabular-nums font-bold">{subtotal.toFixed(2).replace('.', ',')}&#8364;</span>
                    </div>
                    {discountAmount > 0 && (
                        <div className="flex justify-between items-center text-rose-600 mb-0.5">
                            <span>Έκπτωση ({discountPercent}%):</span>
                            <span className="tabular-nums font-bold">-{discountAmount.toFixed(2).replace('.', ',')}&#8364;</span>
                        </div>
                    )}
                    <div className="flex justify-between items-center text-slate-600 mb-1 pb-1 border-b border-slate-200">
                        <span>Φ.Π.Α. ({(vatRate * 100).toFixed(0)}%):</span>
                        <span className="tabular-nums font-bold">{vatAmount.toFixed(2).replace('.', ',')}&#8364;</span>
                    </div>

                    <div className="flex justify-between items-center text-slate-900 font-black text-sm">
                        <span className="uppercase">Γενικό Σύνολο:</span>
                        <span className="tabular-nums text-base">{grandTotal.toFixed(2).replace('.', ',')}&#8364;</span>
                    </div>
                </div>
            </footer>
            <div className="mt-4 text-center text-[8px] text-slate-400 uppercase tracking-widest font-bold">
                Δελτίο Μερικής Αποστολής #{shipment.shipment_number} &bull; Ilios Kosmima ERP &bull; {new Date().toLocaleTimeString()}
            </div>
        </div>
    );
}
