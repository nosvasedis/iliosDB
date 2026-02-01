
import React from 'react';
import { SupplierOrder, Product, Gender } from '../types';
import { APP_LOGO } from '../constants';
import { ImageIcon } from 'lucide-react';
import { getVariantComponents } from '../utils/pricingEngine';

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
                th, td { padding-top: 6px; padding-bottom: 6px; }
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
                            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Αρ. Εντολής</span>
                            <span className="font-mono font-bold bg-slate-100 px-2 py-0.5 rounded">#{order.id.slice(0, 8).toUpperCase()}</span>
                        </div>
                        <div className="flex items-center justify-end gap-2">
                            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Ημερομηνία</span>
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
            </div>

            {/* ITEMS TABLE */}
            <main className="flex-1">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b-2 border-slate-800 text-[10px] font-black text-slate-600 uppercase tracking-wider">
                            <th className="px-2 w-16 text-center">Εικόνα</th>
                            <th className="px-2 w-32 bg-slate-100 text-slate-900 border-l border-r border-slate-200">Κωδ. Προμηθευτη</th>
                            <th className="px-2">Περιγραφη & Λεπτομερειες</th>
                            <th className="px-2 text-center w-20">Ποσοτητα</th>
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
                            let mainDescription = item.item_name; // Default to stored name (e.g. SKU+Suffix)
                            let detailLine = '';
                            let imageUrl = null;

                            if (product) {
                                // Prefer Supplier's SKU if available
                                supplierSku = product.supplier_sku || product.sku;
                                imageUrl = product.image_url;
                                
                                const category = product.category;
                                
                                // Extract finish info from suffix using the full stored name
                                // item.item_name should be something like "DA1102XKO"
                                let suffixStr = '';
                                if (item.item_name.startsWith(product.sku)) {
                                    suffixStr = item.item_name.slice(product.sku.length);
                                }
                                
                                const { finish, stone } = getVariantComponents(suffixStr, product.gender || Gender.Unisex);
                                
                                // Build readable description
                                let finishDesc = 'Λουστρέ';
                                if (finish.name) finishDesc = finish.name;
                                
                                let stoneDesc = '';
                                if (stone.name) stoneDesc = ` • ${stone.name}`;
                                
                                mainDescription = `${category}`;
                                detailLine = `${finishDesc}${stoneDesc}`;
                                
                            } else {
                                // Fallback if product not found (e.g. Material)
                                if (item.item_type === 'Material') {
                                    mainDescription = item.item_name;
                                    detailLine = 'Υλικό';
                                }
                            }

                            return (
                                <tr key={idx} className="border-b border-slate-100 break-inside-avoid">
                                    <td className="px-2 align-middle text-center">
                                        <div className="w-12 h-12 bg-slate-50 border border-slate-200 rounded mx-auto overflow-hidden flex items-center justify-center">
                                            {imageUrl ? (
                                                <img src={imageUrl} className="w-full h-full object-cover" alt="prod" />
                                            ) : (
                                                <ImageIcon size={18} className="text-slate-300"/>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-2 align-middle bg-slate-50 border-l border-r border-slate-100">
                                        <span className="font-mono font-black text-sm text-slate-900 block">{supplierSku}</span>
                                        {/* Show internal SKU as reference in small print */}
                                        <span className="text-[9px] text-slate-400 block mt-1">Ref: {item.item_name}</span>
                                    </td>
                                    <td className="px-2 align-middle">
                                        <div className="font-bold text-slate-800 text-sm">{mainDescription}</div>
                                        <div className="text-[10px] text-slate-500 font-bold uppercase mt-1 tracking-wide">{detailLine}</div>
                                        {item.notes && (
                                            <div className="mt-1 bg-yellow-50 p-1.5 rounded border border-yellow-100 text-[10px] text-yellow-800 font-bold italic inline-block">
                                                Σημείωση: {item.notes}
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-2 align-middle text-center">
                                        <div className="inline-block px-4 py-2 rounded bg-slate-900 text-white font-black text-lg shadow-sm">
                                            {item.quantity}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </main>

            {/* FOOTER */}
            <div className="mt-8 border-t-2 border-slate-900 pt-4">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Γενικές Σημειώσεις</p>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-sm italic text-slate-600 min-h-[60px]">
                    {order.notes || "Δεν υπάρχουν επιπλέον σημειώσεις."}
                </div>
            </div>
            
            <div className="mt-8 text-center text-[8px] text-slate-300 uppercase tracking-widest">
                Ilios Kosmima ERP • Generated Purchase Order
            </div>
        </div>
    );
}
