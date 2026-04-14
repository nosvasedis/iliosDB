
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { RETAIL_CUSTOMER_ID, RETAIL_CUSTOMER_NAME } from '../lib/supabase';
import { ProductionBatch, ProductionStage, Product, Material, MaterialType, Mold, ProductionType, Gender, ProductVariant, Order, OrderStatus, AssemblyPrintData, AssemblyPrintRow, StageBatchPrintData } from '../types';
import { Factory, Flame, Gem, Hammer, Tag, Package, ChevronRight, Clock, Siren, CheckCircle, ImageIcon, Printer, FileText, Layers, ChevronDown, RefreshCcw, ArrowRight, ArrowUp, ArrowDown, X, Loader2, Globe, BookOpen, Truck, AlertTriangle, ChevronUp, MoveRight, Activity, Search, User, Users, StickyNote, Hash, Save, Edit, FolderKanban, Palette, PauseCircle, PlayCircle, Calendar, CheckSquare, Square, Check, Trash2, ClipboardList, Grid, Maximize2, Minimize2 } from 'lucide-react';
import { useUI } from './UIProvider';
import DesktopPageHeader from './DesktopPageHeader';
import { useAuth } from './AuthContext';
import SkuColorizedText from './SkuColorizedText';
import BatchBuildModal from './BatchBuildModal';
import ProductionSendModal from './ProductionSendModal';
import BatchHistoryModal from './BatchHistoryModal';
import ProductionHealthPanel from './production/ProductionHealthPanel';
import { getVariantComponents } from '../utils/pricingEngine';
import { formatOrderId } from '../utils/orderUtils';
import { ProductionBatchCard } from './ProductionBatchCard';
import ProductionOverviewModal from './ProductionOverviewModal';
import { EnhancedProductionBatch } from '../types';
import { extractRetailClientFromNotes } from '../utils/retailNotes';
import { requiresAssemblyStage } from '../constants';
import { getSpecialCreationProductStub, isSpecialCreationSku } from '../utils/specialCreationSku';
import ProductionMoldRequirementsModal from './ProductionMoldRequirementsModal';
import { buildProductionAlertGroups } from './production/productionAlerts';
import { invalidateOrdersAndBatches, invalidateProductionBatches } from '../lib/queryInvalidation';
import { PRODUCTION_STAGES, getProductionStageLabel, getProductionStageShortLabel } from '../utils/productionStages';
import { getFinderSearchResultSurface } from '../utils/productionFinderSurfaces';
import {
    formatGreekDurationFromMs,
    getProductionTimingInfo,
    getProductionTimingStatusClasses,
    getProductionTimingStatusLabel,
} from '../utils/productionTiming';
import {
    buildBatchStageHistoryMap,
    getBatchAgeInfo,
    getBatchStageChronologyTimestamp,
} from '../features/production/selectors';
import { useCollections } from '../hooks/api/useCollections';
import { useOrders } from '../hooks/api/useOrders';
import { useProductionBatches, useBatchStageHistoryEntries } from '../hooks/api/useProductionBatches';
import { productionRepository } from '../features/production';
import { auditRepository } from '../features/audit';
import {
    buildLabelPrintQueue,
    filterAndSortProductionFinderBatches,
    getNextProductionStage,
    groupProductionBatchesByStage,
    groupProductionBatchesForDisplay,
    sortProductionDisplayLevel1Keys,
    type LabelPrintSortMode,
} from '../features/production/workflowSelectors';

function compareBatchesBySkuAscending(a: ProductionBatch, b: ProductionBatch): number {
    return `${a.sku}${a.variant_suffix || ''}`.localeCompare(
        `${b.sku}${b.variant_suffix || ''}`,
        undefined,
        { numeric: true, sensitivity: 'base' }
    );
}

interface Props {
    products: Product[];
    materials: Material[];
    molds: Mold[];
    onPrintAggregated: (batches: ProductionBatch[]) => void;
    onPrintPreparation: (batches: ProductionBatch[]) => void;
    onPrintTechnician: (batches: ProductionBatch[]) => void;
    onPrintAssembly?: (data: AssemblyPrintData) => void;
    onPrintLabels?: (items: { product: Product; variant?: ProductVariant; quantity: number, size?: string, format?: 'standard' | 'simple' | 'retail' }[]) => void;
    onPrintStageBatches?: (data: StageBatchPrintData) => void;
}

const STAGE_ICONS: Record<ProductionStage, React.ReactNode> = {
    [ProductionStage.AwaitingDelivery]: <Globe size={20} />,
    [ProductionStage.Waxing]: <Package size={20} />,
    [ProductionStage.Casting]: <Flame size={20} />,
    [ProductionStage.Setting]: <Gem size={20} />,
    [ProductionStage.Polishing]: <Hammer size={20} />,
    [ProductionStage.Assembly]: <Layers size={20} />,
    [ProductionStage.Labeling]: <Tag size={20} />,
    [ProductionStage.Ready]: <CheckCircle size={20} />
};

const STAGES = PRODUCTION_STAGES.map((stage) => ({
    id: stage.id,
    label: stage.label,
    icon: STAGE_ICONS[stage.id],
    color: stage.colorKey
}));

const STAGE_COLORS = {
    indigo: { bg: 'bg-indigo-100/40', text: 'text-indigo-700', border: 'border-indigo-200', ring: 'ring-indigo-100', header: 'bg-indigo-100/50' },
    slate: { bg: 'bg-slate-100/40', text: 'text-slate-700', border: 'border-slate-200', ring: 'ring-slate-100', header: 'bg-slate-100/50' },
    orange: { bg: 'bg-orange-100/40', text: 'text-orange-700', border: 'border-orange-200', ring: 'ring-orange-100', header: 'bg-orange-100/50' },
    purple: { bg: 'bg-purple-100/40', text: 'text-purple-700', border: 'border-purple-200', ring: 'ring-purple-100', header: 'bg-purple-100/50' },
    blue: { bg: 'bg-blue-100/40', text: 'text-blue-700', border: 'border-blue-200', ring: 'ring-blue-100', header: 'bg-blue-100/50' },
    pink: { bg: 'bg-pink-100/40', text: 'text-pink-700', border: 'border-pink-200', ring: 'ring-pink-100', header: 'bg-pink-100/50' },
    yellow: { bg: 'bg-yellow-100/40', text: 'text-yellow-700', border: 'border-yellow-200', ring: 'ring-yellow-100', header: 'bg-yellow-100/50' },
    emerald: { bg: 'bg-emerald-100/40', text: 'text-emerald-700', border: 'border-emerald-200', ring: 'ring-emerald-100', header: 'bg-emerald-100/50' },
};

// Gender Display Config
const GENDER_CONFIG: Record<string, { label: string, style: string }> = {
    [Gender.Women]: { label: 'Γυναικεία', style: 'bg-pink-50 text-pink-700 border-pink-200 ring-pink-100' },
    [Gender.Men]: { label: 'Ανδρικά', style: 'bg-blue-50 text-blue-700 border-blue-200 ring-blue-100' },
    [Gender.Unisex]: { label: 'Unisex / Άλλα', style: 'bg-slate-100 text-slate-600 border-slate-200 ring-slate-100' },
    'Unknown': { label: 'Ακατηγοριοποίητα', style: 'bg-gray-50 text-gray-600 border-gray-200 ring-gray-100' }
};

type PrintSelectorType = 'technician' | 'preparation' | 'aggregated' | 'labels' | 'assembly' | 'stagePdf';

type PrintSelectorState = {
    isOpen: boolean;
    type: PrintSelectorType | '';
    batches: EnhancedProductionBatch[];
    stageMeta?: { stageId: ProductionStage; stageName: string };
};
type ProductionQuickPickEntry = {
    order: Order;
    batchesCount: number;
    totalQty: number;
    readyQty: number;
    inProgressQty: number;
    latestUpdate: number;
    stageBreakdown: Record<string, number>; // stage -> quantity
};

type AssemblyOrderCandidate = {
    order: Order;
    rows: AssemblyPrintRow[];
    assemblySkuCount: number;
    totalAssemblyQty: number;
};

// ── DesktopSettingStoneModal ─────────────────────────────────────────────────
const DesktopSettingStoneModal: React.FC<{
    batches: Array<ProductionBatch & { product_details?: Product; customer_name?: string }>;
    orders: Order[];
    allProducts: Product[];
    allMaterials: Material[];
    onClose: () => void;
}> = ({ batches, orders, allProducts, allMaterials, onClose }) => {
    const settingBatches = batches.filter(b => b.current_stage === ProductionStage.Setting);

    const orderGroups = useMemo(() => {
        const map = new Map<string, typeof settingBatches>();
        settingBatches.forEach(b => {
            const key = b.order_id || '__none__';
            const arr = map.get(key) || [];
            arr.push(b);
            map.set(key, arr);
        });
        return map;
    }, [settingBatches]);

    const orderList = useMemo(() =>
        Array.from(orderGroups.entries()).map(([key, bs]) => {
            const order = key !== '__none__' ? orders.find(o => o.id === key) : null;
            return {
                key,
                orderId: key !== '__none__' ? key : null,
                customerName: order?.customer_name || (bs[0] as any)?.customer_name || 'Χωρίς Πελάτη',
                batchCount: bs.length,
            };
        }), [orderGroups, orders]);

    const [selectedOrderKey, setSelectedOrderKey] = useState<string | null>(
        () => orderGroups.size === 1 ? Array.from(orderGroups.keys())[0] : null
    );

    const stones = useMemo(() => {
        if (!selectedOrderKey) return [];
        const orderBatches = orderGroups.get(selectedOrderKey) || [];
        const stoneMap = new Map<string, { name: string; description?: string; quantity: number; unit: string }>();

        orderBatches.forEach(batch => {
            const product = allProducts.find(p => p.sku === batch.sku);
            if (!product) return;

            let hasRecipeStones = false;
            product.recipe.forEach(item => {
                if (item.type !== 'raw') return;
                const mat = allMaterials.find(m => m.id === item.id);
                if (!mat || mat.type !== MaterialType.Stone) return;
                hasRecipeStones = true;
                const totalQty = item.quantity * batch.quantity;
                const existing = stoneMap.get(mat.id);
                if (existing) existing.quantity += totalQty;
                else stoneMap.set(mat.id, { name: mat.name, description: mat.description, quantity: totalQty, unit: mat.unit || 'τεμ' });
            });

            if (!hasRecipeStones) {
                const { stone } = getVariantComponents(batch.variant_suffix || '', product.gender);
                if (stone.code) {
                    const sfxKey = `sfx_${stone.code}`;
                    const existing = stoneMap.get(sfxKey);
                    if (existing) existing.quantity += batch.quantity;
                    else stoneMap.set(sfxKey, { name: stone.name || stone.code, quantity: batch.quantity, unit: 'τεμ' });
                }
            }
        });
        return Array.from(stoneMap.values()).sort((a, b) => b.quantity - a.quantity);
    }, [selectedOrderKey, orderGroups, allProducts, allMaterials]);

    const selectedBatches = selectedOrderKey ? (orderGroups.get(selectedOrderKey) || []) : [];
    const selectedOrderInfo = orderList.find(o => o.key === selectedOrderKey);

    return (
        <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in" onClick={onClose}>
            <div
                className="bg-white w-full max-w-4xl max-h-[85vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex-shrink-0 px-6 py-4 border-b border-slate-100 bg-purple-50/60 flex items-center justify-between rounded-t-3xl">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-100 rounded-xl">
                            <Gem size={20} className="text-purple-700" />
                        </div>
                        <div>
                            <h3 className="font-black text-slate-900 text-lg">Πέτρες Καρφωτή</h3>
                            <p className="text-xs text-slate-500 font-medium">{settingBatches.length} παρτίδες στο στάδιο Καρφωτής</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-400 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Body: Two-column layout */}
                <div className="flex flex-1 min-h-0">
                    {/* Left: Order List */}
                    <div className="w-64 shrink-0 border-r border-slate-100 flex flex-col bg-slate-50/50">
                        <div className="px-4 py-3 border-b border-slate-100">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Παραγγελίες</p>
                        </div>
                        <div className="flex-1 overflow-y-auto p-3 space-y-1.5 custom-scrollbar">
                            {orderList.map(order => (
                                <button
                                    key={order.key}
                                    onClick={() => setSelectedOrderKey(order.key)}
                                    className={`w-full text-left rounded-xl px-3 py-3 border transition-all ${
                                        selectedOrderKey === order.key
                                            ? 'bg-purple-50 border-purple-300 shadow-sm'
                                            : 'bg-white border-slate-200 hover:border-purple-200 hover:bg-purple-50/30'
                                    }`}
                                >
                                    <div className={`font-bold text-sm leading-tight ${
                                        selectedOrderKey === order.key ? 'text-purple-900' : 'text-slate-800'
                                    }`}>{order.customerName}</div>
                                    {order.orderId && (
                                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">#{formatOrderId(order.orderId)}</div>
                                    )}
                                    <div className={`text-[10px] font-black mt-1 ${
                                        selectedOrderKey === order.key ? 'text-purple-600' : 'text-slate-400'
                                    }`}>{order.batchCount} παρτίδες</div>
                                </button>
                            ))}
                            {orderList.length === 0 && (
                                <p className="text-center text-xs text-slate-400 italic py-8">Κανένα στάδιο Καρφωτή</p>
                            )}
                        </div>
                    </div>

                    {/* Right: Stone Details */}
                    <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                        {!selectedOrderKey ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-400/60 py-12">
                                <Gem size={44} className="mb-3 text-purple-200" />
                                <p className="font-bold text-sm text-slate-400">Επιλέξτε παραγγελία για να δείτε τις πέτρες</p>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {/* Order Info */}
                                <div>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
                                        Παρτίδες — {selectedOrderInfo?.customerName}
                                        {selectedOrderInfo?.orderId && (
                                            <span className="text-slate-300 ml-1">#{formatOrderId(selectedOrderInfo.orderId)}</span>
                                        )}
                                    </p>
                                    <div className="grid grid-cols-2 gap-2">
                                        {selectedBatches.map(b => (
                                            <div key={b.id} className="bg-slate-50 rounded-xl px-3 py-2.5 flex items-center justify-between border border-slate-100">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <SkuColorizedText sku={b.sku} suffix={b.variant_suffix || ''} gender={(b as any).product_details?.gender} className="font-black text-lg" masterClassName="text-slate-800" />
                                                    {b.size_info && (
                                                        <span className="text-[9px] bg-slate-200 px-1.5 rounded-md font-bold text-slate-600 shrink-0">{b.size_info}</span>
                                                    )}
                                                </div>
                                                <span className="text-sm font-black text-slate-700 bg-white border border-slate-100 px-2.5 py-0.5 rounded-xl shadow-sm shrink-0">
                                                    {b.quantity} τμχ
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Stones */}
                                <div>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Απαιτούμενες Πέτρες</p>
                                    {stones.length > 0 ? (
                                        <div className="grid grid-cols-2 gap-3">
                                            {stones.map((stone, i) => (
                                                <div key={i} className="bg-white border border-purple-100 rounded-2xl p-4 flex items-center justify-between shadow-sm ring-1 ring-purple-50">
                                                    <div className="flex-1 min-w-0 pr-4">
                                                        <div className="font-black text-slate-800 text-sm leading-tight">{stone.name}</div>
                                                        {stone.description && (
                                                            <div className="text-xs text-slate-500 font-medium mt-0.5">{stone.description}</div>
                                                        )}
                                                    </div>
                                                    <div className="text-right shrink-0">
                                                        <div className="text-4xl font-black text-purple-700 leading-none">{stone.quantity}</div>
                                                        <div className="text-[10px] text-slate-400 font-bold mt-0.5">{stone.unit}</div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5 text-amber-700 text-sm font-bold text-center">
                                            Δεν βρέθηκαν πέτρες στη Λίστα Υλικών για αυτή την παραγγελία.
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

const PrintSelectorModal = ({ isOpen, onClose, onConfirm, batches, title, labelSortMode, onLabelSortModeChange }: {
    isOpen: boolean,
    onClose: () => void,
    onConfirm: (selected: ProductionBatch[]) => void,
    batches: (ProductionBatch & { customer_name?: string })[],
    title: string,
    labelSortMode?: LabelPrintSortMode,
    onLabelSortModeChange?: (mode: LabelPrintSortMode) => void
}) => {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(batches.map(b => b.id)));
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        if (isOpen) setSelectedIds(new Set(batches.map(b => b.id)));
    }, [isOpen, batches]);

    const groupedBatches = useMemo(() => {
        const groups: Record<string, { name: string, items: typeof batches }> = {};

        batches.forEach(b => {
            const key = b.order_id || 'no_order';
            if (!groups[key]) {
                groups[key] = {
                    name: b.customer_name ? `${b.customer_name} (#${formatOrderId(b.order_id)})` : (b.order_id ? `Order #${formatOrderId(b.order_id)}` : 'Χωρίς Εντολή'),
                    items: []
                };
            }
            groups[key].items.push(b);
        });

        Object.values(groups).forEach(g => {
            g.items.sort(compareBatchesBySkuAscending);
        });

        return Object.entries(groups)
            .sort((a, b) => b[1].items.length - a[1].items.length)
            .filter(([_, group]) => group.name.toLowerCase().includes(searchTerm.toLowerCase()) || group.items.some(i => i.sku.toLowerCase().includes(searchTerm.toLowerCase())));
    }, [batches, searchTerm]);

    const toggleBatch = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    };

    const toggleGroup = (batchIds: string[]) => {
        const allSelected = batchIds.every(id => selectedIds.has(id));
        const next = new Set(selectedIds);
        if (allSelected) {
            batchIds.forEach(id => next.delete(id));
        } else {
            batchIds.forEach(id => next.add(id));
        }
        setSelectedIds(next);
    };

    const toggleAll = () => {
        if (selectedIds.size === batches.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(batches.map(b => b.id)));
        }
    };

    const handleConfirm = () => {
        const selected = batches.filter(b => selectedIds.has(b.id));
        onConfirm(selected);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[230] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-white w-full max-w-2xl max-h-[85vh] rounded-3xl shadow-2xl flex flex-col animate-in zoom-in-95">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div>
                        <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                            <Printer size={20} className="text-blue-600" /> {title}
                        </h3>
                        <p className="text-sm text-slate-500">Επιλέξτε παρτίδες για εκτύπωση ({selectedIds.size} επιλεγμένα)</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-400"><X size={20} /></button>
                </div>

                <div className="p-4 border-b border-slate-100 bg-white flex items-center gap-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input
                            type="text"
                            placeholder="Αναζήτηση εντολής, πελάτη ή SKU..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full pl-9 p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 text-sm font-medium"
                        />
                    </div>
                    <button
                        onClick={toggleAll}
                        className="px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 flex items-center gap-2"
                    >
                        {selectedIds.size === batches.length ? (
                            <><Square size={14} /> Αποεπιλογη ολων</>
                        ) : (
                            <><CheckSquare size={14} /> Επιλογη ολων</>
                        )}
                    </button>
                </div>
                {labelSortMode && onLabelSortModeChange && (
                    <div className="px-4 pb-4 border-b border-slate-100 bg-white">
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2 ml-1">Τρόπος Εκτύπωσης Ετικετών</div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => onLabelSortModeChange('as_sent')}
                                className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-1.5 ${labelSortMode === 'as_sent' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'}`}
                            >
                                <Clock size={13} /> Όπως Στάλθηκαν
                            </button>
                            <button
                                onClick={() => onLabelSortModeChange('customer')}
                                className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-1.5 ${labelSortMode === 'customer' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'}`}
                            >
                                <Users size={13} /> Ανά Πελάτη
                            </button>
                        </div>
                    </div>
                )}

                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-4 bg-slate-50/30">
                    {groupedBatches.map(([key, group]) => {
                        const allSelected = group.items.every(b => selectedIds.has(b.id));
                        const someSelected = group.items.some(b => selectedIds.has(b.id));

                        return (
                            <div key={key} className={`bg-white rounded-xl border transition-all ${allSelected ? 'border-blue-300 ring-1 ring-blue-100' : 'border-slate-200'}`}>
                                <div
                                    className="p-3 border-b border-slate-100 flex items-center gap-3 cursor-pointer hover:bg-slate-50 rounded-t-xl"
                                    onClick={() => toggleGroup(group.items.map(b => b.id))}
                                >
                                    <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${allSelected ? 'bg-blue-600 border-blue-600' : (someSelected ? 'bg-blue-100 border-blue-300' : 'bg-white border-slate-300')}`}>
                                        {allSelected && <Check size={14} className="text-white" />}
                                        {someSelected && !allSelected && <div className="w-2 h-2 bg-blue-600 rounded-sm" />}
                                    </div>
                                    <div className="flex-1">
                                        <div className="font-bold text-slate-800 text-sm">{group.name}</div>
                                        <div className="text-[10px] text-slate-500">{group.items.length} είδη</div>
                                    </div>
                                </div>
                                <div className="p-2 space-y-1">
                                    {group.items.map(item => (
                                        <div
                                            key={item.id}
                                            onClick={() => toggleBatch(item.id)}
                                            className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded-lg cursor-pointer"
                                        >
                                            <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${selectedIds.has(item.id) ? 'bg-blue-500 border-blue-500' : 'bg-white border-slate-300'}`}>
                                                {selectedIds.has(item.id) && <Check size={12} className="text-white" />}
                                            </div>
                                            <div className="flex-1 flex justify-between items-center">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-mono font-bold text-sm text-slate-700">{item.sku}{item.variant_suffix}</span>
                                                    {item.size_info && <span className="text-[9px] bg-slate-100 px-1.5 rounded border border-slate-200 font-bold text-slate-500">{item.size_info}</span>}
                                                </div>
                                                <div className="text-xs font-black bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                                                    {item.quantity} τμχ
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                    {groupedBatches.length === 0 && <div className="text-center py-10 text-slate-400 italic">Δεν βρέθηκαν παρτίδες.</div>}
                </div>

                <div className="p-4 border-t border-slate-100 bg-white flex justify-end gap-3 rounded-b-3xl">
                    <button onClick={onClose} className="px-5 py-2.5 rounded-xl text-slate-600 font-bold hover:bg-slate-100 transition-colors">
                        Ακύρωση
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={selectedIds.size === 0}
                        className="px-6 py-2.5 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        <Printer size={18} /> Εκτύπωση ({selectedIds.size})
                    </button>
                </div>
            </div>
        </div>
    );
};

const QuickProductionPickerModal = ({
    isOpen,
    onClose,
    entries,
    onSelect
}: {
    isOpen: boolean;
    onClose: () => void;
    entries: ProductionQuickPickEntry[];
    onSelect: (order: Order) => void;
}) => {
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        if (isOpen) setSearchTerm('');
    }, [isOpen]);

    const filteredEntries = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        if (!term) return entries;
        return entries.filter(entry =>
            entry.order.customer_name.toLowerCase().includes(term) ||
            entry.order.id.toLowerCase().includes(term)
        );
    }, [entries, searchTerm]);

    // Stage display config with colors and short labels
    const STAGE_DISPLAY: Record<string, { label: string; shortLabel: string; color: string; bgColor: string; borderColor: string }> = {
        [ProductionStage.AwaitingDelivery]: { label: getProductionStageLabel(ProductionStage.AwaitingDelivery), shortLabel: getProductionStageShortLabel(ProductionStage.AwaitingDelivery), color: 'text-indigo-700', bgColor: 'bg-indigo-50', borderColor: 'border-indigo-200' },
        [ProductionStage.Waxing]: { label: getProductionStageLabel(ProductionStage.Waxing), shortLabel: getProductionStageShortLabel(ProductionStage.Waxing), color: 'text-slate-700', bgColor: 'bg-slate-100', borderColor: 'border-slate-200' },
        [ProductionStage.Casting]: { label: getProductionStageLabel(ProductionStage.Casting), shortLabel: getProductionStageShortLabel(ProductionStage.Casting), color: 'text-orange-700', bgColor: 'bg-orange-50', borderColor: 'border-orange-200' },
        [ProductionStage.Setting]: { label: getProductionStageLabel(ProductionStage.Setting), shortLabel: getProductionStageShortLabel(ProductionStage.Setting), color: 'text-purple-700', bgColor: 'bg-purple-50', borderColor: 'border-purple-200' },
        [ProductionStage.Polishing]: { label: getProductionStageLabel(ProductionStage.Polishing), shortLabel: getProductionStageShortLabel(ProductionStage.Polishing), color: 'text-blue-700', bgColor: 'bg-blue-50', borderColor: 'border-blue-200' },
        [ProductionStage.Assembly]: { label: getProductionStageLabel(ProductionStage.Assembly), shortLabel: getProductionStageShortLabel(ProductionStage.Assembly), color: 'text-pink-700', bgColor: 'bg-pink-50', borderColor: 'border-pink-200' },
        [ProductionStage.Labeling]: { label: getProductionStageLabel(ProductionStage.Labeling), shortLabel: getProductionStageShortLabel(ProductionStage.Labeling), color: 'text-yellow-700', bgColor: 'bg-yellow-50', borderColor: 'border-yellow-200' },
        [ProductionStage.Ready]: { label: getProductionStageLabel(ProductionStage.Ready), shortLabel: getProductionStageShortLabel(ProductionStage.Ready), color: 'text-emerald-700', bgColor: 'bg-emerald-50', borderColor: 'border-emerald-200' },
    };

    const STAGE_ORDER = [
        ProductionStage.AwaitingDelivery,
        ProductionStage.Waxing,
        ProductionStage.Casting,
        ProductionStage.Setting,
        ProductionStage.Polishing,
        ProductionStage.Assembly,
        ProductionStage.Labeling,
        ProductionStage.Ready
    ];

    const STAGE_BAR_COLOR: Record<string, string> = {
        [ProductionStage.AwaitingDelivery]: 'bg-indigo-400',
        [ProductionStage.Waxing]: 'bg-slate-400',
        [ProductionStage.Casting]: 'bg-orange-400',
        [ProductionStage.Setting]: 'bg-purple-400',
        [ProductionStage.Polishing]: 'bg-blue-400',
        [ProductionStage.Assembly]: 'bg-pink-400',
        [ProductionStage.Labeling]: 'bg-yellow-400',
        [ProductionStage.Ready]: 'bg-emerald-500',
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[220] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-white w-full max-w-3xl max-h-[88vh] rounded-3xl shadow-2xl border border-slate-100 flex flex-col overflow-hidden animate-in zoom-in-95">
                <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
                    <div>
                        <h3 className="text-lg sm:text-xl font-black text-slate-900 flex items-center gap-2">
                            <Factory size={18} className="text-emerald-600" /> Γρήγορη Διαχείριση Παραγωγής
                        </h3>
                        <p className="text-xs text-slate-500 mt-1">Επίλεξε εντολή για να δεις τις παρτίδες ανά στάδιο.</p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full text-slate-400 hover:bg-slate-200 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-4 border-b border-slate-100">
                    <div className="relative">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Αναζήτηση πελάτη ή εντολής..."
                            className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-3 bg-slate-50/30">
                    {filteredEntries.length > 0 ? (
                        filteredEntries.map(entry => {
                            // Get stages that have items
                            const activeStages = STAGE_ORDER.filter(stage => entry.stageBreakdown[stage] > 0);
                            
                            return (
                                <button
                                    key={entry.order.id}
                                    onClick={() => {
                                        onSelect(entry.order);
                                    }}
                                    className="w-full text-left p-4 bg-white border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/30 rounded-2xl transition-all"
                                >
                                    <div className="flex items-start justify-between gap-3 mb-3">
                                        <div className="min-w-0">
                                            <div className="text-sm font-black text-slate-900 break-words">{entry.order.customer_name}</div>
                                            <div className="text-xs text-slate-500 font-mono mt-0.5">#{formatOrderId(entry.order.id)}</div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded border border-slate-200">
                                                {entry.batchesCount} παρτίδες
                                            </span>
                                        </div>
                                    </div>
                                    
                                    {/* Stage breakdown visual */}
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-1 flex-wrap">
                                            {activeStages.map(stage => {
                                                const config = STAGE_DISPLAY[stage];
                                                const qty = entry.stageBreakdown[stage];
                                                const isReady = stage === ProductionStage.Ready;
                                                
                                                return (
                                                    <div
                                                        key={stage}
                                                        className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-bold ${config.bgColor} ${config.color} ${config.borderColor} ${isReady ? 'ring-2 ring-emerald-300/50' : ''}`}
                                                        title={config.label}
                                                    >
                                                        <span className="opacity-70">{config.shortLabel}</span>
                                                        <span>{qty}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        
                                        {/* Stage progress bar */}
                                        {entry.totalQty > 0 && (
                                            <div
                                                className="h-2.5 rounded-full overflow-hidden bg-slate-100 flex border border-slate-200"
                                                title="Κατανομή ποσοτήτων ανά στάδιο παραγωγής"
                                            >
                                                {STAGE_ORDER.map(stage => {
                                                    const qty = entry.stageBreakdown[stage] || 0;
                                                    if (!qty) return null;
                                                    const pct = (qty / entry.totalQty) * 100;
                                                    return (
                                                        <div
                                                            key={stage}
                                                            className={`h-full ${STAGE_BAR_COLOR[stage]} border-r border-white/40 last:border-r-0 transition-[width] duration-300`}
                                                            style={{ width: `${pct}%` }}
                                                            title={`${STAGE_DISPLAY[stage].label}: ${qty} τμχ (${Math.round(pct)}%)`}
                                                        />
                                                    );
                                                })}
                                            </div>
                                        )}

                                        {/* Summary bar */}
                                        <div className="flex items-center gap-2 text-[10px]">
                                            <span className="text-slate-500 font-medium">Σύνολο:</span>
                                            <span className="font-bold text-slate-700">{entry.totalQty} τμχ</span>
                                            <span className="text-slate-300">|</span>
                                            <span className="text-blue-600 font-bold">{entry.inProgressQty} σε ροή</span>
                                            {entry.readyQty > 0 && (
                                                <>
                                                    <span className="text-slate-300">|</span>
                                                    <span className="text-emerald-600 font-bold">{entry.readyQty} έτοιμα ✓</span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </button>
                            );
                        })
                    ) : (
                        <div className="text-center py-12 text-slate-400 italic text-sm">
                            Δεν βρέθηκαν πελάτες σε παραγωγή.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const AssemblyOrderSelectorModal = ({
    isOpen,
    onClose,
    candidates,
    onConfirm
}: {
    isOpen: boolean;
    onClose: () => void;
    candidates: AssemblyOrderCandidate[];
    onConfirm: (selectedOrderIds: string[]) => void;
}) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set(candidates.map(c => c.order.id)));

    useEffect(() => {
        if (!isOpen) return;
        setSearchTerm('');
        setSelectedOrderIds(new Set(candidates.map(c => c.order.id)));
    }, [isOpen, candidates]);

    const filteredCandidates = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        if (!term) return candidates;
        return candidates.filter((candidate) =>
            candidate.order.customer_name.toLowerCase().includes(term) ||
            candidate.order.id.toLowerCase().includes(term)
        );
    }, [candidates, searchTerm]);

    const visibleIds = filteredCandidates.map(c => c.order.id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedOrderIds.has(id));

    const toggleAllVisible = () => {
        const next = new Set(selectedOrderIds);
        if (allVisibleSelected) {
            visibleIds.forEach(id => next.delete(id));
        } else {
            visibleIds.forEach(id => next.add(id));
        }
        setSelectedOrderIds(next);
    };

    const toggleOrder = (orderId: string) => {
        const next = new Set(selectedOrderIds);
        if (next.has(orderId)) next.delete(orderId);
        else next.add(orderId);
        setSelectedOrderIds(next);
    };

    const selectedCount = selectedOrderIds.size;

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[230] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-white w-full max-w-3xl max-h-[88vh] rounded-3xl shadow-2xl border border-slate-100 flex flex-col overflow-hidden animate-in zoom-in-95">
                <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
                    <div>
                        <h3 className="text-lg sm:text-xl font-black text-slate-900 flex items-center gap-2">
                            <Layers size={18} className="text-pink-600" /> Εκτύπωση Συναρμολόγησης
                        </h3>
                        <p className="text-xs text-slate-500 mt-1">Επιλέξτε εντολές (Εκκρεμείς / Σε Παραγωγή) για τον υπεύθυνο συναρμολόγησης.</p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full text-slate-400 hover:bg-slate-200 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-4 border-b border-slate-100 bg-white flex items-center gap-3">
                    <div className="relative flex-1">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Αναζήτηση πελάτη ή εντολής..."
                            className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-300"
                        />
                    </div>
                    <button
                        onClick={toggleAllVisible}
                        className="px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 flex items-center gap-2"
                    >
                        {allVisibleSelected ? <><Square size={14} /> Αποεπιλογή</> : <><CheckSquare size={14} /> Επιλογή Όλων</>}
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 bg-slate-50/30 custom-scrollbar space-y-2">
                    {filteredCandidates.length > 0 ? (
                        filteredCandidates.map((candidate) => {
                            const selected = selectedOrderIds.has(candidate.order.id);
                            return (
                                <button
                                    key={candidate.order.id}
                                    onClick={() => toggleOrder(candidate.order.id)}
                                    className={`w-full text-left p-4 rounded-2xl border transition-all ${selected ? 'bg-pink-50 border-pink-300 ring-1 ring-pink-100' : 'bg-white border-slate-200 hover:border-pink-200'}`}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="text-sm font-black text-slate-900 break-words">{candidate.order.customer_name}</div>
                                            <div className="text-xs text-slate-500 font-mono mt-0.5">#{formatOrderId(candidate.order.id)}</div>
                                        </div>
                                        <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors shrink-0 ${selected ? 'bg-pink-600 border-pink-600' : 'bg-white border-slate-300'}`}>
                                            {selected && <Check size={13} className="text-white" />}
                                        </div>
                                    </div>
                                    <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] font-bold uppercase">
                                        <div className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-slate-600">
                                            Κωδικοί Συναρμολόγησης: {candidate.assemblySkuCount}
                                        </div>
                                        <div className="bg-pink-50 border border-pink-200 rounded-lg px-2 py-1 text-pink-700">
                                            Τεμάχια: {candidate.totalAssemblyQty}
                                        </div>
                                    </div>
                                </button>
                            );
                        })
                    ) : (
                        <div className="text-center py-12 text-slate-400 italic text-sm">
                            Δεν βρέθηκαν επιλέξιμες εντολές.
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-slate-100 bg-white flex justify-end gap-3">
                    <button onClick={onClose} className="px-5 py-2.5 rounded-xl text-slate-600 font-bold hover:bg-slate-100 transition-colors">
                        Ακύρωση
                    </button>
                    <button
                        onClick={() => {
                            onConfirm(Array.from(selectedOrderIds));
                            onClose();
                        }}
                        disabled={selectedCount === 0}
                        className="px-6 py-2.5 rounded-xl bg-pink-600 text-white font-bold hover:bg-pink-700 transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        <Printer size={18} /> Εκτύπωση ({selectedCount})
                    </button>
                </div>
            </div>
        </div>
    );
};

const EditBatchNoteModal = ({ batch, onClose, onSave, isProcessing }: { batch: ProductionBatch, onClose: () => void, onSave: (notes: string) => void, isProcessing: boolean }) => {
    const [note, setNote] = useState(batch.notes || '');

    return (
        <div className="fixed inset-0 z-[250] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-amber-50/50">
                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <StickyNote size={18} className="text-amber-500" /> Σημειώσεις Παρτίδας
                    </h3>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-400"><X size={20} /></button>
                </div>
                <div className="p-6">
                    <div className="mb-4 text-xs text-slate-500">
                        Προσθέστε οδηγίες ή παρατηρήσεις για την παρτίδα <strong>{batch.sku}</strong>.
                    </div>
                    <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-amber-500/20 h-32 resize-none text-sm font-medium"
                        placeholder="Γράψτε εδώ..."
                        autoFocus
                    />
                </div>
                <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
                    <button onClick={onClose} className="px-5 py-2.5 rounded-xl text-slate-500 font-bold hover:bg-slate-200 transition-colors">Άκυρο</button>
                    <button
                        onClick={() => onSave(note)}
                        disabled={isProcessing}
                        className="px-6 py-2.5 rounded-xl bg-slate-900 text-white font-bold hover:bg-black transition-colors flex items-center gap-2 shadow-lg"
                    >
                        {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Αποθήκευση
                    </button>
                </div>
            </div>
        </div>
    );
};

const HoldBatchModal = ({ batch, onClose, onConfirm, isProcessing }: { batch: ProductionBatch, onClose: () => void, onConfirm: (reason: string) => void, isProcessing: boolean }) => {
    const [reason, setReason] = useState('');

    return (
        <div className="fixed inset-0 z-[160] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 border border-amber-200">
                <div className="p-6 border-b border-amber-100 flex justify-between items-center bg-amber-50">
                    <h3 className="text-lg font-black text-amber-800 flex items-center gap-2">
                        <PauseCircle size={18} /> Θέση σε Αναμονή
                    </h3>
                    <button onClick={onClose} className="p-2 hover:bg-amber-100 rounded-full text-amber-500"><X size={20} /></button>
                </div>
                <div className="p-6">
                    <p className="mb-4 text-sm text-slate-600 font-bold">
                        Γιατί σταματάει η παραγωγή του {batch.sku};
                    </p>
                    <textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        className="w-full p-4 bg-white border-2 border-amber-100 rounded-xl outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-500/10 h-32 resize-none text-sm font-bold text-slate-800"
                        placeholder="π.χ. Έλλειψη εξαρτήματος, Σπασμένο λάστιχο..."
                        autoFocus
                    />
                </div>
                <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
                    <button onClick={onClose} className="px-5 py-2.5 rounded-xl text-slate-600 font-bold hover:bg-slate-200 transition-colors">Άκυρο</button>
                    <button
                        onClick={() => onConfirm(reason)}
                        disabled={isProcessing || !reason.trim()}
                        className="px-6 py-2.5 rounded-xl bg-amber-500 text-white font-bold hover:bg-amber-600 transition-colors flex items-center gap-2 shadow-lg disabled:opacity-50"
                    >
                        {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <PauseCircle size={16} />} ΣΕ ΑΝΑΜΟΝΗ
                    </button>
                </div>
            </div>
        </div>
    );
};

// Stage button colors for finder batch selector
const FINDER_STAGE_BUTTON_COLORS: Record<string, { bg: string, text: string, border: string }> = {
    'AwaitingDelivery': { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
    'Waxing': { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200' },
    'Casting': { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
    'Setting': { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
    'Polishing': { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
    'Assembly': { bg: 'bg-pink-50', text: 'text-pink-700', border: 'border-pink-200' },
    'Labeling': { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200' },
    'Ready': { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
};

// Hex colors for native <select> <option> elements (can't use Tailwind classes there)
const STAGE_SELECT_COLORS: Record<string, { bg: string; color: string }> = {
    [ProductionStage.AwaitingDelivery]: { bg: '#eef2ff', color: '#4338ca' },
    [ProductionStage.Waxing]:            { bg: '#f8fafc', color: '#475569' },
    [ProductionStage.Casting]:           { bg: '#fff7ed', color: '#c2410c' },
    [ProductionStage.Setting]:           { bg: '#faf5ff', color: '#7e22ce' },
    [ProductionStage.Polishing]:         { bg: '#eff6ff', color: '#1d4ed8' },
    [ProductionStage.Assembly]:          { bg: '#fdf2f8', color: '#be185d' },
    [ProductionStage.Labeling]:          { bg: '#fefce8', color: '#854d0e' },
    [ProductionStage.Ready]:             { bg: '#ecfdf5', color: '#065f46' },
};

// Stage display order and labels for finder
const FINDER_STAGE_ORDER: { id: ProductionStage, label: string }[] = [
    { id: ProductionStage.AwaitingDelivery, label: getProductionStageLabel(ProductionStage.AwaitingDelivery) },
    { id: ProductionStage.Waxing, label: getProductionStageLabel(ProductionStage.Waxing) },
    { id: ProductionStage.Casting, label: getProductionStageLabel(ProductionStage.Casting) },
    { id: ProductionStage.Setting, label: getProductionStageLabel(ProductionStage.Setting) },
    { id: ProductionStage.Polishing, label: getProductionStageLabel(ProductionStage.Polishing) },
    { id: ProductionStage.Assembly, label: getProductionStageLabel(ProductionStage.Assembly) },
    { id: ProductionStage.Labeling, label: getProductionStageLabel(ProductionStage.Labeling) },
    { id: ProductionStage.Ready, label: getProductionStageLabel(ProductionStage.Ready) },
];

// Component for stage selector in finder results
const FinderBatchStageSelector = ({ 
    batch, 
    onMoveToStage,
    onToggleHold,
    onEditNote,
    hideNotes = false,
}: { 
    batch: ProductionBatch & { customer_name?: string }, 
    onMoveToStage: (batch: ProductionBatch, targetStage: ProductionStage, options?: { pendingDispatch?: boolean }) => void,
    onToggleHold: (batch: ProductionBatch) => void,
    onEditNote?: (batch: ProductionBatch) => void,
    hideNotes?: boolean,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [popupPosition, setPopupPosition] = useState({ top: 0, left: 0 });
    const buttonRef = useRef<HTMLButtonElement>(null);
    const popupRef = useRef<HTMLDivElement>(null);
    
    // Calculate popup position when opening
    const updatePosition = useCallback(() => {
        if (buttonRef.current) {
            const buttonRect = buttonRef.current.getBoundingClientRect();
            const popupHeight = 320; // Approximate max height
            const popupWidth = 160;
            const padding = 8;
            
            // Calculate vertical position - prefer above, but go below if not enough space
            let top = buttonRect.top - popupHeight - padding;
            if (top < padding) {
                // Not enough space above, show below
                top = buttonRect.bottom + padding;
            }
            
            // Ensure doesn't go off bottom of screen
            const viewportHeight = window.innerHeight;
            if (top + popupHeight > viewportHeight - padding) {
                top = viewportHeight - popupHeight - padding;
            }
            
            // Calculate horizontal position - align right edge with button
            let left = buttonRect.right - popupWidth;
            if (left < padding) {
                left = padding;
            }
            
            setPopupPosition({ top, left });
        }
    }, []);
    
    // Open/close handler
    const handleToggle = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        if (!isOpen) {
            updatePosition();
        }
        setIsOpen(!isOpen);
    }, [isOpen, updatePosition]);
    
    // Close selector when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                popupRef.current && !popupRef.current.contains(event.target as Node) &&
                buttonRef.current && !buttonRef.current.contains(event.target as Node)
            ) {
                setIsOpen(false);
            }
        };
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);
    
    // Update position on scroll/resize
    useEffect(() => {
        if (isOpen) {
            const handleScroll = () => updatePosition();
            window.addEventListener('scroll', handleScroll, true);
            window.addEventListener('resize', handleScroll);
            return () => {
                window.removeEventListener('scroll', handleScroll, true);
                window.removeEventListener('resize', handleScroll);
            };
        }
    }, [isOpen, updatePosition]);
    
    const currentStageIndex = FINDER_STAGE_ORDER.findIndex(s => s.id === batch.current_stage);
    
    const isStageDisabled = (stageId: ProductionStage): boolean => {
        if (stageId === ProductionStage.Setting && !batch.requires_setting) return true;
        if (stageId === ProductionStage.Assembly && !batch.requires_assembly) return true;
        return false;
    };
    
    const handleStageSelect = (targetStage: ProductionStage, options?: { pendingDispatch?: boolean }) => {
        if (isStageDisabled(targetStage)) return;
        if (targetStage === batch.current_stage && targetStage !== ProductionStage.Polishing) return;
        setIsOpen(false);
        onMoveToStage(batch, targetStage, options);
    };
    
    return (
        <div className="mt-2 pt-2 border-t border-slate-200/50">
            {batch.on_hold && (
                <div className="bg-amber-100 text-amber-800 text-xs font-black p-1.5 px-2 rounded-lg flex items-center gap-1 border border-amber-200 mb-2">
                    <PauseCircle size={11} className="shrink-0" />
                    <span>Σε Αναμονή{batch.on_hold_reason ? ` • ${batch.on_hold_reason}` : ''}</span>
                </div>
            )}
            {!hideNotes && (
                <div
                    className={`flex items-center gap-1 text-xs font-bold p-1.5 px-2 rounded-lg border mb-2 truncate transition-colors ${
                        batch.notes
                            ? onEditNote
                                ? 'bg-amber-50 text-amber-800 border-amber-100 cursor-pointer hover:bg-amber-100'
                                : 'bg-amber-50 text-amber-800 border-amber-100'
                            : onEditNote
                                ? 'bg-slate-50 text-slate-400 border-slate-100 cursor-pointer hover:bg-slate-100'
                                : 'hidden'
                    }`}
                    onClick={onEditNote ? (e) => { e.stopPropagation(); onEditNote(batch); } : undefined}
                    title={onEditNote ? 'Επεξεργασία σημείωσης' : undefined}
                >
                    <StickyNote size={10} className="shrink-0" />
                    <span className="truncate">{batch.notes || 'Προσθήκη σημείωσης…'}</span>
                </div>
            )}
            
            <div className="flex items-center justify-between">
                <span className="text-[9px] font-bold text-slate-400 uppercase">Μετακίνηση:</span>
                
                <div className="flex items-center gap-2">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onToggleHold(batch);
                        }}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all shadow-sm active:scale-95 ${batch.on_hold ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-700' : 'bg-amber-100 hover:bg-amber-200 text-amber-700'}`}
                    >
                        {batch.on_hold ? <PlayCircle size={12} className="fill-current" /> : <PauseCircle size={12} />}
                        {batch.on_hold ? 'Συνέχεια' : 'Αναμονή'}
                    </button>
                    <button
                        ref={buttonRef}
                        onClick={handleToggle}
                        className="flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-600 px-2.5 py-1 rounded-lg text-xs font-bold transition-all shadow-sm active:scale-95"
                    >
                        <MoveRight size={12} />
                        Στάδιο
                        {isOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>
                </div>
            </div>
            
            {/* Portal-style fixed position popup - rendered at root level */}
            {isOpen && ReactDOM.createPortal(
                <div 
                    ref={popupRef}
                    className="fixed bg-white rounded-xl shadow-2xl border border-slate-200 p-2 z-[9999] min-w-[150px] max-h-[280px] overflow-y-auto custom-scrollbar animate-in fade-in zoom-in-95 duration-150"
                    style={{ 
                        top: popupPosition.top,
                        left: popupPosition.left,
                    }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2 px-2 sticky top-0 bg-white pt-1">Επιλογή Σταδίου</div>
                    <div className="space-y-1">
                        {FINDER_STAGE_ORDER.map((stage, index) => {
                            const isCurrent = stage.id === batch.current_stage;
                            const isDisabled = isStageDisabled(stage.id);
                            const isPast = index < currentStageIndex;
                            
                            const colorKey = stage.id === ProductionStage.AwaitingDelivery ? 'AwaitingDelivery' :
                                             stage.id === ProductionStage.Waxing ? 'Waxing' :
                                             stage.id === ProductionStage.Casting ? 'Casting' :
                                             stage.id === ProductionStage.Setting ? 'Setting' :
                                             stage.id === ProductionStage.Polishing ? 'Polishing' :
                                             stage.id === ProductionStage.Assembly ? 'Assembly' :
                                             stage.id === ProductionStage.Labeling ? 'Labeling' : 'Ready';
                            const stageColors = FINDER_STAGE_BUTTON_COLORS[colorKey];
                            
                            // Split Polishing into two sub-stage buttons (side by side)
                            if (stage.id === ProductionStage.Polishing) {
                                const isCurrentPending = isCurrent && batch.pending_dispatch;
                                const isCurrentDispatched = isCurrent && !batch.pending_dispatch;
                                
                                return (
                                    <div key={stage.id} className="flex gap-1">
                                        <button
                                            onClick={() => handleStageSelect(ProductionStage.Polishing, { pendingDispatch: true })}
                                            disabled={isDisabled}
                                            className={`flex-1 text-center px-2 py-1.5 rounded-lg text-[10px] font-bold transition-all flex items-center justify-between
                                                ${isCurrentPending
                                                    ? 'bg-teal-50 text-teal-700 border-teal-200 border ring-2 ring-offset-1 ring-teal-400/30'
                                                    : isDisabled
                                                    ? 'bg-slate-50/50 text-slate-300/50 border border-slate-100/50 cursor-not-allowed blur-[1px] opacity-50'
                                                    : isPast
                                                    ? 'bg-teal-50/50 text-teal-700/70 border border-slate-100 hover:bg-teal-50'
                                                    : 'bg-teal-50 text-teal-700 border-teal-200 border hover:shadow-md active:scale-95'
                                                }
                                            `}
                                        >
                                            <span>Τεχν. • Αναμονή</span>
                                            {isCurrentPending && <span className="text-[8px]">●</span>}
                                        </button>
                                        <button
                                            onClick={() => handleStageSelect(ProductionStage.Polishing, { pendingDispatch: false })}
                                            disabled={isDisabled}
                                            className={`flex-1 text-center px-2 py-1.5 rounded-lg text-[10px] font-bold transition-all flex items-center justify-between
                                                ${isCurrentDispatched
                                                    ? 'bg-blue-50 text-blue-700 border-blue-200 border ring-2 ring-offset-1 ring-blue-400/30'
                                                    : isDisabled
                                                    ? 'bg-slate-50/50 text-slate-300/50 border border-slate-100/50 cursor-not-allowed blur-[1px] opacity-50'
                                                    : isPast
                                                    ? 'bg-blue-50/50 text-blue-700/70 border border-slate-100 hover:bg-blue-50'
                                                    : 'bg-blue-50 text-blue-700 border-blue-200 border hover:shadow-md active:scale-95'
                                                }
                                            `}
                                        >
                                            <span>Τεχν. • Στον Τεχν.</span>
                                            {isCurrentDispatched && <span className="text-[8px]">●</span>}
                                        </button>
                                    </div>
                                );
                            }
                            
                            return (
                                <button
                                    key={stage.id}
                                    onClick={() => handleStageSelect(stage.id)}
                                    disabled={isDisabled}
                                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all flex items-center justify-between
                                        ${isCurrent 
                                            ? `${stageColors.bg} ${stageColors.text} ${stageColors.border} border ring-2 ring-offset-1 ring-current/30` 
                                            : isDisabled
                                            ? 'bg-slate-50/50 text-slate-300/50 border border-slate-100/50 cursor-not-allowed blur-[1px] opacity-50'
                                            : isPast
                                            ? `${stageColors.bg}/50 ${stageColors.text}/70 border border-slate-100 hover:${stageColors.bg}`
                                            : `${stageColors.bg} ${stageColors.text} ${stageColors.border} border hover:shadow-md active:scale-95`
                                        }
                                    `}
                                >
                                    <span>{stage.label}</span>
                                    {isCurrent && <span className="text-[8px]">●</span>}
                                    {isDisabled && <span className="text-[8px] opacity-50">παράλειψη</span>}
                                </button>
                            );
                        })}
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

const SplitBatchModal = ({ state, onClose, onConfirm, isProcessing }: { state: { batch: ProductionBatch, targetStage: ProductionStage, isReceive?: boolean }, onClose: () => void, onConfirm: (qty: number, targetStage: ProductionStage) => void, isProcessing: boolean }) => {
    const { batch, targetStage, isReceive } = state;
    const [quantity, setQuantity] = useState(batch.quantity);
    const [selectedTarget, setSelectedTarget] = useState<ProductionStage>(targetStage);

    const sourceStageInfo = STAGES.find(s => s.id === batch.current_stage)!;
    const selectedTargetInfo = STAGES.find(s => s.id === selectedTarget)!;

    const sourceColors = STAGE_COLORS[sourceStageInfo.color as keyof typeof STAGE_COLORS];
    const targetColors = STAGE_COLORS[selectedTargetInfo.color as keyof typeof STAGE_COLORS];

    const handleConfirmClick = () => {
        if (quantity > 0 && quantity <= batch.quantity) {
            onConfirm(quantity, selectedTarget);
        }
    };

    return (
        <div className="fixed inset-0 z-[150] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800">{isReceive ? 'Παραλαβή Τεμαχίων' : 'Μετακίνηση Παρτίδας'}</h2>
                        <p className="text-sm text-slate-500 font-mono font-bold">{batch.sku}{batch.variant_suffix}</p>
                    </div>
                    <button onClick={onClose} disabled={isProcessing} className="p-2 hover:bg-slate-200 rounded-full text-slate-500"><X size={20} /></button>
                </div>
                <div className="p-8 space-y-6">
                    <div className="flex items-center justify-around text-center">
                        <div className="flex flex-col items-center gap-2 opacity-60">
                            <div className={`p-3 rounded-xl ${sourceColors.bg} ${sourceColors.text}`}>{sourceStageInfo.icon}</div>
                            <span className="text-xs font-bold">{sourceStageInfo.label}</span>
                        </div>
                        <ArrowRight size={24} className="text-slate-300 mx-4 shrink-0" />

                        {/* Target Selection Dropdown Trigger */}
                        <div className="relative group">
                            <div className="flex flex-col items-center gap-2 cursor-pointer">
                                <div className={`p-3 rounded-xl border-2 ${targetColors.border} ${targetColors.bg} ${targetColors.text}`}>
                                    {selectedTargetInfo.icon}
                                </div>
                                <div className={`flex items-center gap-1 text-slate-800 pb-0.5 ${isReceive ? '' : 'border-b border-dashed border-slate-400 hover:text-emerald-600'} transition-colors`}>
                                    <span className="text-xs font-bold">{selectedTargetInfo.label}</span>
                                    {!isReceive && <ChevronDown size={12} />}
                                </div>
                            </div>

                            {/* Hidden Select for interaction — disabled when receiving */}
                            {!isReceive && (
                                <select
                                    value={selectedTarget}
                                    onChange={(e) => setSelectedTarget(e.target.value as ProductionStage)}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                >
                                    {STAGES.map(s => {
                                        // Check if stage is disabled for this batch
                                        const isStageDisabled = 
                                            (s.id === ProductionStage.Setting && !batch.requires_setting) ||
                                            (s.id === ProductionStage.Assembly && !batch.requires_assembly);
                                        
                                        return (
                                            <option 
                                                key={s.id} 
                                                value={s.id} 
                                                disabled={s.id === batch.current_stage || isStageDisabled}
                                            >
                                                {s.label}{isStageDisabled ? ' (παραλείπεται)' : ''}
                                            </option>
                                        );
                                    })}
                                </select>
                            )}
                        </div>
                    </div>

                    <div className="bg-slate-100 p-6 rounded-2xl border border-slate-200 text-center">
                        <label className="text-sm font-bold text-slate-600 block mb-2">
                            {isReceive ? 'Ποσότητα παραληφθέντων' : 'Ποσότητα για μετακίνηση'}
                        </label>
                        <p className="text-xs text-slate-400 mb-3">
                            {isReceive
                                ? `Πόσα από τα ${batch.quantity} τμχ παραδόθηκαν από τον προμηθευτή;`
                                : `Διαθέσιμα σε αυτή την παρτίδα: ${batch.quantity}`}
                        </p>
                        <input
                            type="number"
                            value={quantity}
                            onChange={(e) => {
                                const val = parseInt(e.target.value);
                                if (isNaN(val)) setQuantity(1);
                                else if (val > batch.quantity) setQuantity(batch.quantity);
                                else if (val < 1) setQuantity(1);
                                else setQuantity(val);
                            }}
                            className="w-48 p-4 text-center font-black text-3xl rounded-xl border-2 border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none bg-white text-slate-800"
                            autoFocus
                            onKeyDown={(e) => e.key === 'Enter' && handleConfirmClick()}
                        />
                    </div>
                </div>
                <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                    <button onClick={onClose} disabled={isProcessing} className="px-6 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-200 transition-colors">
                        Ακύρωση
                    </button>
                    <button onClick={handleConfirmClick} disabled={isProcessing} className="px-8 py-3 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-700 transition-colors flex items-center gap-2 shadow-lg shadow-emerald-200">
                        {isProcessing ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle size={18} />}
                        {isProcessing ? 'Μετακίνηση...' : 'Επιβεβαίωση'}
                    </button>
                </div>
            </div>
        </div>
    );
};


// ── StageInspectorModal ─────────────────────────────────────────────────────
const TIMING_LEFT_BORDER_INSPECTOR: Record<string, string> = {
    normal:    'border-l-emerald-400',
    attention: 'border-l-amber-400',
    delayed:   'border-l-orange-500',
    critical:  'border-l-red-500',
};

const StageInspectorModal: React.FC<{
    stage: { id: ProductionStage; label: string; icon: React.ReactNode; color: string };
    batches: EnhancedProductionBatch[];
    onClose: () => void;
    onMoveBatch: (batch: ProductionBatch, targetStage: ProductionStage, options?: { pendingDispatch?: boolean }) => void;
    onToggleHold: (batch: ProductionBatch) => void;
    onEditNote?: (batch: ProductionBatch) => void;
    onOpenPdfBatchPicker?: () => void;
    onDispatchBatches?: (batchIds: string[]) => void;
    onRecallBatches?: (batchIds: string[]) => void;
    initialPolishingTab?: 'pending' | 'dispatched';
}> = ({ stage, batches, onClose, onMoveBatch, onToggleHold, onEditNote, onOpenPdfBatchPicker, onDispatchBatches, onRecallBatches, initialPolishingTab }) => {
    const [sortMode, setSortMode] = useState<'sku' | 'client' | 'oldest' | 'newest'>('sku');
    const [clientFilter, setClientFilter] = useState('');
    const [polishingTab, setPolishingTab] = useState<'pending' | 'dispatched'>(initialPolishingTab ?? 'pending');
    const colors = STAGE_COLORS[stage.color as keyof typeof STAGE_COLORS];
    const isPolishing = stage.id === ProductionStage.Polishing;

    const filtered = useMemo(() => {
        let list = [...batches];
        // For Polishing stage, filter by sub-tab
        if (isPolishing) {
            list = list.filter(b => polishingTab === 'pending' ? b.pending_dispatch : !b.pending_dispatch);
        }
        if (clientFilter.trim()) {
            const term = clientFilter.toLowerCase();
            list = list.filter(b =>
                (b.customer_name || '').toLowerCase().includes(term) ||
                b.sku.toLowerCase().includes(term) ||
                (b.order_id || '').toLowerCase().includes(term)
            );
        }
        if (sortMode === 'sku') {
            list.sort((a, b) => {
                const holdCmp = (a.on_hold ? 1 : 0) - (b.on_hold ? 1 : 0);
                if (holdCmp !== 0) return holdCmp;
                return compareBatchesBySkuAscending(a, b);
            });
        } else if (sortMode === 'client') {
            list.sort((a, b) => {
                const cA = (a.customer_name || '').toLocaleLowerCase('el');
                const cB = (b.customer_name || '').toLocaleLowerCase('el');
                const cmp = cA.localeCompare(cB, 'el');
                if (cmp !== 0) return cmp;
                const t = getBatchStageChronologyTimestamp(a) - getBatchStageChronologyTimestamp(b);
                if (t !== 0) return t;
                return compareBatchesBySkuAscending(a, b);
            });
        } else if (sortMode === 'oldest') {
            list.sort((a, b) => {
                const t = getBatchStageChronologyTimestamp(a) - getBatchStageChronologyTimestamp(b);
                if (t !== 0) return t;
                return compareBatchesBySkuAscending(a, b);
            });
        } else {
            list.sort((a, b) => {
                const t = getBatchStageChronologyTimestamp(b) - getBatchStageChronologyTimestamp(a);
                if (t !== 0) return t;
                return compareBatchesBySkuAscending(a, b);
            });
        }
        return list;
    }, [batches, clientFilter, sortMode, isPolishing, polishingTab]);

    const totalQty = batches.reduce((s, b) => s + b.quantity, 0);
    const onHoldCount = batches.filter(b => b.on_hold).length;
    const clientCount = new Set(filtered.map(batch => (batch.customer_name || 'Χωρίς Πελάτη').trim() || 'Χωρίς Πελάτη')).size;
    const orderCount = new Set(filtered.map(batch => batch.order_id).filter(Boolean)).size;

    // Polishing sub-tab counts (computed from full batches, not filtered)
    const pendingCount = isPolishing ? batches.filter(b => b.pending_dispatch).length : 0;
    const dispatchedCount = isPolishing ? batches.filter(b => !b.pending_dispatch).length : 0;
    const pendingOnHoldCount = isPolishing ? batches.filter(b => b.pending_dispatch && b.on_hold).length : 0;
    const dispatchedOnHoldCount = isPolishing ? batches.filter(b => !b.pending_dispatch && b.on_hold).length : 0;

    const groupedByClient = useMemo(() => {
        if (sortMode !== 'client') return new Map<string, { totalQty: number }>();
        const groups = new Map<string, EnhancedProductionBatch[]>();
        filtered.forEach(batch => {
            const key = (batch.customer_name || 'Χωρίς Πελάτη').trim() || 'Χωρίς Πελάτη';
            const existing = groups.get(key) || [];
            existing.push(batch);
            groups.set(key, existing);
        });
        const summary = new Map<string, { totalQty: number }>();
        groups.forEach((clientBatches, clientName) => {
            summary.set(clientName, { totalQty: clientBatches.reduce((s, b) => s + b.quantity, 0) });
        });
        return summary;
    }, [filtered, sortMode]);

    const firstOnHoldIndex = sortMode === 'sku' ? filtered.findIndex(b => b.on_hold) : -1;
    const filteredOnHoldCount = filtered.filter(b => b.on_hold).length;

    return (
        <div
            className="fixed inset-0 z-[210] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
            onClick={onClose}
        >
            <div
                className="bg-white w-full max-w-2xl max-h-[92vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className={`flex-shrink-0 px-6 py-5 border-b border-slate-100 ${colors.header} flex items-center justify-between gap-4 rounded-t-3xl`}>
                    <div className="flex items-center gap-3">
                        <div className={`p-2.5 bg-white rounded-xl shadow-sm ${colors.text}`}>
                            {React.cloneElement(stage.icon as React.ReactElement, { size: 22 })}
                        </div>
                        <div>
                            <h3 className="font-black text-slate-900 text-xl">{stage.label}</h3>
                            {onHoldCount > 0 && (
                                <span className="text-xs font-bold text-amber-600 flex items-center gap-1 mt-0.5">
                                    <PauseCircle size={11} /> {onHoldCount} σε αναμονή
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                        {onOpenPdfBatchPicker && batches.length > 0 && (
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); onOpenPdfBatchPicker(); }}
                                className="p-2 rounded-xl bg-white/90 text-slate-600 hover:text-slate-900 hover:bg-white border border-slate-200/80 shadow-sm transition-colors"
                                title="Εκτύπωση PDF σταδίου (επιλογή παρτίδων)"
                            >
                                <Printer size={20} />
                            </button>
                        )}
                        <button onClick={onClose} className="p-2 hover:bg-white/70 rounded-full text-slate-400 transition-colors">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Stats + controls */}
                <div className="flex-shrink-0 px-5 py-4 border-b border-slate-100 bg-white space-y-3">
                    {/* Stat pills */}
                    <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Παρτίδες</span>
                            <span className="text-sm font-black text-slate-900 ml-1">{filtered.length}</span>
                            <span className="text-[10px] text-slate-400 font-medium">/ {totalQty} τεμ.</span>
                        </div>
                        <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Παραγγελίες</span>
                            <span className="text-sm font-black text-slate-900 ml-1">{orderCount}</span>
                        </div>
                        {onHoldCount > 0 && (
                            <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                                <PauseCircle size={12} className="text-amber-500" />
                                <span className="text-[10px] font-black text-amber-700 uppercase tracking-widest">{onHoldCount} αναμονή</span>
                            </div>
                        )}
                    </div>

                    {/* Sort buttons */}
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest shrink-0">Ταξινόμηση:</span>
                        <button
                            onClick={() => setSortMode('sku')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${sortMode === 'sku' ? `${colors.header} ${colors.text} ${colors.border}` : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'}`}
                        >
                            <Hash size={12} /> Ανά Κωδικό
                        </button>
                        <button
                            onClick={() => setSortMode('client')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${sortMode === 'client' ? `${colors.header} ${colors.text} ${colors.border}` : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'}`}
                        >
                            <User size={12} /> Ανά Πελάτη
                        </button>
                        <button
                            onClick={() => setSortMode('oldest')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${sortMode === 'oldest' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'}`}
                        >
                            <ArrowUp size={12} /> Παλαιότερα
                        </button>
                        <button
                            onClick={() => setSortMode('newest')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${sortMode === 'newest' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'}`}
                        >
                            <ArrowDown size={12} /> Νεότερα
                        </button>
                    </div>

                    {/* Search */}
                    <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            value={clientFilter}
                            onChange={e => setClientFilter(e.target.value)}
                            placeholder="Φιλτράρισμα ανά πελάτη ή SKU..."
                            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300"
                        />
                    </div>
                </div>

                {/* Polishing sub-tabs */}
                {isPolishing && (
                    <div className="flex-shrink-0 px-5 py-3 border-b border-slate-100 bg-white flex items-center justify-between gap-3">
                        <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
                            <button
                                onClick={() => setPolishingTab('pending')}
                                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-black transition-all ${
                                    polishingTab === 'pending'
                                        ? 'bg-teal-600 text-white shadow-sm'
                                        : 'text-slate-500 hover:text-slate-700 hover:bg-white/60'
                                }`}
                            >
                                <Package size={13} />
                                Αναμονή Αποστολής
                                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${polishingTab === 'pending' ? 'bg-white/25 text-white' : 'bg-teal-100 text-teal-700'}`}>
                                    {pendingCount}
                                </span>
                                {pendingOnHoldCount > 0 && (
                                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black flex items-center gap-0.5 animate-pulse ${polishingTab === 'pending' ? 'bg-amber-300/40 text-amber-100' : 'bg-amber-100 text-amber-700'}`}>
                                        <PauseCircle size={9} className="fill-current shrink-0" />{pendingOnHoldCount}
                                    </span>
                                )}
                            </button>
                            <button
                                onClick={() => setPolishingTab('dispatched')}
                                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-black transition-all ${
                                    polishingTab === 'dispatched'
                                        ? 'bg-blue-600 text-white shadow-sm'
                                        : 'text-slate-500 hover:text-slate-700 hover:bg-white/60'
                                }`}
                            >
                                <Hammer size={13} />
                                Στον Τεχνίτη
                                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${polishingTab === 'dispatched' ? 'bg-white/25 text-white' : 'bg-blue-100 text-blue-700'}`}>
                                    {dispatchedCount}
                                </span>
                                {dispatchedOnHoldCount > 0 && (
                                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black flex items-center gap-0.5 animate-pulse ${polishingTab === 'dispatched' ? 'bg-amber-300/40 text-amber-100' : 'bg-amber-100 text-amber-700'}`}>
                                        <PauseCircle size={9} className="fill-current shrink-0" />{dispatchedOnHoldCount}
                                    </span>
                                )}
                            </button>
                        </div>
                        {polishingTab === 'pending' && onDispatchBatches && filtered.length > 0 && (
                            <button
                                onClick={() => onDispatchBatches(filtered.map(b => b.id))}
                                className="flex items-center gap-1 px-3 py-2 rounded-lg bg-teal-600 text-white text-[11px] font-bold hover:bg-teal-700 transition-colors shadow-sm"
                                title="Αποστολή όλων στον Τεχνίτη"
                            >
                                <Truck size={12} />
                                Αποστολή Όλων
                            </button>
                        )}
                    </div>
                )}

                {/* Batch list */}
                <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar bg-slate-50/40">
                    {filtered.length === 0 ? (
                        <div className="text-center py-12 text-slate-400 italic text-sm">Δεν βρέθηκαν παρτίδες.</div>
                    ) : (
                        filtered.map((batch, index) => {
                            const ageInfo = getBatchAgeInfo(batch);
                            const timingStatus = batch.timingStatus || 'normal';
                            const previousCustomer = index > 0 ? ((filtered[index - 1].customer_name || 'Χωρίς Πελάτη').trim() || 'Χωρίς Πελάτη') : null;
                            const currentCustomer = (batch.customer_name || 'Χωρίς Πελάτη').trim() || 'Χωρίς Πελάτη';
                            const showClientDivider = sortMode === 'client' && currentCustomer !== previousCustomer;

                            const variant = batch.product_details?.variants?.find(v => v.suffix === batch.variant_suffix);
                            const descriptor = [variant?.description, batch.product_details?.description, batch.product_details?.category].filter(Boolean).join(' • ');
                            const stageEnteredLabel = new Date(batch.stageEnteredAt || batch.created_at).toLocaleString('el-GR', {
                                day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                            });
                            const productionTypeLabel = batch.product_details?.production_type === ProductionType.Imported ? 'Εισαγωγής' : 'Παραγωγή';
                            const leftBorder = batch.on_hold
                                ? 'border-l-amber-400'
                                : (TIMING_LEFT_BORDER_INSPECTOR[timingStatus] || 'border-l-emerald-400');

                            return (
                                <React.Fragment key={batch.id}>
                                    {/* Client divider */}
                                    {showClientDivider && (
                                        <div className={`flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl border ${colors.border} ${colors.header} mt-1`}>
                                            <div className="flex items-center gap-2 min-w-0">
                                                <Users size={13} className={colors.text} />
                                                <span className={`text-sm font-black truncate ${colors.text}`}>{currentCustomer}</span>
                                            </div>
                                            <span className="text-[11px] font-semibold text-slate-500 shrink-0">
                                                {groupedByClient.get(currentCustomer)?.totalQty ?? batch.quantity} τεμ.
                                            </span>
                                        </div>
                                    )}

                                    {/* On-hold section divider */}
                                    {index === firstOnHoldIndex && firstOnHoldIndex > 0 && (
                                        <div className="sticky top-0 z-10 flex items-center gap-2 px-4 py-2 rounded-xl border border-amber-200 bg-amber-50 mt-1 mb-0.5">
                                            <PauseCircle size={12} className="text-amber-500 fill-current animate-pulse shrink-0" />
                                            <span className="text-[11px] font-black uppercase tracking-widest text-amber-700">
                                                Σε Αναμονή
                                            </span>
                                            <span className="ml-auto text-[11px] font-bold text-amber-600">
                                                {filteredOnHoldCount} παρτ.
                                            </span>
                                        </div>
                                    )}

                                    {/* Batch card */}
                                    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-shadow hover:shadow-md ${leftBorder}
                                        ${batch.on_hold ? 'border-l-[4px] border-amber-200 bg-amber-50/30' : 'border-l-[3px] border-slate-200'}`}
                                    >
                                        {/* Hold bar */}
                                        {batch.on_hold && (
                                            <div className="bg-amber-50 border-b border-amber-100 px-4 py-1.5 flex items-center gap-2">
                                                <PauseCircle size={13} className="text-amber-500 shrink-0 animate-pulse" />
                                                <span className="text-xs font-black text-amber-800">
                                                    Σε Αναμονή{batch.on_hold_reason ? ` — ${batch.on_hold_reason}` : ''}
                                                </span>
                                            </div>
                                        )}

                                        <div className="p-4">
                                            {/* Top row: image + SKU info + age */}
                                            <div className="flex items-start gap-3">
                                                {/* Product image */}
                                                <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 border border-slate-100 bg-slate-50 flex items-center justify-center">
                                                    {batch.product_image ? (
                                                        <img src={batch.product_image} className="w-full h-full object-cover" alt={batch.sku} />
                                                    ) : (
                                                        <ImageIcon size={18} className="text-slate-300" />
                                                    )}
                                                </div>

                                                {/* SKU + size + qty */}
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <SkuColorizedText
                                                            sku={batch.sku}
                                                            suffix={batch.variant_suffix || ''}
                                                            gender={batch.product_details?.gender}
                                                            className="font-black text-base"
                                                            masterClassName="text-slate-800"
                                                        />
                                                        {batch.size_info && (
                                                            <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 font-bold text-slate-500 shrink-0">
                                                                {batch.size_info}
                                                            </span>
                                                        )}
                                                        <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full text-[11px] font-black border border-slate-200 shrink-0">
                                                            ×{batch.quantity} τεμ
                                                        </span>
                                                    </div>
                                                    {descriptor && (
                                                        <p className="text-[11px] font-medium text-slate-500 mt-0.5 leading-relaxed">{descriptor}</p>
                                                    )}
                                                </div>

                                                {/* Age pill */}
                                                <span className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-bold border ${ageInfo.style}`}>
                                                    {ageInfo.label}
                                                </span>
                                            </div>

                                            {/* Metadata line (single row, no grid) */}
                                            <div className="mt-3 flex items-center flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                                                <span className="flex items-center gap-1 font-semibold text-slate-700">
                                                    <User size={11} className="text-slate-400 shrink-0" />
                                                    {currentCustomer}
                                                </span>
                                                {batch.order_id && (
                                                    <>
                                                        <span className="text-slate-300">·</span>
                                                        <span className="flex items-center gap-1 font-mono text-slate-500">
                                                            <Hash size={10} className="text-slate-400 shrink-0" />
                                                            {formatOrderId(batch.order_id)}
                                                        </span>
                                                    </>
                                                )}
                                                <span className="text-slate-300">·</span>
                                                <span className="flex items-center gap-1 text-slate-500">
                                                    <Calendar size={10} className="text-slate-400 shrink-0" />
                                                    {stageEnteredLabel}
                                                </span>
                                                <span className="text-slate-300">·</span>
                                                <span className="flex items-center gap-1 text-slate-500">
                                                    <Package size={10} className="text-slate-400 shrink-0" />
                                                    {productionTypeLabel}
                                                </span>
                                            </div>

                                            {/* Notes (once, full text) — clickable to edit when onEditNote provided */}
                                            <div
                                                className={`mt-2.5 rounded-xl px-3 py-2 flex items-start gap-2 border transition-colors ${
                                                    batch.notes
                                                        ? onEditNote
                                                            ? 'bg-amber-50 border-amber-100 cursor-pointer hover:bg-amber-100'
                                                            : 'bg-amber-50 border-amber-100'
                                                        : onEditNote
                                                            ? 'bg-slate-50 border-slate-100 cursor-pointer hover:bg-slate-100'
                                                            : 'hidden'
                                                }`}
                                                onClick={onEditNote ? (e) => { e.stopPropagation(); onEditNote(batch); } : undefined}
                                                title={onEditNote ? 'Επεξεργασία σημείωσης' : undefined}
                                            >
                                                <StickyNote size={13} className={`shrink-0 mt-0.5 ${batch.notes ? 'text-amber-500' : 'text-slate-400'}`} />
                                                <p className={`text-xs font-medium leading-relaxed whitespace-pre-wrap break-words ${batch.notes ? 'text-amber-800' : 'text-slate-400 italic'}`}>
                                                    {batch.notes || 'Προσθήκη σημείωσης…'}
                                                </p>
                                            </div>

                                            {/* Hold + Move controls — hideNotes since we show notes above */}
                                            <FinderBatchStageSelector
                                                batch={batch}
                                                onMoveToStage={onMoveBatch}
                                                onToggleHold={onToggleHold}
                                                hideNotes
                                            />
                                        </div>
                                    </div>
                                </React.Fragment>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
};

export default function ProductionPage({ products, materials, molds, onPrintAggregated, onPrintPreparation, onPrintTechnician, onPrintAssembly, onPrintLabels, onPrintStageBatches }: Props) {
    const queryClient = useQueryClient();
    const { showToast, confirm } = useUI();
    const { profile } = useAuth();
    const { data: batches, isLoading, isError: batchesError, error: batchesErr, refetch: refetchBatches } = useProductionBatches();
    const { data: batchStageHistoryEntries = [] } = useBatchStageHistoryEntries();
    const { data: orders } = useOrders();
    const { data: collections } = useCollections();
    const [timingNow, setTimingNow] = useState(() => Date.now());

    const [draggedBatchId, setDraggedBatchId] = useState<string | null>(null);
    const [dropTarget, setDropTarget] = useState<ProductionStage | null>(null);
    const [polishingDropTarget, setPolishingDropTarget] = useState<'pending' | 'dispatched' | null>(null);
    const [polishingFocus, setPolishingFocus] = useState<'equal' | 'pending' | 'dispatched'>('equal');
    const [isProcessingSplit, setIsProcessingSplit] = useState(false);

    // Note Editing
    const [editingNoteBatch, setEditingNoteBatch] = useState<ProductionBatch | null>(null);
    const [isSavingNote, setIsSavingNote] = useState(false);

    // Hold Batch
    const [holdingBatch, setHoldingBatch] = useState<ProductionBatch | null>(null);

    // Build View (New)
    const [viewBuildBatch, setViewBuildBatch] = useState<ProductionBatch | null>(null);

    // Mobile Accordion State
    const [expandedStageId, setExpandedStageId] = useState<string | null>(STAGES[1].id);

    // Finder State
    const [finderTerm, setFinderTerm] = useState('');
    const deferredFinderTerm = React.useDeferredValue(finderTerm);

    // Overview Modal State
    const [overviewModal, setOverviewModal] = useState<{ isOpen: boolean, type: 'active' | 'delayed' | 'onHold' | 'ready' } | null>(null);

    // PRINT SELECTOR MODAL STATE
    const [printSelectorState, setPrintSelectorState] = useState<PrintSelectorState>({ isOpen: false, type: '', batches: [] });
    const [labelPrintSortMode, setLabelPrintSortMode] = useState<LabelPrintSortMode>('as_sent');
    const [assemblyOrderSelectorOpen, setAssemblyOrderSelectorOpen] = useState(false);

    const [splitModalState, setSplitModalState] = useState<{
        batch: ProductionBatch;
        targetStage: ProductionStage;
        isReceive?: boolean;
        pendingDispatch?: boolean;
    } | null>(null);

    // NEW: Sorting State - split into grouping and ordering
    const [groupMode, setGroupMode] = useState<'gender' | 'customer'>('gender');
    const [sortOrder, setSortOrder] = useState<'alpha' | 'newest' | 'oldest'>('alpha');
    const [quickPickerOpen, setQuickPickerOpen] = useState(false);
    const [quickManageOrder, setQuickManageOrder] = useState<Order | null>(null);

    // Batch History Modal State
    const [historyModalBatch, setHistoryModalBatch] = useState<ProductionBatch | null>(null);
    const [batchHistory, setBatchHistory] = useState<any[]>([]);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    const [isMoldModalOpen, setIsMoldModalOpen] = useState(false);
    const [showSettingStones, setShowSettingStones] = useState(false);
    const [stageInspectorStage, setStageInspectorStage] = useState<ProductionStage | null>(null);
    const [stageInspectorInitialPolishingTab, setStageInspectorInitialPolishingTab] = useState<'pending' | 'dispatched'>('pending');

    // Multi-select & bulk move
    const [multiSelectIds, setMultiSelectIds] = useState<Set<string>>(new Set());
    const [bulkMoveTarget, setBulkMoveTarget] = useState<ProductionStage | null>(null);
    const [bulkMovePendingDispatch, setBulkMovePendingDispatch] = useState<boolean | undefined>(undefined);
    const [isBulkMoving, setIsBulkMoving] = useState(false);

    useEffect(() => {
        const intervalId = window.setInterval(() => setTimingNow(Date.now()), 60_000);
        return () => window.clearInterval(intervalId);
    }, []);

    const productsMap = useMemo(() => new Map(products.map(product => [product.sku, product])), [products]);
    const materialsMap = useMemo(() => new Map(materials.map(material => [material.id, material])), [materials]);
    const ordersMap = useMemo(() => new Map((orders || []).map(order => [order.id, order])), [orders]);
    const collectionsMap = useMemo(() => new Map((collections || []).map(collection => [collection.id, collection])), [collections]);
    const batchHistoryLookup = useMemo(() => buildBatchStageHistoryMap(batchStageHistoryEntries), [batchStageHistoryEntries]);

    // @FIX: Explicitly type return of enhancedBatches map to include customer_name and use intersection type.
    const enhancedBatches = useMemo(() => {
        const ZIRCON_CODES = ['LE', 'PR', 'AK', 'MP', 'KO', 'MV', 'RZ'];
        const NON_ZIRCON_STONE_CODES = ['TKO', 'TPR', 'TMP'];

        const results = batches?.map(b => {
            const prod = isSpecialCreationSku(b.sku) ? getSpecialCreationProductStub() : productsMap.get(b.sku);
            const timingInfo = getProductionTimingInfo(b, batchHistoryLookup.get(b.id), timingNow);

            const suffix = b.variant_suffix || '';
            const stone = getVariantComponents(suffix, prod?.gender).stone;
            const hasZirconsFromSuffix = stone?.code && ZIRCON_CODES.includes(stone.code) && !NON_ZIRCON_STONE_CODES.includes(stone.code);
            const hasZirconsFromRecipe =
                !!prod?.recipe?.some((r) => {
                    if (r.type !== 'raw') return false;
                    const material = materialsMap.get(r.id);
                    return material?.type === MaterialType.Stone && ZIRCON_CODES.some((code) => material.name.includes(code));
                });
            const hasZircons = hasZirconsFromSuffix || hasZirconsFromRecipe;

            // Check if assembly stage is required based on SKU
            const requires_assembly = isSpecialCreationSku(b.sku) ? false : requiresAssemblyStage(b.sku);

            // Inject Customer Name (with retail client extraction)
            const order = b.order_id ? ordersMap.get(b.order_id) : undefined;
            const isRetailOrder = order?.customer_id === RETAIL_CUSTOMER_ID || order?.customer_name === RETAIL_CUSTOMER_NAME;
            const { retailClientLabel } = extractRetailClientFromNotes(order?.notes);
            const customerName = isRetailOrder && retailClientLabel
                ? `${RETAIL_CUSTOMER_NAME} • ${retailClientLabel}`
                : (order?.customer_name || '');

            return {
                ...b,
                product_details: prod,
                product_image: prod?.image_url ?? null,
                diffHours: timingInfo.timeInStageHours,
                isDelayed: timingInfo.isDelayed,
                stageEnteredAt: timingInfo.stageEnteredAt,
                timeInStageHours: timingInfo.timeInStageHours,
                timingStatus: timingInfo.timingStatus,
                timingLabel: timingInfo.timingLabel,
                reminderKey: timingInfo.reminderKey,
                requires_setting: hasZircons,
                requires_assembly,
                customer_name: customerName
            };
        }) || [];
        return results as EnhancedProductionBatch[];
    }, [batches, productsMap, materialsMap, ordersMap, batchHistoryLookup, timingNow]);

    const productionHealthSummary = useMemo(() => {
        const total = enhancedBatches.length;
        const delayed = enhancedBatches.filter((batch) => batch.isDelayed && !batch.on_hold).length;
        const ready = enhancedBatches.filter((batch) => batch.current_stage === ProductionStage.Ready).length;
        const onHold = enhancedBatches.filter((batch) => batch.on_hold).length;
        const inProgress = total - ready - onHold;
        const healthScore = (inProgress + ready) > 0 ? Math.max(0, 100 - (delayed / (inProgress || 1)) * 100) : 100;

        return { healthScore, delayed, ready, onHold, inProgress };
    }, [enhancedBatches]);

    const activeProductionNotes = useMemo(() => {
        return (orders || [])
            .filter((order) =>
                order.status === 'In Production' &&
                order.notes &&
                order.notes.trim().length > 0 &&
                enhancedBatches.some((batch) => batch.order_id === order.id)
            )
            .map((order) => ({
                id: order.id,
                customer: order.customer_name,
                note: order.notes || '',
            }));
    }, [orders, enhancedBatches]);

    const criticalAlertGroups = useMemo(
        () => buildProductionAlertGroups(enhancedBatches),
        [enhancedBatches]
    );

    const batchesByOrderId = useMemo(() => {
        const map = new Map<string, EnhancedProductionBatch[]>();
        enhancedBatches.forEach(batch => {
            if (!batch.order_id) return;
            const existing = map.get(batch.order_id);
            if (existing) existing.push(batch);
            else map.set(batch.order_id, [batch]);
        });
        return map;
    }, [enhancedBatches]);

    const stageBatchesByStage = useMemo(() => groupProductionBatchesByStage(enhancedBatches), [enhancedBatches]);

    const foundBatches = useMemo(
        () => filterAndSortProductionFinderBatches(enhancedBatches, deferredFinderTerm) as EnhancedProductionBatch[],
        [enhancedBatches, deferredFinderTerm],
    );

    const quickPickEntries = useMemo(() => {
        if (!orders || orders.length === 0 || enhancedBatches.length === 0) return [] as ProductionQuickPickEntry[];

        const orderMap = new Map(orders.map(order => [order.id, order]));
        const groupedByOrder = enhancedBatches.reduce<Record<string, EnhancedProductionBatch[]>>((acc, batch) => {
            if (!batch.order_id) return acc;
            if (!acc[batch.order_id]) acc[batch.order_id] = [];
            acc[batch.order_id].push(batch);
            return acc;
        }, {});

        return Object.entries(groupedByOrder)
            .map(([orderId, batches]) => {
                const order = orderMap.get(orderId);
                if (!order) return null;

                const orderBatches = batches as EnhancedProductionBatch[];
                const totalQty = orderBatches.reduce((sum, batch) => sum + batch.quantity, 0);
                const readyQty = orderBatches
                    .filter(batch => batch.current_stage === ProductionStage.Ready)
                    .reduce((sum, batch) => sum + batch.quantity, 0);
                const latestUpdate = orderBatches.reduce((max, batch) => {
                    return Math.max(max, getBatchStageChronologyTimestamp(batch));
                }, 0);

                // Calculate stage breakdown
                const stageBreakdown: Record<string, number> = {};
                orderBatches.forEach(batch => {
                    stageBreakdown[batch.current_stage] = (stageBreakdown[batch.current_stage] || 0) + batch.quantity;
                });

                return {
                    order,
                    batchesCount: orderBatches.length,
                    totalQty,
                    readyQty,
                    inProgressQty: Math.max(0, totalQty - readyQty),
                    latestUpdate,
                    stageBreakdown
                } as ProductionQuickPickEntry;
            })
            .filter((entry): entry is ProductionQuickPickEntry => entry !== null)
            .sort((a, b) => b.latestUpdate - a.latestUpdate);
    }, [orders, enhancedBatches]);

    const assemblyOrderCandidates = useMemo(() => {
        if (!orders || orders.length === 0) return [] as AssemblyOrderCandidate[];

        // Build a quick lookup of READY quantities per order+sku+variant+size,
        // so Assembly sheets won't show items already marked Ready.
        const readyQtyByKey = new Map<string, number>();
        enhancedBatches.forEach((b) => {
            if (!b.order_id) return;
            if (b.current_stage !== ProductionStage.Ready) return;
            const key = [
                b.order_id,
                b.sku,
                b.variant_suffix || '',
                b.size_info || ''
            ].join('::');
            readyQtyByKey.set(key, (readyQtyByKey.get(key) || 0) + (b.quantity || 0));
        });

        return orders
            .filter((order) =>
                !order.is_archived &&
                (order.status === OrderStatus.Pending || order.status === OrderStatus.InProduction) &&
                order.items.some((item) => requiresAssemblyStage(item.sku) && !isSpecialCreationSku(item.sku))
            )
            .map((order) => {
                const qtyByKey = new Map<string, number>();
                const notesByKey = new Map<string, Set<string>>();

                const isRetailOrder =
                    order.customer_id === RETAIL_CUSTOMER_ID ||
                    order.customer_name === RETAIL_CUSTOMER_NAME;
                const { retailClientLabel } = extractRetailClientFromNotes(order.notes);
                const displayCustomerName =
                    isRetailOrder && retailClientLabel
                        ? `${RETAIL_CUSTOMER_NAME} • ${retailClientLabel}`
                        : order.customer_name;

                order.items.forEach((item) => {
                    if (!requiresAssemblyStage(item.sku) || isSpecialCreationSku(item.sku)) return;

                    const key = [
                        order.id,
                        item.sku,
                        item.variant_suffix || '',
                        item.size_info || ''
                    ].join('::');

                    qtyByKey.set(key, (qtyByKey.get(key) || 0) + (item.quantity || 0));
                    if (item.notes && item.notes.trim()) {
                        if (!notesByKey.has(key)) notesByKey.set(key, new Set());
                        notesByKey.get(key)!.add(item.notes.trim());
                    }
                });

                const rows = Array.from(qtyByKey.entries())
                    .map(([key, orderedQty], idx) => {
                        const [order_id, sku, variant_suffix, size_info] = key.split('::');
                        const readyQty = readyQtyByKey.get(key) || 0;
                        const remainingQty = Math.max(0, orderedQty - readyQty);
                        if (remainingQty <= 0) return null;

                        const notes = Array.from(notesByKey.get(key) || [])
                            .filter(Boolean)
                            .join(' • ');

                        return {
                            id: `assembly-order-${order.id}-${idx}`,
                            order_id,
                            customer_name: displayCustomerName,
                            sku,
                            variant_suffix: variant_suffix || undefined,
                            size_info: size_info || undefined,
                            quantity: remainingQty,
                            notes: notes || undefined
                        } as AssemblyPrintRow;
                    })
                    .filter((r): r is AssemblyPrintRow => r !== null)
                    .sort((a, b) => {
                    const skuA = `${a.sku}${a.variant_suffix || ''}`.toUpperCase();
                    const skuB = `${b.sku}${b.variant_suffix || ''}`.toUpperCase();
                    const bySku = skuA.localeCompare(skuB, undefined, { numeric: true });
                    if (bySku !== 0) return bySku;
                    return (a.size_info || '').localeCompare(b.size_info || '');
                });

                return {
                    order,
                    rows,
                    assemblySkuCount: rows.length,
                    totalAssemblyQty: rows.reduce((sum, row) => sum + row.quantity, 0)
                } as AssemblyOrderCandidate;
            })
            .filter((candidate) => candidate.rows.length > 0)
            .sort((a, b) => new Date(b.order.created_at).getTime() - new Date(a.order.created_at).getTime());
    }, [orders, enhancedBatches]);

    const handleDragStart = (e: React.DragEvent<HTMLDivElement>, batchId: string) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', batchId);
        setDraggedBatchId(batchId);
    };

    const handleDragEnd = () => {
        setDraggedBatchId(null);
        setDropTarget(null);
        setPolishingDropTarget(null);
    };

    const attemptMove = (batch: ProductionBatch, targetStage: ProductionStage, skipModal: boolean = false, pendingDispatch?: boolean) => {
        if (batch.on_hold) {
            showToast("Η παρτίδα είναι σε αναμονή. Ξεμπλοκάρετε την πρώτα.", "error");
            return;
        }

        // Handle intra-Polishing sub-stage changes (dispatch / recall)
        if (batch.current_stage === ProductionStage.Polishing && targetStage === ProductionStage.Polishing) {
            if (pendingDispatch === true && !batch.pending_dispatch) {
                handleRecallDispatchBatches([batch.id]);
            } else if (pendingDispatch === false && batch.pending_dispatch) {
                handleDispatchBatches([batch.id]);
            }
            return;
        }

        if (batch.current_stage === targetStage) return;

        if (batch.current_stage === ProductionStage.Casting && targetStage === ProductionStage.Setting && !batch.requires_setting) {
            showToast(`Το ${batch.sku} δεν έχει Ζιργκόν. Προχωρήστε στο επόμενο στάδιο.`, 'info');
            return;
        }

        if (batch.current_stage === ProductionStage.AwaitingDelivery) {
            handleImportReceive(batch, targetStage, pendingDispatch);
            return;
        }

        // If skipModal is true or quantity is 1, move directly without showing modal
        if (skipModal || batch.quantity === 1) {
            handleDirectMove(batch, targetStage, pendingDispatch);
            return;
        }

        setSplitModalState({ batch, targetStage, pendingDispatch });
    };

    const handleDirectMove = async (batch: ProductionBatch, targetStage: ProductionStage, pendingDispatch?: boolean) => {
        setIsProcessingSplit(true);
        try {
            await productionRepository.updateBatchStage(batch.id, targetStage, profile?.full_name, pendingDispatch);
            await auditRepository.logAction(profile?.full_name || 'System', 'Μετακίνηση Παρτίδας', { sku: batch.sku, target_stage: targetStage });
            await invalidateOrdersAndBatches(queryClient);
            showToast('Η παρτίδα μετακινήθηκε.', 'success');
        } catch (e: any) {
            console.error("Move failure:", e);
            showToast(`Σφάλμα: ${e.message}`, 'error');
        } finally {
            setIsProcessingSplit(false);
        }
    };

    const handleDrop = async (targetStage: ProductionStage, pendingDispatch?: boolean) => {
        if (!draggedBatchId) return;
        const batch = enhancedBatches.find(b => b.id === draggedBatchId);
        if (!batch) return;
        attemptMove(batch, targetStage, false, pendingDispatch ?? (targetStage === ProductionStage.Polishing ? true : undefined));
    };

    const handleImportReceive = async (batch: ProductionBatch, targetStage: ProductionStage, pendingDispatch?: boolean) => {
        const targetStageInfo = STAGES.find(s => s.id === targetStage);
        const confirmed = await confirm({
            title: 'Παραλαβή Εισαγόμενου',
            message: `Επιβεβαιώνετε την παραλαβή για την παρτίδα ${batch.sku}${batch.variant_suffix || ''} (${batch.quantity} τμχ) και τη μετακίνηση στο στάδιο "${targetStageInfo?.label}"?`,
            confirmText: 'Επιβεβαίωση'
        });

        if (!confirmed) return;

        // If batch has more than 1 item, ask how many were actually delivered by the supplier
        if (batch.quantity > 1) {
            setSplitModalState({ batch, targetStage, isReceive: true, pendingDispatch });
            return;
        }

        setIsProcessingSplit(true);
        try {
            await productionRepository.updateBatchStage(batch.id, targetStage, profile?.full_name, pendingDispatch);
            await auditRepository.logAction(profile?.full_name || 'System', 'Παραλαβή Εισαγόμενου', { sku: batch.sku, quantity: batch.quantity, target_stage: targetStage });
            await invalidateOrdersAndBatches(queryClient);
            showToast('Η παρτίδα παραλήφθηκε και μετακινήθηκε.', 'success');
        } catch (e: any) {
            showToast(`Σφάλμα: ${e.message}`, 'error');
        } finally {
            setIsProcessingSplit(false);
        }
    };

    const handleConfirmSplit = async (quantityToMove: number, finalTargetStage: ProductionStage) => {
        if (!splitModalState) return;

        const { batch, isReceive } = splitModalState;
        const targetStage = finalTargetStage;

        setIsProcessingSplit(true);

        try {
            if (quantityToMove >= batch.quantity) {
                // Move the whole batch
                await productionRepository.updateBatchStage(batch.id, targetStage, profile?.full_name, splitModalState?.pendingDispatch);
                await auditRepository.logAction(profile?.full_name || 'System', isReceive ? 'Παραλαβή Εισαγόμενου' : 'Μετακίνηση Παρτίδας', { sku: batch.sku, target_stage: targetStage });
            } else {
                // Split the batch
                const originalNewQty = batch.quantity - quantityToMove;

                // Strictly sanitize the object for DB insertion to avoid column errors
                const {
                    product_details,
                    product_image,
                    diffHours,
                    isDelayed,
                    customer_name,
                    id,
                    requires_setting, // Computed or logic-only property
                    ...dbBatch
                } = batch as any;

                const newBatchData = {
                    ...dbBatch,
                    id: crypto.randomUUID(), // Explicitly generate new ID for the split
                    quantity: quantityToMove,
                    current_stage: targetStage,
                    created_at: batch.created_at,
                    updated_at: new Date().toISOString(),
                    requires_setting: !!requires_setting, // DB now supports this column
                    ...(targetStage === ProductionStage.Polishing ? { pending_dispatch: splitModalState?.pendingDispatch ?? true } : {}),
                };

                await productionRepository.splitBatch(batch.id, originalNewQty, newBatchData, profile?.full_name);
                await auditRepository.logAction(profile?.full_name || 'System', isReceive ? 'Μερική Παραλαβή Εισαγόμενου' : 'Διαχωρισμός Παρτίδας', { sku: batch.sku, moving_qty: quantityToMove, target_stage: targetStage });
            }

            await invalidateOrdersAndBatches(queryClient);
            showToast(isReceive ? `Παραλήφθηκαν ${quantityToMove} τμχ. Τα υπόλοιπα παραμένουν στην Αναμονή.` : 'Η παρτίδα μετακινήθηκε.', 'success');
            setSplitModalState(null);

        } catch (e: any) {
            console.error("Split failure:", e);
            showToast(`Σφάλμα: ${e.message}`, 'error');
        } finally {
            setIsProcessingSplit(false);
        }
    };

    const handleDeleteBatch = async (batch: ProductionBatch) => {
        const yes = await confirm({
            title: 'Διαγραφή Παρτίδας',
            message: `Είστε σίγουροι ότι θέλετε να διαγράψετε την παρτίδα ${batch.sku}${batch.variant_suffix || ''} (${batch.quantity} τμχ);`,
            isDestructive: true,
            confirmText: 'Διαγραφή'
        });

        if (yes) {
            try {
                await productionRepository.deleteProductionBatch(batch.id);
                await auditRepository.logAction(profile?.full_name || 'System', 'Διαγραφή Παρτίδας', { sku: batch.sku, quantity: batch.quantity });
                await invalidateOrdersAndBatches(queryClient);
                showToast("Η παρτίδα διαγράφηκε.", "success");
            } catch (e) {
                showToast("Σφάλμα κατά τη διαγραφή.", "error");
            }
        }
    };

    const handleSaveNote = async (newNote: string) => {
        if (!editingNoteBatch) return;
        setIsSavingNote(true);
        try {
            const { error } = await productionRepository.updateBatchNotes(editingNoteBatch.id, newNote || null);
            if (error) throw error;

            await invalidateProductionBatches(queryClient);
            showToast("Η σημείωση αποθηκεύτηκε.", "success");
            setEditingNoteBatch(null);
        } catch (e) {
            showToast("Σφάλμα αποθήκευσης σημειώσεις.", "error");
        } finally {
            setIsSavingNote(false);
        }
    };

    const handleToggleHold = async (batch: ProductionBatch) => {
        if (batch.on_hold) {
            // Resume directly
            await productionRepository.toggleBatchHold(batch.id, false);
            await invalidateProductionBatches(queryClient);
            showToast("Η παρτίδα συνεχίζει την παραγωγή.", "success");
        } else {
            // Open Modal
            setHoldingBatch(batch);
        }
    };

    const confirmHold = async (reason: string) => {
        if (!holdingBatch) return;
        setIsSavingNote(true);
        try {
            await productionRepository.toggleBatchHold(holdingBatch.id, true, reason);
            await invalidateProductionBatches(queryClient);
            showToast("Η παρτίδα τέθηκε σε αναμονή.", "warning");
            setHoldingBatch(null);
        } catch (e) {
            showToast("Σφάλμα.", "error");
        } finally {
            setIsSavingNote(false);
        }
    };

    // ── Dispatch to Technician (pending_dispatch) ────────────────────────────
    const handleDispatchBatches = async (batchIds: string[]) => {
        if (batchIds.length === 0) return;
        setIsProcessingSplit(true);
        try {
            const count = await productionRepository.markBatchesDispatched(batchIds, profile?.full_name);
            await invalidateProductionBatches(queryClient);
            showToast(`${count} παρτίδ${count === 1 ? 'α' : 'ες'} στάλθηκ${count === 1 ? 'ε' : 'αν'} στον Τεχνίτη.`, 'success');
        } catch (e: any) {
            showToast(`Σφάλμα: ${e.message}`, 'error');
        } finally {
            setIsProcessingSplit(false);
        }
    };

    // ── Recall batches back to pending dispatch ──────────────────────────────
    const handleRecallDispatchBatches = async (batchIds: string[]) => {
        if (batchIds.length === 0) return;
        setIsProcessingSplit(true);
        try {
            const count = await productionRepository.markBatchesPendingDispatch(batchIds, profile?.full_name);
            await invalidateProductionBatches(queryClient);
            showToast(`${count} παρτίδ${count === 1 ? 'α' : 'ες'} επέστρεψ${count === 1 ? 'ε' : 'αν'} σε Αναμονή.`, 'success');
        } catch (e: any) {
            showToast(`Σφάλμα: ${e.message}`, 'error');
        } finally {
            setIsProcessingSplit(false);
        }
    };

    const handleMoveBatch = (batch: ProductionBatch, stage: ProductionStage, options?: { pendingDispatch?: boolean }) => {
        attemptMove(batch, stage, false, options?.pendingDispatch);
    }

    const toggleBatchSelect = useCallback((batchId: string) => {
        setMultiSelectIds(prev => {
            const next = new Set(prev);
            if (next.has(batchId)) next.delete(batchId);
            else next.add(batchId);
            return next;
        });
    }, []);

    const handleBulkMove = async () => {
        if (!bulkMoveTarget || multiSelectIds.size === 0) return;
        const batchesToMove = enhancedBatches.filter(b => {
            if (!multiSelectIds.has(b.id) || b.on_hold) return false;
            if (b.current_stage !== bulkMoveTarget) return true;
            // Same stage is only valid for Polishing sub-stage switching
            if (bulkMoveTarget === ProductionStage.Polishing && bulkMovePendingDispatch !== undefined) {
                return b.pending_dispatch !== bulkMovePendingDispatch;
            }
            return false;
        });
        if (batchesToMove.length === 0) {
            showToast('Δεν υπάρχουν παρτίδες για μετακίνηση.', 'info');
            return;
        }
        setIsBulkMoving(true);
        try {
            // Batches that need an actual stage change
            const stageChangeBatches = batchesToMove.filter(b => b.current_stage !== bulkMoveTarget);
            // Batches already at Polishing that only need their pending_dispatch toggled
            const pendingDispatchToggleBatches = batchesToMove.filter(
                b => b.current_stage === ProductionStage.Polishing && bulkMoveTarget === ProductionStage.Polishing
            );

            await Promise.all([
                ...stageChangeBatches.map(b =>
                    productionRepository.updateBatchStage(b.id, bulkMoveTarget!, profile?.full_name, bulkMovePendingDispatch)
                ),
                ...(pendingDispatchToggleBatches.length > 0
                    ? [bulkMovePendingDispatch === false
                        ? productionRepository.markBatchesDispatched(pendingDispatchToggleBatches.map(b => b.id), profile?.full_name)
                        : productionRepository.markBatchesPendingDispatch(pendingDispatchToggleBatches.map(b => b.id), profile?.full_name)]
                    : []
                ),
            ]);
            await auditRepository.logAction(profile?.full_name || 'System', 'Μαζική Μετακίνηση Παρτίδων', { count: batchesToMove.length, target_stage: bulkMoveTarget });
            await invalidateOrdersAndBatches(queryClient);
            showToast(`${batchesToMove.length} παρτίδες μετακινήθηκαν.`, 'success');
            setMultiSelectIds(new Set());
            setBulkMoveTarget(null);
            setBulkMovePendingDispatch(undefined);
        } catch (e: any) {
            showToast(`Σφάλμα: ${e.message}`, 'error');
        } finally {
            setIsBulkMoving(false);
        }
    };

    const handleViewHistory = async (batch: ProductionBatch) => {
        setHistoryModalBatch(batch);
        setIsLoadingHistory(true);
        try {
            const history = await productionRepository.getBatchHistory(batch.id);
            setBatchHistory(history);
        } catch (e) {
            console.error('Failed to load batch history:', e);
            setBatchHistory([]);
        } finally {
            setIsLoadingHistory(false);
        }
    };

    // Determines next logical stage for "Quick Move" button
    const handleQuickNext = (batch: ProductionBatch) => {
        const nextStage = getNextProductionStage(batch.current_stage, batch);
        if (nextStage) attemptMove(batch, nextStage, false, nextStage === ProductionStage.Polishing ? true : undefined);
    };

    const groupedStageBatches = useMemo(() => {
        return STAGES.reduce<Record<string, Record<string, Record<string, (ProductionBatch & { customer_name?: string })[]>>>>((acc, stage) => {
            acc[stage.id] = groupProductionBatchesForDisplay(
                stageBatchesByStage[stage.id] || [],
                collectionsMap,
                groupMode,
                sortOrder,
            );
            return acc;
        }, {});
    }, [stageBatchesByStage, groupMode, sortOrder, collectionsMap]);

    // ── Polishing column sub-groups: pending dispatch vs dispatched ──────────
    const polishingPendingBatches = useMemo(
        () => (stageBatchesByStage[ProductionStage.Polishing] || []).filter(b => b.pending_dispatch),
        [stageBatchesByStage]
    );
    const polishingDispatchedBatches = useMemo(
        () => (stageBatchesByStage[ProductionStage.Polishing] || []).filter(b => !b.pending_dispatch),
        [stageBatchesByStage]
    );
    const groupedPolishingPending = useMemo(
        () => groupProductionBatchesForDisplay(polishingPendingBatches as any, collectionsMap, groupMode, sortOrder),
        [polishingPendingBatches, collectionsMap, groupMode, sortOrder]
    );
    const groupedPolishingDispatched = useMemo(
        () => groupProductionBatchesForDisplay(polishingDispatchedBatches as any, collectionsMap, groupMode, sortOrder),
        [polishingDispatchedBatches, collectionsMap, groupMode, sortOrder]
    );

    const preparationBatches = useMemo(
        () => enhancedBatches.filter(batch => [ProductionStage.Waxing, ProductionStage.Casting].includes(batch.current_stage)),
        [enhancedBatches]
    );

    const technicianBatches = useMemo(
        () => stageBatchesByStage[ProductionStage.Polishing] || [],
        [stageBatchesByStage]
    );

    const labelingBatches = useMemo(
        () => (stageBatchesByStage[ProductionStage.Labeling] || []).filter(batch => !batch.on_hold),
        [stageBatchesByStage]
    );

    // Sort Order for Genders
    const SORTED_GENDERS = [Gender.Women, Gender.Men, Gender.Unisex, 'Unknown'];

    // Handle Print Request with Modal (New Logic)
    const handlePrintRequest = (batchesToPrint: EnhancedProductionBatch[], type: PrintSelectorType) => {
        // Filter out completed if needed, but usually we print whatever is passed
        const validBatches = batchesToPrint.filter(b => !b.on_hold);

        if (validBatches.length === 0) {
            showToast("Δεν υπάρχουν επιλέξιμες παρτίδες για εκτύπωση.", "info");
            return;
        }

        setPrintSelectorState({
            isOpen: true,
            type: type,
            batches: validBatches
        });
    };

    const handleCompleteAllLabeling = async () => {
        if (labelingBatches.length === 0) {
            showToast("Δεν υπάρχουν παρτίδες για ολοκλήρωση.", "info");
            return;
        }
        setIsProcessingSplit(true);
        try {
            await Promise.all(labelingBatches.map(async (batch) => {
                await productionRepository.updateBatchStage(batch.id, ProductionStage.Ready, profile?.full_name);
                await auditRepository.logAction(profile?.full_name || 'System', 'Μετακίνηση Παρτίδας', { sku: batch.sku, target_stage: ProductionStage.Ready });
            }));
            await invalidateOrdersAndBatches(queryClient);
            showToast(`${labelingBatches.length} παρτίδες ολοκληρώθηκαν.`, 'success');
        } catch (e: any) {
            console.error("Complete all failure:", e);
            showToast(`Σφάλμα: ${e.message}`, 'error');
        } finally {
            setIsProcessingSplit(false);
        }
    };

    const handlePrintStageLabels = (stageId: string) => {
        const stageBatches = (stageBatchesByStage[stageId] || []).filter(batch => !batch.on_hold);

        if (stageBatches.length === 0) {
            showToast("Δεν υπάρχουν παρτίδες για εκτύπωση.", "info");
            return;
        }

        setLabelPrintSortMode('as_sent');
        setPrintSelectorState({
            isOpen: true,
            type: 'labels',
            batches: stageBatches
        });
    };

    const handleOpenStagePdfBatchPicker = (stageId: ProductionStage) => {
        if (!onPrintStageBatches) return;
        const stageConf = STAGES.find(s => s.id === stageId);
        if (!stageConf) return;
        const list = stageBatchesByStage[stageId] || [];
        if (list.length === 0) {
            showToast('Δεν υπάρχουν παρτίδες για εκτύπωση.', 'info');
            return;
        }
        setPrintSelectorState({
            isOpen: true,
            type: 'stagePdf',
            batches: list,
            stageMeta: { stageId, stageName: stageConf.label },
        });
    };

    const handleAssemblyOrderPrintConfirm = (selectedOrderIds: string[]) => {
        if (!onPrintAssembly) return;

        const selectedCandidates = assemblyOrderCandidates.filter((candidate) => selectedOrderIds.includes(candidate.order.id));
        const rows = selectedCandidates.flatMap((candidate) => candidate.rows);

        if (rows.length === 0) {
            showToast("Δεν βρέθηκαν assembly είδη για τις επιλεγμένες εντολές.", "info");
            return;
        }

        onPrintAssembly({
            rows,
            selected_order_ids: selectedOrderIds,
            generated_at: new Date().toISOString()
        });
    };

    const executePrint = (selected: ProductionBatch[]) => {
        const type = printSelectorState.type;
        if (type === 'technician') onPrintTechnician(selected);
        else if (type === 'preparation') onPrintPreparation(selected);
        else if (type === 'aggregated') onPrintAggregated(selected);
        else if (type === 'labels') {
            const printQueue = buildLabelPrintQueue(selected as EnhancedProductionBatch[], labelPrintSortMode, productsMap);
            if (printQueue.length > 0 && onPrintLabels) {
                onPrintLabels(printQueue);
                const modeLabel = labelPrintSortMode === 'as_sent' ? 'Σειρά Αποστολής' : 'Ταξινόμηση ανά Πελάτη';
                const totalQuantity = printQueue.reduce((sum, item) => sum + item.quantity, 0);
                showToast(`Στάλθηκαν ${totalQuantity} τεμάχια για εκτύπωση ετικετών (${modeLabel}).`, "success");
            } else {
                showToast("Δεν βρέθηκαν προϊόντα για τις παρτίδες.", "error");
            }
        } else if (type === 'stagePdf') {
            const meta = printSelectorState.stageMeta;
            if (!meta || !onPrintStageBatches || selected.length === 0) return;
            const orderIds = [...new Set(selected.map(b => (b.order_id || '').trim()).filter(Boolean))];
            let customerName: string;
            let orderId: string;
            if (orderIds.length === 1) {
                orderId = orderIds[0];
                customerName = selected.find(b => (b.order_id || '').trim() === orderId)?.customer_name?.trim() || '—';
            } else if (orderIds.length === 0) {
                orderId = '';
                const names = [...new Set(selected.map(b => (b.customer_name || '').trim()).filter(Boolean))];
                customerName =
                    names.length === 1 ? names[0]
                    : names.length > 1 ? 'Διάφοροι πελάτες (χωρίς εντολή)'
                    : 'Χωρίς εντολή';
            } else {
                orderId = '';
                customerName = `Πολλαπλές εντολές (${orderIds.length})`;
            }
            onPrintStageBatches({
                stageName: meta.stageName,
                stageId: meta.stageId,
                customerName,
                orderId,
                batches: selected,
                generatedAt: new Date().toISOString(),
            });
        }
    };

    if (isLoading) return <div className="p-12 text-center text-slate-400">Φόρτωση παραγωγής...</div>;

    if (batchesError) {
        return (
            <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-6 rounded-r-xl max-w-2xl" role="alert">
                <p className="font-bold mb-2">Σφάλμα φόρτωσης</p>
                <p>Δεν ήταν δυνατή η φόρτωση παρτίδων παραγωγής.</p>
                <p className="text-sm mt-4 font-mono bg-red-100/50 p-2 rounded">{(batchesErr as Error)?.message}</p>
                <button onClick={() => refetchBatches()} className="mt-4 px-4 py-2 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors">
                    Ανανέωση
                </button>
            </div>
        );
    }

    // ── Reusable batch-groups renderer (used for normal columns + Polishing sub-sections) ──
    const renderBatchGroups = (groupedData: Record<string, Record<string, (ProductionBatch & { customer_name?: string })[]>>, options?: { onRecallDispatch?: (batchId: string) => void }) => {
        const level1Keys =
            groupMode === 'customer'
                ? sortProductionDisplayLevel1Keys(Object.keys(groupedData), groupedData as any, groupMode, sortOrder)
                : SORTED_GENDERS;

        return level1Keys.map(level1Key => {
            const l1Batches = groupedData[level1Key];
            if (!l1Batches || Object.keys(l1Batches).length === 0) return null;

            const gConfig = groupMode === 'customer' ? null : (GENDER_CONFIG[level1Key] || GENDER_CONFIG['Unknown']);
            // Collection order is set inside groupProductionBatchesForDisplay (chronology or el alpha).
            const collectionKeys = Object.keys(l1Batches);

            const allClientBatches = Object.values(l1Batches).flat();
            const allClientBatchIds = allClientBatches.map(b => b.id);
            const allSelected = allClientBatchIds.length > 0 && allClientBatchIds.every(id => multiSelectIds.has(id));
            const someSelected = allClientBatchIds.some(id => multiSelectIds.has(id)) && !allSelected;

            return (
                <div key={level1Key} className="space-y-3">
                    {groupMode === 'customer' ? (
                        <div className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg border bg-slate-900 text-white border-slate-900 shadow-sm flex justify-between items-center`}>
                            <div className="flex items-center gap-2">
                                {/* Multi-select checkbox for client */}
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setMultiSelectIds(prev => {
                                            const next = new Set(prev);
                                            if (allSelected) {
                                                allClientBatchIds.forEach(id => next.delete(id));
                                            } else {
                                                allClientBatchIds.forEach(id => next.add(id));
                                            }
                                            return next;
                                        });
                                    }}
                                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                                        allSelected
                                            ? 'bg-blue-500 border-blue-500 shadow-sm shadow-blue-200'
                                            : someSelected
                                                ? 'bg-blue-300 border-blue-300'
                                                : 'bg-transparent border-white/50 hover:border-white'
                                    }`}
                                    title={allSelected ? 'Αποεπιλογή όλων' : 'Επιλογή όλων'}
                                >
                                    {(allSelected || someSelected) && (
                                        <Check size={12} className="text-white" />
                                    )}
                                </button>
                                <span>{level1Key}</span>
                            </div>
                            <span className="opacity-60 text-[9px]">{allClientBatches.length}</span>
                        </div>
                    ) : (
                        <div className={`text-xs font-black uppercase tracking-widest px-3 py-1.5 rounded-lg border ${gConfig?.style} flex justify-between items-center`}>
                            <span>{gConfig?.label}</span>
                            <span className="opacity-60 text-[9px]">{Object.values(l1Batches).flat().length}</span>
                        </div>
                    )}

                    {collectionKeys.map(collName => (
                        <div key={collName} className="pl-2 border-l-2 border-slate-200 ml-1 space-y-2">
                            <div className="flex items-center gap-2 px-1">
                                <FolderKanban size={10} className="text-slate-400" />
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">{collName}</span>
                            </div>

                            {l1Batches[collName].map((batch, idx) => (
                                <React.Fragment key={batch.id}>
                                    {idx > 0 && l1Batches[collName][idx - 1].sku !== batch.sku && (
                                        <div className="border-t border-slate-200 my-2" />
                                    )}
                                    <ProductionBatchCard
                                        batch={batch}
                                        onDragStart={handleDragStart}
                                        onMoveToStage={(b, stg, opts) => attemptMove(b, stg, false, opts?.pendingDispatch)}
                                        onEditNote={() => setEditingNoteBatch(batch)}
                                        onToggleHold={() => handleToggleHold(batch)}
                                        onDelete={() => handleDeleteBatch(batch)}
                                        onClick={() => setViewBuildBatch(batch)}
                                        onViewHistory={handleViewHistory}
                                        isSelected={multiSelectIds.has(batch.id)}
                                        onToggleSelect={(e) => { e.stopPropagation(); toggleBatchSelect(batch.id); }}
                                        onDispatch={batch.current_stage === ProductionStage.Polishing && batch.pending_dispatch ? () => handleDispatchBatches([batch.id]) : undefined}
                                        onRecallDispatch={options?.onRecallDispatch && batch.current_stage === ProductionStage.Polishing && !batch.pending_dispatch ? () => options.onRecallDispatch!(batch.id) : undefined}
                                    />
                                </React.Fragment>
                            ))}
                        </div>
                    ))}
                </div>
            );
        });
    };

    return (
        <div className="h-[calc(100vh-100px)] flex flex-col space-y-4">

            <DesktopPageHeader
                padding="compact"
                icon={Factory}
                title="Παραγωγή"
                tailClassName="flex w-full min-w-0 flex-1 flex-col gap-3 lg:flex-row lg:items-center lg:gap-4"
                tail={(
                    <>
                        <div className="mx-4 flex w-full min-w-[260px] flex-1 gap-2">
                    <button
                        onClick={() => setIsMoldModalOpen(true)}
                        className="hidden lg:flex p-3 rounded-2xl border transition-all shadow-sm bg-white border-slate-200 text-slate-500 hover:text-slate-800 hover:border-slate-300"
                        title="Υπολογισμός Λάστιχων"
                    >
                        <Grid size={20} />
                    </button>
                    <button
                        onClick={() => setQuickPickerOpen(true)}
                        disabled={quickPickEntries.length === 0}
                        className={`hidden lg:flex p-3 rounded-2xl border transition-all shadow-sm ${quickPickEntries.length > 0 ? 'bg-white border-slate-200 text-slate-500 hover:text-slate-800' : 'bg-slate-100 border-slate-100 text-slate-300 cursor-not-allowed'}`}
                        title={quickPickEntries.length > 0 ? "Άμεση Διαχείριση Παραγωγής" : "Δεν υπάρχουν πελάτες σε παραγωγή"}
                    >
                        <ClipboardList size={20} />
                    </button>
                    {/* Compact Sorting Controls */}
                    <div className="hidden lg:flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5">
                        <button
                            onClick={() => setGroupMode('gender')}
                            className={`p-1.5 rounded-md transition-all ${groupMode === 'gender' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-400 hover:text-slate-600'}`}
                            title="Κατά Φύλο"
                        >
                            <Palette size={12} />
                        </button>
                        <button
                            onClick={() => setGroupMode('customer')}
                            className={`p-1.5 rounded-md transition-all ${groupMode === 'customer' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-400 hover:text-slate-600'}`}
                            title="Ανά Πελάτη"
                        >
                            <Users size={12} />
                        </button>
                        <div className="w-px h-3 bg-slate-300 mx-0.5" />
                        <button
                            onClick={() => setSortOrder(sortOrder === 'newest' ? 'alpha' : 'newest')}
                            className={`p-1.5 rounded-md transition-all ${sortOrder === 'newest' ? 'bg-blue-500 text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                            title="Νεότερα Πρώτα"
                        >
                            <ArrowDown size={12} />
                        </button>
                        <button
                            onClick={() => setSortOrder(sortOrder === 'oldest' ? 'alpha' : 'oldest')}
                            className={`p-1.5 rounded-md transition-all ${sortOrder === 'oldest' ? 'bg-orange-500 text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                            title="Παλαιότερα Πρώτα"
                        >
                            <ArrowUp size={12} />
                        </button>
                    </div>
                    <div className="relative group flex-1 min-w-0">
                        <input
                            type="text"
                            value={finderTerm}
                            onChange={(e) => setFinderTerm(e.target.value)}
                            placeholder="Εύρεση SKU / Εντολής / Πελάτη..."
                            className="w-full pl-10 p-3 rounded-2xl bg-slate-100 border border-slate-200 outline-none focus:ring-4 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-bold text-slate-800 uppercase"
                        />
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-600" size={18} />
                        {finderTerm && (
                            <button onClick={() => setFinderTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X size={16} /></button>
                        )}

                        {/* RESULTS DROPDOWN */}
                        {finderTerm.length >= 2 && (
                            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-white rounded-2xl shadow-xl border border-slate-100 z-50 max-h-[70vh] overflow-y-auto custom-scrollbar p-2 space-y-2 w-[900px] max-w-[calc(100vw-3rem)]">
                                {foundBatches.length > 0 && (
                                    <div className="flex items-center justify-between px-1 pb-1 border-b border-slate-100 mb-1">
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                            {foundBatches.length} αποτελέσματα
                                        </span>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                const allSelected = foundBatches.every(b => multiSelectIds.has(b.id));
                                                setMultiSelectIds(prev => {
                                                    const next = new Set(prev);
                                                    if (allSelected) {
                                                        foundBatches.forEach(b => next.delete(b.id));
                                                    } else {
                                                        foundBatches.forEach(b => next.add(b.id));
                                                    }
                                                    return next;
                                                });
                                            }}
                                            className="text-[10px] font-black text-blue-600 hover:text-blue-800 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors"
                                        >
                                            {foundBatches.every(b => multiSelectIds.has(b.id))
                                                ? <><Square size={11} /> Αποεπιλογή Όλων</>
                                                : <><CheckSquare size={11} /> Επιλογή Όλων</>
                                            }
                                        </button>
                                    </div>
                                )}
                                {foundBatches.map((b, index) => {
                                    const stageConf = STAGES.find(s => s.id === b.current_stage);
                                    const isPendingPolishing = b.current_stage === ProductionStage.Polishing && b.pending_dispatch;
                                    const colors = isPendingPolishing
                                        ? { text: 'text-teal-700', border: 'border-teal-200' }
                                        : (STAGE_COLORS[stageConf?.color as keyof typeof STAGE_COLORS] || STAGE_COLORS['slate']);
                                    const finderBadgeClass = `bg-white/70 backdrop-blur-sm ${colors.text} ${colors.border}`;
                                    const age = getBatchAgeInfo(b);
                                    const isSpecialBatch = isSpecialCreationSku(b.sku);
                                    const finderRowSurface = isPendingPolishing
                                        ? 'bg-teal-50/25 border border-teal-100/80 border-l-4 border-l-teal-400/45 hover:bg-teal-50/40'
                                        : getFinderSearchResultSurface(stageConf?.color);
                                    const isSelected = multiSelectIds.has(b.id);

                                    return (
                                        <div
                                            key={b.id}
                                            onClick={() => setViewBuildBatch(b)}
                                            className={`rounded-xl p-3 transition-all group cursor-pointer ${finderRowSurface} ${isSpecialBatch ? 'ring-1 ring-violet-200/65' : ''} ${isSelected ? '!ring-2 !ring-blue-400 ring-offset-0 !border-blue-300/80 !bg-blue-50/35' : ''} ${index > 0 ? 'mt-1 border-t border-t-slate-200/60 pt-3' : ''}`}
                                        >
                                            <div className="flex justify-between items-start">
                                                <div className="flex items-start gap-2">
                                                    {/* Selection checkbox */}
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); toggleBatchSelect(b.id); }}
                                                        className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                                                            isSelected
                                                                ? 'bg-blue-500 border-blue-500 shadow-sm shadow-blue-200'
                                                                : 'bg-white border-slate-300 hover:border-blue-400'
                                                        }`}
                                                        title={isSelected ? 'Αποεπιλογή' : 'Επιλογή'}
                                                    >
                                                        {isSelected && <Check size={11} className="text-white" />}
                                                    </button>

                                                    <div className="flex items-start gap-3 min-w-0">
                                                        {/* Image */}
                                                        <div className="w-10 h-10 bg-slate-100 rounded-lg overflow-hidden border border-slate-200 shrink-0 relative">
                                                            {b.product_image ? <img src={b.product_image} className="w-full h-full object-cover" /> : <ImageIcon size={16} className="m-auto text-slate-300" />}
                                                            <div className="absolute bottom-0 right-0 bg-slate-900 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-tl-lg leading-none">
                                                                x{b.quantity}
                                                            </div>
                                                        </div>

                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <SkuColorizedText sku={b.sku} suffix={b.variant_suffix || ''} gender={b.product_details?.gender} className="font-black text-lg" masterClassName={isSpecialBatch ? 'text-violet-900' : 'text-slate-800'} />
                                                                <span className="bg-slate-900 text-white px-2 py-0.5 rounded-md text-xs font-bold shadow-sm">x{b.quantity}</span>
                                                                {b.size_info && <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs font-black flex items-center gap-1"><Hash size={10} /> {b.size_info}</span>}
                                                                {b.on_hold && <span className="bg-amber-100 text-amber-800 border border-amber-200 px-2 py-0.5 rounded text-[10px] font-black flex items-center gap-1"><PauseCircle size={10} /> Σε Αναμονή</span>}
                                                            </div>
                                                            <div className="flex items-center justify-between mt-1 gap-2 min-w-[200px]">
                                                                <span className="font-bold text-slate-700 text-xs">{b.customer_name || 'Unknown'}</span>
                                                                {b.on_hold ? (
                                                                    <div className="text-[9px] font-black px-1.5 py-0.5 rounded border flex items-center gap-1 bg-amber-50 text-amber-700 border-amber-200">
                                                                        <PauseCircle size={10} /> Hold
                                                                    </div>
                                                                ) : (
                                                                    <div className={`text-[9px] font-black px-1.5 py-0.5 rounded border flex items-center gap-1 ${age.style}`}>
                                                                        <Clock size={10} /> {age.label}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="text-right flex flex-col items-end gap-1">
                                                    <div className="text-[10px] font-mono text-slate-400">#{formatOrderId(b.order_id)}</div>
                                                    <span className={`text-[10px] uppercase font-bold border px-2 py-0.5 rounded flex items-center gap-1 shadow-sm ${finderBadgeClass}`}>
                                                        {stageConf?.icon && React.cloneElement(stageConf.icon as any, { size: 10 })}
                                                        {b.current_stage === ProductionStage.Polishing
                                                            ? (b.pending_dispatch ? 'Τεχν. • Αναμονή' : 'Τεχν. • Στον Τεχν.')
                                                            : (stageConf?.label || b.current_stage)}
                                                    </span>
                                                </div>
                                            </div>
                                            <FinderBatchStageSelector 
                                                batch={b} 
                                                onMoveToStage={(batch, stage, opts) => attemptMove(batch, stage, true, opts?.pendingDispatch)}
                                                onToggleHold={handleToggleHold}
                                                onEditNote={(b) => setEditingNoteBatch(b)}
                                            />
                                        </div>
                                    )
                                })}
                                {foundBatches.length === 0 && <div className="p-4 text-center text-slate-400 text-xs italic">Δεν βρέθηκαν ενεργές παρτίδες.</div>}
                            </div>
                        )}
                    </div>
                </div>

            <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                        onClick={() => setAssemblyOrderSelectorOpen(true)}
                        disabled={assemblyOrderCandidates.length === 0}
                        className="flex items-center gap-1.5 bg-pink-50 text-pink-700 px-3 py-1.5 rounded-xl hover:bg-pink-100 font-semibold transition-all shadow-sm border border-pink-200 disabled:opacity-50 disabled:cursor-not-allowed text-[11px]"
                    >
                        <Layers size={12} /> Συναρμολόγηση
                    </button>
                    <button
                        onClick={() => handlePrintRequest(preparationBatches, 'preparation')}
                        className="flex items-center gap-1.5 bg-blue-50 text-blue-700 px-3 py-1.5 rounded-xl hover:bg-blue-100 font-semibold transition-all shadow-sm border border-blue-200 disabled:opacity-50 text-[11px]"
                    >
                        <BookOpen size={12} /> Προετοιμασία
                    </button>
                    <button
                        onClick={() => handlePrintRequest(technicianBatches, 'technician')}
                        className="flex items-center gap-1.5 bg-purple-50 text-purple-700 px-3 py-1.5 rounded-xl hover:bg-purple-100 font-semibold transition-all shadow-sm border border-purple-200 disabled:opacity-50 text-[11px]"
                    >
                        <Hammer size={12} /> Τεχνίτης
                    </button>
                    <button
                        onClick={() => handlePrintRequest(enhancedBatches, 'aggregated')}
                        className="flex items-center gap-1.5 bg-slate-100 text-slate-700 px-3 py-1.5 rounded-xl hover:bg-slate-200 font-semibold transition-all shadow-sm border border-slate-200 disabled:opacity-50 text-[11px]"
                    >
                        <FileText size={12} /> Συγκεντρωτική
                    </button>
                </div>
                    </>
                )}
            />

            <ProductionHealthPanel
                summary={productionHealthSummary}
                notes={activeProductionNotes}
                alertGroups={criticalAlertGroups}
                onFilterClick={(type) => setOverviewModal({ isOpen: true, type })}
            />

            <div className="flex-1 overflow-x-auto overflow-y-auto pb-4 custom-scrollbar lg:overflow-y-hidden">
                <div className="flex flex-col lg:flex-row gap-4 h-auto lg:h-full lg:min-w-max">
                    {STAGES.map(stage => {
                        const stageBatches = stageBatchesByStage[stage.id] || [];
                        const groupedData = groupedStageBatches[stage.id] || {};

                        const colors = STAGE_COLORS[stage.color as keyof typeof STAGE_COLORS];
                        const isTarget = dropTarget === stage.id;
                        const isExpanded = expandedStageId === stage.id;

                        // ── Two separate Kanban panels for the Polishing (Τεχνίτης) sub-stages ──
                        if (stage.id === ProductionStage.Polishing) {
                            const pendingCollapsed = polishingFocus === 'dispatched';
                            const dispatchedCollapsed = polishingFocus === 'pending';

                            return (
                                <div
                                    key={stage.id}
                                    className="flex flex-col gap-4 w-full lg:w-80 lg:h-full"
                                    onDragLeave={(e) => {
                                        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                                            setDropTarget(null);
                                            setPolishingDropTarget(null);
                                        }
                                    }}
                                    onDragEnd={handleDragEnd}
                                >
                                    {/* ── Panel 1: Αναμονή Αποστολής (teal) ── */}
                                    <div
                                        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDropTarget(ProductionStage.Polishing); setPolishingDropTarget('pending'); }}
                                        onDrop={() => { void handleDrop(ProductionStage.Polishing, true); setPolishingDropTarget(null); }}
                                        className={`flex flex-col rounded-3xl border transition-all duration-300 w-full min-h-[180px] lg:min-h-0 ${pendingCollapsed ? 'lg:flex-none' : 'lg:flex-1'} ${polishingDropTarget === 'pending' ? 'bg-emerald-50 border-emerald-300 shadow-2xl scale-[1.01]' : 'bg-teal-50 border-teal-200'}`}
                                    >
                                        <div className={`p-4 rounded-t-3xl flex justify-between items-center bg-teal-100/60 ${pendingCollapsed ? 'rounded-b-3xl' : 'border-b border-teal-200'}`}>
                                            <div className="flex items-center gap-3">
                                                <button
                                                    onClick={() => { setStageInspectorInitialPolishingTab('pending'); setStageInspectorStage(ProductionStage.Polishing); }}
                                                    className="p-2 rounded-lg bg-white shadow-sm text-teal-600 hover:bg-teal-50 transition-colors"
                                                    title="Προβολή παρτίδων Τεχνίτη"
                                                >
                                                    <Truck size={20} />
                                                </button>
                                                <div>
                                                    <h3 className="font-bold text-teal-800 text-sm leading-tight">Τεχνίτης</h3>
                                                    <p className="text-[10px] text-teal-600 font-semibold uppercase tracking-wide leading-tight mt-0.5">Αναμονή Αποστολής</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {!pendingCollapsed && polishingPendingBatches.length > 0 && (
                                                    <button
                                                        onClick={() => handleDispatchBatches(polishingPendingBatches.map(b => b.id))}
                                                        disabled={isProcessingSplit}
                                                        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-teal-600 text-white text-[10px] font-bold hover:bg-teal-700 transition-colors shadow-sm disabled:opacity-50"
                                                        title="Αποστολή όλων στον Τεχνίτη"
                                                    >
                                                        {isProcessingSplit ? <Loader2 size={10} className="animate-spin" /> : <Truck size={10} />}
                                                        <span className="hidden xl:inline">Αποστολή Όλων</span>
                                                    </button>
                                                )}
                                                <span className="px-2 py-0.5 rounded-full text-xs font-black bg-white shadow-sm text-teal-700">{polishingPendingBatches.length}</span>
                                                <button
                                                    onClick={() => setPolishingFocus(polishingFocus === 'pending' ? 'equal' : 'pending')}
                                                    className="p-1.5 rounded-lg bg-white shadow-sm text-teal-500 hover:bg-teal-100 hover:text-teal-700 transition-colors"
                                                    title={polishingFocus === 'pending' ? 'Ισόποση κατανομή' : 'Μεγέθυνση αυτής της στήλης'}
                                                >
                                                    {polishingFocus === 'pending' ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                                                </button>
                                            </div>
                                        </div>
                                        {!pendingCollapsed && (
                                            <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar lg:min-h-0">
                                                {renderBatchGroups(groupedPolishingPending)}
                                                {polishingPendingBatches.length === 0 && (
                                                    <div className="h-24 lg:h-full flex flex-col items-center justify-center text-teal-300/60 p-4 border-2 border-dashed border-teal-200/50 rounded-2xl">
                                                        <Truck size={24} className="mb-2" />
                                                        <p className="text-[10px] font-bold uppercase tracking-widest text-center">Τίποτα σε αναμονή</p>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {/* ── Panel 2: Στον Τεχνίτη (blue) ── */}
                                    <div
                                        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDropTarget(ProductionStage.Polishing); setPolishingDropTarget('dispatched'); }}
                                        onDrop={() => { void handleDrop(ProductionStage.Polishing, false); setPolishingDropTarget(null); }}
                                        className={`flex flex-col rounded-3xl border transition-all duration-300 w-full min-h-[180px] lg:min-h-0 ${dispatchedCollapsed ? 'lg:flex-none' : 'lg:flex-1'} ${polishingDropTarget === 'dispatched' ? 'bg-emerald-50 border-emerald-300 shadow-2xl scale-[1.01]' : 'bg-blue-50 border-blue-200'}`}
                                    >
                                        <div className={`p-4 rounded-t-3xl flex justify-between items-center bg-blue-100/60 ${dispatchedCollapsed ? 'rounded-b-3xl' : 'border-b border-blue-200'}`}>
                                            <div className="flex items-center gap-3">
                                                <button
                                                    onClick={() => { setStageInspectorInitialPolishingTab('dispatched'); setStageInspectorStage(ProductionStage.Polishing); }}
                                                    className="p-2 rounded-lg bg-white shadow-sm text-blue-600 hover:bg-blue-50 transition-colors"
                                                    title="Προβολή παρτίδων Τεχνίτη"
                                                >
                                                    <Hammer size={20} />
                                                </button>
                                                <div>
                                                    <h3 className="font-bold text-blue-800 text-sm leading-tight">Τεχνίτης</h3>
                                                    <p className="text-[10px] text-blue-600 font-semibold uppercase tracking-wide leading-tight mt-0.5">Στον Τεχνίτη</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="px-2 py-0.5 rounded-full text-xs font-black bg-white shadow-sm text-blue-700">{polishingDispatchedBatches.length}</span>
                                                <button
                                                    onClick={() => setPolishingFocus(polishingFocus === 'dispatched' ? 'equal' : 'dispatched')}
                                                    className="p-1.5 rounded-lg bg-white shadow-sm text-blue-500 hover:bg-blue-100 hover:text-blue-700 transition-colors"
                                                    title={polishingFocus === 'dispatched' ? 'Ισόποση κατανομή' : 'Μεγέθυνση αυτής της στήλης'}
                                                >
                                                    {polishingFocus === 'dispatched' ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                                                </button>
                                            </div>
                                        </div>
                                        {!dispatchedCollapsed && (
                                            <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar lg:min-h-0">
                                                {renderBatchGroups(groupedPolishingDispatched, { onRecallDispatch: (batchId) => handleRecallDispatchBatches([batchId]) })}
                                                {polishingDispatchedBatches.length === 0 && (
                                                    <div className="h-24 lg:h-full flex flex-col items-center justify-center text-blue-300/60 p-4 border-2 border-dashed border-blue-200/50 rounded-2xl">
                                                        <Hammer size={24} className="mb-2" />
                                                        <p className="text-[10px] font-bold uppercase tracking-widest text-center">Κανένα στον Τεχνίτη</p>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        }

                        return (
                            <div
                                key={stage.id}
                                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDropTarget(stage.id); }}
                                onDragLeave={() => setDropTarget(null)}
                                onDragEnd={handleDragEnd}
                                onDrop={() => handleDrop(stage.id)}
                                className={`
                                flex flex-col rounded-3xl border transition-all duration-300
                                lg:w-80 lg:h-full
                                w-full
                                ${isTarget ? 'bg-emerald-50 border-emerald-300 shadow-2xl scale-[1.02]' : `${colors.bg} border-slate-200`}
                            `}
                            >
                                <div
                                    className={`
                                    p-4 rounded-t-3xl lg:rounded-t-3xl border-b ${colors.border} flex justify-between items-center cursor-pointer lg:cursor-default transition-colors ${colors.header}
                                    ${!isExpanded ? 'rounded-b-3xl lg:rounded-b-none border-b-0 lg:border-b' : ''}
                                `}
                                    onClick={() => setExpandedStageId(isExpanded ? null : stage.id)}
                                >
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setStageInspectorStage(stage.id); }}
                                            className={`p-2 rounded-lg bg-white shadow-sm text-${stage.color}-600 hover:bg-${stage.color}-50 transition-colors`}
                                            title={`Προβολή παρτίδων: ${stage.label}`}
                                        >
                                            {stage.icon}
                                        </button>
                                        <h3 className={`font-bold ${colors.text} text-sm`}>{stage.label}</h3>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {stage.id === ProductionStage.Setting && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setShowSettingStones(true); }}
                                                className="p-1.5 bg-white rounded-lg hover:bg-purple-100 text-purple-500 hover:text-purple-700 transition-colors shadow-sm"
                                                title="Πέτρες Καρφωτή"
                                            >
                                                <Gem size={14} />
                                            </button>
                                        )}
                                        {stage.id === ProductionStage.Labeling && (
                                            <>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleCompleteAllLabeling(); }}
                                                    className="p-1.5 bg-white rounded-lg hover:bg-emerald-100 text-emerald-500 hover:text-emerald-700 transition-colors shadow-sm"
                                                    title="Ολοκλήρωση Όλων"
                                                    disabled={isProcessingSplit}
                                                >
                                                    {isProcessingSplit ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handlePrintStageLabels(stage.id); }}
                                                    className="p-1.5 bg-white rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors shadow-sm"
                                                    title="Εκτύπωση Ετικετών Σταδίου"
                                                >
                                                    <Tag size={14} />
                                                </button>
                                            </>
                                        )}
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-black bg-white shadow-sm ${colors.text}`}>{stageBatches.length}</span>
                                        <div className="lg:hidden text-slate-400">
                                            {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                        </div>
                                    </div>
                                </div>

                                <div className={`
                                flex-1 overflow-y-auto p-3 space-y-6 custom-scrollbar
                                ${!isExpanded ? 'hidden lg:block' : 'block'}
                                min-h-[100px] lg:min-h-0
                            `}>
                                    {stageBatches.length > 0 && (
                                        <div className="w-full h-1 bg-slate-200 rounded-full overflow-hidden mb-2 opacity-50 lg:hidden">
                                            <div className={`h-full bg-${stage.color}-500`} style={{ width: '100%' }}></div>
                                        </div>
                                    )}

                                    {renderBatchGroups(groupedData)}

                                    {stageBatches.length === 0 && (
                                        <div className="h-24 lg:h-full flex flex-col items-center justify-center text-slate-400/50 p-4 border-2 border-dashed border-slate-200/50 rounded-2xl">
                                            <Package size={24} className="mb-2" />
                                            <p className="text-[10px] font-bold uppercase tracking-widest text-center">Τίποτα</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* MODALS REMAIN UNCHANGED */}
            {splitModalState && (
                <SplitBatchModal
                    state={splitModalState}
                    onClose={() => setSplitModalState(null)}
                    onConfirm={handleConfirmSplit}
                    isProcessing={isProcessingSplit}
                />
            )}

            {editingNoteBatch && (
                <EditBatchNoteModal
                    batch={editingNoteBatch}
                    onClose={() => setEditingNoteBatch(null)}
                    onSave={handleSaveNote}
                    isProcessing={isSavingNote}
                />
            )}

            {holdingBatch && (
                <HoldBatchModal
                    batch={holdingBatch}
                    onClose={() => setHoldingBatch(null)}
                    onConfirm={confirmHold}
                    isProcessing={isSavingNote}
                />
            )}

            <QuickProductionPickerModal
                isOpen={quickPickerOpen}
                onClose={() => setQuickPickerOpen(false)}
                entries={quickPickEntries}
                onSelect={setQuickManageOrder}
            />

            {quickManageOrder && collections && (
                <ProductionSendModal
                    order={quickManageOrder}
                    products={products}
                    materials={materials}
                    existingBatches={batchesByOrderId.get(quickManageOrder.id) || []}
                    onClose={() => { setQuickManageOrder(null); setQuickPickerOpen(false); }}
                    onSuccess={() => {
                        void invalidateOrdersAndBatches(queryClient);
                    }}
                    collections={collections}
                    onPrintAggregated={onPrintAggregated}
                    onPrintStageBatches={onPrintStageBatches}
                    onBack={() => setQuickManageOrder(null)}
                />
            )}

            {viewBuildBatch && molds && (
                <BatchBuildModal
                    batch={viewBuildBatch}
                    allMaterials={materials}
                    allMolds={molds}
                    allProducts={products}
                    onClose={() => setViewBuildBatch(null)}
                    onMove={handleMoveBatch}
                    onEditNote={(b) => setEditingNoteBatch(b)}
                    onToggleHold={handleToggleHold}
                    onViewHistory={handleViewHistory}
                />
            )}

            {isMoldModalOpen && orders && batches && (
                <ProductionMoldRequirementsModal
                    isOpen={isMoldModalOpen}
                    onClose={() => setIsMoldModalOpen(false)}
                    orders={orders || []}
                    batches={batches || []}
                    products={products}
                    molds={molds}
                />
            )}

            <AssemblyOrderSelectorModal
                isOpen={assemblyOrderSelectorOpen}
                onClose={() => setAssemblyOrderSelectorOpen(false)}
                candidates={assemblyOrderCandidates}
                onConfirm={handleAssemblyOrderPrintConfirm}
            />

            {printSelectorState.isOpen && (
                <PrintSelectorModal
                    isOpen={printSelectorState.isOpen}
                    onClose={() => setPrintSelectorState({ isOpen: false, type: '', batches: [] })}
                    onConfirm={executePrint}
                    batches={printSelectorState.batches}
                    title={
                        printSelectorState.type === 'technician' ? 'Εκτύπωση Τεχνίτη' :
                            printSelectorState.type === 'preparation' ? 'Εκτύπωση Προετοιμασίας' :
                                printSelectorState.type === 'assembly' ? 'Εκτύπωση Συναρμολόγησης' :
                                    printSelectorState.type === 'labels' ? 'Εκτύπωση Ετικετών' :
                                        printSelectorState.type === 'stagePdf'
                                            ? `Φύλλο σταδίου — ${printSelectorState.stageMeta?.stageName ?? ''}`
                                            : 'Συγκεντρωτική Εκτύπωση'
                    }
                    labelSortMode={printSelectorState.type === 'labels' ? labelPrintSortMode : undefined}
                    onLabelSortModeChange={printSelectorState.type === 'labels' ? setLabelPrintSortMode : undefined}
                />
            )}

            {overviewModal && (
                <ProductionOverviewModal
                    isOpen={overviewModal.isOpen}
                    onClose={() => setOverviewModal(null)}
                    title={
                        overviewModal.type === 'active' ? 'Ενεργές Παρτίδες' :
                            overviewModal.type === 'delayed' ? 'Καθυστερημένες Παρτίδες' :
                                overviewModal.type === 'onHold' ? 'Παρτίδες σε Αναμονή' : 'Έτοιμες Παρτίδες'
                    }
                    filterType={overviewModal.type}
                    batches={enhancedBatches}
                    collections={collections || []}
                    onMoveToStage={(b, stage, opts) => attemptMove(b, stage, false, opts?.pendingDispatch)}
                    onEditNote={(b: ProductionBatch) => setEditingNoteBatch(b)}
                    onToggleHold={(b: ProductionBatch) => handleToggleHold(b)}
                    onDelete={(b: ProductionBatch) => handleDeleteBatch(b)}
                    onClick={(b: ProductionBatch) => setViewBuildBatch(b)}
                    onViewHistory={handleViewHistory}
                />
            )}

            <BatchHistoryModal
                isOpen={!!historyModalBatch}
                onClose={() => setHistoryModalBatch(null)}
                batch={historyModalBatch}
                history={batchHistory}
            />

            {showSettingStones && orders && (
                <DesktopSettingStoneModal
                    batches={enhancedBatches}
                    orders={orders}
                    allProducts={products}
                    allMaterials={materials}
                    onClose={() => setShowSettingStones(false)}
                />
            )}

            {stageInspectorStage && (() => {
                const stageConf = STAGES.find(s => s.id === stageInspectorStage)!;
                const stageBatches = stageBatchesByStage[stageInspectorStage] || [];
                return (
                    <StageInspectorModal
                        stage={stageConf}
                        batches={stageBatches}
                        onClose={() => setStageInspectorStage(null)}
                        onMoveBatch={(b, targetStage, opts) => { attemptMove(b, targetStage, false, opts?.pendingDispatch); }}
                        onToggleHold={handleToggleHold}
                        onEditNote={(b) => setEditingNoteBatch(b)}
                        onOpenPdfBatchPicker={
                            onPrintStageBatches && stageInspectorStage
                                ? () => handleOpenStagePdfBatchPicker(stageInspectorStage)
                                : undefined
                        }
                        onDispatchBatches={stageInspectorStage === ProductionStage.Polishing ? handleDispatchBatches : undefined}
                        onRecallBatches={stageInspectorStage === ProductionStage.Polishing ? handleRecallDispatchBatches : undefined}
                        initialPolishingTab={stageInspectorStage === ProductionStage.Polishing ? stageInspectorInitialPolishingTab : undefined}
                    />
                );
            })()}

            {/* BULK MOVE FLOATING BAR */}
            {multiSelectIds.size > 0 && ReactDOM.createPortal(
                <div className="fixed bottom-6 inset-x-0 flex justify-center z-[300] pointer-events-none px-4">
                    <div className="bg-slate-900/95 backdrop-blur-md text-white rounded-2xl shadow-2xl px-4 py-3 flex items-center gap-3 pointer-events-auto animate-in slide-in-from-bottom-4 duration-200 border border-white/10 max-w-2xl w-full">
                        <div className="flex items-center gap-2 shrink-0">
                            <div className="w-7 h-7 bg-blue-500 rounded-full flex items-center justify-center text-xs font-black shadow-lg shadow-blue-500/40">
                                {multiSelectIds.size}
                            </div>
                            <span className="text-sm font-bold text-white/70 whitespace-nowrap">επιλεγμένες παρτίδες</span>
                        </div>
                        <div className="w-px h-6 bg-white/20 shrink-0" />
                        <div className="flex-1 min-w-0">
                            <select
                                value={bulkMoveTarget === ProductionStage.Polishing ? (bulkMovePendingDispatch ? 'Polishing__pending' : 'Polishing__dispatched') : (bulkMoveTarget || '')}
                                onChange={e => {
                                    const val = e.target.value;
                                    if (val === 'Polishing__pending') {
                                        setBulkMoveTarget(ProductionStage.Polishing);
                                        setBulkMovePendingDispatch(true);
                                    } else if (val === 'Polishing__dispatched') {
                                        setBulkMoveTarget(ProductionStage.Polishing);
                                        setBulkMovePendingDispatch(false);
                                    } else {
                                        setBulkMoveTarget((val as ProductionStage) || null);
                                        setBulkMovePendingDispatch(undefined);
                                    }
                                }}
                                className="w-full border border-white/20 rounded-xl px-3 py-1.5 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-400/50 cursor-pointer"
                                style={{ backgroundColor: '#1e293b', color: bulkMoveTarget === ProductionStage.Polishing && bulkMovePendingDispatch === true ? '#0f766e' : bulkMoveTarget ? STAGE_SELECT_COLORS[bulkMoveTarget]?.color ?? '#fff' : '#94a3b8' }}
                            >
                                <option value="" disabled style={{ backgroundColor: '#1e293b', color: '#94a3b8' }}>Επιλογή σταδίου...</option>
                                {STAGES.map(s => {
                                    if (s.id === ProductionStage.Polishing) {
                                        return (
                                            <React.Fragment key={s.id}>
                                                <option
                                                    value="Polishing__pending"
                                                    style={{ backgroundColor: '#f0fdfa', color: '#0f766e' }}
                                                >
                                                    {s.label} • Αναμονή
                                                </option>
                                                <option
                                                    value="Polishing__dispatched"
                                                    style={{ backgroundColor: STAGE_SELECT_COLORS[s.id]?.bg ?? '#f8fafc', color: STAGE_SELECT_COLORS[s.id]?.color ?? '#1e293b' }}
                                                >
                                                    {s.label} • Στον Τεχν.
                                                </option>
                                            </React.Fragment>
                                        );
                                    }
                                    return (
                                        <option
                                            key={s.id}
                                            value={s.id}
                                            style={{ backgroundColor: STAGE_SELECT_COLORS[s.id]?.bg ?? '#f8fafc', color: STAGE_SELECT_COLORS[s.id]?.color ?? '#1e293b' }}
                                        >
                                            {s.label}
                                        </option>
                                    );
                                })}
                            </select>
                        </div>
                        <button
                            onClick={handleBulkMove}
                            disabled={!bulkMoveTarget || isBulkMoving}
                            className="shrink-0 px-4 py-1.5 bg-blue-500 hover:bg-blue-400 disabled:bg-white/10 disabled:text-white/30 text-white rounded-xl text-sm font-black transition-all flex items-center gap-1.5 active:scale-95 shadow-lg shadow-blue-500/30"
                        >
                            {isBulkMoving ? <Loader2 size={14} className="animate-spin" /> : <MoveRight size={14} />}
                            Μετακίνηση
                        </button>
                        <button
                            onClick={() => { setMultiSelectIds(new Set()); setBulkMoveTarget(null); setBulkMovePendingDispatch(undefined); }}
                            className="shrink-0 p-1.5 hover:bg-white/10 rounded-lg text-white/50 hover:text-white transition-colors"
                            title="Αποεπιλογή όλων"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
