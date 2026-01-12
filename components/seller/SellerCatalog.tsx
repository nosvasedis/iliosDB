
import React, { useState, useMemo } from 'react';
import { Product, Gender, PlatingType, MaterialType } from '../../types';
import { Search, Filter, ImageIcon, Layers, Tag, User, Users, Gem, Palette } from 'lucide-react';
import { formatCurrency, getVariantComponents } from '../../utils/pricingEngine';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/supabase';

interface Props {
    products: Product[];
}

const genderFilters: { label: string; value: 'All' | Gender; icon: React.ReactNode }[] = [
    { label: 'Όλα', value: 'All', icon: <Layers size={16} /> },
    { label: 'Ανδρικά', value: Gender.Men, icon: <User size={16} /> },
    { label: 'Γυναικεία', value: Gender.Women, icon: <User size={16} /> },
    { label: 'Unisex', value: Gender.Unisex, icon: <Users size={16} /> },
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

const SellerProductCard: React.FC<{ product: Product }> = ({ product }) => {
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
    
    // Cycle through variants on click
    const cycleVariant = () => {
        if (hasVariants) setViewIndex(prev => (prev + 1) % variants.length);
    };

    const currentVariant = hasVariants ? variants[viewIndex % variants.length] : null;

    // Display Props based on current variant or master
    const displaySku = currentVariant ? `${product.sku}${currentVariant.suffix}` : product.sku;
    const displayPrice = currentVariant ? (currentVariant.selling_price || product.selling_price || 0) : (product.selling_price || 0);
    const displayLabel = currentVariant ? (currentVariant.description || currentVariant.suffix) : product.category;
    
    const stockQty = currentVariant 
        ? currentVariant.stock_qty 
        : product.stock_qty;

    // Calculate total stock for badge
    const totalStock = (product.stock_qty || 0) + variants.reduce((sum, v) => sum + (v.stock_qty || 0), 0);

    return (
        <div 
            onClick={cycleVariant}
            className="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4 active:scale-[0.98] transition-transform cursor-pointer"
        >
            <div className="w-16 h-16 bg-slate-50 rounded-xl overflow-hidden shrink-0 border border-slate-100 relative">
                {product.image_url ? (
                    <img src={product.image_url} className="w-full h-full object-cover" alt={displaySku} />
                ) : <div className="w-full h-full flex items-center justify-center text-slate-300"><ImageIcon size={24}/></div>}
                
                {hasVariants && (
                    <div className="absolute bottom-0 right-0 bg-slate-900/80 text-white text-[9px] px-1.5 py-0.5 rounded-tl-lg font-bold">
                        Var: {viewIndex + 1}/{variants.length}
                    </div>
                )}
            </div>
            
            <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start">
                    <div className="font-black text-slate-800 text-base">{displaySku}</div>
                    <div className="font-mono font-bold text-blue-600 text-sm">{formatCurrency(displayPrice)}</div>
                </div>
                <div className="text-xs text-slate-500 font-medium mb-1 truncate">{displayLabel}</div>
                <div className="flex gap-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded font-bold border ${stockQty > 0 ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-red-50 text-red-600 border-red-100'}`}>
                        {stockQty > 0 ? `Stock: ${stockQty}` : 'Out of Stock'}
                    </span>
                    {hasVariants && (
                        <span className="text-[10px] bg-slate-50 text-slate-500 px-2 py-0.5 rounded border border-slate-100 font-bold">
                            Total: {totalStock}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
};

export default function SellerCatalog({ products }: Props) {
    const { data: materials } = useQuery({ queryKey: ['materials'], queryFn: api.getMaterials });

    const [search, setSearch] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string>('All');
    const [filterGender, setFilterGender] = useState<'All' | Gender>('All');
    
    const [subFilters, setSubFilters] = useState({
        stone: 'all',
        plating: 'all',
    });
    const [showFilters, setShowFilters] = useState(false);

    // Extract categories
    const categories = useMemo(() => {
        const cats = new Set(products.map(p => p.category));
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

    return (
        <div className="p-4 h-full flex flex-col">
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
                            className="w-full pl-10 p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 shadow-sm font-medium"
                        />
                    </div>
                    <button onClick={() => setShowFilters(!showFilters)} className={`p-3 rounded-xl border transition-colors ${showFilters ? 'bg-[#060b00] text-white border-[#060b00]' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
                        <Filter size={20}/>
                    </button>
                </div>

                {/* Expanded Filters */}
                {showFilters && (
                    <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm space-y-4 animate-in fade-in slide-in-from-top-2">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-400 uppercase">Φύλο</label>
                            <div className="flex flex-wrap gap-2">
                                {genderFilters.map(f => (
                                    <SubFilterButton key={f.value} label={f.label} value={f.value} activeValue={filterGender} onClick={(v) => setFilterGender(v as any)}/>
                                ))}
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-400 uppercase flex items-center gap-1"><Gem size={12}/> Πέτρες</label>
                            <div className="flex flex-wrap gap-2">
                                {stoneFilters.map(f => <SubFilterButton key={f.value} label={f.label} value={f.value} activeValue={subFilters.stone} onClick={(v) => setSubFilters(p => ({...p, stone: v}))}/>)}
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-400 uppercase flex items-center gap-1"><Palette size={12}/> Φινίρισμα</label>
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
                            {cat}
                        </button>
                    ))}
                </div>
            </div>

            {/* Product List */}
            <div className="flex-1 overflow-y-auto space-y-3 pb-24 custom-scrollbar">
                {filteredProducts.map(p => (
                    <SellerProductCard key={p.sku} product={p} />
                ))}
                {filteredProducts.length === 0 && (
                    <div className="text-center py-10 text-slate-400 text-sm">Δεν βρέθηκαν προϊόντα.</div>
                )}
            </div>
        </div>
    );
}