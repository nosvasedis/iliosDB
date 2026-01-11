
import React, { useMemo } from 'react';
import { Product, ProductVariant, Warehouse } from '../../types';
import { X, ImageIcon, Tag, Weight, CheckCircle, Package, MapPin, Layers, ChevronLeft } from 'lucide-react';
import { formatCurrency, getVariantComponents } from '../../utils/pricingEngine';
import { SYSTEM_IDS } from '../../lib/supabase';

interface Props {
    product: Product;
    onClose: () => void;
    warehouses: Warehouse[];
}

export default function EmployeeProductDetails({ product, onClose, warehouses }: Props) {
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

                    {/* Variants Table - Improved for Mobile */}
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                            <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wide flex items-center gap-2">
                                <Tag size={18} className="text-blue-500"/> Τιμοκατάλογος
                            </h3>
                        </div>
                        
                        <div className="md:hidden">
                            {/* Mobile List View */}
                            {variants.length > 0 ? sortedVariants.map(v => (
                                <div key={v.suffix} className="p-4 border-b border-slate-50 last:border-0 flex justify-between items-center">
                                    <div>
                                        <div className="font-mono font-black text-slate-800 text-lg">{v.suffix || 'BAS'}</div>
                                        <div className="text-xs text-slate-500 font-medium">{v.description}</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="font-black text-emerald-700 text-lg">{formatCurrency(v.selling_price || product.selling_price || 0)}</div>
                                        <div className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded inline-block">Stock: {v.stock_qty}</div>
                                    </div>
                                </div>
                            )) : (
                                <div className="p-4 flex justify-between items-center">
                                    <div>
                                        <div className="font-black text-slate-800 text-lg">MASTER</div>
                                        <div className="text-xs text-slate-500">Βασικό Προϊόν</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="font-black text-emerald-700 text-lg">{formatCurrency(product.selling_price)}</div>
                                        <div className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded inline-block">Stock: {product.stock_qty}</div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Desktop Table View */}
                        <table className="hidden md:table w-full text-left text-sm">
                            <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs">
                                <tr>
                                    <th className="p-4">Παραλλαγή</th>
                                    <th className="p-4">Περιγραφή</th>
                                    <th className="p-4 text-center">Κεντρικό Stock</th>
                                    <th className="p-4 text-right">Τιμή Λιανικής</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {variants.length > 0 ? sortedVariants.map(v => (
                                    <tr key={v.suffix} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="p-4 font-mono font-bold text-slate-700">{v.suffix || 'BAS'}</td>
                                        <td className="p-4 text-slate-600 font-medium">{v.description}</td>
                                        <td className="p-4 text-center">
                                            {v.stock_qty > 0 ? (
                                                <span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded font-bold text-xs">{v.stock_qty}</span>
                                            ) : <span className="text-slate-300">-</span>}
                                        </td>
                                        <td className="p-4 text-right font-black text-lg text-slate-800">
                                            {formatCurrency(v.selling_price || product.selling_price || 0)}
                                        </td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td className="p-4 font-mono font-bold text-slate-700">MASTER</td>
                                        <td className="p-4 text-slate-600">Βασικό Προϊόν</td>
                                        <td className="p-4 text-center">
                                            {product.stock_qty > 0 ? (
                                                <span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded font-bold text-xs">{product.stock_qty}</span>
                                            ) : <span className="text-slate-300">-</span>}
                                        </td>
                                        <td className="p-4 text-right font-black text-lg text-slate-800">
                                            {formatCurrency(product.selling_price)}
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
