
import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/supabase';
import { Collection, Product, ProductVariant } from '../../types';
import { FolderKanban, ArrowLeft, Search, Layers, ImageIcon, X, Sparkles, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatCurrency } from '../../utils/pricingEngine';

interface Props {
    products: Product[];
}

// Reusing ProductGridCard Logic adapted for Read-Only Seller
const ProductGridCard: React.FC<{ product: Product }> = ({ product }) => {
    const [viewIndex, setViewIndex] = useState(0);
    const variants = useMemo(() => product.variants || [], [product.variants]);
    const hasVariants = variants.length > 0;

    const currentVariant = hasVariants ? variants[viewIndex % variants.length] : null;

    const displaySku = currentVariant ? `${product.sku}${currentVariant.suffix}` : product.sku;
    const displayPrice = currentVariant ? (currentVariant.selling_price || 0) : (product.selling_price || 0);

    const nextVariant = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (hasVariants) setViewIndex(prev => (prev + 1) % variants.length);
    };

    const prevVariant = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (hasVariants) setViewIndex(prev => (prev - 1 + variants.length) % variants.length);
    };

    return (
        <div className="group bg-white rounded-xl shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden border border-slate-100 flex flex-col h-full relative">
            <div className="aspect-[4/5] bg-slate-50 relative overflow-hidden">
                {product.image_url ? (
                    <img 
                        src={product.image_url} 
                        alt={displaySku} 
                        className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-700 ease-out" 
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-300">
                        <ImageIcon size={32} />
                    </div>
                )}
                
                <div className="absolute bottom-0 inset-x-0 p-3 bg-gradient-to-t from-black/60 to-transparent">
                    <h3 className="text-white font-black text-lg leading-none truncate drop-shadow-sm">{displaySku}</h3>
                    <p className="text-white/80 text-xs font-medium truncate">{product.category}</p>
                </div>
                
                {hasVariants && variants.length > 1 && (
                    <div className="absolute top-2 right-2 flex bg-black/40 backdrop-blur-md rounded-lg p-0.5" onClick={e => e.stopPropagation()}>
                        <button onClick={prevVariant} className="p-1 hover:bg-white/20 text-white rounded transition-all">
                            <ChevronLeft size={12}/>
                        </button>
                        <button onClick={nextVariant} className="p-1 hover:bg-white/20 text-white rounded transition-all">
                            <ChevronRight size={12}/>
                        </button>
                    </div>
                )}
            </div>
            <div className="p-3 flex justify-between items-center bg-white">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Χονδρική</span>
                <span className="text-blue-700 font-black">{displayPrice > 0 ? formatCurrency(displayPrice) : '-'}</span>
            </div>
        </div>
    );
};

export default function SellerCollections({ products }: Props) {
    const { data: collections, isLoading } = useQuery({ queryKey: ['collections'], queryFn: api.getCollections });
    const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null);
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

    if (isLoading) return <div className="p-12 text-center text-slate-400">Φόρτωση...</div>;

    // View: Single Collection Products
    if (selectedCollection) {
        return (
            <div className="flex flex-col h-full space-y-6 p-4">
                <div className="flex items-center justify-between shrink-0">
                    <button onClick={() => setSelectedCollection(null)} className="flex items-center gap-2 text-slate-500 hover:text-slate-800 transition-colors font-bold group">
                        <div className="p-2 bg-white rounded-full shadow-sm group-hover:scale-110 transition-transform"><ArrowLeft size={20}/></div>
                        Πίσω
                    </button>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
                        <input 
                            type="text" 
                            placeholder="Αναζήτηση..." 
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="pl-10 p-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 w-48 shadow-sm"
                        />
                    </div>
                </div>

                <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm flex-1 flex flex-col overflow-hidden">
                    <div className="flex flex-col mb-6 border-b border-slate-100 pb-4">
                        <h1 className="text-3xl font-black text-slate-900 tracking-tight mb-2 flex items-center gap-3">
                            {selectedCollection.name}
                            <span className="bg-slate-100 text-slate-500 text-sm font-bold px-3 py-1 rounded-full border border-slate-200">{filteredProducts.length} items</span>
                        </h1>
                        
                        {selectedCollection.description && (
                            <div className="relative pl-6 py-2">
                                <div className="absolute left-0 top-0 text-blue-200"><Sparkles size={24} /></div>
                                <p className="text-sm font-serif italic text-slate-600 leading-relaxed">
                                    "{selectedCollection.description}"
                                </p>
                            </div>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 pb-20">
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                            {filteredProducts.map(p => (
                                <ProductGridCard key={p.sku} product={p} />
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
        <div className="space-y-8 p-4 pb-24">
            <div>
                <h1 className="text-3xl font-bold text-slate-800 flex items-center gap-3">
                    <FolderKanban className="text-blue-600" /> Συλλογές
                </h1>
                <p className="text-slate-500 mt-2">Προτάσεις και επιλογές για εσάς.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                {collections?.map(collection => {
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
                                {collection.description && (
                                    <p className="text-white/70 text-xs line-clamp-2 font-serif italic mb-3 opacity-0 group-hover:opacity-100 transition-opacity duration-500 delay-75">
                                        {collection.description}
                                    </p>
                                )}
                                <div className="h-1 w-12 bg-blue-500 rounded-full mb-3 opacity-0 group-hover:opacity-100 transition-opacity duration-500 delay-100" />
                                <p className="text-white/80 text-sm font-medium flex items-center gap-2">
                                    <span>Προβολή</span> <ArrowLeft className="rotate-180" size={16}/>
                                </p>
                            </div>
                        </div>
                    );
                })}
                {collections?.length === 0 && (
                    <div className="col-span-full text-center py-20 text-slate-400">
                        Δεν υπάρχουν συλλογές.
                    </div>
                )}
            </div>
        </div>
    );
}