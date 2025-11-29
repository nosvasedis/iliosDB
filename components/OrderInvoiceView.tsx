
import React from 'react';
import { Order, OrderItem } from '../types';
import { APP_LOGO } from '../constants';
import { MapPin, Phone, Mail, FileText, Calendar } from 'lucide-react';

interface Props {
    order: Order;
}

export default function OrderInvoiceView({ order }: Props) {
    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('el-GR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    return (
        <div className="w-full bg-white text-slate-900 p-10 font-sans text-sm leading-normal h-full flex flex-col">
            {/* HEADER */}
            <div className="flex justify-between items-start border-b border-slate-200 pb-8 mb-8">
                <div className="flex flex-col gap-2">
                    <div className="w-32 mb-2">
                        {/* Ensure logo is loaded or render text fallback */}
                        <img src={APP_LOGO} alt="ILIOS" className="w-full object-contain" />
                    </div>
                    <div className="text-xs text-slate-500">
                        <p className="font-bold text-slate-800">ILIOS KOSMIMA ERP</p>
                        <p>Manufacturing & Wholesale</p>
                        <p>Athens, Greece</p>
                    </div>
                </div>
                
                <div className="text-right">
                    <h1 className="text-3xl font-black text-slate-800 uppercase tracking-tight mb-1">Παραγγελια</h1>
                    <p className="text-slate-500 font-mono text-lg">#{order.id}</p>
                    <div className="mt-4 flex flex-col gap-1 items-end text-sm">
                        <div className="flex items-center gap-2">
                            <span className="text-slate-400">Ημερομηνία:</span>
                            <span className="font-bold">{formatDate(order.created_at)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-slate-400">Κατάσταση:</span>
                            <span className="font-bold uppercase text-xs border border-slate-300 px-2 py-0.5 rounded">{order.status}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* CUSTOMER INFO */}
            <div className="bg-slate-50 rounded-xl p-6 mb-8 border border-slate-100 flex justify-between">
                <div>
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Πελατης</h3>
                    <p className="text-xl font-bold text-slate-800">{order.customer_name}</p>
                    {order.customer_phone && (
                        <p className="text-slate-600 mt-1 flex items-center gap-2"><Phone size={14}/> {order.customer_phone}</p>
                    )}
                </div>
                <div className="text-right max-w-xs">
                    {/* Placeholder for customer details if we had full object, using placeholders for layout */}
                    {order.notes && (
                        <>
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Σημειωσεις</h3>
                            <p className="text-slate-600 italic text-sm">{order.notes}</p>
                        </>
                    )}
                </div>
            </div>

            {/* ITEMS TABLE */}
            <div className="flex-1">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b-2 border-slate-800 text-slate-800 text-xs uppercase font-black tracking-wider">
                            <th className="py-3 pr-4 w-12">#</th>
                            <th className="py-3 pr-4">Περιγραφη / SKU</th>
                            <th className="py-3 px-4 text-center">Ποσοτητα</th>
                            <th className="py-3 px-4 text-right">Τιμη Μοναδας</th>
                            <th className="py-3 pl-4 text-right">Συνολο</th>
                        </tr>
                    </thead>
                    <tbody className="text-sm">
                        {order.items.map((item, idx) => {
                            const variantSuffix = item.variant_suffix || '';
                            const skuDisplay = item.sku + (variantSuffix ? `-${variantSuffix}` : '');
                            const desc = item.product_details?.category || 'Προϊόν';
                            
                            // Try to get variant specific description
                            let variantDesc = '';
                            if (item.product_details?.variants) {
                                const v = item.product_details.variants.find(x => x.suffix === variantSuffix);
                                if (v) variantDesc = v.description;
                            }

                            return (
                                <tr key={idx} className="border-b border-slate-100">
                                    <td className="py-4 pr-4 text-slate-400 font-mono text-xs">{idx + 1}</td>
                                    <td className="py-4 pr-4">
                                        <div className="font-bold text-slate-800 text-base">{skuDisplay}</div>
                                        <div className="text-slate-500 text-xs mt-0.5">
                                            {desc} {variantDesc ? `• ${variantDesc}` : ''}
                                        </div>
                                    </td>
                                    <td className="py-4 px-4 text-center font-bold text-slate-700">{item.quantity}</td>
                                    <td className="py-4 px-4 text-right text-slate-600">{item.price_at_order.toFixed(2)}€</td>
                                    <td className="py-4 pl-4 text-right font-bold text-slate-900">{(item.price_at_order * item.quantity).toFixed(2)}€</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* FOOTER TOTALS */}
            <div className="mt-8 border-t-2 border-slate-800 pt-6 flex justify-end">
                <div className="w-64 space-y-3">
                    <div className="flex justify-between items-center text-slate-500 text-sm">
                        <span>Μερικό Σύνολο:</span>
                        <span>{order.total_price.toFixed(2)}€</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-900 font-black text-2xl pt-2 border-t border-slate-200">
                        <span>Σύνολο:</span>
                        <span>{order.total_price.toFixed(2)}€</span>
                    </div>
                    <div className="text-xs text-slate-400 text-right mt-1 italic">
                        * Οι τιμές αφορούν χονδρική πώληση
                    </div>
                </div>
            </div>

            {/* PRINT FOOTER */}
            <div className="mt-auto pt-12 text-center text-xs text-slate-400 border-t border-slate-100">
                <p>Generated by Ilios Kosmima ERP • {new Date().toLocaleDateString('el-GR')} {new Date().toLocaleTimeString('el-GR')}</p>
            </div>
        </div>
    );
}
