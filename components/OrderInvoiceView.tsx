import React, { useEffect, useRef } from 'react';
import { Order, Product } from '../types';
import { APP_LOGO } from '../constants';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/supabase';
import JsBarcode from 'jsbarcode';
import { ImageIcon } from 'lucide-react';

interface Props {
    order: Order;
}

// A small component to render the barcode canvas
const BarcodeCanvas: React.FC<{ sku: string }> = ({ sku }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        if (canvasRef.current && sku) {
            try {
                JsBarcode(canvasRef.current, sku, {
                    format: 'CODE128',
                    displayValue: false,
                    height: 40,
                    width: 1.5,
                    margin: 0,
                });
            } catch (e) {
                console.error("Barcode generation failed for SKU:", sku, e);
            }
        }
    }, [sku]);
    return <canvas ref={canvasRef} />;
};


export default function OrderInvoiceView({ order }: Props) {
    const { data: allProducts } = useQuery<Product[]>({ queryKey: ['products'], queryFn: api.getProducts });

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('el-GR', {
            day: '2-digit', month: '2-digit', year: 'numeric'
        });
    };

    return (
        <div className="w-full bg-white text-slate-900 p-8 font-sans text-sm leading-normal h-full flex flex-col page-break-inside-avoid break-inside-avoid">
            {/* HEADER */}
            <header className="flex justify-between items-center border-b border-slate-200 pb-4 mb-6">
                <div className="w-28">
                    <img src={APP_LOGO} alt="ILIOS" className="w-full object-contain" />
                </div>
                
                <div className="text-right">
                    <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Παραγγελια</h1>
                    <p className="text-slate-500 font-mono font-bold">#{order.id}</p>
                    <p className="text-slate-500 text-xs mt-2">Ημερομηνία: <span className="font-bold">{formatDate(order.created_at)}</span></p>
                </div>
            </header>

            {/* CUSTOMER INFO */}
            <section className="bg-slate-50 rounded-xl p-4 mb-6 border border-slate-100 flex justify-between items-start">
                <div>
                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">Στοιχεια Πελατη</h3>
                    <p className="text-lg font-bold text-slate-800">{order.customer_name}</p>
                    {order.customer_phone && (
                        <p className="text-slate-600 text-sm mt-0.5">{order.customer_phone}</p>
                    )}
                </div>
                {order.notes && (
                    <div className="text-right max-w-xs">
                         <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">Σημειωσεις</h3>
                         <p className="text-slate-600 italic text-xs">{order.notes}</p>
                    </div>
                )}
            </section>

            {/* ITEMS TABLE */}
            <main className="flex-1">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b-2 border-slate-800 text-slate-800 text-xs uppercase font-black tracking-wider">
                            <th className="py-3 pr-4 w-20">Εικονα</th>
                            <th className="py-3 pr-4">Περιγραφη / SKU</th>
                            <th className="py-3 px-4 w-40">Barcode</th>
                            <th className="py-3 px-4 text-center w-24">Ποσοτητα</th>
                            <th className="py-3 px-4 text-right w-32">Τιμη</th>
                            <th className="py-3 pl-4 text-right w-32">Συνολο</th>
                        </tr>
                    </thead>
                    <tbody>
                        {order.items.map((item) => {
                            const product = allProducts?.find(p => p.sku === item.sku);
                            const variant = product?.variants?.find(v => v.suffix === item.variant_suffix);

                            const fullSku = item.sku + (item.variant_suffix || '');
                            const imageUrl = product?.image_url;
                            const description = variant?.description || product?.category || 'Προϊόν';

                            return (
                                <tr key={fullSku} className="border-b border-slate-100 odd:bg-slate-50/50">
                                    <td className="py-4 pr-4">
                                        <div className="w-16 h-16 bg-slate-100 rounded-lg overflow-hidden border border-slate-200 shadow-sm">
                                            {imageUrl ? (
                                                <img src={imageUrl} alt={item.sku} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-slate-300">
                                                    <ImageIcon size={24} />
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                    <td className="py-4 pr-4 align-top">
                                        <div className="font-bold text-slate-800 text-base">{fullSku}</div>
                                        <div className="text-slate-500 text-xs mt-0.5">{description}</div>
                                    </td>
                                    <td className="py-4 px-4 align-middle">
                                        <div className="h-10 flex items-center justify-center">
                                            <BarcodeCanvas sku={fullSku} />
                                        </div>
                                    </td>
                                    <td className="py-4 px-4 text-center align-middle font-bold text-slate-700 text-lg">{item.quantity}</td>
                                    <td className="py-4 px-4 text-right align-middle text-slate-600 font-mono">{item.price_at_order.toFixed(2)}€</td>
                                    <td className="py-4 pl-4 text-right align-middle font-bold text-slate-900 font-mono">{(item.price_at_order * item.quantity).toFixed(2)}€</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </main>

            {/* FOOTER TOTALS */}
            <footer className="mt-8 border-t-2 border-slate-800 pt-6 flex justify-between items-start">
                <div className="text-xs text-slate-400">
                    <p>Σας ευχαριστούμε για την παραγγελία σας.</p>
                </div>
                <div className="w-72 space-y-3">
                    <div className="flex justify-between items-center text-slate-600 font-medium">
                        <span>Μερικό Σύνολο:</span>
                        <span className="font-mono">{order.total_price.toFixed(2)}€</span>
                    </div>
                    {/* Add VAT or other fields if needed in the future */}
                    <div className="flex justify-between items-center text-slate-900 font-black text-2xl pt-2 border-t border-slate-200">
                        <span>Τελικο Συνολο:</span>
                        <span className="font-mono">{order.total_price.toFixed(2)}€</span>
                    </div>
                </div>
            </footer>
        </div>
    );
}