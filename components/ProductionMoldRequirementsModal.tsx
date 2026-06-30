import React, { useState, useMemo } from 'react';
import { ProductionBatch, Order, Product, Mold, OrderStatus, ProductionStage } from '../types';
import { Search, X, CheckSquare, Square, MapPin, Grid, CheckCircle2, Flame, SlidersHorizontal, Layers, AlertCircle } from 'lucide-react';
import { getVariantComponents } from '../utils/pricingEngine';
import { PRODUCTION_STAGE_META } from '../utils/productionStages';

// ─── Stage filter types & definitions ────────────────────────────────────────

type StageFilterId =
    | 'AwaitingDelivery'
    | 'Waxing'
    | 'Casting'
    | 'Setting'
    | 'Polishing_pending'
    | 'Polishing_dispatched'
    | 'Assembly';

interface StageDef {
    id: StageFilterId;
    label: string;
    shortLabel: string;
    stage: ProductionStage;
    pendingDispatch: boolean | null; // null = don't filter on pending_dispatch
    bg: string; text: string; border: string;
    activeBg: string; activeText: string; activeBorder: string;
    dotBg: string;
}

// Labels & colors aligned with ProductionPage STAGE_DISPLAY / production board
const STAGE_DEFS: StageDef[] = [
    {
        id: 'AwaitingDelivery',
        label: PRODUCTION_STAGE_META[ProductionStage.AwaitingDelivery].label,
        shortLabel: 'Αναμονή',
        stage: ProductionStage.AwaitingDelivery, pendingDispatch: null,
        bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200',
        activeBg: 'bg-indigo-600', activeText: 'text-white', activeBorder: 'border-indigo-600',
        dotBg: 'bg-indigo-400',
    },
    {
        id: 'Waxing',
        label: PRODUCTION_STAGE_META[ProductionStage.Waxing].label,
        shortLabel: 'Διαλογή',
        stage: ProductionStage.Waxing, pendingDispatch: null,
        bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200',
        activeBg: 'bg-slate-600', activeText: 'text-white', activeBorder: 'border-slate-600',
        dotBg: 'bg-slate-400',
    },
    {
        id: 'Casting',
        label: PRODUCTION_STAGE_META[ProductionStage.Casting].label,
        shortLabel: 'Χυτήριο',
        stage: ProductionStage.Casting, pendingDispatch: null,
        bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200',
        activeBg: 'bg-orange-500', activeText: 'text-white', activeBorder: 'border-orange-500',
        dotBg: 'bg-orange-400',
    },
    {
        id: 'Setting',
        label: PRODUCTION_STAGE_META[ProductionStage.Setting].label,
        shortLabel: 'Καρφωτής',
        stage: ProductionStage.Setting, pendingDispatch: null,
        bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200',
        activeBg: 'bg-purple-600', activeText: 'text-white', activeBorder: 'border-purple-600',
        dotBg: 'bg-purple-400',
    },
    {
        id: 'Polishing_pending',
        label: 'Αναμονή Αποστολής',
        shortLabel: 'Αναμ. Αποστ.',
        stage: ProductionStage.Polishing, pendingDispatch: true,
        bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200',
        activeBg: 'bg-teal-600', activeText: 'text-white', activeBorder: 'border-teal-600',
        dotBg: 'bg-teal-500',
    },
    {
        id: 'Polishing_dispatched',
        label: 'Στον Τεχνίτη',
        shortLabel: 'Στον Τεχ.',
        stage: ProductionStage.Polishing, pendingDispatch: false,
        bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200',
        activeBg: 'bg-blue-600', activeText: 'text-white', activeBorder: 'border-blue-600',
        dotBg: 'bg-blue-500',
    },
    {
        id: 'Assembly',
        label: PRODUCTION_STAGE_META[ProductionStage.Assembly].label,
        shortLabel: 'Συναρμ.',
        stage: ProductionStage.Assembly, pendingDispatch: null,
        bg: 'bg-pink-50', text: 'text-pink-700', border: 'border-pink-200',
        activeBg: 'bg-pink-600', activeText: 'text-white', activeBorder: 'border-pink-600',
        dotBg: 'bg-pink-400',
    },
];

// Stages excluded from analysis — no waxing/molds needed at these points
const EXCLUDED_STAGES = new Set<ProductionStage>([ProductionStage.Ready, ProductionStage.Labeling]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getStageDef(batch: ProductionBatch): StageDef | undefined {
    return STAGE_DEFS.find(def => {
        if (batch.current_stage !== def.stage) return false;
        if (def.pendingDispatch === null) return true;
        if (def.pendingDispatch === true) return !!batch.pending_dispatch;
        return !batch.pending_dispatch; // pendingDispatch === false → dispatched (false or undefined)
    });
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
    isOpen: boolean;
    onClose: () => void;
    orders: Order[];
    batches: ProductionBatch[];
    products: Product[];
    molds: Mold[];
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ProductionMoldRequirementsModal({ isOpen, onClose, orders, batches, products, molds }: Props) {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
    const [selectedStageIds, setSelectedStageIds] = useState<Set<StageFilterId>>(new Set()); // empty = all stages

    // Orders that have at least one non-excluded active batch
    const relevantOrders = useMemo(() => {
        const orderIdsWithActiveBatches = new Set(
            batches
                .filter(b => !EXCLUDED_STAGES.has(b.current_stage) && b.order_id)
                .map(b => b.order_id as string)
        );
        return orders
            .filter(o =>
                orderIdsWithActiveBatches.has(o.id) &&
                o.status !== OrderStatus.Delivered &&
                o.status !== OrderStatus.Cancelled
            )
            .filter(o =>
                o.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                o.id.includes(searchTerm)
            )
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }, [orders, batches, searchTerm]);

    // Per-order stage counts for the mini-indicators in order cards
    const orderStageCounts = useMemo(() => {
        const result: Record<string, Partial<Record<StageFilterId, number>>> = {};
        batches.forEach(b => {
            if (!b.order_id || EXCLUDED_STAGES.has(b.current_stage)) return;
            const def = getStageDef(b);
            if (!def) return;
            if (!result[b.order_id]) result[b.order_id] = {};
            result[b.order_id][def.id] = (result[b.order_id][def.id] || 0) + 1;
        });
        return result;
    }, [batches]);

    // Which stages actually have data for the current order selection
    const activeStagesWithData = useMemo(() => {
        const result = new Set<StageFilterId>();
        if (selectedOrderIds.size === 0) return result;
        batches
            .filter(b => b.order_id && selectedOrderIds.has(b.order_id) && !EXCLUDED_STAGES.has(b.current_stage))
            .forEach(b => {
                const def = getStageDef(b);
                if (def) result.add(def.id);
            });
        return result;
    }, [selectedOrderIds, batches]);

    // Aggregate mold requirements, respecting both order and stage filters
    const aggregation = useMemo(() => {
        const acc: Record<string, {
            code: string; desc: string; loc: string; total: number;
            byFinish: Record<string, number>;
            byStageId: Partial<Record<StageFilterId, number>>;
        }> = {};

        if (selectedOrderIds.size === 0) return [];

        const orderBatches = batches.filter(b => b.order_id && selectedOrderIds.has(b.order_id));
        const activeBatches = orderBatches.filter(b => !EXCLUDED_STAGES.has(b.current_stage));
        const filteredBatches = selectedStageIds.size === 0
            ? activeBatches
            : activeBatches.filter(b => {
                const def = getStageDef(b);
                return def && selectedStageIds.has(def.id);
            });

        filteredBatches.forEach(batch => {
            const product = products.find(p => p.sku === batch.sku);
            if (!product?.molds?.length) return;

            const { finish } = getVariantComponents(batch.variant_suffix || '', product.gender);
            const finishKey = finish.code || 'STD';
            const stageDef = getStageDef(batch);

            product.molds.forEach(pm => {
                if (!acc[pm.code]) {
                    const moldDetails = molds.find(m => m.code === pm.code);
                    acc[pm.code] = {
                        code: pm.code,
                        desc: moldDetails?.description || '',
                        loc: moldDetails?.location || '-',
                        total: 0, byFinish: {}, byStageId: {},
                    };
                }
                const qtyNeeded = pm.quantity * batch.quantity;
                acc[pm.code].total += qtyNeeded;
                acc[pm.code].byFinish[finishKey] = (acc[pm.code].byFinish[finishKey] || 0) + qtyNeeded;
                if (stageDef) {
                    acc[pm.code].byStageId[stageDef.id] = (acc[pm.code].byStageId[stageDef.id] || 0) + qtyNeeded;
                }
            });
        });

        return Object.values(acc).sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
    }, [selectedOrderIds, selectedStageIds, batches, products, molds]);

    const totalWaxes = aggregation.reduce((sum, item) => sum + item.total, 0);

    const toggleOrder = (id: string) => {
        const next = new Set(selectedOrderIds);
        if (next.has(id)) next.delete(id); else next.add(id);
        setSelectedOrderIds(next);
    };

    const toggleAll = () => {
        if (selectedOrderIds.size === relevantOrders.length) {
            setSelectedOrderIds(new Set());
        } else {
            setSelectedOrderIds(new Set(relevantOrders.map(o => o.id)));
        }
    };

    const toggleStage = (id: StageFilterId) => {
        const next = new Set(selectedStageIds);
        if (next.has(id)) next.delete(id); else next.add(id);
        setSelectedStageIds(next);
    };

    const getFinishStyle = (key: string) => {
        switch (key) {
            case 'X': return 'bg-amber-100 text-amber-800 border-amber-200';
            case 'P': return 'bg-slate-200 text-slate-700 border-slate-300';
            case 'D': return 'bg-orange-100 text-orange-800 border-orange-200';
            case 'H': return 'bg-cyan-100 text-cyan-800 border-cyan-200';
            default: return 'bg-emerald-50 text-emerald-700 border-emerald-200';
        }
    };

    if (!isOpen) return null;

    const isAllStages = selectedStageIds.size === 0;

    return (
        <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-7xl h-[88vh] rounded-[2rem] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200">

                {/* ── Header ── */}
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-indigo-50/60 to-white shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-sm">
                            <Grid size={20} />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-slate-900">Ανάλυση Κεριών & Λαστίχων</h2>
                            <p className="text-xs text-slate-500 font-medium mt-0.5">
                                Επιλέξτε παραγγελίες και στάδια — εξαιρούνται αυτόματα τα <span className="font-bold text-emerald-600">Έτοιμα</span> και τα <span className="font-bold text-yellow-600">Καρτελάκια</span>.
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors">
                        <X size={22} />
                    </button>
                </div>

                <div className="flex-1 flex overflow-hidden">

                    {/* ── LEFT: Order Selector ── */}
                    <div className="w-[340px] bg-slate-50 border-r border-slate-200 flex flex-col shrink-0">
                        <div className="p-3 border-b border-slate-200 space-y-2.5">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                                <input
                                    type="text"
                                    placeholder="Αναζήτηση πελάτη ή κωδικού..."
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 transition-all"
                                />
                            </div>
                            <button
                                onClick={toggleAll}
                                className="flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-indigo-600 transition-colors w-full"
                            >
                                {selectedOrderIds.size === relevantOrders.length && relevantOrders.length > 0
                                    ? <CheckSquare size={14} className="text-indigo-600" />
                                    : <Square size={14} />}
                                Επιλογή Όλων
                                <span className="ml-auto bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded font-black text-[10px]">
                                    {relevantOrders.length}
                                </span>
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar p-2.5 space-y-1.5">
                            {relevantOrders.map(order => {
                                const isSelected = selectedOrderIds.has(order.id);
                                const stageCounts = orderStageCounts[order.id] || {};
                                const stageEntries = STAGE_DEFS.filter(def => (stageCounts[def.id] || 0) > 0);

                                return (
                                    <div
                                        key={order.id}
                                        onClick={() => toggleOrder(order.id)}
                                        className={`p-3 rounded-xl border cursor-pointer transition-all ${isSelected
                                            ? 'bg-white border-indigo-400 shadow-sm ring-1 ring-indigo-400/20'
                                            : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'
                                        }`}
                                    >
                                        <div className="flex items-start gap-2.5">
                                            <div className={`mt-0.5 shrink-0 ${isSelected ? 'text-indigo-600' : 'text-slate-300'}`}>
                                                {isSelected
                                                    ? <CheckCircle2 size={16} className="fill-indigo-50" />
                                                    : <div className="w-4 h-4 rounded-full border-2 border-slate-300" />}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="font-bold text-slate-800 text-sm truncate leading-tight">{order.customer_name}</div>
                                                <div className="text-[10px] font-mono text-slate-400 mt-0.5">#{order.id.slice(0, 8)}</div>
                                                {stageEntries.length > 0 && (
                                                    <div className="flex flex-wrap gap-1 mt-2">
                                                        {stageEntries.map(def => (
                                                            <div
                                                                key={def.id}
                                                                className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-bold ${def.bg} ${def.text} ${def.border}`}
                                                            >
                                                                <div className={`w-1.5 h-1.5 rounded-full ${def.dotBg}`} />
                                                                {def.shortLabel}
                                                                <span className="font-black">{stageCounts[def.id]}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                            {relevantOrders.length === 0 && (
                                <div className="text-center py-10 text-slate-400">
                                    <AlertCircle size={32} className="mx-auto mb-2 opacity-30" />
                                    <p className="text-sm font-medium">Δεν βρέθηκαν ενεργές εντολές</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ── RIGHT: Stage Filter + Results ── */}
                    <div className="flex-1 flex flex-col overflow-hidden">

                        {/* Stage Filter Bar */}
                        <div className="px-5 py-3 bg-white border-b border-slate-100 shrink-0">
                            <div className="flex items-center gap-2 mb-2.5">
                                <SlidersHorizontal size={13} className="text-slate-400" />
                                <span className="text-[11px] font-black text-slate-500 uppercase tracking-wider">Φίλτρο Σταδίων</span>
                                {!isAllStages && (
                                    <button
                                        onClick={() => setSelectedStageIds(new Set())}
                                        className="ml-auto flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-800 transition-colors px-2 py-0.5 bg-indigo-50 rounded-lg border border-indigo-100"
                                    >
                                        <X size={9} /> Επαναφορά
                                    </button>
                                )}
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {/* "All" pill */}
                                <button
                                    onClick={() => setSelectedStageIds(new Set())}
                                    className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${isAllStages
                                        ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                                        : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
                                    }`}
                                >
                                    Όλα
                                </button>

                                {/* Per-stage pills */}
                                {STAGE_DEFS.map(def => {
                                    const isActive = selectedStageIds.has(def.id);
                                    const hasData = activeStagesWithData.has(def.id);
                                    return (
                                        <button
                                            key={def.id}
                                            onClick={() => toggleStage(def.id)}
                                            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all flex items-center gap-1.5 ${isActive
                                                ? `${def.activeBg} ${def.activeText} ${def.activeBorder} shadow-sm`
                                                : hasData
                                                    ? `${def.bg} ${def.text} ${def.border} hover:shadow-sm`
                                                    : 'bg-slate-50 text-slate-300 border-slate-100 opacity-50 cursor-default'
                                            }`}
                                        >
                                            <div className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-white/70' : def.dotBg}`} />
                                            {def.shortLabel}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {aggregation.length > 0 ? (
                            <>
                                {/* Stats Bar */}
                                <div className="px-5 py-2.5 bg-slate-50/60 border-b border-slate-100 flex items-center gap-3 shrink-0">
                                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-xl border border-indigo-100 font-bold text-sm">
                                        <Grid size={14} />
                                        <span>{aggregation.length} Λάστιχα</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-700 rounded-xl border border-amber-100 font-bold text-sm">
                                        <Flame size={14} />
                                        <span>{totalWaxes} Κεριά</span>
                                    </div>
                                    {!isAllStages && (
                                        <div className="flex items-center gap-1 text-xs text-slate-400 font-medium">
                                            <Layers size={12} />
                                            {selectedStageIds.size} {selectedStageIds.size === 1 ? 'στάδιο' : 'στάδια'} επιλεγμένα
                                        </div>
                                    )}
                                </div>

                                {/* Mold Grid */}
                                <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
                                    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                                        {aggregation.map(item => {
                                            const stagesPresent = STAGE_DEFS.filter(def => (item.byStageId[def.id] || 0) > 0);
                                            return (
                                                <div key={item.code} className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden hover:shadow-md hover:border-slate-300 transition-all">
                                                    {/* Mold header */}
                                                    <div className="p-3.5 flex justify-between items-start">
                                                        <div>
                                                            <div className="font-black text-2xl text-slate-900 leading-none tracking-tight">{item.code}</div>
                                                            {item.desc && (
                                                                <div className="text-[10px] font-medium text-slate-400 mt-0.5 leading-tight">{item.desc}</div>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500 bg-slate-50 px-2 py-1 rounded-lg border border-slate-200 shrink-0">
                                                            <MapPin size={10} className="text-slate-400" /> {item.loc}
                                                        </div>
                                                    </div>

                                                    {/* Stage breakdown */}
                                                    {stagesPresent.length > 0 && (
                                                        <div className="px-3 pb-2 flex flex-wrap gap-1">
                                                            {stagesPresent.map(def => (
                                                                <div
                                                                    key={def.id}
                                                                    className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-bold ${def.bg} ${def.text} ${def.border}`}
                                                                >
                                                                    <div className={`w-1.5 h-1.5 rounded-full ${def.dotBg}`} />
                                                                    {def.shortLabel}
                                                                    <span className="font-black">{item.byStageId[def.id]}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}

                                                    <div className="mx-3 border-t border-slate-50" />

                                                    {/* Finish breakdown */}
                                                    <div className="p-3 flex-1 space-y-1">
                                                        {Object.entries(item.byFinish).map(([key, qty]) => (
                                                            <div key={key} className={`flex items-center justify-between px-2 py-1 rounded-lg border text-xs font-bold ${getFinishStyle(key)}`}>
                                                                <span>{key === 'STD' ? 'ΒΑΣΙΚΟ' : key}</span>
                                                                <span className="font-black">{qty}</span>
                                                            </div>
                                                        ))}
                                                    </div>

                                                    {/* Total footer */}
                                                    <div className="px-3.5 pb-3.5 pt-1 flex items-center justify-between border-t border-slate-50">
                                                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                                                            <Flame size={11} className="text-amber-400" />
                                                            Κεριά
                                                        </div>
                                                        <div className="text-2xl font-black text-slate-800">{item.total}</div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8">
                                {selectedOrderIds.size === 0 ? (
                                    <>
                                        <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                                            <Grid size={36} className="opacity-20" />
                                        </div>
                                        <p className="font-bold text-slate-600 text-lg">Επιλέξτε παραγγελίες</p>
                                        <p className="text-sm text-slate-400 mt-1 text-center max-w-xs">Επιλέξτε μία ή περισσότερες παραγγελίες από τα αριστερά για να δείτε τα απαιτούμενα κεριά και λάστιχα.</p>
                                    </>
                                ) : (
                                    <>
                                        <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                                            <Layers size={36} className="opacity-20" />
                                        </div>
                                        <p className="font-bold text-slate-600 text-lg">Δεν βρέθηκαν αποτελέσματα</p>
                                        <p className="text-sm text-slate-400 mt-1 text-center max-w-xs">Δεν υπάρχουν παρτίδες στα επιλεγμένα στάδια (εξαιρούνται αυτόματα Έτοιμα και Καρτελάκια).</p>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

