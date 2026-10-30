import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ImageIcon, Maximize2, ShoppingBag } from 'lucide-react';
import { Gender, ProductLinkMembership } from '../../types';
import { FINISH_CODES } from '../../constants';
import { formatCurrency, getVariantComponents } from '../../utils/pricingEngine';
import { formatNumber } from '../../utils/numberFormat';
import SkuColorizedText from '../SkuColorizedText';
import { SELLER_FINISH_COLORS, SELLER_STONE_TEXT_COLORS } from '../seller/skuColors';

const FINISH_DOT_ACTIVE: Record<string, string> = {
    '': 'bg-emerald-500', P: 'bg-stone-500', X: 'bg-amber-500', D: 'bg-rose-400', H: 'bg-cyan-400',
};

const SWIPE_THRESHOLD = 32;
const TAP_SLOP = 8;

/** The fields a catalogue card reads; both the seller read model and full ERP products satisfy it. */
export interface CatalogCardVariant {
    suffix: string;
    selling_price?: number | null;
    stock_qty?: number;
    available_qty?: number;
}

export interface CatalogCardProduct {
    sku: string;
    category: string;
    gender: Gender;
    image_url?: string | null;
    selling_price?: number | null;
    stock_qty?: number;
    available_qty?: number;
    variants?: readonly CatalogCardVariant[];
    link_groups?: ProductLinkMembership[];
}

export const SuffixBadge = React.memo(({ suffix, gender }: { suffix: string; gender: Gender }) => {
    const { finish, stone } = getVariantComponents(suffix, gender);
    const badgeColor = SELLER_FINISH_COLORS[finish.code] || 'bg-slate-100 text-slate-600 border-slate-200';
    const stoneColor = SELLER_STONE_TEXT_COLORS[stone.code] || 'text-slate-700';
    const finishLabel = FINISH_CODES[finish.code] ?? (finish.code || 'Λουστρέ');
    return (
        <span className={`inline-flex max-w-full items-center gap-1 truncate rounded-md border px-1.5 py-px text-[9px] font-bold leading-[14px] ${badgeColor}`}>
            <span className="truncate">{finishLabel}</span>
            {stone.code ? (
                <>
                    <span className="opacity-30">|</span>
                    <span className={`truncate ${stoneColor}`}>{stone.name || stone.code}</span>
                </>
            ) : null}
        </span>
    );
});
SuffixBadge.displayName = 'SuffixBadge';

export type CatalogCardDensity = 'compact' | 'regular';

export interface CatalogCardProps<T extends CatalogCardProduct> {
    product: T;
    density: CatalogCardDensity;
    priority?: boolean;
    /** Store shows retail (wholesale × 3); sellers see wholesale. */
    priceMultiplier?: number;
    onOpen: (product: T, variantIndex: number) => void;
    onAddToOrder?: (product: T, variantSuffix?: string) => void;
    linkedSkus?: readonly string[];
}

/**
 * Catalogue card: SKU first, compact price, swipe (touch) or arrows (mouse) through variants.
 * Drag feedback writes the transform straight to the DOM so a swipe never re-renders React.
 */
function CatalogProductCardInner<T extends CatalogCardProduct>({ product, density, priority = false, priceMultiplier = 1, onOpen, onAddToOrder, linkedSkus }: CatalogCardProps<T>) {
    const variants = product.variants ?? [];
    const variantCount = variants.length;
    const [viewIndex, setViewIndex] = useState(0);
    const [imageFailed, setImageFailed] = useState(false);
    const mediaRef = useRef<HTMLDivElement>(null);
    const touch = useRef<{ x: number; y: number; dx: number; horizontal: boolean | null } | null>(null);
    const suppressClick = useRef(false);

    useEffect(() => setImageFailed(false), [product.image_url]);
    useEffect(() => setViewIndex(0), [product]);

    const finishGroups = useMemo(() => {
        if (variantCount < 2) return [];
        const groups: { finish: string; first: number }[] = [];
        variants.forEach((v, i) => {
            const f = getVariantComponents(v.suffix, product.gender).finish.code;
            if (!groups.some((item) => item.finish === f)) groups.push({ finish: f, first: i });
        });
        return groups.length > 1 ? groups : [];
    }, [variants, variantCount, product.gender]);

    const safeIndex = variantCount > 0 ? Math.min(viewIndex, variantCount - 1) : 0;
    const current = variantCount > 0 ? variants[safeIndex] : null;
    const basePrice = current ? (current.selling_price || product.selling_price || 0) : (product.selling_price || 0);
    const price = basePrice * priceMultiplier;
    const stock = current ? (current.available_qty ?? current.stock_qty ?? 0) : (product.available_qty ?? product.stock_qty ?? 0);
    const compact = density === 'compact';

    const step = useCallback((delta: number) => {
        if (variantCount < 2) return;
        setViewIndex((i) => (i + delta + variantCount) % variantCount);
    }, [variantCount]);

    const setDrag = (dx: number) => {
        const el = mediaRef.current;
        if (!el) return;
        el.style.transition = dx === 0 ? 'transform 160ms ease-out' : 'none';
        el.style.transform = dx === 0 ? '' : `translate3d(${dx * 0.3}px,0,0)`;
    };

    const onTouchStart = (e: React.TouchEvent) => {
        const t = e.touches[0];
        suppressClick.current = false;
        touch.current = { x: t.clientX, y: t.clientY, dx: 0, horizontal: null };
    };
    const onTouchMove = (e: React.TouchEvent) => {
        const s = touch.current;
        if (!s || variantCount < 2) return;
        const t = e.touches[0];
        const dx = t.clientX - s.x;
        const dy = t.clientY - s.y;
        if (s.horizontal === null && (Math.abs(dx) > TAP_SLOP || Math.abs(dy) > TAP_SLOP)) {
            s.horizontal = Math.abs(dx) > Math.abs(dy);
        }
        if (s.horizontal) {
            s.dx = Math.max(-90, Math.min(90, dx));
            setDrag(s.dx);
        }
    };
    const onTouchEnd = () => {
        const s = touch.current;
        touch.current = null;
        if (!s) return;
        setDrag(0);
        if (s.horizontal) suppressClick.current = true;
        if (s.horizontal && s.dx <= -SWIPE_THRESHOLD) step(1);
        else if (s.horizontal && s.dx >= SWIPE_THRESHOLD) step(-1);
    };

    const handleMediaClick = () => {
        // A swipe ends with a click on some browsers; only open on a clean tap.
        if (suppressClick.current) {
            suppressClick.current = false;
            return;
        }
        onOpen(product, safeIndex);
    };

    const activeFinish = current ? getVariantComponents(current.suffix, product.gender).finish.code : null;

    return (
        <article className="group relative flex h-full select-none flex-col overflow-hidden rounded-xl border border-slate-200/70 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-shadow lg:rounded-2xl lg:hover:shadow-md">
            <div className="relative aspect-square overflow-hidden bg-slate-100">
                <div
                    ref={mediaRef}
                    className="absolute inset-0 cursor-pointer"
                    style={{ touchAction: 'pan-y' }}
                    onTouchStart={onTouchStart}
                    onTouchMove={onTouchMove}
                    onTouchEnd={onTouchEnd}
                    onTouchCancel={onTouchEnd}
                    onClick={handleMediaClick}
                >
                    {product.image_url && !imageFailed ? (
                        <img
                            src={product.image_url}
                            alt={product.sku}
                            draggable={false}
                            loading={priority ? 'eager' : 'lazy'}
                            fetchPriority={priority ? 'high' : 'low'}
                            decoding="async"
                            onError={() => setImageFailed(true)}
                            className="h-full w-full object-cover"
                        />
                    ) : (
                        <div className="flex h-full w-full items-center justify-center text-slate-300">
                            <ImageIcon size={compact ? 18 : 24} />
                        </div>
                    )}
                </div>

                <span className={`pointer-events-none absolute left-1 top-1 rounded-md px-1 py-px font-bold tabular-nums text-white ${compact ? 'text-[9px]' : 'text-[10px]'} ${stock > 0 ? 'bg-emerald-600/90' : 'bg-rose-500/90'}`}>
                    {formatNumber(stock)}
                </span>

                {variantCount > 1 && (
                    <span className={`pointer-events-none absolute right-1 top-1 rounded-full bg-black/55 px-1.5 py-px font-bold tabular-nums text-white ${compact ? 'text-[8px]' : 'text-[9px]'}`}>
                        {formatNumber(safeIndex + 1)}/{formatNumber(variantCount)}
                    </span>
                )}

                {/* Mouse users: arrows + open hint appear on hover (touch devices swipe and tap). */}
                {variantCount > 1 && (
                    <div className="pointer-events-none absolute inset-x-1 top-1/2 hidden -translate-y-1/2 justify-between opacity-0 transition-opacity group-hover:opacity-100 [@media(hover:hover)]:flex">
                        <button type="button" onClick={(e) => { e.stopPropagation(); step(-1); }} aria-label="Προηγούμενη παραλλαγή" className="pointer-events-auto rounded-full bg-white/90 p-1 text-slate-700 shadow hover:bg-white">
                            <ChevronLeft size={14} />
                        </button>
                        <button type="button" onClick={(e) => { e.stopPropagation(); step(1); }} aria-label="Επόμενη παραλλαγή" className="pointer-events-auto rounded-full bg-white/90 p-1 text-slate-700 shadow hover:bg-white">
                            <ChevronRight size={14} />
                        </button>
                    </div>
                )}
                <span className="pointer-events-none absolute bottom-1.5 right-1.5 hidden rounded-full bg-black/45 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100 [@media(hover:hover)]:block">
                    <Maximize2 size={12} />
                </span>
            </div>

            <div className={`flex flex-1 flex-col ${compact ? 'gap-0.5 px-1.5 pb-1.5 pt-1' : 'gap-1 px-2.5 pb-2 pt-1.5'}`}>
                <SkuColorizedText
                    sku={product.sku}
                    suffix={current?.suffix || ''}
                    gender={product.gender}
                    className={`block truncate leading-tight ${compact ? 'text-[12px]' : 'text-[13px] lg:text-sm'}`}
                    masterClassName="text-slate-900"
                />
                {current ? (
                    <div className="flex min-w-0"><SuffixBadge suffix={current.suffix} gender={product.gender} /></div>
                ) : (
                    <span className={`truncate font-medium text-slate-400 ${compact ? 'text-[9px]' : 'text-[10px]'}`}>{product.category}</span>
                )}
                <div className="mt-auto flex items-end justify-between gap-1 pt-0.5">
                    {current && !compact ? (
                        <span className="min-w-0 truncate text-[10px] font-medium text-slate-400">{product.category}</span>
                    ) : <span />}
                    <span className={`shrink-0 font-bold tabular-nums text-[#060b00] ${compact ? 'text-[12px]' : 'text-[13px]'}`}>
                        {price > 0 ? formatCurrency(price) : '—'}
                    </span>
                </div>
                {finishGroups.length > 0 && (
                    <div className="-mx-0.5 flex gap-1">
                        {finishGroups.map((g) => (
                            <button
                                key={g.finish}
                                type="button"
                                aria-label={FINISH_CODES[g.finish] ?? (g.finish || 'Λουστρέ')}
                                onClick={() => setViewIndex(g.first)}
                                className="flex-1 py-1"
                            >
                                <span className={`block h-1 rounded-full ${g.finish === activeFinish ? (FINISH_DOT_ACTIVE[g.finish] || 'bg-slate-700') : 'bg-slate-200'}`} />
                            </button>
                        ))}
                    </div>
                )}
                {onAddToOrder && (
                    <button
                        type="button"
                        onClick={() => onAddToOrder(product, current?.suffix)}
                        className="mt-1 flex items-center justify-center gap-1.5 rounded-lg bg-[#060b00] py-1.5 text-[11px] font-bold text-amber-300 active:scale-[0.98]"
                    >
                        <ShoppingBag size={12} /> Προσθήκη
                    </button>
                )}
                {!!linkedSkus?.length && (
                    <button type="button" title={`Σετ με: ${linkedSkus.join(', ')}`} onClick={() => onOpen(product, safeIndex)} className="mt-1 truncate rounded-lg bg-violet-50 px-1.5 py-1 text-left text-[10px] font-bold text-violet-700">
                        Σετ με: {linkedSkus.join(', ')}
                    </button>
                )}
            </div>
        </article>
    );
}

const CatalogProductCard = React.memo(CatalogProductCardInner) as typeof CatalogProductCardInner;
export default CatalogProductCard;
