
import React, { useState, useMemo } from 'react';
import { Product, Warehouse, Gender, Material, MaterialType, PlatingType, ProductVariant } from '../../types';
import { Search, Filter, ImageIcon, Tag, Layers, ChevronLeft, ChevronRight, User, Users, Palette, Gem } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/supabase';
import { formatCurrency, getVariantComponents } from '../../utils/pricingEngine';
import EmployeeProductDetails from './EmployeeProductDetails';

interface Props {
    setPrintItems?: (items: { product: Product; variant?: ProductVariant; quantity: number, format?: 'standard' | 'simple' | 'retail' }[]) => void;
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

const ProductCard: React.FC<{ product: Product; onClick: () => void }> = ({ product, onClick }) => {
    const [viewIndex, setViewIndex] = useState(0);

    // Variants sorting logic (Alphabetical/Priority)
    const sortedVariants = useMemo(() => {
        if (!product.variants || product.variants.length === 0) return [];
        return [...product.variants].sort((a, b) => {
            const priority = (suffix: string) => {
                if (suffix === '' || !['P','D','X','H'].some(c => suffix.startsWith(c))) return 0; 
                if (suffix.startsWith('P')) return 1;
                if (suffix.startsWith('D')) return 2;
                if (suffix.startsWith('X')) return 3;
                if (suffix.startsWith('H')) return 4;
                return 5;
            };
            return priority(a.suffix) - priority(b.suffix);
        });
    }, [product.variants]);

    const hasVariants = sortedVariants.length > 0;
    
    // LOGIC: Show Master only if NO variants. Else cycle through variants.
    const currentVariant = hasVariants ? sortedVariants[viewIndex % sortedVariants.length] : null;

    const displaySku = currentVariant ? `${product.sku}${currentVariant.suffix}` : product.sku;
    const displayLabel = currentVariant ? (currentVariant.description || currentVariant.suffix) : product.category;
    
    // RETAIL PRICE LOGIC: Wholesale * 2.5
    const wholesalePrice = currentVariant ? (currentVariant.selling_price || product.selling_price || 0) : (product.selling_price || 0);
    const displayRetailPrice = wholesalePrice * 2.5;
    
    const stockQty = currentVariant ? currentVariant.stock_qty : product.stock_qty;

    const nextView = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (hasVariants) setViewIndex(prev => (prev + 1) % sortedVariants.length);
    };

    const prevView = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (hasVariants) setViewIndex(prev => (prev - 1 + sortedVariants.length) % sortedVariants.length);
    };

    return (
        <div onClick={onClick} className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all cursor-pointer overflow-hidden group flex flex-col h-full">
            <div className="aspect-square bg-slate-50 relative overflow-hidden shrink-0">
                {product.image_url ? (
                    <img src={product.image_url} alt={displaySku} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-300">
                        <ImageIcon size={32} />
                    </div>
                )}
                {stockQty > 0 && (
                    <div className="absolute top-2 right-2 bg-emerald-500 text-white text-[10px] font-bold px-2 py-1 rounded-lg shadow-sm">
                        Stock: {stockQty}
                    </div>
                )}
            </div>
            
            <div className="p-4 flex flex-col flex-1">
                <div className="flex justify-between items-start mb-1">
                    <div className="min-w-0 pr-2">
                        <h3 className="font-black text-slate-800 text-lg truncate">{displaySku}</h3>
                        <div className="text-[10px] text-slate-500 font-bold truncate">{displayLabel}</div>
                    </div>
                    <div className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded text-sm shrink-0">
                        {displayRetailPrice > 0 ? formatCurrency(displayRetailPrice) : '-'}
                    </div>
                </div>
                
                <div className="mt-auto pt-3 flex items-center justify-between">
                    <div className="flex items-center gap-1 text-xs text-slate-400 font-medium">
                        <Tag size={12}/> {product.category}
                    </div>
                    
                    {hasVariants && sortedVariants.length > 1 && (
                        <div className="flex bg-slate-100 rounded-lg p-0.5 shrink-0" onClick={e => e.stopPropagation()}>
                            <button onClick={prevView} className="p-1 hover:bg-white text-slate-400 hover:text-slate-700 rounded transition-colors"><ChevronLeft size={14}/></button>
                            <span className="text-[9px] font-mono text-slate-400 px-1 py-1">{viewIndex + 1}/{sortedVariants.length}</span>
                            <button onClick={nextView} className="p-1 hover:bg-white text-slate-400 hover:text-slate-700 rounded transition-colors"><ChevronRight size={14}/></button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default function EmployeeRegistry({ setPrintItems }: Props) {
    const { data: products, isLoading } = useQuery({ queryKey: ['products'], queryFn: api.getProducts });
    const { data: warehouses } = useQuery({ queryKey: ['warehouses'], queryFn: api.getWarehouses });
    const { data: materials } = useQuery({ queryKey: ['materials'], queryFn: api.getMaterials });
    
    const [search, setSearch] = useState('');
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [filterGender, setFilterGender] = useState<'All' | Gender>('All');
    const [subFilters, setSubFilters] = useState({
        stone: 'all',
        plating: 'all',
    });
    const [showFilters, setShowFilters] = useState(false);

    // Extract categories dynamically
    const categories = useMemo(() => {
        if (!products) return ['All'];
        const cats = new Set(products.map(p => p.category).filter(Boolean));
        return ['All', ...Array.from(cats).sort()];
    }, [products]);
    const [selectedCategory, setSelectedCategory] = useState('All');

    const filteredProducts = useMemo(() => {
        if (!products) return [];
        
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

        // Strict Alphabetical Sort
        return result.sort((a, b) => a.sku.localeCompare(b.sku, undefined, { numeric: true, sensitivity: 'base' }));
    }, [products, search, selectedCategory, filterGender, subFilters, materials]);

    if (isLoading) return <div className="p-12 text-center text-slate-400">Φόρτωση προϊόντων...</div>;

    return (
        <div className="flex flex-col h-full space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <h1 className="text-2xl font-bold text-slate-800">Προϊόντα & Τιμές</h1>
                <div className="flex items-center gap-2 w-full md:w-auto">
                    <div className="relative flex-1 md:w-72">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
                        <input 
                            type="text" 
                            placeholder="Αναζήτηση..." 
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-full pl-10 p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500/20"
                        />
                    </div>
                    <button onClick={() => setShowFilters(!showFilters)} className={`p-3 rounded-xl border transition-colors ${showFilters ? 'bg-[#060b00] text-white border-[#060b00]' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
                        <Filter size={20}/>
                    </button>
                </div>
            </div>

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

            {/* Categories Scroll */}
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide shrink-0">
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
                        {cat === 'All' ? 'Όλα' : cat}
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
                    setPrintItems={setPrintItems}
                />
            )}
        </div>
    );
}
