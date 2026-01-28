
import React, { useState, useMemo } from 'react';
import { Order, Product, ProductionBatch, Material, ProductionStage, OrderItem } from '../types';
import { X, Factory, CheckCircle, AlertTriangle, Loader2, ArrowRight } from 'lucide-react';
import { api } from '../lib/supabase';
import { useUI } from './UIProvider';

interface Props {
    order: Order;
    products: Product[];
    materials: Material[];
    existingBatches: ProductionBatch[];
    onClose: () => void;
    onSuccess: () => void;
}

const STAGE_LABELS: Record<string, string> = {
    [ProductionStage.AwaitingDelivery]: 'Αναμονή',
    [ProductionStage.Waxing]: 'Κεριά',
    [ProductionStage.Casting]: 'Χυτήριο',
    [ProductionStage.Setting]: 'Καρφωτής',
    [ProductionStage.Polishing]: 'Τεχνίτης',
    [ProductionStage.Labeling]: 'Labeling',
    [ProductionStage.Ready]: 'Έτοιμα'
};

const STAGE_COLORS: Record<string, string> = {
    [ProductionStage.AwaitingDelivery]: 'bg-indigo-100 text-indigo-700',
    [ProductionStage.Waxing]: 'bg-slate-100 text-slate-700',
    [ProductionStage.Casting]: 'bg-orange-100 text-orange-700',
    [ProductionStage.Setting]: 'bg-purple-100 text-purple-700',
    [ProductionStage.Polishing]: 'bg-blue-100 text-blue-700',
    [ProductionStage.Labeling]: 'bg-yellow-100 text-yellow-700',
    [ProductionStage.Ready]: 'bg-emerald-100 text-emerald-700'
};

interface RowItem extends OrderItem {
    sentQty: number;
    remainingQty: number;
    toSendQty: number;
    batchStatus: { stage: string, qty: number }[];
}

export default function ProductionSendModal({ order, products, materials, existingBatches, onClose, onSuccess }: Props) {
    const { showToast } = useUI();
    const [isSending, setIsSending] = useState(false);
    
    // Initial calculation of rows
    const initialRows = useMemo(() => {
        // Map existing batches by SKU+Variant+Size+Notes
        // Note: For simplicity, we primarily key by SKU+Variant. 
        // Size info matches are best effort or handled if stored in batches.
        const rows: RowItem[] = [];

        order.items.forEach(item => {
            const key = item.sku + (item.variant_suffix || '');
            
            // Find batches matching this item
            const relevantBatches = existingBatches.filter(b => 
                b.sku === item.sku && 
                (b.variant_suffix || '') === (item.variant_suffix || '') &&
                (b.size_info || '') === (item.size_info || '')
            );

            const sentQty = relevantBatches.reduce((sum, b) => sum + b.quantity, 0);
            const remainingQty = Math.max(0, item.quantity - sentQty);
            
            // Group status for tooltip/display
            const batchStatus: { stage: string, qty: number }[] = [];
            relevantBatches.forEach(b => {
                const existing = batchStatus.find(s => s.stage === b.current_stage);
                if (existing) existing.qty += b.quantity;
                else batchStatus.push({ stage: b.current_stage, qty: b.quantity });
            });

            rows.push({
                ...item,
                sentQty,
                remainingQty,
                toSendQty: remainingQty, // Default to sending all remaining
                batchStatus
            });
        });
        return rows;
    }, [order.items, existingBatches]);

    const [rows, setRows] = useState<RowItem[]>(initialRows);

    const updateQuantity = (index: number, val: number) => {
        setRows(prev => {
            const next = [...prev];
            // Clamp between 0 and remaining
            const max = next[index].remainingQty;
            next[index].toSendQty = Math.min(max, Math.max(0, val));
            return next;
        });
    };

    const handleSend = async () => {
        const itemsToSend = rows
            .filter(r => r.toSendQty > 0)
            .map(r => ({
                sku: r.sku,
                variant: r.variant_suffix || null,
                qty: r.toSendQty,
                size_info: r.size_info,
                notes: r.notes
            }));

        if (itemsToSend.length === 0) {
            showToast("Δεν επιλέχθηκαν είδη για αποστολή.", "info");
            return;
        }

        setIsSending(true);
        try {
            await api.sendPartialOrderToProduction(order.id, itemsToSend, products, materials);
            showToast(`Στάλθηκαν ${itemsToSend.length} είδη στην παραγωγή.`, "success");
            onSuccess();
        } catch (e: any) {
            console.error(e);
            showToast("Σφάλμα κατά την αποστολή.", "error");
        } finally {
            setIsSending(false);
        }
    };

    const totalToSend = rows.reduce((sum, r) => sum + r.toSendQty, 0);
    const totalRemaining = rows.reduce((sum, r) => sum + r.remainingQty, 0);

    return (
        <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in zoom-in-95">
            <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden">
                
                {/* Header */}
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div>
                        <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
                            <Factory className="text-blue-600"/> Αποστολή στην Παραγωγή
                        </h2>
                        <div className="flex items-center gap-2 text-sm text-slate-500 mt-1">
                            <span className="font-bold">Order #{order.id.slice(0,8)}</span>
                            <span>•</span>
                            <span>{order.customer_name}</span>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-400"><X size={20}/></button>
                </div>

                {/* Progress Summary */}
                <div className="bg-blue-50/50 p-4 border-b border-blue-100 flex gap-6 text-sm">
                    <div className="flex-1">
                        <div className="flex justify-between mb-1 font-bold text-slate-600">
                            <span>Πρόοδος Παραγγελίας</span>
                            <span>{Math.round(((order.items.reduce((s,i)=>s+i.quantity,0) - totalRemaining) / order.items.reduce((s,i)=>s+i.quantity,0)) * 100)}%</span>
                        </div>
                        <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                             <div 
                                className="h-full bg-blue-500 transition-all duration-500" 
                                style={{ width: `${((order.items.reduce((s,i)=>s+i.quantity,0) - totalRemaining) / order.items.reduce((s,i)=>s+i.quantity,0)) * 100}%` }}
                             />
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="text-center">
                            <div className="text-[10px] font-bold text-slate-400 uppercase">ΣΥΝΟΛΟ</div>
                            <div className="font-black text-slate-800">{order.items.reduce((s,i)=>s+i.quantity,0)}</div>
                        </div>
                        <div className="text-center">
                            <div className="text-[10px] font-bold text-slate-400 uppercase">ΕΣΤΑΛΗΣΑΝ</div>
                            <div className="font-black text-blue-600">{order.items.reduce((s,i)=>s+i.quantity,0) - totalRemaining}</div>
                        </div>
                        <div className="text-center">
                            <div className="text-[10px] font-bold text-slate-400 uppercase">ΕΚΚΡΕΜΟΥΝ</div>
                            <div className="font-black text-amber-600">{totalRemaining}</div>
                        </div>
                    </div>
                </div>

                {/* Table */}
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    <table className="w-full text-left text-sm border-collapse">
                        <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs sticky top-0 shadow-sm z-10">
                            <tr>
                                <th className="p-3 rounded-l-lg">Προϊόν</th>
                                <th className="p-3 text-center">Παραγγελία</th>
                                <th className="p-3 text-center">Σε Παραγωγή</th>
                                <th className="p-3 text-center">Υπόλοιπο</th>
                                <th className="p-3 text-right bg-blue-50/50 text-blue-700 w-32 rounded-r-lg">Αποστολή Τώρα</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {rows.map((row, idx) => (
                                <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                    <td className="p-3">
                                        <div className="font-bold text-slate-800">{row.sku}{row.variant_suffix}</div>
                                        {row.size_info && <div className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded inline-block text-slate-600 font-bold mt-1">{row.size_info}</div>}
                                    </td>
                                    <td className="p-3 text-center font-bold text-slate-700">{row.quantity}</td>
                                    <td className="p-3 text-center">
                                        {row.sentQty > 0 ? (
                                            <div className="group relative inline-block cursor-help">
                                                <span className="font-bold text-blue-600 border-b border-dashed border-blue-300">{row.sentQty}</span>
                                                {/* Tooltip for status */}
                                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-white border border-slate-200 shadow-xl rounded-xl p-2 hidden group-hover:block z-50 animate-in fade-in zoom-in-95">
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1 border-b border-slate-100 pb-1">Status Breakdown</p>
                                                    <div className="space-y-1">
                                                        {row.batchStatus.map((s, i) => (
                                                            <div key={i} className="flex justify-between items-center text-xs">
                                                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${STAGE_COLORS[s.stage] || 'bg-slate-100'}`}>
                                                                    {STAGE_LABELS[s.stage] || s.stage}
                                                                </span>
                                                                <span className="font-bold">{s.qty}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        ) : <span className="text-slate-300">-</span>}
                                    </td>
                                    <td className="p-3 text-center font-bold text-amber-600">
                                        {row.remainingQty}
                                    </td>
                                    <td className="p-3 text-right bg-blue-50/10">
                                        <input 
                                            type="number" 
                                            min="0" 
                                            max={row.remainingQty}
                                            value={row.toSendQty}
                                            onChange={(e) => updateQuantity(idx, parseInt(e.target.value) || 0)}
                                            className={`w-20 text-center p-2 rounded-lg border-2 font-bold outline-none transition-all ${row.toSendQty > 0 ? 'border-blue-500 bg-white text-blue-700' : 'border-slate-200 bg-slate-50 text-slate-400'}`}
                                            disabled={row.remainingQty === 0}
                                        />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end items-center gap-4">
                    <div className="text-right mr-4">
                        <div className="text-xs font-bold text-slate-500 uppercase">Σύνολο προς Αποστολή</div>
                        <div className="text-2xl font-black text-blue-600">{totalToSend} <span className="text-sm font-medium text-slate-400">τεμ.</span></div>
                    </div>
                    <button onClick={onClose} className="px-6 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-200 transition-colors">
                        Ακύρωση
                    </button>
                    <button 
                        onClick={handleSend}
                        disabled={isSending || totalToSend === 0}
                        className="px-8 py-3 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 transition-colors shadow-lg disabled:opacity-50 flex items-center gap-2"
                    >
                        {isSending ? <Loader2 size={20} className="animate-spin"/> : <ArrowRight size={20}/>}
                        {isSending ? 'Αποστολή...' : 'Αποστολή στην Παραγωγή'}
                    </button>
                </div>
            </div>
        </div>
    );
}
