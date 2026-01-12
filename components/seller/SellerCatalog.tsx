
import React, { useState, useMemo } from 'react';
import { Product, Gender, PlatingType, MaterialType } from '../../types';
import { Search, Filter, ImageIcon, Layers, Tag, User, Users, Gem, Palette, Camera, ChevronLeft, ChevronRight, X, SlidersHorizontal } from 'lucide-react';
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
    
    // Cycle through variants
    const nextVariant = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (hasVariants) setViewIndex(prev => (prev + 1) % variants.length);
    };

    const prevVariant = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (hasVariants) setViewIndex(prev => (prev - 1 + variants.length) % variants.length);
    };

    const currentVariant = hasVariants ? variants[viewIndex % variants.length] : null;

    // Display Props
    const displaySku = currentVariant ? `${product.sku}${currentVariant.suffix}` : product.sku;
    const displayPrice = currentVariant ? (currentVariant.selling_price || product.selling_price || 0) : (product.selling_price || 0);
    const displayLabel = currentVariant ? (currentVariant.description || currentVariant.suffix) : product.category;
    const stockQty = currentVariant ? currentVariant.stock_qty : product.stock_qty;

    return (
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-100 flex flex-col h-full relative group active:scale-[0.98] transition-transform">
            {/* Image Section */}
            <div className="relative aspect-[4/5] bg-slate-50 overflow-hidden">
                {product.image_url ? (
                    <img 
                        src={product.image_url} 
                        className="w-full h-full object-cover" 
                        alt={displaySku} 
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-300">
                        <ImageIcon size={28} />
                    </div>
                )}

                {/* Stock Status Badge (Top Left) */}
                <div className="absolute top-2 left-2">
                    {stockQty > 0 ? (
                        <span className="bg-emerald-500/90 backdrop-blur-md text-white text-[10px] font-bold px-2 py-1 rounded-lg shadow-sm">
                            {stockQty} τμχ
                        </span>
                    ) : (
                        <span className="bg-white/90 backdrop-blur-md text-red-500 text-[10px] font-bold px-2 py-1 rounded-lg shadow-sm">
                            Εκτός
                        </span>
                    )}
                </div>

                {/* Variant Counter Badge (Top Right) */}
                {hasVariants && (
                    <div className="absolute top-2 right-2 bg-black/40 backdrop-blur-md text-white text-[9px] font-bold px-2 py-1 rounded-full flex items-center gap-1">
                        <Layers size={10} /> {viewIndex + 1}/{variants.length}
                    </div>
                )}

                {/* Navigation Controls (Visible on Image Tap/Hover) */}
                {hasVariants && variants.length > 1 && (
                    <>
                        <button 
                            onClick={prevVariant} 
                            className="absolute left-1 top-1/2 -translate-y-1/2 p-1.5 bg-white/80 rounded-full text-slate-700 shadow-sm opacity-50 hover:opacity-100 transition-opacity"
                        >
                            <ChevronLeft size={16}/>
                        </button>
                        <button 
                            onClick={nextVariant} 
                            className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 bg-white/80 rounded-full text-slate-700 shadow-sm opacity-50 hover:opacity-100 transition-opacity"
                        >
                            <ChevronRight size={16}/>
                        </button>
                    </>
                )}
            </div>

            {/* Content Section */}
            <div className="p-3 flex flex-col flex-1 gap-1">
                <div className="flex justify-between items-start">
                    <h3 className="font-black text-[#060b00] text-sm leading-tight truncate pr-1">{displaySku}</h3>
                    <div className="font-bold text-amber-600 text-sm whitespace-nowrap">
                        {displayPrice > 0 ? formatCurrency(displayPrice) : '-'}
                    </div>
                </div>
                
                <p className="text-[11px] text-slate-500 font-medium truncate">
                    {displayLabel}
                </p>

                {/* Footer Badges */}
                <div className="mt-auto pt-2 flex items-center gap-1.5 overflow-hidden">
                    <span className="text-[9px] bg-slate-50 text-slate-500 px-1.5 py-0.5 rounded border border-slate-100 uppercase font-bold tracking-wider truncate">
                        {product.category}
                    </span>
                    {product.weight_g > 0 && (
                        <span className="text-[9px] text-slate-400 font-medium ml-auto shrink-0">
                            {product.weight_g}g
                        </span>
                    )}
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
        const cats = new Set(products.map(p => {
            // Simplify category names for chips (e.g., "Ring Men" -> "Ring") if needed, or keep full
            return p.category;
        }));
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
            {/* Header Area */}
            <div className="sticky top-0 z-20 bg-white/90 backdrop-blur-xl border-b border-slate-200 shadow-sm px-4 pt-4 pb-2 space-y-3">
                <div className="flex items-center justify-between">
                    <h1 className="text-xl font-black text-[#060b00]">Κατάλογος</h1>
                    <div className="text-xs font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-lg">
                        {filteredProducts.length} Είδη
                    </div>
                </div>

                {/* Search Bar */}
                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input 
                            type="text" 
                            placeholder="Αναζήτηση..." 
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-10 p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-[#060b00]/20 font-medium text-sm text-slate-900 placeholder:text-slate-400"
                        />
                        {search && (
                            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 bg-slate-200 rounded-full p-0.5">
                                <X size={14} className="text-slate-500" />
                            </button>
                        )}
                    </div>
                    <button onClick={() => setShowScanner(true)} className="bg-slate-100 text-slate-600 p-3 rounded-xl border border-slate-200 hover:bg-slate-200 transition-colors">
                        <Camera size={20}/>
                    </button>
                    <button 
                        onClick={() => setShowFilters(!showFilters)} 
                        className={`p-3 rounded-xl border transition-colors ${showFilters ? 'bg-[#060b00] text-white border-[#060b00]' : 'bg-slate-100 text-slate-600 border-slate-200'}`}
                    >
                        <SlidersHorizontal size={20}/>
                    </button>
                </div>

                {/* Expandable Filters */}
                {showFilters && (
                    <div className="pt-1 pb-2 animate-in slide-in-from-top-2 fade-in">
                        <div className="flex gap-2 p-1 bg-slate-100 rounded-xl overflow-x-auto no-scrollbar">
                            {genderFilters.map(g => (
                                <button
                                    key={g.value}
                                    onClick={() => setFilterGender(g.value as any)}
                                    className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                                        filterGender === g.value 
                                            ? 'bg-white text-[#060b00] shadow-sm' 
                                            : 'text-slate-500 hover:text-slate-700'
                                    }`}
                                >
                                    {g.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Category Chips (Horizontal Scroll) */}
                <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
                    {categories.map(cat => (
                        <button
                            key={cat}
                            onClick={() => setSelectedCategory(cat)}
                            className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all border ${
                                selectedCategory === cat 
                                    ? 'bg-[#060b00] text-white border-[#060b00] shadow-md' 
                                    : 'bg-white text-slate-500 border-slate-200'
                            }`}
                        >
                            {cat === 'All' ? 'Όλα' : cat}
                        </button>
                    ))}
                </div>
            </div>

            {/* Product Grid */}
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 pb-20">
                    {filteredProducts.map(p => (
                        <CatalogueCard key={p.sku} product={p} />
                    ))}
                </div>

                {filteredProducts.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                        <Search size={48} className="mb-4 opacity-20"/>
                        <p className="font-bold text-sm">Δεν βρέθηκαν προϊόντα.</p>
                        <p className="text-xs opacity-70">Δοκιμάστε διαφορετικά φίλτρα.</p>
                    </div>
                )}
            </div>

            {showScanner && <BarcodeScanner onScan={handleScan} onClose={() => setShowScanner(false)} />}
        </div>
    );
}
