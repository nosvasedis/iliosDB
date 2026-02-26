
import React, { useEffect, useState } from 'react';
import { Order, Product, Customer, GlobalSettings } from '../types';
import { APP_LOGO } from '../constants';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/supabase';
import QRCode from 'qrcode';
import { ImageIcon, Phone, MapPin, StickyNote, Calendar, Hash, User, Weight, Coins } from 'lucide-react';
import { transliterateForBarcode, formatDecimal } from '../utils/pricingEngine';

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
    const { data: settings } = useQuery<GlobalSettings>({ queryKey: ['settings'], queryFn: api.getSettings });
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

    const silverPrice = order.custom_silver_rate || settings?.silver_price_gram || 0;

    // Calculate Total Silver Weight
    const totalSilverWeight = order.items.reduce((acc, item) => {
        const product = allProducts?.find(p => p.sku === item.sku);
        const weightPerItem = product ? (product.weight_g + (product.secondary_weight_g || 0)) : 0;
        return acc + (weightPerItem * item.quantity);
    }, 0);

    const company = {
        name: "ILIOS KOSMIMA",
        address: "Αβέρωφ 73, Κορυδαλλός, 18120",
        phone: "2104905405",
        email: "ilioskosmima@gmail.com"
    };

    return (
        <div className="bg-white text-black font-sans w-[210mm] min-h-[297mm] p-6 mx-auto shadow-lg print:shadow-none print:p-6 page-break-after-always flex flex-col relative">
            
            {/* COMPACT HEADER */}
            <div className="flex justify-between items-end border-b-2 border-slate-900 pb-2 mb-3 shrink-0">
                <div className="flex items-center gap-3">
                    <img src={APP_LOGO} alt="ILIOS" className="h-9 w-auto object-contain" />
                    <div className="text-[8px] text-slate-600 leading-tight border-l border-slate-300 pl-2">
                        <p className="font-bold text-slate-900 uppercase tracking-wide">{company.name}</p>
                        <p>{company.address}</p>
                        <p>{company.email} • {company.phone}</p>
                    </div>
                </div>
                
                <div className="text-right">
                    <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight leading-none mb-0.5">Παραστατικο Παραγγελιας</h1>
                    <div className="flex items-center justify-end gap-3 text-[10px] text-slate-700 font-medium">
                        <span className="flex items-center gap-1"><Hash size={10}/> {order.id.slice(0, 12)}</span>
                        <span className="text-slate-300">|</span>
                        <span className="flex items-center gap-1"><Calendar size={10}/> {formatDate(order.created_at)}</span>
                    </div>
                </div>
            </div>
            
            {/* SUPER COMPACT INFO BAR */}
            <div className="flex gap-4 mb-3 shrink-0 bg-slate-50 rounded-lg border border-slate-200 p-2">
                {/* Client Info */}
                <div className="flex-1 flex flex-col justify-center">
                    <div className="flex items-baseline gap-2 mb-0.5">
                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Πελατης</span>
                        <span className="font-black text-slate-900 text-sm leading-none">{customer?.full_name || order.customer_name}</span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-slate-700">
                        {(customer?.phone || order.customer_phone) && (
                            <span className="flex items-center gap-1"><Phone size={10} className="text-slate-400"/> {customer?.phone || order.customer_phone}</span>
                        )}
                        {customer?.address && (
                            <span className="flex items-center gap-1"><MapPin size={10} className="text-slate-400"/> {customer.address}</span>
                        )}
                        {customer?.vat_number && (
                            <span className="font-mono text-slate-600">AΦΜ: {customer.vat_number}</span>
                        )}
                    </div>
                </div>

                {/* Vertical Divider */}
                <div className="w-px bg-slate-200 my-0.5"></div>

                {/* Total Info */}
                <div className="flex flex-col justify-center items-end px-2 min-w-[120px]">
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Συνολο</span>
                    <span className="font-black text-xl text-slate-900 leading-none">{grandTotal.toFixed(2).replace('.', ',')}€</span>
                    <div className="text-[8px] text-slate-500 font-bold uppercase mt-1 flex items-center gap-1">
                        <Coins size={8}/> Ag: {formatDecimal(silverPrice, 2)} €/g
                    </div>
                </div>
            </div>

            {/* DUAL COLUMN ITEMS GRID */}
            <main className="flex-1 min-h-0 relative">
                
                {/* Header Row (Duplicated for 2 Columns) */}
                <div className="flex border-b-2 border-slate-800 pb-1 mb-1 text-[10px] font-black text-slate-700 uppercase tracking-wider">
                    {/* Left Column Header */}
                    <div className="flex-1 flex items-center pr-3">
                        <div className="w-6 text-center text-slate-400">#</div>
                        <div className="w-8 text-center">Eik.</div>
                        <div className="flex-1 px-1">Περιγραφη</div>
                        <div className="w-8 text-center">Ποσ.</div>
                        <div className="w-12 text-right">Τιμη</div>
                        <div className="w-14 text-right">Συνολο</div>
                    </div>
                    {/* Right Column Header */}
                    <div className="flex-1 flex items-center pl-3 border-l border-slate-300">
                         <div className="w-6 text-center text-slate-400">#</div>
                        <div className="w-8 text-center">Eik.</div>
                        <div className="flex-1 px-1">Περιγραφη</div>
                        <div className="w-8 text-center">Ποσ.</div>
                        <div className="w-12 text-right">Τιμη</div>
                        <div className="w-14 text-right">Συνολο</div>
                    </div>
                </div>

                {/* Items Grid */}
                <div className="grid grid-cols-2 text-[12px] leading-snug auto-rows-min">
                    {order.items.map((item, index) => {
                        const product = allProducts?.find(p => p.sku === item.sku);
                        const variant = product?.variants?.find(v => v.suffix === item.variant_suffix);

                        const fullSku = item.sku + (item.variant_suffix || '');
                        const imageUrl = product?.image_url;
                        const description = variant?.description || product?.category || 'Προϊόν';

                        return (
                            <div 
                                key={index} 
                                className={`
                                    flex items-center py-1.5 border-b border-slate-100 break-inside-avoid
                                    ${index % 2 === 0 ? 'pr-3 border-r border-dashed border-slate-200' : 'pl-3'}
                                `}
                            >
                                {/* Index */}
                                <div className="w-6 text-center text-slate-400 text-[11px] tabular-nums">{index + 1}</div>
                                
                                {/* Image */}
                                <div className="w-8 text-center">
                                    <div className="w-6 h-6 bg-slate-50 rounded overflow-hidden border border-slate-200 mx-auto flex items-center justify-center">
                                        {imageUrl ? (
                                            <img src={imageUrl} alt={item.sku} className="w-full h-full object-cover" />
                                        ) : (
                                            <ImageIcon size={10} className="text-slate-300" />
                                        )}
                                    </div>
                                </div>

                                {/* Desc */}
                                <div className="flex-1 px-1 min-w-0">
                                    <div className="flex flex-col">
                                        <div className="flex items-baseline gap-1">
                                            <span className="font-bold text-slate-900">{fullSku}</span>
                                            {item.size_info && <span className="text-[9px] bg-slate-100 px-1 rounded text-slate-600 border border-slate-200 font-bold whitespace-nowrap">{item.size_info}</span>}
                                        </div>
                                        <span className="text-[10px] text-slate-600 truncate max-w-[200px] font-medium">{description}</span>
                                        {item.notes && (
                                            <div className="text-[9px] text-emerald-700 italic flex items-center gap-0.5 mt-0.5 leading-none font-medium">
                                                <StickyNote size={8}/> {item.notes}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Qty */}
                                <div className="w-8 text-center font-bold text-slate-800 text-[12px]">{item.quantity}</div>
                                
                                {/* Price */}
                                <div className="w-12 text-right text-slate-700 tabular-nums font-sans font-semibold text-[12px]">{item.price_at_order.toFixed(2).replace('.', ',')}</div>
                                
                                {/* Total */}
                                <div className="w-14 text-right font-black text-slate-900 tabular-nums font-sans text-[12px]">{(item.price_at_order * item.quantity).toFixed(2).replace('.', ',')}</div>
                            </div>
                        );
                    })}
                </div>
            </main>

            {/* COMPACT FOOTER */}
            <footer className="mt-2 pt-2 border-t-2 border-slate-900 flex justify-between items-start shrink-0">
                <div className="text-[9px] text-slate-600 max-w-xs leading-snug">
                    <p className="font-bold uppercase text-slate-500 mb-0.5">Σημειώσεις</p>
                    <p className="italic bg-slate-50 p-1.5 rounded border border-slate-100">{order.notes || "Δεν υπάρχουν σημειώσεις για αυτή την παραγγελία."}</p>
                </div>
                
                <div className="w-48 text-[11px]">
                    <div className="flex justify-between items-center text-slate-600 mb-0.5">
                        <span>Καθαρή Αξία:</span>
                        <span className="tabular-nums font-bold">{subtotal.toFixed(2).replace('.', ',')}€</span>
                    </div>
                    {discountAmount > 0 && (
                        <div className="flex justify-between items-center text-rose-600 mb-0.5">
                            <span>Έκπτωση ({discountPercent}%):</span>
                            <span className="tabular-nums font-bold">-{discountAmount.toFixed(2).replace('.', ',')}€</span>
                        </div>
                    )}
                    <div className="flex justify-between items-center text-slate-600 mb-1 pb-1 border-b border-slate-200">
                        <span>Φ.Π.Α. ({(vatRate * 100).toFixed(0)}%):</span>
                        <span className="tabular-nums font-bold">{vatAmount.toFixed(2).replace('.', ',')}€</span>
                    </div>
                    
                    {/* SILVER WEIGHT INDICATOR */}
                    {totalSilverWeight > 0 && (
                        <div className="flex justify-between items-center text-slate-500 mb-1 pb-1 border-b border-slate-200">
                            <span className="flex items-center gap-1"><Weight size={11}/> Βάρος (Ag):</span>
                            <span className="tabular-nums font-bold">{totalSilverWeight.toFixed(1)}g</span>
                        </div>
                    )}

                    <div className="flex justify-between items-center text-slate-900 font-black text-sm">
                        <span className="uppercase">Γενικο Συνολο:</span>
                        <span className="tabular-nums text-base">{grandTotal.toFixed(2).replace('.', ',')}€</span>
                    </div>
                </div>
            </footer>
             <div className="mt-4 text-center text-[8px] text-slate-400 uppercase tracking-widest font-bold">
                System Generated • Ilios Kosmima ERP • {new Date().toLocaleTimeString()}
            </div>
        </div>
    );
}
