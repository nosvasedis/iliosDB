
import React, { useState, useMemo } from 'react';
import { Product, Warehouse } from '../../types';
import { Search, Filter, ImageIcon, Tag } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/supabase';
import { formatCurrency } from '../../utils/pricingEngine';
import EmployeeProductDetails from './EmployeeProductDetails';

const ProductCard: React.FC<{ product: Product; onClick: () => void }> = ({ product, onClick }) => {
    // Determine lowest/highest price range if variants exist
    let priceDisplay = '';
    if (product.variants && product.variants.length > 0) {
        const prices = product.variants.map(v => v.selling_price || 0).filter(p => p > 0);
        if (prices.length > 0) {
            const min = Math.min(...prices);
            const max = Math.max(...prices);
            priceDisplay = min === max ? formatCurrency(min) : `${formatCurrency(min)}+`;
        } else {
            priceDisplay = product.selling_price > 0 ? formatCurrency(product.selling_price) : '-';
        }
    } else {
        priceDisplay = product.selling_price > 0 ? formatCurrency(product.selling_price) : '-';
    }

    return (
        <div onClick={onClick} className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all cursor-pointer overflow-hidden group">
            <div className="aspect-square bg-slate-50 relative overflow-hidden">
                {product.image_url ? (
                    <img src={product.image_url} alt={product.sku} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-300">
                        <ImageIcon size={32} />
                    </div>
                )}
                {product.stock_qty > 0 && (
                    <div className="absolute top-2 right-2 bg-emerald-500 text-white text-[10px] font-bold px-2 py-1 rounded-lg shadow-sm">
                        Stock: {product.stock_qty}
                    </div>
                )}
            </div>
            <div className="p-4">
                <div className="flex justify-between items-start mb-1">
                    <h3 className="font-black text-slate-800 text-lg">{product.sku}</h3>
                    <div className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded text-sm">{priceDisplay}</div>
                </div>
                <div className="flex items-center gap-1 text-xs text-slate-500 font-medium">
                    <Tag size={12}/> {product.category}
                </div>
            </div>
        </div>
    );
};

export default function EmployeeRegistry() {
    const { data: products, isLoading } = useQuery({ queryKey: ['products'], queryFn: api.getProducts });
    const { data: warehouses } = useQuery({ queryKey: ['warehouses'], queryFn: api.getWarehouses });
    
    const [search, setSearch] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

    const categories = useMemo(() => {
        if (!products) return ['All'];
        const cats = new Set(products.map(p => p.category).filter(Boolean));
        return ['All', ...Array.from(cats).sort()];
    }, [products]);

    const filteredProducts = useMemo(() => {
        if (!products) return [];
        return products.filter(p => {
            if (p.is_component) return false; // Hide raw components from clerks
            const matchesSearch = p.sku.toLowerCase().includes(search.toLowerCase()) || p.category.toLowerCase().includes(search.toLowerCase());
            const matchesCat = selectedCategory === 'All' || p.category === selectedCategory;
            return matchesSearch && matchesCat;
        });
    }, [products, search, selectedCategory]);

    if (isLoading) return <div className="p-12 text-center text-slate-400">Φόρτωση προϊόντων...</div>;

    return (
        <div className="flex flex-col h-full space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <h1 className="text-2xl font-bold text-slate-800">Προϊόντα & Τιμές</h1>
                <div className="relative w-full md:w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
                    <input 
                        type="text" 
                        placeholder="Αναζήτηση..." 
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full pl-10 p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500/20"
                    />
                </div>
            </div>

            {/* Categories */}
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                {categories.map(cat => (
                    <button
                        key={cat}
                        onClick={() => setSelectedCategory(cat)}
                        className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${
                            selectedCategory === cat 
                                ? 'bg-slate-900 text-white border-slate-900 shadow-md' 
                                : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                        }`}
                    >
                        {cat}
                    </button>
                ))}
            </div>

            {/* Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-6 overflow-y-auto pb-20 custom-scrollbar pr-2">
                {filteredProducts.map(p => (
                    <ProductCard key={p.sku} product={p} onClick={() => setSelectedProduct(p)} />
                ))}
                {filteredProducts.length === 0 && (
                    <div className="col-span-full text-center py-20 text-slate-400">Δεν βρέθηκαν προϊόντα.</div>
                )}
            </div>

            {selectedProduct && warehouses && (
                <EmployeeProductDetails 
                    product={selectedProduct} 
                    warehouses={warehouses} 
                    onClose={() => setSelectedProduct(null)} 
                />
            )}
        </div>
    );
}
