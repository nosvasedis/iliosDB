
import React from 'react';
import { Offer } from '../types';
import { APP_LOGO } from '../constants';
import { formatCurrency } from '../utils/pricingEngine';
import { Phone, Mail, Calendar, Hash } from 'lucide-react';

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
        <div className="bg-white text-black font-sans w-[210mm] min-h-[297mm] p-6 mx-auto shadow-lg print:shadow-none print:p-6 page-break-after-always relative flex flex-col">
            
            {/* Watermark Background */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.03] z-0">
                <img src={APP_LOGO} className="w-[120mm]" />
            </div>

            {/* HEADER - Compact Horizontal */}
            <header className="flex justify-between items-end border-b-2 border-slate-900 pb-3 mb-4 shrink-0 relative z-10">
                <div className="flex items-center gap-4">
                    <img src={APP_LOGO} alt="ILIOS" className="w-32 object-contain" />
                    <div className="h-8 w-px bg-slate-300"></div>
                    <div className="text-[9px] text-slate-500 font-medium leading-tight">
                        <p className="font-bold text-slate-800">{company.name}</p>
                        <p>{company.address} • {company.phone}</p>
                        <p>{company.email}</p>
                    </div>
                </div>
                
                <div className="text-right">
                    <h1 className="text-2xl font-black text-slate-900 tracking-tighter uppercase leading-none mb-1">Προσφορα</h1>
                    <div className="flex items-center justify-end gap-3 text-[10px] text-slate-600 font-medium">
                        <span className="flex items-center gap-1"><Hash size={10}/> {offer.id.slice(0, 8).toUpperCase()}</span>
                        <span className="flex items-center gap-1"><Calendar size={10}/> {formatDate(offer.created_at)}</span>
                    </div>
                </div>
            </header>
            
            {/* CUSTOMER BAR - Slim */}
            <section className="bg-slate-50 rounded-lg p-2.5 border border-slate-100 mb-4 flex justify-between items-center text-xs shrink-0 relative z-10">
                <div className="flex items-center gap-6">
                    <div>
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">ΠΕΛΑΤΗΣ</span>
                        <span className="font-bold text-slate-900 text-sm">{offer.customer_name}</span>
                    </div>
                    {offer.customer_phone && (
                        <div>
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">ΤΗΛΕΦΩΝΟ</span>
                            <span className="font-medium text-slate-700 flex items-center gap-1"><Phone size={10}/> {offer.customer_phone}</span>
                        </div>
                    )}
                </div>
                <div className="text-right">
                     <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">ΙΣΧΥΣ</span>
                     <span className="font-bold text-slate-800">30 Ημέρες</span>
                </div>
            </section>

            {/* ITEMS TABLE - High Density */}
            <main className="flex-1 relative z-10">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b border-slate-800 text-slate-800 uppercase font-black tracking-tighter text-[9px]">
                            <th className="py-1 pr-2 w-8 text-center">#</th>
                            <th className="py-1 px-1 w-12">Εικονα</th>
                            <th className="py-1 px-1">Περιγραφη / SKU</th>
                            <th className="py-1 px-1 text-center w-16">Ποσ.</th>
                            <th className="py-1 px-1 text-right w-20">Τιμη</th>
                            <th className="py-1 pl-1 text-right w-24">Συνολο</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-[10px]">
                        {offer.items.map((item, index) => {
                            const fullSku = item.sku + (item.variant_suffix || '');
                            const imageUrl = item.product_details?.image_url;
                            const description = item.product_details?.variants?.find(v => v.suffix === item.variant_suffix)?.description || item.product_details?.category || 'Προϊόν';

                            return (
                                <tr key={index} className="break-inside-avoid hover:bg-slate-50">
                                    <td className="py-1 pr-2 text-center text-slate-400 font-mono align-middle">{index + 1}</td>
                                    <td className="py-1 px-1 align-middle">
                                        <div className="w-9 h-9 bg-slate-50 rounded overflow-hidden border border-slate-200">
                                            {imageUrl && (
                                                <img src={imageUrl} alt={item.sku} className="w-full h-full object-cover" />
                                            )}
                                        </div>
                                    </td>
                                    <td className="py-1 px-1 align-middle">
                                        <div className="font-black text-slate-900 text-xs leading-none mb-0.5">{fullSku}</div>
                                        <div className="text-slate-500 font-medium leading-none truncate max-w-[280px]">{description}</div>
                                        {item.size_info && <span className="inline-block mt-0.5 text-[8px] bg-slate-100 px-1 rounded text-slate-600 border border-slate-200">Size: {item.size_info}</span>}
                                    </td>
                                    <td className="py-1 px-1 text-center align-middle font-bold text-slate-800 text-xs">{item.quantity}</td>
                                    <td className="py-1 px-1 text-right align-middle text-slate-600 font-mono">{formatCurrency(item.price_at_order)}</td>
                                    <td className="py-1 pl-1 text-right align-middle font-black text-slate-900 font-mono text-xs">{formatCurrency(item.price_at_order * item.quantity)}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </main>

            {/* COMPACT FOOTER */}
            <div className="mt-4 pt-2 border-t-2 border-slate-100 flex justify-between items-start shrink-0 relative z-10">
                
                {/* Left: Notes */}
                <div className="w-[60%] text-[9px]">
                    {offer.notes && (
                        <div className="bg-slate-50 p-2 rounded border border-slate-100">
                            <p className="font-bold text-slate-400 uppercase tracking-wider mb-1 text-[8px]">Σημειωσεις</p>
                            <p className="text-slate-700 leading-snug italic">"{offer.notes}"</p>
                        </div>
                    )}
                </div>

                {/* Right: Totals */}
                <div className="w-[35%] space-y-1 text-[10px]">
                    <div className="flex justify-between items-center text-slate-500">
                        <span>Υποσύνολο:</span>
                        <span className="font-mono">{formatCurrency(subtotal)}</span>
                    </div>
                    {offer.discount_percent > 0 && (
                        <div className="flex justify-between items-center text-rose-600 font-bold">
                            <span>Έκπτωση ({offer.discount_percent}%):</span>
                            <span className="font-mono">-{formatCurrency(discountAmount)}</span>
                        </div>
                    )}
                    <div className="flex justify-between items-center text-slate-900 font-black text-base pt-1 border-t border-slate-300 mt-1">
                        <span>ΣΥΝΟΛΟ:</span>
                        <span className="font-mono">{formatCurrency(offer.total_price)}</span>
                    </div>
                    <div className="text-[8px] text-slate-400 text-right">
                        Συμπ. ΦΠΑ 24%
                    </div>
                </div>
            </div>

            <footer className="mt-6 border-t border-slate-100 pt-2 flex justify-between items-center text-[8px] text-slate-400 font-bold uppercase tracking-widest shrink-0 relative z-10">
                <p>ILIOS KOSMIMA ERP</p>
                <p>Σελίδα 1/1</p>
            </footer>
        </div>
    );
}
