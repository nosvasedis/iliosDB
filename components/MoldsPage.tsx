import { protectOperation } from '../lib/appUpdates';
import { useRestartDraft } from '../hooks/useRestartBlocker';
import { formatNumber } from '../utils/numberFormat';
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Mold, Product } from '../types';
import {
    Trash2, Plus, MapPin, Gem, Search, X, Check, Puzzle, ArrowDown, Pencil, Copy, Weight, Layers,
    LayoutGrid, List as ListIcon, ArrowUpDown, Download, Filter, Loader2, Archive, AlertTriangle,
} from 'lucide-react';
import { filterMoldsByCategory, isLstxMold, MoldCategoryTab } from '../utils/moldCategories';
import { supabase } from '../lib/supabase';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { api } from '../lib/supabase';
import { useUI } from './UIProvider';
import DesktopPageHeader, { HeaderPrimaryButton } from './DesktopPageHeader';
import IliosLoader from './ui/IliosLoader';
import { ResourceUsageProvider, ResourceUsageStrip } from './resources/ResourceUsage';
import EmptyState from './ui/EmptyState';

type QuickFilter = 'noLocation' | 'noWeight';
type SortKey = 'code' | 'location' | 'weight';
type ViewMode = 'grid' | 'table';

const hasWeight = (m: Mold) => !!m.weight_g && m.weight_g > 0;
const hasLocation = (m: Mold) => !!m.location?.trim();
const formatWeight = (g?: number) => (g && g > 0 ? `${g.toLocaleString('el-GR', { maximumFractionDigits: 2 })} g` : '—');
const compareCodes = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
const parseNum = (v: string) => {
    const n = parseFloat(v.replace(',', '.'));
    return Number.isFinite(n) ? n : NaN;
};

// -- EDITOR (create + edit) --

interface EditorProps {
    initial: Mold | null;
    seed: Mold;
    existingCodes: Set<string>;
    locations: string[];
    onClose: () => void;
    onSubmit: (m: Mold, isNew: boolean) => Promise<void>;
    onDelete?: (code: string) => void;
}

const MoldEditor: React.FC<EditorProps> = ({ initial, seed, existingCodes, locations, onClose, onSubmit, onDelete }) => {
    const base = initial || seed;
    const [code, setCode] = useState(base.code);
    const [location, setLocation] = useState(base.location || '');
    const [description, setDescription] = useState(base.description || '');
    const [weight, setWeight] = useState(base.weight_g ? String(base.weight_g) : '');
    const [saving, setSaving] = useState(false);
    useRestartDraft(initial ? 'Στοιχεία λάστιχου' : 'Νέο λάστιχο', { code, location, description, weight }, { busy: saving, identity: initial?.code ?? 'new' });

    const normalizedCode = code.trim().toUpperCase();
    const weightNum = weight.trim() === '' ? 0 : parseNum(weight);
    const lstx = isLstxMold(normalizedCode);

    const errors: string[] = [];
    if (!initial) {
        if (!normalizedCode || normalizedCode === 'L' || normalizedCode === 'LSTX') errors.push('Συμπληρώστε κωδικό.');
        else if (existingCodes.has(normalizedCode)) errors.push(`Ο κωδικός ${normalizedCode} υπάρχει ήδη.`);
    }
    if (!Number.isFinite(weightNum) || weightNum < 0) errors.push('Μη έγκυρο βάρος.');

    const submit = async () => {
        if (saving || errors.length) return;
        setSaving(true);
        try {
            await onSubmit({ code: initial ? initial.code : normalizedCode, location: location.trim(), description: description.trim(), weight_g: weightNum }, !initial);
            onClose();
        } catch { /* Parent reports the error; keep the draft. */ }
        finally { setSaving(false); }
    };

    const inputCls = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100';
    const labelCls = 'mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-400';

    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in" onMouseDown={e => { if (e.target === e.currentTarget && !saving) onClose(); }}>
            <div
                className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-2xl animate-in zoom-in-95"
                onKeyDown={e => {
                    if (e.key === 'Escape' && !saving) onClose();
                    if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') submit();
                }}
            >
                <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
                    <div className="flex items-center gap-3">
                        <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${lstx ? 'bg-blue-100 text-blue-600' : 'bg-amber-100 text-amber-600'}`}>
                            {lstx ? <Puzzle size={20} /> : <MapPin size={20} />}
                        </div>
                        <div>
                            <h3 className="text-lg font-black text-slate-800">{initial ? 'Επεξεργασία Λάστιχου' : lstx ? 'Νέο LSTX' : 'Νέο Λάστιχο'}</h3>
                            <p className="font-mono text-xs font-bold text-slate-400">{initial ? initial.code : 'Ο κωδικός δεν αλλάζει μετά τη δημιουργία.'}</p>
                        </div>
                    </div>
                    <button onClick={onClose} disabled={saving} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"><X size={20} /></button>
                </div>

                <div className="custom-scrollbar flex-1 space-y-4 overflow-y-auto px-6 py-5">
                    {!initial && (
                        <div>
                            <label className={labelCls}>Κωδικός</label>
                            <input autoFocus className={`${inputCls} font-mono uppercase`} value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="π.χ. L1221 ή LSTX12" />
                            <p className="mt-1.5 text-[11px] text-slate-400">
                                {lstx ? 'Θα καταχωρηθεί στα LSTX.' : 'Θα καταχωρηθεί στα κανονικά λάστιχα. Κωδικοί που ξεκινούν με LSTX πάνε στα LSTX.'}
                            </p>
                        </div>
                    )}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className={labelCls}>Τοποθεσία</label>
                            <input autoFocus={!!initial} className={inputCls} value={location} onChange={e => setLocation(e.target.value)} placeholder="Συρτάρι 1" list="mold-locations" />
                            <datalist id="mold-locations">{locations.map(l => <option key={l} value={l} />)}</datalist>
                        </div>
                        <div>
                            <label className={labelCls}>Βάρος χύτευσης (g)</label>
                            <input inputMode="decimal" className={`${inputCls} font-mono`} value={weight} onChange={e => setWeight(e.target.value)} placeholder="0,00" />
                        </div>
                    </div>
                    <div>
                        <label className={labelCls}>Περιγραφή</label>
                        <input className={inputCls} value={description} onChange={e => setDescription(e.target.value)} placeholder="Περιγραφή καλουπιού..." />
                    </div>
                    {initial && <ResourceUsageStrip kind="mold" id={initial.code} label={initial.code} />}
                </div>

                <div className="flex items-center gap-3 border-t border-slate-100 bg-slate-50/60 px-6 py-4">
                    {initial && onDelete && (
                        <button onClick={() => onDelete(initial.code)} disabled={saving} className="rounded-xl border border-red-100 bg-red-50 p-2.5 text-red-500 hover:bg-red-100" title="Διαγραφή">
                            <Trash2 size={16} />
                        </button>
                    )}
                    <div className="min-w-0 flex-1 truncate text-xs font-semibold text-amber-600">{errors[0] || ''}</div>
                    <button onClick={onClose} disabled={saving} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50">Άκυρο</button>
                    <button
                        onClick={submit}
                        disabled={saving || errors.length > 0}
                        className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white shadow-lg disabled:cursor-not-allowed disabled:opacity-40 ${lstx ? 'bg-blue-600 hover:bg-blue-700' : 'bg-slate-900 hover:bg-black'}`}
                    >
                        {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} {initial ? 'Αποθήκευση' : 'Προσθήκη'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// -- CARD --

interface MoldCardProps {
    mold: Mold;
    highlighted?: boolean;
    onEdit: (m: Mold) => void;
    onDuplicate: (m: Mold) => void;
}

const MoldCard: React.FC<MoldCardProps> = ({ mold, highlighted = false, onEdit, onDuplicate }) => {
    const lstx = isLstxMold(mold.code);
    return (
        <div className={`group flex h-full flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition-all duration-200 ${highlighted ? 'border-amber-400 shadow-lg ring-4 ring-amber-400/40' : 'border-slate-100 hover:-translate-y-0.5 hover:border-slate-200 hover:shadow-md'}`}>
            <div className="flex-1 space-y-4 p-4">
                <div className="flex items-start gap-3">
                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${lstx ? 'bg-blue-100 text-blue-600' : 'bg-amber-100 text-amber-600'}`}>
                        {lstx ? <Puzzle size={20} /> : <MapPin size={20} />}
                    </div>
                    <div className="min-w-0 flex-1">
                        <button onClick={() => onEdit(mold)} className="block text-left font-mono text-base font-black leading-tight text-slate-800 hover:underline">{mold.code}</button>
                        <div className={`mt-1 truncate text-xs ${mold.description ? 'text-slate-500' : 'italic text-slate-300'}`}>{mold.description || 'Καμία περιγραφή'}</div>
                    </div>
                    <div className="flex shrink-0 gap-0.5 opacity-60 transition group-hover:opacity-100">
                        <button onClick={() => onDuplicate(mold)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Νέο με τα ίδια στοιχεία"><Copy size={15} /></button>
                        <button onClick={() => onEdit(mold)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Επεξεργασία"><Pencil size={15} /></button>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                    <div className={`rounded-xl border px-3 py-2 ${hasLocation(mold) ? 'border-slate-100 bg-slate-50' : 'border-amber-200 bg-amber-50'}`}>
                        <div className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide ${hasLocation(mold) ? 'text-slate-400' : 'text-amber-600'}`}>
                            <Archive size={10} /> Τοποθεσία
                        </div>
                        <div className={`truncate text-sm font-black ${hasLocation(mold) ? 'text-slate-800' : 'text-amber-700'}`}>{mold.location || 'Άγνωστη'}</div>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                        <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-400"><Weight size={10} /> Βάρος</div>
                        <div className={`font-mono text-sm font-black tabular-nums ${hasWeight(mold) ? 'text-slate-800' : 'text-slate-300'}`}>{formatWeight(mold.weight_g)}</div>
                    </div>
                </div>
            </div>
            <ResourceUsageStrip kind="mold" id={mold.code} label={mold.code} />
        </div>
    );
};

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

interface Props {
    products?: Product[];
    resourceTab?: 'materials' | 'molds';
    onResourceTabChange?: (tab: 'materials' | 'molds') => void;
}

export default function MoldsPage({ products, resourceTab = 'molds', onResourceTabChange }: Props) {
    const queryClient = useQueryClient();
    const { showToast, confirm } = useUI();
    const { data: molds, isLoading } = useQuery<Mold[]>({ queryKey: ['molds'], queryFn: api.getMolds });

    const [searchTerm, setSearchTerm] = useState('');
    const [moldTab, setMoldTab] = useState<MoldCategoryTab>('standard');
    const [locationFilter, setLocationFilter] = useState('');
    const [quickFilters, setQuickFilters] = useState<Set<QuickFilter>>(new Set());
    const [sortKey, setSortKey] = useState<SortKey>('code');
    const [sortDir, setSortDir] = useState<1 | -1>(1);
    const [viewMode, setViewMode] = useState<ViewMode>(() => {
        try { return (localStorage.getItem('molds:view') as ViewMode) || 'grid'; } catch { return 'grid'; }
    });
    useEffect(() => { try { localStorage.setItem('molds:view', viewMode); } catch { /* ignore */ } }, [viewMode]);

    const [editor, setEditor] = useState<{ mold: Mold | null; seed: Mold } | null>(null);

    // Floating search + highlight
    const [isFabSearchOpen, setIsFabSearchOpen] = useState(false);
    const [highlightCode, setHighlightCode] = useState<string | null>(null);
    const cardRefs = useRef<Record<string, HTMLElement | null>>({});

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

    const existingCodes = useMemo(() => new Set((molds || []).map(m => m.code.trim().toUpperCase())), [molds]);
    const locations = useMemo(
        () => [...new Set((molds || []).map(m => m.location?.trim()).filter(Boolean) as string[])].sort(compareCodes),
        [molds],
    );

    const counts = useMemo(() => {
        const all = molds || [];
        const lstx = all.filter(m => isLstxMold(m.code)).length;
        return { standard: all.length - lstx, lstx };
    }, [molds]);

    const categoryMolds = useMemo(() => (molds ? filterMoldsByCategory(molds, moldTab) : []), [molds, moldTab]);

    const stats = useMemo(() => {
        const weighted = categoryMolds.filter(hasWeight);
        return {
            noLocation: categoryMolds.filter(m => !hasLocation(m)).length,
            noWeight: categoryMolds.length - weighted.length,
            avgWeight: weighted.length ? weighted.reduce((a, m) => a + (m.weight_g || 0), 0) / weighted.length : 0,
        };
    }, [categoryMolds]);

    const filteredMolds = useMemo(() => {
        const tokens = searchTerm.trim().toLowerCase().split(/\s+/).filter(Boolean);
        const list = categoryMolds.filter(m => {
            if (locationFilter === '__none') { if (hasLocation(m)) return false; }
            else if (locationFilter && m.location?.trim() !== locationFilter) return false;
            if (quickFilters.has('noLocation') && hasLocation(m)) return false;
            if (quickFilters.has('noWeight') && hasWeight(m)) return false;
            if (tokens.length) {
                const haystack = `${m.code} ${m.description || ''} ${m.location || ''}`.toLowerCase();
                if (!tokens.every(t => haystack.includes(t))) return false;
            }
            return true;
        });
        return list.sort((a, b) => {
            const cmp = sortKey === 'location' ? compareCodes(a.location || '￿', b.location || '￿')
                : sortKey === 'weight' ? (a.weight_g || 0) - (b.weight_g || 0)
                : 0;
            return cmp * sortDir || compareCodes(a.code, b.code) * (sortKey === 'code' ? sortDir : 1);
        });
    }, [categoryMolds, searchTerm, locationFilter, quickFilters, sortKey, sortDir]);

    // Next free ascending standard code (L1220 -> L1221); LSTX codes are ignored.
    const nextStandardCode = useMemo(() => {
        const max = (molds || []).reduce((acc, m) => {
            const match = m.code.trim().toUpperCase().match(/^L(\d+)$/);
            return match ? Math.max(acc, parseInt(match[1], 10)) : acc;
        }, 0);
        return `L${max + 1}`;
    }, [molds]);

    const blankMold = (): Mold => ({ code: moldTab === 'lstx' ? 'LSTX' : nextStandardCode, location: '', description: '', weight_g: 0 });
    const openCreate = () => setEditor({ mold: null, seed: blankMold() });
    const openEdit = (m: Mold) => setEditor({ mold: m, seed: m });
    const openDuplicate = (m: Mold) => setEditor({ mold: null, seed: { ...m, code: isLstxMold(m.code) ? 'LSTX' : nextStandardCode } });

    // "/" focuses search; "N" opens a new mold — only when not typing elsewhere.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const t = e.target as HTMLElement;
            if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
            if (editor || e.ctrlKey || e.metaKey || e.altKey) return;
            if (e.key === '/') { e.preventDefault(); searchRef.current?.focus(); }
            if (e.key === 'n' || e.key === 'N') { e.preventDefault(); setEditor({ mold: null, seed: blankMold() }); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    });

    const scrollToLatest = () => {
        const scrollContainer = document.querySelector('main > div.overflow-y-auto');
        if (scrollContainer instanceof HTMLElement) scrollContainer.scrollTo({ top: scrollContainer.scrollHeight, behavior: 'smooth' });
    };

    const scrollToMold = (code: string) => {
        setHighlightCode(code);
        window.setTimeout(() => cardRefs.current[code]?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
    };

    const closeFabSearch = () => {
        setIsFabSearchOpen(false);
        setSearchTerm('');
        setHighlightCode(null);
    };

    // Search across every λάστιχο (both categories) so results are never hidden by the active tab.
    const fabSearchMatches = useMemo(() => {
        if (!searchTerm.trim()) return [];
        const q = searchTerm.trim().toUpperCase();
        return (molds || []).filter(m => m.code.toUpperCase().includes(q) || (m.description || '').toLowerCase().includes(searchTerm.toLowerCase()));
    }, [molds, searchTerm]);

    // Auto-switch to the category that actually contains the match.
    useEffect(() => {
        if (!isFabSearchOpen || !fabSearchMatches.length) return;
        const targetTab = isLstxMold(fabSearchMatches[0].code) ? 'lstx' : 'standard';
        if (targetTab !== moldTab) setMoldTab(targetTab);
    }, [isFabSearchOpen, fabSearchMatches, moldTab]);

    // When the search narrows to a single λάστιχο, jump straight to it.
    useEffect(() => {
        if (!isFabSearchOpen || !searchTerm.trim() || filteredMolds.length !== 1) return;
        scrollToMold(filteredMolds[0].code);
    }, [isFabSearchOpen, searchTerm, filteredMolds]);

    useEffect(() => {
        if (!highlightCode) return;
        const t = window.setTimeout(() => setHighlightCode(null), 2500);
        return () => window.clearTimeout(t);
    }, [highlightCode]);

    const handleFabSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const match = fabSearchMatches[0];
        if (match) scrollToMold(match.code);
    };

    const toggleQuick = (f: QuickFilter) => setQuickFilters(prev => {
        const next = new Set(prev);
        next.has(f) ? next.delete(f) : next.add(f);
        return next;
    });
    const activeFilterCount = quickFilters.size + (locationFilter ? 1 : 0) + (searchTerm ? 1 : 0);
    const clearFilters = () => { setQuickFilters(new Set()); setLocationFilter(''); setSearchTerm(''); };

    const handleSubmit = async (m: Mold, isNew: boolean) => {
        try {
            const { error } = await protectOperation(async () => isNew
                ? await supabase.from('molds').insert(m)
                : await supabase.from('molds').update({ location: m.location, description: m.description, weight_g: m.weight_g }).eq('code', m.code));
            if (error) throw error;
            await queryClient.invalidateQueries({ queryKey: ['molds'] });
            if (isNew) {
                setMoldTab(isLstxMold(m.code) ? 'lstx' : 'standard');
                scrollToMold(m.code);
            }
            showToast(isNew ? `Το λάστιχο ${m.code} προστέθηκε.` : `Το λάστιχο ${m.code} αποθηκεύτηκε.`, 'success');
        } catch (e) {
            console.error(e);
            showToast(isNew ? 'Σφάλμα. Πιθανώς ο κωδικός υπάρχει ήδη.' : 'Σφάλμα αποθήκευσης.', 'error');
            throw e;
        }
    };

    const handleDelete = async (code: string) => {
        const yes = await confirm({
            title: 'Διαγραφή Λάστιχου',
            message: `Θα διαγραφεί οριστικά το λάστιχο ${code}. Προϊόντα που το χρησιμοποιούν θα χάσουν τη σύνδεση. Συνέχεια;`,
            isDestructive: true,
            confirmText: 'Διαγραφή',
        });
        if (!yes) return;
        try {
            const { error } = await protectOperation(async () => await supabase.from('molds').delete().eq('code', code));
            if (error) throw error;
            queryClient.invalidateQueries({ queryKey: ['molds'] });
            setEditor(null);
            showToast('Διαγράφηκε.', 'info');
        } catch (e) {
            console.error(e);
            showToast('Σφάλμα κατά τη διαγραφή.', 'error');
        }
    };

    const exportCsv = () => {
        const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const rows = filteredMolds.map(m => [m.code, m.description, m.location, m.weight_g ? String(m.weight_g).replace('.', ',') : '']);
        const csv = '﻿' + [['Κωδικός', 'Περιγραφή', 'Τοποθεσία', 'Βάρος (g)'], ...rows].map(r => r.map(esc).join(';')).join('\r\n');
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = `lastixa-${moldTab}-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const toggleSort = (key: SortKey) => {
        if (sortKey === key) setSortDir(d => (d === 1 ? -1 : 1));
        else { setSortKey(key); setSortDir(key === 'weight' ? -1 : 1); }
    };

    if (isLoading) return <IliosLoader variant="section" detail="Λάστιχα" />;

    const isLstxTab = moldTab === 'lstx';

    const SortHeader: React.FC<{ k: SortKey; children: React.ReactNode; align?: 'left' | 'right' }> = ({ k, children, align = 'left' }) => (
        <th className={`px-4 py-3 ${align === 'right' ? 'text-right' : 'text-left'}`}>
            <button onClick={() => toggleSort(k)} className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider ${sortKey === k ? 'text-slate-800' : 'text-slate-400 hover:text-slate-600'}`}>
                {children} <ArrowUpDown size={11} className={sortKey === k ? '' : 'opacity-40'} />
            </button>
        </th>
    );

    return (
        <ResourceUsageProvider products={products} scopeKey={`${moldTab}:${searchTerm}:${viewMode}:${!!editor}`}>
            <div className="flex h-full flex-col space-y-5">
                <DesktopPageHeader
                    ref={headerRef}
                    icon={MapPin}
                    title="Διαχείριση Λάστιχων"
                    subtitle="Οργάνωση καλουπιών παραγωγής, τοποθεσιών & βαρών χύτευσης."
                    tailClassName="flex w-full min-w-0 flex-1 flex-wrap items-center gap-3 lg:ml-auto lg:max-w-none lg:justify-end"
                    tail={(
                        <div className="flex items-center gap-4">
                            <div className="hidden text-right sm:block">
                                <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">Σύνολο Λάστιχων</div>
                                <div className="text-xl font-black text-amber-600">{formatNumber((molds || []).length)}</div>
                            </div>
                            <HeaderPrimaryButton icon={Plus} onClick={openCreate} tone={isLstxTab ? 'blue' : 'dark'}>
                                {isLstxTab ? 'Νέο LSTX' : 'Νέο Λάστιχο'}
                            </HeaderPrimaryButton>
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
                            <div className="flex gap-1 rounded-2xl border border-slate-200/60 bg-slate-50 p-1 shadow-sm">
                                {([['standard', 'Κανονικά', MapPin, 'text-amber-600', 'bg-amber-50 text-amber-700 ring-amber-100'], ['lstx', 'LSTX', Puzzle, 'text-blue-600', 'bg-blue-50 text-blue-700 ring-blue-100']] as const).map(([k, label, Icon, accent, chipCls]) => {
                                    const active = moldTab === k;
                                    return (
                                        <button
                                            key={k}
                                            type="button"
                                            onClick={() => { setMoldTab(k); setSearchTerm(''); setLocationFilter(''); }}
                                            className={`flex items-center gap-2 whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-bold transition-all ${active ? 'bg-white text-slate-900 shadow-md ring-1 ring-slate-100' : 'text-slate-500 hover:bg-slate-200 hover:text-slate-700'}`}
                                        >
                                            <Icon size={16} className={active ? accent : 'text-slate-400'} />
                                            {label}
                                            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-black tabular-nums ring-1 ${active ? chipCls : 'bg-white text-slate-400 ring-slate-200'}`}>{formatNumber(counts[k])}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                />

                {/* KPI strip — scoped to the active category */}
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <KpiTile icon={isLstxTab ? Puzzle : Layers} label={isLstxTab ? 'LSTX' : 'Κανονικά'} value={formatNumber(categoryMolds.length)} tone={isLstxTab ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'} />
                    <KpiTile icon={Weight} label="Μέσο βάρος" value={stats.avgWeight ? formatWeight(stats.avgWeight) : '—'} tone="bg-emerald-50 text-emerald-600" />
                    <KpiTile icon={AlertTriangle} label="Χωρίς τοποθεσία" value={formatNumber(stats.noLocation)} tone="bg-amber-50 text-amber-600" active={quickFilters.has('noLocation')} onClick={() => toggleQuick('noLocation')} />
                    <KpiTile icon={Weight} label="Χωρίς βάρος" value={formatNumber(stats.noWeight)} tone="bg-sky-50 text-sky-600" active={quickFilters.has('noWeight')} onClick={() => toggleQuick('noWeight')} />
                </div>

                {/* Toolbar */}
                <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-100 bg-white p-2 shadow-sm">
                    <div className="flex min-w-[220px] flex-1 items-center rounded-xl border border-slate-200 bg-slate-50 px-2 focus-within:border-slate-400 focus-within:bg-white">
                        <Search size={16} className="text-slate-400" />
                        <input
                            ref={searchRef}
                            placeholder="Αναζήτηση κωδικού, περιγραφής, τοποθεσίας…"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Escape') setSearchTerm('');
                                if (e.key === 'Enter' && filteredMolds[0]) scrollToMold(filteredMolds[0].code);
                            }}
                            className="w-full bg-transparent px-2 py-2 text-sm font-semibold text-slate-700 outline-none"
                        />
                        {searchTerm ? (
                            <button onClick={() => setSearchTerm('')} className="text-slate-400 hover:text-slate-600"><X size={14} /></button>
                        ) : (
                            <kbd className="hidden rounded border border-slate-200 bg-white px-1.5 text-[10px] font-bold text-slate-400 sm:block">/</kbd>
                        )}
                    </div>

                    <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2">
                        <Archive size={14} className="text-slate-400" />
                        <select value={locationFilter} onChange={e => setLocationFilter(e.target.value)} className="max-w-[170px] bg-transparent py-2 text-xs font-bold text-slate-600 outline-none">
                            <option value="">Όλες οι τοποθεσίες</option>
                            <option value="__none">— Χωρίς τοποθεσία —</option>
                            {locations.map(l => <option key={l} value={l}>{l}</option>)}
                        </select>
                    </div>

                    <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2">
                        <ArrowUpDown size={14} className="text-slate-400" />
                        <select
                            value={`${sortKey}:${sortDir}`}
                            onChange={e => { const [k, d] = e.target.value.split(':'); setSortKey(k as SortKey); setSortDir(Number(d) as 1 | -1); }}
                            className="bg-transparent py-2 text-xs font-bold text-slate-600 outline-none"
                        >
                            <option value="code:1">Κωδικός ↑</option>
                            <option value="code:-1">Κωδικός ↓ (νεότερα)</option>
                            <option value="location:1">Τοποθεσία</option>
                            <option value="weight:-1">Βάρος ↓</option>
                            <option value="weight:1">Βάρος ↑</option>
                        </select>
                    </div>

                    <div className="ml-auto flex items-center gap-1">
                        <button onClick={exportCsv} disabled={!filteredMolds.length} className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40" title="Εξαγωγή CSV">
                            <Download size={15} /> CSV
                        </button>
                        <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-0.5">
                            <button onClick={() => setViewMode('grid')} className={`rounded-lg p-1.5 ${viewMode === 'grid' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`} title="Κάρτες"><LayoutGrid size={16} /></button>
                            <button onClick={() => setViewMode('table')} className={`rounded-lg p-1.5 ${viewMode === 'table' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`} title="Πίνακας"><ListIcon size={16} /></button>
                        </div>
                    </div>
                </div>

                <div className="-mt-1 flex flex-wrap items-center gap-3 px-1">
                    <span className="text-xs font-bold text-slate-500">{formatNumber(filteredMolds.length)} από {formatNumber(categoryMolds.length)} λάστιχα</span>
                    {activeFilterCount > 0 && (
                        <button onClick={clearFilters} className="flex items-center gap-1 text-xs font-bold text-slate-400 hover:text-slate-700">
                            <Filter size={12} /> Καθαρισμός φίλτρων ({activeFilterCount})
                        </button>
                    )}
                </div>

                {/* CONTENT */}
                <div key={`${moldTab}:${viewMode}`} className="flex-1 pb-20 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    {filteredMolds.length === 0 ? (
                        <EmptyState
                            icon={MapPin}
                            title={categoryMolds.length ? 'Κανένα λάστιχο δεν ταιριάζει στα φίλτρα.' : isLstxTab ? 'Δεν υπάρχουν LSTX λάστιχα.' : 'Δεν υπάρχουν λάστιχα.'}
                            hint={categoryMolds.length ? 'Αλλάξτε ή καθαρίστε τα φίλτρα.' : 'Πατήστε «Νέο Λάστιχο» (ή N) για να προσθέσετε.'}
                        />
                    ) : viewMode === 'grid' ? (
                        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            {filteredMolds.map(mold => (
                                <div key={mold.code} ref={el => { cardRefs.current[mold.code] = el; }}>
                                    <MoldCard mold={mold} highlighted={highlightCode === mold.code} onEdit={openEdit} onDuplicate={openDuplicate} />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-sm">
                            <table className="w-full min-w-[640px] text-sm">
                                <thead className="border-b border-slate-100 bg-slate-50/80">
                                    <tr>
                                        <SortHeader k="code">Κωδικός</SortHeader>
                                        <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-wider text-slate-400">Περιγραφή</th>
                                        <SortHeader k="location">Τοποθεσία</SortHeader>
                                        <SortHeader k="weight" align="right">Βάρος</SortHeader>
                                        <th className="w-28 px-4 py-3" />
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {filteredMolds.map(m => (
                                        <tr key={m.code} ref={el => { cardRefs.current[m.code] = el; }} className={`group transition-colors ${highlightCode === m.code ? 'bg-amber-50' : 'hover:bg-slate-50/70'}`}>
                                            <td className="px-4 py-2.5">
                                                <button onClick={() => openEdit(m)} className="flex items-center gap-2.5">
                                                    <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${isLstxMold(m.code) ? 'bg-blue-100 text-blue-600' : 'bg-amber-100 text-amber-600'}`}>
                                                        {isLstxMold(m.code) ? <Puzzle size={13} /> : <MapPin size={13} />}
                                                    </span>
                                                    <span className="font-mono font-black text-slate-800 group-hover:underline">{m.code}</span>
                                                </button>
                                            </td>
                                            <td className={`max-w-[320px] truncate px-4 py-2.5 text-xs ${m.description ? 'text-slate-600' : 'text-slate-300'}`}>{m.description || '—'}</td>
                                            <td className="px-4 py-2.5">
                                                {hasLocation(m)
                                                    ? <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">{m.location}</span>
                                                    : <span className="rounded-md bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-600">Άγνωστη</span>}
                                            </td>
                                            <td className={`px-4 py-2.5 text-right font-mono text-xs font-bold tabular-nums ${hasWeight(m) ? 'text-slate-700' : 'text-slate-300'}`}>{formatWeight(m.weight_g)}</td>
                                            <td className="px-4 py-2.5 text-right">
                                                <span className="inline-flex gap-0.5 opacity-0 transition group-hover:opacity-100">
                                                    <button onClick={() => openDuplicate(m)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Νέο με τα ίδια στοιχεία"><Copy size={14} /></button>
                                                    <button onClick={() => openEdit(m)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Επεξεργασία"><Pencil size={14} /></button>
                                                    <button onClick={() => handleDelete(m.code)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Διαγραφή"><Trash2 size={14} /></button>
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {editor && (
                    <MoldEditor
                        key={editor.mold?.code ?? `new:${editor.seed.code}:${editor.seed.description}`}
                        initial={editor.mold}
                        seed={editor.seed}
                        existingCodes={existingCodes}
                        locations={locations}
                        onClose={() => setEditor(null)}
                        onSubmit={handleSubmit}
                        onDelete={handleDelete}
                    />
                )}

                {/* FLOATING ACTIONS — shown after scrolling past the header */}
                <div className={`fixed bottom-8 right-8 z-[100] flex items-end gap-3 transition-all duration-300 ${showFab ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0'}`}>
                    <button
                        type="button"
                        onClick={scrollToLatest}
                        title="Μετάβαση στο τελευταίο λάστιχο"
                        aria-label="Μετάβαση στο τελευταίο λάστιχο"
                        className="flex h-14 w-14 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-xl transition-all duration-200 hover:-translate-y-1 hover:text-[#060b00] sm:h-12 sm:w-12"
                    >
                        <ArrowDown size={22} />
                    </button>

                    {isFabSearchOpen ? (
                        <form onSubmit={handleFabSearchSubmit} className="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-2 pl-4 pr-2 shadow-xl animate-in fade-in slide-in-from-right-2 duration-200">
                            <Search size={18} className="shrink-0 text-slate-400" />
                            <input autoFocus value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Αναζήτηση λάστιχου..." className="w-40 bg-transparent text-sm font-bold text-slate-700 outline-none sm:w-56" />
                            <button type="button" onClick={closeFabSearch} aria-label="Κλείσιμο αναζήτησης" className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600">
                                <X size={18} />
                            </button>
                        </form>
                    ) : (
                        <button
                            type="button"
                            onClick={() => setIsFabSearchOpen(true)}
                            title="Αναζήτηση λάστιχου"
                            aria-label="Αναζήτηση λάστιχου"
                            className="flex h-14 w-14 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-xl transition-all duration-200 hover:-translate-y-1 hover:text-[#060b00] sm:h-12 sm:w-12"
                        >
                            <Search size={22} />
                        </button>
                    )}

                    <button
                        onClick={openCreate}
                        className={`flex h-16 w-16 transform items-center justify-center gap-3 rounded-full font-bold text-white shadow-2xl transition-all duration-200 ease-in-out hover:-translate-y-1 hover:scale-105 sm:h-auto sm:w-auto sm:px-6 sm:py-4 ${isLstxTab ? 'bg-blue-600 hover:bg-blue-700' : 'bg-[#060b00] hover:bg-black'}`}
                    >
                        <Plus size={24} /> <span className="hidden whitespace-nowrap sm:inline">{isLstxTab ? 'Νέο LSTX' : 'Νέο Λάστιχο'}</span>
                    </button>
                </div>
            </div>
        </ResourceUsageProvider>
    );
}
