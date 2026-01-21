
import React, { useEffect, useState } from 'react';
import { Order, Product, Customer } from '../types';
import { APP_LOGO } from '../constants';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/supabase';
import QRCode from 'qrcode';
import { ImageIcon, Phone, MapPin, StickyNote, Calendar, Hash, User } from 'lucide-react';
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
    
    // Dynamic VAT Calculation based on stored rate or default 24%
    const vatRate = order.vat_rate !== undefined ? order.vat_rate : 0.24;
    const subtotal = order.items.reduce((acc, item) => acc + (item.price_at_order * item.quantity), 0);
    const discountPercent = order.discount_percent || 0;
    const discountAmount = subtotal * (discountPercent / 100);
    const netAmount = subtotal - discountAmount;
    const vatAmount = netAmount * vatRate;
    const grandTotal = netAmount + vatAmount;

    const company = {
        name: "ILIOS KOSMIMA",
        address: "Αβέρωφ 73, Κορυδαλλός, 18120",
        phone: "2104905405",
        email: "ilioskosmima@gmail.com"
    };

    return (
        <div className="bg-white text-black font-sans w-[210mm] min-h-[297mm] p-6 mx-auto shadow-lg print:shadow-none print:p-6 page-break-after-always flex flex-col">
            
            {/* COMPACT HEADER */}
            <div className="flex justify-between items-end border-b-2 border-slate-900 pb-2 mb-3 shrink-0">
                <div className="flex items-center gap-3">
                    <img src={APP_LOGO} alt="ILIOS" className="h-8 w-auto object-contain" />
                    <div className="text-[7px] text-slate-500 leading-tight border-l border-slate-300 pl-2">
                        <p className="font-bold text-slate-900 uppercase tracking-wide">{company.name}</p>
                        <p>{company.address}</p>
                        <p>{company.email} • {company.phone}</p>
                    </div>
                </div>
                
                <div className="text-right">
                    <h1 className="text-lg font-black text-slate-900 uppercase tracking-tight leading-none mb-0.5">Παραστατικο Παραγγελιας</h1>
                    <div className="flex items-center justify-end gap-3 text-[9px] text-slate-600 font-medium">
                        <span className="flex items-center gap-1"><Hash size={9}/> {order.id.slice(0, 12)}</span>
                        <span className="text-slate-300">|</span>
                        <span className="flex items-center gap-1"><Calendar size={9}/> {formatDate(order.created_at)}</span>
                    </div>
                </div>
            </div>
            
            {/* SUPER COMPACT INFO BAR */}
            <div className="flex gap-4 mb-4 shrink-0 bg-slate-50 rounded-lg border border-slate-200 p-2">
                {/* Client Info */}
                <div className="flex-1 flex flex-col justify-center">
                    <div className="flex items-baseline gap-2 mb-0.5">
                        <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Πελατης</span>
                        <span className="font-black text-slate-900 text-sm leading-none">{customer?.full_name || order.customer_name}</span>
                    </div>
                    <div className="flex items-center gap-3 text-[9px] text-slate-600">
                        {(customer?.phone || order.customer_phone) && (
                            <span className="flex items-center gap-1"><Phone size={9} className="text-slate-400"/> {customer?.phone || order.customer_phone}</span>
                        )}
                        {customer?.address && (
                            <span className="flex items-center gap-1"><MapPin size={9} className="text-slate-400"/> {customer.address}</span>
                        )}
                        {customer?.vat_number && (
                            <span className="font-mono text-slate-500">AΦΜ: {customer.vat_number}</span>
                        )}
                    </div>
                </div>

                {/* Vertical Divider */}
                <div className="w-px bg-slate-200 my-0.5"></div>

                {/* Total Info */}
                <div className="flex flex-col justify-center items-end px-2 min-w-[120px]">
                    <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Συνολο</span>
                    <span className="font-black text-xl text-slate-900 leading-none">{grandTotal.toFixed(2).replace('.', ',')}€</span>
                </div>
            </div>


            {/* DENSE ITEMS TABLE */}
            <main className="flex-1 min-h-0">
                <table className="w-full text-left border-collapse text-[10px]">
                    <thead>
                        <tr className="border-b-2 border-slate-900 text-slate-600 uppercase font-bold tracking-wider text-[8px]">
                            <th className="py-1 pr-1 w-6 text-center">#</th>
                            <th className="py-1 px-1 w-8">Eik.</th>
                            <th className="py-1 px-1">Περιγραφη / Κωδικος</th>
                            <th className="py-1 px-1 text-center w-12">Ποσ.</th>
                            <th className="py-1 px-1 text-right w-16">Τιμη</th>
                            <th className="py-1 pl-1 text-right w-20">Συνολο</th>
                        </tr>
                    </thead>
                    <tbody className="align-top">
                        {order.items.map((item, index) => {
                            const product = allProducts?.find(p => p.sku === item.sku);
                            const variant = product?.variants?.find(v => v.suffix === item.variant_suffix);

                            const fullSku = item.sku + (item.variant_suffix || '');
                            const imageUrl = product?.image_url;
                            const description = variant?.description || product?.category || 'Προϊόν';

                            return (
                                <tr key={index} className="border-b border-slate-100 break-inside-avoid">
                                    <td className="py-1.5 pr-1 text-center text-slate-400 font-mono align-middle">{index + 1}</td>
                                    <td className="py-1.5 px-1 align-middle">
                                        <div className="w-6 h-6 bg-slate-50 rounded overflow-hidden border border-slate-200 mx-auto flex items-center justify-center">
                                            {imageUrl ? (
                                                <img src={imageUrl} alt={item.sku} className="w-full h-full object-cover" />
                                            ) : (
                                                <ImageIcon size={10} className="text-slate-300" />
                                            )}
                                        </div>
                                    </td>
                                    <td className="py-1.5 px-1 align-middle">
                                        <div className="flex flex-col">
                                            <div className="flex items-baseline gap-1">
                                                <span className="font-bold text-slate-900">{fullSku}</span>
                                                {item.size_info && <span className="text-[8px] bg-slate-100 px-1 rounded text-slate-600 border border-slate-200 font-bold">{item.size_info}</span>}
                                            </div>
                                            <span className="text-[9px] text-slate-500 truncate max-w-[250px]">{description}</span>
                                            {item.notes && (
                                                <div className="text-[8px] text-emerald-700 italic flex items-center gap-0.5 mt-0.5">
                                                    <StickyNote size={8}/> {item.notes}
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                    <td className="py-1.5 px-1 text-center align-middle font-bold text-slate-800 text-xs">{item.quantity}</td>
                                    <td className="py-1.5 px-1 text-right align-middle text-slate-600 font-mono">{item.price_at_order.toFixed(2).replace('.', ',')}</td>
                                    <td className="py-1.5 pl-1 text-right align-middle font-black text-slate-900 font-mono">{(item.price_at_order * item.quantity).toFixed(2).replace('.', ',')}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </main>

            {/* COMPACT FOOTER */}
            <footer className="mt-2 pt-2 border-t-2 border-slate-900 flex justify-between items-start shrink-0">
                <div className="text-[8px] text-slate-500 max-w-xs leading-snug">
                    <p className="font-bold uppercase text-slate-400 mb-0.5">Σημειώσεις</p>
                    <p className="italic bg-slate-50 p-1.5 rounded border border-slate-100">{order.notes || "Δεν υπάρχουν σημειώσεις για αυτή την παραγγελία."}</p>
                </div>
                
                <div className="w-48 text-[10px]">
                    <div className="flex justify-between items-center text-slate-600 mb-0.5">
                        <span>Καθαρή Αξία:</span>
                        <span className="font-mono font-bold">{subtotal.toFixed(2).replace('.', ',')}€</span>
                    </div>
                    {discountAmount > 0 && (
                        <div className="flex justify-between items-center text-rose-600 mb-0.5">
                            <span>Έκπτωση ({discountPercent}%):</span>
                            <span className="font-mono font-bold">-{discountAmount.toFixed(2).replace('.', ',')}€</span>
                        </div>
                    )}
                    <div className="flex justify-between items-center text-slate-600 mb-1 pb-1 border-b border-slate-200">
                        <span>Φ.Π.Α. ({(vatRate * 100).toFixed(0)}%):</span>
                        <span className="font-mono font-bold">{vatAmount.toFixed(2).replace('.', ',')}€</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-900 font-black text-sm">
                        <span className="uppercase">Γενικο Συνολο:</span>
                        <span className="font-mono">{grandTotal.toFixed(2).replace('.', ',')}€</span>
                    </div>
                </div>
            </footer>
             <div className="mt-4 text-center text-[7px] text-slate-300 uppercase tracking-widest">
                System Generated • Ilios Kosmima ERP • {new Date().toLocaleTimeString()}
            </div>
        </div>
    );
}