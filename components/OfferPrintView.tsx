
import React from 'react';
import { Offer } from '../types';
import { APP_LOGO } from '../constants';
import { formatCurrency, formatDecimal } from '../utils/pricingEngine';
import { Phone, Mail, MapPin, Coins } from 'lucide-react';

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
    const subtotal = offer.items.reduce((acc, item) => acc + (item.price_at_order * item.quantity), 0);
    const discountAmount = subtotal * (offer.discount_percent / 100);
    const netAmount = subtotal - discountAmount;
    const vatAmount = netAmount * 0.24;
    const grandTotal = netAmount + vatAmount;

    return (
        <div className="bg-white text-black font-sans w-[210mm] min-h-[297mm] p-6 mx-auto shadow-lg print:shadow-none print:p-6 page-break-after-always relative flex flex-col">
            
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

            {/* ITEMS GRID (2 COLUMNS) */}
            <main className="flex-1 relative z-10">
                
                {/* Double Header Row */}
                <div className="flex border-b-2 border-slate-800 pb-1 mb-1 text-[8px] font-black text-slate-800 uppercase tracking-wider">
                    {/* Left Column Header */}
                    <div className="flex-1 flex items-center pr-3">
                        <div className="w-5 text-center text-slate-400">#</div>
                        <div className="w-10 text-center">Eik.</div>
                        <div className="flex-1 px-1">Περιγραφη</div>
                        <div className="w-8 text-center">Ποσ.</div>
                        <div className="w-12 text-right">Τιμη</div>
                        <div className="w-14 text-right">Συνολο</div>
                    </div>
                    {/* Right Column Header */}
                    <div className="flex-1 flex items-center pl-3 border-l border-slate-300">
                        <div className="w-5 text-center text-slate-400">#</div>
                        <div className="w-10 text-center">Eik.</div>
                        <div className="flex-1 px-1">Περιγραφη</div>
                        <div className="w-8 text-center">Ποσ.</div>
                        <div className="w-12 text-right">Τιμη</div>
                        <div className="w-14 text-right">Συνολο</div>
                    </div>
                </div>

                {/* Grid Content */}
                <div className="grid grid-cols-2 text-[9px] leading-tight auto-rows-min">
                    {offer.items.map((item, index) => {
                        const fullSku = item.sku + (item.variant_suffix || '');
                        const imageUrl = item.product_details?.image_url;
                        const description = item.product_details?.variants?.find(v => v.suffix === item.variant_suffix)?.description || item.product_details?.category || 'Προϊόν';

                        return (
                            <div 
                                key={index} 
                                className={`
                                    flex items-center py-1.5 border-b border-slate-100 break-inside-avoid
                                    ${index % 2 === 0 ? 'pr-3 border-r border-dashed border-slate-200' : 'pl-3'}
                                `}
                            >
                                <div className="w-5 text-center text-slate-400 font-mono text-[8px]">{index + 1}</div>
                                
                                <div className="w-10 flex justify-center">
                                    <div className="w-8 h-8 bg-slate-50 rounded overflow-hidden border border-slate-200">
                                        {imageUrl && (
                                            <img src={imageUrl} alt={item.sku} className="w-full h-full object-cover" />
                                        )}
                                    </div>
                                </div>
                                
                                <div className="flex-1 px-1 min-w-0">
                                    <div className="font-black text-slate-900 truncate">{fullSku}</div>
                                    <div className="text-slate-500 font-medium truncate text-[8px]">{description}</div>
                                    {item.size_info && <span className="inline-block text-[7px] bg-slate-100 px-1 rounded text-slate-600 border border-slate-200 leading-none mt-0.5">{item.size_info}</span>}
                                </div>
                                
                                <div className="w-8 text-center font-bold text-slate-800">{item.quantity}</div>
                                
                                <div className="w-12 text-right font-mono text-slate-600">{formatCurrency(item.price_at_order)}</div>
                                
                                <div className="w-14 text-right font-black text-slate-900 font-mono">{formatCurrency(item.price_at_order * item.quantity)}</div>
                            </div>
                        );
                    })}
                </div>
            </main>

            {/* FOOTER */}
            <div className="mt-4 flex justify-between items-start shrink-0 relative z-10 border-t-2 border-slate-900 pt-3">
                
                {/* Left: Notes */}
                <div className="w-[60%] text-[9px]">
                    <p className="font-bold text-slate-800 uppercase tracking-wider mb-1 text-[8px]">Σημειωσεις</p>
                    <div className="bg-slate-50 p-2 rounded border border-slate-100 text-slate-600 leading-snug italic">
                        {offer.notes || "Δεν υπάρχουν σημειώσεις."}
                    </div>
                </div>

                {/* Right: Totals */}
                <div className="w-[35%] space-y-0.5 text-[10px]">
                    <div className="flex justify-between items-center text-slate-600">
                        <span>Υποσύνολο:</span>
                        <span className="font-mono font-bold text-slate-900">{formatCurrency(subtotal)}</span>
                    </div>
                    {offer.discount_percent > 0 && (
                        <div className="flex justify-between items-center text-rose-600">
                            <span>Έκπτωση ({offer.discount_percent}%):</span>
                            <span className="font-mono font-bold">-{formatCurrency(discountAmount)}</span>
                        </div>
                    )}
                    <div className="flex justify-between items-center text-slate-600 pb-1 border-b border-slate-200 mb-1">
                        <span>Φ.Π.Α. (24%):</span>
                        <span className="font-mono font-bold">{formatCurrency(vatAmount)}</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-900 font-black text-sm">
                        <span className="uppercase">Γενικο Συνολο:</span>
                        <span className="font-mono text-base">{formatCurrency(grandTotal)}</span>
                    </div>
                </div>
            </div>

            <footer className="mt-4 pt-2 border-t border-slate-100 flex justify-between items-center text-[7px] text-slate-400 font-bold uppercase tracking-widest shrink-0 relative z-10">
                <p>ILIOS KOSMIMA ERP</p>
                {/* Page number removed as requested */}
            </footer>
        </div>
    );
}
