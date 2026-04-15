
import React, { useEffect, useMemo, useState } from 'react';
import { Order, Product, Customer } from '../types';
import { APP_LOGO } from '../constants';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/supabase';
import QRCode from 'qrcode';
import { ImageIcon, Phone, MapPin, StickyNote, Calendar, Hash, User } from 'lucide-react';
import { transliterateForBarcode } from '../utils/pricingEngine';
import { formatOrderId } from '../utils/orderUtils';
import { buildSkuKey, sortBySkuKey } from '../utils/skuSort';
import { getProductOptionColorLabel } from '../utils/xrOptions';
import { isSpecialCreationSku } from '../utils/specialCreationSku';

interface Props {
    order: Order;
    title?: string;
    revisionSuffix?: string;
}

const QRCodeImage: React.FC<{ sku: string }> = ({ sku }) => {
    const [qrUrl, setQrUrl] = useState('');
    
    useEffect(() => {
        if (sku) {
            const safeSku = transliterateForBarcode(sku);
            QRCode.toDataURL(safeSku, {
                margin: 0,
                width: 64,
                errorCorrectionLevel: 'M',
                color: {
                    dark: '#000000',
                    light: '#00000000'
                }
            }).then(setQrUrl).catch(e => console.error(e));
        }
    }, [sku]);

    if (!qrUrl) return null;
    return <img src={qrUrl} className="h-8 w-8 object-contain" alt="QR" />;
};


export default function OrderInvoiceView({ order, title, revisionSuffix }: Props) {
    const { data: allProducts } = useQuery<Product[]>({ queryKey: ['products'], queryFn: api.getProducts });
    const queryClient = useQueryClient();
    const allCustomers = queryClient.getQueryData<Customer[]>(['customers']);
    const customer = order.customer_id
        ? allCustomers?.find(c => c.id === order.customer_id)
        : allCustomers?.find(c => c.full_name === order.customer_name);
    const sortedItems = useMemo(
        () => sortBySkuKey(order.items, (item) => `${buildSkuKey(item.sku, item.variant_suffix)}${item.line_id ? `::${item.line_id}` : ''}`),
        [order.items]
    );


    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('el-GR', {
            day: '2-digit', month: '2-digit', year: 'numeric'
        });
    };
    
    // Dynamic VAT Calculation based on stored rate or default 24%
    const vatRate = order.vat_rate !== undefined ? order.vat_rate : 0.24;
    const subtotal = order.items.reduce((acc, item) => acc + (item.price_at_order * item.quantity), 0);
    const totalPieces = order.items.reduce((acc, item) => acc + item.quantity, 0);
    const discountPercent = order.discount_percent || 0;
    const discountAmount = subtotal * (discountPercent / 100);
    const netAmount = subtotal - discountAmount;
    const vatAmount = netAmount * vatRate;
    const grandTotal = netAmount + vatAmount;
    const hasOverriddenPrices = order.items.some(item => item.price_override);

    const company = {
        name: "ILIOS KOSMIMA",
        address: "Αβέρωφ 73, Κορυδαλλός, 18120",
        phone: "2104905405",
        email: "ilioskosmima@gmail.com"
    };

    const renderOrderItem = (item: Order['items'][number], globalIndex: number) => {
        const product = allProducts?.find(p => p.sku === item.sku);
        const variant = product?.variants?.find(v => v.suffix === item.variant_suffix);
        const fullSku = item.sku + (item.variant_suffix || '');
        const imageUrl = isSpecialCreationSku(item.sku) ? null : product?.image_url;
        const description = isSpecialCreationSku(item.sku)
            ? 'Ειδική δημιουργία (χειροκίνητη τιμή)'
            : (variant?.description || product?.category || 'Προϊόν');
        return (
            <div
                key={globalIndex}
                className="flex items-center py-1.5 border-b border-slate-100 break-inside-avoid"
            >
                <div className="w-6 text-center text-slate-400 text-[11px] tabular-nums">{globalIndex + 1}</div>
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
                            <span className={`font-bold ${isSpecialCreationSku(item.sku) ? 'text-violet-900' : 'text-slate-900'}`}>{fullSku}</span>
                            {item.size_info && <span className="text-[9px] bg-slate-100 px-1 rounded text-slate-600 border border-slate-200 font-bold whitespace-nowrap">{item.size_info}</span>}
                            {item.cord_color && <span className="text-[9px] bg-amber-50 px-1 rounded text-amber-700 border border-amber-100 font-bold whitespace-nowrap">Κορδόνι: {getProductOptionColorLabel(item.cord_color)}</span>}
                            {item.enamel_color && <span className="text-[9px] bg-rose-50 px-1 rounded text-rose-700 border border-rose-100 font-bold whitespace-nowrap">Σμάλτο: {getProductOptionColorLabel(item.enamel_color)}</span>}
                        </div>
                        <span className="text-[10px] text-slate-600 truncate max-w-[200px] font-medium">{description}</span>
                        {item.notes && (
                            <div className="text-[9px] text-emerald-700 italic flex items-center gap-0.5 mt-0.5 leading-none font-medium">
                                <StickyNote size={8}/> {item.notes}
                            </div>
                        )}
                    </div>
                </div>
                <div className="w-8 text-center font-bold text-slate-800 text-[12px]">{item.quantity}</div>
                <div className="w-12 text-right text-slate-700 tabular-nums font-sans font-semibold text-[12px]">{item.price_at_order.toFixed(2).replace('.', ',')}{item.price_override ? '*' : ''}</div>
                <div className="w-14 text-right font-black text-slate-900 tabular-nums font-sans text-[12px]">{(item.price_at_order * item.quantity).toFixed(2).replace('.', ',')}</div>
            </div>
        );
    };

    return (
        <div className="bg-white text-black font-sans w-[210mm] min-h-[297mm] p-6 mx-auto shadow-lg print:shadow-none print:p-6 page-break-after-always flex flex-col relative">
            
            {/* COMPACT HEADER */}
            <div className="flex justify-between items-end border-b-2 border-slate-900 pb-2 mb-3 shrink-0">
                <div className="flex items-center gap-3">
                    <img src={APP_LOGO} alt="ILIOS" className="h-9 w-auto object-contain" />
                    <div className="text-[8px] text-slate-600 leading-tight border-l border-slate-300 pl-2">
                        <p className="font-bold text-slate-900 uppercase tracking-wide">{company.name}</p>
                        <p>{company.address}</p>
                        <p>{company.email} • {company.phone}</p>
                    </div>
                </div>
                
                <div className="text-right">
                    <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight leading-none mb-0.5">{title || 'Παραστατικό Παραγγελίας'}</h1>
                    <div className="flex items-center justify-end gap-3 text-[10px] text-slate-700 font-medium">
                        <span className="flex items-center gap-1"><Hash size={10}/> {formatOrderId(order.id)}{revisionSuffix || ''}</span>
                        <span className="text-slate-300">|</span>
                        <span className="flex items-center gap-1"><Calendar size={10}/> {formatDate(order.created_at)}</span>
                    </div>
                </div>
            </div>
            
            {/* SUPER COMPACT INFO BAR */}
            <div className="flex gap-4 mb-3 shrink-0 bg-slate-50 rounded-lg border border-slate-200 p-2">
                {/* Client Info */}
                <div className="flex-1 flex flex-col justify-center">
                    <div className="flex items-baseline gap-2 mb-0.5">
                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Πελατης</span>
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
                            <span className="font-mono text-slate-600">AΦΜ: {customer.vat_number}</span>
                        )}
                    </div>
                </div>

                {/* Vertical Divider */}
                <div className="w-px bg-slate-200 my-0.5"></div>

                {/* Total Info */}
                <div className="flex flex-col justify-center items-end px-2 min-w-[120px]">
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Συνολο</span>
                    <span className="font-black text-xl text-slate-900 leading-none">{grandTotal.toFixed(2).replace('.', ',')}€</span>
                </div>
            </div>

            {/* DUAL COLUMN ITEMS GRID */}
            <main className="flex-1 min-h-0 relative">
                
                {/* Header Row (Duplicated for 2 Columns) */}
                <div className="flex border-b-2 border-slate-800 pb-1 mb-1 text-[10px] font-black text-slate-700 uppercase tracking-wider">
                    {/* Left Column Header */}
                    <div className="flex-1 flex items-center pr-3">
                        <div className="w-6 text-center text-slate-400">#</div>
                        <div className="w-8 text-center">Eik.</div>
                        <div className="flex-1 px-1">Περιγραφη</div>
                        <div className="w-8 text-center">Ποσ.</div>
                        <div className="w-12 text-right">Τιμη</div>
                        <div className="w-14 text-right">Συνολο</div>
                    </div>
                    {/* Right Column Header */}
                    <div className="flex-1 flex items-center pl-3 border-l border-slate-300">
                         <div className="w-6 text-center text-slate-400">#</div>
                        <div className="w-8 text-center">Eik.</div>
                        <div className="flex-1 px-1">Περιγραφη</div>
                        <div className="w-8 text-center">Ποσ.</div>
                        <div className="w-12 text-right">Τιμη</div>
                        <div className="w-14 text-right">Συνολο</div>
                    </div>
                </div>

                {/* Items Grid - CSS columns: page-aware vertical flow, left→right per page */}
                <div
                    className="text-[12px] leading-snug"
                    style={{ columnCount: 2, columnGap: '1.5rem', columnRuleWidth: '1px', columnRuleStyle: 'dashed', columnRuleColor: '#e2e8f0' }}
                >
                    {sortedItems.map((item, index) => renderOrderItem(item, index))}
                </div>
            </main>

            {/* COMPACT FOOTER */}
            <footer className="mt-2 pt-2 border-t-2 border-slate-900 flex justify-between items-start shrink-0">
                <div className="text-[9px] text-slate-600 max-w-xs leading-snug">
                    <p className="font-bold uppercase text-slate-500 mb-0.5">Σημειώσεις</p>
                    <p className="italic bg-slate-50 p-1.5 rounded border border-slate-100">{order.notes || "Δεν υπάρχουν σημειώσεις για αυτή την παραγγελία."}</p>
                </div>
                
                <div className="w-48 text-[11px]">
                    <div className="flex justify-between items-center text-slate-700 mb-1 pb-1 border-b border-slate-200">
                        <span>Σύνολο Τεμαχίων:</span>
                        <span className="tabular-nums font-bold">{totalPieces}</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-600 mb-0.5">
                        <span>Καθαρή Αξία:</span>
                        <span className="tabular-nums font-bold">{subtotal.toFixed(2).replace('.', ',')}€</span>
                    </div>
                    {discountAmount > 0 && (
                        <div className="flex justify-between items-center text-rose-600 mb-0.5">
                            <span>Έκπτωση ({discountPercent}%):</span>
                            <span className="tabular-nums font-bold">-{discountAmount.toFixed(2).replace('.', ',')}€</span>
                        </div>
                    )}
                    <div className="flex justify-between items-center text-slate-600 mb-1 pb-1 border-b border-slate-200">
                        <span>Φ.Π.Α. ({(vatRate * 100).toFixed(0)}%):</span>
                        <span className="tabular-nums font-bold">{vatAmount.toFixed(2).replace('.', ',')}€</span>
                    </div>
                    
                    <div className="flex justify-between items-center text-slate-900 font-black text-sm">
                        <span className="uppercase">Γενικο Συνολο:</span>
                        <span className="tabular-nums text-base">{grandTotal.toFixed(2).replace('.', ',')}€</span>
                    </div>
                </div>
            </footer>
             <div className="mt-4 text-center text-[8px] text-slate-400 uppercase tracking-widest font-bold">
                System Generated • Ilios Kosmima ERP • {new Date().toLocaleTimeString()}
            </div>
            {hasOverriddenPrices && (
                <div className="mt-1 text-center text-[8px] text-amber-700 font-bold">
                    * Τιμή ανά τεμάχιο με εξαίρεση για τη συγκεκριμένη παραγγελία.
                </div>
            )}
        </div>
    );
}
