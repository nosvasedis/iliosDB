
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
        <div className="bg-white text-black font-sans w-[210mm] min-h-[297mm] p-8 mx-auto shadow-lg print:shadow-none print:p-10 page-break-after-always">
            {/* HEADER */}
            <header className="flex justify-between items-start mb-10">
                <div className="w-40">
                    <img src={APP_LOGO} alt="ILIOS" className="w-full object-contain" />
                    <div className="text-[9px] text-slate-600 mt-2 space-y-0.5">
                        <p>{company.address}</p>
                        <p>Τηλ: {company.phone}</p>
                    </div>
                </div>
                
                <div className="text-right">
                    <h1 className="text-3xl font-black text-slate-800 uppercase tracking-tight">Παραστατικο Παραγγελιας</h1>
                    <p className="text-slate-700 font-mono font-bold text-lg mt-1">#{order.id}</p>
                </div>
            </header>
            
            {/* INFO SECTION */}
            <section className="grid grid-cols-2 gap-8 mb-8">
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                    <h3 className="text-[10px] font-bold text-slate-600 uppercase tracking-wide mb-2">Στοιχεια Πελατη</h3>
                    <p className="text-lg font-bold text-slate-800">{customer?.full_name || order.customer_name}</p>
                    {customer?.address && <p className="text-slate-700 text-sm mt-1 flex items-center gap-2"><MapPin size={12}/> {customer.address}</p>}
                    {(customer?.phone || order.customer_phone) && <p className="text-slate-700 text-sm mt-1 flex items-center gap-2"><Phone size={12}/> {customer?.phone || order.customer_phone}</p>}
                    {customer?.email && <p className="text-slate-700 text-sm mt-1 flex items-center gap-2"><Mail size={12}/> {customer.email}</p>}
                    {customer?.vat_number && <p className="text-slate-700 text-sm mt-1">ΑΦΜ: {customer.vat_number}</p>}
                </div>
                 <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 text-right">
                    <h3 className="text-[10px] font-bold text-slate-600 uppercase tracking-wide mb-2">Ημερομηνιες</h3>
                    <p className="font-semibold text-slate-800">Ημ/νία Παραγγελίας:</p>
                    <p className="text-slate-700 mb-2">{formatDate(order.created_at)}</p>
                </div>
            </section>


            {/* ITEMS TABLE */}
            <main className="flex-1">
                <table className="w-full text-left border-collapse text-xs">
                    <thead>
                        <tr className="border-b-2 border-slate-800 text-slate-800 uppercase font-black tracking-wider">
                            <th className="py-2 pr-2 w-8 text-center">#</th>
                            <th className="py-2 px-2 w-16">Εικόνα</th>
                            <th className="py-2 px-2">Περιγραφή</th>
                            <th className="py-2 px-2 text-center w-20">Ποσότητα</th>
                            <th className="py-2 px-2 text-right w-24">Τιμή Μον.</th>
                            <th className="py-2 pl-2 text-right w-28">Σύνολο</th>
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
                                    <td className="py-3 pr-2 text-center text-slate-600 font-bold">{index + 1}</td>
                                    <td className="py-3 px-2">
                                        <div className="w-12 h-12 bg-slate-100 rounded-md overflow-hidden border border-slate-200">
                                            {imageUrl ? (
                                                <img src={imageUrl} alt={item.sku} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-slate-300">
                                                    <ImageIcon size={18} />
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                    <td className="py-3 px-2 align-top">
                                        <div className="font-bold text-slate-800 text-sm flex items-center gap-1">
                                            {fullSku}
                                            {item.size_info && <span className="text-xs font-normal text-slate-600 bg-slate-100 px-1.5 rounded">({item.size_info})</span>}
                                        </div>
                                        <div className="text-slate-700 text-xs mt-0.5">{description}</div>
                                        {item.notes && (
                                            <div className="mt-1 flex items-center gap-1 text-emerald-700 font-bold italic text-[10px]">
                                                <StickyNote size={10}/> {item.notes}
                                            </div>
                                        )}
                                        <div className="mt-1">
                                            <QRCodeImage sku={fullSku} />
                                        </div>
                                    </td>
                                    <td className="py-3 px-2 text-center align-middle font-bold text-slate-800 text-base">{item.quantity}</td>
                                    <td className="py-3 px-2 text-right align-middle text-slate-800 font-mono">{item.price_at_order.toFixed(2).replace('.', ',')}€</td>
                                    <td className="py-3 pl-2 text-right align-middle font-bold text-slate-900 font-mono">{(item.price_at_order * item.quantity).toFixed(2).replace('.', ',')}€</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </main>

            {/* FOOTER */}
            <footer className="mt-8 pt-6 border-t border-slate-200 flex justify-between items-start">
                <div className="text-[9px] text-slate-700 max-w-xs">
                    <h4 className="font-bold text-slate-600 mb-1">Σημειώσεις</h4>
                    <p>{order.notes || "Καμία σημείωση."}</p>
                </div>
                <div className="w-64 space-y-2 text-sm">
                    <div className="flex justify-between items-center text-slate-800 font-medium">
                        <span>Καθαρή Αξία:</span>
                        <span className="font-mono">{subtotal.toFixed(2).replace('.', ',')}€</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-800 font-medium">
                        <span>Φ.Π.Α. (24%):</span>
                        <span className="font-mono">{vatAmount.toFixed(2).replace('.', ',')}€</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-900 font-black text-xl pt-2 border-t border-slate-300 mt-2">
                        <span>Γενικό Σύνολο:</span>
                        <span className="font-mono">{grandTotal.toFixed(2).replace('.', ',')}€</span>
                    </div>
                </div>
            </footer>
             <div className="mt-10 text-center text-[8px] text-slate-600 border-t border-slate-100 pt-2">
                ILIOS KOSMIMA ERP - Σας ευχαριστούμε για τη συνεργασία.
            </div>
        </div>
    );
}
