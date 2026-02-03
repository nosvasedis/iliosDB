
import React, { useState, useMemo } from 'react';
import { Order, Product, ProductionBatch, Material, ProductionStage, OrderItem, Collection, Gender } from '../types';
import { X, Factory, CheckCircle, AlertTriangle, Loader2, ArrowRight, Clock, StickyNote, History, Package, Box, Info, PauseCircle, User, Phone, ShoppingCart, RefreshCw, ImageIcon, Minus, Plus, Filter, Wallet, CheckSquare, Square, Coins } from 'lucide-react';
import { api } from '../lib/supabase';
import { useUI } from './UIProvider';
import { formatCurrency, formatDecimal, getVariantComponents } from '../utils/pricingEngine';

interface Props {
    order: Order;
    products: Product[];
    materials: Material[];
    existingBatches: ProductionBatch[];
    collections?: Collection[]; // Added collections
    onClose: () => void;
    onSuccess: () => void;
}

const STAGE_LIMITS_HOURS: Record<string, number> = {
    [ProductionStage.Waxing]: 120,    
    [ProductionStage.Casting]: 96,    
    [ProductionStage.Setting]: 144,   
    [ProductionStage.Polishing]: 120, 
    [ProductionStage.Labeling]: 72    
};

const getAgingInfo = (updatedAt: string, stage: string) => {
    const start = new Date(updatedAt);
    const now = new Date();
    const diffMs = now.getTime() - start.getTime();
    const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
    const limit = STAGE_LIMITS_HOURS[stage] || 999;
    const isDelayed = stage !== ProductionStage.Ready && diffHrs > limit;
    let timeLabel = diffHrs < 24 ? `${diffHrs}ώ` : `${Math.floor(diffHrs/24)}ημ`;
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
    
    // Filtering Metadata
    gender?: Gender;
    collectionId?: number;
    price: number; // Unit price at order time
}

export default function ProductionSendModal({ order, products, materials, existingBatches, collections, onClose, onSuccess }: Props) {
    const { showToast } = useUI();
    const [isSending, setIsSending] = useState(false);
    
    // --- FILTER STATE ---
    const [filterGender, setFilterGender] = useState<'All' | Gender>('All');
    const [filterCollection, setFilterCollection] = useState<number | 'All'>('All');
    
    // --- SEND QUANTITY STATE ---
    // Stores how many to send for each row index. Default is 0.
    const [toSendQuantities, setToSendQuantities] = useState<Record<number, number>>({});

    const rows = useMemo(() => {
        return order.items.map(item => {
            const product = products.find(p => p.sku === item.sku);
            
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

            // Determine Gender/Collection for filtering
            const gender = product?.gender || 'Unknown';
            const collectionId = product?.collections?.[0]; // Taking primary collection

            return {
                ...item,
                readyQty,
                inProgressQty,
                remainingQty,
                toSendQty: remainingQty,
                batchDetails,
                gender,
                collectionId,
                price: item.price_at_order
            } as RowItem;
        });
    }, [order.items, existingBatches, products]);

    // Derived: Filtered Rows based on selection
    const filteredRows = useMemo(() => {
        return rows.map((row, idx) => ({ ...row, originalIndex: idx })).filter(row => {
            if (filterGender !== 'All' && row.gender !== filterGender) return false;
            if (filterCollection !== 'All') {
                 // Check if product belongs to selected collection (row.collectionId is just primary, check products list ideally or trust primary)
                 // Better: Check if product has this collection
                 const product = products.find(p => p.sku === row.sku);
                 if (!product?.collections?.includes(filterCollection)) return false;
            }
            return true;
        });
    }, [rows, filterGender, filterCollection, products]);

    // --- FINANCIAL HISTORY LOGIC ---
    const historyGroups = useMemo(() => {
       const groups: Record<string, { date: Date, qty: number, value: number, count: number }> = {};
       
       existingBatches.forEach(b => {
           // Find original order item price to calculate historical value
           const item = order.items.find(i => i.sku === b.sku && i.variant_suffix === b.variant_suffix);
           const price = item ? item.price_at_order : 0;
           
           // Group by Hour to simulate a "Batch Event"
           const key = new Date(b.created_at).toISOString().slice(0, 13); // YYYY-MM-DDTHH
           
           if (!groups[key]) groups[key] = { date: new Date(b.created_at), qty: 0, value: 0, count: 0 };
           groups[key].qty += b.quantity;
           groups[key].value += (b.quantity * price);
           groups[key].count += 1;
       });

       return Object.values(groups).sort((a,b) => b.date.getTime() - a.date.getTime());
    }, [existingBatches, order.items]);

    // --- CURRENT SEND VALUE ---
    const currentSendValue = useMemo(() => {
        return rows.reduce((sum: number, row, idx) => {
            const qty = toSendQuantities[idx] || 0;
            return sum + (qty * row.price);
        }, 0);
    }, [rows, toSendQuantities]);

    const totalToSend = Object.values(toSendQuantities).reduce((a: number, b: number) => a + b, 0);

    const updateToSend = (idx: number, val: number) => {
        const row = rows[idx];
        setToSendQuantities(prev => ({
            ...prev,
            [idx]: Math.min(row.remainingQty, Math.max(0, val))
        }));
    };

    const handleSelectVisible = () => {
        const newQuantities = { ...toSendQuantities };
        filteredRows.forEach(row => {
            if (row.remainingQty > 0) {
                newQuantities[row.originalIndex] = row.remainingQty;
            }
        });
        setToSendQuantities(newQuantities);
    };

    const handleClearSelection = () => {
        setToSendQuantities({});
    };

    const handleSend = async () => {
        const itemsToSend = rows.map((r, idx) => ({
            sku: r.sku,
            variant: r.variant_suffix || null,
            qty: toSendQuantities[idx] || 0,
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
            showToast(`Επιτυχής αποστολή ${itemsToSend.length} ειδών.`, "success");
            onSuccess();
        } catch (e) {
            showToast("Σφάλμα κατά την αποστολή.", "error");
        } finally {
            setIsSending(false);
        }
    };

    const totalRemaining = rows.reduce((s, r) => s + r.remainingQty, 0);
    const totalSent = rows.reduce((s, r) => s + r.inProgressQty + r.readyQty, 0);

    return (
        <div className="fixed inset-0 z-[200] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 animate-in fade-in zoom-in-95">
            <div className="bg-white w-full h-full max-w-[1600px] sm:h-[92vh] sm:rounded-[2rem] shadow-2xl flex flex-col overflow-hidden border border-slate-200">
                
                {/* HEADER */}
                <div className="p-6 border-b border-slate-100 bg-white sticky top-0 z-10 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-slate-900 text-white rounded-2xl shadow-lg hidden sm:block">
                            <Factory size={28}/>
                        </div>
                        <div>
                            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Αποστολή στην Παραγωγή</h2>
                            <div className="flex items-center gap-3 text-sm font-bold text-slate-500 mt-0.5">
                                <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-100">#{order.id.slice(0, 8)}</span>
                                <span className="flex items-center gap-1 truncate max-w-[200px]"><User size={14}/> {order.customer_name}</span>
                            </div>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"><X size={24}/></button>
                </div>

                <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
                    
                    {/* LEFT PANEL: SELECTION & TABLE (Takes remaining space) */}
                    <div className="flex-1 flex flex-col min-h-0 border-r border-slate-100 bg-slate-50/50">
                        
                        {/* FILTERS BAR */}
                        <div className="p-4 border-b border-slate-100 bg-white flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between shrink-0">
                            <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0 scrollbar-hide">
                                <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-xl border border-slate-100 shrink-0">
                                    <span className="text-[10px] font-black text-slate-400 uppercase px-2 hidden sm:inline"><Filter size={10} className="inline mr-1"/> Φύλο</span>
                                    {['All', Gender.Women, Gender.Men, Gender.Unisex].map(g => (
                                        <button 
                                            key={g} onClick={() => setFilterGender(g as any)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${filterGender === g ? 'bg-white shadow-sm text-slate-900 ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
                                        >
                                            {g === 'All' ? 'Όλα' : (g === Gender.Women ? 'Γυν' : (g === Gender.Men ? 'Ανδ' : 'Uni'))}
                                        </button>
                                    ))}
                                </div>

                                {collections && collections.length > 0 && (
                                    <select 
                                        value={filterCollection} 
                                        onChange={(e) => setFilterCollection(e.target.value === 'All' ? 'All' : parseInt(e.target.value))}
                                        className="bg-white border border-slate-200 text-slate-700 text-xs font-bold py-2 pl-3 pr-8 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer shrink-0 max-w-[150px]"
                                    >
                                        <option value="All">Όλες οι Συλλογές</option>
                                        {collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                )}
                            </div>

                            <div className="flex gap-2 shrink-0 w-full sm:w-auto overflow-x-auto">
                                <button onClick={handleSelectVisible} className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-50 text-blue-700 rounded-xl text-xs font-bold hover:bg-blue-100 transition-colors border border-blue-100 whitespace-nowrap">
                                    <CheckSquare size={14}/> Όλα τα ορατά
                                </button>
                                <button onClick={handleClearSelection} className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-50 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-100 transition-colors border border-slate-200 whitespace-nowrap">
                                    <Square size={14}/> Καθαρισμός
                                </button>
                            </div>
                        </div>

                        {/* ITEMS LIST */}
                        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-2">
                             {filteredRows.map((row) => {
                                 const product = products.find(p => p.sku === row.sku);
                                 const originalIndex = row.originalIndex;
                                 const currentSend = toSendQuantities[originalIndex] || 0;
                                 const isFullySent = row.remainingQty === 0;

                                 // Variants styling
                                 const { finish, stone } = getVariantComponents(row.variant_suffix || '', row.gender);

                                 return (
                                     <div key={originalIndex} className={`bg-white p-3 rounded-2xl border transition-all flex items-center justify-between gap-4 ${currentSend > 0 ? 'border-emerald-400 shadow-md ring-1 ring-emerald-500/20' : 'border-slate-100 hover:border-slate-300'}`}>
                                         {/* Product Info */}
                                         <div className="flex items-center gap-3 min-w-0 flex-1">
                                             <div className="w-12 h-12 bg-slate-50 rounded-xl overflow-hidden shrink-0 border border-slate-100">
                                                 {product?.image_url ? <img src={product.image_url} className="w-full h-full object-cover"/> : <ImageIcon size={20} className="m-auto text-slate-300"/>}
                                             </div>
                                             <div className="min-w-0">
                                                 <div className="flex items-baseline gap-1.5">
                                                     <span className="font-black text-slate-800 text-sm">{row.sku}</span>
                                                     <span className="text-xs font-bold text-slate-500">{finish.code}{stone.code}</span>
                                                 </div>
                                                 <div className="text-[10px] text-slate-400 font-bold uppercase truncate">{product?.category} {row.size_info && `• ${row.size_info}`}</div>
                                                 {/* Status Bar */}
                                                 <div className="flex gap-2 mt-1">
                                                     {row.readyQty > 0 && <span className="text-[9px] bg-emerald-50 text-emerald-700 px-1.5 rounded font-bold">{row.readyQty} Έτοιμα</span>}
                                                     {row.inProgressQty > 0 && <span className="text-[9px] bg-blue-50 text-blue-700 px-1.5 rounded font-bold">{row.inProgressQty} Ενεργά</span>}
                                                 </div>
                                             </div>
                                         </div>

                                         {/* Quantity Controls */}
                                         {isFullySent ? (
                                             <div className="px-4 py-2 bg-slate-50 rounded-xl text-xs font-bold text-slate-400 border border-slate-100 whitespace-nowrap">
                                                 Ολοκληρώθηκε
                                             </div>
                                         ) : (
                                             <div className="flex flex-col items-end gap-1">
                                                 <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Υπόλοιπο: {row.remainingQty}</div>
                                                 <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-xl border border-slate-200">
                                                     <button onClick={() => updateToSend(originalIndex, currentSend - 1)} className="w-8 h-8 flex items-center justify-center bg-white rounded-lg shadow-sm text-slate-600 hover:text-slate-900 active:scale-95 transition-transform"><Minus size={14}/></button>
                                                     <input 
                                                         type="number" 
                                                         min="0" max={row.remainingQty} 
                                                         value={currentSend} 
                                                         onChange={(e) => updateToSend(originalIndex, parseInt(e.target.value)||0)}
                                                         className="w-10 text-center font-black text-lg bg-transparent outline-none text-slate-800"
                                                     />
                                                     <button onClick={() => updateToSend(originalIndex, currentSend + 1)} className="w-8 h-8 flex items-center justify-center bg-white rounded-lg shadow-sm text-slate-600 hover:text-slate-900 active:scale-95 transition-transform"><Plus size={14}/></button>
                                                 </div>
                                             </div>
                                         )}
                                     </div>
                                 );
                             })}
                             {filteredRows.length === 0 && <div className="text-center py-10 text-slate-400 italic">Δεν βρέθηκαν είδη με τα επιλεγμένα φίλτρα.</div>}
                        </div>
                    </div>

                    {/* RIGHT PANEL: SUMMARY & HISTORY */}
                    <div className="w-full lg:w-[400px] xl:w-[450px] bg-white flex flex-col shrink-0 border-t lg:border-t-0 lg:border-l border-slate-100 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] z-20">
                        
                        {/* Current Selection Summary */}
                        <div className="p-6 bg-slate-900 text-white flex flex-col gap-4 shrink-0">
                            <h3 className="font-bold uppercase text-xs tracking-widest text-slate-400 flex items-center gap-2">
                                <Wallet size={14}/> Τρέχουσα Αποστολή
                            </h3>
                            <div className="flex justify-between items-end">
                                <div>
                                    <div className="text-4xl font-black tracking-tight">{totalToSend} <span className="text-lg font-medium text-slate-400">τεμ</span></div>
                                    <div className="text-xs text-slate-400 font-bold mt-1">Επιλεγμένα Είδη</div>
                                </div>
                                <div className="text-right">
                                    <div className="text-2xl font-black text-emerald-400">{formatCurrency(currentSendValue)}</div>
                                    <div className="text-[10px] text-slate-500 font-bold uppercase">Καθαρη Αξια</div>
                                </div>
                            </div>
                            
                            <button 
                                onClick={handleSend}
                                disabled={isSending || totalToSend === 0}
                                className="w-full py-4 bg-white text-slate-900 rounded-2xl font-black text-lg shadow-lg hover:bg-emerald-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 active:scale-95"
                            >
                                {isSending ? <Loader2 className="animate-spin"/> : <Factory size={20}/>}
                                {isSending ? 'Αποστολή...' : 'Εκκίνηση Παραγωγής'}
                            </button>
                        </div>

                        {/* History Feed - Hidden on Mobile to save space, Visible on Desktop */}
                        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-white hidden lg:block">
                            <h3 className="font-bold text-slate-800 uppercase text-xs tracking-widest mb-4 flex items-center gap-2">
                                <History size={14} className="text-blue-500"/> Ιστορικό Αποστολών
                            </h3>
                            
                            <div className="space-y-4">
                                {historyGroups.map((group, idx) => (
                                    <div key={idx} className="relative pl-4 border-l-2 border-slate-100 pb-2">
                                        <div className="absolute -left-[5px] top-0 w-2.5 h-2.5 rounded-full bg-blue-500 border-2 border-white shadow-sm"/>
                                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                            <div className="flex justify-between items-start mb-2">
                                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                                    {group.date.toLocaleDateString('el-GR')} • {group.date.toLocaleTimeString('el-GR', {hour: '2-digit', minute:'2-digit'})}
                                                </span>
                                                <span className="bg-blue-100 text-blue-700 text-[10px] font-black px-2 py-0.5 rounded-full">
                                                    Part {historyGroups.length - idx}
                                                </span>
                                            </div>
                                            <div className="flex justify-between items-end">
                                                <div>
                                                    <div className="text-xl font-black text-slate-800">{group.qty} <span className="text-xs font-bold text-slate-400">τεμ</span></div>
                                                </div>
                                                <div className="font-mono font-bold text-slate-600">
                                                    {formatCurrency(group.value)}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {historyGroups.length === 0 && (
                                    <div className="text-center py-10 text-slate-300 italic text-sm">
                                        Καμία προηγούμενη αποστολή.
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Order Stats */}
                        <div className="p-6 bg-slate-50 border-t border-slate-100 hidden sm:block">
                             <div className="flex justify-between text-xs text-slate-500 mb-1">
                                 <span>Σύνολο Παραγγελίας:</span>
                                 <span className="font-bold text-slate-900">{order.items.reduce((s,i)=>s+i.quantity,0)}</span>
                             </div>
                             <div className="flex justify-between text-xs text-slate-500 mb-1">
                                 <span>Στάλθηκαν:</span>
                                 <span className="font-bold text-blue-600">{totalSent}</span>
                             </div>
                             <div className="flex justify-between text-xs text-slate-500">
                                 <span>Απομένουν (Συνολικά):</span>
                                 <span className="font-bold text-amber-600">{totalRemaining}</span>
                             </div>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    );
}
