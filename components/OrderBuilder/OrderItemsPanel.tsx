import React, { useMemo, useState } from 'react';
import { Search, X, ArrowDownAZ, Camera, Plus, Minus, Trash2, StickyNote, Box, RefreshCw, Save, Loader2, Pencil } from 'lucide-react';
import { FINISH_CODES } from '../../constants';
import { OrderItem } from '../../types';
import { formatCurrency, getVariantComponents } from '../../utils/pricingEngine';
import { getSizingInfo } from '../../utils/sizing';
import { useOrderState, FINISH_COLORS, STONE_TEXT_COLORS } from '../../hooks/useOrderState';
import { PRODUCT_OPTION_COLORS, PRODUCT_OPTION_COLOR_LABELS, getProductOptionColorLabel, isXrCordEnamelSku } from '../../utils/xrOptions';
import { isSpecialCreationSku } from '../../utils/specialCreationSku';

interface Props {
    orderState: ReturnType<typeof useOrderState>;
    onOpenScanner: () => void;
    isExpanded?: boolean;
}

export const OrderItemsPanel: React.FC<Props> = ({ orderState, onOpenScanner, isExpanded }) => {
    const { state, setters, actions } = orderState;
    const [editingItem, setEditingItem] = useState<OrderItem | null>(null);
    const [editFinish, setEditFinish] = useState('');
    const [editVariantSuffix, setEditVariantSuffix] = useState('');
    const [editSizeInfo, setEditSizeInfo] = useState('');
    const [editCordColor, setEditCordColor] = useState<OrderItem['cord_color']>();
    const [editEnamelColor, setEditEnamelColor] = useState<OrderItem['enamel_color']>();

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
            <div className="p-5 border-b border-slate-100 flex items-center justify-between gap-3 bg-slate-50/50">
                <label className="text-[11px] font-black text-slate-500 uppercase tracking-[0.14em] leading-none">Ξ ΞµΟΞΉΞµΟ‡ΟΞΌΞµΞ½Ξ± ({state.selectedItems.length})</label>
                <div className="flex items-center gap-1.5">
                    <button
                        onClick={actions.handleRecalculatePrices}
                        className="h-8 inline-flex items-center gap-1.5 text-[11px] font-bold text-amber-700 bg-amber-50 px-3 rounded-xl border border-amber-200 hover:bg-amber-100 transition-colors"
                    >
                        <RefreshCw size={12} /> Ξ£Ο…Ξ³Ο‡ΟΞΏΞ½ΞΉΟƒΞΌΟΟ‚ Ξ¤ΞΉΞΌΟΞ½
                    </button>
                    <button
                        onClick={() => setters.setSortOrder(prev => prev === 'input' ? 'alpha' : 'input')}
                        className="h-8 inline-flex items-center gap-1 text-[11px] font-bold text-slate-600 bg-white border border-slate-200 px-2.5 rounded-xl hover:bg-slate-50 transition-colors"
                    >
                        <ArrowDownAZ size={12} /> {state.sortOrder === 'input' ? 'Ξ§ΟΞΏΞ½.' : 'Ξ‘Ξ»Ο†.'}
                    </button>
                    <button
                        onClick={onOpenScanner}
                        className="h-8 inline-flex items-center justify-center gap-1 text-[11px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 rounded-xl border border-blue-200 transition-colors active:scale-95"
                    >
                        <Camera size={14} />
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
                        placeholder="Ξ‘Ξ½Ξ±Ξ¶Ξ®Ο„Ξ·ΟƒΞ· ΟƒΟ„Ξ± ΞµΞ―Ξ΄Ξ· Ο„Ξ·Ο‚ ΞµΞ½Ο„ΞΏΞ»Ξ®Ο‚..."
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
            <div className="flex-1 overflow-y-auto space-y-3 p-4 custom-scrollbar bg-slate-50/50">
                {state.displayItems.map((item, index) => (
                    <div
                        key={item.line_id || `${item.sku}-${item.variant_suffix || ''}-${item.size_info || ''}-${item.cord_color || ''}-${item.enamel_color || ''}-${index}`}
                        className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col gap-3 animate-in slide-in-from-right-4 transition-all hover:shadow-md group"
                    >
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                                <div className="w-11 h-11 bg-slate-50 rounded-lg overflow-hidden shrink-0 border border-slate-100">
                                    {isSpecialCreationSku(item.sku) ? (
                                        <div className="w-full h-full flex items-center justify-center text-[10px] font-black text-violet-700 bg-violet-50">SP</div>
                                    ) : item.product_details?.image_url ? (
                                        <img src={item.product_details.image_url} className="w-full h-full object-cover" alt="" />
                                    ) : null}
                                </div>
                                <div className="min-w-0">
                                    <div className="font-black text-slate-800 text-sm leading-none truncate">
                                        {isSpecialCreationSku(item.sku) ? (
                                            <span className="text-violet-900">{item.sku}</span>
                                        ) : (
                                            (() => {
                                                const { finish, stone } = getVariantComponents(item.variant_suffix || '', item.product_details?.gender);
                                                const finishClass = FINISH_COLORS[finish.code] || FINISH_COLORS[''];
                                                const stoneClass = STONE_TEXT_COLORS[stone.code] || 'text-emerald-500';
                                                return (
                                                    <span>
                                                        <span className="text-slate-800">{item.sku}</span>
                                                        <span className={finishClass}>{finish.code}</span>
                                                        <span className={stoneClass}>{stone.code}</span>
                                                    </span>
                                                );
                                            })()
                                        )}
                                    </div>
                                    {isSpecialCreationSku(item.sku) && (
                                        <div className="text-[10px] text-violet-600 font-bold mt-0.5 truncate">{item.product_details?.category || 'Ξ•ΞΉΞ΄ΞΉΞΊΞ® Ξ΄Ξ·ΞΌΞΉΞΏΟ…ΟΞ³Ξ―Ξ±'}</div>
                                    )}
                                    <div className="text-[10px] text-slate-500 font-bold mt-1 flex flex-wrap items-center gap-1">
                                        {item.size_info && <span className="bg-slate-100 px-1 rounded">SZ: {item.size_info}</span>}
                                        {item.cord_color && <span className="bg-amber-50 text-amber-700 px-1 rounded border border-amber-100">ΞΞΏΟΞ΄ΟΞ½ΞΉ: {getProductOptionColorLabel(item.cord_color)}</span>}
                                        {item.enamel_color && <span className="bg-rose-50 text-rose-700 px-1 rounded border border-rose-100">Ξ£ΞΌΞ¬Ξ»Ο„ΞΏ: {getProductOptionColorLabel(item.enamel_color)}</span>}
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                {!isSpecialCreationSku(item.sku) && (
                                    <button onClick={() => openEditItem(item)} className="p-2 text-slate-300 hover:text-blue-500 transition-colors" title="Ξ•Ο€ΞµΞΎΞµΟΞ³Ξ±ΟƒΞ―Ξ± SKU">
                                        <Pencil size={15} />
                                    </button>
                                )}
                                <button onClick={() => actions.handleRemoveItem(item)} className="p-2 text-slate-300 hover:text-red-500 transition-colors">
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <label className={`flex items-center gap-2 rounded-xl px-2.5 py-1.5 border min-w-0 w-full sm:w-[280px] lg:w-[320px] max-w-full ${isSpecialCreationSku(item.sku) ? 'bg-violet-50 border-violet-100' : (item.price_override ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200')}`}>
                                <span className={`${isSpecialCreationSku(item.sku) ? 'text-violet-800' : 'text-slate-700'} shrink-0 text-[10px] font-black`}>{"\u20AC/\u03C4\u03B5\u03BC."}</span>
                                <input
                                    type="number"
                                    min={0}
                                    step={0.01}
                                    value={item.price_at_order}
                                    onChange={e => actions.updateItemUnitPrice(item, parseFloat(e.target.value) || 0)}
                                    className={`min-w-0 flex-1 bg-white rounded-lg px-3 py-1.5 font-mono text-sm outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${isSpecialCreationSku(item.sku) ? 'border border-violet-200 text-violet-900' : (item.price_override ? 'border border-amber-300 text-amber-900' : 'border border-slate-200 text-slate-900')}`}
                                />
                                {item.price_override && <span className="text-amber-700 font-black shrink-0">*</span>}
                            </label>
                            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 shrink-0">
                                <button onClick={() => actions.updateQuantity(item, item.quantity - 1)} className="w-8 h-8 flex items-center justify-center hover:bg-white rounded-lg shadow-sm text-slate-600"><Minus size={12} /></button>
                                <span className="w-8 text-center font-black text-sm text-slate-900">{item.quantity}</span>
                                <button onClick={() => actions.updateQuantity(item, item.quantity + 1)} className="w-8 h-8 flex items-center justify-center hover:bg-white rounded-lg shadow-sm text-slate-600"><Plus size={12} /></button>
                            </div>
                        </div>

                        <div className="relative group/note">
                            <input
                                type="text"
                                value={item.notes || ''}
                                onChange={e => actions.updateItemNotes(item, e.target.value)}
                                placeholder="Ξ ΟΞΏΟƒΞΈΞ®ΞΊΞ· Ο€Ξ±ΟΞ±Ο„Ξ®ΟΞ·ΟƒΞ·Ο‚ ΞµΞ―Ξ΄ΞΏΟ…Ο‚..."
                                className="w-full pl-7 py-1.5 text-[10px] bg-slate-50 border border-transparent hover:border-slate-200 focus:border-emerald-300 focus:bg-white rounded-lg outline-none font-medium text-slate-600 transition-all placeholder:italic"
                            />
                            <StickyNote size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-300 group-hover/note:text-emerald-400" />
                        </div>
                    </div>
                ))}
                {state.selectedItems.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-slate-300 italic py-10">
                        <Box size={48} className="opacity-20 mb-4" />
                        <p className="text-sm font-bold">Ξ¤ΞΏ ΞΊΞ±Ξ»Ξ¬ΞΈΞΉ ΞµΞ―Ξ½Ξ±ΞΉ Ξ¬Ξ΄ΞµΞΉΞΏ.</p>
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
                    <p className="text-sm font-bold text-slate-600 tracking-wide">Ξ‘Ο€ΞΏΞΈΞ®ΞΊΞµΟ…ΟƒΞ·...</p>
                </div>
            )}

            {/* Totals Footer */}
            <div className="p-5 bg-slate-50 border-t border-slate-200">
                <div className="flex justify-between items-center text-xs text-slate-500 mb-1">
                    <span>ΞΞ±ΞΈΞ±ΟΞ® Ξ‘ΞΎΞ―Ξ±:</span>
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
                        <span>ΞΞΊΟ€Ο„Ο‰ΟƒΞ· ({state.discountPercent}%):</span>
                        <span className="font-mono font-bold">-{formatCurrency(state.discountAmount)}</span>
                    </div>
                )}
                <div className="flex justify-between items-center text-xs text-slate-500 border-b border-slate-200 pb-2 mb-2">
                    <span>Ξ¦Ξ Ξ‘ ({(state.vatRate * 100).toFixed(0)}%):</span>
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
                    <span className="font-black text-slate-800 uppercase text-sm">Ξ£Ο…Ξ½ΞΏΞ»ΞΏ</span>
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
                    {state.isSaving ? <><Loader2 size={18} className="animate-spin" /> Ξ‘Ο€ΞΏΞΈΞ®ΞΊΞµΟ…ΟƒΞ·...</> : <><Save size={18} /> Ξ‘Ο€ΞΏΞΈΞ®ΞΊΞµΟ…ΟƒΞ· Ξ Ξ±ΟΞ±Ξ³Ξ³ΞµΞ»Ξ―Ξ±Ο‚</>}
                </button>
            </div>
            </div>

            {editingItem && (
                <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 p-5 space-y-4">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <h3 className="text-sm font-black text-slate-800 uppercase">Ξ•Ο€ΞµΞΎΞµΟΞ³Ξ±ΟƒΞ―Ξ± SKU</h3>
                                <p className="text-xs text-slate-500 font-bold mt-1">{editingItem.sku}</p>
                            </div>
                            <button onClick={closeEditModal} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                                <X size={16} />
                            </button>
                        </div>

                        {editVariants.length > 0 && (
                            <>
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">ΞΞ­Ο„Ξ±Ξ»Ξ»ΞΏ</label>
                                    <select
                                        value={editFinish}
                                        onChange={e => handleEditFinishChange(e.target.value)}
                                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500/20"
                                    >
                                        {editFinishOptions.map(code => (
                                            <option key={code} value={code}>
                                                {FINISH_CODES[code] || code || 'Ξ›ΞΏΟ…ΟƒΟ„ΟΞ­'}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Ξ Ξ­Ο„ΟΞ±</label>
                                    <select
                                        value={editVariantSuffix}
                                        onChange={e => setEditVariantSuffix(e.target.value)}
                                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500/20"
                                    >
                                        {editStoneOptions.map(v => {
                                            const { stone } = getVariantComponents(v.suffix, editProduct?.gender);
                                            const stoneLabel = stone.name && stone.code
                                                ? `${stone.name} (${stone.code})`
                                                : (stone.name || stone.code || 'Ξ§Ο‰ΟΞ―Ο‚ Ο€Ξ­Ο„ΟΞ±');
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
                                    <option value="">Ξ§Ο‰ΟΞ―Ο‚ {editSizeMode.type}</option>
                                    {editSizeMode.sizes.map(size => (
                                        <option key={size} value={size}>{size}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {editProduct && isXrCordEnamelSku(editProduct) && (
                            <>
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Ξ§ΟΟΞΌΞ± ΞΞΏΟΞ΄ΟΞ½ΞΉ</label>
                                    <select
                                        value={editCordColor || ''}
                                        onChange={e => setEditCordColor((e.target.value || undefined) as OrderItem['cord_color'])}
                                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500/20"
                                    >
                                        <option value="">Ξ§Ο‰ΟΞ―Ο‚ ΞµΟ€ΞΉΞ»ΞΏΞ³Ξ®</option>
                                        {PRODUCT_OPTION_COLORS.map(color => (
                                            <option key={`edit-cord-${color}`} value={color}>
                                                {PRODUCT_OPTION_COLOR_LABELS[color]}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Ξ§ΟΟΞΌΞ± Ξ£ΞΌΞ¬Ξ»Ο„ΞΏ</label>
                                    <select
                                        value={editEnamelColor || ''}
                                        onChange={e => setEditEnamelColor((e.target.value || undefined) as OrderItem['enamel_color'])}
                                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500/20"
                                    >
                                        <option value="">Ξ§Ο‰ΟΞ―Ο‚ ΞµΟ€ΞΉΞ»ΞΏΞ³Ξ®</option>
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
                                Ξ‘ΞΊΟΟΟ‰ΟƒΞ·
                            </button>
                            <button onClick={handleConfirmEdit} className="px-3 py-2 rounded-xl text-xs font-black text-white bg-[#060b00] hover:bg-black transition-colors">
                                Ξ‘Ο€ΞΏΞΈΞ®ΞΊΞµΟ…ΟƒΞ·
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};


