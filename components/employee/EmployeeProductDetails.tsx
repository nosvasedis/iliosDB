
import React, { useMemo, useState } from 'react';
import { Product, ProductVariant, Warehouse } from '../../types';
import { X, ImageIcon, Tag, Package, ChevronLeft, Printer, ShoppingBag } from 'lucide-react';
import { formatCurrency } from '../../utils/pricingEngine';

interface Props {
    product: Product;
    onClose: () => void;
    warehouses: Warehouse[];
    setPrintItems?: (items: { product: Product; variant?: ProductVariant; quantity: number, format?: 'standard' | 'simple' | 'retail' }[]) => void;
}

export default function EmployeeProductDetails({ product, onClose, warehouses, setPrintItems }: Props) {
    const variants = product.variants || [];
    
    const sortedVariants = useMemo(() => {
        return [...variants].sort((a, b) => {
            const getPriority = (s: string) => {
                if (s === '') return 0;
                if (s.startsWith('P')) return 1;
                if (s.startsWith('D')) return 2;
                if (s.startsWith('X')) return 3;
                if (s.startsWith('H')) return 4;
                return 5;
            };
            return getPriority(a.suffix) - getPriority(b.suffix);
        });
    }, [variants]);

    const totalStock = (product.stock_qty || 0) + variants.reduce((acc, v) => acc + (v.stock_qty || 0), 0);

    const handlePrintLabel = (variant: ProductVariant | null, format: 'standard' | 'retail') => {
        if (!setPrintItems) return;
        setPrintItems([{
            product,
            variant: variant || undefined,
            quantity: 1,
            format
        }]);
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center md:p-4 bg-white md:bg-transparent">
            <div className="hidden md:block absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
            
            <div className="bg-white w-full md:max-w-4xl h-full md:h-[85vh] md:rounded-3xl shadow-2xl relative flex flex-col overflow-hidden animate-in slide-in-from-bottom-10 md:zoom-in-95">
                
                {/* Header */}
                <div className="flex justify-between items-start p-4 md:p-6 border-b border-slate-100 bg-white z-10 sticky top-0">
                    <div className="flex gap-4 md:gap-6 items-center">
                        <button onClick={onClose} className="md:hidden p-2 -ml-2 text-slate-500">
                            <ChevronLeft size={24}/>
                        </button>
                        <div className="w-16 h-16 md:w-24 md:h-24 bg-slate-50 rounded-2xl overflow-hidden border border-slate-200 shrink-0">
                            {product.image_url ? (
                                <img src={product.image_url} className="w-full h-full object-cover" alt={product.sku} />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-slate-300"><ImageIcon size={32}/></div>
                            )}
                        </div>
                        <div>
                            <h2 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">{product.sku}</h2>
                            <div className="flex items-center gap-2 mt-1 md:mt-2">
                                <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-bold uppercase">{product.category}</span>
                                <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-bold uppercase hidden md:inline-block">{product.gender}</span>
                            </div>
                        </div>
                    </div>
                    <button onClick={onClose} className="hidden md:block p-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-500 transition-colors">
                        <X size={20}/>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-slate-50/50 pb-24 md:pb-8">
                    {/* Stock Overview */}
                    <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm mb-6">
                        <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2 text-sm uppercase tracking-wide">
                            <Package size={18} className="text-emerald-500"/> Συνολικό Απόθεμα
                        </h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 text-center">
                                <div className="text-[10px] font-bold text-slate-400 uppercase">Σύνολο Τεμαχίων</div>
                                <div className="text-2xl font-black text-slate-900">{totalStock}</div>
                            </div>
                            <div className="p-4 bg-purple-50 rounded-xl border border-purple-100 text-center">
                                <div className="text-[10px] font-bold text-purple-400 uppercase">Δειγματολόγιο</div>
                                <div className="text-2xl font-black text-purple-700">{product.sample_qty}</div>
                            </div>
                        </div>
                    </div>

                    {/* Variants Table */}
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                            <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wide flex items-center gap-2">
                                <Tag size={18} className="text-blue-500"/> Τιμοκατάλογος & Ετικέτες
                            </h3>
                        </div>
                        
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs">
                                <tr>
                                    <th className="p-4">Παραλλαγή</th>
                                    <th className="p-4 hidden sm:table-cell">Περιγραφή</th>
                                    <th className="p-4 text-center hidden sm:table-cell">Stock</th>
                                    <th className="p-4 text-right">Τιμή</th>
                                    <th className="p-4 text-center w-32">Εκτύπωση</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {variants.length > 0 ? sortedVariants.map(v => (
                                    <tr key={v.suffix} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="p-4 font-mono font-bold text-slate-700">{v.suffix || 'BAS'}</td>
                                        <td className="p-4 text-slate-600 font-medium hidden sm:table-cell">{v.description}</td>
                                        <td className="p-4 text-center hidden sm:table-cell">
                                            {v.stock_qty > 0 ? (
                                                <span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded font-bold text-xs">{v.stock_qty}</span>
                                            ) : <span className="text-slate-300">-</span>}
                                        </td>
                                        <td className="p-4 text-right font-black text-lg text-slate-800">
                                            {formatCurrency(v.selling_price || product.selling_price || 0)}
                                        </td>
                                        <td className="p-4 text-center">
                                            <div className="flex justify-center gap-1">
                                                <button onClick={() => handlePrintLabel(v, 'standard')} className="p-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200" title="Χονδρική">
                                                    <Tag size={16}/>
                                                </button>
                                                <button onClick={() => handlePrintLabel(v, 'retail')} className="p-2 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100" title="Λιανική">
                                                    <ShoppingBag size={16}/>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td className="p-4 font-mono font-bold text-slate-700">MASTER</td>
                                        <td className="p-4 text-slate-600 hidden sm:table-cell">Βασικό Προϊόν</td>
                                        <td className="p-4 text-center hidden sm:table-cell">
                                            {product.stock_qty > 0 ? (
                                                <span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded font-bold text-xs">{product.stock_qty}</span>
                                            ) : <span className="text-slate-300">-</span>}
                                        </td>
                                        <td className="p-4 text-right font-black text-lg text-slate-800">
                                            {formatCurrency(product.selling_price)}
                                        </td>
                                        <td className="p-4 text-center">
                                            <div className="flex justify-center gap-1">
                                                <button onClick={() => handlePrintLabel(null, 'standard')} className="p-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200" title="Χονδρική">
                                                    <Tag size={16}/>
                                                </button>
                                                <button onClick={() => handlePrintLabel(null, 'retail')} className="p-2 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100" title="Λιανική">
                                                    <ShoppingBag size={16}/>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
