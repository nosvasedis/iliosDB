
import React, { useState, useMemo } from 'react';
import { Product } from '../../types';
import { Search, ImageIcon, Tag, Weight, Layers, Camera } from 'lucide-react';
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
                    {filteredProducts.map(p => {
                        const totalStock = (p.stock_qty || 0) + (p.variants?.reduce((sum, v) => sum + (v.stock_qty || 0), 0) || 0);
                        const hasVariants = p.variants && p.variants.length > 0;
                        
                        // Resolve Display Price:
                        // If master price is 0, try to find a representative variant price (e.g. Gold 'X' or just the first non-zero)
                        let displayPrice = p.selling_price;
                        if ((!displayPrice || displayPrice === 0) && hasVariants) {
                            const variantWithPrice = p.variants?.find(v => v.selling_price && v.selling_price > 0);
                            if (variantWithPrice) displayPrice = variantWithPrice.selling_price || 0;
                        }

                        return (
                            <div 
                                key={p.sku} 
                                onClick={() => onProductSelect(p)}
                                className="bg-white p-2 rounded-2xl border border-slate-100 shadow-sm active:scale-95 transition-transform flex flex-col relative overflow-hidden"
                            >
                                <div className="aspect-square bg-slate-50 rounded-xl overflow-hidden mb-2 relative">
                                    {p.image_url ? (
                                        <img src={p.image_url} className="w-full h-full object-cover" alt={p.sku} />
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
                                            <Layers size={10} /> {p.variants?.length}
                                        </div>
                                    )}
                                </div>
                                <div className="mt-auto">
                                    <div className="font-black text-slate-800 text-sm truncate">{p.sku}</div>
                                    <div className="text-[10px] text-slate-400 font-medium truncate flex items-center gap-1">
                                        <Tag size={10}/> {p.category}
                                    </div>
                                    <div className="text-[10px] text-slate-400 font-medium truncate flex items-center gap-1 mt-0.5">
                                        <Weight size={10}/> {p.weight_g}g
                                    </div>
                                    <div className="mt-1 font-bold text-slate-900 text-xs bg-slate-50 rounded px-1.5 py-0.5 w-fit">
                                        {displayPrice > 0 ? formatCurrency(displayPrice) : '-'}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
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
