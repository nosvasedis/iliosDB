import React, { useState, useMemo, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/supabase';
import { Collection, Product, Gender } from '../../types';
import { FolderKanban, ArrowLeft, Search, ImageIcon, Sparkles, ChevronLeft, ChevronRight, ShoppingBag, Expand } from 'lucide-react';
import { formatCurrency, getVariantComponents } from '../../utils/pricingEngine';
import SellerImageLightbox from './SellerImageLightbox';

// ─── Color coding constants ─────────────────────────────────────────────────────
const FINISH_COLORS: Record<string, string> = {
    'X': 'text-amber-500',
    'P': 'text-slate-500',
    'D': 'text-orange-500',
    'H': 'text-cyan-400',
    '': 'text-slate-400'
};

const STONE_TEXT_COLORS: Record<string, string> = {
    'KR': 'text-rose-600', 'QN': 'text-slate-900', 'LA': 'text-blue-600', 'TY': 'text-teal-500',
    'TG': 'text-orange-700', 'IA': 'text-red-700', 'BSU': 'text-slate-800', 'GSU': 'text-emerald-800',
    'RSU': 'text-rose-800', 'MA': 'text-emerald-600', 'FI': 'text-slate-400', 'OP': 'text-indigo-500',
    'NF': 'text-green-700', 'CO': 'text-teal-600', 'TPR': 'text-emerald-500', 'TKO': 'text-rose-600',
    'TMP': 'text-blue-600', 'PCO': 'text-emerald-400', 'MCO': 'text-purple-500', 'PAX': 'text-green-600',
    'MAX': 'text-blue-700', 'KAX': 'text-red-700', 'AI': 'text-slate-600', 'AP': 'text-cyan-600',
    'AM': 'text-teal-700', 'LR': 'text-indigo-700', 'BST': 'text-sky-500', 'MP': 'text-blue-500',
    'LE': 'text-slate-400', 'PR': 'text-green-500', 'KO': 'text-red-500', 'MV': 'text-purple-500',
    'RZ': 'text-pink-500', 'AK': 'text-cyan-400', 'XAL': 'text-stone-500'
};

// ─── SKU Color Coding Component ─────────────────────────────────────────────
const SkuColored = ({ sku, suffix, gender }: { sku: string; suffix?: string; gender: Gender }) => {
    const { finish, stone } = getVariantComponents(suffix || '', gender);
    const fColor = FINISH_COLORS[finish.code] || 'text-slate-400';
    const sColor = STONE_TEXT_COLORS[stone.code] || 'text-emerald-500';
    return (
        <span className="font-black">
            <span className="text-slate-900">{sku}</span>
            <span className={fColor}>{finish.code}</span>
            <span className={sColor}>{stone.code}</span>
        </span>
    );
};

interface Props {
    products: Product[];
    /** When provided, shows an "Εισαγωγή στην παραγγελία" mode — clicking a variant adds it */
    onAddToOrder?: (product: Product, variantSuffix?: string) => void;
}

// ─── Product Grid Card with swipe functionality ───────────────────────────────────
const ProductGridCard: React.FC<{
    product: Product;
    onAddToOrder?: (product: Product, variantSuffix?: string) => void;
}> = ({ product, onAddToOrder }) => {
    const [viewIndex, setViewIndex] = useState(0);
    const [slideDir, setSlideDir] = useState<'left' | 'right' | null>(null);
    const [dragOffset, setDragOffset] = useState(0);
    const touchStartX = useRef<number | null>(null);
    const isAnimating = useRef(false);

    const variants = useMemo(() => product.variants || [], [product.variants]);
    const hasVariants = variants.length > 0;
    const currentVariant = hasVariants ? variants[viewIndex % variants.length] : null;

    const displaySku = currentVariant ? `${product.sku}${currentVariant.suffix}` : product.sku;
    const displayPrice = currentVariant
        ? (currentVariant.selling_price || 0)
        : (product.selling_price || 0);

    const goToIndex = useCallback((newIdx: number, dir: 'left' | 'right') => {
        if (isAnimating.current || newIdx === viewIndex) return;
        isAnimating.current = true;
        setSlideDir(dir);
        setTimeout(() => {
            setViewIndex(newIdx);
            setSlideDir(null);
            isAnimating.current = false;
        }, 180);
    }, [viewIndex]);

    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        if (!hasVariants || variants.length <= 1) return;
        touchStartX.current = e.touches[0].clientX;
        setDragOffset(0);
    }, [hasVariants, variants.length]);

    const handleTouchMove = useCallback((e: React.TouchEvent) => {
        if (touchStartX.current === null) return;
        const delta = e.touches[0].clientX - touchStartX.current;
        setDragOffset(Math.max(-90, Math.min(90, delta)));
    }, []);

    const handleTouchEnd = useCallback(() => {
        if (touchStartX.current === null) return;
        const d = dragOffset;
        if (d < -35) goToIndex((viewIndex + 1) % variants.length, 'left');
        else if (d > 35) goToIndex((viewIndex - 1 + variants.length) % variants.length, 'right');
        touchStartX.current = null;
        setDragOffset(0);
    }, [dragOffset, viewIndex, variants.length, goToIndex]);

    const nextVariant = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (hasVariants) goToIndex((viewIndex + 1) % variants.length, 'left');
    };
    const prevVariant = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (hasVariants) goToIndex((viewIndex - 1 + variants.length) % variants.length, 'right');
    };

    const handleAdd = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (onAddToOrder) {
            onAddToOrder(product, currentVariant?.suffix);
        }
    };

    const [showLightbox, setShowLightbox] = useState(false);

    // Animated info strip classes
    const infoClass = slideDir === 'left'
        ? '-translate-x-full opacity-0'
        : slideDir === 'right'
            ? 'translate-x-full opacity-0'
            : 'translate-x-0 opacity-100';

    return (
        <>
            {showLightbox && (
                <SellerImageLightbox
                    item={{ product, variantIndex: viewIndex }}
                    onClose={() => setShowLightbox(false)}
                />
            )}
            <div className="group bg-white rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden border border-slate-100 flex flex-col h-full relative">
                {/* Image with touch support */}
                <div
                    className="aspect-[4/5] bg-slate-50 relative overflow-hidden"
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                    style={{ transform: `translateX(${dragOffset * 0.25}px)`, transition: dragOffset === 0 ? 'transform 0.2s ease-out' : 'none' }}
                >
                    {product.image_url ? (
                        <img
                            src={product.image_url}
                            alt={displaySku}
                            className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-700 ease-out cursor-zoom-in"
                            onClick={(e) => { e.stopPropagation(); setShowLightbox(true); }}
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-300">
                            <ImageIcon size={32} />
                        </div>
                    )}

                    {/* Swipe direction hint during drag */}
                    {Math.abs(dragOffset) > 20 && variants.length > 1 && (
                        <div className={`absolute top-1/2 -translate-y-1/2 z-30 ${dragOffset > 0 ? 'left-2' : 'right-2'}`}>
                            <div className="bg-white/80 backdrop-blur-sm rounded-full p-1 shadow">
                                {dragOffset > 0
                                    ? <ChevronLeft size={12} className="text-slate-700" />
                                    : <ChevronRight size={12} className="text-slate-700" />
                                }
                            </div>
                        </div>
                    )}

                    {/* Zoom hint on hover */}
                    <button
                        onClick={(e) => { e.stopPropagation(); setShowLightbox(true); }}
                        className="absolute top-2 left-2 z-20 bg-black/40 hover:bg-black/60 backdrop-blur-sm text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-all active:scale-90"
                    >
                        <Expand size={13} />
                    </button>

                    {/* SKU overlay with animation */}
                    <div className="absolute bottom-0 inset-x-0 p-3 bg-gradient-to-t from-black/70 to-transparent">
                        <div className={`transition-all duration-[180ms] ease-out ${infoClass}`}>
                            <h3 className="text-white font-black text-sm leading-none truncate drop-shadow-sm">
                                <SkuColored sku={product.sku} suffix={currentVariant?.suffix || ''} gender={product.gender} />
                            </h3>
                            <p className="text-white/70 text-[10px] font-medium truncate mt-0.5">{product.category}</p>
                        </div>
                    </div>

                    {/* Variant navigation */}
                    {hasVariants && variants.length > 1 && (
                        <div className="absolute top-2 right-2 flex bg-black/40 backdrop-blur-md rounded-lg p-0.5" onClick={e => e.stopPropagation()}>
                            <button onClick={prevVariant} className="p-1 hover:bg-white/20 text-white rounded transition-all">
                                <ChevronLeft size={12} />
                            </button>
                            <span className="text-white text-[9px] font-black px-1 flex items-center">
                                {viewIndex % variants.length + 1}/{variants.length}
                            </span>
                            <button onClick={nextVariant} className="p-1 hover:bg-white/20 text-white rounded transition-all">
                                <ChevronRight size={12} />
                            </button>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-3 flex justify-between items-center bg-white">
                    <span className="font-black text-[#060b00] text-sm">
                        {displayPrice > 0 ? formatCurrency(displayPrice) : '-'}
                    </span>
                    {onAddToOrder && (
                        <button
                            onClick={handleAdd}
                            className="bg-[#060b00] text-amber-400 p-1.5 rounded-lg active:scale-95 transition-transform shadow-sm"
                        >
                            <ShoppingBag size={14} />
                        </button>
                    )}
                </div>
            </div>
        </>
    );
};

// ─── Main Component ───────────────────────────────────────────────────────────
export default function SellerCollections({ products, onAddToOrder }: Props) {
    const { data: collections, isLoading } = useQuery({ queryKey: ['collections'], queryFn: api.getCollections });
    const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    const filteredProducts = useMemo(() => {
        if (!selectedCollection || !products) return [];
        return products
            .filter(p =>
                p.collections?.includes(selectedCollection.id) &&
                !p.is_component &&
                (p.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    p.category.toLowerCase().includes(searchTerm.toLowerCase()))
            )
            .sort((a, b) => a.sku.localeCompare(b.sku, undefined, { numeric: true, sensitivity: 'base' }));
    }, [selectedCollection, products, searchTerm]);

    if (isLoading) return (
        <div className="p-12 text-center text-slate-400 font-bold">Φόρτωση...</div>
    );

    // ── Collection Products View ───────────────────────────────────────────────
    if (selectedCollection) {
        return (
            <div className="flex flex-col h-full p-4 space-y-4">
                {/* Header */}
                <div className="flex items-center justify-between shrink-0 gap-3">
                    <button
                        onClick={() => { setSelectedCollection(null); setSearchTerm(''); }}
                        className="flex items-center gap-2 text-slate-500 hover:text-slate-800 transition-colors font-bold group"
                    >
                        <div className="p-2 bg-white rounded-full shadow-sm group-hover:scale-110 transition-transform">
                            <ArrowLeft size={18} />
                        </div>
                        Πίσω
                    </button>
                    <div className="relative flex-1 max-w-[200px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                        <input
                            type="text"
                            placeholder="Αναζήτηση..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full pl-9 p-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-400/20 text-sm font-medium shadow-sm"
                        />
                    </div>
                </div>

                {/* Collection title */}
                <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm shrink-0">
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-black text-slate-900 leading-tight">{selectedCollection.name}</h1>
                        <span className="bg-slate-100 text-slate-500 text-xs font-black px-3 py-1 rounded-full border border-slate-200">
                            {filteredProducts.length} {filteredProducts.length === 1 ? 'είδος' : 'είδη'}
                        </span>
                    </div>
                    {selectedCollection.description && (
                        <div className="flex items-start gap-3 mt-3 pt-3 border-t border-slate-50">
                            <Sparkles size={16} className="text-blue-300 mt-0.5 shrink-0" />
                            <p className="text-sm font-serif italic text-slate-500 leading-relaxed">
                                "{selectedCollection.description}"
                            </p>
                        </div>
                    )}
                </div>

                {/* Product Grid */}
                <div className="flex-1 overflow-y-auto custom-scrollbar pb-28 landscape:pb-8">
                    <div className="grid grid-cols-2 sm:grid-cols-3 landscape:grid-cols-4 xl:grid-cols-5 gap-4">
                        {filteredProducts.map(p => (
                            <ProductGridCard key={p.sku} product={p} onAddToOrder={onAddToOrder} />
                        ))}
                        {filteredProducts.length === 0 && (
                            <div className="col-span-full text-center py-20 text-slate-400 italic text-sm">
                                Δεν βρέθηκαν προϊόντα.
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // ── Collections List View ──────────────────────────────────────────────────
    return (
        <div className="space-y-6 p-4 pb-28 landscape:pb-8">
            <div>
                <h1 className="text-3xl font-black text-slate-800 flex items-center gap-3">
                    <FolderKanban className="text-blue-500" /> Συλλογές
                </h1>
                <p className="text-slate-400 mt-1 text-sm font-medium">Προτάσεις και επιλογές για εσάς.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 landscape:grid-cols-3 xl:grid-cols-4 gap-6">
                {collections?.map(collection => {
                    const previewProduct = products?.find(p => p.collections?.includes(collection.id) && p.image_url);
                    const count = products?.filter(p => p.collections?.includes(collection.id) && !p.is_component).length || 0;

                    return (
                        <div
                            key={collection.id}
                            onClick={() => setSelectedCollection(collection)}
                            className="group cursor-pointer relative bg-white rounded-[2rem] shadow-sm hover:shadow-2xl transition-all duration-500 overflow-hidden border border-slate-100 h-72 flex flex-col"
                        >
                            {/* Background image */}
                            <div className="absolute inset-0 bg-slate-200">
                                {previewProduct?.image_url ? (
                                    <img src={previewProduct.image_url} className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110" alt="Cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 text-slate-300">
                                        <FolderKanban size={64} strokeWidth={1} />
                                    </div>
                                )}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent opacity-85 group-hover:opacity-95 transition-opacity" />
                            </div>

                            {/* Content */}
                            <div className="relative z-10 mt-auto p-6 transform translate-y-2 group-hover:translate-y-0 transition-transform duration-300">
                                <span className="text-white/60 text-[10px] font-black uppercase tracking-widest mb-2 block">
                                    {count} {count === 1 ? 'είδος' : 'είδη'}
                                </span>
                                <h2 className="text-2xl font-black text-white mb-2 leading-tight tracking-tight">
                                    {collection.name}
                                </h2>
                                {collection.description && (
                                    <p className="text-white/70 text-xs line-clamp-2 font-serif italic mb-3 opacity-0 group-hover:opacity-100 transition-opacity duration-500 delay-75">
                                        {collection.description}
                                    </p>
                                )}
                                <div className="h-0.5 w-10 bg-amber-400 rounded-full mb-3 opacity-0 group-hover:opacity-100 transition-all duration-500 delay-100 group-hover:w-14" />
                                <p className="text-white/80 text-xs font-bold flex items-center gap-2">
                                    <span>Προβολή</span>
                                    <ArrowLeft className="rotate-180" size={14} />
                                </p>
                            </div>
                        </div>
                    );
                })}
                {collections?.length === 0 && (
                    <div className="col-span-full text-center py-20 text-slate-400 font-medium">
                        Δεν υπάρχουν συλλογές.
                    </div>
                )}
            </div>
        </div>
    );
}