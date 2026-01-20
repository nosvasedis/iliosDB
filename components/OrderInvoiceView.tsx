
import React, { useEffect, useState } from 'react';
import { Order, Product, Customer } from '../types';
import { APP_LOGO } from '../constants';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/supabase';
import QRCode from 'qrcode';
import { ImageIcon, Phone, Mail, MapPin, StickyNote } from 'lucide-react';
import { transliterateForBarcode } from '../utils/pricingEngine';

interface Props {
    order: Order;
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


export default function OrderInvoiceView({ order }: Props) {
    const { data: allProducts } = useQuery<Product[]>({ queryKey: ['products'], queryFn: api.getProducts });
    const queryClient = useQueryClient();
    const allCustomers = queryClient.getQueryData<Customer[]>(['customers']);
    const customer = order.customer_id
        ? allCustomers?.find(c => c.id === order.customer_id)
        : allCustomers?.find(c => c.full_name === order.customer_name);


    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('el-GR', {
            day: '2-digit', month: '2-digit', year: 'numeric'
        });
    };
    
    const subtotal = order.items.reduce((acc, item) => acc + (item.price_at_order * item.quantity), 0);
    const vatAmount = subtotal * 0.24;
    const grandTotal = subtotal + vatAmount;

    const company = {
        name: "ILIOS KOSMIMA",
        address: "Αβέρωφ 73, Κορυδαλλός, 18120",
        phone: "2104905405"
    };

    return (
        <div className="bg-white text-black font-sans w-[210mm] min-h-[297mm] p-8 mx-auto shadow-lg print:shadow-none print:p-8 page-break-after-always">
            {/* COMPACT HEADER */}
            <div className="flex justify-between items-end border-b-2 border-slate-800 pb-2 mb-4">
                <div className="flex items-center gap-4">
                    <img src={APP_LOGO} alt="ILIOS" className="h-10 w-auto object-contain" />
                    <div className="text-[8px] text-slate-600 leading-tight border-l border-slate-300 pl-3">
                        <p className="font-bold text-slate-900">{company.name}</p>
                        <p>{company.address}</p>
                        <p>Τηλ: {company.phone}</p>
                    </div>
                </div>
                
                <div className="text-right">
                    <h1 className="text-xl font-black text-slate-800 uppercase tracking-tight leading-none">Παραστατικο Παραγγελιας</h1>
                    <div className="flex items-center justify-end gap-3 mt-1 text-[10px]">
                        <span className="font-mono font-bold text-slate-600">#{order.id}</span>
                        <span className="text-slate-400">|</span>
                        <span className="font-bold text-slate-800">{formatDate(order.created_at)}</span>
                    </div>
                </div>
            </div>
            
            {/* COMPACT INFO SECTION */}
            <section className="flex gap-4 mb-6 text-xs">
                <div className="flex-1 bg-slate-50 rounded-lg p-3 border border-slate-100">
                    <h3 className="text-[9px] font-bold text-slate-400 uppercase tracking-wide mb-1">Πελατης</h3>
                    <p className="font-bold text-slate-900 text-sm">{customer?.full_name || order.customer_name}</p>
                    <div className="mt-1 space-y-0.5 text-[10px] text-slate-600">
                        {customer?.address && <p className="flex items-center gap-1"><MapPin size={10}/> {customer.address}</p>}
                        {(customer?.phone || order.customer_phone) && <p className="flex items-center gap-1"><Phone size={10}/> {customer?.phone || order.customer_phone}</p>}
                        {customer?.vat_number && <p>ΑΦΜ: {customer.vat_number}</p>}
                    </div>
                </div>
                 <div className="w-1/3 bg-white rounded-lg p-3 border border-slate-200 text-right flex flex-col justify-center">
                    <p className="text-[9px] font-bold text-slate-400 uppercase">Συνολο Παραγγελιας</p>
                    <p className="text-xl font-black text-slate-900 font-mono">{grandTotal.toFixed(2).replace('.', ',')}€</p>
                </div>
            </section>


            {/* ITEMS TABLE */}
            <main className="flex-1">
                <table className="w-full text-left border-collapse text-xs">
                    <thead>
                        <tr className="border-b-2 border-slate-800 text-slate-800 uppercase font-black tracking-wider text-[10px]">
                            <th className="py-1 pr-2 w-8 text-center">#</th>
                            <th className="py-1 px-2 w-12">Εικόνα</th>
                            <th className="py-1 px-2">Περιγραφή</th>
                            <th className="py-1 px-2 text-center w-16">Ποσότητα</th>
                            <th className="py-1 px-2 text-right w-20">Τιμή Μον.</th>
                            <th className="py-1 pl-2 text-right w-24">Σύνολο</th>
                        </tr>
                    </thead>
                    <tbody>
                        {order.items.map((item, index) => {
                            const product = allProducts?.find(p => p.sku === item.sku);
                            const variant = product?.variants?.find(v => v.suffix === item.variant_suffix);

                            const fullSku = item.sku + (item.variant_suffix || '');
                            const imageUrl = product?.image_url;
                            const description = variant?.description || product?.category || 'Προϊόν';

                            return (
                                <tr key={index} className="border-b border-slate-100 break-inside-avoid">
                                    <td className="py-2 pr-2 text-center text-slate-500 font-bold text-[10px]">{index + 1}</td>
                                    <td className="py-2 px-2">
                                        <div className="w-8 h-8 bg-slate-100 rounded overflow-hidden border border-slate-200 mx-auto">
                                            {imageUrl ? (
                                                <img src={imageUrl} alt={item.sku} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-slate-300">
                                                    <ImageIcon size={14} />
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                    <td className="py-2 px-2 align-top">
                                        <div className="font-bold text-slate-800 text-sm flex items-center gap-1 leading-none">
                                            {fullSku}
                                            {item.size_info && <span className="text-[10px] font-normal text-slate-600 bg-slate-100 px-1 rounded border border-slate-200">{item.size_info}</span>}
                                        </div>
                                        <div className="text-slate-500 text-[10px] mt-0.5">{description}</div>
                                        {item.notes && (
                                            <div className="mt-0.5 flex items-center gap-1 text-emerald-700 font-bold italic text-[9px]">
                                                <StickyNote size={8}/> {item.notes}
                                            </div>
                                        )}
                                    </td>
                                    <td className="py-2 px-2 text-center align-middle font-bold text-slate-800 text-sm">{item.quantity}</td>
                                    <td className="py-2 px-2 text-right align-middle text-slate-600 font-mono text-xs">{item.price_at_order.toFixed(2).replace('.', ',')}€</td>
                                    <td className="py-2 pl-2 text-right align-middle font-bold text-slate-900 font-mono text-sm">{(item.price_at_order * item.quantity).toFixed(2).replace('.', ',')}€</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </main>

            {/* COMPACT FOOTER */}
            <footer className="mt-6 pt-4 border-t border-slate-200 flex justify-between items-start">
                <div className="text-[8px] text-slate-500 max-w-xs">
                    <p className="font-bold uppercase mb-1">Σημειώσεις</p>
                    <p className="italic">{order.notes || "-"}</p>
                </div>
                <div className="w-56 space-y-1 text-xs">
                    <div className="flex justify-between items-center text-slate-600">
                        <span>Καθαρή Αξία:</span>
                        <span className="font-mono">{subtotal.toFixed(2).replace('.', ',')}€</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-600 pb-1 border-b border-slate-200">
                        <span>Φ.Π.Α. (24%):</span>
                        <span className="font-mono">{vatAmount.toFixed(2).replace('.', ',')}€</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-900 font-black text-lg mt-1">
                        <span>Σύνολο:</span>
                        <span className="font-mono">{grandTotal.toFixed(2).replace('.', ',')}€</span>
                    </div>
                </div>
            </footer>
             <div className="mt-6 text-center text-[7px] text-slate-400 uppercase tracking-widest">
                ILIOS KOSMIMA ERP
            </div>
        </div>
    );
}
