
import React, { useEffect, useMemo, useState } from 'react';
import { Order, Product, Customer } from '../types';
import { APP_LOGO } from '../constants';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/supabase';
import QRCode from 'qrcode';
import { ImageIcon, Phone, MapPin, Calendar, Hash } from 'lucide-react';
import { transliterateForBarcode } from '../utils/pricingEngine';
import { formatOrderId } from '../utils/orderUtils';
import { buildSkuKey, sortBySkuKey } from '../utils/skuSort';
import { getProductOptionColorLabel } from '../utils/xrOptions';
import { isSpecialCreationSku } from '../utils/specialCreationSku';
import CustomerPrintItemsGrid from './CustomerPrintItemsGrid';
import {
    CUSTOMER_PRINT_CSS,
    CUSTOMER_PRINT_MAIN_CLASS,
    CUSTOMER_PRINT_PAGE_CLASS,
    CustomerPrintSkuNote,
    CustomerPrintSummaryFooter,
} from './customerPrintShared';

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
    const displayTitle = title && title.toLocaleUpperCase('el-GR').includes('ΠΑΡΑΓΓΕΛΙΑΣ')
        ? 'ΥΠΟΛΟΙΠΑ ΕΙΔΗ ΠΡΟΣΦΟΡΑΣ'
        : title;

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
                            <span className={`font-bold truncate ${isSpecialCreationSku(item.sku) ? 'text-violet-900' : 'text-slate-900'}`}>{fullSku}</span>
                            {item.size_info && <span className="text-[9px] bg-slate-100 px-1 rounded text-slate-600 border border-slate-200 font-bold whitespace-nowrap">{item.size_info}</span>}
                            {item.cord_color && <span className="text-[9px] bg-amber-50 px-1 rounded text-amber-700 border border-amber-100 font-bold whitespace-nowrap">Κορδόνι: {getProductOptionColorLabel(item.cord_color)}</span>}
                            {item.enamel_color && <span className="text-[9px] bg-rose-50 px-1 rounded text-rose-700 border border-rose-100 font-bold whitespace-nowrap">Σμάλτο: {getProductOptionColorLabel(item.enamel_color)}</span>}
                        </div>
                        <span className="block text-[9px] text-slate-600 font-medium leading-[1.15] whitespace-normal break-words">{description}</span>
                        <CustomerPrintSkuNote note={item.notes} />
                    </div>
                </div>
                <div className="w-14 text-right font-black text-slate-900 tabular-nums font-sans text-[10px] whitespace-nowrap">
                    <div>{item.quantity} x {item.price_at_order.toFixed(2).replace('.', ',')}{item.price_override ? '*' : ''}</div>
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
                    <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight leading-none mb-0.5">{displayTitle || 'ΠΡΟΣΦΟΡΑ ILIOS'}</h1>
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

                {/* Net value */}
                <div className="flex flex-col justify-center items-end px-2 min-w-[120px]">
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Καθαρή Αξία</span>
                    <span className="font-black text-xl text-slate-900 leading-none">{netAmount.toFixed(2).replace('.', ',')}€</span>
                </div>
            </div>

            {/* CUSTOMER ITEMS GRID */}
            <main className={CUSTOMER_PRINT_MAIN_CLASS}>
                <CustomerPrintItemsGrid
                    items={sortedItems}
                    renderItem={renderOrderItem}
                    descriptionLabel="Περιγραφη"
                    textClassName="text-[10px] leading-tight"
                    footer={
                        <CustomerPrintSummaryFooter
                            notes={order.notes}
                            notesFallback="Δεν υπάρχουν σημειώσεις για αυτή την παραγγελία."
                            totalPieces={totalPieces}
                            subtotal={subtotal}
                            discountPercent={discountPercent}
                            discountAmount={discountAmount}
                            vatRate={vatRate}
                            vatAmount={vatAmount}
                            grandTotal={grandTotal}
                            trailing={
                                hasOverriddenPrices ? (
                                    <p className="mt-1 text-center text-[7px] font-bold text-amber-700">
                                        * Τιμή ανά τεμάχιο με εξαίρεση για τη συγκεκριμένη παραγγελία.
                                    </p>
                                ) : undefined
                            }
                        />
                    }
                />
            </main>
        </div>
    );
}
