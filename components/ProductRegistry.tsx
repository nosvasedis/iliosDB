import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Product, ProductVariant, GlobalSettings, Collection, Material, Mold, Gender, MaterialType, PlatingType } from '../types';
import { Search, Filter, Layers, Database, PackagePlus, ImageIcon, User, Users as UsersIcon, Edit3, TrendingUp, Weight, BookOpen, Coins, ChevronLeft, ChevronRight, Tag, Puzzle, Gem, Palette, X } from 'lucide-react';
import ProductDetails from './ProductDetails';
import NewProduct from './NewProduct';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/supabase';
import { calculateProductCost, getPrevalentVariant, getVariantComponents, formatCurrency } from '../utils/pricingEngine';
import { useUI } from './UIProvider';

interface Props {
    setPrintItems?: (items: { product: Product; variant?: ProductVariant; quantity: number, format?: 'standard' | 'simple' }[]) => void;
}

const genderFilters: { label: string; value: 'All' | Gender; icon: React.ReactNode }[] = [
    { label: 'Όλα', value: 'All', icon: <Layers size={16} /> },
    { label: 'Ανδρικά', value: Gender.Men, icon: <User size={16} /> },
    { label: 'Γυναικεία', value: Gender.Women, icon: <User size={16} /> },
    { label: 'Unisex', value: Gender.Unisex, icon: <UsersIcon size={16} /> },
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

// --- Sub-Component: Product Card with Smart Variant Switching ---
const ProductCard: React.FC<{
    product: Product;
    onClick: () => void;
    settings: GlobalSettings;
    materials: Material[];
    allProducts: Product[];
}> = ({ product, onClick, settings, materials, allProducts }) => {
    const [viewIndex, setViewIndex] = useState(0); 
    
    const variants = product.variants || [];
    const hasVariants = variants.length > 0;
    const variantCount = variants.length;

    const sortedVariants = useMemo(() => {
        if (!hasVariants) return [];
        return [...variants].sort((a, b) => {
            const priority = (suffix: string) => {
                if (suffix === '') return 0; // Highest priority for Lustre (empty suffix)
                if (suffix.includes('P')) return 1;
                if (suffix.includes('H')) return 2; // Prioritize Platinum before Gold
                if (suffix.includes('X')) return 3;
                if (suffix.includes('D')) return 4;
                return 5;
            };
            return priority(a.suffix) - priority(b.suffix);
        });
    }, [variants]);

    let currentVariant: ProductVariant | null = null;
    if (hasVariants) {
        currentVariant = sortedVariants[viewIndex % variantCount];
    }

    const masterCostCalc = calculateProductCost(product, settings, materials, allProducts);
    const masterCost = masterCostCalc.total;

    let displayPrice = product.selling_price;
    let displayCost = masterCost;
    let displaySku = product.sku;
    let displayLabel = 'Βασικό';

    if (currentVariant) {
        const { finish } = getVariantComponents(currentVariant.suffix, product.gender);
        displaySku = `${product.sku}${finish.code}`;
        displayLabel = currentVariant.description || currentVariant.suffix;
        if (currentVariant.selling_price) displayPrice = currentVariant.selling_price;
        if (currentVariant.active_price) displayCost = currentVariant.active_price;
    }

    const profit = displayPrice - displayCost;
    const margin = displayPrice > 0 ? (profit / displayPrice) * 100 : 0;

    const nextView = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (hasVariants) setViewIndex(prev => (prev + 1) % variantCount);
    };

    const prevView = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (hasVariants) setViewIndex(prev => (prev - 1 + variantCount) % variantCount);
    };

    // Total weight including secondary weight for accurate display
    const totalWeight = product.weight_g + (product.secondary_weight_g || 0);

    return (
        <div 
            onClick={onClick}
            className="group bg-white rounded-3xl border border-slate-100 shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer flex flex-col overflow-hidden hover:-translate-y-1 relative"
        >
            {hasVariants && (
                <div className="absolute top-3 left-3 z-10 bg-[#060b00]/90 backdrop-blur-md text-white text-[10px] font-bold px-2.5 py-1.5 rounded-full flex items-center gap-1.5 shadow-sm border border-white/10">
                    <Layers size={10} className="text-amber-400" />
                    <span>{variantCount}</span>
                </div>
            )}

            <div className="aspect-square bg-slate-50 relative overflow-hidden">
                {product.image_url ? (
                    <img 
                        src={product.image_url} 
                        alt={product.sku} 
                        className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-700 ease-out" 
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-300">
                        <ImageIcon size={40} />
                    </div>
                )}
                
                {hasVariants && (
                    <div className="absolute inset-0 bg-[#060b00]/0 pointer-events-none group-hover:bg-[#060b00]/5 transition-colors" />
                )}

                <div className="absolute bottom-3 left-3 z-10 bg-white/90 backdrop-blur-md text-slate-600 text-[10px] font-bold px-2 py-1 rounded-lg shadow-sm border border-slate-100 max-w-[calc(100%-1.5rem)] truncate">
                    {product.category}
                </div>
            </div>

            <div className="p-5 flex-1 flex flex-col relative">
                <div className="flex justify-between items-start mb-3">
                    <div className="min-w-0 pr-2">
                        <h3 className="font-black text-lg leading-none truncate text-slate-800 group-hover:text-emerald-700 transition-colors">
                            {displaySku}
                        </h3>
                        <div className="text-xs font-bold text-slate-400 mt-1 truncate flex items-center gap-1">
                            {hasVariants && <Tag size={10} />} {displayLabel}
                        </div>
                    </div>

                    {hasVariants && variantCount > 1 && (
                        <div className="flex items-center bg-slate-100 rounded-lg p-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                            <button onClick={prevView} className="p-1 hover:bg-white hover:text-emerald-600 hover:shadow-sm rounded-md transition-all text-slate-400">
                                <ChevronLeft size={16} />
                            </button>
                            <div className="w-px h-3 bg-slate-200 mx-0.5"></div>
                            <button onClick={nextView} className="p-1 hover:bg-white hover:text-emerald-600 hover:shadow-sm rounded-md transition-all text-slate-400">
                                <ChevronRight size={16} />
                            </button>
                        </div>
                    )}
                </div>

                <div className="flex gap-2 mb-4">
                    <div className="bg-slate-50 px-2 py-1 rounded text-[10px] font-bold text-slate-500 flex items-center gap-1 border border-slate-100">
                        <Weight size={10}/> {totalWeight.toFixed(2)}g
                    </div>
                    <div className="bg-slate-50 px-2 py-1 rounded text-[10px] font-bold text-slate-500 flex items-center gap-1 border border-slate-100">
                        <BookOpen size={10}/> {product.recipe.length + 1} υλικά
                    </div>
                </div>

                <div className="mt-auto pt-3 border-t border-slate-100 grid grid-cols-2 gap-4 items-end">
                    <div>
                        <div className="text-[9px] uppercase font-bold text-slate-400 mb-0.5">Χονδρικη</div>
                        <div className={`text-xl font-black leading-none ${displayPrice > 0 ? 'text-[#060b00]' : 'text-slate-300'}`}>
                            {displayPrice > 0 ? formatCurrency(displayPrice) : '-'}
                        </div>
                    </div>

                    <div className="text-right">
                        <div className="text-[9px] uppercase font-bold text-slate-400 mb-0.5">Περιθωριο</div>
                        <div className={`flex items-center justify-end gap-1 font-bold text-sm ${margin < 30 ? 'text-red-500' : 'text-emerald-600'}`}>
                            {displayPrice > 0 ? (
                                <>
                                    <TrendingUp size={12} />
                                    {margin.toFixed(0)}%
                                </>
                            ) : '-'}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// @FIX: Convert to React.FC to correctly type the component and handle the `key` prop, resolving assignment errors.
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


export default function ProductRegistry({ setPrintItems }: Props) {
  const queryClient = useQueryClient();
  const { data: products, isLoading: loadingProducts } = useQuery({ queryKey: ['products'], queryFn: api.getProducts });
  const { data: materials, isLoading: loadingMaterials } = useQuery({ queryKey: ['materials'], queryFn: api.getMaterials });
  const { data: molds, isLoading: loadingMolds } = useQuery({ queryKey: ['molds'], queryFn: api.getMolds });
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: api.getSettings });
  const { data: collections } = useQuery({ queryKey: ['collections'], queryFn: api.getCollections });

  const [searchTerm, setSearchTerm] = useState('');
  const [filterParentCategory, setFilterParentCategory] = useState<string>('All');
  const [filterGender, setFilterGender] = useState<'All' | Gender>('All');
  
  const [subFilters, setSubFilters] = useState({
      category: 'all',
      stone: 'all',
      plating: 'all',
  });
  
  const [showSubFilters, setShowSubFilters] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [showStxOnly, setShowStxOnly] = useState(false);
  
  const [showFab, setShowFab] = useState(false);
  const headerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scrollContainer = document.querySelector('main > div.overflow-y-auto');
    if (!scrollContainer) return;

    const handleScroll = () => {
      if (headerRef.current) {
        const headerBottomPosition = headerRef.current.getBoundingClientRect().bottom;
        setShowFab(headerBottomPosition < 20);
      }
    };

    scrollContainer.addEventListener('scroll', handleScroll);
    return () => {
      scrollContainer.removeEventListener('scroll', handleScroll);
    };
  }, []);
  
  const baseProducts = useMemo(() => {
    if (!products) return [];
    return products.filter(p => showStxOnly ? p.is_component : !p.is_component);
  }, [products, showStxOnly]);

  const groupedCategories = useMemo(() => {
      if (!baseProducts) return { parents: [], children: new Map() };
      const parents = new Set<string>();
      const children = new Map<string, Set<string>>();
      const allCategories = new Set(baseProducts.map(p => p.category));
      
      const parentKeywords = ['Βραχιόλι', 'Δαχτυλίδι', 'Σκουλαρίκια', 'Μενταγιόν', 'Σταυρός'];

      // @FIX: Explicitly type `cat` as a string to resolve type inference issue.
      allCategories.forEach((cat: string) => {
          const parent = parentKeywords.find(p => cat.startsWith(p));
          if (parent) {
              parents.add(parent);
              if (!children.has(parent)) children.set(parent, new Set());
              if (cat !== parent) children.get(parent)!.add(cat);
          } else {
              parents.add(cat);
          }
      });
      return { parents: Array.from(parents).sort(), children };
  }, [baseProducts]);

  const handleParentCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      setFilterParentCategory(e.target.value);
      setSubFilters({ category: 'all', stone: 'all', plating: 'all' });
      setShowSubFilters(false);
  };
  
  const handleSubFilterChange = (type: keyof typeof subFilters, value: string) => {
      setSubFilters(prev => ({ ...prev, [type]: value }));
  };

  const filteredProducts = useMemo(() => {
    if (!baseProducts || !materials) return [];
    
    // Helper functions for sub-filtering
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
    
    const filtered = baseProducts.filter(p => {
        const matchesGender = filterGender === 'All' || p.gender === filterGender;
        const matchesParentCat = filterParentCategory === 'All' || p.category.startsWith(filterParentCategory);
        const matchesSearch = p.sku.toUpperCase().includes(searchTerm.toUpperCase()) || p.category.toLowerCase().includes(searchTerm.toLowerCase());
        
        if (!matchesGender || !matchesParentCat || !matchesSearch) return false;

        // Sub-filters
        if (subFilters.category !== 'all' && p.category !== subFilters.category) return false;
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

    const naturalSort = (a: Product, b: Product) => {
        const regex = /^([A-Z-]+)(\d+)$/i;
        const matchA = a.sku.match(regex);
        const matchB = b.sku.match(regex);
        if (!matchA || !matchB) return a.sku.localeCompare(b.sku);
        const [, prefixA, numStrA] = matchA;
        const [, prefixB, numStrB] = matchB;
        const numA = parseInt(numStrA, 10);
        const numB = parseInt(numStrB, 10);
        const prefixCompare = prefixA.localeCompare(prefixB);
        if (prefixCompare !== 0) return prefixCompare;
        return numA - numB;
    };
    
    return filtered.sort(naturalSort);

  }, [baseProducts, searchTerm, filterParentCategory, filterGender, subFilters, materials]);
  
  const activeSubCategories = groupedCategories.children.get(filterParentCategory);
  const activeSubFilterCount = Object.values(subFilters).filter(val => val !== 'all').length;

  if (loadingProducts || loadingMaterials || loadingMolds || !settings || !products || !materials || !molds || !collections) {
      return null; 
  }

  if (isCreating) {
      return (
          <NewProduct 
            products={products}
            materials={materials}
            molds={molds}
            onCancel={() => setIsCreating(false)}
          />
      );
  }

  return (
    <div className="space-y-6">
      <div ref={headerRef} className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
         <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
            <h1 className="text-3xl font-bold text-[#060b00] tracking-tight flex items-center gap-3">
                <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
                    <Database size={24} />
                </div>
                Μητρώο Κωδικών
            </h1>
            <p className="text-slate-500 mt-1 ml-14">
                {showStxOnly 
                    ? `Προβολή εξαρτημάτων (STX) που χρησιμοποιούνται στις συνταγές.` 
                    : `Αποκλειστική διαχείριση προδιαγραφών και κοστολόγησης.`
                }
            </p>
         </div>
         
         <div className="flex items-center gap-3 self-stretch md:self-auto w-full md:w-auto">
            <div className="flex bg-slate-100 p-1 rounded-xl">
                <button onClick={() => setShowStxOnly(false)} className={`px-4 py-2.5 rounded-lg font-bold text-sm transition-all flex items-center gap-2 ${!showStxOnly ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                    <Database size={16}/> Προϊόντα
                </button>
                <button onClick={() => setShowStxOnly(true)} className={`px-4 py-2.5 rounded-lg font-bold text-sm transition-all flex items-center gap-2 ${showStxOnly ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                    <Puzzle size={16}/> Εξαρτήματα (STX)
                </button>
            </div>
            <button onClick={() => setIsCreating(true)} className="flex items-center justify-center gap-2 bg-[#060b00] hover:bg-black text-white px-5 py-3 rounded-xl font-bold transition-all shadow-md hover:shadow-lg w-full md:w-auto">
                <PackagePlus size={20}/> <span className="whitespace-nowrap">Νέο Προϊόν</span>
            </button>
         </div>
      </div>
      
      <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100 space-y-4">
          {!showStxOnly && (
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wide ml-1 mb-2 block">Φύλο</label>
              <div className="flex items-center gap-2 flex-wrap">
                  {genderFilters.map(filter => (
                      <button
                          key={filter.value}
                          onClick={() => setFilterGender(filter.value)}
                          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all border
                              ${filterGender === filter.value
                                  ? 'bg-[#060b00] text-white border-[#060b00] shadow-md'
                                  : 'bg-white text-slate-500 hover:bg-slate-50 border-slate-200'}
                          `}
                      >
                          {filter.icon}
                          {filter.label}
                      </button>
                  ))}
              </div>
            </div>
          )}
          <div className="grid sm:grid-cols-2 gap-4">
              <div className="relative group">
                  <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <select 
                     value={filterParentCategory}
                     onChange={handleParentCategoryChange}
                     className="pl-10 pr-10 py-3 border border-slate-200 rounded-xl focus:ring-4 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none w-full bg-white appearance-none cursor-pointer text-slate-700 font-medium"
                  >
                      <option value="All">Όλες οι Κατηγορίες</option>
                      {groupedCategories.parents.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative group flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-500 transition-colors" size={20} />
                    <input 
                        type="text" 
                        placeholder="Αναζήτηση Κωδικού..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-12 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-4 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none w-full bg-white transition-all text-slate-900"
                    />
                </div>
                {filterParentCategory !== 'All' && (
                    <button
                        onClick={() => setShowSubFilters(prev => !prev)}
                        className={`relative shrink-0 px-4 py-3 rounded-xl font-bold text-sm transition-all border flex items-center gap-2 ${(showSubFilters || activeSubFilterCount > 0) ? 'bg-[#060b00] text-white border-[#060b00] shadow-md' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                    >
                        <Filter size={16} />
                        <span>Φίλτρα</span>
                        {(activeSubFilterCount > 0 && !showSubFilters) && (
                            <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-black border-2 border-white">
                                {activeSubFilterCount}
                            </span>
                        )}
                    </button>
                )}
              </div>
          </div>
          
          {showSubFilters && filterParentCategory !== 'All' && (
              <div className="relative border-t border-slate-100 pt-4 space-y-4 animate-in fade-in">
                  <button onClick={() => setShowSubFilters(false)} className="absolute top-2 right-2 p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full z-10">
                      <X size={16}/>
                  </button>
                  {activeSubCategories && activeSubCategories.size > 0 && (
                      <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-xs font-bold text-slate-400 uppercase shrink-0">Τύπος:</span>
                          <SubFilterButton label="Όλα" value="all" activeValue={subFilters.category} onClick={(v) => handleSubFilterChange('category', v)}/>
                          {Array.from(activeSubCategories).map((subCat: string) => (
                              <SubFilterButton key={subCat} label={subCat.replace(filterParentCategory, '').trim()} value={subCat} activeValue={subFilters.category} onClick={(v) => handleSubFilterChange('category', v)}/>
                          ))}
                      </div>
                  )}
                  <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-xs font-bold text-slate-400 uppercase shrink-0 flex items-center gap-1"><Gem size={12}/> Πέτρες:</span>
                      {stoneFilters.map(f => <SubFilterButton key={f.value} label={f.label} value={f.value} activeValue={subFilters.stone} onClick={(v) => handleSubFilterChange('stone', v)}/>)}
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-xs font-bold text-slate-400 uppercase shrink-0 flex items-center gap-1"><Palette size={12}/> Φινίρισμα:</span>
                      {platingFilters.map(f => <SubFilterButton key={f.value} label={f.label} value={f.value} activeValue={subFilters.plating} onClick={(v) => handleSubFilterChange('plating', v)}/>)}
                  </div>
              </div>
          )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-6">
          {filteredProducts.map(product => (
              <ProductCard 
                  key={product.sku}
                  product={product}
                  settings={settings}
                  materials={materials}
                  allProducts={products}
                  onClick={() => setSelectedProduct(product)}
              />
          ))}
      </div>
      
      {filteredProducts.length === 0 && (
          <div className="text-center py-20 text-slate-400">
              <Database size={48} className="mx-auto mb-4 opacity-20"/>
              <p className="font-medium">Δεν βρέθηκαν κωδικοί με αυτά τα κριτήρια.</p>
          </div>
      )}

      {selectedProduct && (
        <ProductDetails 
          product={selectedProduct} 
          allProducts={products}
          allMaterials={materials}
          onClose={() => setSelectedProduct(null)}
          setPrintItems={setPrintItems || (() => {})}
          settings={settings}
          collections={collections}
          allMolds={molds}
          viewMode="registry"
        />
      )}

      <div 
        className={`fixed bottom-8 right-8 z-50 transition-all duration-300 ${showFab ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}
      >
          <button
            onClick={() => setIsCreating(true)}
            className="flex items-center justify-center gap-3 bg-[#060b00] text-white rounded-full font-bold shadow-2xl hover:bg-black transition-all duration-200 ease-in-out transform hover:-translate-y-1 hover:scale-105 h-16 w-16 sm:w-auto sm:h-auto sm:px-6 sm:py-4"
            aria-label="Δημιουργία Νέου Προϊόντος"
          >
            <PackagePlus size={24} />
            <span className="hidden sm:inline whitespace-nowrap">Νέο Προϊόν</span>
          </button>
      </div>
    </div>
  );
}