
import React from 'react';
import { SupplierOrder, Product } from '../types';
import { APP_LOGO } from '../constants';
import { formatCurrency, getVariantComponents } from '../utils/pricingEngine';
import { Phone, Mail, MapPin, Hash, Calendar, Box, Package } from 'lucide-react';

interface Props {
    order: SupplierOrder;
    products: Product[];
}

export default function SupplierOrderPrintView({ order, products }: Props) {
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

    return (
        <div className="bg-white text-black font-sans w-[210mm] min-h-[297mm] p-8 mx-auto shadow-lg print:shadow-none print:p-8 page-break-after-always relative flex flex-col">
            <style>{`
                @page { size: A4; margin: 0; }
                .break-avoid { break-inside: avoid; }
            `}</style>

            {/* HEADER */}
            <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4 mb-6">
                <div>
                    <img src={APP_LOGO} alt="ILIOS" className="h-12 object-contain mb-2" />
                    <div className="text-[9px] text-slate-600 space-y-0.5">
                        <p className="font-bold text-slate-900 uppercase">{company.name}</p>
                        <p>{company.address}</p>
                        <p>{company.phone} • {company.email}</p>
                    </div>
                </div>
                <div className="text-right">
                    <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tight mb-2">ΕΝΤΟΛΗ ΑΓΟΡΑΣ</h1>
                    <div className="text-sm font-medium space-y-1">
                        <div className="flex items-center justify-end gap-2">
                            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">PO Number</span>
                            <span className="font-mono font-bold bg-slate-100 px-2 py-0.5 rounded">#{order.id.slice(0, 8).toUpperCase()}</span>
                        </div>
                        <div className="flex items-center justify-end gap-2">
                            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Date</span>
                            <span className="font-bold">{formatDate(order.created_at)}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* SUPPLIER INFO */}
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 mb-8 flex justify-between items-center">
                <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Προμηθευτης</span>
                    <h2 className="text-xl font-black text-slate-900">{order.supplier_name}</h2>
                </div>
                <div className="text-right space-y-1">
                    <div className="flex items-center justify-end gap-2 text-xs text-slate-600 font-medium">
                        <span className="bg-white px-2 py-1 rounded border border-slate-100 shadow-sm">Supplier ID: {order.supplier_id.slice(0,8)}</span>
                    </div>
                </div>
            </div>

            {/* ITEMS TABLE */}
            <main className="flex-1">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b-2 border-slate-800 text-[9px] font-black text-slate-600 uppercase tracking-wider">
                            <th className="py-2 px-2 text-center w-12">Img</th>
                            <th className="py-2 px-2 w-32 bg-slate-100 text-slate-900">Κωδ. Προμηθευτη</th>
                            <th className="py-2 px-2">Περιγραφη & Τεχνικα</th>
                            <th className="py-2 px-2 text-center w-20">Ποσοτητα</th>
                            <th className="py-2 px-2 text-right w-24">Τιμη Μον.</th>
                            <th className="py-2 px-2 text-right w-24">Συνολο</th>
                        </tr>
                    </thead>
                    <tbody className="text-xs">
                        {order.items.map((item, idx) => {
                            // Resolve Product Details for rich display
                            let product: Product | undefined;
                            if (item.item_type === 'Product') {
                                product = products.find(p => p.sku === item.item_id);
                            }

                            // Determine Display Data
                            let supplierSku = '-';
                            let description = item.item_name;
                            let details = '';
                            let imageUrl = null;

                            if (product) {
                                // Prefer Supplier's SKU if available
                                supplierSku = product.supplier_sku || '-';
                                imageUrl = product.image_url;
                                
                                // Variant analysis
                                // Assuming item_name might contain variant info, or we derive it if we tracked variant suffix in PO items
                                // Note: SupplierOrderItem doesn't strictly store suffix, usually it's embedded in item_id or name
                                // For better parsing, let's assume item_id for products is "SKU" or "SKU-SUFFIX"
                                
                                const category = product.category;
                                const plating = product.plating_type;
                                
                                // Try to extract variant from item_name if it differs from product sku
                                let variantDesc = '';
                                if (item.item_name !== product.sku) {
                                     // Heuristic: If item name is longer than SKU, it might have variant info
                                     variantDesc = item.item_name.replace(product.sku, '').trim();
                                }
                                
                                description = `${product.sku} ${variantDesc}`;
                                details = `${category} • ${plating}`;
                                
                                // Add Stones/Metal info if possible
                                if (product.variants) {
                                    // Try to match variant
                                }
                            }

                            return (
                                <tr key={idx} className="border-b border-slate-100 break-inside-avoid">
                                    <td className="py-3 px-2 align-middle text-center">
                                        <div className="w-10 h-10 bg-slate-50 border border-slate-200 rounded mx-auto overflow-hidden flex items-center justify-center">
                                            {imageUrl ? (
                                                <img src={imageUrl} className="w-full h-full object-cover" />
                                            ) : (
                                                <Box size={14} className="text-slate-300"/>
                                            )}
                                        </div>
                                    </td>
                                    <td className="py-3 px-2 align-middle bg-slate-50">
                                        <span className="font-mono font-black text-sm text-slate-900">{supplierSku}</span>
                                    </td>
                                    <td className="py-3 px-2 align-middle">
                                        <div className="font-bold text-slate-800">{description}</div>
                                        <div className="text-[10px] text-slate-500 uppercase font-medium mt-0.5">{details}</div>
                                        {item.notes && <div className="text-[9px] text-indigo-600 italic mt-1">Simiosi: {item.notes}</div>}
                                    </td>
                                    <td className="py-3 px-2 align-middle text-center">
                                        <div className="inline-block px-3 py-1 rounded bg-slate-100 font-bold text-slate-800 border border-slate-200">
                                            {item.quantity}
                                        </div>
                                    </td>
                                    <td className="py-3 px-2 align-middle text-right font-mono text-slate-600">
                                        {formatCurrency(item.unit_cost)}
                                    </td>
                                    <td className="py-3 px-2 align-middle text-right font-black text-slate-900 font-mono">
                                        {formatCurrency(item.total_cost)}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </main>

            {/* FOOTER */}
            <div className="mt-8 border-t-2 border-slate-900 pt-4 flex justify-between items-start">
                <div className="w-1/2">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2">Σημειωσεις / Οδηγιες</p>
                    <div className="bg-slate-50 p-3 rounded border border-slate-100 text-xs italic text-slate-600 min-h-[60px]">
                        {order.notes || "No additional notes."}
                    </div>
                </div>
                <div className="w-1/3">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-bold text-slate-500 uppercase">Συνολο Τεμαχιων</span>
                        <span className="font-bold text-slate-800">{order.items.reduce((a,b)=>a+b.quantity,0)}</span>
                    </div>
                    <div className="flex justify-between items-center text-xl font-black text-slate-900 pt-2 border-t border-slate-200">
                        <span>ΓΕΝΙΚΟ ΣΥΝΟΛΟ</span>
                        <span>{formatCurrency(order.total_amount)}</span>
                    </div>
                </div>
            </div>
            
            <div className="mt-8 text-center text-[8px] text-slate-300 uppercase tracking-widest">
                Ilios Kosmima ERP • Purchase Order System
            </div>
        </div>
    );
}
