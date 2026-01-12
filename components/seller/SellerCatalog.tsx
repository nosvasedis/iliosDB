
import React, { useState, useMemo } from 'react';
import { Product, Gender, PlatingType, MaterialType } from '../../types';
import { Search, Filter, ImageIcon, Layers, Tag, User, Users, Gem, Palette, Camera, X, SlidersHorizontal } from 'lucide-react';
import { formatCurrency, getVariantComponents, findProductByScannedCode } from '../../utils/pricingEngine';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/supabase';
import BarcodeScanner from '../BarcodeScanner';
import { useUI } from '../UIProvider';

interface Props {
    products: Product[];
}

// --- CONSTANTS & CONFIG ---
const genderFilters = [
    { label: 'Όλα', value: 'All' },
    { label: 'Γυναικεία', value: Gender.Women },
    { label: 'Ανδρικά', value: Gender.Men },
    { label: 'Unisex', value: Gender.Unisex },
];

const CatalogueCard: React.FC<{ product: Product }> = ({ product }) => {
    const [viewIndex, setViewIndex] = useState(0);

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
    const currentVariant = hasVariants ? variants[viewIndex % variants.length] : null;

    // Display Props
    const displaySku = currentVariant ? `${product.sku}${currentVariant.suffix}` : product.sku;
    const displayPrice = currentVariant ? (currentVariant.selling_price || product.selling_price || 0) : (product.selling_price || 0);
    const displayLabel = currentVariant ? (currentVariant.description || currentVariant.suffix) : product.category;
    const stockQty = currentVariant ? currentVariant.stock_qty : product.stock_qty;

    // Handlers for tap zones
    const handleNext = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (hasVariants) setViewIndex(prev => (prev + 1) % variants.length);
    };

    const handlePrev = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (hasVariants) setViewIndex(prev => (prev - 1 + variants.length) % variants.length);
    };

    return (
        <div className="bg-white rounded-lg overflow-hidden shadow-sm border border-slate-200 flex flex-col h-full relative group active:scale-[0.98] transition-transform">
            {/* Image Section - Square for Density */}
            <div className="relative aspect-square bg-slate-50 overflow-hidden">
                {product.image_url ? (
                    <img 
                        src={product.image_url} 
                        className="w-full h-full object-cover" 
                        alt={displaySku} 
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-300">
                        <ImageIcon size={20} />
                    </div>
                )}

                {/* Invisible Touch Zones for Cycling */}
                {hasVariants && (
                    <>
                        <div className="absolute inset-y-0 left-0 w-1/2 z-10" onClick={handlePrev}></div>
                        <div className="absolute inset-y-0 right-0 w-1/2 z-10" onClick={handleNext}></div>
                    </>
                )}

                {/* Stock Status Badge (Mini) */}
                <div className="absolute top-1 left-1 pointer-events-none z-20">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md shadow-sm backdrop-blur-md ${stockQty > 0 ? 'bg-emerald-500/90 text-white' : 'bg-red-500/90 text-white'}`}>
                        {stockQty > 0 ? stockQty : '0'}
                    </span>
                </div>

                {/* Variant Counter (Mini) */}
                {hasVariants && variants.length > 1 && (
                    <div className="absolute top-1 right-1 pointer-events-none z-20">
                        <span className="bg-black/50 backdrop-blur-md text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full">
                            {viewIndex % variants.length + 1}/{variants.length}
                        </span>
                    </div>
                )}
            </div>

            {/* Content Section - Ultra Compact */}
            <div className="p-1.5 flex flex-col gap-0.5">
                <h3 className="font-black text-slate-800 text-[11px] leading-tight truncate">{displaySku}</h3>
                
                <div className="flex justify-between items-end">
                    <span className="text-[9px] text-slate-400 truncate max-w-[50%] leading-tight">
                        {displayLabel}
                    </span>
                    <span className="font-bold text-[#060b00] text-xs leading-none">
                        {displayPrice > 0 ? formatCurrency(displayPrice) : '-'}
                    </span>
                </div>
            </div>
        </div>
    );
};

export default function SellerCatalog({ products }: Props) {
    const { data: materials } = useQuery({ queryKey: ['materials'], queryFn: api.getMaterials });
    const { showToast } = useUI();

    const [search, setSearch] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string>('All');
    const [filterGender, setFilterGender] = useState<'All' | Gender>('All');
    const [showFilters, setShowFilters] = useState(false);
    const [showScanner, setShowScanner] = useState(false);

    // Extract categories
    const categories = useMemo(() => {
        const cats = new Set(products.map(p => p.category));
        return ['All', ...Array.from(cats).sort()];
    }, [products]);

    const filteredProducts = useMemo(() => {
        if (!materials) return [];

        const result = products.filter(p => {
            if (p.is_component) return false;
            
            const matchesSearch = p.sku.toLowerCase().includes(search.toLowerCase()) || 
                                  p.category.toLowerCase().includes(search.toLowerCase());
            const matchesCat = selectedCategory === 'All' || p.category === selectedCategory;
            const matchesGender = filterGender === 'All' || p.gender === filterGender;
            
            return matchesSearch && matchesCat && matchesGender;
        });

        // Alphabetical Ascending (Natural Sort)
        return result.sort((a, b) => {
            return a.sku.localeCompare(b.sku, undefined, { numeric: true, sensitivity: 'base' });
        });
    }, [products, search, selectedCategory, filterGender, materials]);

    const handleScan = (code: string) => {
        const match = findProductByScannedCode(code, products);
        if (match) {
            const targetSku = match.product.sku + (match.variant?.suffix || '');
            setSearch(targetSku);
            setShowScanner(false);
            showToast(`Βρέθηκε: ${targetSku}`, 'success');
        } else {
            showToast(`Ο κωδικός ${code} δεν βρέθηκε.`, 'error');
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-50 relative">
            {/* Compact Sticky Header */}
            <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-xl border-b border-slate-200 shadow-sm px-3 pt-3 pb-2 space-y-2">
                {/* Search Row */}
                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                        <input 
                            type="text" 
                            placeholder="Αναζήτηση..." 
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-8 p-2 bg-slate-100 border border-transparent focus:bg-white focus:border-slate-300 rounded-lg outline-none font-bold text-xs text-slate-900 transition-all placeholder:font-medium"
                        />
                        {search && (
                            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 bg-slate-200 rounded-full p-0.5">
                                <X size={12} className="text-slate-500" />
                            </button>
                        )}
                    </div>
                    <button onClick={() => setShowScanner(true)} className="bg-slate-100 text-slate-600 p-2 rounded-lg border border-transparent hover:bg-slate-200 transition-colors">
                        <Camera size={18}/>
                    </button>
                    <button 
                        onClick={() => setShowFilters(!showFilters)} 
                        className={`p-2 rounded-lg border transition-colors ${showFilters ? 'bg-[#060b00] text-white border-[#060b00]' : 'bg-slate-100 text-slate-600 border-transparent'}`}
                    >
                        <SlidersHorizontal size={18}/>
                    </button>
                </div>

                {/* Filters Row */}
                {showFilters && (
                    <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar animate-in slide-in-from-top-2">
                        {genderFilters.map(g => (
                            <button
                                key={g.value}
                                onClick={() => setFilterGender(g.value as any)}
                                className={`px-3 py-1.5 rounded-md text-[10px] font-bold whitespace-nowrap transition-all border ${
                                    filterGender === g.value 
                                        ? 'bg-[#060b00] text-white border-[#060b00]' 
                                        : 'bg-white text-slate-500 border-slate-200'
                                }`}
                            >
                                {g.label}
                            </button>
                        ))}
                    </div>
                )}

                {/* Category Chips */}
                <div className="flex gap-2 overflow-x-auto pb-1 -mx-3 px-3 scrollbar-hide">
                    {categories.map(cat => (
                        <button
                            key={cat}
                            onClick={() => setSelectedCategory(cat)}
                            className={`px-3 py-1.5 rounded-full text-[10px] font-bold whitespace-nowrap transition-all border ${
                                selectedCategory === cat 
                                    ? 'bg-slate-800 text-white border-slate-800 shadow-sm' 
                                    : 'bg-white text-slate-500 border-slate-200'
                            }`}
                        >
                            {cat === 'All' ? 'Όλα' : cat}
                        </button>
                    ))}
                </div>
            </div>

            {/* Dense Product Grid */}
            <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 pb-20">
                    {filteredProducts.map(p => (
                        <CatalogueCard key={p.sku} product={p} />
                    ))}
                </div>

                {filteredProducts.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                        <Search size={40} className="mb-2 opacity-20"/>
                        <p className="font-bold text-xs">Δεν βρέθηκαν προϊόντα.</p>
                    </div>
                )}
            </div>

            {showScanner && <BarcodeScanner onScan={handleScan} onClose={() => setShowScanner(false)} />}
        </div>
    );
}
