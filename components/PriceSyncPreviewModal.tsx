import React from 'react';
import ReactDOM from 'react-dom';
import { X, Check, AlertCircle, Gift, Lock, Truck } from 'lucide-react';
import { PriceSyncPreview } from '../types';
import { formatCurrency } from '../utils/pricingEngine';

interface Props {
    isOpen: boolean;
    preview: PriceSyncPreview | null;
    onApply: () => void;
    onCancel: () => void;
    isApplying?: boolean;
}

export default function PriceSyncPreviewModal({ isOpen, preview, onApply, onCancel, isApplying = false }: Props) {
    if (!isOpen || !preview) return null;

    const hasPriceIncrease = preview.totalsAfter.total > preview.totalsBefore.total;
    const priceChangeDiff = Math.abs(preview.totalsAfter.total - preview.totalsBefore.total);
    const canApply = preview.updatedCount > 0;

    return ReactDOM.createPortal(
        <div className="fixed inset-0 z-[700] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-slate-50 to-slate-100/50">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-amber-100 rounded-lg">
                            <AlertCircle size={20} className="text-amber-700" />
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-slate-900 tracking-tight">Προεπισκόπηση Συγχρονισμού Τιμών</h2>
                            <p className="text-xs text-slate-500 mt-0.5">Ελέγξτε τις αλλαγές που θα εφαρμοστούν</p>
                        </div>
                    </div>
                    <button
                        onClick={onCancel}
                        disabled={isApplying}
                        className="p-2 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
                    >
                        <X size={20} className="text-slate-400" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto">
                    {/* Summary Stats */}
                    <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/30">
                        <div className="grid grid-cols-3 gap-4">
                            <div className="bg-white rounded-lg p-3 border border-slate-200">
                                <div className="text-xs text-slate-500 font-medium uppercase tracking-tight mb-1">Προς Ενημέρωση</div>
                                <div className="text-2xl font-black text-emerald-600">{preview.updatedCount}</div>
                            </div>
                            <div className="bg-white rounded-lg p-3 border border-slate-200">
                                <div className="text-xs text-slate-500 font-medium uppercase tracking-tight mb-1">Αγνοούνται</div>
                                <div className="text-2xl font-black text-slate-600">{preview.skippedCount}</div>
                            </div>
                            <div className={`rounded-lg p-3 border ${hasPriceIncrease ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}`}>
                                <div className="text-xs font-medium uppercase tracking-tight mb-1" style={{ color: hasPriceIncrease ? '#b91c1c' : '#059669' }}>Σύνολο Αλλαγή</div>
                                <div className={`text-2xl font-black ${hasPriceIncrease ? 'text-red-600' : 'text-emerald-600'}`}>
                                    {hasPriceIncrease ? '+' : '-'}{formatCurrency(priceChangeDiff)}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="p-6 space-y-6">
                        {/* Items to Change */}
                        {preview.itemsToChange.length > 0 && (
                            <div>
                                <h3 className="flex items-center gap-2 text-sm font-black text-slate-900 uppercase tracking-tight mb-3">
                                    <div className="w-1 h-5 bg-emerald-500 rounded-full"></div>
                                    Θα ενημερωθούν ({preview.itemsToChange.length})
                                </h3>
                                <div className="space-y-2">
                                    {preview.itemsToChange.map((item, idx) => (
                                        <div key={idx} className="flex items-center justify-between gap-3 p-3 bg-emerald-50/50 border border-emerald-200 rounded-lg">
                                            <div className="flex-1 min-w-0">
                                                <div className="font-semibold text-slate-900 text-sm">{item.sku}{item.variantSuffix ? ` (${item.variantSuffix})` : ''}</div>
                                                {item.sizeInfo && <div className="text-xs text-slate-500 mt-0.5">{item.sizeInfo}</div>}
                                                {item.quantity && <div className="text-xs text-slate-500">Ποσότητα: {item.quantity}</div>}
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <div className="text-right">
                                                    <div className="text-xs text-slate-500">€{item.oldPrice.toFixed(2)}</div>
                                                    <div className="font-bold text-emerald-700">€{item.newPrice.toFixed(2)}</div>
                                                </div>
                                                <div className="text-xs text-emerald-600 font-bold whitespace-nowrap">
                                                    {item.newPrice > item.oldPrice ? '+' : ''}{(item.newPrice - item.oldPrice).toFixed(2)} €
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Items Skipped - Already shipped to customer */}
                        {preview.itemsToSkip.filter(i => i.reason === 'already_shipped').length > 0 && (
                            <div>
                                <h3 className="flex items-center gap-2 text-sm font-black text-slate-900 uppercase tracking-tight mb-3">
                                    <Truck size={16} className="text-blue-600" />
                                    Ήδη αποσταλμένα ({preview.itemsToSkip.filter(i => i.reason === 'already_shipped').length})
                                </h3>
                                <div className="space-y-2">
                                    {preview.itemsToSkip
                                        .filter(i => i.reason === 'already_shipped')
                                        .map((item, idx) => (
                                            <div key={idx} className="flex items-center justify-between gap-3 p-3 bg-blue-50/50 border border-blue-200 rounded-lg">
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-semibold text-slate-900 text-sm">{item.sku}{item.variantSuffix ? ` (${item.variantSuffix})` : ''}</div>
                                                    {item.sizeInfo && <div className="text-xs text-slate-500 mt-0.5">{item.sizeInfo}</div>}
                                                    {item.quantity != null && (
                                                        <div className="text-xs text-slate-500">Αποσταλμένα: {item.quantity}</div>
                                                    )}
                                                    <div className="text-xs text-blue-700 font-medium mt-1">Η τιμή παραμένει όπως καταχωρήθηκε στην αποστολή</div>
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <div className="font-bold text-slate-900">€{item.currentPrice.toFixed(2)}</div>
                                                </div>
                                            </div>
                                        ))}
                                </div>
                            </div>
                        )}

                        {/* Items Skipped - Manual Override */}
                        {preview.itemsToSkip.filter(i => i.reason === 'manual_override').length > 0 && (
                            <div>
                                <h3 className="flex items-center gap-2 text-sm font-black text-slate-900 uppercase tracking-tight mb-3">
                                    <Lock size={16} className="text-amber-600" />
                                    Χειροκίνητα ορισμένες τιμές ({preview.itemsToSkip.filter(i => i.reason === 'manual_override').length})
                                </h3>
                                <div className="space-y-2">
                                    {preview.itemsToSkip
                                        .filter(i => i.reason === 'manual_override')
                                        .map((item, idx) => (
                                            <div key={idx} className="flex items-center justify-between gap-3 p-3 bg-amber-50/50 border border-amber-200 rounded-lg">
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-semibold text-slate-900 text-sm">{item.sku}{item.variantSuffix ? ` (${item.variantSuffix})` : ''}</div>
                                                    {item.sizeInfo && <div className="text-xs text-slate-500 mt-0.5">{item.sizeInfo}</div>}
                                                    {item.quantity && <div className="text-xs text-slate-500">Ποσότητα: {item.quantity}</div>}
                                                    <div className="text-xs text-amber-700 font-medium mt-1">⚠️ Προστατεύται από χειροκίνητη ρύθμιση</div>
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <div className="font-bold text-slate-900">€{item.currentPrice.toFixed(2)}</div>
                                                </div>
                                            </div>
                                        ))}
                                </div>
                            </div>
                        )}

                        {/* Items Skipped - Gifts (0 EUR) */}
                        {preview.itemsToSkip.filter(i => i.reason === 'gift_zero_eur').length > 0 && (
                            <div>
                                <h3 className="flex items-center gap-2 text-sm font-black text-slate-900 uppercase tracking-tight mb-3">
                                    <Gift size={16} className="text-violet-600" />
                                    Δώρα (€0) ({preview.itemsToSkip.filter(i => i.reason === 'gift_zero_eur').length})
                                </h3>
                                <div className="space-y-2">
                                    {preview.itemsToSkip
                                        .filter(i => i.reason === 'gift_zero_eur')
                                        .map((item, idx) => (
                                            <div key={idx} className="flex items-center justify-between gap-3 p-3 bg-violet-50/50 border border-violet-200 rounded-lg">
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-semibold text-slate-900 text-sm">{item.sku}{item.variantSuffix ? ` (${item.variantSuffix})` : ''}</div>
                                                    {item.sizeInfo && <div className="text-xs text-slate-500 mt-0.5">{item.sizeInfo}</div>}
                                                    {item.quantity && <div className="text-xs text-slate-500">Ποσότητα: {item.quantity}</div>}
                                                    <div className="text-xs text-violet-700 font-medium mt-1">🎁 Στάθμευση ως δώρο</div>
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <div className="font-bold text-slate-900">€0,00</div>
                                                </div>
                                            </div>
                                        ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Financial Summary */}
                    <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/30 space-y-2">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <div className="text-xs text-slate-500 font-medium mb-1">Πριν</div>
                                <div className="space-y-1 text-right">
                                    <div className="text-slate-600">Σύνολο: <span className="font-bold">{formatCurrency(preview.totalsBefore.subtotal)}</span></div>
                                    <div className="text-slate-500 text-xs">ΦΠΑ: {formatCurrency(preview.totalsBefore.vat)}</div>
                                    <div className="text-slate-900 font-black border-t border-slate-300 pt-1">{formatCurrency(preview.totalsBefore.total)}</div>
                                </div>
                            </div>
                            <div>
                                <div className="text-xs text-slate-500 font-medium mb-1">Μετά</div>
                                <div className="space-y-1 text-right">
                                    <div className="text-slate-600">Σύνολο: <span className="font-bold">{formatCurrency(preview.totalsAfter.subtotal)}</span></div>
                                    <div className="text-slate-500 text-xs">ΦΠΑ: {formatCurrency(preview.totalsAfter.vat)}</div>
                                    <div className={`font-black border-t border-slate-300 pt-1 ${hasPriceIncrease ? 'text-red-600' : 'text-emerald-600'}`}>
                                        {formatCurrency(preview.totalsAfter.total)}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-3">
                    <button
                        onClick={onCancel}
                        disabled={isApplying}
                        className="px-4 py-2.5 rounded-lg border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Ακύρωση
                    </button>
                    <button
                        onClick={onApply}
                        disabled={isApplying || !canApply}
                        title={canApply ? undefined : 'Δεν υπάρχουν τιμές προς ενημέρωση'}
                        className="px-5 py-2.5 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {isApplying ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                Εφαρμογή...
                            </>
                        ) : (
                            <>
                                <Check size={18} />
                                Εφαρμογή Αλλαγών
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
