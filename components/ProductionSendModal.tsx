
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
    [ProductionStage.Labeling]: 'Συσκευασία',
    [ProductionStage.Ready]: 'Έτοιμα'
};

const STAGE_INITIALS: Record<string, string> = {
    [ProductionStage.AwaitingDelivery]: 'Α',
    [ProductionStage.Waxing]: 'Κ',
    [ProductionStage.Casting]: 'Χ',
    [ProductionStage.Setting]: 'Σ',
    [ProductionStage.Polishing]: 'Τ',
    [ProductionStage.Labeling]: 'Π',
    [ProductionStage.Ready]: 'Ε'
};

const STAGE_COLORS: Record<string, string> = {
    [ProductionStage.AwaitingDelivery]: 'bg-indigo-100 text-indigo-700 border-indigo-200',
    [ProductionStage.Waxing]: 'bg-slate-100 text-slate-700 border-slate-200',
    [ProductionStage.Casting]: 'bg-orange-100 text-orange-700 border-orange-200',
    [ProductionStage.Setting]: 'bg-purple-100 text-purple-700 border-purple-200',
    [ProductionStage.Polishing]: 'bg-blue-100 text-blue-700 border-blue-200',
    [ProductionStage.Labeling]: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    [ProductionStage.Ready]: 'bg-emerald-100 text-emerald-700 border-emerald-200'
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
        const rows: RowItem[] = [];

        order.items.forEach(item => {
            // Find batches matching this item
            const relevantBatches = existingBatches.filter(b => 
                b.sku === item.sku && 
                (b.variant_suffix || '') === (item.variant_suffix || '') &&
                (b.size_info || '') === (item.size_info || '')
            );

            const sentQty = relevantBatches.reduce((sum, b) => sum + b.quantity, 0);
            const remainingQty = Math.max(0, item.quantity - sentQty);
            
            // Group status for inline display
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
                batchStatus: batchStatus.sort((a, b) => {
                    const stagesOrder = Object.values(ProductionStage);
                    return stagesOrder.indexOf(a.stage as any) - stagesOrder.indexOf(b.stage as any);
                })
            });
        });
        return rows;
    }, [order.items, existingBatches]);

    const [rows, setRows] = useState<RowItem[]>(initialRows);

    const updateQuantity = (index: number, val: number) => {
        setRows(prev => {
            const next = [...prev];
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
    const totalOrdered = order.items.reduce((s,i)=>s+i.quantity,0);

    return (
        <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in zoom-in-95">
            <div className="bg-white w-full max-w-5xl max-h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden">
                
                {/* Header */}
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div>
                        <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
                            <Factory className="text-blue-600"/> Αποστολή στην Παραγωγή
                        </h2>
                        <div className="flex items-center gap-2 text-sm text-slate-500 mt-1">
                            <span className="font-bold">Εντολή #{order.id.slice(0,12)}</span>
                            <span>•</span>
                            <span>{order.customer_name}</span>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-400 transition-colors"><X size={20}/></button>
                </div>

                {/* Progress Summary */}
                <div className="bg-blue-50/50 p-4 border-b border-blue-100 flex flex-col sm:flex-row gap-6 text-sm">
                    <div className="flex-1">
                        <div className="flex justify-between mb-1 font-bold text-slate-600">
                            <span>Πρόοδος Παραγγελίας</span>
                            <span>{Math.round(((totalOrdered - totalRemaining) / totalOrdered) * 100)}%</span>
                        </div>
                        <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                             <div 
                                className="h-full bg-blue-500 transition-all duration-500" 
                                style={{ width: `${((totalOrdered - totalRemaining) / totalOrdered) * 100}%` }}
                             />
                        </div>
                    </div>
                    <div className="flex items-center gap-4 justify-center">
                        <div className="text-center">
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">ΣΥΝΟΛΟ</div>
                            <div className="font-black text-slate-800">{totalOrdered}</div>
                        </div>
                        <div className="text-center">
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">ΣΕ ΠΟΡΕΙΑ</div>
                            <div className="font-black text-blue-600">{totalOrdered - totalRemaining}</div>
                        </div>
                        <div className="text-center">
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">ΕΚΚΡΕΜΟΥΝ</div>
                            <div className="font-black text-amber-600">{totalRemaining}</div>
                        </div>
                    </div>
                </div>

                {/* Table */}
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    <table className="w-full text-left text-sm border-separate border-spacing-y-2">
                        <thead className="bg-white text-slate-500 font-bold uppercase text-[10px] tracking-widest sticky top-0 z-10">
                            <tr>
                                <th className="px-3 py-2 border-b border-slate-100">Προϊόν</th>
                                <th className="px-3 py-2 border-b border-slate-100 text-center">Εντολή</th>
                                <th className="px-3 py-2 border-b border-slate-100">Κατάσταση Παραγωγής</th>
                                <th className="px-3 py-2 border-b border-slate-100 text-center">Υπόλοιπο</th>
                                <th className="px-3 py-2 border-b border-slate-100 text-right bg-blue-50/30 text-blue-700 w-32 rounded-tr-xl">Αποστολή</th>
                            </tr>
                        </thead>
                        <tbody className="before:block before:h-2">
                            {rows.map((row, idx) => (
                                <tr key={idx} className="bg-white border border-slate-100 group">
                                    <td className="px-3 py-4 border-y border-l border-slate-100 rounded-l-2xl group-hover:bg-slate-50/50 transition-colors">
                                        <div className="font-black text-slate-800 text-sm">{row.sku}{row.variant_suffix}</div>
                                        {row.size_info && <div className="text-[9px] bg-slate-100 px-1.5 py-0.5 rounded inline-block text-slate-500 font-bold mt-1 border border-slate-200 uppercase">{row.size_info}</div>}
                                    </td>
                                    <td className="px-3 py-4 text-center font-bold text-slate-500 border-y border-slate-100 group-hover:bg-slate-50/50 transition-colors">{row.quantity}</td>
                                    <td className="px-3 py-4 border-y border-slate-100 group-hover:bg-slate-50/50 transition-colors">
                                        <div className="flex flex-wrap gap-1.5 items-center">
                                            {row.sentQty > 0 ? (
                                                row.batchStatus.map((status, sIdx) => (
                                                    <div 
                                                        key={sIdx} 
                                                        title={STAGE_LABELS[status.stage]}
                                                        className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border shadow-sm transition-transform hover:scale-105 ${STAGE_COLORS[status.stage] || 'bg-slate-50 text-slate-600 border-slate-200'}`}
                                                    >
                                                        <span className="font-black text-xs">{STAGE_INITIALS[status.stage]}</span>
                                                        <div className="w-px h-3 bg-current opacity-20"/>
                                                        <span className="font-bold text-xs">{status.qty}</span>
                                                    </div>
                                                ))
                                            ) : (
                                                <span className="text-slate-300 italic text-[10px] uppercase font-bold tracking-widest">Χωρίς Παρτίδες</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-3 py-4 text-center border-y border-slate-100 group-hover:bg-slate-50/50 transition-colors">
                                        <span className={`inline-block min-w-[2rem] px-2 py-1 rounded-lg font-black text-sm ${row.remainingQty > 0 ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-slate-50 text-slate-300'}`}>
                                            {row.remainingQty > 0 ? row.remainingQty : '-'}
                                        </span>
                                    </td>
                                    <td className="px-3 py-4 text-right bg-blue-50/10 border-y border-r border-slate-100 rounded-r-2xl">
                                        <input 
                                            type="number" 
                                            min="0" 
                                            max={row.remainingQty}
                                            value={row.toSendQty}
                                            onChange={(e) => updateQuantity(idx, parseInt(e.target.value) || 0)}
                                            className={`w-20 text-center p-2 rounded-xl border-2 font-black outline-none transition-all ${row.toSendQty > 0 ? 'border-blue-500 bg-white text-blue-700 shadow-md' : 'border-slate-200 bg-slate-50 text-slate-400'}`}
                                            disabled={row.remainingQty === 0}
                                        />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-slate-100 bg-white flex flex-col sm:flex-row justify-between items-center gap-6">
                    <div className="flex items-center gap-6 bg-slate-50 px-6 py-3 rounded-2xl border border-slate-100">
                        <div className="text-left">
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Προς Αποστολή</div>
                            <div className="text-3xl font-black text-blue-600">{totalToSend} <span className="text-xs font-bold text-slate-400">ΤΜΧ</span></div>
                        </div>
                        <div className="w-px h-10 bg-slate-200"/>
                        <div className="text-left">
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Παραμένουν</div>
                            <div className="text-2xl font-black text-slate-400">{totalRemaining - totalToSend}</div>
                        </div>
                    </div>

                    <div className="flex gap-3 w-full sm:w-auto">
                        <button onClick={onClose} className="flex-1 sm:flex-none px-8 py-3 rounded-2xl font-bold text-slate-500 hover:bg-slate-100 transition-colors">
                            Άκυρο
                        </button>
                        <button 
                            onClick={handleSend}
                            disabled={isSending || totalToSend === 0}
                            className="flex-[2] sm:flex-none px-10 py-3 rounded-2xl bg-blue-600 text-white font-black text-lg shadow-xl shadow-blue-200 hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-3"
                        >
                            {isSending ? <Loader2 size={24} className="animate-spin"/> : <ArrowRight size={24}/>}
                            Αποστολή Τώρα
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
