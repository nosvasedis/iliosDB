import StoneCodeText from '../StoneCodeText';
import { formatNumber } from '../../utils/numberFormat';
import React, { useMemo, useState } from 'react';
import { Search, X, ArrowDownAZ, Camera, Plus, Minus, Trash2, StickyNote, Box, RefreshCw, Save, Loader2, Pencil, Check, History, ChevronDown, ImageIcon } from 'lucide-react';
import { FINISH_CODES } from '../../constants';
import { OrderItem, PriceChangeRecord, PriceSyncPreview } from '../../types';
import { formatCurrency, formatDecimal, getVariantComponents, getVariantSuffixDisplayCodes } from '../../utils/pricingEngine';
import { getSizingInfo } from '../../utils/sizing';
import { useOrderState, FINISH_COLORS, STONE_TEXT_COLORS } from '../../hooks/useOrderState';
import { PRODUCT_OPTION_COLORS, PRODUCT_OPTION_COLOR_LABELS, getProductOptionColorLabel, isXrCordEnamelSku } from '../../utils/xrOptions';
import { isSpecialCreationSku } from '../../utils/specialCreationSku';
import { getOrderItemMatchKey } from '../../utils/orderItemMatch';
import PriceSyncPreviewModal from '../PriceSyncPreviewModal';
import { useUI } from '../UIProvider';
import InventoryAvailabilityNote from '../inventory/InventoryAvailabilityNote';
import FulfillmentModeToggle from '../customerService/FulfillmentModeToggle';
import ConsignmentBadge from '../customerService/ConsignmentBadge';
import ProductImageZoom from './ProductImageZoom';

interface Props {
    orderState: ReturnType<typeof useOrderState>;
    onOpenScanner: () => void;
    isExpanded?: boolean;
}

export const OrderItemsPanel: React.FC<Props> = ({ orderState, onOpenScanner, isExpanded }) => {
    const { state, setters, actions } = orderState;
    const { showToast } = useUI();
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
    const [showPriceHistory, setShowPriceHistory] = useState(false);
    const [priceSyncPreviewModalOpen, setPriceSyncPreviewModalOpen] = useState(false);
    const [priceSyncPreview, setPriceSyncPreview] = useState<PriceSyncPreview | null>(null);
    const [isApplyingPriceSync, setIsApplyingPriceSync] = useState(false);
    const [imagePreview, setImagePreview] = useState<{ imageUrl: string; sku: string } | null>(null);

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

    const handleSyncPricesClick = () => {
        const preview = actions.generatePriceSyncPreview();
        if (!preview) {
            showToast('Οι τιμές είναι ήδη επίκαιρες.', 'info');
            return;
        }
        setPriceSyncPreview(preview);
        setPriceSyncPreviewModalOpen(true);
    };

    const handleApplyPriceSync = () => {
        if (!priceSyncPreview || priceSyncPreview.updatedCount === 0) return;
        setIsApplyingPriceSync(true);
        try {
            actions.applyPriceSyncPreview(priceSyncPreview);
            setPriceSyncPreviewModalOpen(false);
            setPriceSyncPreview(null);
        } finally {
            setIsApplyingPriceSync(false);
        }
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

    const iconButton = 'h-8 w-8 inline-flex items-center justify-center rounded-lg border transition-colors active:scale-95';
    const hasItems = state.selectedItems.length > 0;

    return (
        <>
            <div className="flex flex-col bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden relative lg:min-h-0">
            {/* Header */}
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3 bg-white">
                <div className="min-w-0 flex items-baseline gap-2 flex-wrap">
                    <h3 className="text-[13px] font-black text-slate-800 uppercase tracking-wider">Είδη</h3>
                    <span className="text-[11px] font-bold text-slate-500 tabular-nums whitespace-nowrap">
                        {formatNumber(state.selectedItems.length)} {state.selectedItems.length === 1 ? 'γραμμή' : 'γραμμές'}
                        <span className="text-slate-300 mx-1">·</span>
                        <span className="text-slate-800">{formatNumber(totalPieces)}</span> τεμ.
                    </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    <button
                        type="button"
                        onClick={handleSyncPricesClick}
                        disabled={!hasItems}
                        title="Συγχρονισμός τιμών με τον κατάλογο"
                        aria-label="Συγχρονισμός τιμών με τον κατάλογο"
                        className={`${iconButton} border-slate-200 bg-white text-slate-400 hover:text-amber-700 hover:border-amber-200 hover:bg-amber-50/60 disabled:opacity-40 disabled:pointer-events-none`}
                    >
                        <RefreshCw size={14} strokeWidth={2} />
                    </button>
                    <button
                        type="button"
                        onClick={() => setters.setSortOrder(prev => prev === 'input' ? 'alpha' : 'input')}
                        title={state.sortOrder === 'input' ? 'Ταξινόμηση: χρονολογική · πατήστε για αλφαβητική' : 'Ταξινόμηση: αλφαβητική · πατήστε για χρονολογική'}
                        aria-label="Εναλλαγή ταξινόμησης"
                        aria-pressed={state.sortOrder === 'alpha'}
                        className={`${iconButton} ${
                            state.sortOrder === 'alpha'
                                ? 'border-slate-800 bg-slate-800 text-white'
                                : 'border-slate-200 bg-white text-slate-400 hover:text-slate-700 hover:bg-slate-50'
                        }`}
                    >
                        <ArrowDownAZ size={14} strokeWidth={2} />
                    </button>
                    <button
                        type="button"
                        onClick={onOpenScanner}
                        title="Σάρωση barcode"
                        aria-label="Σάρωση barcode"
                        className={`${iconButton} border-slate-200 bg-white text-slate-400 hover:text-slate-700 hover:bg-slate-50`}
                    >
                        <Camera size={14} strokeWidth={2} />
                    </button>
                </div>
            </div>

            {/* Search */}
            {(hasItems || state.itemSearchTerm) && (
                <div className="px-3 py-2 border-b border-slate-100 bg-white">
                    <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        <input
                            type="text"
                            value={state.itemSearchTerm}
                            onChange={e => setters.setItemSearchTerm(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Escape') setters.setItemSearchTerm(''); }}
                            placeholder="Αναζήτηση στα είδη της εντολής..."
                            className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-300 focus:bg-white transition-all"
                        />
                        {state.itemSearchTerm && (
                            <button type="button" onClick={() => setters.setItemSearchTerm('')} aria-label="Καθαρισμός αναζήτησης" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600">
                                <X size={14} />
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Items List */}
            <div
                className={`flex-1 min-h-0 overflow-y-auto p-3 custom-scrollbar bg-slate-50/60 max-lg:max-h-[65dvh] ${
                    isExpanded
                        ? 'grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-2 content-start'
                        : 'space-y-2'
                }`}
            >
                {state.displayItems.map((item, index) => {
                    const lineKey = getOrderItemMatchKey(item);
                    const isPriceEditing = priceEditLineKey === lineKey;
                    const itemDelta = state.priceDiffs?.itemDeltas?.find(d => d.lineKey === lineKey);
                    const isSpecial = isSpecialCreationSku(item.sku);
                    const imageUrl = item.product_details?.image_url;
                    return (
                    <div
                        key={item.line_id || `${item.sku}-${item.variant_suffix || ''}-${item.size_info || ''}-${item.cord_color || ''}-${item.enamel_color || ''}-${index}`}
                        className={`bg-white p-3 rounded-xl border shadow-sm flex flex-col gap-2.5 animate-in fade-in duration-200 transition-shadow hover:shadow-md group ${
                            item.fulfillment_mode === 'consignment'
                                ? 'border-indigo-200 ring-1 ring-indigo-100/80'
                                : 'border-slate-200/80'
                        }`}
                    >
                        {/* Identity: image · SKU · attributes · line actions */}
                        <div className="flex items-start gap-3">
                            <div className="w-12 h-12 bg-slate-50 rounded-lg overflow-hidden shrink-0 border border-slate-100">
                                {isSpecial ? (
                                    <div className="w-full h-full flex items-center justify-center text-[11px] font-black text-violet-700 bg-violet-50">SP</div>
                                ) : imageUrl ? (
                                    <button
                                        type="button"
                                        onClick={() => setImagePreview({ imageUrl, sku: item.sku })}
                                        aria-label={`Μεγέθυνση φωτογραφίας ${item.sku}`}
                                        title="Πατήστε για μεγέθυνση"
                                        className="w-full h-full cursor-zoom-in"
                                    >
                                        <img src={imageUrl} className="w-full h-full object-cover" alt="" loading="lazy" />
                                    </button>
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center"><ImageIcon size={16} className="text-slate-300" /></div>
                                )}
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0 font-black text-slate-800 text-[15px] leading-snug break-words [overflow-wrap:anywhere] pt-0.5">
                                        {isSpecial ? (
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
                                                        {stoneCode ? <span className={stoneClass}><StoneCodeText code={stoneCode} /></span> : null}
                                                    </span>
                                                );
                                            })()
                                        )}
                                    </div>
                                    <div className="flex items-center shrink-0 -mr-1 -mt-0.5">
                                        {!isSpecial && (
                                            <button type="button" onClick={() => openEditItem(item)} className="p-1.5 rounded-md text-slate-300 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Επεξεργασία SKU" aria-label={`Επεξεργασία ${item.sku}`}>
                                                <Pencil size={14} />
                                            </button>
                                        )}
                                        <button type="button" onClick={() => actions.handleRemoveItem(item)} className="p-1.5 rounded-md text-slate-300 hover:text-red-600 hover:bg-red-50 transition-colors" title="Αφαίρεση" aria-label={`Αφαίρεση ${item.sku}`}>
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                                {isSpecial && (
                                    <div className="text-[11px] text-violet-600 font-bold mt-0.5 leading-snug break-words [overflow-wrap:anywhere]">{item.product_details?.category || 'Ειδική δημιουργία'}</div>
                                )}
                                {(item.fulfillment_mode === 'consignment' || item.size_info || item.cord_color || item.enamel_color) && (
                                    <div className="flex flex-wrap items-center gap-1 mt-1">
                                        {item.fulfillment_mode === 'consignment' && <ConsignmentBadge compact />}
                                        {item.size_info && <span className="inline-flex items-center text-[10px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded-md border border-slate-200/70">μέγεθος: {item.size_info}</span>}
                                        {item.cord_color && <span className="inline-flex items-center text-[10px] font-bold bg-amber-50 text-amber-800 px-1.5 py-0.5 rounded-md border border-amber-100">Κορδόνι: {getProductOptionColorLabel(item.cord_color)}</span>}
                                        {item.enamel_color && <span className="inline-flex items-center text-[10px] font-bold bg-rose-50 text-rose-800 px-1.5 py-0.5 rounded-md border border-rose-100">Σμάλτο: {getProductOptionColorLabel(item.enamel_color)}</span>}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Quantity · unit price · line total */}
                        <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 shrink-0">
                                <button
                                    type="button"
                                    onClick={() => actions.updateQuantity(item, item.quantity - 1)}
                                    title={item.quantity <= 1 ? 'Αφαίρεση' : 'Μείωση'}
                                    aria-label={item.quantity <= 1 ? `Αφαίρεση ${item.sku}` : 'Μείωση ποσότητας'}
                                    className="w-7 h-7 inline-flex items-center justify-center hover:bg-white rounded-md text-slate-600 active:scale-95 transition-colors"
                                >
                                    <Minus size={13} />
                                </button>
                                <span className="min-w-[2rem] text-center font-black text-sm tabular-nums px-0.5" aria-label="Ποσότητα">{formatNumber(item.quantity)}</span>
                                <button
                                    type="button"
                                    onClick={() => actions.updateQuantity(item, item.quantity + 1)}
                                    title="Αύξηση"
                                    aria-label="Αύξηση ποσότητας"
                                    className="w-7 h-7 inline-flex items-center justify-center hover:bg-white rounded-md text-slate-600 active:scale-95 transition-colors"
                                >
                                    <Plus size={13} />
                                </button>
                            </div>
                            <div className="flex flex-col items-end min-w-0">
                                {isPriceEditing ? (
                                    <div
                                        className={`flex items-center justify-end gap-1 rounded-lg border px-1.5 py-1 w-[9.5rem] max-w-full ${
                                            isSpecial
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
                                            aria-label="Τιμή μονάδας"
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
                                            title={priceInputStr.trim() === '' && !isSpecial ? 'Επαναφορά τιμής καταλόγου' : 'Επιβεβαίωση τιμής'}
                                            className={`shrink-0 rounded p-0.5 transition-colors ${
                                                priceInputStr.trim() === '' && !isSpecial
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
                                        className={`group/price text-right rounded-lg px-1.5 py-0.5 -mr-1.5 transition-colors ${
                                            isSpecial
                                                ? 'hover:bg-violet-50/70'
                                                : item.price_override
                                                  ? 'hover:bg-amber-50/80'
                                                  : 'hover:bg-slate-50'
                                        }`}
                                    >
                                        <div className="flex items-baseline justify-end gap-1">
                                            <Pencil size={10} aria-hidden="true" className="self-center text-slate-400 opacity-0 group-hover/price:opacity-100 transition-opacity" />
                                            <span
                                                className={`font-black tabular-nums tracking-tight leading-none text-base ${
                                                    isSpecial ? 'text-violet-900' : item.price_override ? 'text-amber-900' : 'text-slate-900'
                                                }`}
                                            >
                                                {formatDecimal(item.price_at_order, 2)}€
                                            </span>
                                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">/τεμ.</span>
                                        </div>
                                        {item.quantity > 1 && (
                                            <div className="mt-0.5 text-[10px] font-bold text-slate-500 tabular-nums leading-tight">
                                                Σύνολο {formatDecimal(item.price_at_order * item.quantity, 2)}€
                                            </div>
                                        )}
                                        {item.price_override && !isSpecial && (
                                            <div className="mt-0.5 text-[9px] font-bold text-amber-700/90 leading-tight">εκτός καταλόγου *</div>
                                        )}
                                    </button>
                                )}
                                {itemDelta && (
                                    <div className="flex flex-col items-end gap-0.5 mt-0.5">
                                        <div className="flex items-center gap-1">
                                            <span className="text-[10px] font-bold text-rose-400 line-through tabular-nums">{formatDecimal(itemDelta.oldPrice, 2)}€</span>
                                            <span className="text-[9px] text-slate-300">→</span>
                                            <span className="text-[10px] font-bold text-emerald-600 tabular-nums">{formatDecimal(itemDelta.newPrice, 2)}€</span>
                                        </div>
                                        <span className={`text-[9px] font-bold tabular-nums ${itemDelta.newPrice > itemDelta.oldPrice ? 'text-emerald-600' : 'text-rose-500'}`}>
                                            ({itemDelta.newPrice > itemDelta.oldPrice ? '+' : ''}{formatDecimal(itemDelta.newPrice - itemDelta.oldPrice, 2)}€/τεμ.)
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {!isSpecial && (
                            <InventoryAvailabilityNote
                                item={item}
                                product={item.product_details}
                                mode="order"
                                orderId={state.orderId || undefined}
                                compact
                            />
                        )}

                        {/* Fulfillment mode · line note */}
                        <div className="flex flex-wrap items-center gap-2">
                            <FulfillmentModeToggle
                                value={item.fulfillment_mode || 'sale'}
                                onChange={(mode) => actions.updateItemFulfillmentMode(item, mode)}
                                compact
                            />
                            <div className="relative group/note flex-1 min-w-[8rem]">
                                <input
                                    type="text"
                                    value={item.notes || ''}
                                    onChange={e => actions.updateItemNotes(item, e.target.value)}
                                    required={isSpecial}
                                    aria-invalid={isSpecial && !item.notes?.trim()}
                                    aria-label="Παρατήρηση είδους"
                                    placeholder={isSpecial ? 'Υποχρεωτική περιγραφή ειδικής δημιουργίας…' : 'Παρατήρηση είδους...'}
                                    className={`w-full pl-7 pr-2 py-1.5 text-[11px] border rounded-lg outline-none font-medium text-slate-700 transition-all placeholder:italic placeholder:text-slate-400 focus:bg-white focus:border-emerald-300 ${
                                        isSpecial && !item.notes?.trim()
                                            ? 'bg-rose-50/60 border-rose-200'
                                            : item.notes
                                              ? 'bg-amber-50/40 border-amber-100'
                                              : 'bg-slate-50 border-transparent hover:border-slate-200'
                                    }`}
                                />
                                <StickyNote size={12} className={`absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none group-hover/note:text-emerald-500 ${item.notes ? 'text-amber-500' : 'text-slate-300'}`} />
                            </div>
                        </div>
                        {isSpecial && !item.notes?.trim() && (
                            <p className="-mt-1 text-[10px] font-bold text-rose-600">⚠ SP χωρίς σημείωση — απαιτείται πριν την αποθήκευση.</p>
                        )}
                    </div>
                    );
                })}
                {!hasItems && (
                    <div className="col-span-full flex flex-col items-center justify-center h-full min-h-[12rem] text-center px-6 py-10">
                        <div className="w-14 h-14 rounded-2xl bg-white border border-slate-200 flex items-center justify-center mb-3 shadow-sm">
                            <Box size={26} className="text-slate-300" />
                        </div>
                        <p className="text-sm font-bold text-slate-500">Η παραγγελία δεν έχει είδη ακόμα.</p>
                        <p className="text-[11px] text-slate-400 mt-1">Προσθέστε από την Έξυπνη Προσθήκη ή σαρώστε barcode.</p>
                    </div>
                )}
                {hasItems && state.displayItems.length === 0 && (
                    <div className="col-span-full flex flex-col items-center justify-center text-center py-10 text-slate-400">
                        <Search size={22} className="mb-2 opacity-50" />
                        <p className="text-xs font-bold">Κανένα είδος δεν ταιριάζει στην αναζήτηση.</p>
                        <button type="button" onClick={() => setters.setItemSearchTerm('')} className="mt-2 text-[11px] font-bold text-emerald-700 hover:underline">
                            Καθαρισμός αναζήτησης
                        </button>
                    </div>
                )}
            </div>

            {/* Price Change History Section */}
            {state.priceChangeLog && state.priceChangeLog.length > 0 && (
                <div className="border-t border-slate-200 bg-white shrink-0">
                    <button
                        type="button"
                        onClick={() => setShowPriceHistory(prev => !prev)}
                        aria-expanded={showPriceHistory}
                        className="w-full flex items-center gap-2 px-4 py-2 text-left hover:bg-slate-50 transition-colors"
                    >
                        <History size={14} className="text-slate-400 shrink-0" />
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex-1">
                            Ιστορικό αλλαγών τιμών ({formatNumber(state.priceChangeLog.length)})
                        </span>
                        <ChevronDown size={14} className={`text-slate-400 transition-transform ${showPriceHistory ? 'rotate-180' : ''}`} />
                    </button>
                    {showPriceHistory && (
                        <div className="px-4 pb-3 space-y-3 max-h-56 overflow-y-auto custom-scrollbar">
                            {state.priceChangeLog.map((record: PriceChangeRecord, idx: number) => {
                                const totalDiff = record.totalsAfter.total - record.totalsBefore.total;
                                return (
                                    <div key={idx} className="bg-slate-50 rounded-lg border border-slate-100 p-3 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-bold text-slate-400">
                                                {new Date(record.timestamp).toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                            <span className={`text-[10px] font-bold ${totalDiff > 0 ? 'text-emerald-600' : totalDiff < 0 ? 'text-rose-500' : 'text-slate-400'}`}>
                                                Σύνολο: {totalDiff > 0 ? '+' : ''}{formatCurrency(totalDiff)}
                                            </span>
                                        </div>
                                        <div className="space-y-1">
                                            {record.itemChanges.map((delta, dIdx) => (
                                                <div key={dIdx} className="flex items-center justify-between text-[10px] py-0.5">
                                                    <span className="font-bold text-slate-700 truncate mr-2">
                                                        {delta.sku}{delta.variantSuffix ? delta.variantSuffix : ''}
                                                    </span>
                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                        <span className="text-rose-400 line-through tabular-nums">{formatDecimal(delta.oldPrice, 2)}€</span>
                                                        <span className="text-slate-300">→</span>
                                                        <span className="text-emerald-600 font-bold tabular-nums">{formatDecimal(delta.newPrice, 2)}€</span>
                                                        <span className={`font-bold tabular-nums ${delta.newPrice > delta.oldPrice ? 'text-emerald-600' : 'text-rose-500'}`}>
                                                            ({delta.newPrice > delta.oldPrice ? '+' : ''}{formatDecimal(delta.newPrice - delta.oldPrice, 2)}€)
                                                        </span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 pt-1.5 border-t border-slate-200/70 text-[9px] text-slate-400">
                                            <span>Καθαρή: {formatCurrency(record.totalsBefore.net)} → {formatCurrency(record.totalsAfter.net)}</span>
                                            <span>ΦΠΑ: {formatCurrency(record.totalsBefore.vat)} → {formatCurrency(record.totalsAfter.vat)}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Totals Footer */}
            <div className="px-4 py-3 bg-slate-50/80 border-t border-slate-200 shrink-0">
                {state.consignmentSubtotal > 0 && (
                    <div className="mb-2.5 rounded-xl border border-indigo-200 bg-indigo-50/70 px-3 py-2" title="Δεν αποτελεί πώληση ή απαίτηση τώρα. Η χρέωση δημιουργείται μόνο όταν δηλωθεί πώληση.">
                        <div className="flex items-center justify-between gap-2 text-xs font-bold text-indigo-900">
                            <span>Αξία σε Παρακαταθήκη</span>
                            <span className="font-mono tabular-nums">{formatCurrency(state.consignmentValue)}</span>
                        </div>
                        <p className="text-[10px] leading-snug text-indigo-700 mt-0.5">Δεν αποτελεί πώληση ή απαίτηση τώρα. Η χρέωση δημιουργείται μόνο όταν δηλωθεί πώληση.</p>
                    </div>
                )}
                <div className="space-y-0.5 text-xs text-slate-500">
                    <div className="flex justify-between items-center gap-2">
                        <span>Καθαρή Αξία</span>
                        <div className="flex items-center gap-1">
                            <span className="font-mono font-bold tabular-nums text-slate-700">{formatCurrency(state.subtotal)}</span>
                            {state.priceDiffs && state.priceDiffs.net !== 0 && (
                                <span className={`text-[10px] font-bold ${state.priceDiffs.net > 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                                    ({state.priceDiffs.net > 0 ? '+' : ''}{formatCurrency(state.priceDiffs.net)})
                                </span>
                            )}
                        </div>
                    </div>
                    {state.discountPercent > 0 && (
                        <div className="flex justify-between items-center gap-2 text-red-500">
                            <span>Έκπτωση ({formatNumber(state.discountPercent)}%)</span>
                            <span className="font-mono font-bold tabular-nums">-{formatCurrency(state.discountAmount)}</span>
                        </div>
                    )}
                    <div className="flex justify-between items-center gap-2">
                        <span>ΦΠΑ ({formatDecimal((state.vatRate * 100), 0)}%)</span>
                        <div className="flex items-center gap-1">
                            <span className="font-mono font-bold tabular-nums text-slate-700">{formatCurrency(state.vatAmount)}</span>
                            {state.priceDiffs && state.priceDiffs.vat !== 0 && (
                                <span className={`text-[10px] font-bold ${state.priceDiffs.vat > 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                                    ({state.priceDiffs.vat > 0 ? '+' : ''}{formatCurrency(state.priceDiffs.vat)})
                                </span>
                            )}
                        </div>
                    </div>
                </div>
                <div className="mt-2 pt-2 border-t border-slate-200 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                        <div className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Σύνολο</div>
                        <div className="flex items-baseline gap-1.5 flex-wrap">
                            <span className="font-black text-xl xl:text-2xl leading-tight text-emerald-700 tabular-nums">{formatCurrency(state.grandTotal)}</span>
                            {state.priceDiffs && state.priceDiffs.total !== 0 && (
                                <span className={`text-xs font-bold ${state.priceDiffs.total > 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                                    {state.priceDiffs.total > 0 ? '+' : ''}{formatCurrency(state.priceDiffs.total)}
                                </span>
                            )}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={actions.handleSaveOrder}
                        disabled={state.isSaving}
                        title="Αποθήκευση (Ctrl+S)"
                        className="shrink-0 bg-slate-900 text-white px-4 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 shadow-md hover:bg-black active:scale-[0.98] transition-all disabled:opacity-60"
                    >
                        {state.isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                        Αποθήκευση
                    </button>
                </div>
            </div>
            </div>

            {editingItem && (
                <div
                    className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
                    onMouseDown={e => { if (e.target === e.currentTarget) closeEditModal(); }}
                    onKeyDown={e => { if (e.key === 'Escape') closeEditModal(); }}
                >
                    <div role="dialog" aria-modal="true" aria-label="Επεξεργασία SKU" className="w-full max-w-md max-h-[90dvh] overflow-y-auto custom-scrollbar bg-white rounded-2xl shadow-2xl border border-slate-200 p-5 space-y-4 animate-in zoom-in-95 duration-150">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <h3 className="text-sm font-black text-slate-800 uppercase">Επεξεργασία SKU</h3>
                                <p className="text-xs text-slate-500 font-bold mt-1 font-mono">{editingItem.sku}</p>
                            </div>
                            <button type="button" onClick={closeEditModal} aria-label="Κλείσιμο" className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600">
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
                            <button type="button" onClick={closeEditModal} className="px-3 py-2 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">
                                Ακύρωση
                            </button>
                            <button type="button" onClick={handleConfirmEdit} className="px-3 py-2 rounded-xl text-xs font-black text-white bg-[#060b00] hover:bg-black transition-colors">
                                Αποθήκευση
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Price Sync Preview Modal */}
            <PriceSyncPreviewModal
                isOpen={priceSyncPreviewModalOpen}
                preview={priceSyncPreview}
                onApply={handleApplyPriceSync}
                onCancel={() => {
                    setPriceSyncPreviewModalOpen(false);
                    setPriceSyncPreview(null);
                }}
                isApplying={isApplyingPriceSync}
            />

            {imagePreview && <ProductImageZoom key={imagePreview.imageUrl} imageUrl={imagePreview.imageUrl} sku={imagePreview.sku} onClose={() => setImagePreview(null)} />}
        </>
    );
};
