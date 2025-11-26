import React, { useState, useMemo } from 'react';
import { Product, Gender, Material, GlobalSettings, Collection, ProductVariant } from '../types';
import { Search, Filter, MapPin, Box, ArrowRight, ChevronDown, ChevronRight, Layers } from 'lucide-react';
import ProductDetails from './ProductDetails';
import { useUI } from './UIProvider';

interface Props {
  products: Product[];
  materials?: Material[];
  setPrintItems: (items: { product: Product; variant?: ProductVariant; quantity: number }[]) => void;
  settings: GlobalSettings;
  collections: Collection[];
}

export default function Inventory({ products, materials = [], setPrintItems, settings, collections }: Props) {
  const [filterType, setFilterType] = useState<string>('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const { showToast } = useUI();

  // Collapsed state for groups: Key = Category Name, Value = Boolean (true = collapsed)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = (category: string) => {
      setCollapsedGroups(prev => ({ ...prev, [category]: !prev[category] }));
  };

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
        // Search Logic
        const matchesSearch = p.sku.includes(searchTerm.toUpperCase()) || p.category.toLowerCase().includes(searchTerm.toLowerCase());
        
        // Filter Logic
        let matchesType = true;
        if (filterType === 'Men') matchesType = p.gender === Gender.Men;
        if (filterType === 'Women') matchesType = p.gender === Gender.Women;
        
        // Unisex should NOT show STX Components
        if (filterType === 'Unisex') matchesType = p.gender === Gender.Unisex && !p.is_component;
        
        // Components (STX) Only
        if (filterType === 'Components') matchesType = p.is_component;

        return matchesType && matchesSearch;
    });
  }, [products, searchTerm, filterType]);

  // Grouping Logic
  const groupedProducts = useMemo(() => {
      const groups: Record<string, Product[]> = {};
      filteredProducts.forEach(p => {
          const cat = p.category || 'Άλλο';
          if (!groups[cat]) groups[cat] = [];
          groups[cat].push(p);
      });
      return groups;
  }, [filteredProducts]);

  const groupKeys = Object.keys(groupedProducts).sort();

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
        <div>
           <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Αποθήκη</h1>
           <p className="text-slate-500 mt-1">Διαχείριση {filteredProducts.length} προϊόντων</p>
        </div>
        
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-amber-500 transition-colors" size={20} />
            <input 
              type="text" 
              placeholder="Αναζήτηση SKU..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-12 pr-4 py-3 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-amber-500/20 focus:border-amber-500 outline-none w-full md:w-64 bg-slate-50 focus:bg-white transition-all text-slate-900"
            />
          </div>
          
          <div className="relative group">
            <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-amber-500 transition-colors" size={20} />
            <select 
              value={filterType} 
              onChange={(e) => setFilterType(e.target.value)}
              className="pl-12 pr-10 py-3 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-amber-500/20 focus:border-amber-500 outline-none bg-slate-50 focus:bg-white text-slate-900 appearance-none cursor-pointer min-w-[200px] transition-all font-medium"
            >
              <option value="All">Όλα τα Προϊόντα</option>
              <option value="Men">Ανδρικά</option>
              <option value="Women">Γυναικεία</option>
              <option value="Unisex">Unisex</option>
              <option value="Components">Εξαρτήματα (STX)</option>
            </select>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
              <ArrowRight size={14} className="rotate-90" />
            </div>
          </div>
        </div>
      </div>

      {/* Grouped Grid */}
      <div className="space-y-8">
        {groupKeys.map(category => {
            const isCollapsed = collapsedGroups[category];
            const items = groupedProducts[category];
            
            return (
                <div key={category} className="animate-in slide-in-from-bottom-4 duration-500">
                    <button 
                        onClick={() => toggleGroup(category)}
                        className="flex items-center gap-3 w-full text-left mb-4 group focus:outline-none"
                    >
                        <div className={`p-1.5 rounded-lg transition-colors ${isCollapsed ? 'bg-slate-100 text-slate-500' : 'bg-amber-100 text-amber-600'}`}>
                            {isCollapsed ? <ChevronRight size={20}/> : <ChevronDown size={20}/>}
                        </div>
                        <h2 className="text-xl font-bold text-slate-700 flex items-center gap-3">
                            {category} 
                            <span className="text-xs px-2.5 py-1 bg-slate-100 rounded-full text-slate-500 font-bold">{items.length}</span>
                        </h2>
                        <div className="h-px bg-slate-200 flex-1 ml-4 group-hover:bg-slate-300 transition-colors" />
                    </button>
                    
                    {!isCollapsed && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-6 animate-in fade-in duration-300">
                            {items.map(product => {
                                // Calculate Total Stock (Master + Variants)
                                const variantStock = product.variants?.reduce((acc, v) => acc + v.stock_qty, 0) || 0;
                                const totalStock = product.stock_qty + variantStock;

                                return (
                                    <div 
                                    key={product.sku} 
                                    onClick={() => setSelectedProduct(product)}
                                    className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden hover:shadow-xl transition-all duration-300 cursor-pointer group hover:-translate-y-1.5"
                                    >
                                    <div className="aspect-square relative overflow-hidden bg-slate-50">
                                        <div className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/5 transition-colors z-10" />
                                        <img src={product.image_url} alt={product.sku} className="w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-500" />
                                        
                                        {/* Badges */}
                                        <div className="absolute top-3 right-3 flex flex-col items-end gap-2 z-20">
                                        <span className={`px-2.5 py-1 rounded-lg text-xs font-bold shadow-sm backdrop-blur-md ${totalStock > 0 ? 'bg-white/90 text-slate-800' : 'bg-red-500 text-white'}`}>
                                            {totalStock} τεμ
                                        </span>
                                        {product.is_component && (
                                            <span className="bg-blue-600/90 backdrop-blur-md text-white px-2.5 py-1 rounded-lg text-xs font-bold shadow-sm flex items-center gap-1">
                                                <Box size={12} /> STX
                                            </span>
                                        )}
                                        </div>
                                        
                                        {/* Mold Location Badge */}
                                        {product.molds && product.molds.length > 0 && (
                                            <div className="absolute bottom-3 left-3 bg-slate-900/80 text-white px-2.5 py-1 rounded-lg text-[10px] font-bold shadow-sm flex items-center gap-1 backdrop-blur-md z-20">
                                            <MapPin size={10} /> {product.molds[0]} {product.molds.length > 1 ? `+${product.molds.length - 1}` : ''}
                                            </div>
                                        )}
                                    </div>
                                    
                                    <div className="p-5">
                                        <div className="flex justify-between items-start mb-2">
                                        <h3 className="font-bold text-slate-800 text-lg tracking-tight group-hover:text-amber-600 transition-colors">{product.sku}</h3>
                                        </div>
                                        <p className="text-xs text-slate-500 mb-4 font-medium flex items-center gap-2">
                                            <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                                            {product.gender}
                                            <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                                            {product.weight_g}g
                                        </p>
                                        
                                        <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                                        <div className="flex flex-col">
                                            <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Τιμη Πωλησης</span>
                                            <span className="font-bold text-amber-600 text-lg">{product.selling_price > 0 ? product.selling_price.toFixed(2) + '€' : '-'}</span>
                                        </div>
                                        {!product.is_component && (
                                            <div className="flex flex-col items-end">
                                                <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Κοστος</span>
                                                <span className="text-xs text-slate-500 font-medium bg-slate-50 px-2 py-0.5 rounded-md">{product.active_price.toFixed(2)}€</span>
                                            </div>
                                        )}
                                        </div>
                                    </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            );
        })}
      </div>

      {filteredProducts.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400 bg-white rounded-3xl border border-slate-100 border-dashed">
          <Box size={48} className="mb-4 opacity-20" />
          <p className="font-medium">Δεν βρέθηκαν προϊόντα με αυτά τα κριτήρια.</p>
        </div>
      )}

      {/* Detail Modal */}
      {selectedProduct && (
        <ProductDetails 
          product={selectedProduct} 
          allProducts={products}
          allMaterials={materials}
          onClose={() => setSelectedProduct(null)}
          onSave={(p) => {
              setSelectedProduct(null);
              showToast(`Το προϊόν ${p.sku} αποθηκεύτηκε!`, 'success');
          }}
          setPrintItems={setPrintItems}
          settings={settings}
          collections={collections}
        />
      )}
    </div>
  );
}