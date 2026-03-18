
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, supabase, RETAIL_CUSTOMER_ID, RETAIL_CUSTOMER_NAME } from '../lib/supabase';
import { ProductionBatch, ProductionStage, Product, Material, MaterialType, Mold, ProductionType, Gender, ProductVariant, Order, OrderStatus, AssemblyPrintData, AssemblyPrintRow } from '../types';
import { Factory, Flame, Gem, Hammer, Tag, Package, ChevronRight, Clock, Siren, CheckCircle, ImageIcon, Printer, FileText, Layers, ChevronDown, RefreshCcw, ArrowRight, ArrowUp, ArrowDown, X, Loader2, Globe, BookOpen, Truck, AlertTriangle, ChevronUp, MoveRight, Activity, Search, User, Users, StickyNote, Hash, Save, Edit, FolderKanban, Palette, PauseCircle, PlayCircle, Calendar, CheckSquare, Square, Check, Trash2, ClipboardList, Grid } from 'lucide-react';
import { useUI } from './UIProvider';
import { useAuth } from './AuthContext';
import BatchBuildModal from './BatchBuildModal';
import ProductionSendModal from './ProductionSendModal';
import BatchHistoryModal from './BatchHistoryModal';
import { getVariantComponents } from '../utils/pricingEngine';
import { formatOrderId } from '../utils/orderUtils';
import { ProductionBatchCard } from './ProductionBatchCard';
import ProductionOverviewModal from './ProductionOverviewModal';
import { EnhancedProductionBatch } from '../types';
import { extractRetailClientFromNotes } from '../utils/retailNotes';
import { requiresAssemblyStage } from '../constants';
import ProductionMoldRequirementsModal from './ProductionMoldRequirementsModal';
import { invalidateOrdersAndBatches } from '../lib/queryInvalidation';

interface Props {
    products: Product[];
    materials: Material[];
    molds: Mold[];
    onPrintBatch: (batch: ProductionBatch) => void;
    onPrintAggregated: (batches: ProductionBatch[]) => void;
    onPrintPreparation: (batches: ProductionBatch[]) => void;
    onPrintTechnician: (batches: ProductionBatch[]) => void;
    onPrintAssembly?: (data: AssemblyPrintData) => void;
    onPrintLabels?: (items: { product: Product; variant?: ProductVariant; quantity: number, size?: string, format?: 'standard' | 'simple' | 'retail' }[]) => void;
}

const STAGES = [
    { id: ProductionStage.AwaitingDelivery, label: 'Αναμονή Παραλαβής', icon: <Globe size={20} />, color: 'indigo' },
    { id: ProductionStage.Waxing, label: 'Παρασκευή', icon: <Package size={20} />, color: 'slate' },
    { id: ProductionStage.Casting, label: 'Χυτήριο', icon: <Flame size={20} />, color: 'orange' },
    { id: ProductionStage.Setting, label: 'Καρφωτής', icon: <Gem size={20} />, color: 'purple' },
    { id: ProductionStage.Polishing, label: 'Τεχνίτης', icon: <Hammer size={20} />, color: 'blue' },
    { id: ProductionStage.Assembly, label: 'Συναρμολόγηση', icon: <Layers size={20} />, color: 'pink' },
    { id: ProductionStage.Labeling, label: 'Καρτελάκια - Πακετάρισμα', icon: <Tag size={20} />, color: 'yellow' },
    { id: ProductionStage.Ready, label: 'Έτοιμα', icon: <CheckCircle size={20} />, color: 'emerald' }
];

const STAGE_LIMITS_HOURS: Record<string, number> = {
    [ProductionStage.Waxing]: 120,    // 5 Days
    [ProductionStage.Casting]: 96,    // 4 Days
    [ProductionStage.Setting]: 144,   // 6 Days
    [ProductionStage.Polishing]: 120, // 5 Days
    [ProductionStage.Assembly]: 72,   // 3 Days
    [ProductionStage.Labeling]: 72    // 3 Days
};

const STAGE_ORDER_INDEX = STAGES.reduce<Record<string, number>>((acc, stage, index) => {
    acc[stage.id] = index;
    return acc;
}, {});

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

const TEXT_FINISH_COLORS: Record<string, string> = {
    'X': 'text-amber-500',
    'P': 'text-slate-500',
    'D': 'text-orange-500',
    'H': 'text-cyan-400',
    '': 'text-slate-400'
};

const TEXT_STONE_COLORS: Record<string, string> = {
    'KR': 'text-rose-600', 'QN': 'text-slate-900', 'LA': 'text-blue-600', 'TY': 'text-teal-500',
    'TG': 'text-orange-700', 'IA': 'text-red-800', 'BSU': 'text-slate-800', 'GSU': 'text-emerald-800',
    'RSU': 'text-rose-800', 'MA': 'text-emerald-600', 'FI': 'text-slate-400', 'OP': 'text-indigo-500',
    'NF': 'text-green-700', 'CO': 'text-cyan-600', 'TPR': 'text-emerald-500', 'TKO': 'text-rose-600',
    'TMP': 'text-blue-600', 'PCO': 'text-teal-500', 'MCO': 'text-purple-500', 'PAX': 'text-green-600',
    'MAX': 'text-blue-700', 'KAX': 'text-red-700', 'AI': 'text-slate-500', 'AP': 'text-cyan-500',
    'AM': 'text-teal-700', 'LR': 'text-indigo-700', 'BST': 'text-sky-400', 'MP': 'text-blue-400',
    'LE': 'text-slate-400', 'PR': 'text-green-500', 'KO': 'text-red-500', 'MV': 'text-purple-400',
    'RZ': 'text-pink-500', 'AK': 'text-cyan-300', 'XAL': 'text-stone-400', 'SD': 'text-blue-800',
    'AX': 'text-emerald-700'
};

// Subtle matte container styles for finder results by metal suffix
const FINDER_METAL_CONTAINER_STYLES: Record<string, string> = {
    'X': 'bg-amber-50/80 border-amber-100',
    'P': 'bg-slate-50/80 border-slate-200',
    'D': 'bg-orange-50/80 border-orange-100',
    'H': 'bg-cyan-50/80 border-cyan-100',
    '': 'bg-slate-50/80 border-slate-100'
};

const SkuColored = ({ sku, suffix, gender }: { sku: string, suffix?: string, gender: any }) => {
    const { finish, stone } = getVariantComponents(suffix || '', gender);
    const fColor = TEXT_FINISH_COLORS[finish.code] || 'text-slate-400';
    const sColor = TEXT_STONE_COLORS[stone.code] || 'text-emerald-500';

    return (
        <span className="font-black text-lg">
            <span className="text-slate-800">{sku}</span>
            <span className={fColor}>{finish.code}</span>
            <span className={sColor}>{stone.code}</span>
        </span>
    );
};

// Helper for Age/Delay Visualization
const getAgeInfo = (dateStr: string) => {
    const start = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - start.getTime();
    const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHrs / 24);

    let label = '';
    let style = '';

    if (diffDays > 5) {
        label = `${diffDays}ημ`;
        style = 'bg-red-50 text-red-600 border-red-200';
    } else if (diffDays > 2) {
        label = `${diffDays}ημ`;
        style = 'bg-orange-50 text-orange-600 border-orange-200';
    } else if (diffDays > 0) {
        label = `${diffDays}ημ ${diffHrs % 24}ω`;
        style = 'bg-blue-50 text-blue-600 border-blue-200';
    } else {
        label = `${diffHrs}ω`;
        style = 'bg-emerald-50 text-emerald-600 border-emerald-200';
    }
    return { label, style };
};

type PrintSelectorType = 'technician' | 'preparation' | 'aggregated' | 'labels' | 'assembly';
type LabelPrintSortMode = 'as_sent' | 'customer';
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
        <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
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
        [ProductionStage.AwaitingDelivery]: { label: 'Αναμονή', shortLabel: 'ΑΝ', color: 'text-indigo-700', bgColor: 'bg-indigo-50', borderColor: 'border-indigo-200' },
        [ProductionStage.Waxing]: { label: 'Παρασκευή', shortLabel: 'ΠΑ', color: 'text-slate-700', bgColor: 'bg-slate-100', borderColor: 'border-slate-200' },
        [ProductionStage.Casting]: { label: 'Χυτήριο', shortLabel: 'ΧΥ', color: 'text-orange-700', bgColor: 'bg-orange-50', borderColor: 'border-orange-200' },
        [ProductionStage.Setting]: { label: 'Καρφωτής', shortLabel: 'ΚΑ', color: 'text-purple-700', bgColor: 'bg-purple-50', borderColor: 'border-purple-200' },
        [ProductionStage.Polishing]: { label: 'Τεχνίτης', shortLabel: 'ΤΕ', color: 'text-blue-700', bgColor: 'bg-blue-50', borderColor: 'border-blue-200' },
        [ProductionStage.Assembly]: { label: 'Συναρμολόγηση', shortLabel: 'ΣΥ', color: 'text-pink-700', bgColor: 'bg-pink-50', borderColor: 'border-pink-200' },
        [ProductionStage.Labeling]: { label: 'Συσκευασία', shortLabel: 'ΣΚ', color: 'text-yellow-700', bgColor: 'bg-yellow-50', borderColor: 'border-yellow-200' },
        [ProductionStage.Ready]: { label: 'Έτοιμα', shortLabel: 'ΕΤ', color: 'text-emerald-700', bgColor: 'bg-emerald-50', borderColor: 'border-emerald-200' },
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

const ProductionHealthBar = ({ batches, orders, onFilterClick }: { batches: ProductionBatch[], orders: Order[], onFilterClick: (type: 'active' | 'delayed' | 'onHold' | 'ready') => void }) => {
    const [isNotesModalOpen, setIsNotesModalOpen] = useState(false);
    const total = batches.length;
    const delayed = batches.filter(b => b.isDelayed && !b.on_hold).length; // Exclude held batches from delay stats
    const ready = batches.filter(b => b.current_stage === ProductionStage.Ready).length;
    const onHold = batches.filter(b => b.on_hold).length;
    const inProgress = total - ready - onHold;

    // Adjusted health score: Exclude on-hold from penalty
    const healthScore = (inProgress + ready) > 0 ? Math.max(0, 100 - (delayed / (inProgress || 1)) * 100) : 100;

    // Filter active orders that have notes
    const activeOrderNotes = orders?.filter(o =>
        o.status === 'In Production' &&
        o.notes &&
        o.notes.trim().length > 0 &&
        batches.some(b => b.order_id === o.id)
    ).map(o => ({ id: o.id, customer: o.customer_name, note: o.notes }));

    // Cycle for note colors
    const NOTE_COLORS = [
        'bg-blue-50 border-blue-100 text-blue-800',
        'bg-purple-50 border-purple-100 text-purple-800',
        'bg-rose-50 border-rose-100 text-rose-800',
        'bg-amber-50 border-amber-100 text-amber-800',
        'bg-teal-50 border-teal-100 text-teal-800',
    ];

    return (
        <>
            <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-100 flex flex-col md:flex-row gap-6 items-center justify-between mb-2">
                <div className="flex items-center gap-4 w-full md:w-auto">
                    <div className={`w-16 h-16 rounded-full flex items-center justify-center text-xl font-black border-4 shadow-inner ${healthScore > 80 ? 'border-emerald-100 text-emerald-600 bg-emerald-50' : (healthScore > 50 ? 'border-amber-100 text-amber-600 bg-amber-50' : 'border-red-100 text-red-600 bg-red-50')}`}>
                        {healthScore.toFixed(0)}%
                    </div>
                    <div>
                        <h3 className="font-bold text-slate-800">Υγεία Παραγωγής</h3>
                        <p className="text-xs text-slate-500">Βάσει χρονικών ορίων</p>
                    </div>
                </div>

                <div className="flex gap-4 w-full md:w-auto overflow-x-auto pb-4 md:pb-0 items-start">
                    {/* General Order Notes Card */}
                    {activeOrderNotes && activeOrderNotes.length > 0 && (
                        <button
                            onClick={() => setIsNotesModalOpen(true)}
                            className="flex flex-col w-80 h-[100px] bg-white rounded-2xl border-2 border-indigo-100 overflow-hidden shrink-0 shadow-sm hover:border-indigo-300 hover:bg-indigo-50/20 transition-colors text-left"
                            title="Άνοιγμα όλων των οδηγιών παραγωγής"
                        >
                            <div className="bg-indigo-50 px-3 py-1.5 border-b border-indigo-100 flex justify-between items-center shrink-0">
                                <span className="text-[10px] font-black text-indigo-700 uppercase tracking-widest flex items-center gap-1">
                                    <ClipboardList size={10} /> Οδηγίες Παραγωγής
                                </span>
                                <span className="bg-white text-indigo-600 px-1.5 rounded text-[9px] font-bold shadow-sm">{activeOrderNotes.length}</span>
                            </div>
                            <div className="overflow-y-auto p-2 space-y-1.5 custom-scrollbar bg-white">
                                {activeOrderNotes.map((n, i) => (
                                    <div key={n.id} className={`p-2 rounded-lg border text-[10px] leading-tight ${NOTE_COLORS[i % NOTE_COLORS.length]}`}>
                                        <div className="flex justify-between font-bold mb-0.5 opacity-90 border-b border-black/5 pb-0.5">
                                            <span>{i + 1}. {n.customer}</span>
                                            <span className="font-mono opacity-70">#{formatOrderId(n.id)}</span>
                                        </div>
                                        <div className="font-medium italic opacity-90">"{n.note}"</div>
                                    </div>
                                ))}
                            </div>
                        </button>
                    )}

                    <button onClick={() => onFilterClick('onHold')} className="bg-amber-50 px-5 py-3 rounded-2xl border border-amber-100 min-w-[120px] h-[100px] flex flex-col justify-center hover:bg-amber-100 transition-all text-left">
                        <div className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-1 flex items-center gap-1"><PauseCircle size={12} /> Σε Αναμονή</div>
                        <div className="text-2xl font-black text-amber-700">{onHold}</div>
                    </button>
                    <button onClick={() => onFilterClick('active')} className="bg-slate-50 px-5 py-3 rounded-2xl border border-slate-100 min-w-[120px] h-[100px] flex flex-col justify-center hover:bg-slate-100 transition-all text-left">
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1"><Activity size={12} /> Ενεργά</div>
                        <div className="text-2xl font-black text-slate-800">{inProgress}</div>
                    </button>
                    <button onClick={() => onFilterClick('delayed')} className={`px-5 py-3 rounded-2xl border min-w-[120px] h-[100px] flex flex-col justify-center transition-all text-left ${delayed > 0 ? 'bg-red-50 border-red-100 hover:bg-red-100' : 'bg-slate-50 border-slate-100 hover:bg-slate-100'}`}>
                        <div className={`text-xs font-bold uppercase tracking-wider mb-1 flex items-center gap-1 ${delayed > 0 ? 'text-red-500' : 'text-slate-400'}`}>
                            <Siren size={12} className={delayed > 0 ? 'animate-pulse' : ''} /> Καθυστέρηση
                        </div>
                        <div className={`text-2xl font-black ${delayed > 0 ? 'text-red-600' : 'text-slate-800'}`}>{delayed}</div>
                    </button>
                    <button onClick={() => onFilterClick('ready')} className="bg-emerald-50 px-5 py-3 rounded-2xl border border-emerald-100 min-w-[120px] h-[100px] flex flex-col justify-center hover:bg-emerald-100 transition-all text-left">
                        <div className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-1 flex items-center gap-1"><CheckCircle size={12} /> Έτοιμα</div>
                        <div className="text-2xl font-black text-emerald-700">{ready}</div>
                    </button>
                </div>
            </div>

            {isNotesModalOpen && (
                <div className="fixed inset-0 z-[230] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setIsNotesModalOpen(false)}>
                    <div className="bg-white w-full max-w-4xl max-h-[86vh] rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
                        <div className="p-5 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
                            <div>
                                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                                    <ClipboardList size={18} className="text-indigo-600" /> Όλες οι Οδηγίες Παραγωγής
                                </h3>
                                <p className="text-xs text-slate-500 mt-1">Σημειώσεις κύριας εντολής για όλες τις εντολές που είναι σε παραγωγή.</p>
                            </div>
                            <button onClick={() => setIsNotesModalOpen(false)} className="p-2 rounded-full text-slate-400 hover:bg-slate-200 transition-colors">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 bg-slate-50/40 custom-scrollbar space-y-3">
                            {activeOrderNotes.map((n, i) => (
                                <div key={n.id} className={`p-3 rounded-xl border ${NOTE_COLORS[i % NOTE_COLORS.length]}`}>
                                    <div className="flex items-center justify-between gap-3 border-b border-black/10 pb-1.5 mb-2">
                                        <span className="font-black text-sm">{n.customer}</span>
                                        <span className="text-xs font-mono font-bold opacity-80">#{formatOrderId(n.id)}</span>
                                    </div>
                                    <p className="text-sm leading-relaxed whitespace-pre-wrap break-words font-medium italic">"{n.note}"</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

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

// Stage display order and labels for finder
const FINDER_STAGE_ORDER: { id: ProductionStage, label: string }[] = [
    { id: ProductionStage.AwaitingDelivery, label: 'Αναμονή' },
    { id: ProductionStage.Waxing, label: 'Παρασκευή' },
    { id: ProductionStage.Casting, label: 'Χυτήριο' },
    { id: ProductionStage.Setting, label: 'Καρφωτής' },
    { id: ProductionStage.Polishing, label: 'Τεχνίτης' },
    { id: ProductionStage.Assembly, label: 'Συναρμολόγηση' },
    { id: ProductionStage.Labeling, label: 'Συσκευασία' },
    { id: ProductionStage.Ready, label: 'Έτοιμα' },
];

// Component for stage selector in finder results
const FinderBatchStageSelector = ({ 
    batch, 
    onMoveToStage,
    onToggleHold
}: { 
    batch: ProductionBatch & { customer_name?: string }, 
    onMoveToStage: (batch: ProductionBatch, targetStage: ProductionStage) => void,
    onToggleHold: (batch: ProductionBatch) => void
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
    
    const handleStageSelect = (targetStage: ProductionStage) => {
        if (isStageDisabled(targetStage)) return;
        if (targetStage === batch.current_stage) return;
        setIsOpen(false);
        onMoveToStage(batch, targetStage);
    };
    
    return (
        <div className="mt-2 pt-2 border-t border-slate-200/50">
            {batch.on_hold && (
                <div className="bg-amber-100 text-amber-800 text-xs font-black p-1.5 px-2 rounded-lg flex items-center gap-1 border border-amber-200 mb-2">
                    <PauseCircle size={11} className="shrink-0" />
                    <span>Σε Αναμονή{batch.on_hold_reason ? ` • ${batch.on_hold_reason}` : ''}</span>
                </div>
            )}
            {batch.notes && (
                <div className="bg-amber-50 text-amber-800 text-xs font-bold p-1.5 px-2 rounded-lg flex items-center gap-1 border border-amber-100 mb-2 truncate">
                    <StickyNote size={10} className="shrink-0" />
                    <span className="truncate">{batch.notes}</span>
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

const SplitBatchModal = ({ state, onClose, onConfirm, isProcessing }: { state: { batch: ProductionBatch, targetStage: ProductionStage }, onClose: () => void, onConfirm: (qty: number, targetStage: ProductionStage) => void, isProcessing: boolean }) => {
    const { batch, targetStage } = state;
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
                        <h2 className="text-xl font-bold text-slate-800">Μετακίνηση Παρτίδας</h2>
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
                                <div className="flex items-center gap-1 text-slate-800 border-b border-dashed border-slate-400 pb-0.5 hover:text-emerald-600 transition-colors">
                                    <span className="text-xs font-bold">{selectedTargetInfo.label}</span>
                                    <ChevronDown size={12} />
                                </div>
                            </div>

                            {/* Hidden Select for interaction */}
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
                        </div>
                    </div>

                    <div className="bg-slate-100 p-6 rounded-2xl border border-slate-200 text-center">
                        <label className="text-sm font-bold text-slate-600 block mb-2">Ποσότητα για μετακίνηση</label>
                        <p className="text-xs text-slate-400 mb-3">Διαθέσιμα σε αυτή την παρτίδα: {batch.quantity}</p>
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


export default function ProductionPage({ products, materials, molds, onPrintBatch, onPrintAggregated, onPrintPreparation, onPrintTechnician, onPrintAssembly, onPrintLabels }: Props) {
    const queryClient = useQueryClient();
    const { showToast, confirm } = useUI();
    const { profile } = useAuth();
    const { data: batches, isLoading, isError: batchesError, error: batchesErr, refetch: refetchBatches } = useQuery({ queryKey: ['batches'], queryFn: api.getProductionBatches });
    const { data: orders } = useQuery({ queryKey: ['orders'], queryFn: api.getOrders });
    const { data: collections } = useQuery({ queryKey: ['collections'], queryFn: api.getCollections });

    const [draggedBatchId, setDraggedBatchId] = useState<string | null>(null);
    const [dropTarget, setDropTarget] = useState<ProductionStage | null>(null);
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
    const [printSelectorState, setPrintSelectorState] = useState<{ isOpen: boolean, type: PrintSelectorType | '', batches: EnhancedProductionBatch[] }>({ isOpen: false, type: '', batches: [] });
    const [labelPrintSortMode, setLabelPrintSortMode] = useState<LabelPrintSortMode>('as_sent');
    const [assemblyOrderSelectorOpen, setAssemblyOrderSelectorOpen] = useState(false);

    const [splitModalState, setSplitModalState] = useState<{
        batch: ProductionBatch;
        targetStage: ProductionStage;
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

    const productsMap = useMemo(() => new Map(products.map(product => [product.sku, product])), [products]);
    const materialsMap = useMemo(() => new Map(materials.map(material => [material.id, material])), [materials]);
    const ordersMap = useMemo(() => new Map((orders || []).map(order => [order.id, order])), [orders]);
    const collectionsMap = useMemo(() => new Map((collections || []).map(collection => [collection.id, collection])), [collections]);

    // @FIX: Explicitly type return of enhancedBatches map to include customer_name and use intersection type.
    const enhancedBatches = useMemo(() => {
        const ZIRCON_CODES = ['LE', 'PR', 'AK', 'MP', 'KO', 'MV', 'RZ'];
        const NON_ZIRCON_STONE_CODES = ['TKO', 'TPR', 'TMP'];

        const results = batches?.map(b => {
            const prod = productsMap.get(b.sku);
            const lastUpdate = new Date(b.updated_at);
            const now = new Date();
            const diffHours = Math.floor((now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60));
            const threshold = STAGE_LIMITS_HOURS[b.current_stage] || Infinity;
            const isDelayed = b.current_stage !== ProductionStage.Ready && diffHours > threshold;

            const suffix = b.variant_suffix || '';
            const stone = getVariantComponents(suffix, prod?.gender).stone;
            const hasZirconsFromSuffix = stone?.code && ZIRCON_CODES.includes(stone.code) && !NON_ZIRCON_STONE_CODES.includes(stone.code);
            const hasZirconsFromRecipe = prod?.recipe.some(r => {
                if (r.type !== 'raw') return false;
                const material = materialsMap.get(r.id);
                return material?.type === MaterialType.Stone && ZIRCON_CODES.some(code => material.name.includes(code));
            }) || false;
            const hasZircons = hasZirconsFromSuffix || hasZirconsFromRecipe;

            // Check if assembly stage is required based on SKU
            const requires_assembly = requiresAssemblyStage(b.sku);

            // Inject Customer Name (with retail client extraction)
            const order = b.order_id ? ordersMap.get(b.order_id) : undefined;
            const isRetailOrder = order?.customer_id === RETAIL_CUSTOMER_ID || order?.customer_name === RETAIL_CUSTOMER_NAME;
            const { retailClientLabel } = extractRetailClientFromNotes(order?.notes);
            const customerName = isRetailOrder && retailClientLabel
                ? `${RETAIL_CUSTOMER_NAME} • ${retailClientLabel}`
                : (order?.customer_name || '');

            return { ...b, product_details: prod, product_image: prod?.image_url, diffHours, isDelayed, requires_setting: hasZircons, requires_assembly, customer_name: customerName };
        }) || [];
        return results as EnhancedProductionBatch[];
    }, [batches, productsMap, materialsMap, ordersMap]);

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

    const stageBatchesByStage = useMemo(() => {
        const grouped = STAGES.reduce<Record<string, EnhancedProductionBatch[]>>((acc, stage) => {
            acc[stage.id] = [];
            return acc;
        }, {});

        enhancedBatches.forEach(batch => {
            if (!grouped[batch.current_stage]) {
                grouped[batch.current_stage] = [];
            }
            grouped[batch.current_stage].push(batch);
        });

        return grouped;
    }, [enhancedBatches]);

    // Helper for Age/Delay Visualization
    const getAgeInfo = (dateStr: string) => {
        const start = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - start.getTime();
        const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffHrs / 24);

        let label = '';
        let style = '';

        if (diffDays > 5) {
            label = `${diffDays}ημ`;
            style = 'bg-red-100 text-red-700 border-red-200';
        } else if (diffDays > 2) {
            label = `${diffDays}ημ`;
            style = 'bg-orange-100 text-orange-700 border-orange-200';
        } else if (diffDays > 0) {
            label = `${diffDays}ημ ${diffHrs % 24}ω`;
            style = 'bg-blue-50 text-blue-700 border-blue-100';
        } else {
            label = `${diffHrs}ω`;
            style = 'bg-emerald-50 text-emerald-700 border-emerald-100';
        }
        return { label, style };
    };

    // @FIX: Explicitly type foundBatches result to include customer_name.
    const foundBatches = useMemo(() => {
        if (!deferredFinderTerm || deferredFinderTerm.length < 2) return [] as (ProductionBatch & { customer_name: string })[];
        const term = deferredFinderTerm.toUpperCase();

        return enhancedBatches
            .filter(b => {
                const fullSku = `${b.sku}${b.variant_suffix || ''}`.toUpperCase();
                return fullSku.includes(term) || (b.order_id && b.order_id.includes(term)) || (b.customer_name && b.customer_name.toUpperCase().includes(term));
            })
            // Sort by Stage Order first, then Exact Match
            .sort((a, b) => {
                const stageA = STAGE_ORDER_INDEX[a.current_stage] ?? 99;
                const stageB = STAGE_ORDER_INDEX[b.current_stage] ?? 99;

                if (stageA !== stageB) return stageA - stageB;

                const aExact = `${a.sku}${a.variant_suffix || ''}` === term;
                const bExact = `${b.sku}${b.variant_suffix || ''}` === term;
                return (aExact === bExact) ? 0 : aExact ? -1 : 1;
            }) as EnhancedProductionBatch[];
    }, [enhancedBatches, deferredFinderTerm]);

    const sortedClients = useMemo(() => {
        if (groupMode !== 'customer') return [];

        const clientLatestActionMap: Record<string, number> = {};

        enhancedBatches.forEach(b => {
            const client = b.customer_name || 'Χωρίς Πελάτη';
            const time = new Date(b.created_at).getTime(); // Group by latest order creation
            if (!clientLatestActionMap[client] || time > clientLatestActionMap[client]) {
                clientLatestActionMap[client] = time;
            }
        });

        return Object.entries(clientLatestActionMap)
            .sort((a, b) => b[1] - a[1]) // Newest First
            .map(entry => entry[0]);
    }, [enhancedBatches, groupMode]);

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
                    const updateTs = new Date(batch.updated_at).getTime();
                    return Number.isFinite(updateTs) ? Math.max(max, updateTs) : max;
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

        return orders
            .filter((order) =>
                !order.is_archived &&
                (order.status === OrderStatus.Pending || order.status === OrderStatus.InProduction) &&
                order.items.some((item) => requiresAssemblyStage(item.sku))
            )
            .map((order) => {
                const mergedRows = new Map<string, AssemblyPrintRow>();

                const isRetailOrder =
                    order.customer_id === RETAIL_CUSTOMER_ID ||
                    order.customer_name === RETAIL_CUSTOMER_NAME;
                const { retailClientLabel } = extractRetailClientFromNotes(order.notes);
                const displayCustomerName =
                    isRetailOrder && retailClientLabel
                        ? `${RETAIL_CUSTOMER_NAME} • ${retailClientLabel}`
                        : order.customer_name;

                order.items.forEach((item, index) => {
                    if (!requiresAssemblyStage(item.sku)) return;

                    const key = [
                        order.id,
                        item.sku,
                        item.variant_suffix || '',
                        item.size_info || ''
                    ].join('::');

                    const existing = mergedRows.get(key);
                    if (existing) {
                        existing.quantity += item.quantity;
                        return;
                    }

                    mergedRows.set(key, {
                        id: `assembly-order-${order.id}-${index}`,
                        order_id: order.id,
                        customer_name: displayCustomerName,
                        sku: item.sku,
                        variant_suffix: item.variant_suffix,
                        size_info: item.size_info,
                        quantity: item.quantity,
                        notes: item.notes
                    });
                });

                const rows = Array.from(mergedRows.values()).sort((a, b) => {
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
    }, [orders]);

    const handleDragStart = (e: React.DragEvent<HTMLDivElement>, batchId: string) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', batchId);
        setDraggedBatchId(batchId);
    };

    const handleDragEnd = () => {
        setDraggedBatchId(null);
        setDropTarget(null);
    };

    const attemptMove = (batch: ProductionBatch, targetStage: ProductionStage, skipModal: boolean = false) => {
        if (batch.on_hold) {
            showToast("Η παρτίδα είναι σε αναμονή. Ξεμπλοκάρετε την πρώτα.", "error");
            return;
        }
        if (batch.current_stage === targetStage) return;

        if (batch.current_stage === ProductionStage.Casting && targetStage === ProductionStage.Setting && !batch.requires_setting) {
            showToast(`Το ${batch.sku} δεν έχει Ζιργκόν. Προχωρήστε στο επόμενο στάδιο.`, 'info');
            return;
        }

        if (batch.current_stage === ProductionStage.AwaitingDelivery) {
            handleImportReceive(batch, targetStage);
            return;
        }

        // If skipModal is true or quantity is 1, move directly without showing modal
        if (skipModal || batch.quantity === 1) {
            handleDirectMove(batch, targetStage);
            return;
        }

        setSplitModalState({ batch, targetStage });
    };

    const handleDirectMove = async (batch: ProductionBatch, targetStage: ProductionStage) => {
        setIsProcessingSplit(true);
        try {
            await api.updateBatchStage(batch.id, targetStage, profile?.full_name);
            await api.logAction(profile?.full_name || 'System', 'Μετακίνηση Παρτίδας', { sku: batch.sku, target_stage: targetStage });
            void invalidateOrdersAndBatches(queryClient);
            showToast('Η παρτίδα μετακινήθηκε.', 'success');
        } catch (e: any) {
            console.error("Move failure:", e);
            showToast(`Σφάλμα: ${e.message}`, 'error');
        } finally {
            setIsProcessingSplit(false);
        }
    };

    const handleDrop = async (targetStage: ProductionStage) => {
        if (!draggedBatchId) return;
        const batch = enhancedBatches.find(b => b.id === draggedBatchId);
        if (!batch) return;
        attemptMove(batch, targetStage);
    };

    const handleImportReceive = async (batch: ProductionBatch, targetStage: ProductionStage) => {
        const targetStageInfo = STAGES.find(s => s.id === targetStage);
        const confirmed = await confirm({
            title: 'Παραλαβή Εισαγόμενου',
            message: `Επιβεβαιώνετε την παραλαβή για την παρτίδα ${batch.sku}${batch.variant_suffix || ''} και τη μετακίνηση στο στάδιο "${targetStageInfo?.label}"?`,
            confirmText: 'Επιβεβαίωση'
        });

        if (confirmed) {
            setIsProcessingSplit(true);
            try {
                await api.updateBatchStage(batch.id, targetStage, profile?.full_name);
                await api.logAction(profile?.full_name || 'System', 'Παραλαβή Εισαγόμενου', { sku: batch.sku, quantity: batch.quantity, target_stage: targetStage });
                void invalidateOrdersAndBatches(queryClient);
                showToast('Η παρτίδα μετακινήθηκε.', 'success');
            } catch (e: any) {
                showToast(`Σφάλμα: ${e.message}`, 'error');
            } finally {
                setIsProcessingSplit(false);
            }
        }
    };

    const handleConfirmSplit = async (quantityToMove: number, finalTargetStage: ProductionStage) => {
        if (!splitModalState) return;

        const { batch } = splitModalState;
        const targetStage = finalTargetStage;

        setIsProcessingSplit(true);

        try {
            if (quantityToMove >= batch.quantity) {
                // Move the whole batch
                await api.updateBatchStage(batch.id, targetStage, profile?.full_name);
                await api.logAction(profile?.full_name || 'System', 'Μετακίνηση Παρτίδας', { sku: batch.sku, target_stage: targetStage });
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
                    requires_setting: !!requires_setting // DB now supports this column
                };

                await api.splitBatch(batch.id, originalNewQty, newBatchData, profile?.full_name);
                await api.logAction(profile?.full_name || 'System', 'Διαχωρισμός Παρτίδας', { sku: batch.sku, moving_qty: quantityToMove, target_stage: targetStage });
            }

            void invalidateOrdersAndBatches(queryClient);
            showToast('Η παρτίδα μετακινήθηκε.', 'success');
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
                await api.deleteProductionBatch(batch.id);
                await api.logAction(profile?.full_name || 'System', 'Διαγραφή Παρτίδας', { sku: batch.sku, quantity: batch.quantity });
                void invalidateOrdersAndBatches(queryClient);
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
            // Direct supabase call since api wrapper might not expose update notes explicitly yet
            const { error } = await supabase
                .from('production_batches')
                .update({ notes: newNote || null })
                .eq('id', editingNoteBatch.id);

            if (error) throw error;

            queryClient.invalidateQueries({ queryKey: ['batches'] });
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
            await api.toggleBatchHold(batch.id, false);
            queryClient.invalidateQueries({ queryKey: ['batches'] });
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
            await api.toggleBatchHold(holdingBatch.id, true, reason);
            queryClient.invalidateQueries({ queryKey: ['batches'] });
            showToast("Η παρτίδα τέθηκε σε αναμονή.", "warning");
            setHoldingBatch(null);
        } catch (e) {
            showToast("Σφάλμα.", "error");
        } finally {
            setIsSavingNote(false);
        }
    };

    const handleMoveBatch = (batch: ProductionBatch, stage: ProductionStage) => {
        attemptMove(batch, stage);
    }

    const handleViewHistory = async (batch: ProductionBatch) => {
        setHistoryModalBatch(batch);
        setIsLoadingHistory(true);
        try {
            const history = await api.getBatchHistory(batch.id);
            setBatchHistory(history);
        } catch (e) {
            console.error('Failed to load batch history:', e);
            setBatchHistory([]);
        } finally {
            setIsLoadingHistory(false);
        }
    };

    // Determines next logical stage for "Quick Move" button
    const getNextStage = (currentStage: ProductionStage, batch: ProductionBatch): ProductionStage | null => {
        const currentIndex = STAGES.findIndex(s => s.id === currentStage);
        if (currentIndex === -1 || currentIndex === STAGES.length - 1) return null;

        let nextIndex = currentIndex + 1;

        // Special logic for Imported Products: Awaiting -> Labeling
        if (batch.product_details?.production_type === ProductionType.Imported && currentStage === ProductionStage.AwaitingDelivery) {
            return ProductionStage.Labeling;
        }

        // Skip Setting if not required (Strict Rule: Only Zircon suffixes go to Setter)
        if (STAGES[nextIndex].id === ProductionStage.Setting && !batch.requires_setting) {
            nextIndex++;
        }

        // Skip Assembly if not required (only specific SKUs need assembly)
        if (STAGES[nextIndex].id === ProductionStage.Assembly && !batch.requires_assembly) {
            nextIndex++;
        }

        return STAGES[nextIndex].id;
    };

    const handleQuickNext = (batch: ProductionBatch) => {
        const nextStage = getNextStage(batch.current_stage, batch);
        if (nextStage) attemptMove(batch, nextStage);
    };

    // @FIX: Update groupBatches signature to accept extended type and avoid property errors.
    const groupBatches = (batches: (ProductionBatch & { customer_name?: string })[]) => {
        // Structure: Record<Level1Name, Record<CollectionName, ProductionBatch[]>>
        // Level1Name can be Gender OR Customer
        const groups: Record<string, Record<string, (ProductionBatch & { customer_name?: string })[]>> = {};

        batches.forEach(b => {
            // Determine Level 1 Key
            let level1Key = '';
            if (groupMode === 'customer') {
                level1Key = b.customer_name || 'Χωρίς Πελάτη';
            } else {
                level1Key = b.product_details?.gender || 'Unknown';
            }

            // Level 2: Collection
            let collName = 'Γενικά';
            if (b.product_details && b.product_details.collections && b.product_details.collections.length > 0) {
                const c = collectionsMap.get(b.product_details.collections[0]);
                if (c) collName = c.name;
            }

            if (!groups[level1Key]) groups[level1Key] = {};
            if (!groups[level1Key][collName]) groups[level1Key][collName] = [];

            groups[level1Key][collName].push(b);
        });

        // Sort batches within groups
        Object.keys(groups).forEach(l1Key => {
            Object.keys(groups[l1Key]).forEach(collKey => {
                groups[l1Key][collKey].sort((a, b) => {
                    // Chronological sorting if selected
                    if (sortOrder === 'newest' || sortOrder === 'oldest') {
                        const timeA = new Date(a.updated_at).getTime();
                        const timeB = new Date(b.updated_at).getTime();
                        if (sortOrder === 'newest') {
                            return timeB - timeA; // Newest first
                        } else {
                            return timeA - timeB; // Oldest first
                        }
                    }
                    // Default: sort alphabetically by SKU
                    const fullA = a.sku + (a.variant_suffix || '');
                    const fullB = b.sku + (b.variant_suffix || '');
                    return fullA.localeCompare(fullB, undefined, { numeric: true, sensitivity: 'base' });
                });
            });
        });

        return groups;
    };

    const groupedStageBatches = useMemo(() => {
        return STAGES.reduce<Record<string, Record<string, Record<string, (ProductionBatch & { customer_name?: string })[]>>>>((acc, stage) => {
            acc[stage.id] = groupBatches(stageBatchesByStage[stage.id] || []);
            return acc;
        }, {});
    }, [stageBatchesByStage, groupMode, sortOrder, collectionsMap]);

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
                await api.updateBatchStage(batch.id, ProductionStage.Ready, profile?.full_name);
                await api.logAction(profile?.full_name || 'System', 'Μετακίνηση Παρτίδας', { sku: batch.sku, target_stage: ProductionStage.Ready });
            }));
            void invalidateOrdersAndBatches(queryClient);
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

    const buildLabelPrintQueue = (selected: ProductionBatch[], mode: LabelPrintSortMode) => {
        const sortedBatches = [...selected].sort((a, b) => {
            if (mode === 'customer') {
                const nameA = (a as EnhancedProductionBatch).customer_name || '';
                const nameB = (b as EnhancedProductionBatch).customer_name || '';
                const byCustomer = nameA.localeCompare(nameB, 'el', { sensitivity: 'base' });
                if (byCustomer !== 0) return byCustomer;
            }

            const byUpdatedAt = new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
            if (byUpdatedAt !== 0) return byUpdatedAt;

            const byCreatedAt = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
            if (byCreatedAt !== 0) return byCreatedAt;

            return `${a.sku}${a.variant_suffix || ''}`.localeCompare(`${b.sku}${b.variant_suffix || ''}`, undefined, { numeric: true, sensitivity: 'base' });
        });

        return sortedBatches.map(b => {
            const product = productsMap.get(b.sku);
            if (!product) return null;

            // Normalized matching for variants to handle null vs empty string
            const batchSuffix = b.variant_suffix || '';
            const variant = product.variants?.find(v => (v.suffix || '') === batchSuffix);

            return {
                product,
                variant,
                quantity: b.quantity,
                size: b.size_info || undefined, // Add size here
                format: 'standard' as const // Wholesale
            };
        }).filter((item): item is NonNullable<typeof item> => item !== null);
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
            const printQueue = buildLabelPrintQueue(selected, labelPrintSortMode);
            if (printQueue.length > 0 && onPrintLabels) {
                onPrintLabels(printQueue);
                const modeLabel = labelPrintSortMode === 'as_sent' ? 'Σειρά Αποστολής' : 'Ταξινόμηση ανά Πελάτη';
                showToast(`Στάλθηκαν ${printQueue.length} είδη ετικετών για εκτύπωση (${modeLabel}).`, "success");
            } else {
                showToast("Δεν βρέθηκαν προϊόντα για τις παρτίδες.", "error");
            }
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

    return (
        <div className="h-[calc(100vh-100px)] flex flex-col space-y-4">

            {/* HEADER MOVED TO TOP AND THINNER */}
            <div className="shrink-0 bg-white p-4 rounded-3xl shadow-sm border border-slate-100 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3 lg:gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-1.5 bg-[#060b00] text-white rounded-xl">
                        <Factory size={20} />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-[#060b00] tracking-tight">
                            Παραγωγή
                        </h1>
                    </div>
                </div>

                {/* ORDER FINDER (DESKTOP) */}
                <div className="flex-1 min-w-[260px] w-full mx-4 flex gap-2">
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
                                {foundBatches.map((b, index) => {
                                    const stageConf = STAGES.find(s => s.id === b.current_stage);
                                    const colors = STAGE_COLORS[stageConf?.color as keyof typeof STAGE_COLORS] || STAGE_COLORS['slate'];
                                    const colorClassString = `${colors.bg} ${colors.text} ${colors.border}`;
                                    const age = getAgeInfo(b.updated_at);
                                    const { finish } = getVariantComponents(b.variant_suffix || '', b.product_details?.gender);
                                    const finderMetalClass = FINDER_METAL_CONTAINER_STYLES[finish.code] || FINDER_METAL_CONTAINER_STYLES[''];

                                    return (
                                        <div
                                            key={b.id}
                                            onClick={() => setViewBuildBatch(b)}
                                            className={`rounded-xl p-3 hover:bg-white transition-all group cursor-pointer border hover:border-emerald-300 ${finderMetalClass} ${index > 0 ? 'border-t border-t-slate-100 mt-1 pt-3' : ''}`}
                                        >
                                            <div className="flex justify-between items-start">
                                                <div className={`flex items-start gap-3 border-l-4 pl-2 ${
                                                    stageConf?.color
                                                        ? STAGE_COLORS[stageConf.color as keyof typeof STAGE_COLORS].border
                                                        : 'border-slate-200'
                                                }`}>
                                                    {/* Image */}
                                                    <div className="w-10 h-10 bg-slate-100 rounded-lg overflow-hidden border border-slate-200 shrink-0 relative">
                                                        {b.product_image ? <img src={b.product_image} className="w-full h-full object-cover" /> : <ImageIcon size={16} className="m-auto text-slate-300" />}
                                                        {/* AMOUNT INDICATOR ADDED HERE */}
                                                        <div className="absolute bottom-0 right-0 bg-slate-900 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-tl-lg leading-none">
                                                            x{b.quantity}
                                                        </div>
                                                    </div>

                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <SkuColored sku={b.sku} suffix={b.variant_suffix} gender={b.product_details?.gender} />
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
                                                <div className="text-right flex flex-col items-end gap-1">
                                                    <div className="text-[10px] font-mono text-slate-400">#{formatOrderId(b.order_id)}</div>
                                                    <span className={`text-[10px] uppercase font-bold border px-2 py-0.5 rounded flex items-center gap-1 ${colorClassString}`}>
                                                        {stageConf?.icon && React.cloneElement(stageConf.icon as any, { size: 10 })}
                                                        {stageConf?.label || b.current_stage}
                                                    </span>
                                                </div>
                                            </div>
                                            <FinderBatchStageSelector 
                                                batch={b} 
                                                onMoveToStage={(batch, stage) => attemptMove(batch, stage, true)}
                                                onToggleHold={handleToggleHold}
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
            </div>

            {/* HEALTH BAR MOVED DOWN AND PADDING REDUCED */}
            <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-100 mb-2">
                <ProductionHealthBar
                    batches={enhancedBatches}
                    orders={orders || []}
                    onFilterClick={(type) => setOverviewModal({ isOpen: true, type })}
                />
            </div>

            <div className="flex-1 overflow-x-auto overflow-y-auto pb-4 custom-scrollbar lg:overflow-y-hidden">
                <div className="flex flex-col lg:flex-row gap-4 h-auto lg:h-full lg:min-w-max">
                    {STAGES.map(stage => {
                        const stageBatches = stageBatchesByStage[stage.id] || [];
                        const groupedData = groupedStageBatches[stage.id] || {};

                        const colors = STAGE_COLORS[stage.color as keyof typeof STAGE_COLORS];
                        const isTarget = dropTarget === stage.id;
                        const isExpanded = expandedStageId === stage.id;

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
                                        <div className={`p-2 rounded-lg bg-white shadow-sm text-${stage.color}-600`}>{stage.icon}</div>
                                        <h3 className={`font-bold ${colors.text} text-sm`}>{stage.label}</h3>
                                    </div>
                                    <div className="flex items-center gap-2">
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

                                    {(groupMode === 'customer' ? sortedClients : SORTED_GENDERS).map(level1Key => {
                                        const l1Batches = groupedData[level1Key];
                                        if (!l1Batches || Object.keys(l1Batches).length === 0) return null;

                                        const gConfig = groupMode === 'customer' ? null : (GENDER_CONFIG[level1Key] || GENDER_CONFIG['Unknown']);
                                        const collectionKeys = Object.keys(l1Batches).sort();

                                        return (
                                            <div key={level1Key} className="space-y-3">
                                                {groupMode === 'customer' ? (
                                                    <div className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg border bg-slate-900 text-white border-slate-900 shadow-sm flex justify-between items-center`}>
                                                        <span>{level1Key}</span>
                                                        <span className="opacity-60 text-[9px]">{Object.values(l1Batches).flat().length}</span>
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
                                                                    onPrint={onPrintBatch}
                                                                    onMoveToStage={(b, stage) => attemptMove(b, stage)}
                                                                    onEditNote={() => setEditingNoteBatch(batch)}
                                                                    onToggleHold={() => handleToggleHold(batch)}
                                                                    onDelete={() => handleDeleteBatch(batch)}
                                                                    onClick={() => setViewBuildBatch(batch)}
                                                                    onViewHistory={handleViewHistory}
                                                                />
                                                            </React.Fragment>
                                                        ))}
                                                    </div>
                                                ))}
                                            </div>
                                        );
                                    })}

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
                    onClose={() => setPrintSelectorState({ ...printSelectorState, isOpen: false })}
                    onConfirm={executePrint}
                    batches={printSelectorState.batches}
                    title={
                        printSelectorState.type === 'technician' ? 'Εκτύπωση Τεχνίτη' :
                            printSelectorState.type === 'preparation' ? 'Εκτύπωση Προετοιμασίας' :
                                printSelectorState.type === 'assembly' ? 'Εκτύπωση Συναρμολόγησης' :
                                    printSelectorState.type === 'labels' ? 'Εκτύπωση Ετικετών' : 'Συγκεντρωτική Εκτύπωση'
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
                    onPrint={onPrintBatch}
                    onMoveToStage={(b, stage) => attemptMove(b, stage)}
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
        </div>
    );
}
