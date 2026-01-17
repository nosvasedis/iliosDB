
import React, { useState, useMemo, useEffect } from 'react';
import { Product, ProductVariant, Gender, MaterialType, PlatingType } from '../../types';
import { Search, ImageIcon, Tag, Weight, Layers, Camera, ChevronLeft, ChevronRight, Filter, X, SlidersHorizontal, User, Users, Gem, Palette, Puzzle, Database, ArrowDown } from 'lucide-react';
import { formatCurrency, findProductByScannedCode, getVariantComponents } from '../../utils/pricingEngine';
import { useUI } from '../UIProvider';
import BarcodeScanner from '../BarcodeScanner';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/supabase';

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

const FilterChip: React.FC<{ label: string; active: boolean; onClick: () => void; icon?: React.ReactNode }> = ({ label, active, onClick, icon }) => (
    <button
        onClick={onClick}
        className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all border flex items-center gap-1.5 ${
            active
                ? 'bg-[#060b00] text-white border-[#060b00] shadow-sm'
                : 'bg-white text-slate-500 hover:bg-slate-50 border-slate-200'
        }`}
    >
        {icon}
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
            className="bg-white p-2 rounded-2xl border border-slate-100 shadow-sm active:scale-95 transition-transform flex flex-col relative overflow-hidden h-full"
        >
            <div className="aspect-square bg-slate-50 rounded-xl overflow-hidden mb-2 relative group shrink-0">
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
    const { data: materials } = useQuery({ queryKey: ['materials'], queryFn: api.getMaterials });
    
    const [search, setSearch] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string>('All');
    const [showScanner, setShowScanner] = useState(false);
    
    // Advanced Filters
    const [showFilters, setShowFilters] = useState(false);
    const [showStxOnly, setShowStxOnly] = useState(false);
    const [filterGender, setFilterGender] = useState<'All' | Gender>('All');
    const [subFilters, setSubFilters] = useState({
        stone: 'all', // 'all', 'with', 'without'
        plating: 'all', // 'all', 'lustre', 'gold', 'platinum'
    });

    // Pagination
    const [displayLimit, setDisplayLimit] = useState(50);

    const { showToast } = useUI();

    // Reset pagination when filters change
    useEffect(() => {
        setDisplayLimit(50);
    }, [search, selectedCategory, filterGender, subFilters, showStxOnly]);

    // Extract categories for filter
    const categories = useMemo(() => {
        const cats = new Set<string>();
        products.forEach(p => {
            // Only show categories relevant to the current STX mode
            if (p.is_component === showStxOnly) {
                const root = p.category.split(' ')[0]; // Simple grouping
                if(root) cats.add(root);
            }
        });
        return ['All', ...Array.from(cats).sort()];
    }, [products, showStxOnly]);

    // Smart sort & Filter
    const filteredProducts = useMemo(() => {
        if (!materials) return [];

        const productHasStones = (p: Product): boolean => {
            return p.recipe.some(item => {
                if (item.type !== 'raw') return false;
                const mat = materials.find(m => m.id === item.id);
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
            // 1. STX Filter (Components)
            if (p.is_component !== showStxOnly) return false;

            // 2. Search
            const matchesSearch = p.sku.toLowerCase().includes(search.toLowerCase()) || p.category.toLowerCase().includes(search.toLowerCase());
            if (!matchesSearch) return false;

            // 3. Category
            const matchesCategory = selectedCategory === 'All' || p.category.startsWith(selectedCategory);
            if (!matchesCategory) return false;

            // 4. Gender
            const matchesGender = filterGender === 'All' || p.gender === filterGender;
            if (!matchesGender) return false;

            // 5. Stones
            if (subFilters.stone === 'with' && !productHasStones(p)) return false;
            if (subFilters.stone === 'without' && productHasStones(p)) return false;

            // 6. Plating
            if (subFilters.plating !== 'all') {
                const platingTypes = getProductPlatingTypes(p);
                if (subFilters.plating === 'lustre' && !platingTypes.has('') && !platingTypes.has('P')) return false;
                if (subFilters.plating === 'gold' && !platingTypes.has('X')) return false;
                if (subFilters.plating === 'platinum' && !platingTypes.has('H')) return false;
            }

            return true;
        });

        // Natural Sort
        return result.sort((a, b) => {
            return a.sku.localeCompare(b.sku, undefined, { numeric: true, sensitivity: 'base' });
        });
    }, [products, search, selectedCategory, showStxOnly, filterGender, subFilters, materials]);

    const displayedProducts = filteredProducts.slice(0, displayLimit);

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

    const loadMore = () => {
        setDisplayLimit(prev => prev + 50);
    };

    return (
        <div className="p-4 h-full flex flex-col">
            <div className="flex justify-between items-center mb-4 shrink-0">
                <h1 className="text-2xl font-black text-slate-900">
                    {showStxOnly ? 'Εξαρτήματα (STX)' : 'Μητρώο Κωδικών'}
                </h1>
                
                <div className="flex gap-2">
                    <button 
                        onClick={() => { setShowStxOnly(!showStxOnly); setSelectedCategory('All'); }}
                        className={`p-2 rounded-xl border transition-all ${showStxOnly ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-200 text-slate-500'}`}
                    >
                        {showStxOnly ? <Puzzle size={20}/> : <Database size={20}/>}
                    </button>
                </div>
            </div>

            {/* Search & Main Actions */}
            <div className="flex gap-2 mb-4 shrink-0">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                        type="text" 
                        placeholder={showStxOnly ? "Αναζήτηση STX..." : "Αναζήτηση κωδικού..."}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-10 p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 shadow-sm font-medium text-sm"
                    />
                </div>
                <button 
                    onClick={() => setShowFilters(!showFilters)} 
                    className={`p-3 rounded-xl border transition-all ${showFilters ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200'}`}
                >
                    <SlidersHorizontal size={20}/>
                </button>
                <button 
                    onClick={() => setShowScanner(true)}
                    className="bg-white text-slate-600 border border-slate-200 p-3 rounded-xl shadow-sm active:scale-95 transition-transform"
                >
                    <Camera size={20} />
                </button>
            </div>

            {/* Expanded Filters */}
            {showFilters && (
                <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm mb-4 space-y-4 animate-in slide-in-from-top-2">
                    <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Φύλο</label>
                        <div className="flex flex-wrap gap-2">
                            <FilterChip label="Όλα" active={filterGender === 'All'} onClick={() => setFilterGender('All')} />
                            <FilterChip label="Γυναικεία" active={filterGender === Gender.Women} onClick={() => setFilterGender(Gender.Women)} icon={<User size={10}/>} />
                            <FilterChip label="Ανδρικά" active={filterGender === Gender.Men} onClick={() => setFilterGender(Gender.Men)} icon={<User size={10}/>} />
                            <FilterChip label="Unisex" active={filterGender === Gender.Unisex} onClick={() => setFilterGender(Gender.Unisex)} icon={<Users size={10}/>} />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Χαρακτηριστικά</label>
                        <div className="flex flex-wrap gap-2">
                            <FilterChip label="Με Πέτρες" active={subFilters.stone === 'with'} onClick={() => setSubFilters(prev => ({...prev, stone: prev.stone === 'with' ? 'all' : 'with'}))} icon={<Gem size={10}/>} />
                            <FilterChip label="Χωρίς Πέτρες" active={subFilters.stone === 'without'} onClick={() => setSubFilters(prev => ({...prev, stone: prev.stone === 'without' ? 'all' : 'without'}))} />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Φινίρισμα</label>
                        <div className="flex flex-wrap gap-2">
                            <FilterChip label="Όλα" active={subFilters.plating === 'all'} onClick={() => setSubFilters(prev => ({...prev, plating: 'all'}))} />
                            <FilterChip label="Χρυσό" active={subFilters.plating === 'gold'} onClick={() => setSubFilters(prev => ({...prev, plating: 'gold'}))} icon={<Palette size={10} className="text-amber-500"/>} />
                            <FilterChip label="Πλατίνα" active={subFilters.plating === 'platinum'} onClick={() => setSubFilters(prev => ({...prev, plating: 'platinum'}))} icon={<Palette size={10} className="text-cyan-500"/>} />
                            <FilterChip label="Λουστρέ" active={subFilters.plating === 'lustre'} onClick={() => setSubFilters(prev => ({...prev, plating: 'lustre'}))} />
                        </div>
                    </div>
                </div>
            )}

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
                <div className="grid grid-cols-2 gap-3 pb-4">
                    {displayedProducts.map(p => (
                        <RegistryCard 
                            key={p.sku} 
                            product={p} 
                            onClick={() => onProductSelect(p)} 
                        />
                    ))}
                </div>
                
                {/* Pagination / Status */}
                {displayedProducts.length < filteredProducts.length && (
                    <button 
                        onClick={loadMore}
                        className="w-full py-3 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-200 transition-colors flex items-center justify-center gap-2 mb-4"
                    >
                        <ArrowDown size={16}/> Περισσότερα ({filteredProducts.length - displayedProducts.length})
                    </button>
                )}

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
