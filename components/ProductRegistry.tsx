
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { FixedSizeGrid as Grid } from 'react-window';
import { Product, ProductVariant, GlobalSettings, Collection, Material, Mold, Gender, MaterialType, PlatingType } from '../types';
import { Search, Filter, Layers, Database, PackagePlus, ImageIcon, User, Users as UsersIcon, Edit3, TrendingUp, Weight, BookOpen, Coins, ChevronLeft, ChevronRight, Tag, Puzzle, Gem, Palette, X } from 'lucide-react';
import ProductDetails from './ProductDetails';
import NewProduct from './NewProduct';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/supabase';
import { calculateProductCost, getVariantComponents, formatCurrency } from '../utils/pricingEngine';
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

const ProductCard: React.FC<{
    product: Product;
    onClick: () => void;
    settings: GlobalSettings;
    materials: Material[];
    allProducts: Product[];
    style?: React.CSSProperties;
}> = ({ product, onClick, settings, materials, allProducts, style }) => {
    const [viewIndex, setViewIndex] = useState(0); 
    const variants = product.variants || [];
    const sortedVariants = useMemo(() => [...variants].sort((a, b) => a.suffix.localeCompare(b.suffix)), [variants]);
    const variantCount = variants.length;
    let currentVariant = variantCount > 0 ? sortedVariants[viewIndex % variantCount] : null;
    const masterCost = calculateProductCost(product, settings, materials, allProducts).total;
    let displayPrice = product.selling_price;
    let displayCost = masterCost;
    let displaySku = product.sku;
    let displayLabel = 'Βασικό';
    if (currentVariant) {
        displaySku = `${product.sku}${currentVariant.suffix}`;
        displayLabel = currentVariant.description || currentVariant.suffix;
        if (currentVariant.selling_price) displayPrice = currentVariant.selling_price;
        if (currentVariant.active_price) displayCost = currentVariant.active_price;
    }
    const margin = displayPrice > 0 ? ((displayPrice - displayCost) / displayPrice * 100) : 0;
    const totalWeight = product.weight_g + (product.secondary_weight_g || 0);

    return (
        <div style={style} className="p-3">
        <div onClick={onClick} className="group bg-white h-full rounded-3xl border border-slate-100 shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer flex flex-col overflow-hidden hover:-translate-y-1 relative">
            {variantCount > 0 && <div className="absolute top-3 left-3 z-10 bg-[#060b00]/90 backdrop-blur-md text-white text-[10px] font-bold px-2 py-1.5 rounded-full flex items-center gap-1.5 shadow-sm border border-white/10"><Layers size={10} className="text-amber-400" /><span>{variantCount}</span></div>}
            <div className="aspect-square bg-slate-50 relative overflow-hidden">
                {product.image_url ? <img src={product.image_url} loading="lazy" alt={product.sku} className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-700" /> : <div className="w-full h-full flex items-center justify-center text-slate-300"><ImageIcon size={40} /></div>}
                <div className="absolute bottom-3 left-3 z-10 bg-white/90 backdrop-blur-md text-slate-600 text-[10px] font-bold px-2 py-1 rounded-lg shadow-sm border border-slate-100 max-w-[calc(100%-1.5rem)] truncate">{product.category}</div>
            </div>
            <div className="p-5 flex-1 flex flex-col relative">
                <div className="flex justify-between items-start mb-3"><div className="min-w-0 pr-2"><h3 className="font-black text-lg leading-none truncate text-slate-800 group-hover:text-emerald-700 transition-colors">{displaySku}</h3><div className="text-xs font-bold text-slate-400 mt-1 truncate flex items-center gap-1">{currentVariant && <Tag size={10} />} {displayLabel}</div></div></div>
                <div className="flex gap-2 mb-4"><div className="bg-slate-50 px-2 py-1 rounded text-[10px] font-bold text-slate-500 flex items-center gap-1 border border-slate-100"><Weight size={10}/> {totalWeight.toFixed(2)}g</div></div>
                <div className="mt-auto pt-3 border-t border-slate-100 grid grid-cols-2 gap-4 items-end">
                    <div><div className="text-[9px] uppercase font-bold text-slate-400 mb-0.5">Χονδρικη</div><div className={`text-xl font-black leading-none ${displayPrice > 0 ? 'text-[#060b00]' : 'text-slate-300'}`}>{displayPrice > 0 ? formatCurrency(displayPrice) : '-'}</div></div>
                    <div className="text-right"><div className="text-[9px] uppercase font-bold text-slate-400 mb-0.5">Περιθωριο</div><div className={`flex items-center justify-end gap-1 font-bold text-sm ${margin < 30 ? 'text-red-500' : 'text-emerald-600'}`}>{displayPrice > 0 ? <><TrendingUp size={12} />{margin.toFixed(0)}%</> : '-'}</div></div>
                </div>
            </div>
        </div>
        </div>
    );
};

export default function ProductRegistry({ setPrintItems }: Props) {
  const queryClient = useQueryClient();
  const { data: products } = useQuery({ queryKey: ['products'], queryFn: api.getProducts });
  const { data: materials } = useQuery({ queryKey: ['materials'], queryFn: api.getMaterials });
  const { data: molds } = useQuery({ queryKey: ['molds'], queryFn: api.getMolds });
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: api.getSettings });
  const { data: collections } = useQuery({ queryKey: ['collections'], queryFn: api.getCollections });
  const [searchTerm, setSearchTerm] = useState('');
  const [filterParentCategory, setFilterParentCategory] = useState<string>('All');
  const [filterGender, setFilterGender] = useState<'All' | Gender>('All');
  const [subFilters, setSubFilters] = useState({ category: 'all', stone: 'all', plating: 'all' });
  const [showSubFilters, setShowSubFilters] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [showStxOnly, setShowStxOnly] = useState(false);
  const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight });

  useEffect(() => {
    const handleResize = () => setDimensions({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const baseProducts = useMemo(() => products?.filter(p => showStxOnly ? p.is_component : !p.is_component) || [], [products, showStxOnly]);

  const filteredProducts = useMemo(() => {
    if (!baseProducts || !materials) return [];
    return baseProducts.filter(p => {
        if (filterGender !== 'All' && p.gender !== filterGender) return false;
        if (filterParentCategory !== 'All' && !p.category.startsWith(filterParentCategory)) return false;
        if (searchTerm && !p.sku.toUpperCase().includes(searchTerm.toUpperCase())) return false;
        return true;
    }).sort((a,b) => a.sku.localeCompare(b.sku, undefined, { numeric: true }));
  }, [baseProducts, searchTerm, filterParentCategory, filterGender, materials]);

  const columnCount = dimensions.width > 1280 ? 5 : dimensions.width > 1024 ? 4 : dimensions.width > 768 ? 3 : dimensions.width > 480 ? 2 : 1;
  const rowCount = Math.ceil(filteredProducts.length / columnCount);
  const gridWidth = Math.min(1600, dimensions.width - (dimensions.width > 768 ? 350 : 64));

  const Cell = ({ columnIndex, rowIndex, style }: any) => {
    const product = filteredProducts[rowIndex * columnCount + columnIndex];
    if (!product) return null;
    return <ProductCard product={product} onClick={() => setSelectedProduct(product)} settings={settings!} materials={materials!} allProducts={products!} style={style} />;
  };

  if (isCreating) return <NewProduct products={products!} materials={materials!} molds={molds} onCancel={() => setIsCreating(false)} />;

  return (
    <div className="space-y-6 flex flex-col h-full overflow-hidden">
      <div className="shrink-0 space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                <h1 className="text-3xl font-bold text-[#060b00] tracking-tight flex items-center gap-3"><div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl"><Database size={24} /></div> Μητρώο Κωδικών</h1>
            </div>
            <div className="flex items-center gap-3 self-stretch md:self-auto w-full md:w-auto">
                <button onClick={() => setIsCreating(true)} className="flex items-center justify-center gap-2 bg-[#060b00] hover:bg-black text-white px-5 py-3 rounded-xl font-bold transition-all shadow-md w-full md:w-auto"><PackagePlus size={20}/> Νέο Προϊόν</button>
            </div>
        </div>
        <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100 flex gap-4">
            <div className="relative group flex-1"><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} /><input type="text" placeholder="Αναζήτηση Κωδικού..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-12 pr-4 py-3 border border-slate-200 rounded-xl outline-none w-full bg-white transition-all text-slate-900" /></div>
        </div>
      </div>
      
      <div className="flex-1 bg-white rounded-3xl overflow-hidden border border-slate-100">
          {filteredProducts.length > 0 ? (
            <Grid columnCount={columnCount} columnWidth={gridWidth / columnCount} height={dimensions.height - 300} rowCount={rowCount} rowHeight={450} width={gridWidth}>
              {Cell}
            </Grid>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-slate-300 italic"><Database size={48} className="mb-4 opacity-10"/><p>Δεν βρέθηκαν προϊόντα.</p></div>
          )}
      </div>

      {selectedProduct && <ProductDetails product={selectedProduct} allProducts={products!} allMaterials={materials!} onClose={() => setSelectedProduct(null)} setPrintItems={setPrintItems || (() => {})} settings={settings!} collections={collections!} allMolds={molds!} viewMode="registry" />}
    </div>
  );
}
