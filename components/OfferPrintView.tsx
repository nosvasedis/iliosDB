
import React, { useMemo } from 'react';
import { Offer } from '../types';
import { APP_LOGO } from '../constants';
import { formatDecimal } from '../utils/pricingEngine';
import { Phone, Mail, MapPin, Coins } from 'lucide-react';
import { buildSkuKey, sortBySkuKey } from '../utils/skuSort';
import CustomerPrintItemsGrid from './CustomerPrintItemsGrid';
import {
    CUSTOMER_PRINT_CSS,
    CUSTOMER_PRINT_MAIN_CLASS,
    CUSTOMER_PRINT_PAGE_CLASS,
    CustomerPrintSkuNote,
    CustomerPrintSummaryFooter,
} from './customerPrintShared';

interface Props {
    offer: Offer;
}

export default function OfferPrintView({ offer }: Props) {
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
    
    // Calculate breakdown
    // Default to 24% if vat_rate is missing for backward compatibility
    const vatRate = offer.vat_rate !== undefined ? offer.vat_rate : 0.24;
    const subtotal = offer.items.reduce((acc, item) => acc + (item.price_at_order * item.quantity), 0);
    const discountAmount = subtotal * (offer.discount_percent / 100);
    const netAmount = subtotal - discountAmount;
    const vatAmount = netAmount * vatRate;
    const grandTotal = netAmount + vatAmount;
    const sortedItems = useMemo(
        () => sortBySkuKey(offer.items, (item) => buildSkuKey(item.sku, item.variant_suffix)),
        [offer.items]
    );

    const renderOfferItem = (item: Offer['items'][number], globalIndex: number) => {
        const fullSku = item.sku + (item.variant_suffix || '');
        const imageUrl = item.product_details?.image_url;
        const description = item.product_details?.variants?.find(v => v.suffix === item.variant_suffix)?.description || item.product_details?.category || 'Προϊόν';
        return (
            <div
                key={globalIndex}
                className="flex items-center min-h-[52px] py-0.5 border-b border-slate-100 break-inside-avoid"
            >
                <div className="w-6 text-center text-slate-400 font-mono text-[11px]">{globalIndex + 1}</div>
                <div className="w-14 flex justify-center flex-shrink-0">
                    <div className="w-12 h-12 bg-slate-50 rounded overflow-hidden border border-slate-200">
                        {imageUrl && (
                            <img src={imageUrl} alt={item.sku} className="w-full h-full object-cover" />
                        )}
                    </div>
                </div>
                <div className="flex-1 px-1 min-w-0">
                    <div className="font-black text-slate-900 truncate">{fullSku}</div>
                    <div className="text-slate-500 font-medium text-[9px] leading-[1.15] whitespace-normal break-words">{description}</div>
                    <CustomerPrintSkuNote note={item.notes} />
                    {item.size_info && <span className="inline-block text-[7px] bg-slate-100 px-1 rounded text-slate-600 border border-slate-200 leading-none mt-0.5">{item.size_info}</span>}
                </div>
                <div className="w-14 text-right font-black text-slate-900 font-mono text-[10px] whitespace-nowrap">
                    <div>{item.quantity} x {formatDecimal(item.price_at_order, 2)}</div>
                    {item.quantity !== 1 && (
                        <div className="mt-0.5 text-[9px] leading-none text-slate-400">
                            {formatDecimal(item.quantity * item.price_at_order, 2)}
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className={CUSTOMER_PRINT_PAGE_CLASS}>
            <style>{CUSTOMER_PRINT_CSS}</style>
            
            {/* Watermark Background */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.03] z-0">
                <img src={APP_LOGO} className="w-[120mm]" />
            </div>

            {/* COMPACT HEADER */}
            <div className="flex justify-between items-end border-b-2 border-slate-900 pb-2 mb-4 shrink-0 relative z-10">
                <div className="flex flex-col items-start">
                    <img src={APP_LOGO} alt="ILIOS" className="h-10 object-contain mb-1" />
                    <div className="text-[8px] text-slate-600 font-medium leading-tight space-y-0.5">
                        <p className="font-bold text-slate-900">{company.name}</p>
                        <p className="flex items-center gap-1"><MapPin size={8}/> {company.address}</p>
                        <p className="flex items-center gap-1"><Phone size={8}/> {company.phone} <span className="text-slate-300">|</span> <Mail size={8}/> {company.email}</p>
                    </div>
                </div>
                
                <div className="text-right">
                    <h1 className="text-2xl font-black text-slate-900 tracking-tight uppercase leading-none mb-1">ΠΡΟΣΦΟΡΑ</h1>
                    <div className="text-xs text-slate-600 font-medium space-y-0.5">
                        <div className="flex items-center justify-end gap-2">
                             <span className="text-[9px] text-slate-400 uppercase font-bold tracking-wider">Αριθμος</span> 
                             <span className="font-mono font-bold text-slate-900">#{offer.id.slice(0, 8).toUpperCase()}</span>
                        </div>
                        <div className="flex items-center justify-end gap-2">
                            <span className="text-[9px] text-slate-400 uppercase font-bold tracking-wider">Ημερομηνια</span> 
                            <span className="font-mono font-bold text-slate-900">{formatDate(offer.created_at)}</span>
                        </div>
                        <div className="flex items-center justify-end gap-2 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100 mt-0.5 inline-flex">
                            <Coins size={10} className="text-slate-400"/>
                            <span className="text-[8px] text-slate-500 uppercase font-bold tracking-wider">Τιμη Ασημιου</span> 
                            <span className="font-mono font-black text-slate-900 text-[10px]">{formatDecimal(offer.custom_silver_price, 2)} €/g</span>
                        </div>
                    </div>
                </div>
            </div>
            
            {/* CUSTOMER INFO */}
            <section className="bg-slate-50 rounded-lg p-2 border border-slate-100 mb-4 flex justify-between items-center text-xs shrink-0 relative z-10">
                <div>
                    <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider block">Πελατης</span>
                    <span className="font-black text-slate-900 text-sm block">{offer.customer_name}</span>
                    {offer.customer_phone && (
                        <span className="font-medium text-slate-600 flex items-center gap-1 text-[10px] mt-0.5"><Phone size={10}/> {offer.customer_phone}</span>
                    )}
                </div>
                <div className="text-right">
                     <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider block">Ισχυς Προσφορας</span>
                     <span className="font-bold text-slate-800 text-xs">30 Ημέρες</span>
                </div>
            </section>

            {/* CUSTOMER ITEMS GRID */}
            <main className={`${CUSTOMER_PRINT_MAIN_CLASS} z-10`}>
                <CustomerPrintItemsGrid
                    items={sortedItems}
                    renderItem={renderOfferItem}
                    descriptionLabel="Περιγραφη"
                    textClassName="text-[10px] leading-tight"
                    footer={
                        <CustomerPrintSummaryFooter
                            notes={offer.notes}
                            notesFallback="Δεν υπάρχουν σημειώσεις."
                            subtotalLabel="Υποσύνολο:"
                            subtotal={subtotal}
                            discountPercent={offer.discount_percent}
                            discountAmount={discountAmount}
                            vatRate={vatRate}
                            vatAmount={vatAmount}
                            grandTotal={grandTotal}
                            trailing={
                                <p className="mt-1.5 text-center text-[7px] font-bold uppercase tracking-widest text-slate-400">
                                    ILIOS KOSMIMA ERP
                                </p>
                            }
                        />
                    }
                />
            </main>
        </div>
    );
}
