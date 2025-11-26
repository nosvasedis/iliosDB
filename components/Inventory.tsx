
import React, { useState } from 'react';
// FIX: Import ProductVariant to use in prop types.
import { Product, Gender, Material, GlobalSettings, Collection, ProductVariant } from '../types';
import { Search, Filter, MapPin, Box } from 'lucide-react';
import ProductDetails from './ProductDetails';

interface Props {
  products: Product[];
  materials?: Material[];
  // FIX: Updated setPrintItems prop to expect an array of items with a `quantity` property.
  setPrintItems: (items: { product: Product; variant?: ProductVariant; quantity: number }[]) => void;
  settings: GlobalSettings;
  collections: Collection[];
}

export default function Inventory({ products, materials = [], setPrintItems, settings, collections }: Props) {
  const [filterType, setFilterType] = useState<string>('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const filteredProducts = products.filter(p => {
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h1 className="text-2xl font-bold text-slate-800">Αποθήκη & Παραγωγή</h1>
        
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Αναζήτηση SKU..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none w-full bg-white text-slate-900"
            />
          </div>
          
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <select 
              value={filterType} 
              onChange={(e) => setFilterType(e.target.value)}
              className="pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none bg-white text-slate-900 appearance-none cursor-pointer min-w-[180px]"
            >
              <option value="All">Όλα τα Προϊόντα</option>
              <option value="Men">Ανδρικά</option>
              <option value="Women">Γυναικεία</option>
              <option value="Unisex">Unisex (Κοσμήματα)</option>
              <option value="Components">Εξαρτήματα (STX)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-6">
        {filteredProducts.map(product => {
          // Calculate Total Stock (Master + Variants)
          const variantStock = product.variants?.reduce((acc, v) => acc + v.stock_qty, 0) || 0;
          const totalStock = product.stock_qty + variantStock;

          return (
            <div 
              key={product.sku} 
              onClick={() => setSelectedProduct(product)}
              className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden hover:shadow-lg transition-all cursor-pointer group hover:-translate-y-1"
            >
              <div className="aspect-square relative overflow-hidden bg-slate-100">
                <img src={product.image_url} alt={product.sku} className="w-full h-full object-cover" />
                
                {/* Badges */}
                <div className="absolute top-2 right-2 flex flex-col items-end gap-1">
                  <span className={`px-2 py-1 rounded text-xs font-bold shadow-sm ${totalStock > 0 ? 'bg-white/90 text-slate-800' : 'bg-red-500 text-white'}`}>
                    {totalStock} τεμ
                  </span>
                  {product.is_component && (
                      <span className="bg-blue-600/90 text-white px-2 py-1 rounded text-xs font-bold shadow-sm flex items-center gap-1">
                        <Box size={10} /> STX
                      </span>
                  )}
                </div>
                
                {/* Mold Location Badge */}
                {product.molds && product.molds.length > 0 && (
                    <div className="absolute bottom-2 left-2 bg-slate-900/80 text-white px-2 py-1 rounded text-[10px] font-medium shadow-sm flex items-center gap-1 backdrop-blur-sm">
                      <MapPin size={10} /> {product.molds[0]} {product.molds.length > 1 ? `+${product.molds.length - 1}` : ''}
                    </div>
                )}
              </div>
              
              <div className="p-4">
                <div className="flex justify-between items-start mb-1">
                  <h3 className="font-bold text-slate-800">{product.sku}</h3>
                  <span className="text-xs px-2 py-0.5 bg-slate-100 rounded text-slate-600 truncate max-w-[80px]">{product.category}</span>
                </div>
                <p className="text-xs text-slate-500 mb-3">{product.gender} • {product.weight_g}g Ag</p>
                
                <div className="flex items-center justify-between border-t pt-2">
                  <div className="flex flex-col">
                    <span className="text-slate-400 text-[10px] uppercase">Πώληση</span>
                    <span className="font-bold text-amber-600">{product.selling_price > 0 ? product.selling_price.toFixed(2) + '€' : '-'}</span>
                  </div>
                  {!product.is_component && (
                      <div className="flex flex-col items-end">
                        <span className="text-slate-400 text-[10px] uppercase">Κόστος</span>
                        <span className="text-xs text-slate-500">{product.active_price.toFixed(2)}€</span>
                      </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filteredProducts.length === 0 && (
        <div className="text-center py-20 text-slate-400">
          Δεν βρέθηκαν προϊόντα με αυτά τα κριτήρια.
        </div>
      )}

      {/* Detail Modal */}
      {selectedProduct && (
        <ProductDetails 
          product={selectedProduct} 
          allProducts={products}
          allMaterials={materials}
          onClose={() => setSelectedProduct(null)}
          onSave={() => setSelectedProduct(null)}
          setPrintItems={setPrintItems}
          settings={settings}
          collections={collections}
        />
      )}
    </div>
  );
}
