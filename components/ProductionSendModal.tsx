
import React, { useState, useMemo } from 'react';
import { Order, Product, ProductionBatch, Material, ProductionStage, OrderItem } from '../types';
// @FIX: Added missing icon imports: User, Phone, ShoppingCart, RefreshCw, ImageIcon, Minus, Plus
import { X, Factory, CheckCircle, AlertTriangle, Loader2, ArrowRight, Clock, StickyNote, History, Package, Box, Info, PauseCircle, User, Phone, ShoppingCart, RefreshCw, ImageIcon, Minus, Plus } from 'lucide-react';
import { api } from '../lib/supabase';
import { useUI } from './UIProvider';
import { formatCurrency, formatDecimal } from '../utils/pricingEngine';

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

const STAGE_COLORS: Record<string, string> = {
    [ProductionStage.AwaitingDelivery]: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    [ProductionStage.Waxing]: 'bg-slate-100 text-slate-700 border-slate-200',
    [ProductionStage.Casting]: 'bg-orange-50 text-orange-700 border-orange-200',
    [ProductionStage.Setting]: 'bg-purple-50 text-purple-700 border-purple-200',
    [ProductionStage.Polishing]: 'bg-blue-50 text-blue-700 border-blue-200',
    [ProductionStage.Labeling]: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    [ProductionStage.Ready]: 'bg-emerald-500 text-white border-emerald-600 shadow-emerald-100'
};

// Heuristic for delay detection (matches ProductionPage logic)
const STAGE_LIMITS_HOURS: Record<string, number> = {
    [ProductionStage.Waxing]: 48,
    [ProductionStage.Casting]: 24,
    [ProductionStage.Setting]: 72,
    [ProductionStage.Polishing]: 48,
    [ProductionStage.Labeling]: 24
};

const getAgingInfo = (updatedAt: string, stage: string) => {
    const start = new Date(updatedAt);
    const now = new Date();
    const diffMs = now.getTime() - start.getTime();
    const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
    
    const limit = STAGE_LIMITS_HOURS[stage] || 999;
    const isDelayed = stage !== ProductionStage.Ready && diffHrs > limit;
    
    let timeLabel = '';
    if (diffHrs < 24) timeLabel = `${diffHrs}ώ`;
    else timeLabel = `${Math.floor(diffHrs/24)}ημ`;

    return { diffHrs, timeLabel, isDelayed };
};

interface BatchMiniStatus {
    id: string;
    stage: string;
    qty: number;
    updatedAt: string;
    notes?: string;
    onHold?: boolean;
    onHoldReason?: string;
}

interface RowItem extends OrderItem {
    readyQty: number;
    inProgressQty: number;
    remainingQty: number;
    toSendQty: number;
    batchDetails: BatchMiniStatus[];
}

export default function ProductionSendModal({ order, products, materials, existingBatches, onClose, onSuccess }: Props) {
    const { showToast } = useUI();
    const [isSending, setIsSending] = useState(false);
    
    const rows = useMemo(() => {
        return order.items.map(item => {
            const relevantBatches = existingBatches.filter(b => 
                b.sku === item.sku && 
                (b.variant_suffix || '') === (item.variant_suffix || '') &&
                (b.size_info || '') === (item.size_info || '')
            );

            const readyQty = relevantBatches
                .filter(b => b.current_stage === ProductionStage.Ready)
                .reduce((s, b) => s + b.quantity, 0);
            
            const inProgressQty = relevantBatches
                .filter(b => b.current_stage !== ProductionStage.Ready)
                .reduce((s, b) => s + b.quantity, 0);

            const sentTotal = readyQty + inProgressQty;
            const remainingQty = Math.max(0, item.quantity - sentTotal);
            
            const batchDetails: BatchMiniStatus[] = relevantBatches.map(b => ({
                id: b.id,
                stage: b.current_stage,
                qty: b.quantity,
                updatedAt: b.updated_at,
                notes: b.notes,
                onHold: b.on_hold,
                onHoldReason: b.on_hold_reason
            })).sort((a, b) => {
                const stages = Object.values(ProductionStage);
                return stages.indexOf(a.stage as any) - stages.indexOf(b.stage as any);
            });

            return {
                ...item,
                readyQty,
                inProgressQty,
                remainingQty,
                toSendQty: remainingQty,
                batchDetails
            };
        });
    }, [order.items, existingBatches]);

    const [toSendQuantities, setToSendQuantities] = useState<Record<number, number>>({});

    const updateToSend = (idx: number, val: number) => {
        setToSendQuantities(prev => ({
            ...prev,
            [idx]: Math.min(rows[idx].remainingQty, Math.max(0, val))
        }));
    };

    const handleSend = async () => {
        const itemsToSend = rows.map((r, idx) => ({
            sku: r.sku,
            variant: r.variant_suffix || null,
            qty: toSendQuantities[idx] !== undefined ? toSendQuantities[idx] : r.remainingQty,
            size_info: r.size_info,
            notes: r.notes
        })).filter(i => i.qty > 0);

        if (itemsToSend.length === 0) {
            showToast("Δεν επιλέχθηκαν τεμάχια για αποστολή.", "info");
            return;
        }

        setIsSending(true);
        try {
            await api.sendPartialOrderToProduction(order.id, itemsToSend, products, materials);
            showToast(`Επιτυχής αποστολή ${itemsToSend.length} ειδών στην παραγωγή.`, "success");
            onSuccess();
        } catch (e) {
            showToast("Σφάλμα κατά την αποστολή.", "error");
        } finally {
            setIsSending(false);
        }
    };

    const totalOrdered = order.items.reduce((s, i) => s + i.quantity, 0);
    const totalReady = rows.reduce((s, r) => s + r.readyQty, 0);
    const totalInProduction = rows.reduce((s, r) => s + r.inProgressQty, 0);
    const totalRemaining = rows.reduce((s, r) => s + r.remainingQty, 0);
    const totalToSend = rows.reduce((s, r, idx) => s + (toSendQuantities[idx] !== undefined ? toSendQuantities[idx] : r.remainingQty), 0);

    return (
        <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-white w-full max-w-6xl max-h-[90vh] rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden border border-white/20">
                
                {/* Header Section */}
                <div className="p-8 border-b border-slate-100 bg-white sticky top-0 z-10 flex flex-col sm:flex-row justify-between items-start gap-6">
                    <div className="flex gap-4">
                        <div className="w-16 h-16 bg-slate-900 text-white rounded-2xl flex items-center justify-center shadow-lg">
                            <Factory size={32}/>
                        </div>
                        <div>
                            <div className="flex items-center gap-3">
                                <h2 className="text-2xl font-black text-slate-900 tracking-tight">Αποστολή στην Παραγωγή</h2>
                                <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider border border-blue-200">
                                    #{order.id.slice(0, 12)}
                                </span>
                            </div>
                            <div className="flex items-center gap-4 mt-1 text-slate-500 font-bold">
                                <div className="flex items-center gap-1.5"><User size={16} className="text-slate-400"/> {order.customer_name}</div>
                                {order.customer_phone && <div className="flex items-center gap-1.5"><Phone size={16} className="text-slate-400"/> {order.customer_phone}</div>}
                            </div>
                        </div>
                    </div>
                    
                    {/* Order Notes Overview */}
                    {order.notes && (
                        <div className="flex-1 max-w-md bg-amber-50/80 border border-amber-200 p-3 rounded-2xl flex gap-3">
                            <StickyNote className="text-amber-500 shrink-0 mt-1" size={18}/>
                            <div>
                                <span className="text-[9px] font-black text-amber-600 uppercase tracking-widest block mb-0.5">Σημειώσεις Παραγγελίας</span>
                                <p className="text-xs text-amber-900 font-medium leading-relaxed line-clamp-2 italic">"{order.notes}"</p>
                            </div>
                        </div>
                    )}

                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors shrink-0"><X size={24}/></button>
                </div>

                {/* Progress Summary Dashboard */}
                <div className="px-8 py-4 bg-slate-50/80 border-b border-slate-200 grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-white p-3 rounded-2xl border border-slate-200 flex items-center gap-4 shadow-sm">
                        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500"><ShoppingCart size={20}/></div>
                        <div>
                            <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Παραγγελία</div>
                            <div className="text-xl font-black text-slate-800">{totalOrdered} <span className="text-xs text-slate-400">τμχ</span></div>
                        </div>
                    </div>
                    <div className="bg-white p-3 rounded-2xl border border-emerald-100 flex items-center gap-4 shadow-sm">
                        <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600"><CheckCircle size={20}/></div>
                        <div>
                            <div className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider">Έτοιμα</div>
                            <div className="text-xl font-black text-emerald-700">{totalReady} <span className="text-xs text-emerald-400">τμχ</span></div>
                        </div>
                    </div>
                    <div className="bg-white p-3 rounded-2xl border border-blue-100 flex items-center gap-4 shadow-sm">
                        <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600"><RefreshCw size={20} className="animate-spin-slow"/></div>
                        <div>
                            <div className="text-[9px] font-bold text-blue-600 uppercase tracking-wider">Σε Παραγωγή</div>
                            <div className="text-xl font-black text-blue-700">{totalInProduction} <span className="text-xs text-slate-400">τμχ</span></div>
                        </div>
                    </div>
                    <div className="bg-white p-3 rounded-2xl border border-amber-100 flex items-center gap-4 shadow-sm">
                        <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600"><History size={20}/></div>
                        <div>
                            <div className="text-[9px] font-bold text-amber-600 uppercase tracking-wider">Εκκρεμούν</div>
                            <div className="text-xl font-black text-amber-700">{totalRemaining} <span className="text-xs text-slate-400">τμχ</span></div>
                        </div>
                    </div>
                </div>

                {/* Items List Table */}
                <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                    <div className="space-y-4">
                        {rows.map((row, idx) => {
                            const product = products.find(p => p.sku === row.sku);
                            const toSendVal = toSendQuantities[idx] !== undefined ? toSendQuantities[idx] : row.remainingQty;
                            const isFullySent = row.remainingQty === 0;

                            return (
                                <div key={idx} className={`bg-white rounded-3xl border transition-all duration-300 flex flex-col md:flex-row overflow-hidden ${isFullySent ? 'border-slate-100 opacity-80' : 'border-slate-200 shadow-sm hover:shadow-md hover:border-blue-200'}`}>
                                    {/* Left: Product Info */}
                                    <div className="p-4 md:w-1/4 border-b md:border-b-0 md:border-r border-slate-100 flex items-center gap-4 shrink-0 bg-slate-50/30">
                                        <div className="w-16 h-16 rounded-2xl overflow-hidden bg-slate-100 border border-slate-200 shrink-0">
                                            {product?.image_url ? <img src={product.image_url} className="w-full h-full object-cover"/> : <ImageIcon className="m-auto text-slate-300" size={24}/>}
                                        </div>
                                        <div className="min-w-0">
                                            <div className="font-black text-slate-800 text-base leading-tight truncate uppercase">{row.sku}{row.variant_suffix}</div>
                                            {row.size_info && <div className="text-[10px] font-black text-blue-600 uppercase mt-1">Μέγεθος: {row.size_info}</div>}
                                            <div className="text-[9px] font-bold text-slate-400 uppercase mt-1 truncate">{product?.category}</div>
                                        </div>
                                    </div>

                                    {/* Middle: Intelligent Status Visualizer */}
                                    <div className="flex-1 p-4 flex flex-col gap-4">
                                        <div className="flex items-center justify-between mb-1">
                                            <div className="flex gap-4">
                                                <div className="text-center">
                                                    <div className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Εντολή</div>
                                                    <div className="text-base font-black text-slate-600">{row.quantity}</div>
                                                </div>
                                                <div className="text-center">
                                                    <div className="text-[8px] font-bold text-emerald-500 uppercase tracking-widest">Έτοιμα</div>
                                                    <div className="text-base font-black text-emerald-600">{row.readyQty}</div>
                                                </div>
                                                <div className="text-center">
                                                    <div className="text-[8px] font-bold text-blue-500 uppercase tracking-widest">Σε Παραγωγή</div>
                                                    <div className="text-base font-black text-blue-600">{row.inProgressQty}</div>
                                                </div>
                                            </div>
                                            
                                            {row.notes && (
                                                <div className="bg-emerald-50/50 border border-emerald-100 px-3 py-1.5 rounded-xl flex items-center gap-2 max-w-[200px]" title={row.notes}>
                                                    <StickyNote size={12} className="text-emerald-500 shrink-0"/>
                                                    <span className="text-[10px] text-emerald-800 font-bold truncate italic">"{row.notes}"</span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Batch Timeline Strip */}
                                        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                                            {row.batchDetails.map(batch => {
                                                const age = getAgingInfo(batch.updatedAt, batch.stage);
                                                return (
                                                    <div 
                                                        key={batch.id} 
                                                        className={`flex items-center gap-2 px-3 py-2 rounded-2xl border min-w-max shadow-sm relative transition-all hover:scale-105 ${STAGE_COLORS[batch.stage] || 'bg-slate-50 border-slate-200'}`}
                                                    >
                                                        <div className="flex flex-col">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[10px] font-black uppercase tracking-tight">{STAGE_LABELS[batch.stage]}</span>
                                                                <span className="w-1 h-1 rounded-full bg-current opacity-30"/>
                                                                <span className="text-xs font-black">{batch.qty}τμχ</span>
                                                            </div>
                                                            <div className="flex items-center gap-2 mt-0.5">
                                                                <div className={`flex items-center gap-0.5 text-[8px] font-bold px-1 rounded ${age.isDelayed ? 'bg-red-500 text-white animate-pulse' : 'bg-black/5 text-current'}`}>
                                                                    <Clock size={8}/> {age.timeLabel}
                                                                </div>
                                                                {batch.onHold && <span className="bg-amber-500 text-white text-[7px] font-black px-1 rounded flex items-center gap-0.5"><PauseCircle size={8}/> HOLD</span>}
                                                                {batch.notes && <StickyNote size={10} className="text-current opacity-60"/>}
                                                            </div>
                                                        </div>
                                                        
                                                        {batch.onHold && batch.onHoldReason && (
                                                            <div className="absolute -top-1 -right-1 group cursor-help">
                                                                <AlertTriangle size={12} className="text-amber-600 fill-white"/>
                                                                <div className="absolute bottom-full right-0 mb-2 p-2 bg-slate-900 text-white text-[9px] rounded-lg w-32 opacity-0 group-hover:opacity-100 transition-opacity z-50 pointer-events-none shadow-xl">
                                                                    {batch.onHoldReason}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                            
                                            {/* Remaining Visual Placeholder */}
                                            {row.remainingQty > 0 && (
                                                <div className="flex items-center gap-2 px-3 py-2 rounded-2xl border-2 border-dashed border-amber-200 bg-amber-50/30 text-amber-600 min-w-max">
                                                    <span className="text-[10px] font-black uppercase tracking-tight">Εκκρεμεί</span>
                                                    <span className="text-xs font-black">{row.remainingQty}τμχ</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Right: Sending Control */}
                                    <div className={`p-4 md:w-32 flex flex-col items-center justify-center gap-2 shrink-0 ${isFullySent ? 'bg-slate-50/30' : 'bg-blue-50/30 border-l border-slate-100'}`}>
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Αποστολη</label>
                                        <div className="flex items-center gap-2">
                                            <button 
                                                onClick={() => updateToSend(idx, toSendVal - 1)}
                                                disabled={isFullySent || toSendVal <= 0}
                                                className="w-8 h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center shadow-sm disabled:opacity-30"
                                            >
                                                <Minus size={14} className="text-slate-400"/>
                                            </button>
                                            <input 
                                                type="number"
                                                min="0"
                                                max={row.remainingQty}
                                                value={toSendVal}
                                                onChange={e => updateToSend(idx, parseInt(e.target.value) || 0)}
                                                className={`w-12 text-center font-black text-lg bg-transparent outline-none ${toSendVal > 0 ? 'text-blue-600' : 'text-slate-300'}`}
                                                disabled={isFullySent}
                                            />
                                            <button 
                                                onClick={() => updateToSend(idx, toSendVal + 1)}
                                                disabled={isFullySent || toSendVal >= row.remainingQty}
                                                className="w-8 h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center shadow-sm disabled:opacity-30"
                                            >
                                                <Plus size={14} className="text-slate-400"/>
                                            </button>
                                        </div>
                                        {row.remainingQty > 0 && toSendVal === row.remainingQty && (
                                            <span className="text-[8px] font-black text-blue-500 uppercase tracking-widest mt-1">Full Batch</span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Footer Section */}
                <div className="p-8 border-t border-slate-100 bg-white flex flex-col md:flex-row justify-between items-center gap-8 shadow-[0_-4px_20px_rgba(0,0,0,0.02)]">
                    <div className="flex gap-8 items-center bg-slate-50 px-8 py-4 rounded-[2rem] border border-slate-100">
                        <div className="text-center">
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Προς Παραγωγή</div>
                            <div className="text-4xl font-black text-blue-600">{totalToSend} <span className="text-xs text-slate-400 font-bold">τεμ</span></div>
                        </div>
                        <div className="w-px h-10 bg-slate-200"/>
                        <div className="text-center">
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Αναμονή Μετά</div>
                            <div className="text-3xl font-black text-slate-400">{totalRemaining - totalToSend}</div>
                        </div>
                    </div>

                    <div className="flex gap-4 w-full md:w-auto">
                        <button onClick={onClose} className="flex-1 md:flex-none px-10 py-4 rounded-2xl font-black text-slate-500 hover:bg-slate-100 transition-all active:scale-95 border-2 border-transparent">
                            Άκυρο
                        </button>
                        <button 
                            onClick={handleSend}
                            disabled={isSending || totalToSend === 0}
                            className="flex-[2] md:flex-none px-12 py-4 rounded-2xl bg-slate-900 text-white font-black text-lg shadow-2xl shadow-slate-200 hover:bg-black transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3 relative group"
                        >
                            {isSending ? <Loader2 size={24} className="animate-spin"/> : (
                                <>
                                    <span>Έναρξη Παρτίδων</span>
                                    <ArrowRight size={22} className="group-hover:translate-x-1 transition-transform"/>
                                </>
                            )}
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
}

const ProgressIcon = ({ value, total }: { value: number, total: number }) => {
    const pct = total > 0 ? (value / total) * 100 : 0;
    return (
        <div className="relative w-10 h-10 flex items-center justify-center">
            <svg className="w-full h-full transform -rotate-90">
                <circle cx="20" cy="20" r="16" stroke="currentColor" strokeWidth="4" fill="transparent" className="text-slate-100" />
                <circle cx="20" cy="20" r="16" stroke="currentColor" strokeWidth="4" fill="transparent" strokeDasharray={100} strokeDashoffset={100 - pct} className="text-blue-500 transition-all duration-1000" />
            </svg>
            <span className="absolute text-[8px] font-black">{Math.round(pct)}%</span>
        </div>
    );
};
