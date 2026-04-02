import React, { useEffect, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ScanBarcode, X, Hash, Layers, Plus, ImageIcon, StickyNote, ChevronDown, ChevronUp } from 'lucide-react';
import { getVariantComponents, getVariantSuffixDisplayCodes } from '../../utils/pricingEngine';
import { useOrderState, FINISH_COLORS, STONE_TEXT_COLORS } from '../../hooks/useOrderState';
import { productMatchesVariantSuffix } from '../../features/orders/smartSkuSuggestions';
import { PRODUCT_OPTION_COLORS, PRODUCT_OPTION_COLOR_LABELS, isXrCordEnamelSku } from '../../utils/xrOptions';
import { SPECIAL_CREATION_SKU } from '../../utils/specialCreationSku';
import type { Product } from '../../types';

interface Props {
    orderState: ReturnType<typeof useOrderState>;
    isItemsExpanded?: boolean;
}

function collectionLabel(product: Product, collectionNameById: Record<number, string>): string | null {
    const id = product.collections?.[0];
    if (id === undefined) return null;
    return collectionNameById[id] ?? `#${id}`;
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
                    <span key={i} className={colorClass}>
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

    const hasSuggestionPanel =
        !state.activeMaster &&
        state.smartSuggestions &&
        (state.smartSuggestions.topChips.length > 0 || state.smartSuggestions.virtualRows.length > 0);

    const productRow = (p: Product, dense?: boolean, preferVariantFromOrder?: string | null) => {
        const col = collectionLabel(p, state.collectionNameById);
        const hint =
            (preferVariantFromOrder && productMatchesVariantSuffix(p, preferVariantFromOrder)
                ? preferVariantFromOrder
                : null) ||
            (state.smartSuggestions?.highlightVariantSuffix &&
            productMatchesVariantSuffix(p, state.smartSuggestions.highlightVariantSuffix)
                ? state.smartSuggestions.highlightVariantSuffix
                : null);
        const onSelect = () => actions.handleSelectMaster(p, hint);

        return (
            <div
                key={p.sku + (dense ? '-d' : '') + (hint || '')}
                onClick={onSelect}
                className={`flex items-center gap-3 bg-white rounded-xl border cursor-pointer hover:border-emerald-500 shadow-sm transition-all group active:scale-[0.98] ${
                    hint ? 'border-amber-400/90 ring-2 ring-amber-400/35 ring-offset-1' : 'border-slate-200'
                } ${dense ? 'p-2 pr-3' : 'p-2'}`}
            >
                <div className={`${dense ? 'w-9 h-9' : 'w-10 h-10'} bg-slate-100 rounded-lg overflow-hidden shrink-0 border border-slate-100`}>
                    {p.image_url ? (
                        <img src={p.image_url} className="w-full h-full object-cover" alt="" />
                    ) : (
                        <ImageIcon size={dense ? 14 : 16} className="m-auto text-slate-300" />
                    )}
                </div>
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

    // SKU Visualizer: renders the SKU text overlay with colour-coded suffix
    const SkuVisualizer = () => {
        const { masterStr, suffixStr, finish, stone } = actions.getSkuComponents(state.scanInput, state.activeMaster);
        const fColor = FINISH_COLORS[finish.code] || 'text-slate-400';
        const sColor = STONE_TEXT_COLORS[stone.code] || 'text-emerald-400';

        const renderSuffixChars = () =>
            suffixStr.split('').map((char, i) => {
                let colorClass = 'text-slate-400';
                if (finish.code && i < finish.code.length) colorClass = fColor;
                else if (stone.code && i >= suffixStr.length - stone.code.length) colorClass = sColor;
                return (
                    <span key={i} className={colorClass}>
                        {char}
                    </span>
                );
            });

        return (
            <div className="absolute inset-y-0 left-0 p-3.5 pointer-events-none font-mono text-xl tracking-wider flex items-center overflow-hidden z-20">
                <span>
                    <span className="text-slate-900 font-black">{masterStr}</span>
                    <span className="font-black">{renderSuffixChars()}</span>
                </span>
            </div>
        );
    };

    return (
        <div
            className={`flex flex-col h-full bg-slate-50/50 rounded-[2.5rem] border border-slate-200 p-6 shadow-inner overflow-y-auto custom-scrollbar transition-all ${
                isItemsExpanded ? 'hidden lg:col-span-0' : 'lg:col-span-5'
            }`}
        >
            <div className="flex items-center gap-3 mb-6">
                <div className="p-2.5 bg-[#060b00] text-white rounded-xl shadow-lg">
                    <ScanBarcode size={22} className="animate-pulse" />
                </div>
                <h2 className="font-black text-slate-800 uppercase tracking-tighter text-lg">Έξυπνη Ταχεία Προσθήκη</h2>
            </div>

            <div className="space-y-6">
                {/* SKU + Qty inputs */}
                <div className="grid grid-cols-12 gap-4 items-end">
                    <div className="col-span-9 relative">
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
                                className="w-full p-3.5 bg-white text-transparent caret-slate-800 font-mono text-xl font-black rounded-2xl border border-slate-200 outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 uppercase tracking-widest shadow-sm relative z-10"
                                autoFocus
                            />
                        </div>
                    </div>
                    <div className="col-span-3">
                        <label className="text-[10px] text-slate-400 font-black uppercase mb-1.5 ml-1 block tracking-widest">Ποσ.</label>
                        <input
                            type="number"
                            min="1"
                            value={state.scanQty}
                            onChange={(e) => setters.setScanQty(parseInt(e.target.value, 10) || 1)}
                            onKeyDown={(e) => e.key === 'Enter' && actions.executeAddItem()}
                            className="w-full p-3.5 text-center font-black text-xl rounded-2xl outline-none bg-white text-slate-900 border border-slate-200 focus:ring-4 focus:ring-emerald-500/10 shadow-sm"
                        />
                    </div>
                </div>

                {state.scanInput.trim().split(/\s+/)[0]?.toUpperCase() === SPECIAL_CREATION_SKU && (
                    <div className="rounded-2xl border border-violet-200 bg-violet-50/80 p-4 space-y-2">
                        <p className="text-[10px] font-black text-violet-800 uppercase tracking-widest">Ειδική δημιουργία ({SPECIAL_CREATION_SKU})</p>
                        <p className="text-xs text-violet-700 font-medium leading-snug">
                            Καταχωρήστε την τιμή μονάδας (πριν ΦΠΑ), ποσότητα και προαιρετικές σημειώσεις. Μπορείτε να προσθέσετε πολλές γραμμές SP στην ίδια παραγγελία.
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
                                    {productRow(p, false, state.recentOrderVariantHint)}
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
                                                {productRow(row.product, true, state.recentOrderVariantHint)}
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
                    <div className="bg-white p-5 rounded-3xl border border-emerald-100 shadow-xl animate-in zoom-in-95 duration-200 space-y-6">
                        <div className="flex justify-between items-start">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 bg-slate-100 rounded-xl overflow-hidden border border-slate-200">
                                    {state.activeMaster.image_url ? (
                                        <img src={state.activeMaster.image_url} className="w-full h-full object-cover" alt="" />
                                    ) : (
                                        <ImageIcon className="m-3 text-slate-300" />
                                    )}
                                </div>
                                <div>
                                    <h3 className="font-black text-xl text-slate-900 leading-none">{state.activeMaster.sku}</h3>
                                    <p className="text-xs text-slate-500 font-bold mt-1 uppercase">{state.activeMaster.category}</p>
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
                                className="p-2 bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
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
                                                {productRow(p, true, state.recentOrderVariantHint)}
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
                                <div className="flex flex-wrap gap-2">
                                    {state.sizeMode.sizes.map((s) => (
                                        <button
                                            key={s}
                                            onClick={() => setters.setSelectedSize(s === state.selectedSize ? '' : s)}
                                            className={`px-3 py-2 rounded-xl text-sm font-bold border transition-all ${
                                                state.selectedSize === s
                                                    ? 'bg-slate-900 text-white border-slate-900 shadow-md scale-105'
                                                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                                            }`}
                                        >
                                            {s}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {isXrCordEnamelSku(state.activeMaster) && (
                            <div className="grid grid-cols-1 gap-4">
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase mb-2 ml-1 block">Χρώμα Κορδόνι</label>
                                    <div className="flex flex-wrap gap-2">
                                        {PRODUCT_OPTION_COLORS.map((color) => (
                                            <button
                                                key={`cord-${color}`}
                                                onClick={() =>
                                                    setters.setSelectedCordColor(state.selectedCordColor === color ? undefined : color)
                                                }
                                                className={`px-3 py-2 rounded-xl text-sm font-bold border transition-all ${
                                                    state.selectedCordColor === color
                                                        ? 'bg-slate-900 text-white border-slate-900 shadow-md scale-105'
                                                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                                                }`}
                                            >
                                                {PRODUCT_OPTION_COLOR_LABELS[color]}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase mb-2 ml-1 block">Χρώμα Σμάλτο</label>
                                    <div className="flex flex-wrap gap-2">
                                        {PRODUCT_OPTION_COLORS.map((color) => (
                                            <button
                                                key={`enamel-${color}`}
                                                onClick={() =>
                                                    setters.setSelectedEnamelColor(state.selectedEnamelColor === color ? undefined : color)
                                                }
                                                className={`px-3 py-2 rounded-xl text-sm font-bold border transition-all ${
                                                    state.selectedEnamelColor === color
                                                        ? 'bg-slate-900 text-white border-slate-900 shadow-md scale-105'
                                                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                                                }`}
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
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                    {state.filteredVariants.map((v) => {
                                        const { finishCode, stoneCode } = getVariantSuffixDisplayCodes(
                                            v.suffix,
                                            state.activeMaster!.gender,
                                            state.activeMaster,
                                        );
                                        const label = finishCode || stoneCode ? null : v.suffix?.trim() || '—';
                                        return (
                                            <button
                                                key={v.suffix}
                                                onClick={() => actions.handleAddItem(v.variant)}
                                                className="p-3 rounded-xl border transition-all flex flex-col items-center gap-1 shadow-sm active:scale-95 bg-white border-slate-100 hover:border-emerald-500"
                                            >
                                                <span className="text-sm font-black flex items-center justify-center gap-0.5 flex-wrap">
                                                    {finishCode ? (
                                                        <span className={FINISH_COLORS[finishCode] || 'text-slate-400'}>{finishCode}</span>
                                                    ) : null}
                                                    {stoneCode ? (
                                                        <span className={STONE_TEXT_COLORS[stoneCode] || 'text-emerald-500'}>{stoneCode}</span>
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
                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 text-sm transition-all"
                            />
                        </div>

                        {/* Add base button (no variants) */}
                        {(!state.activeMaster.variants || state.activeMaster.variants.length === 0) && (
                            <button
                                onClick={() => actions.handleAddItem(null)}
                                className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-black shadow-lg shadow-emerald-100 active:scale-95 transition-all flex items-center justify-center gap-2 hover:bg-emerald-700"
                            >
                                <Plus size={24} /> Προσθήκη Βασικού
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
