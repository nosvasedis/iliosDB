import { formatNumber } from '../../utils/numberFormat';
import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, ImageIcon, RotateCcw, X, ZoomIn, ZoomOut } from 'lucide-react';

export interface ZoomGalleryItem {
    sku: string;
    imageUrl: string | null;
    /** Secondary line under the SKU, e.g. category. */
    label?: string;
}

interface Props {
    imageUrl: string;
    sku: string;
    onClose: () => void;
    /** Optional sequence to step through (e.g. the members of a set). */
    gallery?: ZoomGalleryItem[];
    initialIndex?: number;
}

const MIN_SCALE = 1;
const MAX_SCALE = 6;
const STEP = 1.5;
const DOUBLE_TAP_SCALE = 2.5;

type View = { scale: number; x: number; y: number };
const RESET_VIEW: View = { scale: 1, x: 0, y: 0 };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Full-screen photo viewer: wheel zoom toward the cursor, drag to pan,
 * two-finger pinch, double-click / double-tap, keyboard (+ − 0 ← → Esc).
 */
export default function ImageZoomLightbox({ imageUrl, sku, onClose, gallery, initialIndex = 0 }: Props) {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const stageRef = useRef<HTMLDivElement>(null);
    const imageRef = useRef<HTMLImageElement>(null);
    const titleId = useId();

    const items: ZoomGalleryItem[] = gallery?.length ? gallery : [{ sku, imageUrl }];
    const [index, setIndex] = useState(() => clamp(initialIndex, 0, items.length - 1));
    const current = items[clamp(index, 0, items.length - 1)];
    const hasGallery = items.length > 1;

    const [view, setView] = useState<View>(RESET_VIEW);
    const viewRef = useRef(view);
    viewRef.current = view;
    const [imageFailed, setImageFailed] = useState(false);
    const [isPanning, setIsPanning] = useState(false);

    const pointers = useRef(new Map<number, { x: number; y: number }>());
    const gesture = useRef<{ distance: number; scale: number; midX: number; midY: number; x: number; y: number } | null>(null);
    const lastTap = useRef<{ time: number; x: number; y: number } | null>(null);
    const downAt = useRef(new Map<number, { x: number; y: number }>());

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;
        const previousOverflow = document.body.style.overflow;
        const previousFocus = document.activeElement;
        dialog.showModal();
        document.body.style.overflow = 'hidden';
        return () => {
            dialog.close();
            document.body.style.overflow = previousOverflow;
            if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
        };
    }, []);

    useEffect(() => {
        setImageFailed(false);
        setView(RESET_VIEW);
    }, [current.imageUrl, current.sku]);

    /** Keep the scaled image covering the stage: no panning past its edges. */
    const constrain = useCallback((next: View): View => {
        const stage = stageRef.current;
        const image = imageRef.current;
        const scale = clamp(next.scale, MIN_SCALE, MAX_SCALE);
        if (!stage || !image || scale <= MIN_SCALE) return { scale: MIN_SCALE, x: 0, y: 0 };
        const maxX = Math.max(0, (image.offsetWidth * scale - stage.clientWidth) / 2);
        const maxY = Math.max(0, (image.offsetHeight * scale - stage.clientHeight) / 2);
        return { scale, x: clamp(next.x, -maxX, maxX), y: clamp(next.y, -maxY, maxY) };
    }, []);

    /** Zoom so that the stage point (clientX, clientY) stays under the cursor. */
    const zoomAt = useCallback((targetScale: number, clientX?: number, clientY?: number) => {
        const stage = stageRef.current;
        setView((previous) => {
            const scale = clamp(targetScale, MIN_SCALE, MAX_SCALE);
            if (!stage || clientX === undefined || clientY === undefined) {
                return constrain({ scale, x: previous.x * (scale / previous.scale), y: previous.y * (scale / previous.scale) });
            }
            const rect = stage.getBoundingClientRect();
            const px = clientX - (rect.left + rect.width / 2);
            const py = clientY - (rect.top + rect.height / 2);
            const ratio = scale / previous.scale;
            return constrain({ scale, x: px - (px - previous.x) * ratio, y: py - (py - previous.y) * ratio });
        });
    }, [constrain]);

    // Wheel must be non-passive to stop the page from scrolling.
    useLayoutEffect(() => {
        const stage = stageRef.current;
        if (!stage) return;
        const onWheel = (event: WheelEvent) => {
            event.preventDefault();
            const factor = Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0025));
            zoomAt(viewRef.current.scale * factor, event.clientX, event.clientY);
        };
        stage.addEventListener('wheel', onWheel, { passive: false });
        return () => stage.removeEventListener('wheel', onWheel);
    }, [zoomAt]);

    const goTo = useCallback((delta: number) => {
        if (!hasGallery) return;
        setIndex((value) => (value + delta + items.length) % items.length);
    }, [hasGallery, items.length]);

    const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        if (imageFailed || event.button > 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        downAt.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        const points = [...pointers.current.values()];
        if (points.length === 2) {
            lastTap.current = null;
            const [a, b] = points;
            gesture.current = {
                distance: Math.hypot(a.x - b.x, a.y - b.y) || 1,
                scale: viewRef.current.scale,
                midX: (a.x + b.x) / 2,
                midY: (a.y + b.y) / 2,
                x: viewRef.current.x,
                y: viewRef.current.y,
            };
        } else if (points.length === 1) {
            gesture.current = null;
            setIsPanning(viewRef.current.scale > 1);
        }
    };

    const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
        const previous = pointers.current.get(event.pointerId);
        if (!previous) return;
        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        const points = [...pointers.current.values()];

        if (points.length >= 2 && gesture.current) {
            const [a, b] = points;
            const start = gesture.current;
            const distance = Math.hypot(a.x - b.x, a.y - b.y) || 1;
            const scale = clamp(start.scale * (distance / start.distance), MIN_SCALE, MAX_SCALE);
            const stage = stageRef.current;
            if (!stage) return;
            const rect = stage.getBoundingClientRect();
            const startPx = start.midX - (rect.left + rect.width / 2);
            const startPy = start.midY - (rect.top + rect.height / 2);
            const midX = (a.x + b.x) / 2;
            const midY = (a.y + b.y) / 2;
            const ratio = scale / start.scale;
            setView(constrain({
                scale,
                x: startPx - (startPx - start.x) * ratio + (midX - start.midX),
                y: startPy - (startPy - start.y) * ratio + (midY - start.midY),
            }));
            return;
        }

        if (viewRef.current.scale > 1) {
            const dx = event.clientX - previous.x;
            const dy = event.clientY - previous.y;
            setView((current) => constrain({ ...current, x: current.x + dx, y: current.y + dy }));
        }
    };

    const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
        const down = downAt.current.get(event.pointerId);
        const wasMultiTouch = pointers.current.size > 1 || gesture.current !== null;
        pointers.current.delete(event.pointerId);
        downAt.current.delete(event.pointerId);
        if (pointers.current.size < 2) gesture.current = null;
        if (pointers.current.size === 0) setIsPanning(false);

        // Double-click / double-tap: two short taps that did not move (one handler for mouse, touch and pen).
        const isTap = !!down && Math.hypot(down.x - event.clientX, down.y - event.clientY) < 8;
        if (canZoom && isTap && !wasMultiTouch && event.type === 'pointerup') {
            const now = Date.now();
            const last = lastTap.current;
            if (last && now - last.time < 300 && Math.hypot(last.x - event.clientX, last.y - event.clientY) < 30) {
                lastTap.current = null;
                zoomAt(viewRef.current.scale > 1 ? 1 : DOUBLE_TAP_SCALE, event.clientX, event.clientY);
            } else {
                lastTap.current = { time: now, x: event.clientX, y: event.clientY };
            }
        }
    };

    const handleKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === '+' || event.key === '=') { event.preventDefault(); zoomAt(viewRef.current.scale * STEP); }
        else if (event.key === '-' || event.key === '_') { event.preventDefault(); zoomAt(viewRef.current.scale / STEP); }
        else if (event.key === '0') { event.preventDefault(); setView(RESET_VIEW); }
        else if (event.key === 'ArrowLeft' && hasGallery) { event.preventDefault(); goTo(-1); }
        else if (event.key === 'ArrowRight' && hasGallery) { event.preventDefault(); goTo(1); }
    };

    const zoomPercent = formatNumber(Math.round(view.scale * 100));
    const canZoom = !!current.imageUrl && !imageFailed;

    return createPortal(
        <dialog
            ref={dialogRef}
            aria-labelledby={titleId}
            className="fixed inset-0 m-auto h-[92dvh] max-h-none w-[96vw] max-w-6xl overflow-hidden rounded-2xl bg-slate-950 p-0 text-white shadow-2xl backdrop:bg-black/85"
            onCancel={(event) => { event.preventDefault(); onClose(); }}
            onKeyDown={handleKeyDown}
            onClick={(event) => {
                event.stopPropagation();
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <div className="flex h-full flex-col">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-3 sm:p-4">
                    <div className="min-w-0">
                        <h3 id={titleId} className="truncate font-mono font-black">Φωτογραφία {current.sku}</h3>
                        {(current.label || hasGallery) && (
                            <p className="truncate text-xs font-bold text-white/50">
                                {current.label}
                                {current.label && hasGallery ? ' · ' : ''}
                                {hasGallery ? `${formatNumber(index + 1)} / ${formatNumber(items.length)}` : ''}
                            </p>
                        )}
                    </div>
                    <div className="flex items-center gap-1 sm:gap-2">
                        <button type="button" aria-label="Σμίκρυνση" title="Σμίκρυνση (−)" disabled={!canZoom || view.scale <= MIN_SCALE} onClick={() => zoomAt(view.scale / STEP)} className="rounded-lg p-2 hover:bg-white/20 disabled:opacity-30">
                            <ZoomOut size={20} />
                        </button>
                        <button type="button" aria-label="Επαναφορά ζουμ" title="Επαναφορά (0)" disabled={!canZoom} onClick={() => setView(RESET_VIEW)} className="flex min-w-[4.5rem] items-center justify-center gap-1 rounded-lg p-2 text-sm font-bold tabular-nums hover:bg-white/20 disabled:opacity-30">
                            {view.scale > 1 && <RotateCcw size={13} />}
                            {zoomPercent}%
                        </button>
                        <button type="button" aria-label="Μεγέθυνση" title="Μεγέθυνση (+)" disabled={!canZoom || view.scale >= MAX_SCALE} onClick={() => zoomAt(view.scale * STEP)} className="rounded-lg p-2 hover:bg-white/20 disabled:opacity-30">
                            <ZoomIn size={20} />
                        </button>
                        <button type="button" aria-label="Κλείσιμο φωτογραφίας" onClick={onClose} className="ml-1 rounded-lg p-2 hover:bg-white/20">
                            <X size={22} />
                        </button>
                    </div>
                </div>

                <div
                    ref={stageRef}
                    className={`relative min-h-0 flex-1 select-none overflow-hidden ${canZoom ? (view.scale > 1 ? (isPanning ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-zoom-in') : ''}`}
                    style={{ touchAction: 'none' }}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                >
                    {canZoom ? (
                        <div className="flex h-full w-full items-center justify-center p-3">
                            <img
                                ref={imageRef}
                                src={current.imageUrl!}
                                alt={current.sku}
                                draggable={false}
                                decoding="async"
                                onError={() => setImageFailed(true)}
                                className="max-h-full max-w-full object-contain will-change-transform"
                                style={{
                                    transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})`,
                                    transition: isPanning || gesture.current ? 'none' : 'transform 120ms ease-out',
                                }}
                            />
                        </div>
                    ) : (
                        <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-400">
                            <ImageIcon size={48} />
                            <p>{current.imageUrl ? 'Δεν ήταν δυνατή η φόρτωση της φωτογραφίας.' : 'Δεν υπάρχει φωτογραφία.'}</p>
                        </div>
                    )}

                    {hasGallery && (
                        <>
                            <button
                                type="button"
                                aria-label="Προηγούμενη φωτογραφία"
                                onPointerDown={(event) => event.stopPropagation()}
                                onPointerUp={(event) => event.stopPropagation()}
                                onClick={() => goTo(-1)}
                                className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 backdrop-blur-sm transition hover:bg-white/25"
                            >
                                <ChevronLeft size={24} />
                            </button>
                            <button
                                type="button"
                                aria-label="Επόμενη φωτογραφία"
                                onPointerDown={(event) => event.stopPropagation()}
                                onPointerUp={(event) => event.stopPropagation()}
                                onClick={() => goTo(1)}
                                className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 backdrop-blur-sm transition hover:bg-white/25"
                            >
                                <ChevronRight size={24} />
                            </button>
                        </>
                    )}
                </div>

                {hasGallery && (
                    <div className="flex gap-2 overflow-x-auto border-t border-white/10 p-2 sm:justify-center">
                        {items.map((item, itemIndex) => (
                            <button
                                key={`${item.sku}-${itemIndex}`}
                                type="button"
                                onClick={() => setIndex(itemIndex)}
                                aria-label={`Φωτογραφία ${item.sku}`}
                                aria-current={itemIndex === index}
                                className={`flex shrink-0 items-center gap-2 rounded-xl border px-1.5 py-1 text-xs font-black transition ${itemIndex === index ? 'border-amber-300 bg-white/15' : 'border-white/10 opacity-60 hover:opacity-100'}`}
                            >
                                <span className="h-9 w-9 overflow-hidden rounded-lg bg-white/10">
                                    {item.imageUrl ? <img src={item.imageUrl} alt="" className="h-full w-full object-cover" /> : <ImageIcon size={16} className="m-2.5 text-white/40" />}
                                </span>
                                <span className="pr-1 font-mono">{item.sku}</span>
                            </button>
                        ))}
                    </div>
                )}

                <p className="sr-only">Τροχός ή τσίμπημα για ζουμ, σύρσιμο για μετακίνηση, διπλό κλικ για εναλλαγή.</p>
            </div>
        </dialog>,
        document.body,
    );
}
