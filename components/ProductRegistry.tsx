

import React, { useState, useMemo } from 'react';
import { Product, ProductVariant, GlobalSettings, Collection, Material, Mold } from '../types';
import { Search, Filter, ArrowRight, Layers, Tag, Database, Plus, Edit3, Coins, Weight, BookOpen, PackagePlus } from 'lucide-react';
import ProductDetails from './ProductDetails';
import NewProduct from './NewProduct';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/supabase';
import { calculateProductCost } from '../utils/pricingEngine';

interface Props {
    setPrintItems?: (items: { product: Product; variant?: ProductVariant; quantity: number }[]) => void;
}

export default function ProductRegistry({ setPrintItems }: Props) {
  const { data: products, isLoading: loadingProducts } = useQuery({ queryKey: ['products'], queryFn: api.getProducts });
  const { data: materials, isLoading: loadingMaterials } = useQuery({ queryKey: ['materials'], queryFn: api.getMaterials });
  const { data: molds, isLoading: loadingMolds } = useQuery({ queryKey: ['molds'], queryFn: api.getMolds });
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: api.getSettings });
  const { data: collections } = useQuery({ queryKey: ['collections'], queryFn: api.getCollections });

  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('All');
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
    return products.filter(p => {
        const matchesSearch = p.sku.includes(searchTerm.toUpperCase()) || p.category.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesCat = filterCategory === 'All' || p.category === filterCategory;
        return matchesCat && matchesSearch;
    });
  }, [products, searchTerm, filterCategory]);

  if (loadingProducts || loadingMaterials || loadingMolds || !settings || !products || !materials || !molds || !collections) {
      return null; // Parent loader handles this usually, or add loader here
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
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
         <div>
            <h1 className="text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-3">
                <div className="p-2 bg-indigo-100 text-indigo-600 rounded-xl">
                    <Database size={24} />
                </div>
                Μητρώο Κωδικών
            </h1>
            <p className="text-slate-500 mt-1 ml-14">Αποκλειστική διαχείριση προδιαγραφών και κοστολόγησης.</p>
         </div>
         
         <div className="flex gap-3 w-full md:w-auto">
             <button onClick={() => setIsCreating(true)} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 rounded-xl font-bold transition-all shadow-md hover:shadow-lg">
                <PackagePlus size={20}/> <span className="hidden sm:inline">Νέο Προϊόν</span>
             </button>
             
             <div className="relative group flex-1 md:flex-none">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={20} />
                <input 
                  type="text" 
                  placeholder="Αναζήτηση Κωδικού..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-12 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none w-full md:w-80 bg-slate-50 focus:bg-white transition-all text-slate-900"
                />
            </div>
            <div className="relative group flex-1 md:flex-none">
                <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                <select 
                   value={filterCategory}
                   onChange={(e) => setFilterCategory(e.target.value)}
                   className="pl-12 pr-10 py-3 border border-slate-200 rounded-xl focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none w-full md:w-48 bg-white appearance-none cursor-pointer"
                >
                    <option value="All">Όλες οι Κατηγορίες</option>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
            </div>
         </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-6">
          {filteredProducts.map(product => {
              const cost = calculateProductCost(product, settings, materials, products);
              
              return (
                <div 
                    key={product.sku} 
                    onClick={() => setSelectedProduct(product)}
                    className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden hover:shadow-xl transition-all duration-300 cursor-pointer group hover:-translate-y-1.5"
                >
                    <div className="aspect-square relative overflow-hidden bg-slate-50">
                        <img src={product.image_url} alt={product.sku} className="w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-500" />
                        <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm px-2 py-1 rounded-lg text-xs font-bold text-slate-700 shadow-sm border border-slate-200">
                            {product.category}
                        </div>
                        <div className="absolute inset-0 bg-indigo-900/0 group-hover:bg-indigo-900/10 transition-colors duration-300" />
                    </div>
                    
                    <div className="p-5">
                        <div className="flex justify-between items-start mb-2">
                            <h3 className="font-bold text-slate-800 text-lg tracking-tight group-hover:text-indigo-600 transition-colors">{product.sku}</h3>
                            <button className="text-slate-300 hover:text-indigo-600 transition-colors"><Edit3 size={16}/></button>
                        </div>
                        
                        <div className="flex items-center gap-4 text-xs text-slate-500 font-medium mb-4">
                            <div className="flex items-center gap-1 bg-slate-50 px-2 py-1 rounded">
                                <Weight size={12}/> {product.weight_g}g
                            </div>
                            <div className="flex items-center gap-1 bg-slate-50 px-2 py-1 rounded">
                                <BookOpen size={12}/> {product.recipe.length} υλικά
                            </div>
                        </div>

                        <div className="pt-3 border-t border-slate-100 flex justify-between items-end">
                            <div>
                                <span className="text-[10px] uppercase font-bold text-slate-400">Κοστος</span>
                                <div className="text-sm font-mono font-bold text-slate-600 flex items-center gap-1">
                                    <Coins size={12} className="text-slate-400"/> {cost.total.toFixed(2)}€
                                </div>
                            </div>
                            <div className="text-right">
                                <span className="text-[10px] uppercase font-bold text-slate-400">Χονδρικη</span>
                                <div className="text-lg font-black text-indigo-600">
                                    {product.selling_price > 0 ? product.selling_price.toFixed(2) + '€' : '-'}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
              );
          })}
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
