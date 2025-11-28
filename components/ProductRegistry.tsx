
import React, { useState, useMemo } from 'react';
import { Product, ProductVariant, GlobalSettings, Collection, Material, Mold, Gender } from '../types';
import { Search, Filter, Layers, Database, PackagePlus, ImageIcon, User, Users as UsersIcon, Edit3, TrendingUp, Weight, BookOpen, Coins, ChevronLeft, ChevronRight, Tag } from 'lucide-react';
import ProductDetails from './ProductDetails';
import NewProduct from './NewProduct';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/supabase';
import { calculateProductCost } from '../utils/pricingEngine';
import { useUI } from './UIProvider';

interface Props {
    setPrintItems?: (items: { product: Product; variant?: ProductVariant; quantity: number }[]) => void;
}

const genderFilters: { label: string; value: 'All' | Gender; icon: React.ReactNode }[] = [
    { label: 'Όλα', value: 'All', icon: <Layers size={16} /> },
    { label: 'Ανδρικά', value: Gender.Men, icon: <User size={16} /> },
    { label: 'Γυναικεία', value: Gender.Women, icon: <User size={16} /> },
    { label: 'Unisex', value: Gender.Unisex, icon: <UsersIcon size={16} /> },
];

// --- Sub-Component: Product Card with Smart Variant Switching ---
const ProductCard: React.FC<{
    product: Product;
    onClick: () => void;
    settings: GlobalSettings;
    materials: Material[];
    allProducts: Product[];
}> = ({ product, onClick, settings, materials, allProducts }) => {
    const [viewIndex, setViewIndex] = useState(0); // 0 = Master, 1..n = Variants

    const variants = product.variants || [];
    const hasVariants = variants.length > 0;
    const variantCount = variants.length;

    // Determine what to display based on viewIndex
    const isMasterView = viewIndex === 0;
    const currentVariant = !isMasterView ? variants[viewIndex - 1] : null;

    // --- Costing Logic ---
    const masterCostCalc = calculateProductCost(product, settings, materials, allProducts);
    const masterCost = masterCostCalc.total;

    // Resolve Price & Cost
    // If Variant has override, use it. Else fall back to Master.
    let displayPrice = product.selling_price;
    let displayCost = masterCost;
    
    // Resolve Identity
    let displaySku = product.sku;
    let displayLabel = 'Βασικό';
    
    if (currentVariant) {
        displaySku = `${product.sku}-${currentVariant.suffix}`;
        displayLabel = currentVariant.description || currentVariant.suffix;
        
        if (currentVariant.selling_price) displayPrice = currentVariant.selling_price;
        if (currentVariant.active_price) displayCost = currentVariant.active_price;
    }

    const profit = displayPrice - displayCost;
    const margin = displayPrice > 0 ? (profit / displayPrice) * 100 : 0;

    // Navigation Handlers
    const nextView = (e: React.MouseEvent) => {
        e.stopPropagation();
        setViewIndex(prev => (prev + 1) % (variantCount + 1));
    };

    const prevView = (e: React.MouseEvent) => {
        e.stopPropagation();
        setViewIndex(prev => (prev - 1 + (variantCount + 1)) % (variantCount + 1));
    };

    return (
        <div 
            onClick={onClick}
            className="group bg-white rounded-3xl border border-slate-100 shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer flex flex-col overflow-hidden hover:-translate-y-1 relative"
        >
            {/* Top Badge: Variant Counter */}
            {hasVariants && (
                <div className="absolute top-3 left-3 z-10 bg-slate-900/90 backdrop-blur-md text-white text-[10px] font-bold px-2.5 py-1.5 rounded-full flex items-center gap-1.5 shadow-sm border border-white/10">
                    <Layers size={10} className="text-amber-400" />
                    <span>{variantCount}</span>
                </div>
            )}

            {/* Top Right: Category */}
            <div className="absolute top-3 right-3 z-10 bg-white/90 backdrop-blur-md text-slate-600 text-[10px] font-bold px-2 py-1 rounded-lg shadow-sm border border-slate-100">
                {product.category}
            </div>

            {/* Image Area */}
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
                
                {/* Variant Overlay (when viewing variant) */}
                {!isMasterView && (
                    <div className="absolute inset-0 bg-indigo-900/10 pointer-events-none border-4 border-indigo-500/30" />
                )}
            </div>

            {/* Content Area */}
            <div className="p-5 flex-1 flex flex-col relative">
                
                {/* Header Row: SKU & Smart Switcher */}
                <div className="flex justify-between items-start mb-3">
                    <div className="min-w-0 pr-2">
                        <h3 className={`font-black text-lg leading-none truncate ${!isMasterView ? 'text-indigo-700' : 'text-slate-800'}`}>
                            {displaySku}
                        </h3>
                        <div className="text-xs font-bold text-slate-400 mt-1 truncate flex items-center gap-1">
                            {!isMasterView && <Tag size={10} />} {displayLabel}
                        </div>
                    </div>

                    {/* Smart Arrows */}
                    {hasVariants && (
                        <div className="flex items-center bg-slate-100 rounded-lg p-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                            <button onClick={prevView} className="p-1 hover:bg-white hover:text-indigo-600 hover:shadow-sm rounded-md transition-all text-slate-400">
                                <ChevronLeft size={16} />
                            </button>
                            <div className="w-px h-3 bg-slate-200 mx-0.5"></div>
                            <button onClick={nextView} className="p-1 hover:bg-white hover:text-indigo-600 hover:shadow-sm rounded-md transition-all text-slate-400">
                                <ChevronRight size={16} />
                            </button>
                        </div>
                    )}
                </div>

                {/* Specs Row */}
                <div className="flex gap-2 mb-4">
                    <div className="bg-slate-50 px-2 py-1 rounded text-[10px] font-bold text-slate-500 flex items-center gap-1 border border-slate-100">
                        <Weight size={10}/> {product.weight_g}g
                    </div>
                    {/* Updated to include silver as +1 material visually */}
                    <div className="bg-slate-50 px-2 py-1 rounded text-[10px] font-bold text-slate-500 flex items-center gap-1 border border-slate-100">
                        <BookOpen size={10}/> {product.recipe.length + 1} υλικά
                    </div>
                </div>

                {/* Price & Stats Footer */}
                <div className="mt-auto pt-3 border-t border-slate-100 grid grid-cols-2 gap-4 items-end">
                    
                    {/* Cost / Price */}
                    <div>
                        <div className="text-[9px] uppercase font-bold text-slate-400 mb-0.5">Χονδρικη</div>
                        <div className={`text-xl font-black leading-none ${displayPrice > 0 ? 'text-slate-800' : 'text-slate-300'}`}>
                            {displayPrice > 0 ? displayPrice.toFixed(2) : '-'}€
                        </div>
                    </div>

                    {/* Margin / Profit */}
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

export default function ProductRegistry({ setPrintItems }: Props) {
  const queryClient = useQueryClient();
  const { data: products, isLoading: loadingProducts } = useQuery({ queryKey: ['products'], queryFn: api.getProducts });
  const { data: materials, isLoading: loadingMaterials } = useQuery({ queryKey: ['materials'], queryFn: api.getMaterials });
  const { data: molds, isLoading: loadingMolds } = useQuery({ queryKey: ['molds'], queryFn: api.getMolds });
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: api.getSettings });
  const { data: collections } = useQuery({ queryKey: ['collections'], queryFn: api.getCollections });

  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('All');
  const [filterGender, setFilterGender] = useState<'All' | Gender>('All');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  
  // Derive Categories
  const categories = useMemo(() => {
    if (!products) return [];
    const cats = new Set(products.map(p => p.category));
    return Array.from(cats).sort();
  }, [products]);

  const filteredProducts = useMemo(() => {
    if (!products) return [];
    
    const filtered = products.filter(p => {
        const matchesGender = filterGender === 'All' || p.gender === filterGender;
        const matchesCat = filterCategory === 'All' || p.category === filterCategory;
        const matchesSearch = p.sku.toUpperCase().includes(searchTerm.toUpperCase()) || p.category.toLowerCase().includes(searchTerm.toLowerCase());
        
        return matchesGender && matchesCat && matchesSearch;
    });

    // Natural sort for SKUs (e.g., RN1, RN2, RN10)
    const naturalSort = (a: Product, b: Product) => {
        const regex = /^([A-Z-]+)(\d+)$/i;

        const matchA = a.sku.match(regex);
        const matchB = b.sku.match(regex);

        if (!matchA || !matchB) {
            return a.sku.localeCompare(b.sku);
        }

        const [, prefixA, numStrA] = matchA;
        const [, prefixB, numStrB] = matchB;

        const numA = parseInt(numStrA, 10);
        const numB = parseInt(numStrB, 10);

        const prefixCompare = prefixA.localeCompare(prefixB);
        if (prefixCompare !== 0) {
            return prefixCompare;
        }

        return numA - numB;
    };
    
    return filtered.sort(naturalSort);

  }, [products, searchTerm, filterCategory, filterGender]);

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
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
         <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
            <h1 className="text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-3">
                <div className="p-2 bg-indigo-100 text-indigo-600 rounded-xl">
                    <Database size={24} />
                </div>
                Μητρώο Κωδικών
            </h1>
            <p className="text-slate-500 mt-1 ml-14">Αποκλειστική διαχείριση προδιαγραφών και κοστολόγησης.</p>
         </div>
         
         <button onClick={() => setIsCreating(true)} className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 rounded-xl font-bold transition-all shadow-md hover:shadow-lg w-full md:w-auto">
            <PackagePlus size={20}/> <span className="whitespace-nowrap">Νέο Προϊόν</span>
         </button>
      </div>
      
      {/* FILTER BAR */}
      <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100 space-y-4">
          <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wide ml-1 mb-2 block">Φύλο</label>
              <div className="flex items-center gap-2 flex-wrap">
                  {genderFilters.map(filter => (
                      <button
                          key={filter.value}
                          onClick={() => setFilterGender(filter.value)}
                          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all border
                              ${filterGender === filter.value
                                  ? 'bg-slate-900 text-white border-slate-900 shadow-md'
                                  : 'bg-white text-slate-500 hover:bg-slate-50 border-slate-200'}
                          `}
                      >
                          {filter.icon}
                          {filter.label}
                      </button>
                  ))}
              </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
              <div className="relative group">
                  <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <select 
                     value={filterCategory}
                     onChange={(e) => setFilterCategory(e.target.value)}
                     className="pl-10 pr-10 py-3 border border-slate-200 rounded-xl focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none w-full bg-white appearance-none cursor-pointer text-slate-700 font-medium"
                  >
                      <option value="All">Όλες οι Κατηγορίες</option>
                      {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
              </div>
              <div className="relative group">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={20} />
                  <input 
                    type="text" 
                    placeholder="Αναζήτηση Κωδικού..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-12 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none w-full bg-white transition-all text-slate-900"
                  />
              </div>
          </div>
      </div>


      {/* Grid */}
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
          setPrintItems={setPrintItems || (() => {})} // Pass the prop function
          settings={settings}
          collections={collections}
          viewMode="registry" // Hides stock
        />
      )}
    </div>
  );
}