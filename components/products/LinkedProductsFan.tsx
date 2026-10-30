import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, ExternalLink, ImageIcon, Link2, X, ZoomIn } from 'lucide-react';
import { Gender } from '../../types';
import { formatNumber } from '../../utils/numberFormat';
import SkuColorizedText from '../SkuColorizedText';

export interface FanItem {
    sku: string;
    imageUrl: string | null;
    gender?: Gender;
    category?: string;
    /** Short facts under the SKU, e.g. price / stock. */
    meta?: React.ReactNode;
}

export interface FanSet {
    groupId: string;
    items: FanItem[];
}

interface Props {
    /** The SKU the fan was opened from; it starts at the front. */
    originSku: string;
    sets: FanSet[];
    anchor: DOMRect | null;
    onClose: () => void;
    onOpenProduct?: (sku: string) => void;
    onZoom: (items: FanItem[], index: number) => void;
}

const CARD_WIDTH = 176;
const FAN_HEIGHT = 300;
const PANEL_WIDTH = 440;
const WHEEL_STEP = 60;
const SWIPE_STEP = 40;

const prefersReducedMotion = () =>
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Η βεντάλια: the linked products of a SKU fanned out like cards in a hand.
 * The front card is the one in focus; click a side card, use ←/→, the wheel or swipe to switch.
 */
export default function LinkedProductsFan({ originSku, sets, anchor, onClose, onOpenProduct, onZoom }: Props) {
    const panelRef = useRef<HTMLDivElement>(null);
    const fanRef = useRef<HTMLDivElement>(null);
    const [setIndex, setSetIndex] = useState(0);
    const activeSet = sets[Math.min(setIndex, sets.length - 1)];
    const items = activeSet?.items || [];
    const [front, setFront] = useState(() => Math.max(0, items.findIndex((item) => item.sku === originSku)));
    const wheelAccum = useRef(0);
    const swipeStart = useRef<number | null>(null);
    const suppressClick = useRef(false);
    const reducedMotion = useMemo(prefersReducedMotion, []);
    const [isNarrow, setIsNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < 640);
    const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

    useEffect(() => {
        const originIndex = items.findIndex((item) => item.sku === originSku);
        setFront(originIndex >= 0 ? originIndex : 0);
    }, [activeSet?.groupId]); // eslint-disable-line react-hooks/exhaustive-deps

    const step = useCallback((delta: number) => {
        if (items.length < 2) return;
        setFront((value) => (value + delta + items.length) % items.length);
    }, [items.length]);

    // Anchor next to the badge on wide screens; bottom sheet on phones.
    useLayoutEffect(() => {
        const place = () => {
            const narrow = window.innerWidth < 640;
            setIsNarrow(narrow);
            if (narrow || !anchor) { setPosition(null); return; }
            const height = panelRef.current?.offsetHeight || FAN_HEIGHT + 120;
            const left = Math.min(Math.max(12, anchor.left + anchor.width / 2 - PANEL_WIDTH / 2), window.innerWidth - PANEL_WIDTH - 12);
            const below = anchor.bottom + 10;
            const top = below + height <= window.innerHeight - 12 ? below : Math.max(12, anchor.top - height - 10);
            setPosition({ left, top });
        };
        place();
        window.addEventListener('resize', place);
        return () => window.removeEventListener('resize', place);
    }, [anchor, items.length, sets.length]);

    // Close on outside press, page scroll and Esc (unless a photo dialog is open on top).
    useEffect(() => {
        const onPointerDown = (event: PointerEvent) => {
            if (document.querySelector('dialog[open]')) return;
            if (panelRef.current && !panelRef.current.contains(event.target as Node)) onClose();
        };
        const onScroll = (event: Event) => {
            if (isNarrow || document.querySelector('dialog[open]')) return;
            if (panelRef.current && event.target instanceof Node && panelRef.current.contains(event.target)) return;
            onClose();
        };
        const onKey = (event: KeyboardEvent) => {
            if (document.querySelector('dialog[open]')) return;
            if (event.key === 'Escape') { event.preventDefault(); onClose(); }
            else if (event.key === 'ArrowLeft') { event.preventDefault(); step(-1); }
            else if (event.key === 'ArrowRight') { event.preventDefault(); step(1); }
        };
        document.addEventListener('pointerdown', onPointerDown, true);
        document.addEventListener('scroll', onScroll, true);
        window.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('pointerdown', onPointerDown, true);
            document.removeEventListener('scroll', onScroll, true);
            window.removeEventListener('keydown', onKey);
        };
    }, [isNarrow, onClose, step]);

    useEffect(() => { panelRef.current?.focus({ preventScroll: true }); }, []);

    useLayoutEffect(() => {
        const fan = fanRef.current;
        if (!fan) return;
        const onWheel = (event: WheelEvent) => {
            event.preventDefault();
            wheelAccum.current += Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
            if (wheelAccum.current >= WHEEL_STEP) { wheelAccum.current = 0; step(1); }
            else if (wheelAccum.current <= -WHEEL_STEP) { wheelAccum.current = 0; step(-1); }
        };
        fan.addEventListener('wheel', onWheel, { passive: false });
        return () => fan.removeEventListener('wheel', onWheel);
    }, [step]);

    if (!activeSet) return null;

    const cardStyle = (index: number): React.CSSProperties => {
        // Signed distance from the front card along the shortest way round.
        let offset = index - front;
        const half = items.length / 2;
        if (offset > half) offset -= items.length;
        if (offset < -half) offset += items.length;
        const distance = Math.abs(offset);
        const spread = isNarrow ? 64 : 92;
        const rotation = reducedMotion ? 0 : offset * 11;
        return {
            width: CARD_WIDTH,
            zIndex: 50 - distance,
            opacity: distance > 3 ? 0 : 1,
            transform: `translateX(calc(-50% + ${offset * spread}px)) translateY(${distance * 14}px) rotate(${rotation}deg) scale(${1 - distance * 0.09})`,
            transformOrigin: '50% 135%',
            transition: reducedMotion ? 'none' : 'transform 380ms cubic-bezier(.2,.9,.25,1.15), opacity 200ms ease, filter 200ms ease',
            filter: distance === 0 ? 'none' : 'saturate(.75) brightness(.97)',
            pointerEvents: distance > 3 ? 'none' : 'auto',
        };
    };

    const frontItem = items[front];

    const panel = (
        <div
            ref={panelRef}
            role="dialog"
            aria-modal="false"
            aria-label={`Συνδεδεμένα προϊόντα του ${originSku}`}
            tabIndex={-1}
            onClick={(event) => event.stopPropagation()}
            className={`fixed z-[700] flex flex-col overflow-hidden border border-slate-200/80 bg-white/95 shadow-2xl shadow-slate-900/25 outline-none backdrop-blur-xl animate-in fade-in duration-200 ${isNarrow ? 'inset-x-0 bottom-0 rounded-t-3xl pb-[env(safe-area-inset-bottom)] slide-in-from-bottom-6' : 'rounded-3xl zoom-in-95'}`}
            style={isNarrow ? undefined : { width: PANEL_WIDTH, left: position?.left ?? -9999, top: position?.top ?? -9999 }}
        >
            <div className="flex items-center justify-between gap-2 px-4 pb-1 pt-3">
                <div className="flex min-w-0 items-center gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-600">
                        <Link2 size={14} strokeWidth={2.75} />
                    </span>
                    <div className="min-w-0">
                        <div className="text-[13px] font-black text-slate-800">Συνδεδεμένα Προϊόντα</div>
                        <div className="truncate text-[11px] font-bold text-slate-400">
                            {formatNumber(items.length)} κωδικοί στο σετ · {formatNumber(front + 1)}/{formatNumber(items.length)}
                        </div>
                    </div>
                </div>
                <button type="button" onClick={onClose} aria-label="Κλείσιμο" className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
                    <X size={18} />
                </button>
            </div>

            {sets.length > 1 && (
                <div className="flex gap-1.5 overflow-x-auto px-4 pb-1 pt-1">
                    {sets.map((set, index) => (
                        <button
                            key={set.groupId}
                            type="button"
                            onClick={() => setSetIndex(index)}
                            className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-black transition ${index === setIndex ? 'border-violet-300 bg-violet-600 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-500 hover:border-violet-200 hover:text-violet-700'}`}
                            title={set.items.map((item) => item.sku).join(' · ')}
                        >
                            Σετ {formatNumber(index + 1)} · {formatNumber(set.items.length)} τμχ
                        </button>
                    ))}
                </div>
            )}

            <div
                ref={fanRef}
                className="relative mx-auto w-full select-none overflow-hidden"
                style={{ height: FAN_HEIGHT, touchAction: 'pan-y' }}
                onPointerDown={(event) => { swipeStart.current = event.clientX; suppressClick.current = false; }}
                onPointerUp={(event) => {
                    if (swipeStart.current === null) return;
                    const delta = event.clientX - swipeStart.current;
                    swipeStart.current = null;
                    if (Math.abs(delta) >= SWIPE_STEP) suppressClick.current = true;
                    if (delta <= -SWIPE_STEP) step(1);
                    else if (delta >= SWIPE_STEP) step(-1);
                }}
            >
                {items.map((item, index) => {
                    const isFront = index === front;
                    return (
                        <div
                            key={item.sku}
                            className="absolute left-1/2 top-6"
                            style={cardStyle(index)}
                        >
                            <div
                                role="button"
                                tabIndex={isFront ? 0 : -1}
                                aria-label={isFront ? `${item.sku}${onOpenProduct ? ' — άνοιγμα' : ''}` : `Εμφάνιση ${item.sku}`}
                                onClick={() => {
                                    if (suppressClick.current) { suppressClick.current = false; return; }
                                    if (!isFront) { setFront(index); return; }
                                    if (onOpenProduct) onOpenProduct(item.sku);
                                }}
                                onKeyDown={(event) => {
                                    if ((event.key === 'Enter' || event.key === ' ') && isFront && onOpenProduct) {
                                        event.preventDefault();
                                        onOpenProduct(item.sku);
                                    }
                                }}
                                className={`group relative cursor-pointer overflow-hidden rounded-2xl border bg-white shadow-xl transition-shadow ${isFront ? 'border-violet-300 shadow-violet-900/20 ring-2 ring-violet-500/20' : 'border-slate-200 shadow-slate-900/10 hover:border-violet-200'}`}
                            >
                                <div className="relative aspect-square overflow-hidden bg-slate-50">
                                    {item.imageUrl ? (
                                        <img src={item.imageUrl} alt={item.sku} draggable={false} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                                    ) : (
                                        <div className="flex h-full w-full items-center justify-center text-slate-300"><ImageIcon size={32} /></div>
                                    )}
                                    {item.sku === originSku && (
                                        <span className="absolute left-2 top-2 rounded-full bg-[#060b00]/80 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-white backdrop-blur">Τρέχον</span>
                                    )}
                                    {isFront && item.imageUrl && (
                                        <button
                                            type="button"
                                            aria-label={`Μεγέθυνση φωτογραφίας ${item.sku}`}
                                            onPointerDown={(event) => event.stopPropagation()}
                                            onPointerUp={(event) => event.stopPropagation()}
                                            onClick={(event) => { event.stopPropagation(); onZoom(items, index); }}
                                            className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-[#060b00]/75 text-white shadow-lg backdrop-blur transition hover:scale-110"
                                        >
                                            <ZoomIn size={15} strokeWidth={2.5} />
                                        </button>
                                    )}
                                </div>
                                <div className="px-3 py-2">
                                    <div className="truncate text-[15px] leading-tight">
                                        <SkuColorizedText sku={item.sku} gender={item.gender} masterClassName="text-slate-800" />
                                    </div>
                                    {item.category && <div className="truncate text-[10px] font-bold text-slate-400">{item.category}</div>}
                                    {item.meta && <div className="mt-1 truncate text-[11px] font-bold text-slate-600">{item.meta}</div>}
                                </div>
                            </div>
                        </div>
                    );
                })}

                {items.length > 1 && (
                    <>
                        <button type="button" aria-label="Προηγούμενο" onPointerDown={(event) => event.stopPropagation()} onPointerUp={(event) => event.stopPropagation()} onClick={() => step(-1)} className="absolute left-2 top-1/2 z-[60] flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-slate-600 shadow-md transition hover:text-violet-700">
                            <ChevronLeft size={18} />
                        </button>
                        <button type="button" aria-label="Επόμενο" onPointerDown={(event) => event.stopPropagation()} onPointerUp={(event) => event.stopPropagation()} onClick={() => step(1)} className="absolute right-2 top-1/2 z-[60] flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-slate-600 shadow-md transition hover:text-violet-700">
                            <ChevronRight size={18} />
                        </button>
                    </>
                )}
            </div>

            <div className="flex items-center gap-2 border-t border-slate-100 px-3 py-2.5">
                <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
                    {items.map((item, index) => (
                        <button
                            key={item.sku}
                            type="button"
                            onClick={() => setFront(index)}
                            className={`shrink-0 rounded-lg px-2 py-1 font-mono text-[11px] font-black transition ${index === front ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-violet-50 hover:text-violet-700'}`}
                        >
                            {item.sku}
                        </button>
                    ))}
                </div>
                {onOpenProduct && frontItem && (
                    <button
                        type="button"
                        onClick={() => onOpenProduct(frontItem.sku)}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#060b00] px-3 py-2 text-xs font-black text-white shadow-sm transition hover:bg-slate-800"
                    >
                        <ExternalLink size={13} /> Άνοιγμα
                    </button>
                )}
            </div>
        </div>
    );

    return createPortal(
        <>
            {isNarrow && <div className="fixed inset-0 z-[690] bg-black/40 animate-in fade-in duration-200" aria-hidden />}
            {panel}
        </>,
        document.body,
    );
}
