import { resolveSkuSizeInput } from '../../utils/skuSizeInput';
import { getSkuStoneLetterStyle } from '../../utils/skuColoring';
import StoneCodeText from '../StoneCodeText';
import { formatNumber } from '../../utils/numberFormat';
import React, { useEffect, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ScanBarcode, X, Hash, Layers, Plus, ImageIcon, StickyNote, ChevronDown, ChevronUp, AlertTriangle, CheckCircle2, ZoomIn, Camera } from 'lucide-react';
import { getVariantComponents, getVariantSuffixDisplayCodes } from '../../utils/pricingEngine';
import { useOrderState, FINISH_COLORS, STONE_TEXT_COLORS } from '../../hooks/useOrderState';
import {
    buildVariantHintListForRanking,
    getVariantDisplayHighlightHint,
    productMatchesVariantSuffix,
    variantSuffixMatchesOrderHints,
} from '../../features/orders/smartSkuSuggestions';
import { PRODUCT_OPTION_COLORS, PRODUCT_OPTION_COLOR_LABELS, isXrCordEnamelSku } from '../../utils/xrOptions';
import { SPECIAL_CREATION_SKU } from '../../utils/specialCreationSku';
import type { Product } from '../../types';
import FulfillmentModeToggle from '../customerService/FulfillmentModeToggle';
import ProductImageZoom from './ProductImageZoom';

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

function SuffixHighlightPreview({ suffix, gender }: { suffix: string; gender?: Product['gender'] }) {
    const { finish, stone } = getVariantComponents(suffix, gender);
    const fColor = FINISH_COLORS[finish.code] || 'text-slate-500';
    const sColor = STONE_TEXT_COLORS[stone.code] || 'text-emerald-500';
    return (
        <span className="font-mono font-black tracking-wide text-[11px] leading-tight">
            {suffix.split('').map((char, i) => {
                let colorClass = 'text-slate-400';
                if (finish.code && i < finish.code.length) colorClass = fColor;
                else if (stone.code && i >= suffix.length - stone.code.length) colorClass = sColor;
                return (
                    <span key={i} className={colorClass} style={getSkuStoneLetterStyle(stone.code, i - (suffix.length - stone.code.length))}>
                        {char}
                    </span>
                );
            })}
        </span>
    );
}

export const SmartEntryPanel: React.FC<Props> = ({ orderState, isItemsExpanded }) => {
    const { state, setters, actions, refs } = orderState;
    const [suggestionsExpanded, setSuggestionsExpanded] = useState(false);
    const [setMatesExpanded, setSetMatesExpanded] = useState(true);
    const [rangeSizesBySku, setRangeSizesBySku] = useState<Record<string, string>>({});
    const [imagePreview, setImagePreview] = useState<{ imageUrl: string; sku: string } | null>(null);
    const suggestionsScrollRef = useRef<HTMLDivElement>(null);

    const virtualRows = state.smartSuggestions?.virtualRows ?? [];
    const rowVirtualizer = useVirtualizer({
        count: suggestionsExpanded ? virtualRows.length : 0,
        getScrollElement: () => suggestionsScrollRef.current,
        estimateSize: (i) => (virtualRows[i]?.kind === 'header' ? 28 : 56),
        overscan: 12,
    });

    useEffect(() => {
        setSuggestionsExpanded(false);
    }, [state.smartSuggestions]);

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

    const hasSuggestionPanel =
        !state.activeMaster &&
        state.smartSuggestions &&
        (state.smartSuggestions.topChips.length > 0 || state.smartSuggestions.virtualRows.length > 0);

    const typedVariantFromScanInput = (): string | null => {
        const sug = state.smartSuggestions?.variantSuffix;
        if (sug) return sug;
        const m = state.activeMaster;
        if (!m) return null;
        const u = resolveSkuSizeInput(state.scanInput, [m], true).sku;
        const mu = m.sku.toUpperCase();
        if (u.startsWith(mu) && u.length > mu.length) {
            const tail = u.slice(mu.length).trim();
            return tail.length > 0 ? tail : null;
        }
        return null;
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
                <img src={imageUrl} className="w-full h-full object-cover" alt={product.sku} />
                <ZoomIn size={12} aria-hidden="true" className="absolute bottom-0.5 right-0.5 text-white bg-black/50 rounded-sm opacity-0 group-hover/image:opacity-100 group-focus-visible/image:opacity-100" />
            </button>
        );
    };

    const productRow = (p: Product, dense?: boolean) => {
        const col = collectionLabel(p, state.collectionNameById);
        const typed = typedVariantFromScanInput();
        const cartHint =
            state.selectedItems.length > 0 && state.resolveOrderLineProduct
                ? getVariantDisplayHighlightHint(p, state.selectedItems, state.resolveOrderLineProduct, typed)
                : null;
        const globalSug =
            state.smartSuggestions?.highlightVariantSuffix &&
            productMatchesVariantSuffix(p, state.smartSuggestions.highlightVariantSuffix)
                ? state.smartSuggestions.highlightVariantSuffix
                : null;
        const hint = cartHint ?? globalSug;
        const onSelect = () => actions.handleSelectMaster(p, hint);

        return (
            <div
                key={p.sku + (dense ? '-d' : '') + (hint || '')}
                onClick={onSelect}
                className={`flex items-center gap-3 bg-white rounded-xl border cursor-pointer hover:border-emerald-500 shadow-sm transition-all group active:scale-[0.98] ${
                    hint ? 'border-amber-400/90 ring-2 ring-amber-400/35 ring-offset-1' : 'border-slate-200'
                } ${dense ? 'p-2 pr-3' : 'p-2'}`}
            >
                {productImage(p, `${dense ? 'w-9 h-9' : 'w-10 h-10'} bg-slate-100 rounded-lg overflow-hidden shrink-0 border border-slate-100`, dense ? 14 : 16)}
                <div className="min-w-0 flex-1">
                    <div className="font-black text-sm text-slate-800 leading-none group-hover:text-emerald-700 transition-colors font-mono">
                        {p.sku}
                    </div>
                    {hint ? (
                        <div className="flex items-baseline gap-0.5 mt-1">
                            <span className="text-[9px] font-bold text-amber-700/90">+</span>
                            <SuffixHighlightPreview suffix={hint} gender={p.gender} />
                        </div>
                    ) : null}
                    <div className="text-[10px] text-slate-500 mt-0.5 truncate">{p.category}</div>
                    {col ? (
                        <div className="text-[9px] text-emerald-700 font-bold mt-0.5 truncate" title={col}>
                            {col}
                        </div>
                    ) : null}
                </div>
            </div>
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
                                onKeyDown={(e) => e.key === 'Enter' && actions.executeAddItem()}
                                placeholder="Πληκτρολογήστε..."
                                aria-label="Κωδικός / SKU"
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

                {!state.scanInput.trim() && !state.activeMaster && (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-5 text-center">
                        <p className="text-sm font-bold text-slate-600">Πληκτρολογήστε κωδικό για προτάσεις και παραλλαγές</p>
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

                {/* Smart search suggestions */}
                {hasSuggestionPanel && (
                    <div className="animate-in fade-in slide-in-from-top-2 space-y-2">
                        <div className="flex items-start justify-between gap-2 ml-1">
                            <div>
                                <label className="text-[9px] text-slate-400 font-bold uppercase tracking-widest block">ΠΡΟΤΑΣΕΙΣ ΑΝΑΖΗΤΗΣΗΣ</label>
                                {state.smartSuggestions?.rangeHint ? (
                                    <p className="text-[10px] text-slate-500 font-medium mt-1">{state.smartSuggestions.rangeHint}</p>
                                ) : null}
                                {state.smartSuggestions?.variantSuffix ? (
                                    <p className="text-[10px] text-emerald-700 font-bold mt-0.5">Παραλλαγή: {state.smartSuggestions.variantSuffix}</p>
                                ) : null}
                                {state.smartSuggestions?.highlightVariantSuffix ? (
                                    <p className="text-[10px] text-amber-800 font-bold mt-1 flex flex-wrap items-center gap-x-1 gap-y-0.5">
                                        <span className="opacity-70 font-bold">Από παραγγελία · έμφαση μετάλλου/πέτρας:</span>
                                        <SuffixHighlightPreview suffix={state.smartSuggestions.highlightVariantSuffix} />
                                    </p>
                                ) : null}
                            </div>
                            {virtualRows.length > 0 && (
                                <button
                                    type="button"
                                    onClick={() => setSuggestionsExpanded((v) => !v)}
                                    className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 bg-white text-[10px] font-black uppercase text-slate-600 hover:bg-slate-50 transition-colors"
                                    aria-expanded={suggestionsExpanded}
                                >
                                    {suggestionsExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                    {suggestionsExpanded ? 'Λιγότερα' : 'Περισσότερα'}
                                </button>
                            )}
                        </div>
                        <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
                            {state.smartSuggestions!.topChips.map((p) => (
                                <div key={p.sku} className="min-w-[158px] shrink-0">
                                    {productRow(p, false)}
                                </div>
                            ))}
                        </div>
                        {suggestionsExpanded && virtualRows.length > 0 && (
                            <div
                                ref={suggestionsScrollRef}
                                className="max-h-72 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50/80 relative"
                            >
                                <div
                                    className="relative w-full"
                                    style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
                                >
                                    {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                                        const row = virtualRows[virtualRow.index];
                                        if (!row) return null;
                                        if (row.kind === 'header') {
                                            return (
                                                <div
                                                    key={virtualRow.key}
                                                    className="absolute top-0 left-0 w-full px-3 pt-2 pb-0.5 bg-slate-100/90 border-b border-slate-200/80"
                                                    style={{
                                                        height: `${virtualRow.size}px`,
                                                        transform: `translateY(${virtualRow.start}px)`,
                                                    }}
                                                >
                                                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider">{row.label}</span>
                                                </div>
                                            );
                                        }
                                        return (
                                            <div
                                                key={virtualRow.key}
                                                className="absolute top-0 left-0 w-full px-2 py-1"
                                                style={{
                                                    height: `${virtualRow.size}px`,
                                                    transform: `translateY(${virtualRow.start}px)`,
                                                }}
                                            >
                                                {productRow(row.product, true)}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Active master card */}
                {state.activeMaster && (
                    <div className="bg-white p-4 rounded-2xl border border-emerald-200/70 ring-4 ring-emerald-500/5 shadow-sm animate-in zoom-in-95 duration-200 space-y-4">
                        <div className="flex justify-between items-start gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                                {productImage(state.activeMaster, 'w-14 h-14 bg-slate-100 rounded-xl overflow-hidden shrink-0 border border-slate-200', 24)}
                                <div className="min-w-0">
                                    <h3 className="font-black text-xl text-slate-900 leading-none font-mono truncate">{state.activeMaster.sku}</h3>
                                    <p className="text-xs text-slate-500 font-bold mt-1 uppercase truncate">{state.activeMaster.category}</p>
                                </div>
                            </div>
                            <button
                                onClick={() => {
                                    setters.setActiveMaster(null);
                                    setters.setScanInput('');
                                    setters.setFilteredVariants([]);
                                    setters.setSelectedSize('');
                                    setters.setSelectedCordColor(undefined);
                                    setters.setSelectedEnamelColor(undefined);
                                    setters.setCandidateProducts([]);
                                    setters.setSmartSuggestions(null);
                                }}
                                aria-label="Καθαρισμός επιλογής"
                                title="Καθαρισμός επιλογής"
                                className="p-2 bg-slate-100 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors shrink-0"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        {state.activeMasterSetMates.length > 0 && (
                            <div className="rounded-2xl border border-slate-100 bg-slate-50/60 overflow-hidden">
                                <button
                                    type="button"
                                    onClick={() => setSetMatesExpanded((v) => !v)}
                                    className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-slate-100/80 transition-colors"
                                >
                                    <span className="text-[10px] font-black text-slate-600 uppercase tracking-wide">
                                        Συνοδευτικά κομμάτια (συλλογή)
                                    </span>
                                    {setMatesExpanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                                </button>
                                {setMatesExpanded && (
                                    <div className="flex gap-2 overflow-x-auto px-2 pb-3 pt-1 scrollbar-hide">
                                        {state.activeMasterSetMates.map((p) => (
                                            <div key={p.sku} className="min-w-[148px] shrink-0">
                                                {productRow(p, true)}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

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

                        {isXrCordEnamelSku(state.activeMaster) && (
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

                        {/* Variant grid */}
                        {state.filteredVariants.length > 0 && (
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase mb-2 ml-1 block flex items-center gap-1">
                                    <Layers size={12} /> ΠΑΡΑΛΛΑΓΕΣ
                                </label>
                                <div className="grid grid-cols-[repeat(auto-fill,minmax(6rem,1fr))] gap-2">
                                    {state.filteredVariants.map((v) => {
                                        const { finishCode, stoneCode } = getVariantSuffixDisplayCodes(
                                            v.suffix,
                                            state.activeMaster!.gender,
                                            state.activeMaster,
                                        );
                                        const label = finishCode || stoneCode ? null : v.suffix?.trim() || '—';
                                        const typedTail = typedVariantFromScanInput();
                                        const orderHints =
                                            state.selectedItems.length > 0 && state.resolveOrderLineProduct && state.activeMaster
                                                ? buildVariantHintListForRanking(
                                                      state.activeMaster,
                                                      state.selectedItems,
                                                      state.resolveOrderLineProduct,
                                                      typedTail,
                                                  )
                                                : [];
                                        const orderHintMatch =
                                            orderHints.length > 0 &&
                                            variantSuffixMatchesOrderHints(v.suffix, orderHints, state.activeMaster);
                                        return (
                                            <button
                                                type="button"
                                                key={v.suffix}
                                                onClick={() => actions.handleAddItem(v.variant)}
                                                title={v.desc || undefined}
                                                className={`px-2 py-2.5 rounded-xl border transition-all flex flex-col items-center gap-0.5 min-w-0 active:scale-95 ${
                                                    orderHintMatch
                                                        ? 'bg-amber-50/90 border-amber-400/90 ring-2 ring-amber-400/35 ring-offset-1 hover:border-amber-500'
                                                        : 'bg-white border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/30 hover:shadow-sm'
                                                }`}
                                            >
                                                <span className="text-sm font-black flex items-center justify-center gap-0.5 flex-wrap">
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
