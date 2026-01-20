
import React from 'react';
import { Offer } from '../types';
import { APP_LOGO } from '../constants';
import { formatCurrency } from '../utils/pricingEngine';
import { Phone, Mail, MapPin } from 'lucide-react';

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
        <div className="bg-white text-black font-sans w-[210mm] min-h-[297mm] p-10 mx-auto shadow-lg print:shadow-none print:p-10 page-break-after-always relative">
            
            {/* Watermark Background */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.03]">
                <img src={APP_LOGO} className="w-[150mm]" />
            </div>

            {/* HEADER */}
            <header className="flex justify-between items-start mb-12 border-b-2 border-slate-900 pb-6">
                <div className="w-48">
                    <img src={APP_LOGO} alt="ILIOS" className="w-full object-contain mb-4" />
                    <div className="text-[10px] text-slate-600 font-medium leading-relaxed">
                        <p>{company.address}</p>
                        <p>Τηλ: {company.phone}</p>
                        <p>Email: {company.email}</p>
                    </div>
                </div>
                
                <div className="text-right">
                    <h1 className="text-4xl font-black text-slate-900 tracking-tighter uppercase mb-2">Προσφορα</h1>
                    <div className="text-sm font-bold text-slate-500">
                        <p>Αρ. Προσφοράς: <span className="font-mono text-slate-900">#{offer.id.slice(0, 8).toUpperCase()}</span></p>
                        <p>Ημερομηνία: <span className="text-slate-900">{formatDate(offer.created_at)}</span></p>
                    </div>
                </div>
            </header>
            
            {/* CUSTOMER SECTION */}
            <section className="mb-10 flex justify-between">
                <div className="bg-slate-50 rounded-xl p-6 border-l-4 border-slate-900 w-[60%]">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Προς</h3>
                    <p className="text-xl font-bold text-slate-900 mb-1">{offer.customer_name}</p>
                    <div className="space-y-1 text-sm text-slate-600">
                        {offer.customer_phone && (
                            <p className="flex items-center gap-2"><Phone size={12}/> {offer.customer_phone}</p>
                        )}
                        {/* Add Address/Email if available in future expansions */}
                    </div>
                </div>
                <div className="text-right w-[35%] flex flex-col justify-end">
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Ισχυς Προσφορας</div>
                    <div className="text-sm font-bold text-slate-800">30 Ημέρες</div>
                </div>
            </section>

            {/* ITEMS TABLE */}
            <main className="mb-8">
                <table className="w-full text-left border-collapse text-xs">
                    <thead>
                        <tr className="border-b-2 border-slate-900 text-slate-900 uppercase font-black tracking-widest">
                            <th className="py-3 pr-2 w-10 text-center">#</th>
                            <th className="py-3 px-2 w-20">Εικόνα</th>
                            <th className="py-3 px-2">Περιγραφή Είδους</th>
                            <th className="py-3 px-2 text-center w-24">Ποσότητα</th>
                            <th className="py-3 px-2 text-right w-28">Τιμή Μον.</th>
                            <th className="py-3 pl-2 text-right w-32">Σύνολο</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {offer.items.map((item, index) => {
                            const fullSku = item.sku + (item.variant_suffix || '');
                            const imageUrl = item.product_details?.image_url;
                            const description = item.product_details?.variants?.find(v => v.suffix === item.variant_suffix)?.description || item.product_details?.category || 'Προϊόν';

                            return (
                                <tr key={index} className="break-inside-avoid">
                                    <td className="py-4 pr-2 text-center text-slate-400 font-bold">{index + 1}</td>
                                    <td className="py-4 px-2">
                                        <div className="w-12 h-12 bg-slate-50 rounded-lg overflow-hidden border border-slate-100">
                                            {imageUrl && (
                                                <img src={imageUrl} alt={item.sku} className="w-full h-full object-cover" />
                                            )}
                                        </div>
                                    </td>
                                    <td className="py-4 px-2 align-middle">
                                        <div className="font-black text-slate-900 text-sm">{fullSku}</div>
                                        <div className="text-slate-500 text-xs mt-0.5 font-medium">{description}</div>
                                        {item.size_info && <span className="inline-block mt-1 text-[9px] bg-slate-100 px-1.5 py-0.5 rounded font-bold text-slate-600">Size: {item.size_info}</span>}
                                    </td>
                                    <td className="py-4 px-2 text-center align-middle font-bold text-slate-800 text-base">{item.quantity}</td>
                                    <td className="py-4 px-2 text-right align-middle text-slate-600 font-mono font-medium">{formatCurrency(item.price_at_order)}</td>
                                    <td className="py-4 pl-2 text-right align-middle font-black text-slate-900 font-mono text-sm">{formatCurrency(item.price_at_order * item.quantity)}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </main>

            {/* FOOTER & TOTALS */}
            <div className="flex justify-end border-t border-slate-900 pt-6">
                <div className="w-72 space-y-3">
                    <div className="flex justify-between items-center text-slate-600 text-sm font-medium">
                        <span>Υποσύνολο:</span>
                        <span className="font-mono">{formatCurrency(subtotal)}</span>
                    </div>
                    {offer.discount_percent > 0 && (
                        <div className="flex justify-between items-center text-rose-600 text-sm font-bold">
                            <span>Έκπτωση ({offer.discount_percent}%):</span>
                            <span className="font-mono">-{formatCurrency(discountAmount)}</span>
                        </div>
                    )}
                    <div className="flex justify-between items-center text-slate-900 font-black text-2xl pt-4 border-t border-slate-200 mt-2">
                        <span>Γενικό Σύνολο:</span>
                        <span className="font-mono">{formatCurrency(offer.total_price)}</span>
                    </div>
                    <div className="text-[10px] text-slate-400 text-right mt-1 font-medium">
                        Συμπεριλαμβάνεται ΦΠΑ 24%
                    </div>
                </div>
            </div>

            {/* Notes Section */}
            {offer.notes && (
                <div className="mt-12 bg-slate-50 p-6 rounded-xl border border-slate-100 break-inside-avoid">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Σημειωσεις</h4>
                    <p className="text-sm text-slate-700 leading-relaxed italic">"{offer.notes}"</p>
                </div>
            )}

            <footer className="absolute bottom-10 left-10 right-10 border-t border-slate-100 pt-6 flex justify-between items-end text-[9px] text-slate-500 font-bold uppercase tracking-widest">
                <div>
                    <p>ILIOS KOSMIMA ERP</p>
                    <p className="mt-1">Ευχαριστούμε για την προτίμηση.</p>
                </div>
                <div className="text-right">
                    <p>Υπογραφή / Σφραγίδα</p>
                    <div className="h-16 w-40 border-b border-slate-200 mt-2"></div>
                </div>
            </footer>
        </div>
    );
}
