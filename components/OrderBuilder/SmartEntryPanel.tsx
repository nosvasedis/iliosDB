import { getSkuStoneLetterStyle } from '../../utils/skuColoring';
import StoneCodeText from '../StoneCodeText';
import { formatNumber } from '../../utils/numberFormat';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScanBarcode, X, Hash, Layers, Plus, ImageIcon, StickyNote, AlertTriangle, CheckCircle2, ZoomIn, Camera, ShoppingBag, History, CornerDownLeft, ArrowUpDown, SearchX } from 'lucide-react';
import { formatDecimal, getVariantSuffixDisplayCodes } from '../../utils/pricingEngine';
import { useOrderState, FINISH_COLORS, STONE_TEXT_COLORS } from '../../hooks/useOrderState';
import { useInventoryAvailability } from '../../hooks/api/useInventory';
import { SYSTEM_IDS } from '../../lib/supabase';
import { getOrderCatalogPrice } from '../../utils/orderPricing';
import {
    buildAvailabilityIndex,
    buildOrderQuantityIndex,
    catalogPriceRange,
    quantityFor,
} from '../../features/orders/smartEntryInsights';
import { PRODUCT_OPTION_COLORS, PRODUCT_OPTION_COLOR_LABELS, isXrCordEnamelSku } from '../../utils/xrOptions';
import { SPECIAL_CREATION_SKU } from '../../utils/specialCreationSku';
import type { Product } from '../../types';
import FulfillmentModeToggle from '../customerService/FulfillmentModeToggle';
import ProductImageZoom from './ProductImageZoom';
import LinkedProductsStrip from '../products/LinkedProductsStrip';

interface Props {
    orderState: ReturnType<typeof useOrderState>;
    isItemsExpanded?: boolean;
}

function collectionLabel(product: Product, collectionNameById: Record<number, string>): string | null {
    const id = product.collections?.[0];
    if (id === undefined) return null;
    return collectionNameById[id] ?? `#${id}`;
}

function optionChipClass(active: boolean): string {
    return `px-3 py-1.5 rounded-lg text-sm font-bold border transition-all ${
        active
            ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
            : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
    }`;
}

const euro = (value: number) => `${formatDecimal(value, 2)}€`;

function priceRangeLabel(range: { min: number; max: number } | null): string {
    if (!range) return '—';
    return range.min === range.max ? euro(range.min) : `${euro(range.min)} – ${euro(range.max)}`;
}

/** Central-warehouse availability pill; muted when nothing is free. */
function StockPill({ available, compact }: { available: number; compact?: boolean }) {
    return (
        <span
            title="Διαθέσιμα στην Κεντρική αποθήκη"
            className={`inline-flex items-center gap-1 rounded-full font-bold tabular-nums ${compact ? 'text-[9px] px-1.5 py-px' : 'text-[10px] px-2 py-0.5'} ${
                available > 0 ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100' : 'bg-slate-100 text-slate-400'
            }`}
        >
            <span className={`w-1.5 h-1.5 rounded-full ${available > 0 ? 'bg-emerald-500' : 'bg-slate-300'}`} />
            {available > 0 ? `${formatNumber(available)} διαθ.` : 'Χωρίς απόθεμα'}
        </span>
    );
}

/** "Already on this order" marker, so a code is never added twice by accident. */
function InOrderPill({ qty, compact }: { qty: number; compact?: boolean }) {
    if (qty <= 0) return null;
    return (
        <span
            title="Ήδη στην παραγγελία"
            className={`inline-flex items-center gap-1 rounded-full font-black tabular-nums bg-sky-50 text-sky-700 ring-1 ring-sky-100 ${compact ? 'text-[9px] px-1.5 py-px' : 'text-[10px] px-2 py-0.5'}`}
        >
            <ShoppingBag size={compact ? 9 : 10} /> ×{formatNumber(qty)}
        </span>
    );
}

export const SmartEntryPanel: React.FC<Props> = ({ orderState, isItemsExpanded }) => {
    const { state, setters, actions, refs } = orderState;
    const [rangeSizesBySku, setRangeSizesBySku] = useState<Record<string, string>>({});
    const [imagePreview, setImagePreview] = useState<{ imageUrl: string; sku: string } | null>(null);
    const [highlightIndex, setHighlightIndex] = useState(-1);
    const matchesListRef = useRef<HTMLDivElement>(null);

    const availabilityQuery = useInventoryAvailability();
    const availability = useMemo(
        () => buildAvailabilityIndex(availabilityQuery.data, SYSTEM_IDS.CENTRAL),
        [availabilityQuery.data],
    );
    const hasAvailability = Boolean(availabilityQuery.data);
    const inOrder = useMemo(() => buildOrderQuantityIndex(state.selectedItems), [state.selectedItems]);

    const matches = !state.activeMaster ? state.skuMatches : null;
    const matchProducts = matches?.products ?? [];

    useEffect(() => {
        setHighlightIndex(-1);
    }, [state.skuMatches]);

    useEffect(() => {
        if (highlightIndex < 0) return;
        matchesListRef.current
            ?.querySelector<HTMLElement>(`[data-match-index="${highlightIndex}"]`)
            ?.scrollIntoView({ block: 'nearest' });
    }, [highlightIndex]);

    useEffect(() => {
        if (!state.pendingOrderRangeReview) {
            setRangeSizesBySku({});
            return;
        }
        setRangeSizesBySku((prev) => {
            const next: Record<string, string> = {};
            state.pendingOrderRangeReview!.rows.forEach((row) => {
                next[row.sku] = prev[row.sku] || '';
            });
            return next;
        });
    }, [state.pendingOrderRangeReview]);

    const clearEntry = () => {
        setters.setActiveMaster(null);
        setters.setScanInput('');
        setters.setFilteredVariants([]);
        setters.setSelectedSize('');
        setters.setSelectedCordColor(undefined);
        setters.setSelectedEnamelColor(undefined);
        setters.setCandidateProducts([]);
        setters.setSkuMatches(null);
        refs.inputRef.current?.focus();
    };

    const handleSkuKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (matchProducts.length > 0 && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault();
            setHighlightIndex((i) =>
                e.key === 'ArrowDown' ? Math.min(i + 1, matchProducts.length - 1) : Math.max(i - 1, -1),
            );
            return;
        }
        if (e.key === 'Enter') {
            const picked = highlightIndex >= 0 ? matchProducts[highlightIndex] : undefined;
            if (picked) {
                e.preventDefault();
                actions.handleSelectMaster(picked);
                return;
            }
            actions.executeAddItem();
            return;
        }
        if (e.key === 'Escape' && (state.scanInput || state.activeMaster)) {
            e.preventDefault();
            clearEntry();
        }
    };

    const productImage = (product: Product | undefined, className: string, iconSize = 16) => {
        if (!product?.image_url) {
            return <div className={`${className} flex items-center justify-center`}><ImageIcon size={iconSize} className="text-slate-300" /></div>;
        }
        const imageUrl = product.image_url;
        return (
            <button
                type="button"
                aria-label={`Μεγέθυνση φωτογραφίας ${product.sku}`}
                title="Πατήστε για μεγέθυνση"
                className={`${className} relative cursor-zoom-in group/image focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500`}
                onClick={(event) => {
                    event.stopPropagation();
                    setImagePreview({ imageUrl, sku: product.sku });
                }}
            >
                <img src={imageUrl} className="w-full h-full object-cover" alt={product.sku} loading="lazy" />
                <ZoomIn size={12} aria-hidden="true" className="absolute bottom-0.5 right-0.5 text-white bg-black/50 rounded-sm opacity-0 group-hover/image:opacity-100 group-focus-visible/image:opacity-100" />
            </button>
        );
    };

    /** The typed text with the matched part bold, so it is obvious why a code is listed. */
    const highlightedSku = (sku: string, term: string) => {
        const n = Math.min(term.length, sku.length);
        return (
            <>
                <span className="text-slate-900">{sku.slice(0, n)}</span>
                <span className="text-slate-400">{sku.slice(n)}</span>
            </>
        );
    };

    const rangeStatusLabel = (status: string) => {
        if (status === 'ready') return 'Έτοιμο';
        if (status === 'missing_variant') return 'Λείπει παραλλαγή';
        if (status === 'ambiguous_variant') return 'Θέλει παραλλαγή';
        return 'Δεν βρέθηκε';
    };

    const rangePreview = state.orderRangePreview;
    const readyRangeCount = rangePreview?.readyRows.length ?? 0;
    const invalidRangeCount = rangePreview ? rangePreview.rows.length - readyRangeCount : 0;
    const pendingRange = state.pendingOrderRangeReview;
    const pendingReadyCount = pendingRange?.readyRows.length ?? 0;

    const recentLines = state.selectedItems.slice(0, 6);
    const isIdle = !state.scanInput.trim() && !state.activeMaster;

    const master = state.activeMaster;
    const masterInOrder = master ? quantityFor(inOrder, master.sku) : 0;
    const masterAvailable = master ? quantityFor(availability, master.sku) : 0;
    const masterPrice = master ? catalogPriceRange(master, state.priceMode) : null;
    const masterCollection = master ? collectionLabel(master, state.collectionNameById) : null;
    const variantPricesDiffer = Boolean(masterPrice && masterPrice.min !== masterPrice.max);

    // SKU Visualizer: renders the SKU text overlay with colour-coded suffix
    const SkuVisualizer = () => {
        const { masterStr, suffixStr, finish, stone, sizeText } = actions.getSkuComponents(state.scanInput, state.activeMaster);
        const fColor = FINISH_COLORS[finish.code] || 'text-slate-400';
        const sColor = STONE_TEXT_COLORS[stone.code] || 'text-emerald-400';

        const renderSuffixChars = () =>
            suffixStr.split('').map((char, i) => {
                let colorClass = 'text-slate-400';
                if (finish.code && i < finish.code.length) colorClass = fColor;
                else if (stone.code && i >= suffixStr.length - stone.code.length) colorClass = sColor;
                return (
                    <span key={i} className={colorClass} style={getSkuStoneLetterStyle(stone.code, i - (suffixStr.length - stone.code.length))}>
                        {char}
                    </span>
                );
            });

        return (
            <div className="absolute inset-0 px-4 border border-transparent pointer-events-none font-mono text-xl font-black tracking-wider flex items-center overflow-hidden whitespace-nowrap z-20">
                <span>
                    <span className="text-slate-900 font-black">{masterStr}</span>
                    <span className="font-black">{renderSuffixChars()}</span>
                    {sizeText && <span className="font-black text-blue-600" title={`Μέγεθος ${state.selectedSize}`}>{sizeText}</span>}
                </span>
            </div>
        );
    };

    return (
        <div
            className={`flex-col bg-white rounded-3xl border border-slate-200/80 shadow-sm p-4 xl:p-5 lg:min-h-0 lg:overflow-y-auto custom-scrollbar ${
                isItemsExpanded ? 'hidden' : 'flex'
            }`}
        >
            <div className="flex items-center justify-between gap-x-3 gap-y-2 flex-wrap mb-4">
                <div className="flex items-center gap-2.5 min-w-0">
                    <div className="p-2 bg-[#060b00] text-white rounded-xl shadow-sm shrink-0">
                        <ScanBarcode size={18} />
                    </div>
                    <h2 className="font-black text-slate-800 uppercase tracking-tight text-[15px] leading-tight">Έξυπνη Ταχεία Προσθήκη</h2>
                </div>
                <FulfillmentModeToggle
                    value={state.defaultFulfillmentMode}
                    onChange={setters.setDefaultFulfillmentMode}
                    label="Νέα είδη"
                    compact
                />
            </div>

            <div className="space-y-4">
                {/* SKU + Qty inputs */}
                <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] gap-3 items-end">
                    <div className="relative min-w-0">
                        <label className="text-[10px] text-slate-400 font-black uppercase mb-1.5 ml-1 block tracking-widest">Κωδικός / SKU</label>
                        <div className="relative">
                            <SkuVisualizer />
                            <input
                                ref={refs.inputRef}
                                type="text"
                                value={state.scanInput}
                                onChange={actions.handleSmartInput}
                                onKeyDown={handleSkuKeyDown}
                                placeholder="Πληκτρολογήστε..."
                                aria-label="Κωδικός / SKU"
                                aria-autocomplete="list"
                                aria-expanded={matchProducts.length > 0}
                                autoComplete="off"
                                spellCheck={false}
                                className="w-full px-4 py-3 bg-slate-50 focus:bg-white text-transparent caret-slate-800 font-mono text-xl font-black rounded-2xl border border-slate-200 outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 uppercase tracking-wider placeholder:text-slate-300 placeholder:font-sans placeholder:font-semibold placeholder:text-base placeholder:normal-case placeholder:tracking-normal relative z-10 transition-colors"
                                autoFocus
                            />
                        </div>
                    </div>
                    <div>
                        <label className="text-[10px] text-slate-400 font-black uppercase mb-1.5 ml-1 block tracking-widest">Ποσ.</label>
                        <input
                            type="number"
                            min="1"
                            aria-label="Ποσότητα"
                            value={state.scanQty}
                            onChange={(e) => setters.setScanQty(parseInt(e.target.value, 10) || 1)}
                            onKeyDown={(e) => e.key === 'Enter' && actions.executeAddItem()}
                            onFocus={(e) => e.target.select()}
                            className="w-full px-2 py-3 text-center font-black text-xl tabular-nums rounded-2xl outline-none bg-slate-50 focus:bg-white text-slate-900 border border-slate-200 focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-colors"
                        />
                    </div>
                </div>

                {/* Συνδεδεμένα Προϊόντα: rest of the set of the line just added */}
                {isIdle && state.missingSetMates.length > 0 && (
                    <LinkedProductsStrip
                        title="Λείπουν από το σετ"
                        items={state.missingSetMates.map((mate) => ({
                            sku: mate.product.sku,
                            suffix: mate.suffix ?? '',
                            imageUrl: mate.product.image_url,
                            gender: mate.product.gender,
                            aside: hasAvailability ? <StockPill available={quantityFor(availability, mate.product.sku)} compact /> : undefined,
                            onSelect: () => actions.handleSelectMaster(mate.product, mate.suffix),
                            onAdd: () => { actions.addSetMate(mate); },
                            addTitle: mate.suffix === null
                                ? `Επιλογή παραλλαγής για ${mate.product.sku}`
                                : `Προσθήκη ${mate.product.sku}${mate.suffix}`,
                        }))}
                        action={(
                            <span className="flex items-center gap-1">
                                <button
                                    type="button"
                                    onClick={actions.addAllSetMates}
                                    className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-violet-600 px-2.5 py-1 text-[11px] font-black text-white shadow-sm transition hover:bg-violet-700"
                                >
                                    <Plus size={12} strokeWidth={3} /> Προσθήκη όλων
                                </button>
                                <button type="button" onClick={actions.dismissSetHint} aria-label="Απόκρυψη" className="rounded-lg p-1 text-violet-400 transition hover:bg-violet-100 hover:text-violet-700">
                                    <X size={13} />
                                </button>
                            </span>
                        )}
                    />
                )}

                {/* Idle: quick repeat of the latest lines + tips */}
                {isIdle && (
                    recentLines.length > 0 ? (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2 px-1">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                                    <History size={12} /> Τελευταίες προσθήκες
                                </span>
                                <span className="text-[10px] font-semibold text-slate-400">πατήστε για +1</span>
                            </div>
                            <div className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-2">
                                {recentLines.map((item, i) => {
                                    const { finishCode, stoneCode } = getVariantSuffixDisplayCodes(
                                        item.variant_suffix,
                                        item.product_details?.gender,
                                        item.product_details,
                                    );
                                    const extra = [item.size_info, item.cord_color, item.enamel_color].filter(Boolean).length;
                                    return (
                                        <button
                                            type="button"
                                            key={item.line_id || `${item.sku}-${item.variant_suffix || ''}-${item.size_info || ''}-${i}`}
                                            onClick={() => actions.updateQuantity(item, item.quantity + 1)}
                                            title={`Ακόμη ένα ${item.sku}${item.variant_suffix || ''}${item.size_info ? ` · ${item.size_info}` : ''}`}
                                            className="flex items-center gap-2.5 p-2 pr-2.5 rounded-xl border border-slate-200 bg-white text-left hover:border-emerald-400 hover:bg-emerald-50/30 active:scale-[0.98] transition-all group"
                                        >
                                            <div className="w-9 h-9 rounded-lg overflow-hidden bg-slate-100 border border-slate-100 shrink-0 flex items-center justify-center">
                                                {item.product_details?.image_url
                                                    ? <img src={item.product_details.image_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                                                    : <ImageIcon size={14} className="text-slate-300" />}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="font-mono font-black text-[13px] leading-tight truncate">
                                                    <span className="text-slate-800">{item.sku}</span>
                                                    {finishCode ? <span className={FINISH_COLORS[finishCode] || 'text-slate-400'}>{finishCode}</span> : null}
                                                    {stoneCode ? <span className={STONE_TEXT_COLORS[stoneCode] || 'text-emerald-500'}><StoneCodeText code={stoneCode} /></span> : null}
                                                </div>
                                                <div className="text-[10px] font-bold text-slate-400 tabular-nums truncate">
                                                    ×{formatNumber(item.quantity)}{item.size_info ? ` · ${item.size_info}` : ''}{extra > (item.size_info ? 1 : 0) ? ' · επιλογές' : ''}
                                                </div>
                                            </div>
                                            <span className="shrink-0 w-6 h-6 rounded-md bg-slate-100 text-slate-500 group-hover:bg-emerald-600 group-hover:text-white flex items-center justify-center transition-colors">
                                                <Plus size={13} />
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                            <p className="px-1 text-[11px] font-medium text-slate-400 flex items-center gap-1.5 flex-wrap">
                                <kbd className="px-1.5 py-0.5 rounded border border-slate-200 bg-white font-mono text-[10px] text-slate-500">Enter</kbd> άμεση προσθήκη
                                <span className="text-slate-300">·</span>
                                <button type="button" onClick={() => setters.setShowScanner(true)} className="inline-flex items-center gap-1 font-bold text-slate-500 hover:text-slate-800">
                                    <Camera size={12} /> Σάρωση barcode
                                </button>
                            </p>
                        </div>
                    ) : (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-5 text-center">
                            <p className="text-sm font-bold text-slate-600">Πληκτρολογήστε κωδικό για να δείτε παραλλαγές, τιμές και απόθεμα</p>
                            <p className="mt-1 text-[11px] font-medium text-slate-400">
                                <kbd className="px-1.5 py-0.5 rounded border border-slate-200 bg-white font-mono text-[10px] text-slate-500">Enter</kbd> για άμεση προσθήκη
                            </p>
                            <button
                                type="button"
                                onClick={() => setters.setShowScanner(true)}
                                className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-[11px] font-bold text-slate-600 hover:text-slate-900 hover:border-slate-300 transition-colors"
                            >
                                <Camera size={13} /> Σάρωση barcode
                            </button>
                        </div>
                    )
                )}

                {rangePreview && (
                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                            <div className="text-[10px] font-black text-emerald-800 uppercase tracking-widest">
                                Εύρος προϊόντων
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-bold text-emerald-900">
                                <span>{rangePreview.rows[0]?.displaySku}</span>
                                <span className="text-emerald-500">→</span>
                                <span>{rangePreview.rows[rangePreview.rows.length - 1]?.displaySku}</span>
                                <span className="text-emerald-700">· {formatNumber(readyRangeCount)}/{formatNumber(rangePreview.rows.length)} έγκυρα</span>
                                {rangePreview.hasSizableRows && <span className="text-slate-500">· μεγέθη</span>}
                            </div>
                        </div>
                        {invalidRangeCount > 0 ? (
                            <div className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-black text-amber-700">
                                <AlertTriangle size={12} /> {formatNumber(invalidRangeCount)}
                            </div>
                        ) : (
                            <CheckCircle2 size={18} className="shrink-0 text-emerald-600" />
                        )}
                    </div>
                )}

                {rangePreview && (
                    <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase mb-2 ml-1 block flex items-center gap-1">
                            <StickyNote size={12} /> Μαζικές σημειώσεις
                        </label>
                        <textarea
                            rows={3}
                            value={state.itemNotes}
                            onChange={(e) => setters.setItemNotes(e.target.value)}
                            placeholder="Σημείωση που θα μπει σε όλα τα είδη του εύρους..."
                            className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 text-sm transition-all resize-y min-h-[5rem]"
                        />
                    </div>
                )}

                {state.scanInput.trim().split(/\s+/)[0]?.toUpperCase() === SPECIAL_CREATION_SKU && (
                    <div className="rounded-2xl border border-violet-200 bg-violet-50/80 p-4 space-y-2">
                        <p className="text-[10px] font-black text-violet-800 uppercase tracking-widest">Ειδική δημιουργία ({SPECIAL_CREATION_SKU})</p>
                        <p className="text-xs text-violet-700 font-medium leading-snug">
                            Καταχωρήστε την τιμή μονάδας (πριν ΦΠΑ), ποσότητα και την υποχρεωτική περιγραφή της δημιουργίας. Μπορείτε να προσθέσετε πολλές γραμμές SP στην ίδια παραγγελία.
                        </p>
                        <div>
                            <label className="text-[10px] text-violet-600 font-black uppercase mb-1 ml-0.5 block">Τιμή μονάδας (€)</label>
                            <input
                                type="text"
                                inputMode="decimal"
                                value={state.specialCreationUnitPriceStr}
                                onChange={(e) => setters.setSpecialCreationUnitPriceStr(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && actions.executeAddItem()}
                                placeholder="π.χ. 120 ή 120,50"
                                className="w-full p-3 bg-white border border-violet-200 rounded-xl font-mono font-bold text-slate-900 outline-none focus:ring-4 focus:ring-violet-500/15"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] text-violet-600 font-black uppercase mb-1 ml-0.5 block flex items-center gap-1">
                                <StickyNote size={10} /> Σημείωση SP (υποχρεωτική)
                            </label>
                            <input
                                type="text"
                                value={state.itemNotes}
                                onChange={(e) => setters.setItemNotes(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && actions.executeAddItem()}
                                required
                                aria-label="Υποχρεωτική σημείωση ειδικής δημιουργίας SP"
                                placeholder="Περιγράψτε τι ακριβώς είναι αυτή η ειδική δημιουργία…"
                                className="w-full p-3 bg-white border border-violet-200 rounded-xl outline-none focus:ring-4 focus:ring-violet-500/15 text-sm text-slate-900"
                            />
                        </div>
                    </div>
                )}

                {/* Literal code matches: only SKUs that start with what was typed */}
                {matches && (
                    matchProducts.length > 0 ? (
                        <div className="animate-in fade-in duration-150 space-y-1.5">
                            <div className="flex items-center justify-between gap-2 px-1">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                    Κωδικοί «<span className="font-mono text-slate-600">{matches.term}</span>…» · {formatNumber(matches.total)}
                                </span>
                                <span className="hidden xl:inline-flex items-center gap-1 text-[10px] font-semibold text-slate-400">
                                    <ArrowUpDown size={11} /> επιλογή <CornerDownLeft size={11} />
                                </span>
                            </div>
                            <div ref={matchesListRef} role="listbox" aria-label="Κωδικοί που ταιριάζουν" className="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100 overflow-hidden">
                                {matchProducts.map((p, i) => {
                                    const price = catalogPriceRange(p, state.priceMode);
                                    const active = i === highlightIndex;
                                    return (
                                        <div
                                            key={p.sku}
                                            role="option"
                                            aria-selected={active}
                                            data-match-index={i}
                                            onClick={() => actions.handleSelectMaster(p)}
                                            onMouseEnter={() => setHighlightIndex(i)}
                                            className={`flex items-center gap-3 px-2.5 py-2 cursor-pointer transition-colors ${active ? 'bg-emerald-50/70' : 'hover:bg-slate-50'}`}
                                        >
                                            {productImage(p, 'w-10 h-10 bg-slate-100 rounded-lg overflow-hidden shrink-0 border border-slate-100')}
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-1.5 min-w-0">
                                                    <span className="font-mono font-black text-sm leading-tight truncate">{highlightedSku(p.sku, matches.term)}</span>
                                                    <InOrderPill qty={quantityFor(inOrder, p.sku)} compact />
                                                </div>
                                                <div className="text-[10px] text-slate-500 truncate mt-0.5">
                                                    {p.category}
                                                    {p.variants?.length ? <span className="text-slate-400"> · {formatNumber(p.variants.length)} παραλλ.</span> : null}
                                                </div>
                                            </div>
                                            <div className="shrink-0 flex flex-col items-end gap-0.5">
                                                <span className="text-xs font-black text-slate-800 tabular-nums">{priceRangeLabel(price)}</span>
                                                {hasAvailability && <StockPill available={quantityFor(availability, p.sku)} compact />}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            {matches.total > matchProducts.length && (
                                <p className="px-1 text-[10px] font-semibold text-slate-400">
                                    +{formatNumber(matches.total - matchProducts.length)} ακόμη — συνεχίστε την πληκτρολόγηση για να περιορίσετε.
                                </p>
                            )}
                        </div>
                    ) : (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50/60 px-4 py-3 flex items-center gap-3">
                            <SearchX size={18} className="text-amber-600 shrink-0" />
                            <p className="text-xs font-bold text-amber-900">
                                Κανένας κωδικός δεν ξεκινά με «<span className="font-mono">{matches.term}</span>».
                            </p>
                        </div>
                    )
                )}

                {/* Active master card */}
                {master && (
                    <div className="bg-white p-4 rounded-2xl border border-emerald-200/70 ring-4 ring-emerald-500/5 shadow-sm animate-in zoom-in-95 duration-200 space-y-4">
                        <div className="flex justify-between items-start gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                                {productImage(master, 'w-16 h-16 bg-slate-100 rounded-xl overflow-hidden shrink-0 border border-slate-200', 24)}
                                <div className="min-w-0">
                                    <h3 className="font-black text-xl text-slate-900 leading-none font-mono truncate">{master.sku}</h3>
                                    <p className="text-xs text-slate-500 font-bold mt-1 uppercase truncate">{master.category}</p>
                                    {masterCollection && (
                                        <p className="text-[10px] text-emerald-700 font-bold mt-0.5 truncate" title={masterCollection}>{masterCollection}</p>
                                    )}
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={clearEntry}
                                aria-label="Καθαρισμός επιλογής"
                                title="Καθαρισμός επιλογής (Esc)"
                                className="p-2 bg-slate-100 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors shrink-0"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        {state.activeMasterSetMates.length > 0 && (
                            <LinkedProductsStrip
                                compact
                                items={state.activeMasterSetMates.map((mate) => ({
                                    sku: mate.sku,
                                    suffix: '',
                                    imageUrl: mate.image_url,
                                    gender: mate.gender,
                                    done: quantityFor(inOrder, mate.sku) > 0,
                                    aside: (
                                        <>
                                            {quantityFor(inOrder, mate.sku) > 0 && <InOrderPill qty={quantityFor(inOrder, mate.sku)} compact />}
                                            {hasAvailability && <StockPill available={quantityFor(availability, mate.sku)} compact />}
                                        </>
                                    ),
                                    onSelect: () => actions.handleSelectMaster(mate),
                                }))}
                            />
                        )}

                        {/* Facts: price, stock, already on this order */}
                        <div className="grid grid-cols-3 gap-2">
                            <div className="rounded-xl bg-slate-50 border border-slate-100 px-2.5 py-2 min-w-0">
                                <div className="text-[9px] font-black text-slate-400 uppercase tracking-wider">
                                    Τιμή {state.priceMode === 'retail' ? 'λιανικής' : 'χονδρικής'}
                                </div>
                                <div className="text-sm font-black text-slate-800 tabular-nums truncate" title={priceRangeLabel(masterPrice)}>
                                    {masterPrice ? (variantPricesDiffer ? `από ${euro(masterPrice.min)}` : euro(masterPrice.min)) : '—'}
                                </div>
                            </div>
                            <div className="rounded-xl bg-slate-50 border border-slate-100 px-2.5 py-2 min-w-0">
                                <div className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Διαθέσιμα</div>
                                <div className={`text-sm font-black tabular-nums ${masterAvailable > 0 ? 'text-emerald-700' : 'text-slate-400'}`}>
                                    {hasAvailability ? formatNumber(masterAvailable) : '—'}
                                </div>
                            </div>
                            <div className={`rounded-xl border px-2.5 py-2 min-w-0 ${masterInOrder > 0 ? 'bg-sky-50 border-sky-100' : 'bg-slate-50 border-slate-100'}`}>
                                <div className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Στην παραγγελία</div>
                                <div className={`text-sm font-black tabular-nums ${masterInOrder > 0 ? 'text-sky-700' : 'text-slate-400'}`}>
                                    {formatNumber(masterInOrder)}
                                </div>
                            </div>
                        </div>

                        {/* Size picker */}
                        {state.sizeMode && (
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase mb-2 ml-1 block flex items-center gap-1">
                                    <Hash size={12} /> Επιλογή {state.sizeMode.type}{' '}
                                    <span className="font-normal text-slate-300 lowercase">(Προαιρετικό)</span>
                                </label>
                                <div className="flex flex-wrap gap-1.5">
                                    {state.sizeMode.sizes.map((s) => (
                                        <button
                                            key={s}
                                            onClick={() => setters.setSelectedSize(s === state.selectedSize ? '' : s)}
                                            type="button"
                                            aria-pressed={state.selectedSize === s}
                                            className={`${optionChipClass(state.selectedSize === s)} min-w-[2.75rem] tabular-nums`}
                                        >
                                            {s}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {isXrCordEnamelSku(master) && (
                            <div className="grid grid-cols-1 gap-3">
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase mb-2 ml-1 block">Χρώμα Κορδόνι</label>
                                    <div className="flex flex-wrap gap-1.5">
                                        {PRODUCT_OPTION_COLORS.map((color) => (
                                            <button
                                                type="button"
                                                key={`cord-${color}`}
                                                onClick={() =>
                                                    setters.setSelectedCordColor(state.selectedCordColor === color ? undefined : color)
                                                }
                                                className={optionChipClass(state.selectedCordColor === color)}
                                            >
                                                {PRODUCT_OPTION_COLOR_LABELS[color]}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase mb-2 ml-1 block">Χρώμα Σμάλτο</label>
                                    <div className="flex flex-wrap gap-1.5">
                                        {PRODUCT_OPTION_COLORS.map((color) => (
                                            <button
                                                type="button"
                                                key={`enamel-${color}`}
                                                onClick={() =>
                                                    setters.setSelectedEnamelColor(state.selectedEnamelColor === color ? undefined : color)
                                                }
                                                className={optionChipClass(state.selectedEnamelColor === color)}
                                            >
                                                {PRODUCT_OPTION_COLOR_LABELS[color]}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Variant grid: each button shows its own price, stock and what is already ordered */}
                        {state.filteredVariants.length > 0 && (
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase mb-2 ml-1 block flex items-center gap-1">
                                    <Layers size={12} /> ΠΑΡΑΛΛΑΓΕΣ
                                    <span className="font-semibold normal-case text-slate-300">· πατήστε για προσθήκη</span>
                                </label>
                                <div className="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-2">
                                    {state.filteredVariants.map((v) => {
                                        const { finishCode, stoneCode } = getVariantSuffixDisplayCodes(
                                            v.suffix,
                                            master.gender,
                                            master,
                                        );
                                        const label = finishCode || stoneCode ? null : v.suffix?.trim() || '—';
                                        const variantInOrder = quantityFor(inOrder, master.sku, v.suffix);
                                        const variantAvailable = quantityFor(availability, master.sku, v.suffix);
                                        return (
                                            <button
                                                type="button"
                                                key={v.suffix}
                                                onClick={() => actions.handleAddItem(v.variant)}
                                                title={v.desc || undefined}
                                                className={`relative px-2 pt-2.5 pb-2 rounded-xl border transition-all flex flex-col items-center gap-1 min-w-0 active:scale-95 hover:border-emerald-500 hover:bg-emerald-50/30 hover:shadow-sm ${
                                                    variantInOrder > 0 ? 'bg-sky-50/40 border-sky-200' : 'bg-white border-slate-200'
                                                }`}
                                            >
                                                {variantInOrder > 0 && (
                                                    <span className="absolute -top-1.5 -right-1.5"><InOrderPill qty={variantInOrder} compact /></span>
                                                )}
                                                <span className="text-sm font-black flex items-center justify-center gap-0.5 flex-wrap leading-none">
                                                    {finishCode ? (
                                                        <span className={FINISH_COLORS[finishCode] || 'text-slate-400'}>{finishCode}</span>
                                                    ) : null}
                                                    {stoneCode ? (
                                                        <span className={STONE_TEXT_COLORS[stoneCode] || 'text-emerald-500'}><StoneCodeText code={stoneCode} /></span>
                                                    ) : null}
                                                    {label ? <span className="text-slate-500 tabular-nums">{label}</span> : null}
                                                </span>
                                                <span className="text-[9px] font-bold text-slate-400 truncate w-full text-center">
                                                    {v.desc || 'Variant'}
                                                </span>
                                                {(variantPricesDiffer || hasAvailability) && (
                                                    <span className="flex items-center justify-center gap-1 flex-wrap">
                                                        {variantPricesDiffer && (
                                                            <span className="text-[10px] font-black text-slate-700 tabular-nums">
                                                                {euro(getOrderCatalogPrice(master, v.suffix, state.priceMode))}
                                                            </span>
                                                        )}
                                                        {hasAvailability && (
                                                            <span
                                                                title="Διαθέσιμα στην Κεντρική αποθήκη"
                                                                className={`inline-flex items-center gap-0.5 text-[9px] font-bold tabular-nums ${variantAvailable > 0 ? 'text-emerald-600' : 'text-slate-300'}`}
                                                            >
                                                                <span className={`w-1.5 h-1.5 rounded-full ${variantAvailable > 0 ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                                                                {formatNumber(variantAvailable)}
                                                            </span>
                                                        )}
                                                    </span>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Item notes */}
                        <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase mb-2 ml-1 block flex items-center gap-1">
                                <StickyNote size={12} /> ΕΙΔΙΚΕΣ ΠΑΡΑΤΗΡΗΣΕΙΣ ΕΙΔΟΥΣ
                            </label>
                            <input
                                type="text"
                                value={state.itemNotes}
                                onChange={(e) => setters.setItemNotes(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && actions.executeAddItem()}
                                placeholder="π.χ. Αλλαγή κουμπώματος, Μακρύτερη αλυσίδα..."
                                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/15 text-sm transition-all"
                            />
                        </div>

                        {/* Add base button (no variants) */}
                        {(!state.activeMaster.variants || state.activeMaster.variants.length === 0) && (
                            <button
                                type="button"
                                onClick={() => actions.handleAddItem(null)}
                                className="w-full bg-emerald-600 text-white py-3 rounded-xl font-black shadow-md shadow-emerald-100 active:scale-[0.98] transition-all flex items-center justify-center gap-2 hover:bg-emerald-700"
                            >
                                <Plus size={20} /> Προσθήκη Βασικού
                            </button>
                        )}
                    </div>
                )}
            </div>

            {pendingRange && (
                <div
                    className="fixed inset-0 z-50 bg-black/35 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
                    onMouseDown={(e) => { if (e.target === e.currentTarget) setters.setPendingOrderRangeReview(null); }}
                    onKeyDown={(e) => { if (e.key === 'Escape') setters.setPendingOrderRangeReview(null); }}
                >
                    <div role="dialog" aria-modal="true" aria-label="Έλεγχος εύρους" className="w-full max-w-3xl max-h-[86dvh] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
                        <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
                            <div>
                                <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">Έλεγχος εύρους</h3>
                                <p className="text-xs text-slate-500 font-bold mt-1">
                                    {formatNumber(pendingReadyCount)}/{formatNumber(pendingRange.rows.length)} έγκυρα · ποσότητα {formatNumber(state.scanQty)}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setters.setPendingOrderRangeReview(null)}
                                aria-label="Κλείσιμο"
                                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50/60 p-3 space-y-2">
                            {pendingRange.rows.map((row) => {
                                const isReady = row.status === 'ready' && row.product;
                                return (
                                    <div
                                        key={row.sku}
                                        className={`grid grid-cols-[3rem_minmax(0,1fr)_minmax(6.5rem,10rem)] gap-3 items-center rounded-xl border p-2.5 ${
                                            isReady ? 'bg-white border-slate-100' : 'bg-amber-50/70 border-amber-100'
                                        }`}
                                    >
                                        {productImage(row.product, 'w-12 h-12 rounded-lg bg-slate-100 overflow-hidden border border-slate-100')}
                                        <div className="min-w-0">
                                            <div className="font-black text-sm text-slate-800 font-mono truncate">{row.displaySku}</div>
                                            <div className="text-[11px] text-slate-500 font-bold truncate">
                                                {row.product?.category || rangeStatusLabel(row.status)}
                                            </div>
                                            {row.status !== 'ready' && (
                                                <div className="mt-1 inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-[9px] font-black text-amber-800">
                                                    <AlertTriangle size={10} /> {rangeStatusLabel(row.status)}
                                                </div>
                                            )}
                                        </div>
                                        <div>
                                            {isReady && row.sizing ? (
                                                <select
                                                    value={rangeSizesBySku[row.sku] || ''}
                                                    onChange={(e) =>
                                                        setRangeSizesBySku((prev) => ({ ...prev, [row.sku]: e.target.value }))
                                                    }
                                                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-500/20"
                                                >
                                                    <option value="">Χωρίς {row.sizing.type}</option>
                                                    {row.sizing.sizes.map((size) => (
                                                        <option key={size} value={size}>{size}</option>
                                                    ))}
                                                </select>
                                            ) : (
                                                <div className="text-[10px] font-bold text-slate-400 text-right">
                                                    {isReady ? 'Χωρίς μέγεθος' : 'Παράλειψη'}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="px-5 py-4 border-t border-slate-100 bg-white flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setters.setPendingOrderRangeReview(null)}
                                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                            >
                                Ακύρωση
                            </button>
                            <button
                                type="button"
                                onClick={() => actions.confirmOrderRangeAdd(rangeSizesBySku)}
                                disabled={pendingReadyCount === 0}
                                className="px-4 py-2 rounded-xl text-xs font-black text-white bg-[#060b00] hover:bg-black transition-colors disabled:opacity-50"
                            >
                                Προσθήκη έγκυρων ({formatNumber(pendingReadyCount)})
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {imagePreview && <ProductImageZoom key={imagePreview.imageUrl} imageUrl={imagePreview.imageUrl} sku={imagePreview.sku} onClose={() => setImagePreview(null)} />}
        </div>
    );
};
