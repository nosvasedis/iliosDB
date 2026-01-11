
import React, { useState, useMemo, useEffect } from 'react';
import { Product, ProductVariant } from '../../types';
import { Search, ImageIcon, Tag, Weight, Layers, Camera, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatCurrency, findProductByScannedCode } from '../../utils/pricingEngine';
import { useUI } from '../UIProvider';
import BarcodeScanner from '../BarcodeScanner';

interface Props {
  products: Product[];
  onProductSelect: (p: Product) => void;
}

interface CategoryChipProps {
    label: string;
    isActive: boolean;
    onClick: () => void;
}

const CategoryChip: React.FC<CategoryChipProps> = ({ label, isActive, onClick }) => (
    <button 
        onClick={onClick}
        className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all border ${
            isActive 
                ? 'bg-slate-900 text-white border-slate-900 shadow-md' 
                : 'bg-white text-slate-500 border-slate-200'
        }`}
    >
        {label}
    </button>
);

const RegistryCard: React.FC<{ product: Product; onClick: () => void }> = ({ product, onClick }) => {
    const [variantIndex, setVariantIndex] = useState(0);
    
    // Sort variants to ensure consistent order (Standard priority logic)
    const variants = useMemo(() => {
        if (!product.variants || product.variants.length === 0) return [];
        return [...product.variants].sort((a, b) => {
            const priority = (s: string) => {
                if (s === '') return 0;
                if (s === 'P') return 1;
                if (s === 'D') return 2;
                if (s === 'X') return 3;
                if (s === 'H') return 4;
                return 5;
            };
            return priority(a.suffix) - priority(b.suffix);
        });
    }, [product.variants]);

    const hasVariants = variants.length > 0;
    const currentVariant = hasVariants ? variants[variantIndex] : null;

    // Display Props based on current variant or master
    const displaySku = currentVariant ? `${product.sku}${currentVariant.suffix}` : product.sku;
    // CRITICAL FIX: Use variant price if available, otherwise fallback to master
    const displayPrice = currentVariant ? (currentVariant.selling_price || 0) : (product.selling_price || 0);
    const displayLabel = currentVariant ? (currentVariant.description || currentVariant.suffix) : product.category;
    
    const totalStock = (product.stock_qty || 0) + (product.variants?.reduce((sum, v) => sum + (v.stock_qty || 0), 0) || 0);

    const nextVariant = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (hasVariants) setVariantIndex((prev) => (prev + 1) % variants.length);
    };

    const prevVariant = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (hasVariants) setVariantIndex((prev) => (prev - 1 + variants.length) % variants.length);
    };

    return (
        <div 
            onClick={onClick}
            className="bg-white p-2 rounded-2xl border border-slate-100 shadow-sm active:scale-95 transition-transform flex flex-col relative overflow-hidden"
        >
            <div className="aspect-square bg-slate-50 rounded-xl overflow-hidden mb-2 relative group">
                {product.image_url ? (
                    <img src={product.image_url} className="w-full h-full object-cover" alt={displaySku} />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-300"><ImageIcon size={24}/></div>
                )}
                
                {totalStock > 0 && (
                    <div className="absolute top-2 right-2 bg-emerald-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm">
                        {totalStock}
                    </div>
                )}
                
                {hasVariants && (
                    <div className="absolute bottom-2 left-2 bg-slate-900/80 text-white text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 shadow-sm backdrop-blur-sm">
                        <Layers size={10} /> {variants.length}
                    </div>
                )}
            </div>
            
            <div className="mt-auto">
                <div className="flex justify-between items-center">
                    <div className="font-black text-slate-800 text-sm truncate">{displaySku}</div>
                    
                    {/* Mini Controls for Variants */}
                    {hasVariants && variants.length > 1 && (
                        <div className="flex bg-slate-100 rounded-lg p-0.5" onClick={e => e.stopPropagation()}>
                            <button onClick={prevVariant} className="p-1 hover:bg-white rounded shadow-sm transition-all text-slate-500">
                                <ChevronLeft size={12}/>
                            </button>
                            <button onClick={nextVariant} className="p-1 hover:bg-white rounded shadow-sm transition-all text-slate-500">
                                <ChevronRight size={12}/>
                            </button>
                        </div>
                    )}
                </div>

                <div className="text-[10px] text-slate-400 font-medium truncate flex items-center gap-1">
                    <Tag size={10}/> {displayLabel}
                </div>
                
                <div className="mt-1 flex justify-between items-end">
                    <div className="font-bold text-slate-900 text-xs bg-slate-50 rounded px-1.5 py-0.5 w-fit">
                        {displayPrice > 0 ? formatCurrency(displayPrice) : '-'}
                    </div>
                    <div className="text-[9px] text-slate-400 flex items-center gap-0.5">
                        <Weight size={8}/> {product.weight_g}g
                    </div>
                </div>
            </div>
        </div>
    );
};

export default function MobileRegistry({ products, onProductSelect }: Props) {
    const [search, setSearch] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string>('All');
    const [showScanner, setShowScanner] = useState(false);
    const { showToast } = useUI();

    // Extract categories for filter
    const categories = useMemo(() => {
        const cats = new Set<string>();
        products.forEach(p => {
            const root = p.category.split(' ')[0]; // Simple grouping
            if(root) cats.add(root);
        });
        return ['All', ...Array.from(cats).sort()];
    }, [products]);

    // Smart sort: Alphabetical by SKU, but handle numbers intelligently
    const filteredProducts = useMemo(() => {
        const result = products.filter(p => {
            const matchesSearch = p.sku.toLowerCase().includes(search.toLowerCase()) || p.category.toLowerCase().includes(search.toLowerCase());
            const matchesCategory = selectedCategory === 'All' || p.category.startsWith(selectedCategory);
            return matchesSearch && matchesCategory && !p.is_component;
        });

        // Natural Sort
        return result.sort((a, b) => {
            return a.sku.localeCompare(b.sku, undefined, { numeric: true, sensitivity: 'base' });
        }).slice(0, 50);
    }, [products, search, selectedCategory]);

    const handleScan = (code: string) => {
        const match = findProductByScannedCode(code, products);
        if (match) {
            onProductSelect(match.product);
            setShowScanner(false);
            showToast(`Βρέθηκε: ${match.product.sku}`, 'success');
        } else {
            showToast(`Ο κωδικός ${code} δεν βρέθηκε.`, 'error');
        }
    };

    return (
        <div className="p-4 h-full flex flex-col">
            <h1 className="text-2xl font-black text-slate-900 mb-4">Μητρώο Κωδικών</h1>

            {/* Search */}
            <div className="flex gap-2 mb-4 shrink-0">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                        type="text" 
                        placeholder="Αναζήτηση κωδικού..." 
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-10 p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 shadow-sm font-medium"
                    />
                </div>
                <button 
                    onClick={() => setShowScanner(true)}
                    className="bg-slate-900 text-white p-3 rounded-xl shadow-md active:scale-95 transition-transform"
                >
                    <Camera size={20} />
                </button>
            </div>

            {/* Categories */}
            <div className="flex gap-2 overflow-x-auto pb-4 shrink-0 scrollbar-hide">
                {categories.map(cat => (
                    <CategoryChip 
                        key={cat} 
                        label={cat === 'All' ? 'Όλα' : cat} 
                        isActive={selectedCategory === cat} 
                        onClick={() => setSelectedCategory(cat)} 
                    />
                ))}
            </div>

            {/* Grid */}
            <div className="flex-1 overflow-y-auto pb-24 custom-scrollbar">
                <div className="grid grid-cols-2 gap-3">
                    {filteredProducts.map(p => (
                        <RegistryCard 
                            key={p.sku} 
                            product={p} 
                            onClick={() => onProductSelect(p)} 
                        />
                    ))}
                </div>
                {filteredProducts.length === 0 && (
                    <div className="text-center py-10 text-slate-400 text-sm font-medium">
                        Δεν βρέθηκαν προϊόντα.
                    </div>
                )}
            </div>

            {showScanner && (
                <BarcodeScanner 
                    onScan={handleScan} 
                    onClose={() => setShowScanner(false)} 
                />
            )}
        </div>
    );
}
