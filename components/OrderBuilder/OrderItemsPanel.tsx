import React from 'react';
import { Search, X, ArrowDownAZ, Camera, Plus, Minus, Trash2, StickyNote, Box, RefreshCw, Save, Loader2 } from 'lucide-react';
import { formatCurrency } from '../../utils/pricingEngine';
import { useOrderState } from '../../hooks/useOrderState';

interface Props {
    orderState: ReturnType<typeof useOrderState>;
    onOpenScanner: () => void;
}

export const OrderItemsPanel: React.FC<Props> = ({ orderState, onOpenScanner }) => {
    const { state, setters, actions } = orderState;

    return (
        <div className="lg:col-span-4 flex flex-col h-full bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden relative">
            {/* Header */}
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Περιεχόμενα ({state.selectedItems.length})</label>
                <div className="flex items-center gap-2">
                    <button
                        onClick={actions.handleRecalculatePrices}
                        className="flex items-center gap-1 text-xs font-bold text-amber-600 bg-amber-50 px-3 py-1.5 rounded-xl border border-amber-200 hover:bg-amber-100 transition-all"
                    >
                        <RefreshCw size={12} /> Συγχρονισμός Τιμών
                    </button>
                    <button
                        onClick={() => setters.setSortOrder(prev => prev === 'input' ? 'alpha' : 'input')}
                        className="flex items-center gap-1 text-[10px] font-bold text-slate-500 bg-white border border-slate-200 px-2 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"
                    >
                        <ArrowDownAZ size={12} /> {state.sortOrder === 'input' ? 'Χρον.' : 'Αλφ.'}
                    </button>
                    <button
                        onClick={onOpenScanner}
                        className="flex items-center gap-1 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-xl border border-blue-200 transition-all active:scale-95"
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
                {state.displayItems.map(item => (
                    <div
                        key={`${item.sku}-${item.variant_suffix}-${item.size_info}-${item.notes}`}
                        className="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm flex flex-col gap-2 animate-in slide-in-from-right-4 transition-all hover:shadow-md group"
                    >
                        <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="w-10 h-10 bg-slate-50 rounded-lg overflow-hidden shrink-0 border border-slate-100">
                                    {item.product_details?.image_url && <img src={item.product_details.image_url} className="w-full h-full object-cover" />}
                                </div>
                                <div className="min-w-0">
                                    <div className="font-black text-slate-800 text-sm leading-none truncate">
                                        {item.sku}<span className="text-emerald-600">{item.variant_suffix}</span>
                                    </div>
                                    <div className="text-[10px] text-slate-500 font-bold mt-1 flex items-center gap-1">
                                        {formatCurrency(item.price_at_order)}
                                        {item.size_info && <span className="bg-slate-100 px-1 rounded">SZ: {item.size_info}</span>}
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
                                    <button onClick={() => actions.updateQuantity(item, item.quantity - 1)} className="p-1 hover:bg-white rounded shadow-sm text-slate-600"><Minus size={12} /></button>
                                    <span className="w-6 text-center font-black text-sm">{item.quantity}</span>
                                    <button onClick={() => actions.updateQuantity(item, item.quantity + 1)} className="p-1 hover:bg-white rounded shadow-sm text-slate-600"><Plus size={12} /></button>
                                </div>
                                <button onClick={() => actions.handleRemoveItem(item)} className="p-2 text-slate-300 hover:text-red-500 transition-colors">
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>

                        <div className="relative group/note">
                            <input
                                type="text"
                                value={item.notes || ''}
                                onChange={e => actions.updateItemNotes(item, e.target.value)}
                                placeholder="Προσθήκη παρατήρησης είδους..."
                                className="w-full pl-7 py-1.5 text-[10px] bg-slate-50 border border-transparent hover:border-slate-200 focus:border-emerald-300 focus:bg-white rounded-lg outline-none font-medium text-slate-600 transition-all placeholder:italic"
                            />
                            <StickyNote size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-300 group-hover/note:text-emerald-400" />
                        </div>
                    </div>
                ))}
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
                    {state.isSaving ? <><Loader2 size={18} className="animate-spin" /> Αποθήκευση...</> : <><Save size={18} /> Αποθήκευση Εντολής</>}
                </button>
            </div>
        </div>
    );
};
