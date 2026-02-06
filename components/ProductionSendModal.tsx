
import React, { useState, useMemo } from 'react';
import { Order, Product, ProductionBatch, Material, ProductionStage, OrderItem, Collection, Gender, ProductionType } from '../types';
import { X, Factory, CheckCircle, AlertTriangle, Loader2, ArrowRight, Clock, StickyNote, History, Package, Box, Info, PauseCircle, User, ShoppingCart, RefreshCw, ImageIcon, Minus, Plus, Filter, Wallet, CheckSquare, Square, Coins, Layers, Hash, Search, Printer, Scissors, Trash2, Split, Merge, RefreshCcw, FileText, AlertCircle, Save } from 'lucide-react';
import { api, supabase } from '../lib/supabase';
import { useUI } from './UIProvider';
import { formatCurrency, formatDecimal, getVariantComponents } from '../utils/pricingEngine';
import { useQueryClient } from '@tanstack/react-query';

interface Props {
    order: Order;
    products: Product[];
    materials: Material[];
    existingBatches: ProductionBatch[];
    collections?: Collection[];
    onClose: () => void;
    onSuccess: () => void;
    onPrintAggregated?: (batches: ProductionBatch[], orderDetails?: { orderId: string, customerName: string }) => void;
}

const STAGES = [
    { id: ProductionStage.AwaitingDelivery, label: 'Αναμονή', color: 'bg-indigo-50 border-indigo-200 text-indigo-700' },
    { id: ProductionStage.Waxing, label: 'Λάστιχα/Κεριά', color: 'bg-slate-100 border-slate-200 text-slate-700' },
    { id: ProductionStage.Casting, label: 'Χυτήριο', color: 'bg-orange-50 border-orange-200 text-orange-700' },
    { id: ProductionStage.Setting, label: 'Καρφωτής', color: 'bg-purple-50 border-purple-200 text-purple-700' },
    { id: ProductionStage.Polishing, label: 'Τεχνίτης', color: 'bg-blue-50 border-blue-200 text-blue-700' },
    { id: ProductionStage.Labeling, label: 'Συσκευασία', color: 'bg-yellow-50 border-yellow-200 text-yellow-700' },
    { id: ProductionStage.Ready, label: 'Έτοιμα', color: 'bg-emerald-50 border-emerald-200 text-emerald-700' }
];

const FINISH_COLORS: Record<string, string> = {
    'X': 'text-amber-500', 
    'P': 'text-slate-500', 
    'D': 'text-orange-500', 
    'H': 'text-cyan-400', 
    '': 'text-slate-400'
};

const STONE_TEXT_COLORS: Record<string, string> = {
    'KR': 'text-rose-600', 'QN': 'text-slate-900', 'LA': 'text-blue-600', 'TY': 'text-teal-500',
    'TG': 'text-orange-700', 'IA': 'text-red-700', 'BSU': 'text-slate-800', 'GSU': 'text-emerald-800',
    'RSU': 'text-rose-800', 'MA': 'text-emerald-600', 'FI': 'text-slate-400', 'OP': 'text-indigo-500',
    'NF': 'text-green-700', 'CO': 'text-teal-600', 'TPR': 'text-emerald-500', 'TKO': 'text-rose-600',
    'TMP': 'text-blue-600', 'PCO': 'text-emerald-400', 'MCO': 'text-purple-500', 'PAX': 'text-green-600',
    'MAX': 'text-blue-700', 'KAX': 'text-red-700', 'AI': 'text-slate-600', 'AP': 'text-cyan-600',
    'AM': 'text-teal-700', 'LR': 'text-indigo-700', 'BST': 'text-sky-400', 'MP': 'text-blue-400',
    'LE': 'text-slate-400', 'PR': 'text-green-500', 'KO': 'text-red-500', 'MV': 'text-purple-400',
    'RZ': 'text-pink-500', 'AK': 'text-cyan-300', 'XAL': 'text-stone-400'
};

const SkuColored = ({ sku, suffix, gender }: { sku: string, suffix?: string, gender: any }) => {
    const { finish, stone } = getVariantComponents(suffix || '', gender);
    const fColor = FINISH_COLORS[finish.code] || 'text-slate-400';
    const sColor = STONE_TEXT_COLORS[stone.code] || 'text-emerald-500';

    return (
        <span className="font-black">
            <span className="text-slate-900">{sku}</span>
            <span className={fColor}>{finish.code}</span>
            <span className={sColor}>{stone.code}</span>
        </span>
    );
};

interface RowItem extends OrderItem {
    readyQty: number;
    inProgressQty: number;
    remainingQty: number;
    toSendQty: number;
    batchDetails: ProductionBatch[];
    gender?: Gender;
    collectionId?: number;
    price: number; 
    originalIndex: number;
}

// Group batches by their created_at timestamp to simulate "Shipments"
const groupBatchesByShipment = (batches: ProductionBatch[]) => {
    const groups: Record<string, ProductionBatch[]> = {};
    batches.forEach(b => {
        // Group by minute to catch batches created in the same "Send" action
        const timeKey = new Date(b.created_at).toISOString().slice(0, 16); // "YYYY-MM-DDTHH:mm"
        if (!groups[timeKey]) groups[timeKey] = [];
        groups[timeKey].push(b);
    });
    // Sort keys descending (newest first)
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
};

export default function ProductionSendModal({ order, products, materials, existingBatches, collections, onClose, onSuccess, onPrintAggregated }: Props) {
    const { showToast, confirm } = useUI();
    const queryClient = useQueryClient();
    const [isSending, setIsSending] = useState(false);
    const [isWorking, setIsWorking] = useState(false); // Global blocker for internal actions
    
    const [filterGender, setFilterGender] = useState<'All' | Gender>('All');
    const [filterCollection, setFilterCollection] = useState<number | 'All'>('All');
    const [searchTerm, setSearchTerm] = useState('');
    const [toSendQuantities, setToSendQuantities] = useState<Record<number, number>>({});

    // Split Modal State
    const [splitTarget, setSplitTarget] = useState<{ batch: ProductionBatch, maxQty: number } | null>(null);
    const [splitQty, setSplitQty] = useState(1);
    const [splitStage, setSplitStage] = useState<ProductionStage>(ProductionStage.Waxing);

    // Note Editing State
    const [editingNoteBatch, setEditingNoteBatch] = useState<ProductionBatch | null>(null);
    const [noteText, setNoteText] = useState('');

    // Order Financials
    const vatRate = order.vat_rate !== undefined ? order.vat_rate : 0.24;
    const discountFactor = 1 - ((order.discount_percent || 0) / 100);

    const rows = useMemo(() => {
        const mapped = order.items.map((item, index) => {
            const product = products.find(p => p.sku === item.sku);
            
            const relevantBatches = existingBatches.filter(b => 
                b.sku === item.sku && 
                (b.variant_suffix || '') === (item.variant_suffix || '') &&
                (b.size_info || '') === (item.size_info || '')
            ).sort((a, b) => {
                const stages = Object.values(ProductionStage);
                return stages.indexOf(a.current_stage) - stages.indexOf(b.current_stage);
            });

            const readyQty = relevantBatches
                .filter(b => b.current_stage === ProductionStage.Ready)
                .reduce((s, b) => s + b.quantity, 0);
            
            const inProgressQty = relevantBatches
                .filter(b => b.current_stage !== ProductionStage.Ready)
                .reduce((s, b) => s + b.quantity, 0);

            const sentTotal = readyQty + inProgressQty;
            const remainingQty = Math.max(0, item.quantity - sentTotal);

            return {
                ...item,
                readyQty,
                inProgressQty,
                remainingQty,
                toSendQty: remainingQty,
                batchDetails: relevantBatches,
                gender: product?.gender || 'Unknown',
                collectionId: product?.collections?.[0],
                price: item.price_at_order,
                originalIndex: index
            } as RowItem;
        });

        // 1. Sort Alphabetically by SKU
        return mapped.sort((a, b) => {
            const skuA = a.sku + (a.variant_suffix || '');
            const skuB = b.sku + (b.variant_suffix || '');
            return skuA.localeCompare(skuB, undefined, { numeric: true });
        });
    }, [order.items, existingBatches, products]);

    const totalRemaining = useMemo(() => rows.reduce((s, r) => s + r.remainingQty, 0), [rows]);

    const shipmentHistory = useMemo(() => groupBatchesByShipment(existingBatches), [existingBatches]);

    const relevantCollections = useMemo(() => {
        if (!collections) return [];
        const orderCollectionIds = new Set<number>();
        order.items.forEach(item => {
            const product = products.find(p => p.sku === item.sku);
            product?.collections?.forEach(id => orderCollectionIds.add(id));
        });
        return collections.filter(c => orderCollectionIds.has(c.id));
    }, [collections, order.items, products]);

    const filteredRows = useMemo(() => {
        return rows.filter(row => {
            if (filterGender !== 'All' && row.gender !== filterGender) return false;
            if (filterCollection !== 'All') {
                 const product = products.find(p => p.sku === row.sku);
                 if (!product?.collections?.includes(filterCollection)) return false;
            }
            if (searchTerm) {
                const term = searchTerm.toLowerCase();
                const product = products.find(p => p.sku === row.sku);
                const matchesSku = row.sku.toLowerCase().includes(term);
                const matchesSuffix = (row.variant_suffix || '').toLowerCase().includes(term);
                const matchesCategory = product?.category?.toLowerCase().includes(term) || false;
                if (!matchesSku && !matchesSuffix && !matchesCategory) return false;
            }
            return true;
        });
    }, [rows, filterGender, filterCollection, products, searchTerm]);

    const currentSendValue = useMemo(() => {
        return rows.reduce((sum, row, idx) => {
            const qty = toSendQuantities[idx] || 0;
            return sum + (qty * row.price * discountFactor);
        }, 0);
    }, [rows, toSendQuantities, discountFactor]);

    const totalToSend = (Object.values(toSendQuantities) as number[]).reduce((a, b) => a + b, 0);

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
            if (row.remainingQty > 0) newQuantities[row.originalIndex] = row.remainingQty;
        });
        setToSendQuantities(newQuantities);
    };

    const handleClearSelection = () => setToSendQuantities({});

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
            await queryClient.invalidateQueries({ queryKey: ['batches'] });
            await queryClient.invalidateQueries({ queryKey: ['orders'] });
            showToast(`Επιτυχής αποστολή ${itemsToSend.length} ειδών.`, "success");
            setToSendQuantities({}); // Reset inputs but keep modal open
        } catch (e) {
            showToast("Σφάλμα κατά την αποστολή.", "error");
        } finally {
            setIsSending(false);
        }
    };

    // --- BATCH MANAGEMENT ACTIONS ---

    const handleStageMove = async (batch: ProductionBatch, newStage: ProductionStage) => {
        if (isWorking) return;
        setIsWorking(true);
        try {
            await api.updateBatchStage(batch.id, newStage);
            await queryClient.invalidateQueries({ queryKey: ['batches'] });
            showToast("Η παρτίδα μετακινήθηκε.", "success");
        } catch (e) {
            showToast("Σφάλμα ενημέρωσης.", "error");
        } finally {
            setIsWorking(false);
        }
    };

    const handleDeleteBatch = async (batch: ProductionBatch) => {
        if (isWorking) return;
        if (!await confirm({ title: 'Διαγραφή', message: `Διαγραφή παρτίδας (${batch.quantity} τεμ);`, isDestructive: true })) return;
        
        setIsWorking(true);
        try {
            await api.deleteProductionBatch(batch.id);
            await queryClient.invalidateQueries({ queryKey: ['batches'] });
            showToast("Η παρτίδα διαγράφηκε.", "info");
        } catch (e) {
            showToast("Σφάλμα διαγραφής.", "error");
        } finally {
            setIsWorking(false);
        }
    };

    const handleMergeBatches = async (stage: ProductionStage, batchesToMerge: ProductionBatch[]) => {
        if (isWorking) return;
        if (batchesToMerge.length < 2) return;
        
        const totalQty = batchesToMerge.reduce((sum, b) => sum + b.quantity, 0);
        
        const yes = await confirm({
            title: 'Συγχώνευση Παρτίδων',
            message: `Θα συγχωνευθούν ${batchesToMerge.length} παρτίδες στο στάδιο "${STAGES.find(s => s.id === stage)?.label}" σε μία ενιαία παρτίδα των ${totalQty} τεμαχίων.`,
            confirmText: 'Συγχώνευση'
        });
        
        if (!yes) return;

        setIsWorking(true);
        try {
            const target = batchesToMerge[0];
            const sourceIds = batchesToMerge.slice(1).map(b => b.id);
            
            await api.mergeBatches(target.id, sourceIds, totalQty);
            await queryClient.invalidateQueries({ queryKey: ['batches'] });
            
            showToast("Επιτυχής συγχώνευση.", "success");
        } catch (e) {
            console.error(e);
            showToast("Σφάλμα συγχώνευσης.", "error");
        } finally {
            setIsWorking(false);
        }
    };

    const handleSaveNote = async () => {
        if (!editingNoteBatch) return;
        setIsWorking(true);
        try {
            const { error } = await supabase
                .from('production_batches')
                .update({ notes: noteText || null, updated_at: new Date().toISOString() })
                .eq('id', editingNoteBatch.id);
            
            if (error) throw error;

            await queryClient.invalidateQueries({ queryKey: ['batches'] });
            showToast("Η σημείωση ενημερώθηκε.", "success");
            setEditingNoteBatch(null);
        } catch (e) {
            showToast("Σφάλμα ενημέρωσης.", "error");
        } finally {
            setIsWorking(false);
        }
    };

    const openSplitModal = (batch: ProductionBatch) => {
        setSplitTarget({ batch, maxQty: batch.quantity });
        setSplitQty(1);
        
        // Default target stage to the next logical stage
        const currIdx = STAGES.findIndex(s => s.id === batch.current_stage);
        const nextIdx = Math.min(STAGES.length - 1, currIdx + 1);
        setSplitStage(STAGES[nextIdx].id as ProductionStage);
    };

    const handleSplit = async () => {
        if (!splitTarget) return;
        if (splitQty >= splitTarget.maxQty) {
             // Just move if qty is full
             await handleStageMove(splitTarget.batch, splitStage);
             setSplitTarget(null);
             return;
        }
        
        setIsWorking(true);
        try {
            const originalNewQty = splitTarget.maxQty - splitQty;
            const batch = splitTarget.batch;
            
            // Prepare new batch object
            // Use existing batch properties but update stage, qty, id
            // Ensure we strictly copy only DB columns to avoid errors
            const newBatchData = {
                id: crypto.randomUUID(),
                order_id: batch.order_id,
                sku: batch.sku,
                variant_suffix: batch.variant_suffix,
                quantity: splitQty,
                current_stage: splitStage,
                created_at: batch.created_at, // Preserve creation time for tracking
                updated_at: new Date().toISOString(),
                priority: batch.priority,
                type: batch.type,
                notes: batch.notes,
                requires_setting: batch.requires_setting,
                size_info: batch.size_info,
                on_hold: false
            };

            await api.splitBatch(batch.id, originalNewQty, newBatchData);
            await queryClient.invalidateQueries({ queryKey: ['batches'] });
            
            showToast(`Διαχωρισμός ${splitQty} τεμ. επιτυχής.`, "success");
            setSplitTarget(null);
        } catch (e) {
            showToast("Σφάλμα διαχωρισμού.", "error");
        } finally {
            setIsWorking(false);
        }
    };

    // Helper to group batches by stage for rendering
    const groupBatchesByStage = (batches: ProductionBatch[]) => {
        const groups: Record<string, ProductionBatch[]> = {};
        batches.forEach(b => {
            if (!groups[b.current_stage]) groups[b.current_stage] = [];
            groups[b.current_stage].push(b);
        });
        return groups;
    };

    return (
        <div className="fixed inset-0 z-[200] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 animate-in fade-in zoom-in-95">
            <div className="bg-white w-full h-full max-w-[1600px] sm:h-[92vh] sm:rounded-[2rem] shadow-2xl flex flex-col overflow-hidden border border-slate-200 relative">
                
                {isWorking && (
                    <div className="absolute inset-0 bg-white/50 backdrop-blur-[2px] z-50 flex items-center justify-center">
                        <Loader2 className="animate-spin text-slate-800" size={48} />
                    </div>
                )}

                {/* HEADER */}
                <div className="p-6 border-b border-slate-100 bg-white sticky top-0 z-10 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-[#060b00] text-white rounded-2xl shadow-lg hidden sm:block">
                            <Factory size={28}/>
                        </div>
                        <div>
                            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Διαχείριση Παραγωγής</h2>
                            <div className="flex items-center gap-3 text-sm font-bold text-slate-500 mt-0.5">
                                <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-100">#{order.id.slice(0, 8)}</span>
                                <span className="flex items-center gap-1 truncate max-w-[200px]"><User size={14}/> {order.customer_name}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div className="flex gap-2">
                        {order.notes && (
                            <div className="hidden lg:flex items-center gap-2 bg-yellow-50 text-yellow-800 px-4 py-2 rounded-xl border border-yellow-100 mr-2 max-w-md truncate" title={order.notes}>
                                <AlertCircle size={16} className="shrink-0"/>
                                <span className="text-xs font-bold truncate">{order.notes}</span>
                            </div>
                        )}
                        <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"><X size={24}/></button>
                    </div>
                </div>

                <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
                    
                    {/* LEFT PANEL: ORDER ITEMS & ACTIVE BATCHES */}
                    <div className="flex-1 flex flex-col min-h-0 bg-slate-50/50">
                        
                        {/* FILTERS */}
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

                                {relevantCollections.length > 0 && (
                                    <select 
                                        value={filterCollection} 
                                        onChange={(e) => setFilterCollection(e.target.value === 'All' ? 'All' : parseInt(e.target.value))}
                                        className="bg-white border border-slate-200 text-slate-700 text-xs font-bold py-2 pl-3 pr-8 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer shrink-0 max-w-[150px]"
                                    >
                                        <option value="All">Συλλογές Εντολής</option>
                                        {relevantCollections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                )}

                                <div className="relative group shrink-0">
                                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={14} />
                                    <input 
                                        type="text" 
                                        placeholder="Αναζήτηση..." 
                                        value={searchTerm} 
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="pl-8 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500/20 w-32 focus:w-48 transition-all text-slate-700 placeholder:text-slate-400"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* LIST */}
                        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-4">
                             {filteredRows.map((row) => {
                                 const product = products.find(p => p.sku === row.sku);
                                 const originalIndex = row.originalIndex;
                                 const currentSend = toSendQuantities[originalIndex] || 0;
                                 const isFullySent = row.remainingQty === 0;
                                 
                                 // Group batches by stage for layout
                                 const batchesByStage = groupBatchesByStage(row.batchDetails);
                                 // Sort stages based on defined order
                                 const sortedStages = Object.keys(batchesByStage).sort((a,b) => {
                                     const idxA = STAGES.findIndex(s => s.id === a);
                                     const idxB = STAGES.findIndex(s => s.id === b);
                                     return idxA - idxB;
                                 });

                                 return (
                                     <div key={originalIndex} className="bg-white p-4 rounded-2xl border border-slate-100 hover:border-slate-300 transition-all shadow-sm">
                                         
                                         {/* TOP: Item Info & Send Controls */}
                                         <div className="flex items-center justify-between gap-4 mb-4">
                                             <div className="flex items-center gap-3 min-w-0 flex-1">
                                                 <div className="w-12 h-12 bg-slate-50 rounded-xl overflow-hidden shrink-0 border border-slate-100">
                                                     {product?.image_url ? <img src={product.image_url} className="w-full h-full object-cover"/> : <ImageIcon size={20} className="m-auto text-slate-300"/>}
                                                 </div>
                                                 <div className="min-w-0 flex-1">
                                                     <div className="flex items-baseline gap-1.5">
                                                         <SkuColored sku={row.sku} suffix={row.variant_suffix} gender={row.gender} />
                                                         {row.size_info && <span className="text-[9px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-100 font-bold flex items-center gap-0.5"><Hash size={8} /> {row.size_info}</span>}
                                                     </div>
                                                     <div className="text-[10px] text-slate-400 font-bold uppercase truncate mt-0.5">{product?.category}</div>
                                                     
                                                     {/* DISPLAY ROW NOTE */}
                                                     {row.notes && (
                                                         <div className="mt-1.5 flex items-start gap-1 p-1.5 bg-yellow-50 text-yellow-800 rounded border border-yellow-100 max-w-fit">
                                                             <StickyNote size={10} className="shrink-0 mt-0.5"/>
                                                             <span className="text-[10px] font-bold italic leading-tight">{row.notes}</span>
                                                         </div>
                                                     )}
                                                 </div>
                                             </div>

                                             {/* Send Controls */}
                                             {isFullySent ? (
                                                 <div className="px-3 py-1.5 bg-slate-50 rounded-lg text-xs font-bold text-slate-400 border border-slate-100 whitespace-nowrap flex items-center gap-1">
                                                     <CheckCircle size={12}/> Ολοκληρώθηκε
                                                 </div>
                                             ) : (
                                                 <div className="flex flex-col items-end gap-1">
                                                     <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Προς Αποστολή (Max: {row.remainingQty})</div>
                                                     <div className="flex items-center gap-1 bg-blue-50 p-1 rounded-xl border border-blue-100">
                                                         <button onClick={() => updateToSend(originalIndex, currentSend - 1)} className="w-8 h-8 flex items-center justify-center bg-white rounded-lg shadow-sm text-blue-600 hover:text-blue-900 active:scale-95 transition-transform"><Minus size={14}/></button>
                                                         <input type="number" min="0" max={row.remainingQty} value={currentSend} onChange={(e) => updateToSend(originalIndex, parseInt(e.target.value)||0)} className="w-10 text-center font-black text-lg bg-transparent outline-none text-blue-900"/>
                                                         <button onClick={() => updateToSend(originalIndex, currentSend + 1)} className="w-8 h-8 flex items-center justify-center bg-white rounded-lg shadow-sm text-blue-600 hover:text-blue-900 active:scale-95 transition-transform"><Plus size={14}/></button>
                                                     </div>
                                                 </div>
                                             )}
                                         </div>

                                         {/* BOTTOM: Active Batches Management */}
                                         {row.batchDetails.length > 0 && (
                                             <div className="pt-3 border-t border-slate-100 space-y-3">
                                                 <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                                                     <RefreshCw size={10}/> Ενεργές Παρτίδες ({row.batchDetails.length})
                                                 </div>
                                                 
                                                 {sortedStages.map(stageId => {
                                                     const stageBatches = batchesByStage[stageId];
                                                     const stageLabel = STAGES.find(s => s.id === stageId)?.label || stageId;
                                                     
                                                     return (
                                                         <div key={stageId} className="space-y-1">
                                                             {/* Stage Header with optional Merge Button */}
                                                             <div className="flex items-center justify-between px-1">
                                                                 <span className="text-[10px] font-bold text-slate-500 uppercase">{stageLabel}</span>
                                                                 {stageBatches.length > 1 && (
                                                                     <button 
                                                                        onClick={() => handleMergeBatches(stageId as ProductionStage, stageBatches)}
                                                                        className="flex items-center gap-1 text-[9px] font-black bg-purple-50 text-purple-700 px-2 py-0.5 rounded border border-purple-100 hover:bg-purple-100 transition-colors"
                                                                     >
                                                                         <Merge size={10}/> Συγχώνευση ({stageBatches.length})
                                                                     </button>
                                                                 )}
                                                             </div>

                                                             {stageBatches.map(batch => {
                                                                 const stageConf = STAGES.find(s => s.id === batch.current_stage) || STAGES[0];
                                                                 
                                                                 // Calculate value for this specific batch
                                                                 const batchRow = rows.find(r => r.sku === batch.sku && r.variant_suffix === batch.variant_suffix);
                                                                 const unitPrice = batchRow?.price || 0;
                                                                 const batchVal = unitPrice * batch.quantity * discountFactor;

                                                                 return (
                                                                     <div key={batch.id} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg border border-slate-100 text-xs">
                                                                         <div className="flex items-center gap-3">
                                                                             <span className="font-black text-slate-800 bg-white px-2 py-1 rounded border border-slate-200 shadow-sm w-10 text-center">{batch.quantity}</span>
                                                                             
                                                                             {/* Stage Selector */}
                                                                             <div className="relative group">
                                                                                 <select 
                                                                                     value={batch.current_stage} 
                                                                                     onChange={(e) => handleStageMove(batch, e.target.value as ProductionStage)}
                                                                                     className={`appearance-none pl-2 pr-6 py-1 rounded font-bold uppercase outline-none cursor-pointer ${stageConf.color} border-transparent focus:ring-2 focus:ring-blue-200`}
                                                                                 >
                                                                                     {STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                                                                                 </select>
                                                                                 <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-1 text-current opacity-60">
                                                                                     <svg className="fill-current h-3 w-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                                                                                 </div>
                                                                             </div>
                                                                             
                                                                             {/* Batch Note */}
                                                                             {batch.notes && (
                                                                                 <div className="text-[9px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100 font-bold flex items-center gap-1" title={batch.notes}>
                                                                                     <StickyNote size={10}/> {batch.notes}
                                                                                 </div>
                                                                             )}
                                                                         </div>
                                                                         
                                                                         <div className="flex gap-1 items-center">
                                                                             <span className="text-[10px] font-mono text-slate-400 mr-2">{formatCurrency(batchVal)}</span>
                                                                             <button 
                                                                                 onClick={() => { setEditingNoteBatch(batch); setNoteText(batch.notes || ''); }}
                                                                                 className={`p-1.5 rounded transition-colors ${batch.notes ? 'text-amber-600 bg-amber-50 hover:bg-amber-100' : 'text-slate-300 hover:text-slate-500 hover:bg-slate-50'}`}
                                                                                 title="Σημειώσεις"
                                                                             >
                                                                                 <StickyNote size={14} className={batch.notes ? "fill-current" : ""}/>
                                                                             </button>
                                                                             {batch.current_stage !== ProductionStage.Ready && (
                                                                                 <button 
                                                                                     onClick={() => openSplitModal(batch)} 
                                                                                     className="p-1.5 text-blue-500 hover:bg-blue-100 rounded transition-colors" 
                                                                                     title="Διαχωρισμός"
                                                                                 >
                                                                                     <Split size={14}/>
                                                                                 </button>
                                                                             )}
                                                                             <button 
                                                                                 onClick={() => handleDeleteBatch(batch)} 
                                                                                 className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors" 
                                                                                 title="Διαγραφή"
                                                                             >
                                                                                 <Trash2 size={14}/>
                                                                             </button>
                                                                         </div>
                                                                     </div>
                                                                 );
                                                             })}
                                                         </div>
                                                     );
                                                 })}
                                             </div>
                                         )}
                                     </div>
                                 );
                             })}
                             {filteredRows.length === 0 && <div className="text-center py-10 text-slate-400 italic">Δεν βρέθηκαν είδη.</div>}
                        </div>
                    </div>

                    {/* RIGHT PANEL: SUMMARY & HISTORY */}
                    <div className="w-full lg:w-[450px] bg-white flex flex-col shrink-0 border-t lg:border-t-0 lg:border-l border-slate-100 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] z-20">
                        
                        {/* 1. CURRENT SEND SUMMARY */}
                        <div className="p-6 bg-[#060b00] text-white flex flex-col gap-4 shrink-0">
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
                        
                        {/* 2. HISTORY / SHIPMENTS */}
                        <div className="flex-1 overflow-y-auto p-4 bg-slate-50 border-t border-slate-900 space-y-4">
                            <h3 className="font-bold text-slate-500 uppercase text-xs tracking-widest mb-2 flex items-center gap-2">
                                <History size={14}/> Ιστορικό Αποστολών
                            </h3>
                            
                            {shipmentHistory.length > 0 ? shipmentHistory.map(([dateKey, batches]) => {
                                const totalItems = batches.reduce((acc, b) => acc + b.quantity, 0);
                                
                                // Calculate Shipment Financials
                                let shipNet = 0;
                                batches.forEach(b => {
                                     const item = order.items.find(i => i.sku === b.sku && i.variant_suffix === b.variant_suffix);
                                     if(item) {
                                         shipNet += (item.price_at_order * b.quantity * discountFactor);
                                     }
                                });
                                const shipVat = shipNet * vatRate;
                                const shipTotal = shipNet + shipVat;
                                
                                const prettyDate = new Date(dateKey).toLocaleDateString('el-GR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

                                return (
                                    <div key={dateKey} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:border-blue-300 transition-colors group">
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="text-xs font-black text-slate-800 uppercase tracking-wide">{prettyDate}</div>
                                            <div className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">{totalItems} τεμ.</div>
                                        </div>
                                        
                                        <div className="space-y-1 mb-3">
                                            <div className="flex justify-between text-xs text-slate-500">
                                                <span>Καθαρή:</span>
                                                <span className="font-mono font-bold">{formatCurrency(shipNet)}</span>
                                            </div>
                                            <div className="flex justify-between text-xs text-slate-500">
                                                <span>ΦΠΑ ({(vatRate * 100).toFixed(0)}%):</span>
                                                <span className="font-mono font-bold">{formatCurrency(shipVat)}</span>
                                            </div>
                                            <div className="flex justify-between text-sm font-black text-slate-800 border-t border-slate-100 pt-1 mt-1">
                                                <span>Σύνολο:</span>
                                                <span>{formatCurrency(shipTotal)}</span>
                                            </div>
                                        </div>
                                        
                                        {onPrintAggregated && (
                                            <button 
                                                onClick={() => onPrintAggregated(batches, { orderId: order.id, customerName: order.customer_name })}
                                                className="w-full py-2 bg-slate-50 hover:bg-blue-50 text-blue-600 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-colors"
                                            >
                                                <FileText size={14}/> Εκτύπωση Δελτίου
                                            </button>
                                        )}
                                    </div>
                                );
                            }) : (
                                <div className="text-center py-8 text-slate-400 italic text-xs">
                                    Δεν υπάρχουν προηγούμενες αποστολές.
                                </div>
                            )}
                        </div>

                        {/* 3. TOTALS FOOTER */}
                        <div className="p-4 bg-white border-t border-slate-200">
                             <div className="flex gap-2 w-full mb-4">
                                <button onClick={handleSelectVisible} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-100 text-blue-700 rounded-xl text-xs font-bold hover:bg-blue-200 transition-colors border border-blue-200 whitespace-nowrap shadow-sm">
                                    <CheckSquare size={14}/> Επιλογή Ορατών
                                </button>
                                <button onClick={handleClearSelection} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-white text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-100 transition-colors border border-slate-200 whitespace-nowrap shadow-sm">
                                    <Square size={14}/> Καθαρισμός
                                </button>
                            </div>
                            
                            <div className="space-y-2 text-xs pt-2 border-t border-slate-100">
                                <div className="flex justify-between items-center text-slate-500">
                                    <span>Σύνολο Παραγγελίας:</span>
                                    <span className="font-bold text-slate-900">{order.items.reduce((s,i)=>s+i.quantity,0)}</span>
                                </div>
                                <div className="flex justify-between items-center text-slate-500">
                                    <span>Σε Παραγωγή / Έτοιμα:</span>
                                    <span className="font-bold text-blue-600">{rows.reduce((s, r) => s + r.inProgressQty + r.readyQty, 0)}</span>
                                </div>
                                <div className="flex justify-between items-center text-slate-500">
                                    <span>Υπόλοιπο:</span>
                                    <span className="font-bold text-amber-600">{totalRemaining}</span>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            </div>

            {/* SPLIT MODAL OVERLAY */}
            {splitTarget && (
                <div className="fixed inset-0 z-[250] bg-black/60 flex items-center justify-center p-4 animate-in fade-in">
                    <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl animate-in zoom-in-95 space-y-4">
                        <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                            <h3 className="font-black text-lg text-slate-800 flex items-center gap-2"><Scissors className="text-blue-500"/> Διαχωρισμός</h3>
                            <button onClick={() => setSplitTarget(null)}><X size={20} className="text-slate-400"/></button>
                        </div>
                        
                        <div className="text-center">
                            <div className="text-xs font-bold text-slate-400 uppercase mb-1">Μετακίνηση Ποσότητας</div>
                            <div className="flex items-center justify-center gap-4">
                                <button onClick={() => setSplitQty(Math.max(1, splitQty - 1))} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-bold text-xl text-slate-600 hover:bg-slate-200">-</button>
                                <span className="text-3xl font-black text-slate-900 w-16">{splitQty}</span>
                                <button onClick={() => setSplitQty(Math.min(splitTarget.maxQty, splitQty + 1))} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-bold text-xl text-slate-600 hover:bg-slate-200">+</button>
                            </div>
                            <div className="text-[10px] text-slate-400 mt-1 font-bold">από {splitTarget.maxQty} διαθέσιμα</div>
                        </div>

                        <div>
                            <label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-1 block">Σε Στάδιο</label>
                            <select 
                                value={splitStage}
                                onChange={(e) => setSplitStage(e.target.value as ProductionStage)}
                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 outline-none"
                            >
                                {STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                            </select>
                        </div>

                        <button onClick={handleSplit} className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold shadow-lg active:scale-95 transition-transform flex items-center justify-center gap-2">
                            <Split size={18}/> Εκτέλεση
                        </button>
                    </div>
                </div>
            )}
            
            {/* NOTE EDIT MODAL */}
            {editingNoteBatch && (
                <div className="fixed inset-0 z-[260] bg-black/60 flex items-center justify-center p-4 animate-in fade-in">
                    <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl animate-in zoom-in-95 space-y-4">
                        <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                            <h3 className="font-black text-lg text-slate-800 flex items-center gap-2"><StickyNote className="text-amber-500"/> Σημείωση</h3>
                            <button onClick={() => setEditingNoteBatch(null)}><X size={20} className="text-slate-400"/></button>
                        </div>
                        
                        <div>
                            <label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-1 block">Κείμενο</label>
                            <textarea 
                                value={noteText}
                                onChange={(e) => setNoteText(e.target.value)}
                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 outline-none h-32 resize-none"
                                placeholder="Γράψτε μια σημείωση..."
                                autoFocus
                            />
                        </div>

                        <button onClick={handleSaveNote} className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold shadow-lg active:scale-95 transition-transform flex items-center justify-center gap-2">
                            <Save size={18}/> Αποθήκευση
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
