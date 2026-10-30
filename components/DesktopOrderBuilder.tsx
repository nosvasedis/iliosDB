import React, { useEffect, useRef, useState } from 'react';
import { Product, Customer, Order, Collection } from '../types';
import { ArrowLeft, Save, Loader2, Columns3, PanelLeftClose, User, Package } from 'lucide-react';
import { useOrderState } from '../hooks/useOrderState';
import { CustomerPanel } from './OrderBuilder/CustomerPanel';
import { SmartEntryPanel } from './OrderBuilder/SmartEntryPanel';
import { OrderItemsPanel } from './OrderBuilder/OrderItemsPanel';
import BarcodeScanner from './BarcodeScanner';
import { formatCurrency } from '../utils/pricingEngine';
import { formatNumber } from '../utils/numberFormat';

interface Props {
    onBack: () => void;
    initialOrder: Order | null;
    products: Product[];
    customers: Customer[];
    collections?: Collection[];
}

export default function DesktopOrderBuilder({ onBack, initialOrder, products, customers, collections }: Props) {
    const orderState = useOrderState({ initialOrder, products, customers, collections, onBack });
    const { state, actions } = orderState;
    const [isItemsExpanded, setIsItemsExpanded] = useState(false);

    const customerLabel = state.isRetailCustomer
        ? (state.retailClientLabel?.trim() || 'Λιανική')
        : state.customerName?.trim();
    const lineCount = state.selectedItems.length;

    // Ctrl/Cmd + S saves the order; the ref keeps the listener stable across renders.
    const saveRef = useRef(actions.handleSaveOrder);
    saveRef.current = actions.handleSaveOrder;
    const isSavingRef = useRef(state.isSaving);
    isSavingRef.current = state.isSaving;
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 's') {
                e.preventDefault();
                if (!isSavingRef.current) void saveRef.current();
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, []);

    const viewButton = (active: boolean) =>
        `inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${
            active ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-800'
        }`;

    return (
        <div className="flex flex-col h-full min-h-0 bg-slate-50 relative">
            {/* Header */}
            <div className="bg-white px-4 py-3 xl:px-5 border-b border-slate-200 flex items-center justify-between gap-3 shrink-0 z-20">
                <div className="flex items-center gap-3 min-w-0">
                    <button
                        type="button"
                        onClick={actions.handleBack}
                        aria-label="Επιστροφή"
                        title="Επιστροφή"
                        className="p-2 -ml-1 hover:bg-slate-100 rounded-xl text-slate-500 hover:text-slate-800 transition-colors shrink-0"
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <div className="min-w-0">
                        <h2 className="text-lg font-black text-slate-800 leading-tight truncate">
                            {state.isEditing ? `Επεξεργασία #${state.orderId ?? ''}` : 'Νέα Παραγγελία'}
                        </h2>
                        <div className="flex items-center gap-x-3 gap-y-0.5 flex-wrap text-[11px] font-semibold text-slate-500 mt-0.5">
                            <span className="inline-flex items-center gap-1 min-w-0 max-w-[16rem]">
                                <User size={12} className="shrink-0 text-slate-400" />
                                <span className={`truncate ${customerLabel ? 'text-slate-700' : 'italic text-slate-400'}`}>
                                    {customerLabel || 'Χωρίς πελάτη'}
                                </span>
                            </span>
                            <span className="inline-flex items-center gap-1 tabular-nums">
                                <Package size={12} className="shrink-0 text-slate-400" />
                                {formatNumber(lineCount)} {lineCount === 1 ? 'γραμμή' : 'γραμμές'}
                            </span>
                            {lineCount > 0 && (
                                <span className="tabular-nums font-black text-emerald-700">{formatCurrency(state.grandTotal)}</span>
                            )}
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <div className="hidden lg:flex items-center rounded-xl bg-slate-100 p-0.5" role="group" aria-label="Διάταξη">
                        <button
                            type="button"
                            onClick={() => setIsItemsExpanded(false)}
                            aria-pressed={!isItemsExpanded}
                            title="Τυπική διάταξη με Έξυπνη Προσθήκη"
                            className={viewButton(!isItemsExpanded)}
                        >
                            <Columns3 size={14} /> <span className="hidden xl:inline">Τυπική</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setIsItemsExpanded(true)}
                            aria-pressed={isItemsExpanded}
                            title="Εστίαση στη λίστα ειδών"
                            className={viewButton(isItemsExpanded)}
                        >
                            <PanelLeftClose size={14} /> <span className="hidden xl:inline">Εστίαση στη λίστα</span>
                        </button>
                    </div>
                    <button
                        type="button"
                        onClick={actions.handleSaveOrder}
                        disabled={state.isSaving}
                        title="Αποθήκευση (Ctrl+S)"
                        className="bg-[#060b00] text-white px-4 xl:px-5 py-2.5 rounded-xl text-sm font-bold shadow-md hover:bg-black transition-all flex items-center gap-2 disabled:opacity-50 active:scale-[0.98]"
                    >
                        {state.isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                        Αποθήκευση
                    </button>
                </div>
            </div>

            {/* Responsive columns: customer · smart entry · items (focus mode hides smart entry) */}
            <div
                className={`flex-1 min-h-0 grid grid-cols-1 gap-4 p-4 lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden xl:gap-5 xl:p-5 ${
                    isItemsExpanded
                        ? 'lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[17rem_minmax(0,1fr)] 2xl:grid-cols-[19rem_minmax(0,1fr)]'
                        : 'lg:grid-cols-[15rem_minmax(0,1fr)_minmax(19rem,22rem)] xl:grid-cols-[17rem_minmax(0,1fr)_minmax(21rem,25rem)] 2xl:grid-cols-[19rem_minmax(0,1fr)_minmax(24rem,28rem)]'
                }`}
            >
                <CustomerPanel orderState={orderState} />
                <SmartEntryPanel orderState={orderState} isItemsExpanded={isItemsExpanded} />
                <OrderItemsPanel
                    orderState={orderState}
                    onOpenScanner={() => orderState.setters.setShowScanner(true)}
                    isExpanded={isItemsExpanded}
                />
            </div>

            {/* Barcode Scanner Modal */}
            {state.showScanner && (
                <BarcodeScanner
                    onScan={actions.handleScanInOrder}
                    onClose={() => orderState.setters.setShowScanner(false)}
                />
            )}

            {/* Full-screen Saving Overlay */}
            {state.isSaving && (
                <div className="fixed inset-0 z-50 bg-white/70 backdrop-blur-sm flex flex-col items-center justify-center gap-5 animate-in fade-in duration-200">
                    <div className="relative">
                        <div className="w-20 h-20 rounded-full bg-slate-900/10 animate-ping absolute inset-0" />
                        <div className="w-20 h-20 rounded-full bg-white shadow-2xl flex items-center justify-center relative">
                            <Loader2 size={34} className="animate-spin text-slate-800" />
                        </div>
                    </div>
                    <p className="text-base font-black text-slate-700 tracking-widest uppercase">Αποθήκευση...</p>
                </div>
            )}
        </div>
    );
}
