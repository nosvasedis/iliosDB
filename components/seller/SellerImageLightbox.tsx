
import React, { useEffect } from 'react';
import { X, ZoomIn, ZoomOut, ChevronLeft, ChevronRight, ImageIcon } from 'lucide-react';
import { Product, ProductVariant } from '../../types';
import { formatCurrency, getVariantComponents } from '../../utils/pricingEngine';

interface LightboxItem {
    product: Product;
    variantIndex?: number; // which variant to show first
}

interface Props {
    item: LightboxItem;
    onClose: () => void;
}

const FINISH_COLORS: Record<string, string> = {
    'X': 'bg-amber-100 text-amber-800 border-amber-300',
    'P': 'bg-stone-100 text-stone-700 border-stone-300',
    'D': 'bg-orange-100 text-orange-800 border-orange-300',
    'H': 'bg-cyan-100 text-cyan-800 border-cyan-300',
    '': 'bg-emerald-50 text-emerald-800 border-emerald-200',
};

const STONE_TEXT_COLORS: Record<string, string> = {
    'KR': 'text-rose-500', 'QN': 'text-slate-900', 'LA': 'text-blue-500', 'TY': 'text-teal-500',
    'TG': 'text-orange-700', 'IA': 'text-red-700', 'BSU': 'text-slate-700', 'GSU': 'text-emerald-700',
    'RSU': 'text-rose-800', 'MA': 'text-emerald-500', 'FI': 'text-slate-400', 'OP': 'text-indigo-500',
    'NF': 'text-green-600', 'CO': 'text-teal-600', 'TPR': 'text-emerald-500', 'TKO': 'text-rose-600',
    'TMP': 'text-blue-600', 'PCO': 'text-emerald-400', 'MCO': 'text-purple-500', 'PAX': 'text-green-600',
    'MAX': 'text-blue-700', 'KAX': 'text-red-700', 'AI': 'text-slate-600', 'AP': 'text-cyan-600',
    'AM': 'text-teal-700', 'LR': 'text-indigo-700', 'BST': 'text-sky-500', 'MP': 'text-blue-500',
    'LE': 'text-slate-400', 'PR': 'text-green-500', 'KO': 'text-red-500', 'MV': 'text-purple-500',
    'RZ': 'text-pink-500', 'AK': 'text-cyan-400', 'XAL': 'text-stone-500'
};

export default function SellerImageLightbox({ item, onClose }: Props) {
    const { product } = item;
    const variants = product.variants || [];
    const hasVariants = variants.length > 0;

    const [variantIdx, setVariantIdx] = React.useState(item.variantIndex ?? 0);

    const currentVariant: ProductVariant | null = hasVariants ? (variants[variantIdx] ?? null) : null;
    const displaySku = currentVariant ? `${product.sku}${currentVariant.suffix}` : product.sku;
    const displayPrice = currentVariant
        ? (currentVariant.selling_price || product.selling_price || 0)
        : (product.selling_price || 0);
    const stockQty = currentVariant ? currentVariant.stock_qty : product.stock_qty;

    // Suffix badge rendering
    const { finish, stone } = getVariantComponents(currentVariant?.suffix || '', product.gender);
    const finishLabel = (!finish.code || finish.code === '') ? 'Λουστρέ' : finish.code;
    const badgeColor = FINISH_COLORS[finish.code] || 'bg-slate-100 text-slate-700 border-slate-200';
    const stoneColor = STONE_TEXT_COLORS[stone.code] || 'text-slate-700';

    // Close on Escape
    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    // Prevent body scroll
    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = ''; };
    }, []);

    const prevVariant = () => setVariantIdx(i => (i - 1 + variants.length) % variants.length);
    const nextVariant = () => setVariantIdx(i => (i + 1) % variants.length);

    return (
        <div
            className="fixed inset-0 z-[500] bg-black/95 flex flex-col items-center justify-center animate-in fade-in duration-200"
            onClick={onClose}
        >
            {/* Close button */}
            <button
                onClick={onClose}
                className="absolute top-4 right-4 w-11 h-11 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center text-white transition-colors z-10"
            >
                <X size={22} />
            </button>

            {/* SKU header */}
            <div className="absolute top-4 left-4 z-10" onClick={e => e.stopPropagation()}>
                <div className="text-white font-black text-xl tracking-tight drop-shadow-lg">
                    <span className="text-white">{product.sku}</span>
                    {currentVariant && (
                        <>
                            <span className={`${FINISH_COLORS[finish.code]?.replace('bg-', 'text-').replace('-100', '-300').replace('-50', '-300') || 'text-amber-300'} ml-0.5`}>
                                {finish.code}
                            </span>
                            <span className={`${stoneColor.replace('600', '400').replace('700', '400').replace('800', '400').replace('900', '200')} `}>
                                {stone.code}
                            </span>
                        </>
                    )}
                </div>
                <div className="text-white/50 text-xs font-bold mt-0.5">{product.category}</div>
            </div>

            {/* Main image — takes up full screen, tapping doesn't close */}
            <div
                className="relative w-full h-full flex items-center justify-center p-4 landscape:px-24"
                onClick={e => e.stopPropagation()}
            >
                {product.image_url ? (
                    <img
                        src={product.image_url}
                        alt={displaySku}
                        className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl select-none"
                        draggable={false}
                    />
                ) : (
                    <div className="w-64 h-64 bg-white/10 rounded-3xl flex flex-col items-center justify-center gap-4 text-white/40">
                        <ImageIcon size={64} strokeWidth={1} />
                        <span className="text-sm font-bold">Χωρίς εικόνα</span>
                    </div>
                )}

                {/* Variant nav arrows (shown when multiple variants exist) */}
                {hasVariants && variants.length > 1 && (
                    <>
                        <button
                            onClick={prevVariant}
                            className="absolute left-2 landscape:left-6 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/10 hover:bg-white/25 backdrop-blur-sm rounded-full flex items-center justify-center text-white transition-all active:scale-95"
                        >
                            <ChevronLeft size={24} />
                        </button>
                        <button
                            onClick={nextVariant}
                            className="absolute right-2 landscape:right-6 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/10 hover:bg-white/25 backdrop-blur-sm rounded-full flex items-center justify-center text-white transition-all active:scale-95"
                        >
                            <ChevronRight size={24} />
                        </button>
                    </>
                )}
            </div>

            {/* Bottom info bar */}
            <div
                className="absolute bottom-0 inset-x-0 p-5 flex items-end justify-between"
                style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 100%)' }}
                onClick={e => e.stopPropagation()}
            >
                <div className="flex flex-col gap-2">
                    {/* Finish + stone badge */}
                    {currentVariant && (
                        <div className={`self-start flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-sm font-black ${badgeColor}`}>
                            <span>{finishLabel}</span>
                            {stone.code && (
                                <>
                                    <span className="opacity-40">|</span>
                                    <span className={stoneColor}>{stone.code}</span>
                                </>
                            )}
                        </div>
                    )}
                    {/* Variant dots */}
                    {hasVariants && variants.length > 1 && (
                        <div className="flex gap-1.5">
                            {variants.map((_, i) => (
                                <button
                                    key={i}
                                    onClick={() => setVariantIdx(i)}
                                    className={`rounded-full transition-all duration-200 ${i === variantIdx ? 'w-4 h-2 bg-amber-400' : 'w-2 h-2 bg-white/30 hover:bg-white/50'}`}
                                />
                            ))}
                        </div>
                    )}
                </div>

                <div className="text-right">
                    <div className="text-white/50 text-[10px] font-black uppercase tracking-widest">
                        Χονδρική
                    </div>
                    <div className="text-white text-3xl font-black mt-0.5">
                        {displayPrice > 0 ? `€${displayPrice.toFixed(2)}` : '—'}
                    </div>
                    <div className={`text-xs font-bold mt-1 ${stockQty > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {stockQty > 0 ? `${stockQty} σε στοκ` : 'Εκτός στοκ'}
                    </div>
                </div>
            </div>

            {/* Variant counter top-center */}
            {hasVariants && variants.length > 1 && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/10 backdrop-blur-sm text-white text-xs font-black px-3 py-1.5 rounded-full" onClick={e => e.stopPropagation()}>
                    {variantIdx + 1} / {variants.length}
                </div>
            )}
        </div>
    );
}
