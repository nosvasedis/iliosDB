import React, { useEffect, useRef, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, ImageIcon } from 'lucide-react';
import { Product, ProductVariant } from '../../types';
import { getVariantComponents } from '../../utils/pricingEngine';
import { FINISH_CODES } from '../../constants';
import { SELLER_FINISH_COLORS, SELLER_STONE_TEXT_COLORS } from './skuColors';

interface LightboxItem {
    product: Product;
    variantIndex?: number; // which variant to show first
}

interface Props {
    item: LightboxItem;
    onClose: () => void;
}

const SWIPE_THRESHOLD = 50;
const WHEEL_THRESHOLD = 80;

export default function SellerImageLightbox({ item, onClose }: Props) {
    const { product } = item;
    const variants = product.variants || [];
    const hasVariants = variants.length > 0;

    const [variantIdx, setVariantIdx] = React.useState(item.variantIndex ?? 0);
    const wheelAccum = useRef(0);
    const touchStartX = useRef<number | null>(null);

    const currentVariant: ProductVariant | null = hasVariants ? (variants[variantIdx] ?? null) : null;
    const displaySku = currentVariant ? `${product.sku}${currentVariant.suffix}` : product.sku;
    const displayPrice = currentVariant
        ? (currentVariant.selling_price || product.selling_price || 0)
        : (product.selling_price || 0);
    const stockQty = currentVariant ? currentVariant.stock_qty : product.stock_qty;

    const { finish, stone } = getVariantComponents(currentVariant?.suffix || '', product.gender);
    const finishLabel = FINISH_CODES[finish.code] ?? (finish.code || 'Λουστρέ');
    const descriptionLine = currentVariant
        ? [finish.name, stone.name].filter(Boolean).join(' – ')
        : '';
    const badgeColor = SELLER_FINISH_COLORS[finish.code] || 'bg-slate-100 text-slate-700 border-slate-200';
    const stoneColor = SELLER_STONE_TEXT_COLORS[stone.code] || 'text-slate-700';

    const prevVariant = useCallback(() => setVariantIdx(i => (i - 1 + variants.length) % variants.length), [variants.length]);
    const nextVariant = useCallback(() => setVariantIdx(i => (i + 1) % variants.length), [variants.length]);

    // Horizontal scroll/wheel to change variant
    const handleWheel = useCallback((e: React.WheelEvent) => {
        if (!hasVariants || variants.length <= 1) return;
        e.preventDefault();
        wheelAccum.current += e.deltaX;
        if (wheelAccum.current <= -WHEEL_THRESHOLD) {
            wheelAccum.current = 0;
            nextVariant();
        } else if (wheelAccum.current >= WHEEL_THRESHOLD) {
            wheelAccum.current = 0;
            prevVariant();
        }
    }, [hasVariants, variants.length, nextVariant, prevVariant]);

    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        if (!hasVariants || variants.length <= 1) return;
        touchStartX.current = e.touches[0].clientX;
    }, [hasVariants, variants.length]);

    const handleTouchEnd = useCallback((e: React.TouchEvent) => {
        if (touchStartX.current === null) return;
        const endX = e.changedTouches[0].clientX;
        const delta = endX - touchStartX.current;
        if (delta < -SWIPE_THRESHOLD) nextVariant();
        else if (delta > SWIPE_THRESHOLD) prevVariant();
        touchStartX.current = null;
    }, [nextVariant, prevVariant]);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = ''; };
    }, []);

    return (
        <div
            className="fixed inset-0 z-[500] bg-black/95 flex flex-col items-center justify-center animate-in fade-in duration-200"
            onClick={onClose}
        >
            <button
                onClick={onClose}
                className="absolute top-4 right-4 w-11 h-11 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center text-white transition-colors z-10"
            >
                <X size={22} />
            </button>

            <div className="absolute top-4 left-4 z-10" onClick={e => e.stopPropagation()}>
                <div className="text-white font-black text-xl tracking-tight drop-shadow-lg">
                    <span className="text-white">{product.sku}</span>
                    {currentVariant && (
                        <>
                            <span className="text-amber-200/90 ml-0.5">{finish.code}</span>
                            <span className={`${stoneColor} ml-0.5`}>{stone.code}</span>
                        </>
                    )}
                </div>
                <div className="text-white/50 text-xs font-bold mt-0.5">{product.category}</div>
            </div>

            {/* Main image — wheel + touch swipe to change variant */}
            <div
                className="relative w-full h-full flex items-center justify-center p-4 landscape:px-24 overflow-hidden"
                onClick={e => e.stopPropagation()}
                onWheel={handleWheel}
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
                style={{ touchAction: 'pan-y' }}
            >
                {product.image_url ? (
                    <img
                        src={product.image_url}
                        alt={displaySku}
                        className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl select-none pointer-events-none"
                        draggable={false}
                    />
                ) : (
                    <div className="w-64 h-64 bg-white/10 rounded-3xl flex flex-col items-center justify-center gap-4 text-white/40">
                        <ImageIcon size={64} strokeWidth={1} />
                        <span className="text-sm font-bold">Χωρίς εικόνα</span>
                    </div>
                )}

                {hasVariants && variants.length > 1 && (
                    <>
                        <button
                            onClick={(e) => { e.stopPropagation(); prevVariant(); }}
                            className="absolute left-2 landscape:left-6 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/10 hover:bg-white/25 backdrop-blur-sm rounded-full flex items-center justify-center text-white transition-all active:scale-95 z-20"
                        >
                            <ChevronLeft size={24} />
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); nextVariant(); }}
                            className="absolute right-2 landscape:right-6 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/10 hover:bg-white/25 backdrop-blur-sm rounded-full flex items-center justify-center text-white transition-all active:scale-95 z-20"
                        >
                            <ChevronRight size={24} />
                        </button>
                    </>
                )}
            </div>

            {/* Bottom info bar — description line, bigger badge, bigger price */}
            <div
                className="absolute bottom-0 inset-x-0 p-5 flex items-end justify-between"
                style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 100%)' }}
                onClick={e => e.stopPropagation()}
            >
                <div className="flex flex-col gap-2">
                    {currentVariant && (
                        <>
                            {descriptionLine && (
                                <div className="text-white/90 text-sm font-bold leading-tight max-w-[200px] sm:max-w-xs truncate" title={descriptionLine}>
                                    {descriptionLine}
                                </div>
                            )}
                            <div className={`self-start flex items-center gap-2 px-4 py-2 rounded-xl border text-base font-black ${badgeColor}`}>
                                <span>{finishLabel}</span>
                                {stone.code && (
                                    <>
                                        <span className="opacity-40">|</span>
                                        <span className={stoneColor}>{stone.code}</span>
                                    </>
                                )}
                            </div>
                        </>
                    )}
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
                    <div className="text-white/50 text-xs font-black uppercase tracking-widest">Χονδρική</div>
                    <div className="text-white text-4xl font-black mt-0.5">
                        {displayPrice > 0 ? `€${displayPrice.toFixed(2)}` : '—'}
                    </div>
                    <div className={`text-sm font-bold mt-1 ${stockQty > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {stockQty > 0 ? `${stockQty} σε στοκ` : 'Εκτός στοκ'}
                    </div>
                </div>
            </div>

            {hasVariants && variants.length > 1 && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/10 backdrop-blur-sm text-white text-xs font-black px-3 py-1.5 rounded-full" onClick={e => e.stopPropagation()}>
                    {variantIdx + 1} / {variants.length}
                </div>
            )}
        </div>
    );
}
