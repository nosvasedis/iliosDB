import { protectOperation } from '../lib/appUpdates';
import { useRestartDraft } from '../hooks/useRestartBlocker';
import { formatNumber } from '../utils/numberFormat';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Material, MaterialType, GlobalSettings, Product } from '../types';
import {
    Trash2, Plus, Gem, MapPin, Box, Activity, Puzzle, Palette, Scroll, Search, X, Globe, Package,
    Check, LayoutGrid, List as ListIcon, Weight, Pencil, Copy, Tag, AlertTriangle, ArrowUpDown,
    Download, Minus, Coins, Filter, Loader2,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { api } from '../lib/supabase';
import { useUI } from './UIProvider';
import { formatCurrency } from '../utils/pricingEngine';
import DesktopPageHeader, { HeaderPrimaryButton } from './DesktopPageHeader';
import IliosLoader from './ui/IliosLoader';
import { ResourceUsageProvider, ResourceUsageStrip } from './resources/ResourceUsage';
import EmptyState from './ui/EmptyState';

const MAT_TYPE_MAP: Record<MaterialType, string> = {
    [MaterialType.Stone]: 'Πέτρα',
    [MaterialType.Cord]: 'Κορδόνι',
    [MaterialType.Component]: 'Εξάρτημα',
    [MaterialType.Enamel]: 'Σμάλτο',
    [MaterialType.Leather]: 'Δέρμα'
};

const TABS = [
    { id: MaterialType.Stone, label: 'Πέτρες', icon: Gem, accent: 'text-purple-600', chip: 'bg-purple-50 text-purple-700 ring-purple-100' },
    { id: MaterialType.Component, label: 'Εξαρτήματα', icon: Puzzle, accent: 'text-blue-600', chip: 'bg-blue-50 text-blue-700 ring-blue-100' },
    { id: MaterialType.Cord, label: 'Κορδόνια', icon: Activity, accent: 'text-amber-600', chip: 'bg-amber-50 text-amber-700 ring-amber-100' },
    { id: MaterialType.Leather, label: 'Δέρματα', icon: Scroll, accent: 'text-orange-700', chip: 'bg-orange-50 text-orange-700 ring-orange-100' },
    { id: MaterialType.Enamel, label: 'Σμάλτα', icon: Palette, accent: 'text-rose-500', chip: 'bg-rose-50 text-rose-700 ring-rose-100' },
];

/** At or below this quantity a stocked (non-strand) material is flagged. */
const LOW_STOCK_THRESHOLD = 5;

interface Props {
    settings: GlobalSettings;
    products?: Product[];
    resourceTab?: 'materials' | 'molds';
    onResourceTabChange?: (tab: 'materials' | 'molds') => void;
}

type StoneSubFilter = 'all' | 'standard' | 'strand';
type QuickFilter = 'low' | 'noWeight' | 'noSupplier' | 'variants';
type SortKey = 'name' | 'cost' | 'stock' | 'value';
type ViewMode = 'grid' | 'table';

interface Supplier { id: string; name: string }

const isStrandMaterial = (m: Material) => m.stones_per_strand !== null && m.stones_per_strand !== undefined;
const variantCount = (m: Material) => Object.keys(m.variant_prices || {}).length;
const stockValue = (m: Material) => (isStrandMaterial(m) ? 0 : (m.stock_qty || 0)) * (m.cost_per_unit || 0);
const isLowStock = (m: Material) => !isStrandMaterial(m) && (m.stock_qty || 0) <= LOW_STOCK_THRESHOLD;
const hasWeight = (m: Material) => m.unit_weight_g !== null && m.unit_weight_g !== undefined;
const formatWeight = (g: number | null | undefined) =>
    g === null || g === undefined ? '—' : `${g.toLocaleString('el-GR', { maximumFractionDigits: 3 })} g`;

const iconFor = (type: MaterialType) =>
    type === MaterialType.Stone ? Gem
        : type === MaterialType.Cord ? Activity
        : type === MaterialType.Component ? Puzzle
        : type === MaterialType.Enamel ? Palette
        : type === MaterialType.Leather ? Scroll
        : Box;

const detectGender = (material: Material): 'men' | 'women' | 'neutral' => {
    const nameLower = material.name.toLowerCase();
    const variantCodes = Object.keys(material.variant_prices || {});
    if (['ανδρ', 'αντρ', 'άντρας'].some(kw => nameLower.includes(kw))) return 'men';
    if (['γυναικ', 'γυναίκα'].some(kw => nameLower.includes(kw))) return 'women';
    const hasMenCode = variantCodes.some(vc => ['KR', 'GSU', 'RSU', 'QN', 'TG', 'IA', 'BSU', 'MA'].includes(vc));
    const hasWomenCode = variantCodes.some(vc => ['SB', 'PAX', 'MAX', 'KAX', 'PCO', 'MCO', 'CO', 'AP', 'AM', 'AZM', 'CI', 'MUL'].includes(vc));
    if (hasMenCode && !hasWomenCode) return 'men';
    if (hasWomenCode && !hasMenCode) return 'women';
    return 'neutral';
};

const badgeTone = (m: Material) => {
    if (m.type !== MaterialType.Stone) return 'bg-slate-100 text-slate-500';
    if (isStrandMaterial(m)) return 'bg-purple-100 text-purple-600';
    const g = detectGender(m);
    return g === 'men' ? 'bg-blue-100 text-blue-600' : g === 'women' ? 'bg-pink-100 text-pink-600' : 'bg-emerald-100 text-emerald-600';
};

const MaterialBadge: React.FC<{ material: Material; size?: 'sm' | 'md' }> = ({ material, size = 'md' }) => {
    const Icon = iconFor(material.type);
    const box = size === 'md' ? 'h-11 w-11 rounded-xl' : 'h-8 w-8 rounded-lg';
    return (
        <div className={`${box} flex shrink-0 items-center justify-center ${badgeTone(material)}`}>
            <Icon size={size === 'md' ? 20 : 15} />
        </div>
    );
};

// -- EDITOR (create + edit) --

interface EditorForm {
    name: string;
    description: string;
    type: MaterialType;
    unit: string;
    cost: string;
    stock: string;
    weight: string;
    supplier_id: string;
    isStrand: boolean;
    strandPrice: string;
    stonesPerStrand: string;
}

const toForm = (m: Partial<Material> & { type: MaterialType }): EditorForm => {
    const strand = isStrandMaterial(m as Material);
    const perStrand = m.stones_per_strand || 0;
    return {
        name: m.name || '',
        description: m.description || '',
        type: m.type,
        unit: m.unit || 'Τεμ',
        cost: m.cost_per_unit !== undefined ? String(m.cost_per_unit) : '',
        stock: String(m.stock_qty ?? 0),
        weight: hasWeight(m as Material) ? String(m.unit_weight_g) : '',
        supplier_id: m.supplier_id || '',
        isStrand: strand,
        strandPrice: strand && perStrand > 0 ? String(+((m.cost_per_unit || 0) * perStrand).toFixed(4)) : '',
        stonesPerStrand: strand ? String(perStrand || 1) : '',
    };
};

const parseNum = (v: string) => {
    const n = parseFloat(v.replace(',', '.'));
    return Number.isFinite(n) ? n : NaN;
};

interface EditorProps {
    initial: Material | null;
    defaults: { type: MaterialType; isStrand: boolean };
    /** Prefills a new material (e.g. when duplicating). */
    seed?: Material | null;
    suppliers: Supplier[];
    onClose: () => void;
    onSubmit: (m: Material) => Promise<void>;
    onDelete?: (m: Material) => void;
}

const MaterialEditor: React.FC<EditorProps> = ({ initial, defaults, seed, suppliers, onClose, onSubmit, onDelete }) => {
    const [form, setForm] = useState<EditorForm>(() =>
        initial ? toForm(initial) : seed ? toForm(seed) : { ...toForm({ type: defaults.type }), isStrand: defaults.isStrand, stonesPerStrand: defaults.isStrand ? '1' : '' },
    );
    const [saving, setSaving] = useState(false);
    const [stockDelta, setStockDelta] = useState('');
    useRestartDraft('Στοιχεία υλικού', form, { busy: saving, identity: initial?.id ?? 'new' });

    const set = <K extends keyof EditorForm>(key: K, value: EditorForm[K]) => setForm(prev => ({ ...prev, [key]: value }));

    const strandUnitCost = useMemo(() => {
        const price = parseNum(form.strandPrice);
        const count = parseInt(form.stonesPerStrand, 10);
        return Number.isFinite(price) && count > 0 ? price / count : NaN;
    }, [form.strandPrice, form.stonesPerStrand]);

    const unitCost = form.isStrand ? strandUnitCost : parseNum(form.cost);
    const stockNum = parseInt(form.stock, 10);
    const weightNum = form.weight.trim() === '' ? null : parseNum(form.weight);

    const errors: string[] = [];
    if (!form.name.trim()) errors.push('Συμπληρώστε όνομα.');
    if (!Number.isFinite(unitCost) || unitCost < 0) errors.push(form.isStrand ? 'Συμπληρώστε τιμή σειράς και πέτρες ανά σειρά.' : 'Μη έγκυρο κόστος.');
    if (!form.isStrand && (!Number.isFinite(stockNum) || stockNum < 0)) errors.push('Μη έγκυρο απόθεμα.');
    if (weightNum !== null && (!Number.isFinite(weightNum) || weightNum < 0)) errors.push('Μη έγκυρο βάρος.');

    const applyDelta = (sign: 1 | -1) => {
        const d = parseInt(stockDelta, 10);
        if (!Number.isFinite(d) || d <= 0) return;
        const base = Number.isFinite(stockNum) ? stockNum : 0;
        set('stock', String(Math.max(0, base + sign * d)));
        setStockDelta('');
    };

    const submit = async () => {
        if (saving || errors.length) return;
        setSaving(true);
        const payload: Material = {
            ...(initial || {}),
            id: initial?.id as string,
            name: form.name.trim(),
            description: form.description.trim() || undefined,
            type: form.type,
            unit: form.unit.trim() || 'Τεμ',
            cost_per_unit: +unitCost.toFixed(6),
            stock_qty: form.isStrand ? (initial?.stock_qty ?? 0) : stockNum,
            unit_weight_g: weightNum,
            supplier_id: (form.supplier_id || null) as any,
            stones_per_strand: (form.isStrand ? Math.max(1, parseInt(form.stonesPerStrand, 10) || 1) : null) as any,
            variant_prices: initial?.variant_prices || seed?.variant_prices || {},
        };
        if (!initial) delete (payload as Partial<Material>).id;
        try {
            await onSubmit(payload);
            onClose();
        } catch { /* Parent reports the error; keep the draft. */ }
        finally { setSaving(false); }
    };

    const inputCls = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100';
    const labelCls = 'mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-400';
    const isStone = form.type === MaterialType.Stone;

    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in" onMouseDown={e => { if (e.target === e.currentTarget && !saving) onClose(); }}>
            <div
                className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-2xl animate-in zoom-in-95"
                onKeyDown={e => {
                    if (e.key === 'Escape' && !saving) onClose();
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit();
                }}
            >
                <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
                    <div className="flex items-center gap-3">
                        <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${form.isStrand ? 'bg-purple-100 text-purple-600' : 'bg-slate-100 text-slate-600'}`}>
                            {React.createElement(iconFor(form.type), { size: 20 })}
                        </div>
                        <div>
                            <h3 className="text-lg font-black text-slate-800">{initial ? 'Επεξεργασία Υλικού' : 'Νέο Υλικό'}</h3>
                            <p className="text-xs font-semibold text-slate-400">{initial ? initial.name : 'Συμπληρώστε τα στοιχεία της πρώτης ύλης.'}</p>
                        </div>
                    </div>
                    <button onClick={onClose} disabled={saving} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"><X size={20} /></button>
                </div>

                <div className="custom-scrollbar flex-1 space-y-5 overflow-y-auto px-6 py-5">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="sm:col-span-2">
                            <label className={labelCls}>Όνομα</label>
                            <input autoFocus className={inputCls} value={form.name} onChange={e => set('name', e.target.value)} placeholder="π.χ. Ζιργκόν Λευκό 3mm" />
                        </div>
                        <div className="sm:col-span-2">
                            <label className={labelCls}>Περιγραφή</label>
                            <input className={inputCls} value={form.description} onChange={e => set('description', e.target.value)} placeholder="π.χ. 8mm ματ, facet..." />
                        </div>
                        <div>
                            <label className={labelCls}>Κατηγορία</label>
                            <select
                                className={inputCls}
                                value={form.type}
                                onChange={e => {
                                    const type = e.target.value as MaterialType;
                                    setForm(prev => ({ ...prev, type, isStrand: type === MaterialType.Stone ? prev.isStrand : false }));
                                }}
                            >
                                {TABS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className={labelCls}>Προμηθευτής</label>
                            <select className={inputCls} value={form.supplier_id} onChange={e => set('supplier_id', e.target.value)}>
                                <option value="">— Χωρίς προμηθευτή —</option>
                                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>
                    </div>

                    {isStone && (
                        <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1">
                            <button type="button" onClick={() => set('isStrand', false)} className={`flex-1 rounded-lg py-2 text-xs font-black transition ${!form.isStrand ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200' : 'text-slate-500'}`}>
                                Τιμή ανά πέτρα
                            </button>
                            <button
                                type="button"
                                onClick={() => setForm(prev => ({
                                    ...prev,
                                    isStrand: true,
                                    stonesPerStrand: prev.stonesPerStrand || '1',
                                    strandPrice: prev.strandPrice || prev.cost,
                                }))}
                                className={`flex-1 rounded-lg py-2 text-xs font-black transition ${form.isStrand ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-500'}`}
                            >
                                Πώληση σε σειρά (κορδόνι)
                            </button>
                        </div>
                    )}

                    <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                        <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-500"><Coins size={14} /> Κοστολόγηση</div>
                        {form.isStrand ? (
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                                <div>
                                    <label className={labelCls}>Τιμή / σειρά (€)</label>
                                    <input inputMode="decimal" className={inputCls} value={form.strandPrice} onChange={e => set('strandPrice', e.target.value)} placeholder="0,00" />
                                </div>
                                <div>
                                    <label className={labelCls}>Πέτρες / σειρά</label>
                                    <input inputMode="numeric" className={inputCls} value={form.stonesPerStrand} onChange={e => set('stonesPerStrand', e.target.value.replace(/[^0-9]/g, ''))} />
                                </div>
                                <div className="flex flex-col justify-end">
                                    <div className="rounded-xl border border-purple-100 bg-purple-50 px-3 py-2.5 text-right">
                                        <div className="text-[10px] font-bold uppercase text-purple-500">Ανά πέτρα</div>
                                        <div className="font-mono text-sm font-black text-purple-800">{Number.isFinite(strandUnitCost) ? formatCurrency(strandUnitCost) : '—'}</div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className={labelCls}>Κόστος μονάδας (€)</label>
                                    <input inputMode="decimal" className={`${inputCls} font-mono`} value={form.cost} onChange={e => set('cost', e.target.value)} placeholder="0,000" />
                                </div>
                                <div>
                                    <label className={labelCls}>Μονάδα</label>
                                    <input className={inputCls} value={form.unit} onChange={e => set('unit', e.target.value)} placeholder="Τεμ" list="material-units" />
                                    <datalist id="material-units">
                                        {['Τεμ', 'm', 'cm', 'g', 'ml', 'Ζεύγος'].map(u => <option key={u} value={u} />)}
                                    </datalist>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        {!form.isStrand && (
                            <div>
                                <label className={labelCls}>Απόθεμα ({form.unit || 'Τεμ'})</label>
                                <input inputMode="numeric" className={inputCls} value={form.stock} onChange={e => set('stock', e.target.value.replace(/[^0-9]/g, ''))} />
                                <div className="mt-2 flex items-center gap-1.5">
                                    <input
                                        inputMode="numeric"
                                        className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-bold outline-none focus:border-slate-400"
                                        placeholder="Ποσότ."
                                        value={stockDelta}
                                        onChange={e => setStockDelta(e.target.value.replace(/[^0-9]/g, ''))}
                                    />
                                    <button type="button" onClick={() => applyDelta(1)} className="flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100"><Plus size={12} /> Παραλαβή</button>
                                    <button type="button" onClick={() => applyDelta(-1)} className="flex items-center gap-1 rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100"><Minus size={12} /> Ανάλωση</button>
                                </div>
                            </div>
                        )}
                        <div>
                            <label className={labelCls}>Βάρος / μονάδα (g)</label>
                            <input inputMode="decimal" className={`${inputCls} font-mono`} value={form.weight} onChange={e => set('weight', e.target.value)} placeholder="Άγνωστο" />
                            <p className="mt-1.5 text-[11px] text-slate-400">Χρησιμοποιείται στον υπολογισμό συνολικού βάρους. Κενό = άγνωστο.</p>
                        </div>
                    </div>

                    {initial && <ResourceUsageStrip kind="material" id={initial.id} label={initial.name} />}
                </div>

                <div className="flex items-center gap-3 border-t border-slate-100 bg-slate-50/60 px-6 py-4">
                    {initial && onDelete && (
                        <button onClick={() => onDelete(initial)} disabled={saving} className="rounded-xl border border-red-100 bg-red-50 p-2.5 text-red-500 hover:bg-red-100" title="Διαγραφή">
                            <Trash2 size={16} />
                        </button>
                    )}
                    <div className="min-w-0 flex-1 truncate text-xs font-semibold text-amber-600">{errors[0] || ''}</div>
                    <button onClick={onClose} disabled={saving} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50">Άκυρο</button>
                    <button
                        onClick={submit}
                        disabled={saving || errors.length > 0}
                        className="flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white shadow-lg hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} {initial ? 'Αποθήκευση' : 'Δημιουργία'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// -- CARD --

interface CardProps {
    material: Material;
    supplierName?: string;
    onEdit: (m: Material) => void;
    onDuplicate: (m: Material) => void;
    onEditVariants: (m: Material) => void;
    onQuickStock: (m: Material, delta: number) => void;
}

const MaterialCard: React.FC<CardProps> = ({ material, supplierName, onEdit, onDuplicate, onEditVariants, onQuickStock }) => {
    const strand = isStrandMaterial(material);
    const low = isLowStock(material);
    const variants = variantCount(material);

    return (
        <div className="group flex flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-200 hover:shadow-md">
            <div className="flex-1 space-y-4 p-4">
                <div className="flex items-start gap-3">
                    <MaterialBadge material={material} />
                    <div className="min-w-0 flex-1">
                        <button onClick={() => onEdit(material)} className="block text-left text-sm font-bold leading-tight text-slate-800 hover:text-slate-950 hover:underline" title={material.name}>
                            {material.name}
                        </button>
                        <div className="mt-1 truncate text-xs text-slate-500">{material.description || MAT_TYPE_MAP[material.type] || material.type}</div>
                    </div>
                    <div className="flex shrink-0 gap-0.5 opacity-60 transition group-hover:opacity-100">
                        <button onClick={() => onDuplicate(material)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Αντιγραφή"><Copy size={15} /></button>
                        <button onClick={() => onEdit(material)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Επεξεργασία"><Pencil size={15} /></button>
                    </div>
                </div>

                {strand ? (
                    <div className="grid grid-cols-3 divide-x divide-purple-100 rounded-xl border border-purple-100 bg-purple-50/70">
                        <Metric label="Σειρά" value={formatCurrency(material.cost_per_unit * (material.stones_per_strand || 0))} tone="text-purple-800" />
                        <Metric label="Πέτρες" value={formatNumber(material.stones_per_strand)} tone="text-purple-800" />
                        <Metric label="/ Πέτρα" value={formatCurrency(material.cost_per_unit)} tone="text-purple-800" />
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Κόστος / {material.unit}</div>
                            <div className="font-mono text-sm font-black text-slate-800">{formatCurrency(material.cost_per_unit)}</div>
                        </div>
                        <div className={`rounded-xl border px-3 py-2 ${low ? 'border-amber-200 bg-amber-50' : 'border-slate-100 bg-slate-50'}`}>
                            <div className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide ${low ? 'text-amber-600' : 'text-slate-400'}`}>
                                {low ? <AlertTriangle size={10} /> : <Package size={10} />} Απόθεμα
                            </div>
                            <div className="flex items-center justify-between gap-1">
                                <span className={`text-sm font-black tabular-nums ${low ? 'text-amber-700' : 'text-slate-800'}`}>{formatNumber(material.stock_qty || 0)}</span>
                                <span className="flex gap-0.5">
                                    <button onClick={() => onQuickStock(material, -1)} disabled={(material.stock_qty || 0) <= 0} className="rounded-md bg-white p-0.5 text-slate-500 ring-1 ring-slate-200 hover:text-slate-800 disabled:opacity-30" title="−1"><Minus size={11} /></button>
                                    <button onClick={() => onQuickStock(material, 1)} className="rounded-md bg-white p-0.5 text-slate-500 ring-1 ring-slate-200 hover:text-slate-800" title="+1"><Plus size={11} /></button>
                                </span>
                            </div>
                        </div>
                    </div>
                )}

                <div className="space-y-1.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-slate-400"><Weight size={12} /> Βάρος / μον.</span>
                        <span className={`font-mono font-bold tabular-nums ${hasWeight(material) ? 'text-slate-700' : 'text-slate-300'}`}>{formatWeight(material.unit_weight_g)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-slate-400"><Globe size={12} /> Προμηθευτής</span>
                        <span className={`truncate font-semibold ${supplierName ? 'text-slate-700' : 'text-slate-300'}`}>{supplierName || '—'}</span>
                    </div>
                    {!strand && (
                        <div className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-1.5 text-slate-400"><Coins size={12} /> Αξία αποθέματος</span>
                            <span className="font-mono font-bold tabular-nums text-emerald-700">{formatCurrency(stockValue(material))}</span>
                        </div>
                    )}
                </div>
            </div>

            <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/60 px-3 py-2">
                <button onClick={() => onEditVariants(material)} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold text-blue-600 transition-colors hover:bg-blue-50">
                    <Tag size={13} />
                    {variants > 0 ? <><span className="rounded bg-blue-100 px-1.5 text-[10px]">{formatNumber(variants)}</span> Ειδικές Τιμές</> : 'Ειδικές Τιμές'}
                </button>
            </div>
            <ResourceUsageStrip kind="material" id={material.id} label={material.name} />
        </div>
    );
};

const Metric: React.FC<{ label: string; value: React.ReactNode; tone: string }> = ({ label, value, tone }) => (
    <div className="px-2 py-2 text-center">
        <div className="text-[9px] font-bold uppercase tracking-wide text-purple-500">{label}</div>
        <div className={`font-mono text-xs font-black ${tone}`}>{value}</div>
    </div>
);

const KpiTile: React.FC<{ icon: React.ElementType; label: string; value: React.ReactNode; tone: string; active?: boolean; onClick?: () => void }> = ({ icon: Icon, label, value, tone, active, onClick }) => (
    <button
        type="button"
        onClick={onClick}
        disabled={!onClick}
        className={`flex min-w-0 items-center gap-3 rounded-2xl border bg-white p-4 text-left shadow-sm transition ${active ? 'border-slate-900 ring-2 ring-slate-900/10' : 'border-slate-100'} ${onClick ? 'hover:border-slate-300' : 'cursor-default'}`}
    >
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone}`}><Icon size={18} /></div>
        <div className="min-w-0">
            <div className="truncate text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</div>
            <div className="truncate text-lg font-black text-slate-800">{value}</div>
        </div>
    </button>
);

// -- PAGE --

export default function MaterialsPage({ settings, products, resourceTab = 'materials', onResourceTabChange }: Props) {
    const queryClient = useQueryClient();
    const { showToast, confirm } = useUI();

    const { data: materials, isLoading } = useQuery({ queryKey: ['materials'], queryFn: api.getMaterials });
    const { data: suppliersRaw } = useQuery({ queryKey: ['suppliers'], queryFn: api.getSuppliers });
    const suppliers: Supplier[] = useMemo(() => ((suppliersRaw as Supplier[] | undefined) || []).slice().sort((a, b) => a.name.localeCompare(b.name)), [suppliersRaw]);
    const supplierNames = useMemo(() => new Map(suppliers.map(s => [s.id, s.name])), [suppliers]);

    const [activeTab, setActiveTab] = useState<MaterialType>(MaterialType.Stone);
    const [stoneSubFilter, setStoneSubFilter] = useState<StoneSubFilter>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [supplierFilter, setSupplierFilter] = useState('');
    const [quickFilters, setQuickFilters] = useState<Set<QuickFilter>>(new Set());
    const [sortKey, setSortKey] = useState<SortKey>('name');
    const [sortDir, setSortDir] = useState<1 | -1>(1);
    const [viewMode, setViewMode] = useState<ViewMode>(() => {
        try { return (localStorage.getItem('materials:view') as ViewMode) || 'grid'; } catch { return 'grid'; }
    });
    useEffect(() => { try { localStorage.setItem('materials:view', viewMode); } catch { /* ignore */ } }, [viewMode]);

    // Editor
    const [editor, setEditor] = useState<{ material: Material | null } | null>(null);
    const [duplicateSeed, setDuplicateSeed] = useState<Material | null>(null);

    // Variant modal
    const [activeMaterialForVariants, setActiveMaterialForVariants] = useState<Material | null>(null);
    const [variantPrices, setVariantPrices] = useState<{ code: string; price: string }[]>([]);
    const [savingVariants, setSavingVariants] = useState(false);
    useRestartDraft('Παραλλαγές υλικού', variantPrices, { enabled: !!activeMaterialForVariants, busy: savingVariants, identity: activeMaterialForVariants?.id });

    const [showFab, setShowFab] = useState(false);
    const headerRef = useRef<HTMLDivElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const scrollContainer = document.querySelector('main > div.overflow-y-auto');
        if (!scrollContainer) return;
        const handleScroll = () => {
            if (headerRef.current) setShowFab(headerRef.current.getBoundingClientRect().bottom < 20);
        };
        scrollContainer.addEventListener('scroll', handleScroll);
        return () => scrollContainer.removeEventListener('scroll', handleScroll);
    }, []);

    // "/" focuses search; "N" opens a new material — only when not typing elsewhere.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const t = e.target as HTMLElement;
            if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
            if (editor || activeMaterialForVariants || e.ctrlKey || e.metaKey || e.altKey) return;
            if (e.key === '/') { e.preventDefault(); searchRef.current?.focus(); }
            if (e.key === 'n' || e.key === 'N') { e.preventDefault(); setEditor({ material: null }); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [editor, activeMaterialForVariants]);

    const tabCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        (materials || []).forEach(m => { counts[m.type] = (counts[m.type] || 0) + 1; });
        return counts;
    }, [materials]);

    const categoryMaterials = useMemo(() => (materials || []).filter(m => m.type === activeTab), [materials, activeTab]);

    const stoneCounts = useMemo(() => {
        const strand = categoryMaterials.filter(isStrandMaterial).length;
        return { all: categoryMaterials.length, strand, standard: categoryMaterials.length - strand };
    }, [categoryMaterials]);

    const filteredMaterials = useMemo(() => {
        const q = searchTerm.trim().toLowerCase();
        const list = categoryMaterials.filter(m => {
            if (activeTab === MaterialType.Stone && stoneSubFilter !== 'all') {
                if ((stoneSubFilter === 'strand') !== isStrandMaterial(m)) return false;
            }
            if (supplierFilter === '__none') { if (m.supplier_id) return false; }
            else if (supplierFilter && m.supplier_id !== supplierFilter) return false;
            if (quickFilters.has('low') && !isLowStock(m)) return false;
            if (quickFilters.has('noWeight') && hasWeight(m)) return false;
            if (quickFilters.has('noSupplier') && m.supplier_id) return false;
            if (quickFilters.has('variants') && variantCount(m) === 0) return false;
            if (q) {
                const haystack = [
                    m.name, m.description, supplierNames.get(m.supplier_id || ''), ...Object.keys(m.variant_prices || {}),
                ].filter(Boolean).join(' ').toLowerCase();
                if (!q.split(/\s+/).every(token => haystack.includes(token))) return false;
            }
            return true;
        });
        const val = (m: Material): number | string =>
            sortKey === 'cost' ? m.cost_per_unit
                : sortKey === 'stock' ? (isStrandMaterial(m) ? -1 : m.stock_qty || 0)
                : sortKey === 'value' ? stockValue(m)
                : m.name;
        return list.sort((a, b) => {
            const va = val(a), vb = val(b);
            const cmp = typeof va === 'string' ? va.localeCompare(vb as string, 'el') : va - (vb as number);
            return cmp * sortDir || a.name.localeCompare(b.name, 'el');
        });
    }, [categoryMaterials, activeTab, stoneSubFilter, supplierFilter, quickFilters, searchTerm, sortKey, sortDir, supplierNames]);

    const stats = useMemo(() => ({
        totalValue: categoryMaterials.reduce((acc, m) => acc + stockValue(m), 0),
        low: categoryMaterials.filter(isLowStock).length,
        noWeight: categoryMaterials.filter(m => !hasWeight(m)).length,
        noSupplier: categoryMaterials.filter(m => !m.supplier_id).length,
        grandTotal: (materials || []).reduce((acc, m) => acc + stockValue(m), 0),
    }), [categoryMaterials, materials]);

    const toggleQuick = (f: QuickFilter) => setQuickFilters(prev => {
        const next = new Set(prev);
        next.has(f) ? next.delete(f) : next.add(f);
        return next;
    });

    const activeFilterCount = quickFilters.size + (supplierFilter ? 1 : 0) + (searchTerm ? 1 : 0);
    const clearFilters = () => { setQuickFilters(new Set()); setSupplierFilter(''); setSearchTerm(''); };

    // Actions
    const handleSubmit = async (m: Material) => {
        try {
            await api.saveMaterial(m);
            await queryClient.invalidateQueries({ queryKey: ['materials'] });
            if (m.type !== activeTab) setActiveTab(m.type);
            showToast(m.id ? 'Αποθηκεύτηκε.' : 'Το υλικό δημιουργήθηκε.', 'success');
        } catch (e) {
            showToast('Σφάλμα αποθήκευσης.', 'error');
            throw e;
        }
    };

    const handleQuickStock = async (m: Material, delta: number) => {
        const next = Math.max(0, (m.stock_qty || 0) + delta);
        queryClient.setQueryData<Material[]>(['materials'], old => old?.map(x => x.id === m.id ? { ...x, stock_qty: next } : x));
        try {
            await api.saveMaterial({ ...m, stock_qty: next });
        } catch {
            showToast('Σφάλμα ενημέρωσης αποθέματος.', 'error');
        } finally {
            queryClient.invalidateQueries({ queryKey: ['materials'] });
        }
    };

    const handleDuplicate = (m: Material) => {
        const { id: _id, ...rest } = m;
        // The editor opens in "create" mode, prefilled with a copy.
        setDuplicateSeed({ ...rest, stock_qty: 0, name: `${m.name} (αντίγραφο)` } as Material);
        setEditor({ material: null });
    };

    const handleDelete = async (m: Material) => {
        const ok = await confirm({
            title: 'Διαγραφή υλικού',
            message: `Θα διαγραφεί οριστικά το «${m.name}». Προϊόντα που το χρησιμοποιούν στη συνταγή τους θα χάσουν το κόστος του. Συνέχεια;`,
            isDestructive: true,
        });
        if (!ok) return;
        try {
            await protectOperation(async () => {
                const { error } = await supabase.from('materials').delete().eq('id', m.id);
                if (error) throw error;
            });
            queryClient.invalidateQueries({ queryKey: ['materials'] });
            setEditor(null);
            showToast('Διαγράφηκε.', 'info');
        } catch {
            showToast('Σφάλμα διαγραφής.', 'error');
        }
    };

    const handleEditVariants = (m: Material) => {
        setActiveMaterialForVariants(m);
        setVariantPrices(Object.entries(m.variant_prices || {}).map(([code, price]) => ({ code, price: String(price) })));
    };

    const variantIssues = useMemo(() => {
        const seen = new Set<string>();
        const dup = new Set<string>();
        variantPrices.forEach(v => {
            const c = v.code.trim().toUpperCase();
            if (!c) return;
            if (seen.has(c)) dup.add(c);
            seen.add(c);
        });
        return dup;
    }, [variantPrices]);

    const saveVariantPrices = async () => {
        if (!activeMaterialForVariants || savingVariants || variantIssues.size) return;
        const pricesObj: Record<string, number> = {};
        variantPrices.forEach(vp => {
            const price = parseNum(vp.price);
            const code = vp.code.trim().toUpperCase();
            if (code && Number.isFinite(price) && price > 0) pricesObj[code] = price;
        });
        setSavingVariants(true);
        try {
            await protectOperation(async () => {
                const { error } = await supabase.from('materials').update({ variant_prices: pricesObj }).eq('id', activeMaterialForVariants.id);
                if (error) throw error;
            });
            queryClient.invalidateQueries({ queryKey: ['materials'] });
            setActiveMaterialForVariants(null);
            showToast('Ειδικές τιμές αποθηκεύτηκαν.', 'success');
        } catch {
            showToast('Σφάλμα.', 'error');
        } finally {
            setSavingVariants(false);
        }
    };

    const exportCsv = () => {
        const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const header = ['Όνομα', 'Περιγραφή', 'Κατηγορία', 'Μονάδα', 'Κόστος', 'Πέτρες/Σειρά', 'Απόθεμα', 'Αξία', 'Βάρος (g)', 'Προμηθευτής', 'Ειδικές τιμές'];
        const rows = filteredMaterials.map(m => [
            m.name, m.description, MAT_TYPE_MAP[m.type], m.unit, m.cost_per_unit.toFixed(4).replace('.', ','),
            m.stones_per_strand ?? '', isStrandMaterial(m) ? '' : m.stock_qty ?? 0, stockValue(m).toFixed(2).replace('.', ','),
            hasWeight(m) ? String(m.unit_weight_g).replace('.', ',') : '', supplierNames.get(m.supplier_id || '') || '',
            Object.entries(m.variant_prices || {}).map(([c, p]) => `${c}:${p}`).join(' '),
        ]);
        const csv = '﻿' + [header, ...rows].map(r => r.map(esc).join(';')).join('\r\n');
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = `ylika-${MAT_TYPE_MAP[activeTab]}-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const toggleSort = (key: SortKey) => {
        if (sortKey === key) setSortDir(d => (d === 1 ? -1 : 1));
        else { setSortKey(key); setSortDir(key === 'name' ? 1 : -1); }
    };

    if (isLoading) return <IliosLoader variant="section" detail="Υλικά" />;

    const activeTabMeta = TABS.find(t => t.id === activeTab)!;
    const openCreate = () => { setDuplicateSeed(null); setEditor({ material: null }); };

    const SortHeader: React.FC<{ k: SortKey; children: React.ReactNode; align?: 'left' | 'right' }> = ({ k, children, align = 'left' }) => (
        <th className={`px-4 py-3 ${align === 'right' ? 'text-right' : 'text-left'}`}>
            <button onClick={() => toggleSort(k)} className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider ${sortKey === k ? 'text-slate-800' : 'text-slate-400 hover:text-slate-600'}`}>
                {children} <ArrowUpDown size={11} className={sortKey === k ? '' : 'opacity-40'} />
            </button>
        </th>
    );

    const chip = (active: boolean) =>
        `flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-bold transition ${active ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`;

    return (
        <ResourceUsageProvider products={products} scopeKey={`${activeTab}:${stoneSubFilter}:${searchTerm}:${viewMode}:${!!activeMaterialForVariants}:${!!editor}`}>
            <div className="flex h-full flex-col space-y-5">
                <DesktopPageHeader
                    ref={headerRef}
                    icon={Gem}
                    title="Αποθήκη Υλικών"
                    subtitle="Διαχείριση πρώτων υλών, αποθέματος & κοστολόγησης."
                    tailClassName="flex w-full min-w-0 flex-1 flex-wrap items-center gap-3 lg:ml-auto lg:max-w-none lg:justify-end"
                    tail={(
                        <div className="flex items-center gap-4">
                            <div className="hidden text-right sm:block">
                                <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">Συνολική Αξία Αποθήκης</div>
                                <div className="text-xl font-black text-emerald-600">{formatCurrency(stats.grandTotal)}</div>
                            </div>
                            <HeaderPrimaryButton icon={Plus} onClick={openCreate}>Νέο Υλικό</HeaderPrimaryButton>
                        </div>
                    )}
                    below={(
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="inline-flex max-w-full gap-1 overflow-x-auto rounded-2xl border border-slate-200/60 bg-slate-50 p-1 shadow-sm">
                                <button type="button" onClick={() => onResourceTabChange?.('materials')} className={`flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-bold transition-all duration-200 ${resourceTab === 'materials' ? 'bg-white text-[#060b00] shadow-sm ring-1 ring-slate-200/90' : 'text-slate-500 hover:bg-white/70 hover:text-slate-700'}`}>
                                    <Gem size={16} /> Υλικά
                                </button>
                                <button type="button" onClick={() => onResourceTabChange?.('molds')} className={`flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-bold transition-all duration-200 ${resourceTab === 'molds' ? 'bg-white text-[#060b00] shadow-sm ring-1 ring-slate-200/90' : 'text-slate-500 hover:bg-white/70 hover:text-slate-700'}`}>
                                    <MapPin size={16} /> Λάστιχα
                                </button>
                            </div>
                            <div className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-200/60 bg-slate-50 p-1 shadow-sm">
                                {TABS.map(tab => {
                                    const active = activeTab === tab.id;
                                    return (
                                        <button
                                            key={tab.id}
                                            type="button"
                                            onClick={() => { setActiveTab(tab.id); setStoneSubFilter('all'); }}
                                            className={`flex items-center gap-2 whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-bold transition-all ${active ? 'bg-white text-slate-900 shadow-md ring-1 ring-slate-100' : 'text-slate-500 hover:bg-slate-200 hover:text-slate-700'}`}
                                        >
                                            <tab.icon size={16} className={active ? tab.accent : 'text-slate-400'} />
                                            {tab.label}
                                            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-black tabular-nums ring-1 ${active ? tab.chip : 'bg-white text-slate-400 ring-slate-200'}`}>
                                                {formatNumber(tabCounts[tab.id] || 0)}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                />

                {/* KPI strip — scoped to the active category */}
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                    <KpiTile icon={activeTabMeta.icon} label={activeTabMeta.label} value={formatNumber(categoryMaterials.length)} tone={activeTabMeta.chip.split(' ').slice(0, 2).join(' ')} />
                    <KpiTile icon={Coins} label="Αξία κατηγορίας" value={formatCurrency(stats.totalValue)} tone="bg-emerald-50 text-emerald-600" />
                    <KpiTile icon={AlertTriangle} label={`Χαμηλό απόθεμα (≤${LOW_STOCK_THRESHOLD})`} value={formatNumber(stats.low)} tone="bg-amber-50 text-amber-600" active={quickFilters.has('low')} onClick={() => toggleQuick('low')} />
                    <KpiTile icon={Weight} label="Χωρίς βάρος" value={formatNumber(stats.noWeight)} tone="bg-sky-50 text-sky-600" active={quickFilters.has('noWeight')} onClick={() => toggleQuick('noWeight')} />
                    <KpiTile icon={Globe} label="Χωρίς προμηθευτή" value={formatNumber(stats.noSupplier)} tone="bg-slate-100 text-slate-500" active={quickFilters.has('noSupplier')} onClick={() => toggleQuick('noSupplier')} />
                </div>

                {/* Toolbar */}
                <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-100 bg-white p-2 shadow-sm">
                    <div className="flex min-w-[220px] flex-1 items-center rounded-xl border border-slate-200 bg-slate-50 px-2 focus-within:border-slate-400 focus-within:bg-white">
                        <Search size={16} className="text-slate-400" />
                        <input
                            ref={searchRef}
                            placeholder="Αναζήτηση ονόματος, περιγραφής, προμηθευτή, κωδικού…"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Escape') setSearchTerm(''); }}
                            className="w-full bg-transparent px-2 py-2 text-sm font-semibold text-slate-700 outline-none"
                        />
                        {searchTerm ? (
                            <button onClick={() => setSearchTerm('')} className="text-slate-400 hover:text-slate-600"><X size={14} /></button>
                        ) : (
                            <kbd className="hidden rounded border border-slate-200 bg-white px-1.5 text-[10px] font-bold text-slate-400 sm:block">/</kbd>
                        )}
                    </div>

                    {activeTab === MaterialType.Stone && (
                        <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1">
                            {([['all', 'Όλες'], ['standard', 'Συμβατικές'], ['strand', 'Κορδόνι']] as const).map(([k, label]) => (
                                <button
                                    key={k}
                                    onClick={() => setStoneSubFilter(k)}
                                    className={`rounded-lg px-3 py-1.5 text-xs font-black transition-all ${stoneSubFilter === k ? (k === 'strand' ? 'bg-purple-600 text-white shadow-sm' : 'bg-slate-900 text-white shadow-sm') : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    {label} <span className="opacity-60">{stoneCounts[k]}</span>
                                </button>
                            ))}
                        </div>
                    )}

                    <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2">
                        <Globe size={14} className="text-slate-400" />
                        <select value={supplierFilter} onChange={e => setSupplierFilter(e.target.value)} className="max-w-[170px] bg-transparent py-2 text-xs font-bold text-slate-600 outline-none">
                            <option value="">Όλοι οι προμηθευτές</option>
                            <option value="__none">— Χωρίς προμηθευτή —</option>
                            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </div>

                    <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2">
                        <ArrowUpDown size={14} className="text-slate-400" />
                        <select
                            value={`${sortKey}:${sortDir}`}
                            onChange={e => { const [k, d] = e.target.value.split(':'); setSortKey(k as SortKey); setSortDir(Number(d) as 1 | -1); }}
                            className="bg-transparent py-2 text-xs font-bold text-slate-600 outline-none"
                        >
                            <option value="name:1">Όνομα (Α→Ω)</option>
                            <option value="name:-1">Όνομα (Ω→Α)</option>
                            <option value="cost:-1">Κόστος ↓</option>
                            <option value="cost:1">Κόστος ↑</option>
                            <option value="stock:1">Απόθεμα ↑</option>
                            <option value="stock:-1">Απόθεμα ↓</option>
                            <option value="value:-1">Αξία ↓</option>
                        </select>
                    </div>

                    <div className="ml-auto flex items-center gap-1">
                        <button onClick={exportCsv} disabled={!filteredMaterials.length} className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40" title="Εξαγωγή CSV">
                            <Download size={15} /> CSV
                        </button>
                        <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-0.5">
                            <button onClick={() => setViewMode('grid')} className={`rounded-lg p-1.5 ${viewMode === 'grid' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`} title="Κάρτες"><LayoutGrid size={16} /></button>
                            <button onClick={() => setViewMode('table')} className={`rounded-lg p-1.5 ${viewMode === 'table' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`} title="Πίνακας"><ListIcon size={16} /></button>
                        </div>
                    </div>
                </div>

                {/* Active filters / result summary */}
                <div className="-mt-1 flex flex-wrap items-center gap-2 px-1">
                    <span className="text-xs font-bold text-slate-500">
                        {formatNumber(filteredMaterials.length)} από {formatNumber(categoryMaterials.length)} υλικά
                    </span>
                    <button onClick={() => toggleQuick('variants')} className={chip(quickFilters.has('variants'))}><Tag size={12} /> Με ειδικές τιμές</button>
                    {activeFilterCount > 0 && (
                        <button onClick={clearFilters} className="flex items-center gap-1 text-xs font-bold text-slate-400 hover:text-slate-700">
                            <Filter size={12} /> Καθαρισμός φίλτρων ({activeFilterCount})
                        </button>
                    )}
                </div>

                {/* CONTENT */}
                <div className="flex min-h-0 flex-1 flex-col">
                    <div key={`${activeTab}:${viewMode}`} className="flex-1 pb-20 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        {filteredMaterials.length === 0 ? (
                            <EmptyState
                                icon={Box}
                                title={categoryMaterials.length ? 'Κανένα υλικό δεν ταιριάζει στα φίλτρα.' : 'Δεν υπάρχουν υλικά σε αυτή την κατηγορία.'}
                                hint={categoryMaterials.length ? 'Αλλάξτε ή καθαρίστε τα φίλτρα.' : 'Πατήστε «Νέο Υλικό» (ή N) για να προσθέσετε.'}
                            />
                        ) : viewMode === 'grid' ? (
                            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                {filteredMaterials.map(material => (
                                    <MaterialCard
                                        key={material.id}
                                        material={material}
                                        supplierName={supplierNames.get(material.supplier_id || '')}
                                        onEdit={m => { setDuplicateSeed(null); setEditor({ material: m }); }}
                                        onDuplicate={handleDuplicate}
                                        onEditVariants={handleEditVariants}
                                        onQuickStock={handleQuickStock}
                                    />
                                ))}
                            </div>
                        ) : (
                            <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-sm">
                                <table className="w-full min-w-[860px] text-sm">
                                    <thead className="border-b border-slate-100 bg-slate-50/80">
                                        <tr>
                                            <SortHeader k="name">Υλικό</SortHeader>
                                            <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-wider text-slate-400">Προμηθευτής</th>
                                            <SortHeader k="cost" align="right">Κόστος</SortHeader>
                                            <SortHeader k="stock" align="right">Απόθεμα</SortHeader>
                                            <SortHeader k="value" align="right">Αξία</SortHeader>
                                            <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-wider text-slate-400">Βάρος</th>
                                            <th className="px-4 py-3 text-center text-[10px] font-black uppercase tracking-wider text-slate-400">Ειδ. Τιμές</th>
                                            <th className="w-24 px-4 py-3" />
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {filteredMaterials.map(m => {
                                            const strand = isStrandMaterial(m);
                                            const low = isLowStock(m);
                                            return (
                                                <tr key={m.id} className="group hover:bg-slate-50/70">
                                                    <td className="px-4 py-2.5">
                                                        <button onClick={() => { setDuplicateSeed(null); setEditor({ material: m }); }} className="flex items-center gap-3 text-left">
                                                            <MaterialBadge material={m} size="sm" />
                                                            <span className="min-w-0">
                                                                <span className="block font-bold text-slate-800 group-hover:underline">{m.name}</span>
                                                                <span className="block truncate text-xs text-slate-400">
                                                                    {strand ? `Σειρά ${formatNumber(m.stones_per_strand)} πετρών · ${formatCurrency(m.cost_per_unit * (m.stones_per_strand || 0))}` : (m.description || MAT_TYPE_MAP[m.type])}
                                                                </span>
                                                            </span>
                                                        </button>
                                                    </td>
                                                    <td className="px-4 py-2.5 text-xs font-semibold text-slate-600">{supplierNames.get(m.supplier_id || '') || <span className="text-slate-300">—</span>}</td>
                                                    <td className="px-4 py-2.5 text-right font-mono font-bold tabular-nums text-slate-800">{formatCurrency(m.cost_per_unit)}<span className="ml-0.5 text-[10px] font-normal text-slate-400">/{strand ? 'πέτρα' : m.unit}</span></td>
                                                    <td className="px-4 py-2.5 text-right">
                                                        {strand ? <span className="text-slate-300">—</span> : (
                                                            <span className="inline-flex items-center gap-1.5">
                                                                <button onClick={() => handleQuickStock(m, -1)} disabled={(m.stock_qty || 0) <= 0} className="rounded p-0.5 text-slate-300 opacity-0 hover:bg-slate-100 hover:text-slate-700 group-hover:opacity-100 disabled:opacity-0"><Minus size={12} /></button>
                                                                <span className={`min-w-[2.5rem] rounded-md px-1.5 py-0.5 font-black tabular-nums ${low ? 'bg-amber-50 text-amber-700' : 'text-slate-800'}`}>{formatNumber(m.stock_qty || 0)}</span>
                                                                <button onClick={() => handleQuickStock(m, 1)} className="rounded p-0.5 text-slate-300 opacity-0 hover:bg-slate-100 hover:text-slate-700 group-hover:opacity-100"><Plus size={12} /></button>
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-2.5 text-right font-mono font-bold tabular-nums text-emerald-700">{strand ? <span className="text-slate-300">—</span> : formatCurrency(stockValue(m))}</td>
                                                    <td className={`px-4 py-2.5 text-right font-mono text-xs font-bold tabular-nums ${hasWeight(m) ? 'text-slate-600' : 'text-slate-300'}`}>{formatWeight(m.unit_weight_g)}</td>
                                                    <td className="px-4 py-2.5 text-center">
                                                        <button onClick={() => handleEditVariants(m)} className={`rounded-lg px-2 py-1 text-xs font-bold ${variantCount(m) ? 'bg-blue-50 text-blue-700 hover:bg-blue-100' : 'text-slate-300 hover:bg-slate-100 hover:text-slate-600'}`}>
                                                            {variantCount(m) ? formatNumber(variantCount(m)) : '+'}
                                                        </button>
                                                    </td>
                                                    <td className="px-4 py-2.5 text-right">
                                                        <span className="inline-flex gap-0.5 opacity-0 transition group-hover:opacity-100">
                                                            <button onClick={() => handleDuplicate(m)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Αντιγραφή"><Copy size={14} /></button>
                                                            <button onClick={() => { setDuplicateSeed(null); setEditor({ material: m }); }} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Επεξεργασία"><Pencil size={14} /></button>
                                                            <button onClick={() => handleDelete(m)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Διαγραφή"><Trash2 size={14} /></button>
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                    <tfoot className="border-t border-slate-100 bg-slate-50/80">
                                        <tr>
                                            <td colSpan={4} className="px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-400">Σύνολο ({formatNumber(filteredMaterials.length)})</td>
                                            <td className="px-4 py-3 text-right font-mono font-black tabular-nums text-emerald-700">{formatCurrency(filteredMaterials.reduce((a, m) => a + stockValue(m), 0))}</td>
                                            <td colSpan={3} />
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        )}
                    </div>
                </div>

                {editor && (
                    <MaterialEditor
                        key={editor.material?.id ?? `new:${duplicateSeed?.name ?? ''}`}
                        initial={editor.material}
                        defaults={{ type: duplicateSeed?.type ?? activeTab, isStrand: duplicateSeed ? isStrandMaterial(duplicateSeed) : (activeTab === MaterialType.Stone && stoneSubFilter === 'strand') }}
                        seed={duplicateSeed}
                        suppliers={suppliers}
                        onClose={() => { setEditor(null); setDuplicateSeed(null); }}
                        onSubmit={handleSubmit}
                        onDelete={handleDelete}
                    />
                )}

                {/* VARIANT PRICING MODAL */}
                {activeMaterialForVariants && (
                    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in" onMouseDown={e => { if (e.target === e.currentTarget && !savingVariants) setActiveMaterialForVariants(null); }}>
                        <div className="w-full max-w-md rounded-3xl border border-slate-100 bg-white p-6 shadow-2xl animate-in zoom-in-95" onKeyDown={e => { if (e.key === 'Escape' && !savingVariants) setActiveMaterialForVariants(null); }}>
                            <div className="mb-5 flex items-start justify-between border-b border-slate-100 pb-4">
                                <div>
                                    <h3 className="flex items-center gap-2 text-lg font-black text-slate-800"><Tag size={18} className="text-blue-600" /> Ειδικές Τιμές</h3>
                                    <p className="text-xs font-bold text-slate-500">{activeMaterialForVariants.name}</p>
                                    <p className="mt-1 text-[11px] text-slate-400">Βασικό κόστος: <span className="font-mono font-bold text-slate-600">{formatCurrency(activeMaterialForVariants.cost_per_unit)}</span> — η ειδική τιμή αντικαθιστά το βασικό κόστος για τον κωδικό παραλλαγής.</p>
                                </div>
                                <button onClick={() => setActiveMaterialForVariants(null)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
                            </div>

                            <div className="custom-scrollbar mb-4 max-h-72 space-y-2 overflow-y-auto pr-1">
                                {variantPrices.map((vp, idx) => {
                                    const code = vp.code.trim().toUpperCase();
                                    const dup = code && variantIssues.has(code);
                                    const price = parseNum(vp.price);
                                    const diff = Number.isFinite(price) ? price - activeMaterialForVariants.cost_per_unit : NaN;
                                    return (
                                        <div key={idx} className={`flex items-center gap-2 rounded-xl border p-2 ${dup ? 'border-amber-300 bg-amber-50' : 'border-slate-100 bg-slate-50'}`}>
                                            <input
                                                autoFocus={idx === variantPrices.length - 1 && !vp.code}
                                                placeholder="Κωδικός (π.χ. LA)"
                                                value={vp.code}
                                                onChange={e => setVariantPrices(prev => prev.map((p, i) => i === idx ? { ...p, code: e.target.value.toUpperCase() } : p))}
                                                className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white p-2 font-mono text-sm font-bold uppercase outline-none focus:border-blue-500"
                                            />
                                            <div className="relative w-24">
                                                <input
                                                    inputMode="decimal"
                                                    value={vp.price}
                                                    onChange={e => setVariantPrices(prev => prev.map((p, i) => i === idx ? { ...p, price: e.target.value } : p))}
                                                    onKeyDown={e => { if (e.key === 'Enter') setVariantPrices(prev => [...prev, { code: '', price: '' }]); }}
                                                    className="w-full rounded-lg border border-slate-200 bg-white p-2 pr-6 text-right text-sm font-bold outline-none focus:border-blue-500"
                                                />
                                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">€</span>
                                            </div>
                                            <span className={`w-14 text-right font-mono text-[10px] font-bold ${!Number.isFinite(diff) || diff === 0 ? 'text-slate-300' : diff > 0 ? 'text-rose-500' : 'text-emerald-600'}`}>
                                                {Number.isFinite(diff) && diff !== 0 ? `${diff > 0 ? '+' : ''}${diff.toFixed(2)}` : '—'}
                                            </span>
                                            <button onClick={() => setVariantPrices(prev => prev.filter((_, i) => i !== idx))} className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"><Trash2 size={16} /></button>
                                        </div>
                                    );
                                })}
                                {variantPrices.length === 0 && <p className="py-6 text-center text-sm italic text-slate-400">Δεν υπάρχουν ειδικές τιμές.</p>}
                            </div>
                            {variantIssues.size > 0 && <p className="mb-3 text-xs font-bold text-amber-600">Διπλός κωδικός: {[...variantIssues].join(', ')}</p>}

                            <div className="flex gap-3">
                                <button onClick={() => setVariantPrices(prev => [...prev, { code: '', price: '' }])} className="flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 py-3 text-sm font-bold text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-50">
                                    <Plus size={16} /> Προσθήκη
                                </button>
                                <button onClick={saveVariantPrices} disabled={savingVariants || variantIssues.size > 0} className="flex flex-[2] items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-sm font-bold text-white shadow-lg transition-colors hover:bg-black disabled:opacity-40">
                                    {savingVariants && <Loader2 size={15} className="animate-spin" />} Αποθήκευση
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* FLOATING ACTION BUTTON */}
                <div className={`fixed bottom-8 right-8 z-[100] transition-all duration-300 ${showFab ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0'}`}>
                    <button
                        onClick={openCreate}
                        className="flex h-16 w-16 transform items-center justify-center gap-3 rounded-full bg-[#060b00] font-bold text-white shadow-2xl transition-all duration-200 ease-in-out hover:-translate-y-1 hover:scale-105 hover:bg-black sm:h-auto sm:w-auto sm:px-6 sm:py-4"
                    >
                        <Plus size={24} /> <span className="hidden whitespace-nowrap sm:inline">Νέο Υλικό</span>
                    </button>
                </div>
            </div>
        </ResourceUsageProvider>
    );
}
