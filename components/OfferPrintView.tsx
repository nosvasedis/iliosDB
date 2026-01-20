
import React from 'react';
import { Offer } from '../types';
import { APP_LOGO } from '../constants';
import { formatCurrency } from '../utils/pricingEngine';
import { Phone, Mail, Calendar, Hash, MapPin } from 'lucide-react';

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
        email: "info@ilios-kosmima.gr"
    };
    
    // Calculate subtotal from items to show breakdown
    const subtotal = offer.items.reduce((acc, item) => acc + (item.price_at_order * item.quantity), 0);
    const discountAmount = subtotal * (offer.discount_percent / 100);

    return (
        <div className="bg-white text-black font-sans w-[210mm] min-h-[297mm] p-8 mx-auto shadow-lg print:shadow-none print:p-8 page-break-after-always relative flex flex-col">
            
            {/* Watermark Background */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.03] z-0">
                <img src={APP_LOGO} className="w-[120mm]" />
            </div>

            {/* HEADER */}
            <header className="flex justify-between items-start border-b-2 border-slate-900 pb-6 mb-6 shrink-0 relative z-10">
                <div className="flex flex-col items-start">
                    <img src={APP_LOGO} alt="ILIOS" className="h-16 object-contain mb-3" />
                    <div className="text-[9px] text-slate-600 font-medium leading-tight space-y-0.5">
                        <p className="font-bold text-slate-900 text-xs">{company.name}</p>
                        <p className="flex items-center gap-1"><MapPin size={10}/> {company.address}</p>
                        <p className="flex items-center gap-1"><Phone size={10}/> {company.phone}</p>
                        <p className="flex items-center gap-1"><Mail size={10}/> {company.email}</p>
                    </div>
                </div>
                
                <div className="text-right">
                    <h1 className="text-4xl font-black text-slate-900 tracking-tight uppercase leading-none mb-2">ΠΡΟΣΦΟΡΑ</h1>
                    <div className="text-sm text-slate-600 font-medium space-y-1">
                        <p className="flex items-center justify-end gap-2"><span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Αριθμος</span> <span className="font-mono font-bold text-slate-900">#{offer.id.slice(0, 8).toUpperCase()}</span></p>
                        <p className="flex items-center justify-end gap-2"><span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Ημερομηνια</span> <span className="font-mono font-bold text-slate-900">{formatDate(offer.created_at)}</span></p>
                    </div>
                </div>
            </header>
            
            {/* CUSTOMER INFO */}
            <section className="bg-slate-50 rounded-xl p-4 border border-slate-100 mb-6 flex justify-between items-center text-xs shrink-0 relative z-10">
                <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Πελατης</span>
                    <span className="font-black text-slate-900 text-base block">{offer.customer_name}</span>
                    {offer.customer_phone && (
                        <span className="font-medium text-slate-600 flex items-center gap-1 mt-1"><Phone size={12}/> {offer.customer_phone}</span>
                    )}
                </div>
                <div className="text-right">
                     <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Ισχυς Προσφορας</span>
                     <span className="font-bold text-slate-800 text-sm">30 Ημέρες</span>
                </div>
            </section>

            {/* ITEMS TABLE - High Density */}
            <main className="flex-1 relative z-10">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b-2 border-slate-800 text-slate-800 uppercase font-black tracking-wider text-[10px]">
                            <th className="py-2 pr-2 w-10 text-center">#</th>
                            <th className="py-2 px-2 w-14">Εικονα</th>
                            <th className="py-2 px-2">Περιγραφη / SKU</th>
                            <th className="py-2 px-2 text-center w-16">Ποσ.</th>
                            <th className="py-2 px-2 text-right w-24">Τιμη Μον.</th>
                            <th className="py-2 pl-2 text-right w-28">Συνολο</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-[10px]">
                        {offer.items.map((item, index) => {
                            const fullSku = item.sku + (item.variant_suffix || '');
                            const imageUrl = item.product_details?.image_url;
                            const description = item.product_details?.variants?.find(v => v.suffix === item.variant_suffix)?.description || item.product_details?.category || 'Προϊόν';

                            return (
                                <tr key={index} className="break-inside-avoid hover:bg-slate-50">
                                    <td className="py-1.5 pr-2 text-center text-slate-400 font-mono align-middle">{index + 1}</td>
                                    <td className="py-1.5 px-2 align-middle">
                                        <div className="w-9 h-9 bg-slate-50 rounded overflow-hidden border border-slate-200">
                                            {imageUrl && (
                                                <img src={imageUrl} alt={item.sku} className="w-full h-full object-cover" />
                                            )}
                                        </div>
                                    </td>
                                    <td className="py-1.5 px-2 align-middle">
                                        <div className="font-black text-slate-900 text-xs leading-none mb-0.5">{fullSku}</div>
                                        <div className="text-slate-500 font-medium leading-none truncate max-w-[300px]">{description}</div>
                                        {item.size_info && <span className="inline-block mt-0.5 text-[8px] bg-slate-100 px-1 rounded text-slate-600 border border-slate-200">Size: {item.size_info}</span>}
                                    </td>
                                    <td className="py-1.5 px-2 text-center align-middle font-bold text-slate-800 text-xs">{item.quantity}</td>
                                    <td className="py-1.5 px-2 text-right align-middle text-slate-600 font-mono">{formatCurrency(item.price_at_order)}</td>
                                    <td className="py-1.5 pl-2 text-right align-middle font-black text-slate-900 font-mono text-xs">{formatCurrency(item.price_at_order * item.quantity)}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </main>

            {/* FOOTER */}
            <div className="mt-6 flex justify-between items-start shrink-0 relative z-10 border-t-2 border-slate-900 pt-4">
                
                {/* Left: Notes */}
                <div className="w-[55%] text-[10px]">
                    <p className="font-bold text-slate-800 uppercase tracking-wider mb-2">Σημειωσεις</p>
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-slate-600 leading-snug">
                        {offer.notes || "Δεν υπάρχουν σημειώσεις για αυτή την προσφορά."}
                    </div>
                </div>

                {/* Right: Totals */}
                <div className="w-[40%] space-y-1 text-xs">
                    <div className="flex justify-between items-center text-slate-600 py-1">
                        <span>Υποσύνολο (Καθαρή Αξία):</span>
                        <span className="font-mono font-bold text-slate-900">{formatCurrency(subtotal)}</span>
                    </div>
                    {offer.discount_percent > 0 && (
                        <div className="flex justify-between items-center text-rose-600 py-1">
                            <span>Έκπτωση ({offer.discount_percent}%):</span>
                            <span className="font-mono font-bold">-{formatCurrency(discountAmount)}</span>
                        </div>
                    )}
                    <div className="flex justify-between items-center text-slate-600 py-1 border-b border-slate-200 pb-2">
                        <span>Φ.Π.Α. (24%):</span>
                        <span className="font-mono font-bold">{formatCurrency((offer.total_price / 1.24) * 0.24)}</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-900 font-black text-xl pt-2">
                        <span className="uppercase">Γενικο Συνολο:</span>
                        <span className="font-mono">{formatCurrency(offer.total_price)}</span>
                    </div>
                </div>
            </div>

            <footer className="mt-8 pt-2 border-t border-slate-100 flex justify-between items-center text-[8px] text-slate-400 font-bold uppercase tracking-widest shrink-0 relative z-10">
                <p>ERP System v1.0</p>
                <p>Ilios Kosmima - Σας ευχαριστούμε</p>
            </footer>
        </div>
    );
}
