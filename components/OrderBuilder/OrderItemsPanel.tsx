import React, { useMemo, useState } from 'react';
import { Search, X, ArrowDownAZ, Camera, Plus, Minus, Trash2, StickyNote, Box, RefreshCw, Save, Loader2, Pencil, Check } from 'lucide-react';
import { FINISH_CODES } from '../../constants';
import { OrderItem } from '../../types';
import { formatCurrency, formatDecimal, getVariantComponents, getVariantSuffixDisplayCodes } from '../../utils/pricingEngine';
import { getSizingInfo } from '../../utils/sizing';
import { useOrderState, FINISH_COLORS, STONE_TEXT_COLORS } from '../../hooks/useOrderState';
import { PRODUCT_OPTION_COLORS, PRODUCT_OPTION_COLOR_LABELS, getProductOptionColorLabel, isXrCordEnamelSku } from '../../utils/xrOptions';
import { isSpecialCreationSku } from '../../utils/specialCreationSku';
import { getOrderItemMatchKey } from '../../utils/orderItemMatch';

interface Props {
    orderState: ReturnType<typeof useOrderState>;
    onOpenScanner: () => void;
    isExpanded?: boolean;
}

export const OrderItemsPanel: React.FC<Props> = ({ orderState, onOpenScanner, isExpanded }) => {
    const { state, setters, actions } = orderState;
    const totalPieces = useMemo(
        () => state.selectedItems.reduce((sum, item) => sum + item.quantity, 0),
        [state.selectedItems],
    );
    const [priceEditLineKey, setPriceEditLineKey] = useState<string | null>(null);
    const [priceInputStr, setPriceInputStr] = useState<string>('');
    const [editingItem, setEditingItem] = useState<OrderItem | null>(null);
    const [editFinish, setEditFinish] = useState('');
    const [editVariantSuffix, setEditVariantSuffix] = useState('');
    const [editSizeInfo, setEditSizeInfo] = useState('');
    const [editCordColor, setEditCordColor] = useState<OrderItem['cord_color']>();
    const [editEnamelColor, setEditEnamelColor] = useState<OrderItem['enamel_color']>();

    const commitPriceEdit = (item: OrderItem) => {
        const trimmed = priceInputStr.trim();
        if (trimmed === '' && !isSpecialCreationSku(item.sku)) {
            actions.revertItemToCatalogPrice(item);
        } else {
            const val = parseFloat(trimmed.replace(',', '.'));
            if (!isNaN(val)) {
                actions.updateItemUnitPrice(item, val);
            }
        }
        setPriceEditLineKey(null);
    };

    const editProduct = editingItem?.product_details;
    const editVariants = editProduct?.variants || [];

    const editSizeMode = useMemo(() => {
        if (!editProduct) return null;
        return getSizingInfo(editProduct);
    }, [editProduct]);

    const editVariantsByFinish = useMemo(() => {
        if (!editProduct || editVariants.length === 0) return {} as Record<string, typeof editVariants>;
        const map: Record<string, typeof editVariants> = {};
        const order = ['', 'P', 'X', 'D', 'H'];

        editVariants.forEach(v => {
            const { finish } = getVariantComponents(v.suffix, editProduct.gender);
            const code = finish.code ?? '';
            if (!map[code]) map[code] = [];
            map[code].push(v);
        });

        order.forEach(code => {
            if (map[code]) map[code].sort((a, b) => a.suffix.localeCompare(b.suffix));
        });

        return map;
    }, [editProduct, editVariants]);

    const editFinishOptions = useMemo(() => {
        const order = ['', 'P', 'X', 'D', 'H'];
        const preferred = order.filter(code => editVariantsByFinish[code]?.length);
        const extras = Object.keys(editVariantsByFinish).filter(code => !order.includes(code));
        return [...preferred, ...extras];
    }, [editVariantsByFinish]);

    const editStoneOptions = useMemo(() => {
        return editVariantsByFinish[editFinish] || [];
    }, [editVariantsByFinish, editFinish]);

    const openEditItem = (item: OrderItem) => {
        if (isSpecialCreationSku(item.sku)) return;
        setEditingItem(item);
        const product = item.product_details;
        const variants = product?.variants || [];

        if (variants.length > 0) {
            const currentSuffix = item.variant_suffix ?? '';
            const safeSuffix = variants.some(v => v.suffix === currentSuffix) ? currentSuffix : variants[0].suffix;
            const { finish } = getVariantComponents(safeSuffix, product?.gender);
            setEditVariantSuffix(safeSuffix);
            setEditFinish(finish.code ?? '');
        } else {
            setEditVariantSuffix('');
            setEditFinish('');
        }

        setEditSizeInfo(item.size_info || '');
        setEditCordColor(item.cord_color);
        setEditEnamelColor(item.enamel_color);
    };

    const handleEditFinishChange = (finishCode: string) => {
        setEditFinish(finishCode);
        const options = editVariantsByFinish[finishCode] || [];
        if (options.length === 0) return;
        const hasCurrent = options.some(v => v.suffix === editVariantSuffix);
        setEditVariantSuffix(hasCurrent ? editVariantSuffix : options[0].suffix);
    };

    const closeEditModal = () => {
        setEditingItem(null);
        setEditFinish('');
        setEditVariantSuffix('');
        setEditSizeInfo('');
        setEditCordColor(undefined);
        setEditEnamelColor(undefined);
    };

    const handleConfirmEdit = () => {
        if (!editingItem) return;
        const nextVariant = editVariants.length > 0 ? editVariantSuffix : undefined;
        actions.updateItemVariantAndSize(editingItem, nextVariant, editSizeInfo || undefined, editCordColor, editEnamelColor);
        closeEditModal();
    };

    return (
        <>
            <div className={`${isExpanded ? 'lg:col-span-9' : 'lg:col-span-4'} flex flex-col h-full bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden relative transition-all`}>
            {/* Header */}
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3 bg-slate-50/50">
                <label className="flex-1 min-w-0 text-xs font-black text-slate-600 uppercase tracking-[0.12em] leading-snug">
                    Περιεχόμενα · <span className="text-slate-800 tabular-nums">{totalPieces}</span> τεμάχια
                </label>
                <div className="flex items-center gap-1 shrink-0">
                    <button
                        type="button"
                        onClick={actions.handleRecalculatePrices}
                        title="Συγχρονισμός τιμών με τον κατάλογο"
                        className="h-7 w-7 inline-flex items-center justify-center rounded-lg border border-slate-200/90 bg-white/80 text-slate-400 hover:text-amber-700 hover:border-amber-200/80 hover:bg-amber-50/40 transition-colors"
                    >
                        <RefreshCw size={14} strokeWidth={2} />
                    </button>
                    <button
                        type="button"
                        onClick={() => setters.setSortOrder(prev => prev === 'input' ? 'alpha' : 'input')}
                        title={state.sortOrder === 'input' ? 'Ταξινόμηση: χρονολογική · πατήστε για αλφαβητική' : 'Ταξινόμηση: αλφαβητική · πατήστε για χρονολογική'}
                        className="h-7 w-7 inline-flex items-center justify-center rounded-lg border border-slate-200/90 bg-white/80 text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                        <ArrowDownAZ size={14} strokeWidth={2} />
                    </button>
                    <button
                        type="button"
                        onClick={onOpenScanner}
                        title="Σάρωση barcode"
                        className="h-7 w-7 inline-flex items-center justify-center rounded-lg border border-slate-200/90 bg-white/80 text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors active:scale-95"
                    >
                        <Camera size={14} strokeWidth={2} />
                    </button>
                </div>
            </div>

            {/* Search */}
            <div className="px-5 py-3 border-b border-slate-50 bg-white">
                <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        value={state.itemSearchTerm}
                        onChange={e => setters.setItemSearchTerm(e.target.value)}
                        placeholder="Αναζήτηση στα είδη της εντολής..."
                        className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs outline-none focus:ring-2 focus:ring-emerald-500/20 focus:bg-white transition-all"
                    />
                    {state.itemSearchTerm && (
                        <button onClick={() => setters.setItemSearchTerm('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600">
                            <X size={14} />
                        </button>
                    )}
                </div>
            </div>

            {/* Items List */}
            <div className="flex-1 overflow-y-auto space-y-2 p-3 custom-scrollbar bg-slate-50/50">
                {state.displayItems.map((item, index) => {
                    const lineKey = getOrderItemMatchKey(item);
                    const isPriceEditing = priceEditLineKey === lineKey;
                    return (
                    <div
                        key={item.line_id || `${item.sku}-${item.variant_suffix || ''}-${item.size_info || ''}-${item.cord_color || ''}-${item.enamel_color || ''}-${index}`}
                        className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm flex flex-col gap-2 animate-in slide-in-from-right-4 transition-all hover:shadow-md group"
                    >
                        <div className="flex flex-col gap-2">
                            <div className="flex items-start gap-2.5">
                                <div className="w-[3.25rem] h-[3.25rem] sm:w-14 sm:h-14 bg-slate-50 rounded-lg overflow-hidden shrink-0 border border-slate-100">
                                    {isSpecialCreationSku(item.sku) ? (
                                        <div className="w-full h-full flex items-center justify-center text-[11px] font-black text-violet-700 bg-violet-50">SP</div>
                                    ) : item.product_details?.image_url ? (
                                        <img src={item.product_details.image_url} className="w-full h-full object-cover" alt="" />
                                    ) : null}
                                </div>
                                <div className="min-w-0 flex-1 pt-0.5">
                                    <div className="font-black text-slate-800 text-[15px] sm:text-base leading-snug break-words [overflow-wrap:anywhere]">
                                        {isSpecialCreationSku(item.sku) ? (
                                            <span className="text-violet-900">{item.sku}</span>
                                        ) : (
                                            (() => {
                                                const { finishCode, stoneCode } = getVariantSuffixDisplayCodes(
                                                    item.variant_suffix,
                                                    item.product_details?.gender,
                                                    item.product_details,
                                                );
                                                const finishClass = FINISH_COLORS[finishCode] || FINISH_COLORS[''];
                                                const stoneClass = STONE_TEXT_COLORS[stoneCode] || 'text-emerald-500';
                                                return (
                                                    <span className="inline align-baseline">
                                                        <span className="text-slate-800">{item.sku}</span>
                                                        {finishCode ? <span className={finishClass}>{finishCode}</span> : null}
                                                        {stoneCode ? <span className={stoneClass}>{stoneCode}</span> : null}
                                                    </span>
                                                );
                                            })()
                                        )}
                                    </div>
                                    {isSpecialCreationSku(item.sku) && (
                                        <div className="text-[11px] text-violet-600 font-bold mt-0.5 leading-snug break-words [overflow-wrap:anywhere]">{item.product_details?.category || 'Ειδική δημιουργία'}</div>
                                    )}
                                </div>
                                <div className="flex flex-col items-end gap-1 shrink-0 self-start min-w-0 max-w-[42%] sm:max-w-none">
                                    <div className="flex items-center gap-1">
                                        <div className="flex items-center gap-0 bg-slate-100 p-0.5 rounded-md border border-slate-200">
                                            <button type="button" onClick={() => actions.updateQuantity(item, item.quantity - 1)} className="p-0.5 hover:bg-white rounded text-slate-600 active:scale-95"><Minus size={11} /></button>
                                            <span className="min-w-[1.25rem] text-center font-black text-xs tabular-nums px-0.5">{item.quantity}</span>
                                            <button type="button" onClick={() => actions.updateQuantity(item, item.quantity + 1)} className="p-0.5 hover:bg-white rounded text-slate-600 active:scale-95"><Plus size={11} /></button>
                                        </div>
                                        {!isSpecialCreationSku(item.sku) && (
                                            <button type="button" onClick={() => openEditItem(item)} className="p-1.5 text-slate-300 hover:text-blue-500 transition-colors" title="Επεξεργασία SKU">
                                                <Pencil size={14} />
                                            </button>
                                        )}
                                        <button type="button" onClick={() => actions.handleRemoveItem(item)} className="p-1.5 text-slate-300 hover:text-red-500 transition-colors" title="Αφαίρεση">
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                    <div className="w-full flex flex-col items-end">
                                        {isPriceEditing ? (
                                            <div
                                                className={`flex items-center justify-end gap-1 rounded-lg border px-1.5 py-1 w-full max-w-[9.5rem] ${
                                                    isSpecialCreationSku(item.sku)
                                                        ? 'border-violet-300 bg-violet-50/50'
                                                        : item.price_override
                                                          ? 'border-amber-400 bg-amber-50/60'
                                                          : 'border-emerald-400/70 bg-emerald-50/35'
                                                }`}
                                            >
                                                <span className="text-xs font-bold text-slate-600 shrink-0">€</span>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    step={0.01}
                                                    autoFocus
                                                    value={priceInputStr}
                                                    onFocus={e => e.target.select()}
                                                    onChange={e => setPriceInputStr(e.target.value)}
                                                    onBlur={() => commitPriceEdit(item)}
                                                    onKeyDown={e => {
                                                        if (e.key === 'Enter') { e.preventDefault(); commitPriceEdit(item); }
                                                        if (e.key === 'Escape') setPriceEditLineKey(null);
                                                    }}
                                                    className="min-w-0 flex-1 bg-white rounded border border-slate-200 px-1 py-0.5 font-mono text-sm font-bold tabular-nums text-right text-slate-900 outline-none focus:ring-1 focus:ring-emerald-500/35"
                                                />
                                                <button
                                                    type="button"
                                                    onMouseDown={e => e.preventDefault()}
                                                    onClick={() => commitPriceEdit(item)}
                                                    title={priceInputStr.trim() === '' && !isSpecialCreationSku(item.sku) ? 'Επαναφορά τιμής καταλόγου' : 'Επιβεβαίωση τιμής'}
                                                    className={`shrink-0 rounded p-0.5 transition-colors ${
                                                        priceInputStr.trim() === '' && !isSpecialCreationSku(item.sku)
                                                            ? 'text-blue-600 hover:bg-blue-100'
                                                            : 'text-emerald-600 hover:bg-emerald-100'
                                                    }`}
                                                >
                                                    <Check size={12} />
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => { setPriceEditLineKey(lineKey); setPriceInputStr(item.price_at_order > 0 ? String(item.price_at_order) : ''); }}
                                                title="Πατήστε για αλλαγή τιμής"
                                                className={`group/price text-right rounded-lg px-1.5 py-0.5 -mr-0.5 transition-colors ${
                                                    isSpecialCreationSku(item.sku)
                                                        ? 'hover:bg-violet-50/70'
                                                        : item.price_override
                                                          ? 'hover:bg-amber-50/80'
                                                          : 'hover:bg-slate-50'
                                                }`}
                                            >
                                                <div
                                                    className={`font-black tabular-nums tracking-tight leading-none ${
                                                        isSpecialCreationSku(item.sku) ? 'text-violet-900' : item.price_override ? 'text-amber-900' : 'text-slate-900'
                                                    } ${item.price_override ? 'text-base' : 'text-[15px] sm:text-lg'}`}
                                                >
                                                    {formatDecimal(item.price_at_order, 2)}€
                                                </div>
                                                <div className="mt-0.5 flex flex-col items-end gap-0 leading-tight">
                                                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wide">ανά τεμ.</span>
                                                    {item.price_override && !isSpecialCreationSku(item.sku) && (
                                                        <span className="text-[8px] font-bold text-amber-700/90">εκτός καταλόγου *</span>
                                                    )}
                                                    <span className="text-[8px] font-medium text-slate-400 opacity-0 group-hover/price:opacity-100 transition-opacity">
                                                        αλλαγή τιμής
                                                    </span>
                                                </div>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                            {(item.size_info || item.cord_color || item.enamel_color) && (
                                <div className="flex flex-wrap items-stretch gap-1 w-full pt-1.5 border-t border-slate-100/90">
                                    {item.size_info && <span className="inline-flex items-center text-[9px] font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded-md border border-slate-100">μέγεθος: {item.size_info}</span>}
                                    {item.cord_color && <span className="inline-flex items-center text-[9px] font-bold bg-amber-50 text-amber-800 px-2 py-1 rounded-md border border-amber-100">Κορδόνι: {getProductOptionColorLabel(item.cord_color)}</span>}
                                    {item.enamel_color && <span className="inline-flex items-center text-[9px] font-bold bg-rose-50 text-rose-800 px-2 py-1 rounded-md border border-rose-100">Σμάλτο: {getProductOptionColorLabel(item.enamel_color)}</span>}
                                </div>
                            )}
                        </div>

                        <div className="relative group/note">
                            <input
                                type="text"
                                value={item.notes || ''}
                                onChange={e => actions.updateItemNotes(item, e.target.value)}
                                placeholder="Προσθήκη παρατήρησης είδους..."
                                className="w-full pl-6 py-1 text-[10px] bg-slate-50 border border-transparent hover:border-slate-200 focus:border-emerald-300 focus:bg-white rounded-md outline-none font-medium text-slate-600 transition-all placeholder:italic"
                            />
                            <StickyNote size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-300 group-hover/note:text-emerald-400" />
                        </div>
                    </div>
                    );
                })}
                {state.selectedItems.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-slate-300 italic py-10">
                        <Box size={48} className="opacity-20 mb-4" />
                        <p className="text-sm font-bold">Το καλάθι είναι άδειο.</p>
                    </div>
                )}
            </div>

            {/* Saving Overlay */}
            {state.isSaving && (
                <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-20 flex flex-col items-center justify-center gap-4 rounded-3xl animate-in fade-in duration-200">
                    <div className="relative">
                        <div className="w-16 h-16 rounded-full bg-slate-900/10 animate-ping absolute inset-0" />
                        <div className="w-16 h-16 rounded-full bg-white shadow-xl flex items-center justify-center relative">
                            <Loader2 size={28} className="animate-spin text-slate-700" />
                        </div>
                    </div>
                    <p className="text-sm font-bold text-slate-600 tracking-wide">Αποθήκευση...</p>
                </div>
            )}

            {/* Totals Footer */}
            <div className="p-5 bg-slate-50 border-t border-slate-200">
                <div className="flex justify-between items-center text-xs text-slate-500 mb-1">
                    <span>Καθαρή Αξία:</span>
                    <div className="flex items-center gap-1">
                        <span className="font-mono font-bold">{formatCurrency(state.subtotal)}</span>
                        {state.priceDiffs && state.priceDiffs.net !== 0 && (
                            <span className={`text-[10px] font-bold ${state.priceDiffs.net > 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                                ({state.priceDiffs.net > 0 ? '+' : ''}{formatCurrency(state.priceDiffs.net)})
                            </span>
                        )}
                    </div>
                </div>
                {state.discountPercent > 0 && (
                    <div className="flex justify-between items-center text-xs text-red-500 mb-1">
                        <span>Έκπτωση ({state.discountPercent}%):</span>
                        <span className="font-mono font-bold">-{formatCurrency(state.discountAmount)}</span>
                    </div>
                )}
                <div className="flex justify-between items-center text-xs text-slate-500 border-b border-slate-200 pb-2 mb-2">
                    <span>ΦΠΑ ({(state.vatRate * 100).toFixed(0)}%):</span>
                    <div className="flex items-center gap-1">
                        <span className="font-mono font-bold">{formatCurrency(state.vatAmount)}</span>
                        {state.priceDiffs && state.priceDiffs.vat !== 0 && (
                            <span className={`text-[10px] font-bold ${state.priceDiffs.vat > 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                                ({state.priceDiffs.vat > 0 ? '+' : ''}{formatCurrency(state.priceDiffs.vat)})
                            </span>
                        )}
                    </div>
                </div>
                <div className="flex justify-between items-center">
                    <span className="font-black text-slate-800 uppercase text-sm">Συνολο</span>
                    <div className="flex flex-col items-end">
                        <span className="font-black text-2xl text-emerald-700">{formatCurrency(state.grandTotal)}</span>
                        {state.priceDiffs && state.priceDiffs.total !== 0 && (
                            <span className={`text-xs font-bold ${state.priceDiffs.total > 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                                {state.priceDiffs.total > 0 ? '+' : ''}{formatCurrency(state.priceDiffs.total)}
                            </span>
                        )}
                    </div>
                </div>
                <button onClick={actions.handleSaveOrder} disabled={state.isSaving} className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all mt-3 disabled:opacity-60">
                    {state.isSaving ? <><Loader2 size={18} className="animate-spin" /> Αποθήκευση...</> : <><Save size={18} /> Αποθήκευση Παραγγελίας</>}
                </button>
            </div>
            </div>

            {editingItem && (
                <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 p-5 space-y-4">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <h3 className="text-sm font-black text-slate-800 uppercase">Επεξεργασία SKU</h3>
                                <p className="text-xs text-slate-500 font-bold mt-1">{editingItem.sku}</p>
                            </div>
                            <button onClick={closeEditModal} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                                <X size={16} />
                            </button>
                        </div>

                        {editVariants.length > 0 && (
                            <>
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Μέταλλο</label>
                                    <select
                                        value={editFinish}
                                        onChange={e => handleEditFinishChange(e.target.value)}
                                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500/20"
                                    >
                                        {editFinishOptions.map(code => (
                                            <option key={code} value={code}>
                                                {FINISH_CODES[code] || code || 'Λουστρέ'}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Πέτρα</label>
                                    <select
                                        value={editVariantSuffix}
                                        onChange={e => setEditVariantSuffix(e.target.value)}
                                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500/20"
                                    >
                                        {editStoneOptions.map(v => {
                                            const { stone } = getVariantComponents(v.suffix, editProduct?.gender);
                                            const stoneLabel = stone.name && stone.code
                                                ? `${stone.name} (${stone.code})`
                                                : (stone.name || stone.code || 'Χωρίς πέτρα');
                                            return (
                                                <option key={v.suffix} value={v.suffix}>
                                                    {stoneLabel}
                                                </option>
                                            );
                                        })}
                                    </select>
                                </div>
                            </>
                        )}

                        {editSizeMode && (
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">{editSizeMode.type}</label>
                                <select
                                    value={editSizeInfo}
                                    onChange={e => setEditSizeInfo(e.target.value)}
                                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500/20"
                                >
                                    <option value="">Χωρίς {editSizeMode.type}</option>
                                    {editSizeMode.sizes.map(size => (
                                        <option key={size} value={size}>{size}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {editProduct && isXrCordEnamelSku(editProduct) && (
                            <>
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Χρώμα Κορδόνι</label>
                                    <select
                                        value={editCordColor || ''}
                                        onChange={e => setEditCordColor((e.target.value || undefined) as OrderItem['cord_color'])}
                                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500/20"
                                    >
                                        <option value="">Χωρίς επιλογή</option>
                                        {PRODUCT_OPTION_COLORS.map(color => (
                                            <option key={`edit-cord-${color}`} value={color}>
                                                {PRODUCT_OPTION_COLOR_LABELS[color]}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Χρώμα Σμάλτο</label>
                                    <select
                                        value={editEnamelColor || ''}
                                        onChange={e => setEditEnamelColor((e.target.value || undefined) as OrderItem['enamel_color'])}
                                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500/20"
                                    >
                                        <option value="">Χωρίς επιλογή</option>
                                        {PRODUCT_OPTION_COLORS.map(color => (
                                            <option key={`edit-enamel-${color}`} value={color}>
                                                {PRODUCT_OPTION_COLOR_LABELS[color]}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </>
                        )}

                        <div className="flex justify-end gap-2 pt-2">
                            <button onClick={closeEditModal} className="px-3 py-2 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">
                                Ακύρωση
                            </button>
                            <button onClick={handleConfirmEdit} className="px-3 py-2 rounded-xl text-xs font-black text-white bg-[#060b00] hover:bg-black transition-colors">
                                Αποθήκευση
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
