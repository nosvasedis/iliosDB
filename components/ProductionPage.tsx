
import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, supabase } from '../lib/supabase';
import { ProductionBatch, ProductionStage, Product, Material, MaterialType, Mold, ProductionType, Gender, ProductVariant, Order } from '../types';
import { Factory, Flame, Gem, Hammer, Tag, Package, ChevronRight, Clock, Siren, CheckCircle, ImageIcon, Printer, FileText, Layers, ChevronDown, RefreshCcw, ArrowRight, X, Loader2, Globe, BookOpen, Truck, AlertTriangle, ChevronUp, MoveRight, Activity, Search, User, Users, StickyNote, Hash, Save, Edit, FolderKanban, Palette, PauseCircle, PlayCircle, Calendar, CheckSquare, Square, Check, Trash2, ClipboardList, Grid } from 'lucide-react';
import { useUI } from './UIProvider';
import { useAuth } from './AuthContext';
import BatchBuildModal from './BatchBuildModal';
import { getVariantComponents } from '../utils/pricingEngine';
import { ProductionBatchCard } from './ProductionBatchCard';
import ProductionOverviewModal from './ProductionOverviewModal';
import { EnhancedProductionBatch } from '../types';

interface Props {
    products: Product[];
    materials: Material[];
    molds: Mold[];
    onPrintBatch: (batch: ProductionBatch) => void;
    onPrintAggregated: (batches: ProductionBatch[]) => void;
    onPrintPreparation: (batches: ProductionBatch[]) => void;
    onPrintTechnician: (batches: ProductionBatch[]) => void;
    onPrintLabels?: (items: { product: Product; variant?: ProductVariant; quantity: number, size?: string, format?: 'standard' | 'simple' | 'retail' }[]) => void;
}

const STAGES = [
    { id: ProductionStage.AwaitingDelivery, label: 'Αναμονή Παραλαβής', icon: <Globe size={20} />, color: 'indigo' },
    { id: ProductionStage.Waxing, label: 'Λάστιχα / Κεριά', icon: <Package size={20} />, color: 'slate' },
    { id: ProductionStage.Casting, label: 'Χυτήριο', icon: <Flame size={20} />, color: 'orange' },
    { id: ProductionStage.Setting, label: 'Καρφωτής', icon: <Gem size={20} />, color: 'purple' },
    { id: ProductionStage.Polishing, label: 'Τεχνίτης', icon: <Hammer size={20} />, color: 'blue' },
    { id: ProductionStage.Labeling, label: 'Καρτελάκια - Πακετάρισμα', icon: <Tag size={20} />, color: 'yellow' },
    { id: ProductionStage.Ready, label: 'Έτοιμα', icon: <CheckCircle size={20} />, color: 'emerald' }
];

const STAGE_LIMITS_HOURS: Record<string, number> = {
    [ProductionStage.Waxing]: 120,    // 5 Days
    [ProductionStage.Casting]: 96,    // 4 Days
    [ProductionStage.Setting]: 144,   // 6 Days
    [ProductionStage.Polishing]: 120, // 5 Days
    [ProductionStage.Labeling]: 72    // 3 Days
};

const STAGE_COLORS = {
    indigo: { bg: 'bg-indigo-100/40', text: 'text-indigo-700', border: 'border-indigo-200', ring: 'ring-indigo-100', header: 'bg-indigo-100/50' },
    slate: { bg: 'bg-slate-100/40', text: 'text-slate-700', border: 'border-slate-200', ring: 'ring-slate-100', header: 'bg-slate-100/50' },
    orange: { bg: 'bg-orange-100/40', text: 'text-orange-700', border: 'border-orange-200', ring: 'ring-orange-100', header: 'bg-orange-100/50' },
    purple: { bg: 'bg-purple-100/40', text: 'text-purple-700', border: 'border-purple-200', ring: 'ring-purple-100', header: 'bg-purple-100/50' },
    blue: { bg: 'bg-blue-100/40', text: 'text-blue-700', border: 'border-blue-200', ring: 'ring-blue-100', header: 'bg-blue-100/50' },
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
    'TG': 'text-orange-700', 'IA': 'text-red-700', 'BSU': 'text-slate-800', 'GSU': 'text-emerald-800',
    'RSU': 'text-rose-800', 'MA': 'text-emerald-600', 'FI': 'text-slate-400', 'OP': 'text-indigo-500',
    'NF': 'text-green-700', 'CO': 'text-teal-600', 'TPR': 'text-emerald-500', 'TKO': 'text-rose-600',
    'TMP': 'text-blue-600', 'PCO': 'text-emerald-400', 'MCO': 'text-purple-500', 'PAX': 'text-green-600',
    'MAX': 'text-blue-700', 'KAX': 'text-red-700', 'AI': 'text-slate-500', 'AP': 'text-cyan-500',
    'AM': 'text-teal-700', 'LR': 'text-indigo-700', 'BST': 'text-sky-400', 'MP': 'text-blue-400',
    'LE': 'text-slate-400', 'PR': 'text-green-500', 'KO': 'text-red-500', 'MV': 'text-purple-400',
    'RZ': 'text-pink-500', 'AK': 'text-cyan-300', 'XAL': 'text-stone-400'
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

const PrintSelectorModal = ({ isOpen, onClose, onConfirm, batches, title }: {
    isOpen: boolean,
    onClose: () => void,
    onConfirm: (selected: ProductionBatch[]) => void,
    batches: (ProductionBatch & { customer_name?: string })[],
    title: string
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
                    name: b.customer_name ? `${b.customer_name} (#${b.order_id?.slice(0, 6)})` : (b.order_id ? `Order #${b.order_id.slice(0, 6)}` : 'Χωρίς Εντολή'),
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

const ProductionHealthBar = ({ batches, orders, onFilterClick }: { batches: ProductionBatch[], orders: Order[], onFilterClick: (type: 'active' | 'delayed' | 'onHold' | 'ready') => void }) => {
    const total = batches.length;
    const delayed = batches.filter(b => b.isDelayed && !b.on_hold).length; // Exclude held batches from delay stats
    const ready = batches.filter(b => b.current_stage === ProductionStage.Ready).length;
    const onHold = batches.filter(b => b.on_hold).length;
    const inProgress = total - ready - onHold;

    // Adjusted health score: Exclude on-hold from penalty
    const healthScore = (inProgress + ready) > 0 ? Math.max(0, 100 - (delayed / (inProgress || 1)) * 100) : 100;

    // Filter active orders that have notes
    const activeOrderNotes = orders?.filter(o =>
        (o.status === 'In Production' || o.status === 'Pending') &&
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
                    <div className="flex flex-col w-80 h-[100px] bg-white rounded-2xl border-2 border-indigo-100 overflow-hidden shrink-0 shadow-sm">
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
                                        <span className="font-mono opacity-70">#{n.id.slice(0, 4)}</span>
                                    </div>
                                    <div className="font-medium italic opacity-90">"{n.note}"</div>
                                </div>
                            ))}
                        </div>
                    </div>
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
                                {STAGES.map(s => (
                                    <option key={s.id} value={s.id} disabled={s.id === batch.current_stage}>
                                        {s.label}
                                    </option>
                                ))}
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


export default function ProductionPage({ products, materials, molds, onPrintBatch, onPrintAggregated, onPrintPreparation, onPrintTechnician, onPrintLabels }: Props) {
    const queryClient = useQueryClient();
    const { showToast, confirm } = useUI();
    const { profile } = useAuth();
    const { data: batches, isLoading } = useQuery({ queryKey: ['batches'], queryFn: api.getProductionBatches });
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
    const [printSelectorState, setPrintSelectorState] = useState<{ isOpen: boolean, type: string, batches: any[] }>({ isOpen: false, type: '', batches: [] });

    const [splitModalState, setSplitModalState] = useState<{
        batch: ProductionBatch;
        targetStage: ProductionStage;
    } | null>(null);

    // NEW: Sorting State
    const [isClientCentric, setIsClientCentric] = useState(false);

    // @FIX: Explicitly type return of enhancedBatches map to include customer_name and use intersection type.
    const enhancedBatches = useMemo(() => {
        const ZIRCON_CODES = ['LE', 'PR', 'AK', 'MP', 'KO', 'MV', 'RZ'];

        const results = batches?.map(b => {
            const prod = products.find(p => p.sku === b.sku);
            const lastUpdate = new Date(b.updated_at);
            const now = new Date();
            const diffHours = Math.floor((now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60));
            const threshold = STAGE_LIMITS_HOURS[b.current_stage] || Infinity;
            const isDelayed = b.current_stage !== ProductionStage.Ready && diffHours > threshold;

            const suffix = b.variant_suffix || '';
            // New logic: Only these specific suffixes require Setting (Καρφωτής)
            const hasZircons = ZIRCON_CODES.some(code => suffix.includes(code)) ||
                prod?.recipe.some(r => {
                    if (r.type !== 'raw') return false;
                    const material = materials.find(m => m.id === r.id);
                    return material?.type === MaterialType.Stone && ZIRCON_CODES.some(code => material.name.includes(code));
                }) || false;

            // Inject Customer Name
            const order = orders?.find(o => o.id === b.order_id);
            const customerName = order?.customer_name || '';

            return { ...b, product_details: prod, product_image: prod?.image_url, diffHours, isDelayed, requires_setting: hasZircons, customer_name: customerName };
        }) || [];
        return results as EnhancedProductionBatch[];
    }, [batches, products, materials, orders]);

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
        if (!finderTerm || finderTerm.length < 2) return [] as (ProductionBatch & { customer_name: string })[];
        const term = finderTerm.toUpperCase();

        // Define stage order based on the STAGES array
        const stageOrder = STAGES.reduce((acc, s, i) => ({ ...acc, [s.id]: i }), {} as Record<string, number>);

        return enhancedBatches
            .filter(b => {
                const fullSku = `${b.sku}${b.variant_suffix || ''}`.toUpperCase();
                return fullSku.includes(term) || (b.order_id && b.order_id.includes(term)) || (b.customer_name && b.customer_name.toUpperCase().includes(term));
            })
            // Sort by Stage Order first, then Exact Match
            .sort((a, b) => {
                const stageA = stageOrder[a.current_stage] ?? 99;
                const stageB = stageOrder[b.current_stage] ?? 99;

                if (stageA !== stageB) return stageA - stageB;

                const aExact = `${a.sku}${a.variant_suffix || ''}` === term;
                const bExact = `${b.sku}${b.variant_suffix || ''}` === term;
                return (aExact === bExact) ? 0 : aExact ? -1 : 1;
            }) as EnhancedProductionBatch[];
    }, [enhancedBatches, deferredFinderTerm]);

    const sortedClients = useMemo(() => {
        if (!isClientCentric) return [];

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
    }, [enhancedBatches, isClientCentric]);

    const handleDragStart = (e: React.DragEvent<HTMLDivElement>, batchId: string) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', batchId);
        setDraggedBatchId(batchId);
    };

    const handleDragEnd = () => {
        setDraggedBatchId(null);
        setDropTarget(null);
    };

    const attemptMove = (batch: ProductionBatch, targetStage: ProductionStage) => {
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

        setSplitModalState({ batch, targetStage });
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
                await api.updateBatchStage(batch.id, targetStage);
                await api.logAction(profile?.full_name || 'System', 'Παραλαβή Εισαγόμενου', { sku: batch.sku, quantity: batch.quantity, target_stage: targetStage });
                queryClient.invalidateQueries({ queryKey: ['batches'] });
                queryClient.invalidateQueries({ queryKey: ['orders'] });
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
                await api.updateBatchStage(batch.id, targetStage);
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

                await api.splitBatch(batch.id, originalNewQty, newBatchData);
                await api.logAction(profile?.full_name || 'System', 'Διαχωρισμός Παρτίδας', { sku: batch.sku, moving_qty: quantityToMove, target_stage: targetStage });
            }

            queryClient.invalidateQueries({ queryKey: ['batches'] });
            queryClient.invalidateQueries({ queryKey: ['orders'] });
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
                queryClient.invalidateQueries({ queryKey: ['batches'] });
                queryClient.invalidateQueries({ queryKey: ['orders'] });
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

        return STAGES[nextIndex].id;
    };

    const handleQuickNext = (batch: ProductionBatch) => {
        const nextStage = getNextStage(batch.current_stage, batch);
        if (nextStage) attemptMove(batch, nextStage);
    };

    // @FIX: Update groupBatches signature to accept extended type and avoid property errors.
    const groupBatches = (batches: (ProductionBatch & { customer_name: string })[]) => {
        // Structure: Record<Level1Name, Record<CollectionName, ProductionBatch[]>>
        // Level1Name can be Gender OR Customer
        const groups: Record<string, Record<string, (ProductionBatch & { customer_name: string })[]>> = {};

        batches.forEach(b => {
            // Determine Level 1 Key
            let level1Key = '';
            if (isClientCentric) {
                level1Key = b.customer_name || 'Χωρίς Πελάτη';
            } else {
                level1Key = b.product_details?.gender || 'Unknown';
            }

            // Level 2: Collection
            let collName = 'Γενικά';
            if (b.product_details && b.product_details.collections && b.product_details.collections.length > 0 && collections) {
                const c = collections.find(col => col.id === b.product_details!.collections![0]);
                if (c) collName = c.name;
            }

            if (!groups[level1Key]) groups[level1Key] = {};
            if (!groups[level1Key][collName]) groups[level1Key][collName] = [];

            groups[level1Key][collName].push(b);
        });

        // Sort batches within groups alphabetically by SKU
        Object.keys(groups).forEach(l1Key => {
            Object.keys(groups[l1Key]).forEach(collKey => {
                groups[l1Key][collKey].sort((a, b) => {
                    const fullA = a.sku + (a.variant_suffix || '');
                    const fullB = b.sku + (b.variant_suffix || '');
                    return fullA.localeCompare(fullB, undefined, { numeric: true, sensitivity: 'base' });
                });
            });
        });

        return groups;
    };

    // Sort Order for Genders
    const SORTED_GENDERS = [Gender.Women, Gender.Men, Gender.Unisex, 'Unknown'];

    // Handle Print Request with Modal (New Logic)
    const handlePrintRequest = (batchesToPrint: ProductionBatch[], type: 'technician' | 'preparation' | 'aggregated') => {
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

    const handlePrintStageLabels = (stageId: string) => {
        let stageBatches = enhancedBatches.filter(b => b.current_stage === stageId && !b.on_hold);

        if (stageBatches.length === 0) {
            showToast("Δεν υπάρχουν παρτίδες για εκτύπωση.", "info");
            return;
        }

        // Sort by Client Name (Ascending)
        stageBatches.sort((a, b) => {
            const nameA = a.customer_name || '';
            const nameB = b.customer_name || '';
            return nameA.localeCompare(nameB, 'el', { sensitivity: 'base' });
        });

        const printQueue = stageBatches.map(b => {
            const product = products.find(p => p.sku === b.sku);
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

        if (printQueue.length > 0 && onPrintLabels) {
            onPrintLabels(printQueue);
            showToast(`Στάλθηκαν ${printQueue.length} είδη ετικετών για εκτύπωση (Ταξινόμηση ανά Πελάτη).`, "success");
        } else if (printQueue.length === 0) {
            showToast("Δεν βρέθηκαν προϊόντα για τις παρτίδες.", "error");
        }
    };

    const executePrint = (selected: ProductionBatch[]) => {
        const type = printSelectorState.type;
        if (type === 'technician') onPrintTechnician(selected);
        else if (type === 'preparation') onPrintPreparation(selected);
        else if (type === 'aggregated') onPrintAggregated(selected);
    };

    if (isLoading) return <div className="p-12 text-center text-slate-400">Φόρτωση παραγωγής...</div>;

    return (
        <div className="h-[calc(100vh-100px)] flex flex-col space-y-4">

            {/* HEADER MOVED TO TOP AND THINNER */}
            <div className="shrink-0 bg-white p-4 rounded-3xl shadow-sm border border-slate-100 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-1.5 bg-[#060b00] text-white rounded-xl">
                        <Factory size={20} />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-[#060b00] tracking-tight">
                            Ροή Παραγωγής
                        </h1>
                    </div>
                </div>

                {/* ORDER FINDER (DESKTOP) */}
                <div className="flex-1 max-w-xl w-full mx-4 flex gap-2">
                    <button
                        onClick={() => setIsClientCentric(!isClientCentric)}
                        className={`hidden lg:flex p-3 rounded-2xl border transition-all shadow-sm ${isClientCentric ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-slate-200 text-slate-400 hover:text-slate-700'}`}
                        title={isClientCentric ? "Επαναφορά Ταξινόμησης" : "Ταξινόμηση ανά Πελάτη"}
                    >
                        <Users size={20} />
                    </button>
                    <div className="relative group flex-1">
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
                            <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-xl border border-slate-100 z-50 max-h-96 overflow-y-auto custom-scrollbar p-2 space-y-2">
                                {foundBatches.map(b => {
                                    const stageConf = STAGES.find(s => s.id === b.current_stage);
                                    const colors = STAGE_COLORS[stageConf?.color as keyof typeof STAGE_COLORS] || STAGE_COLORS['slate'];
                                    const colorClassString = `${colors.bg} ${colors.text} ${colors.border}`;
                                    const age = getAgeInfo(b.updated_at);

                                    return (
                                        <div key={b.id} onClick={() => setViewBuildBatch(b)} className="bg-slate-50 rounded-xl p-3 hover:bg-white border border-slate-200 hover:border-emerald-300 transition-all group cursor-pointer">
                                            <div className="flex justify-between items-start">
                                                <div className="flex items-start gap-3">
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
                                                        </div>
                                                        <div className="flex items-center justify-between mt-1 gap-2 min-w-[200px]">
                                                            <span className="font-bold text-slate-700 text-xs">{b.customer_name || 'Unknown'}</span>
                                                            <div className={`text-[9px] font-black px-1.5 py-0.5 rounded border flex items-center gap-1 ${age.style}`}>
                                                                <Clock size={10} /> {age.label}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="text-right flex flex-col items-end gap-1">
                                                    <div className="text-[10px] font-mono text-slate-400">#{b.order_id?.slice(0, 6)}</div>
                                                    <span className={`text-[10px] uppercase font-bold border px-2 py-0.5 rounded flex items-center gap-1 ${colorClassString}`}>
                                                        {stageConf?.icon && React.cloneElement(stageConf.icon as any, { size: 10 })}
                                                        {stageConf?.label || b.current_stage}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="mt-2 flex justify-between items-center pt-2 border-t border-slate-200/50">
                                                {b.notes ? (
                                                    <div className="bg-amber-50 text-amber-800 text-xs font-bold p-1 px-2 rounded-lg flex items-center gap-1 border border-amber-100 max-w-[70%] truncate">
                                                        <StickyNote size={10} className="shrink-0" />
                                                        <span>{b.notes}</span>
                                                    </div>
                                                ) : <div />}

                                                <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                                    <span className="text-[9px] font-bold text-slate-400 uppercase">Μετακίνηση:</span>
                                                    <select
                                                        value=""
                                                        onChange={(e) => attemptMove(b, e.target.value as ProductionStage)}
                                                        className="text-xs bg-white border border-slate-300 rounded px-1 py-0.5 font-bold outline-none cursor-pointer hover:border-emerald-500"
                                                    >
                                                        <option value="" disabled>-</option>
                                                        {STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                                                    </select>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                                {foundBatches.length === 0 && <div className="p-4 text-center text-slate-400 text-xs italic">Δεν βρέθηκαν ενεργές παρτίδες.</div>}
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    <button
                        onClick={() => handlePrintRequest(enhancedBatches.filter(b => [ProductionStage.Waxing, ProductionStage.Casting].includes(b.current_stage)), 'preparation')}
                        className="flex items-center gap-2 bg-blue-50 text-blue-700 px-4 py-2 rounded-xl hover:bg-blue-100 font-bold transition-all shadow-sm border border-blue-200 disabled:opacity-50 text-xs"
                    >
                        <BookOpen size={14} /> Προετοιμασία
                    </button>
                    <button
                        onClick={() => handlePrintRequest(enhancedBatches.filter(b => b.current_stage === ProductionStage.Polishing), 'technician')}
                        className="flex items-center gap-2 bg-purple-50 text-purple-700 px-4 py-2 rounded-xl hover:bg-purple-100 font-bold transition-all shadow-sm border border-purple-200 disabled:opacity-50 text-xs"
                    >
                        <Hammer size={14} /> Τεχνίτης
                    </button>
                    <button
                        onClick={() => handlePrintRequest(enhancedBatches, 'aggregated')}
                        className="flex items-center gap-2 bg-slate-100 text-slate-700 px-4 py-2 rounded-xl hover:bg-slate-200 font-bold transition-all shadow-sm border border-slate-200 disabled:opacity-50 text-xs"
                    >
                        <FileText size={14} /> Συγκεντρωτική
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
                        const stageBatches = enhancedBatches.filter(b => b.current_stage === stage.id);
                        const groupedData = groupBatches(stageBatches as any);

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
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handlePrintStageLabels(stage.id); }}
                                                className="p-1.5 bg-white rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors shadow-sm"
                                                title="Εκτύπωση Ετικετών Σταδίου"
                                            >
                                                <Tag size={14} />
                                            </button>
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

                                    {(isClientCentric ? sortedClients : SORTED_GENDERS).map(level1Key => {
                                        const l1Batches = groupedData[level1Key];
                                        if (!l1Batches || Object.keys(l1Batches).length === 0) return null;

                                        const gConfig = isClientCentric ? null : (GENDER_CONFIG[level1Key] || GENDER_CONFIG['Unknown']);
                                        const collectionKeys = Object.keys(l1Batches).sort();

                                        return (
                                            <div key={level1Key} className="space-y-3">
                                                {isClientCentric ? (
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

                                                        {l1Batches[collName].map(batch => (
                                                            <ProductionBatchCard
                                                                key={batch.id}
                                                                batch={batch}
                                                                onDragStart={handleDragStart}
                                                                onPrint={onPrintBatch}
                                                                onNextStage={handleQuickNext}
                                                                onEditNote={() => setEditingNoteBatch(batch)}
                                                                onToggleHold={() => handleToggleHold(batch)}
                                                                onDelete={() => handleDeleteBatch(batch)}
                                                                onClick={() => setViewBuildBatch(batch)}
                                                            />
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

            {viewBuildBatch && molds && (
                <BatchBuildModal
                    batch={viewBuildBatch}
                    allMaterials={materials}
                    allMolds={molds}
                    allProducts={products}
                    onClose={() => setViewBuildBatch(null)}
                    onMove={handleMoveBatch}
                    onEditNote={(b) => setEditingNoteBatch(b)}
                />
            )}

            {printSelectorState.isOpen && (
                <PrintSelectorModal
                    isOpen={printSelectorState.isOpen}
                    onClose={() => setPrintSelectorState({ ...printSelectorState, isOpen: false })}
                    onConfirm={executePrint}
                    batches={printSelectorState.batches}
                    title={
                        printSelectorState.type === 'technician' ? 'Εκτύπωση Τεχνίτη' :
                            printSelectorState.type === 'preparation' ? 'Εκτύπωση Προετοιμασίας' : 'Συγκεντρωτική Εκτύπωση'
                    }
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
                    onNextStage={handleQuickNext}
                    onEditNote={(b: ProductionBatch) => setEditingNoteBatch(b)}
                    onToggleHold={(b: ProductionBatch) => handleToggleHold(b)}
                    onDelete={(b: ProductionBatch) => handleDeleteBatch(b)}
                    onClick={(b: ProductionBatch) => setViewBuildBatch(b)}
                />
            )}
        </div>
    );
}
