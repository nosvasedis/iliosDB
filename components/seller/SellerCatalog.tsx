
import React, { useState, useMemo } from 'react';
import { Product, Gender, PlatingType, MaterialType } from '../../types';
import { Search, Filter, ImageIcon, Layers, Tag, User, Users, Gem, Palette, Camera, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { formatCurrency, getVariantComponents, findProductByScannedCode } from '../../utils/pricingEngine';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/supabase';
import BarcodeScanner from '../BarcodeScanner';
import { useUI } from '../UIProvider';

interface Props {
    products: Product[];
}

const genderFilters: { label: string; value: 'All' | Gender; icon: React.ReactNode }[] = [
    { label: 'Όλα', value: 'All', icon: <Layers size={14} /> },
    { label: 'Ανδρικά', value: Gender.Men, icon: <User size={14} /> },
    { label: 'Γυναικεία', value: Gender.Women, icon: <User size={14} /> },
    { label: 'Unisex', value: Gender.Unisex, icon: <Users size={14} /> },
];

const platingFilters = [
    { label: 'Όλα', value: 'all' },
    { label: 'Λουστρέ / Πατίνα', value: 'lustre' },
    { label: 'Επίχρυσο', value: 'gold' },
    { label: 'Επιπλατινωμένο', value: 'platinum' }
];

const stoneFilters = [
    { label: 'Όλα', value: 'all' },
    { label: 'Με Πέτρες', value: 'with' },
    { label: 'Χωρίς Πέτρες', value: 'without' }
];

const SubFilterButton: React.FC<{
    label: string;
    value: string;
    activeValue: string;
    onClick: (value: string) => void;
}> = ({ label, value, activeValue, onClick }) => (
    <button
        onClick={() => onClick(value)}
        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border
            ${activeValue === value
                ? 'bg-[#060b00] text-white border-[#060b00] shadow-md'
                : 'bg-white text-slate-500 hover:bg-slate-50 border-slate-200'}
        `}
    >
        {label}
    </button>
);

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
    
    const nextVariant = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (hasVariants) setViewIndex(prev => (prev + 1) % variants.length);
    };

    const prevVariant = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (hasVariants) setViewIndex(prev => (prev - 1 + variants.length) % variants.length);
    };

    const currentVariant = hasVariants ? variants[viewIndex % variants.length] : null;

    // Display Props based on current variant or master
    const displaySku = currentVariant ? `${product.sku}${currentVariant.suffix}` : product.sku;
    // For Catalogue: Show Retail Price (Wholesale * 2.5) or Wholesale based on user role? 
    // Assuming Seller App shows Wholesale.
    const displayPrice = currentVariant ? (currentVariant.selling_price || product.selling_price || 0) : (product.selling_price || 0);
    const displayLabel = currentVariant ? (currentVariant.description || currentVariant.suffix) : product.category;
    
    const stockQty = currentVariant ? currentVariant.stock_qty : product.stock_qty;

    return (
        <div className="group bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-xl transition-all border border-slate-100 flex flex-col h-full relative">
            {/* Image Container */}
            <div className="aspect-[4/5] bg-slate-50 relative overflow-hidden">
                {product.image_url ? (
                    <img 
                        src={product.image_url} 
                        className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-700 ease-out" 
                        alt={displaySku} 
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-300">
                        <ImageIcon size={32} />
                    </div>
                )}
                
                {/* Overlay Gradient for Text readability if needed, or badging */}
                <div className="absolute top-0 left-0 p-2">
                    {stockQty > 0 ? (
                        <span className="bg-emerald-500/90 backdrop-blur-sm text-white text-[9px] font-bold px-2 py-1 rounded-md shadow-sm">
                            {stockQty}
                        </span>
                    ) : (
                        <span className="bg-red-500/90 backdrop-blur-sm text-white text-[9px] font-bold px-2 py-1 rounded-md shadow-sm">
                            Out
                        </span>
                    )}
                </div>

                {hasVariants && (
                    <div className="absolute top-2 right-2 bg-slate-900/80 backdrop-blur-sm text-white text-[9px] font-bold px-2 py-1 rounded-md flex items-center gap-1 shadow-sm">
                        <Layers size={10}/> {viewIndex + 1}/{variants.length}
                    </div>
                )}

                {/* Variant Controls Overlay */}
                {hasVariants && variants.length > 1 && (
                    <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-between px-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                        <button onClick={prevVariant} className="pointer-events-auto p-1.5 bg-white/80 backdrop-blur-md rounded-full shadow-md text-slate-700 hover:bg-white transition-colors">
                            <ChevronLeft size={16}/>
                        </button>
                        <button onClick={nextVariant} className="pointer-events-auto p-1.5 bg-white/80 backdrop-blur-md rounded-full shadow-md text-slate-700 hover:bg-white transition-colors">
                            <ChevronRight size={16}/>
                        </button>
                    </div>
                )}
            </div>
            
            {/* Info Area */}
            <div className="p-3 flex flex-col flex-1 bg-white relative z-10">
                <div className="flex justify-between items-start mb-1">
                    <h3 className="font-black text-slate-800 text-sm leading-tight truncate pr-2">{displaySku}</h3>
                    <div className="font-mono font-bold text-[#060b00] text-sm leading-none">
                        {displayPrice > 0 ? formatCurrency(displayPrice) : '-'}
                    </div>
                </div>
                
                <p className="text-[10px] text-slate-500 font-medium line-clamp-1 mb-2">
                    {displayLabel}
                </p>

                <div className="mt-auto pt-2 border-t border-slate-50 flex items-center gap-2">
                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider bg-slate-50 px-1.5 py-0.5 rounded">
                        {product.category.split(' ')[0]}
                    </span>
                    {product.weight_g > 0 && (
                        <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider ml-auto">
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
    
    const [subFilters, setSubFilters] = useState({
        stone: 'all',
        plating: 'all',
    });
    const [showFilters, setShowFilters] = useState(false);
    const [showScanner, setShowScanner] = useState(false);

    // Extract categories
    const categories = useMemo(() => {
        const cats = new Set(products.map(p => {
            // Group logic: First word usually works for categories like "Ring Men", "Ring Women" -> "Ring"
            // Or just use full category if simple
            return p.category;
        }));
        return ['All', ...Array.from(cats).sort()];
    }, [products]);

    const filteredProducts = useMemo(() => {
        if (!materials) return [];

        const productHasStones = (p: Product): boolean => {
            return p.recipe.some(item => {
                if (item.type !== 'raw') return false;
                const mat = materials?.find(m => m.id === item.id);
                return mat?.type === MaterialType.Stone;
            });
        };

        const getProductPlatingTypes = (p: Product): Set<string> => {
            const types = new Set<string>();
            const { finish: masterFinish } = getVariantComponents(p.sku, p.gender);
            if (p.plating_type === PlatingType.GoldPlated) types.add('X');
            if (p.plating_type === PlatingType.Platinum) types.add('H');
            if (p.plating_type === PlatingType.None) types.add(masterFinish.code || '');

            (p.variants || []).forEach(v => {
                const { finish } = getVariantComponents(v.suffix, p.gender);
                types.add(finish.code);
            });
            return types;
        };

        const result = products.filter(p => {
            if (p.is_component) return false;
            
            const matchesSearch = p.sku.toLowerCase().includes(search.toLowerCase()) || p.category.toLowerCase().includes(search.toLowerCase());
            const matchesCat = selectedCategory === 'All' || p.category === selectedCategory;
            const matchesGender = filterGender === 'All' || p.gender === filterGender;
            
            if (!matchesSearch || !matchesCat || !matchesGender) return false;

            if (subFilters.stone === 'with' && !productHasStones(p)) return false;
            if (subFilters.stone === 'without' && productHasStones(p)) return false;

            if (subFilters.plating !== 'all') {
                const platingTypes = getProductPlatingTypes(p);
                if (subFilters.plating === 'lustre' && !platingTypes.has('') && !platingTypes.has('P')) return false;
                if (subFilters.plating === 'gold' && !platingTypes.has('X')) return false;
                if (subFilters.plating === 'platinum' && !platingTypes.has('H')) return false;
            }

            return true;
        });

        // Alphabetical Ascending (Natural Sort)
        return result.sort((a, b) => {
            return a.sku.localeCompare(b.sku, undefined, { numeric: true, sensitivity: 'base' });
        });
    }, [products, search, selectedCategory, filterGender, subFilters, materials]);

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
        <div className="p-4 h-full flex flex-col bg-slate-50">
            <h1 className="text-2xl font-black text-slate-900 mb-4">Κατάλογος</h1>

            {/* Controls */}
            <div className="space-y-4 shrink-0 mb-4">
                <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input 
                            type="text" 
                            placeholder="Αναζήτηση κωδικού..." 
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-10 p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-[#060b00]/20 shadow-sm font-medium text-sm"
                        />
                    </div>
                    <button onClick={() => setShowScanner(true)} className="p-3 rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-[#060b00] hover:border-slate-300 transition-colors shadow-sm">
                        <Camera size={20}/>
                    </button>
                    <button onClick={() => setShowFilters(!showFilters)} className={`p-3 rounded-xl border transition-colors shadow-sm ${showFilters ? 'bg-[#060b00] text-white border-[#060b00]' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
                        <Filter size={20}/>
                    </button>
                </div>

                {/* Expanded Filters */}
                {showFilters && (
                    <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm space-y-4 animate-in fade-in slide-in-from-top-2 relative">
                        <button onClick={() => setShowFilters(false)} className="absolute top-2 right-2 text-slate-300 hover:text-slate-500"><X size={16}/></button>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Φύλο</label>
                            <div className="flex flex-wrap gap-2">
                                {genderFilters.map(f => (
                                    <SubFilterButton key={f.value} label={f.label} value={f.value} activeValue={filterGender} onClick={(v) => setFilterGender(v as any)}/>
                                ))}
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1"><Gem size={10}/> Πέτρες</label>
                            <div className="flex flex-wrap gap-2">
                                {stoneFilters.map(f => <SubFilterButton key={f.value} label={f.label} value={f.value} activeValue={subFilters.stone} onClick={(v) => setSubFilters(p => ({...p, stone: v}))}/>)}
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1"><Palette size={10}/> Φινίρισμα</label>
                            <div className="flex flex-wrap gap-2">
                                {platingFilters.map(f => <SubFilterButton key={f.value} label={f.label} value={f.value} activeValue={subFilters.plating} onClick={(v) => setSubFilters(p => ({...p, plating: v}))}/>)}
                            </div>
                        </div>
                    </div>
                )}
                
                {/* Category Horizontal Scroll */}
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                    {categories.map(cat => (
                        <button
                            key={cat}
                            onClick={() => setSelectedCategory(cat)}
                            className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${
                                selectedCategory === cat 
                                    ? 'bg-slate-900 text-white border-slate-900 shadow-md' 
                                    : 'bg-white text-slate-500 border-slate-200'
                            }`}
                        >
                            {cat === 'All' ? 'Όλα' : cat}
                        </button>
                    ))}
                </div>
            </div>

            {/* Product List */}
            <div className="flex-1 overflow-y-auto pb-24 custom-scrollbar pr-1">
                <div className="grid grid-cols-2 gap-4">
                    {filteredProducts.map(p => (
                        <CatalogueCard key={p.sku} product={p} />
                    ))}
                </div>
                {filteredProducts.length === 0 && (
                    <div className="text-center py-20 text-slate-400 text-sm italic">Δεν βρέθηκαν προϊόντα.</div>
                )}
            </div>

            {showScanner && <BarcodeScanner onScan={handleScan} onClose={() => setShowScanner(false)} />}
        </div>
    );
}
