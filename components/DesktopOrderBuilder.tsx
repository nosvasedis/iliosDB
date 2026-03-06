import React, { useState } from 'react';
import { Product, Customer, Order } from '../types';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';
import { useOrderState } from '../hooks/useOrderState';
import { CustomerPanel } from './OrderBuilder/CustomerPanel';
import { SmartEntryPanel } from './OrderBuilder/SmartEntryPanel';
import { OrderItemsPanel } from './OrderBuilder/OrderItemsPanel';
import BarcodeScanner from './BarcodeScanner';

interface Props {
    onBack: () => void;
    initialOrder: Order | null;
    products: Product[];
    customers: Customer[];
}

export default function DesktopOrderBuilder({ onBack, initialOrder, products, customers }: Props) {
    const orderState = useOrderState({ initialOrder, products, customers, onBack });
    const { state, actions } = orderState;
    const [isItemsExpanded, setIsItemsExpanded] = useState(false);

    return (
        <div className="flex flex-col h-full bg-slate-50 relative">
            {/* Header */}
            <div className="bg-white p-4 border-b border-slate-200 flex items-center justify-between shadow-sm shrink-0 z-20">
                <div className="flex items-center gap-4">
                    <button
                        onClick={actions.handleBack}
                        className="p-2 -ml-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors"
                    >
                        <ArrowLeft size={24} />
                    </button>
                    <div>
                        <h2 className="text-xl font-black text-slate-800">
                            {state.isEditing ? `Επεξεργασία #${state.orderId?.slice(0, 8)}` : 'Νέα Παραγγελία'}
                        </h2>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={() => setIsItemsExpanded(prev => !prev)}
                        className="hidden md:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-700 hover:bg-slate-100 transition-colors"
                    >
                        {isItemsExpanded ? 'Εστίαση σε Έξυπνη Προσθήκη' : 'Εστίαση στη Λίστα'}
                    </button>
                    <button
                        onClick={actions.handleSaveOrder}
                        disabled={state.isSaving}
                        className="bg-[#060b00] text-white px-6 py-2.5 rounded-xl font-bold shadow-lg hover:bg-black transition-all flex items-center gap-2 disabled:opacity-50"
                    >
                        <Save size={18} /> Αποθήκευση
                    </button>
                </div>
            </div>

            {/* 3-column layout with expandable items panel */}
            <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12 gap-8 p-6">
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
