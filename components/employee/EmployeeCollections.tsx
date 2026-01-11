
import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/supabase';
import { Collection, Product, ProductVariant, Warehouse } from '../../types';
import { FolderKanban, ArrowLeft, Search, Layers, ImageIcon, X } from 'lucide-react';
import EmployeeProductDetails from './EmployeeProductDetails';
import { formatCurrency } from '../../utils/pricingEngine';

interface Props {
    setPrintItems?: (items: { product: Product; variant?: ProductVariant; quantity: number, format?: 'standard' | 'simple' | 'retail' }[]) => void;
}

const ProductGridCard: React.FC<{ product: Product, onClick: () => void }> = ({ product, onClick }) => {
    const hasVariants = product.variants && product.variants.length > 0;
    const price = hasVariants 
        ? Math.min(...product.variants!.map(v => v.selling_price || 0).filter(p => p > 0)) 
        : product.selling_price;

    return (
        <div 
            onClick={onClick}
            className="group bg-white rounded-xl shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer overflow-hidden border border-slate-100 flex flex-col h-full"
        >
            <div className="aspect-[4/5] bg-slate-50 relative overflow-hidden">
                {product.image_url ? (
                    <img 
                        src={product.image_url} 
                        alt={product.sku} 
                        className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-700 ease-out" 
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-300">
                        <ImageIcon size={32} />
                    </div>
                )}
                <div className="absolute bottom-0 inset-x-0 p-3 bg-gradient-to-t from-black/60 to-transparent">
                    <h3 className="text-white font-black text-lg leading-none truncate drop-shadow-sm">{product.sku}</h3>
                    <p className="text-white/80 text-xs font-medium truncate">{product.category}</p>
                </div>
                {hasVariants && (
                    <div className="absolute top-2 right-2 bg-black/50 backdrop-blur-md text-white text-[10px] px-2 py-1 rounded-full flex items-center gap-1">
                        <Layers size={10} /> {product.variants!.length}
                    </div>
                )}
            </div>
            <div className="p-3 flex justify-between items-center bg-white">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Τιμή</span>
                <span className="text-emerald-700 font-black">{price > 0 ? formatCurrency(price) : '-'}</span>
            </div>
        </div>
    );
};

export default function EmployeeCollections({ setPrintItems }: Props) {
    const { data: collections, isLoading: loadingCol } = useQuery({ queryKey: ['collections'], queryFn: api.getCollections });
    const { data: products, isLoading: loadingProd } = useQuery({ queryKey: ['products'], queryFn: api.getProducts });
    const { data: warehouses } = useQuery({ queryKey: ['warehouses'], queryFn: api.getWarehouses });

    const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null);
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    const filteredProducts = useMemo(() => {
        if (!selectedCollection || !products) return [];
        return products
            .filter(p => 
                p.collections?.includes(selectedCollection.id) &&
                (p.sku.toLowerCase().includes(searchTerm.toLowerCase()) || p.category.toLowerCase().includes(searchTerm.toLowerCase()))
            )
            .sort((a, b) => a.sku.localeCompare(b.sku, undefined, { numeric: true, sensitivity: 'base' }));
    }, [selectedCollection, products, searchTerm]);

    if (loadingCol || loadingProd) return <div className="p-12 text-center text-slate-400">Φόρτωση...</div>;

    // View: Product Details
    if (selectedProduct && warehouses) {
        return (
            <EmployeeProductDetails 
                product={selectedProduct} 
                warehouses={warehouses} 
                onClose={() => setSelectedProduct(null)} 
                setPrintItems={setPrintItems} 
            />
        );
    }

    // View: Single Collection Products
    if (selectedCollection) {
        return (
            <div className="flex flex-col h-full space-y-6">
                <div className="flex items-center justify-between shrink-0">
                    <button onClick={() => setSelectedCollection(null)} className="flex items-center gap-2 text-slate-500 hover:text-slate-800 transition-colors font-bold group">
                        <div className="p-2 bg-white rounded-full shadow-sm group-hover:scale-110 transition-transform"><ArrowLeft size={20}/></div>
                        Πίσω στις Συλλογές
                    </button>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
                        <input 
                            type="text" 
                            placeholder="Αναζήτηση στη συλλογή..." 
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="pl-10 p-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500/20 w-64 shadow-sm"
                        />
                    </div>
                </div>

                <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm flex-1 flex flex-col overflow-hidden">
                    <div className="flex items-end justify-between mb-8 border-b border-slate-100 pb-4">
                        <div>
                            <h1 className="text-4xl font-black text-slate-900 tracking-tight mb-2">{selectedCollection.name}</h1>
                            <p className="text-slate-500 font-medium">Παρουσίαση {filteredProducts.length} προϊόντων</p>
                        </div>
                        <div className="hidden md:block text-slate-300">
                            <FolderKanban size={48} strokeWidth={1} />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                            {filteredProducts.map(p => (
                                <ProductGridCard key={p.sku} product={p} onClick={() => setSelectedProduct(p)} />
                            ))}
                            {filteredProducts.length === 0 && <div className="col-span-full text-center py-20 text-slate-400 italic">Δεν βρέθηκαν προϊόντα.</div>}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // View: All Collections (Magazine Cover Style)
    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold text-slate-800 flex items-center gap-3">
                    <FolderKanban className="text-emerald-600" /> Συλλογές
                </h1>
                <p className="text-slate-500 mt-2">Επιλέξτε μια συλλογή για προβολή.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                {collections?.map(collection => {
                    // Find a preview image from the first product in the collection
                    const previewProduct = products?.find(p => p.collections?.includes(collection.id) && p.image_url);
                    
                    return (
                        <div 
                            key={collection.id} 
                            onClick={() => setSelectedCollection(collection)}
                            className="group cursor-pointer relative bg-white rounded-[2rem] shadow-sm hover:shadow-2xl transition-all duration-500 overflow-hidden border border-slate-100 h-80 flex flex-col"
                        >
                            <div className="absolute inset-0 bg-slate-200">
                                {previewProduct?.image_url ? (
                                    <img src={previewProduct.image_url} className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110" alt="Cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center bg-slate-100 text-slate-300">
                                        <FolderKanban size={64} strokeWidth={1} />
                                    </div>
                                )}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-80 group-hover:opacity-90 transition-opacity" />
                            </div>
                            
                            <div className="relative z-10 mt-auto p-8 transform translate-y-2 group-hover:translate-y-0 transition-transform duration-300">
                                <h2 className="text-3xl font-black text-white mb-2 leading-tight tracking-tight">{collection.name}</h2>
                                <div className="h-1 w-12 bg-emerald-500 rounded-full mb-3 opacity-0 group-hover:opacity-100 transition-opacity duration-500 delay-100" />
                                <p className="text-white/80 text-sm font-medium flex items-center gap-2">
                                    <span>Δείτε την συλλογή</span> <ArrowLeft className="rotate-180" size={16}/>
                                </p>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
