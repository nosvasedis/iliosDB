import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Customer, Order, VatRegime } from '../types';
import {
  Activity, ArrowDownWideNarrow, ArrowUpNarrowWide, LayoutGrid, List, Loader2, Map as MapIcon, MapPinOff,
  PanelLeftClose, PanelLeftOpen, Plus, Radar, Search, ShoppingBag, Sparkles, UserPlus, Users, X,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { RETAIL_CUSTOMER_NAME } from '../lib/supabase';
import { useUI } from './UIProvider';
import CustomerDetailsModal from './CustomerDetailsModal';
import CreateCustomerModal from './CreateCustomerModal';
import { ordersRepository } from '../features/orders';
import { useCustomers, useOrdersWithItems } from '../hooks/api/useOrders';
import DesktopPageHeader from './DesktopPageHeader';
import {
  ACTIVITY_META,
  TIER_META,
  CUSTOMER_SORT_OPTIONS,
  matchesCustomerSearch,
  matchesEntryRegion,
  NO_REGION_KEY,
  regionFilterLabel,
  sortCustomerDirectory,
  type CustomerActivity,
  type CustomerTier,
  type CustomerDirectoryEntry,
  type CustomerSortKey,
  type RegionFilterKey,
  type SortDirection,
} from '../features/customers/customerLocation';
import { GREEK_PERIFERIES } from '../features/customers/greekRegions';
import { useCustomerDirectory } from './customers/useCustomerDirectory';
import CustomerCard, { SystemCustomerCard } from './customers/CustomerCard';
import CustomerListView from './customers/CustomerListView';
import CustomerRegionFilter from './customers/CustomerRegionFilter';
import CustomerCategoryFilter from './customers/CustomerCategoryFilter';
import CustomerPurchaseFilter, { purchaseFilterSummary } from './customers/CustomerPurchaseFilter';
import CustomerOverlapsPanel from './customers/CustomerOverlapsPanel';
import { TerritoryInsightChips } from './customers/customerUi';
import { useAssortmentIndex, useTerritoryPrefs } from './customers/useCustomerTerritory';
import { collectCustomerTags } from '../features/customers/customerProfile';
import {
  EMPTY_PURCHASE_FILTER,
  evaluatePurchaseFilter,
  findAllOverlaps,
  formatRadius,
  overlapSeverityByCustomer,
  type PurchaseFilter,
} from '../features/customers/customerAssortment';

const CustomersMap = React.lazy(() => import('./customers/CustomersMap'));

interface Props {
    onPrintOrder?: (order: Order) => void;
}

type ViewMode = 'cards' | 'list' | 'map';

const STORAGE_KEY = 'ilios.customersPage.v2';

/** 'match' sorts by pieces of the «Αγορές» filter items. */
type PageSortKey = CustomerSortKey | 'match';

interface StoredPrefs { view?: ViewMode; regions?: RegionFilterKey[]; sortKey?: PageSortKey; sortDir?: SortDirection; panel?: boolean; purchase?: PurchaseFilter }

function readPrefs(): StoredPrefs {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) as StoredPrefs : {};
    } catch {
        return {};
    }
}

function writePrefs(prefs: StoredPrefs) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch { /* storage unavailable */ }
}

const VIEW_OPTIONS: Array<{ id: ViewMode; label: string; icon: typeof LayoutGrid }> = [
    { id: 'cards', label: 'Κάρτες', icon: LayoutGrid },
    { id: 'list', label: 'Λίστα', icon: List },
    { id: 'map', label: 'Χάρτης', icon: MapIcon },
];

/** Card grid that adapts to any width instead of fixed breakpoints. */
const CARD_GRID_STYLE: React.CSSProperties = { gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 288px), 1fr))' };

/** Wide enough to keep the Περιοχές panel docked next to the cards. */
const DOCKED_PANEL_QUERY = '(min-width: 1536px)';

function useMediaQuery(query: string): boolean {
    const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
    useEffect(() => {
        const mq = window.matchMedia(query);
        const update = () => setMatches(mq.matches);
        update();
        mq.addEventListener('change', update);
        return () => mq.removeEventListener('change', update);
    }, [query]);
    return matches;
}

function KpiTile({ icon: Icon, label, value, hint, tone, active, onClick }: {
    icon: typeof Users; label: string; value: React.ReactNode; hint?: string;
    tone: string; active?: boolean; onClick?: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={!onClick}
            className={`flex min-w-0 items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition xl:px-4 ${active
                ? 'border-[#060b00] bg-[#060b00] text-white shadow-lg'
                : 'border-slate-100 bg-slate-50/60 hover:border-slate-200 hover:bg-white disabled:hover:border-slate-100 disabled:hover:bg-slate-50/60'}`}
        >
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl xl:h-9 xl:w-9 ${active ? 'bg-white/15 text-white' : tone}`}>
                <Icon size={17} />
            </span>
            <span className="min-w-0">
                <span className="block text-lg font-black leading-none tabular-nums">{value}</span>
                <span className={`mt-1 block truncate text-[11px] font-bold ${active ? 'text-white/70' : 'text-slate-500'}`}>{label}</span>
                {hint && <span className={`hidden truncate text-[10px] 2xl:block ${active ? 'text-white/50' : 'text-slate-400'}`}>{hint}</span>}
            </span>
        </button>
    );
}

function CardSkeleton() {
    return (
        <div className="h-[244px] animate-pulse rounded-3xl border border-slate-100 bg-white p-5">
            <div className="flex gap-3">
                <div className="h-12 w-12 rounded-2xl bg-slate-100" />
                <div className="flex-1 space-y-2 pt-1"><div className="h-3 w-3/4 rounded bg-slate-100" /><div className="h-2.5 w-1/2 rounded bg-slate-100" /></div>
            </div>
            <div className="mt-5 h-4 w-1/2 rounded-full bg-slate-100" />
            <div className="mt-5 h-14 rounded-2xl bg-slate-50" />
        </div>
    );
}

export default function CustomersPage({ onPrintOrder }: Props) {
    const queryClient = useQueryClient();
    const { showToast, confirm } = useUI();
    const { data: customers } = useCustomers();
    const { data: orders } = useOrdersWithItems();
    const { directory, regionCounts, saveLocation, canEditLocation } = useCustomerDirectory(customers, orders);

    const initialPrefs = useMemo(readPrefs, []);
    const [view, setViewState] = useState<ViewMode>(initialPrefs.view ?? 'cards');
    const [regions, setRegionsState] = useState<RegionFilterKey[]>(initialPrefs.regions ?? []);
    const [sortKey, setSortKey] = useState<PageSortKey>(initialPrefs.sortKey ?? 'name');
    const [sortDir, setSortDir] = useState<SortDirection>(initialPrefs.sortDir ?? 'asc');
    const [activityFilter, setActivityFilter] = useState<CustomerActivity | null>(null);
    const [tierFilter, setTierFilter] = useState<CustomerTier | null>(null);
    const setCategoryFilter = (activity: CustomerActivity | null, tier: CustomerTier | null = null) => {
        setActivityFilter(activity);
        setTierFilter(activity === 'active' ? tier : null);
    };
    const [searchTerm, setSearchTerm] = useState('');
    const [purchaseFilter, setPurchaseFilterState] = useState<PurchaseFilter>(() => {
        const stored = initialPrefs.purchase;
        return stored && Array.isArray(stored.items) ? { ...EMPTY_PURCHASE_FILTER, ...stored } : EMPTY_PURCHASE_FILTER;
    });
    /** Directory narrowed to specific customers (from the overlaps panel). */
    const [idFilter, setIdFilter] = useState<string[] | null>(null);
    const [overlapsOpen, setOverlapsOpen] = useState(false);
    const assortmentIndex = useAssortmentIndex();
    const territoryPrefs = useTerritoryPrefs();
    const tagSuggestions = useMemo(() => collectCustomerTags(customers), [customers]);
    const isWide = useMediaQuery(DOCKED_PANEL_QUERY);
    const [panelDocked, setPanelDocked] = useState<boolean>(initialPrefs.panel ?? true);
    const [panelDrawerOpen, setPanelDrawerOpen] = useState(false);
    const [focusRequest, setFocusRequest] = useState<{ id: string; nonce: number } | null>(null);

    const [isCreating, setIsCreating] = useState(false);
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

    const persist = useCallback((patch: StoredPrefs) => {
        writePrefs({ view, regions, sortKey, sortDir, panel: panelDocked, purchase: purchaseFilter, ...patch });
    }, [view, regions, sortKey, sortDir, panelDocked, purchaseFilter]);

    const showDockedPanel = isWide && panelDocked;
    const toggleRegionPanel = () => {
        if (isWide) {
            setPanelDocked(!panelDocked);
            persist({ panel: !panelDocked });
        } else {
            setPanelDrawerOpen(open => !open);
        }
    };
    useEffect(() => { if (isWide) setPanelDrawerOpen(false); }, [isWide]);

    const setView = (next: ViewMode) => { setViewState(next); persist({ view: next }); };
    const setRegions = (next: RegionFilterKey[]) => { setRegionsState(next); persist({ regions: next }); };
    const setPurchaseFilter = (next: PurchaseFilter) => {
        setPurchaseFilterState(next);
        const leavingMatch = sortKey === 'match' && (next.items.length === 0 || next.mode !== 'bought');
        if (leavingMatch) { setSortKey('name'); setSortDir('asc'); }
        persist({ purchase: next, ...(leavingMatch ? { sortKey: 'name' as const, sortDir: 'asc' as const } : {}) });
    };
    const applySort = (key: PageSortKey, dir?: SortDirection) => {
        const nextDir = dir ?? (key === sortKey
            ? (sortDir === 'asc' ? 'desc' : 'asc')
            : key === 'match' ? 'desc' : CUSTOMER_SORT_OPTIONS.find(o => o.key === key)?.defaultDir ?? 'asc');
        setSortKey(key);
        setSortDir(nextDir);
        persist({ sortKey: key, sortDir: nextDir });
    };

    // --- Derived data -------------------------------------------------------
    const regular = useMemo(() => directory.filter(e => !e.isSystem), [directory]);
    const systemEntry = useMemo(() => directory.find(e => e.isSystem) ?? null, [directory]);

    const purchaseActive = purchaseFilter.items.length > 0;
    const purchaseMatches = useMemo(
        () => (assortmentIndex && purchaseActive ? evaluatePurchaseFilter(assortmentIndex, purchaseFilter) : null),
        [assortmentIndex, purchaseActive, purchaseFilter],
    );
    const overlaps = useMemo(
        () => (assortmentIndex ? findAllOverlaps(assortmentIndex, { radiusKm: territoryPrefs.radiusKm, window: territoryPrefs.window, ignored: territoryPrefs.ignoredSet }) : []),
        [assortmentIndex, territoryPrefs.radiusKm, territoryPrefs.window, territoryPrefs.ignoredSet],
    );
    const overlapSeverity = useMemo(() => overlapSeverityByCustomer(overlaps), [overlaps]);
    const criticalOverlaps = useMemo(() => overlaps.filter(o => o.severity === 'critical').length, [overlaps]);
    const idSet = useMemo(() => (idFilter ? new Set(idFilter) : null), [idFilter]);

    const filtered = useMemo(() => regular.filter(e =>
        matchesEntryRegion(e, regions)
        && (!activityFilter || e.activity === activityFilter)
        && (!tierFilter || e.tier === tierFilter)
        && (!purchaseMatches || purchaseMatches.get(e.customer.id)?.matched)
        && (!idSet || idSet.has(e.customer.id))
        && matchesCustomerSearch(e, searchTerm)
    ), [regular, regions, activityFilter, tierFilter, purchaseMatches, idSet, searchTerm]);

    const matchSortActive = sortKey === 'match' && purchaseActive && purchaseFilter.mode === 'bought';
    const sorted = useMemo(() => {
        if (!matchSortActive || !purchaseMatches) return sortCustomerDirectory(filtered, sortKey === 'match' ? 'name' : sortKey, sortKey === 'match' ? 'asc' : sortDir);
        const sign = sortDir === 'asc' ? 1 : -1;
        return [...filtered].sort((a, b) => sign * ((purchaseMatches.get(a.customer.id)?.qty ?? 0) - (purchaseMatches.get(b.customer.id)?.qty ?? 0))
            || a.customer.full_name.localeCompare(b.customer.full_name, 'el', { sensitivity: 'base' }));
    }, [filtered, sortKey, sortDir, matchSortActive, purchaseMatches]);
    const sortOptions = useMemo(() => (purchaseActive && purchaseFilter.mode === 'bought'
        ? [...CUSTOMER_SORT_OPTIONS, { key: 'match' as const, label: 'Τεμάχια επιλογής', defaultDir: 'desc' as const }]
        : CUSTOMER_SORT_OPTIONS), [purchaseActive, purchaseFilter.mode]);
    const insightFor = (entry: CustomerDirectoryEntry) => {
        const match = purchaseMatches?.get(entry.customer.id);
        return (
            <TerritoryInsightChips
                matchQty={purchaseFilter.mode === 'bought' ? match?.qty : null}
                matchLast={match?.last}
                severity={overlapSeverity.get(entry.customer.id) ?? null}
            />
        );
    };

    const showSystem = Boolean(systemEntry) && regions.length === 0 && !activityFilter && !purchaseActive && !idFilter
        && (!searchTerm || matchesCustomerSearch(systemEntry as CustomerDirectoryEntry, searchTerm));

    const groups = useMemo(() => {
        if (sortKey !== 'region') return null;
        const order = [...GREEK_PERIFERIES.map(p => p.id), '__none'];
        const byRegion = new Map<string, CustomerDirectoryEntry[]>();
        sorted.forEach(e => {
            const id = e.location.periferiaId ?? '__none';
            byRegion.set(id, [...(byRegion.get(id) ?? []), e]);
        });
        const ids = [...byRegion.keys()].sort((a, b) => order.indexOf(a) - order.indexOf(b));
        if (sortDir === 'desc') ids.reverse();
        return ids.map(id => ({
            id,
            label: id === '__none' ? 'Χωρίς περιοχή' : GREEK_PERIFERIES.find(p => p.id === id)?.label ?? id,
            entries: byRegion.get(id) ?? [],
        }));
    }, [sorted, sortKey, sortDir]);

    const kpis = useMemo(() => ({
        total: regular.length,
        active: regular.filter(e => e.activity === 'active').length,
        units: Object.keys(regionCounts.units).length,
        periferies: Object.keys(regionCounts.periferia).length,
        noRegion: regionCounts.none,
    }), [regular, regionCounts]);

    const hasFilters = regions.length > 0 || Boolean(activityFilter) || Boolean(searchTerm) || purchaseActive || Boolean(idFilter);
    const clearFilters = () => {
        setRegionsState([]);
        setCategoryFilter(null);
        setSearchTerm('');
        setIdFilter(null);
        setPurchaseFilterState(EMPTY_PURCHASE_FILTER);
        const resetSort = sortKey === 'match';
        if (resetSort) { setSortKey('name'); setSortDir('asc'); }
        persist({ regions: [], purchase: EMPTY_PURCHASE_FILTER, ...(resetSort ? { sortKey: 'name' as const, sortDir: 'asc' as const } : {}) });
    };

    // --- Actions ------------------------------------------------------------
    const openCustomer = (c: Customer) => { setSelectedCustomer(c); setIsCreating(false); };
    const openCustomerById = (id: string) => {
        const next = customers?.find(c => c.id === id);
        if (next) openCustomer(next);
    };
    const showOnMap = (entry: CustomerDirectoryEntry) => {
        setView('map');
        setFocusRequest({ id: entry.customer.id, nonce: Date.now() });
    };

    const startCreate = () => {
        setSelectedCustomer({
            id: crypto.randomUUID(),
            full_name: '',
            phone: '',
            email: '',
            vat_number: '',
            vat_rate: VatRegime.Standard,
            address: '',
            notes: '',
            created_at: new Date().toISOString()
        });
        setIsCreating(true);
    };

    const handleCreateCustomer = async (c: Customer) => {
        if (c.full_name.trim() === RETAIL_CUSTOMER_NAME) {
            showToast("Το όνομα 'Λιανική' είναι δεσμευμένο από το σύστημα.", "error");
            return;
        }
        try {
            await ordersRepository.saveCustomer(c);
            queryClient.invalidateQueries({ queryKey: ['customers'] });
            setIsCreating(false);
            setSelectedCustomer(null);
            showToast("Ο πελάτης δημιουργήθηκε επιτυχώς.", "success");
        } catch (e) {
            showToast("Σφάλμα δημιουργίας.", "error");
            throw e;
        }
    };

    const handleUpdateCustomer = async (c: Customer) => {
        try {
            await ordersRepository.updateCustomer(c.id, c);
            queryClient.invalidateQueries({ queryKey: ['customers'] });
            setSelectedCustomer(c); // Update local view
            showToast("Τα στοιχεία ενημερώθηκαν.", "success");
        } catch (e) {
            showToast("Σφάλμα ενημέρωσης.", "error");
            throw e;
        }
    };

    const handleDeleteCustomer = async (id: string) => {
        const yes = await confirm({ title: 'Διαγραφή', message: 'Θέλετε να διαγράψετε οριστικά αυτόν τον πελάτη;', isDestructive: true });
        if (yes) {
            try {
                await ordersRepository.deleteCustomer(id);
                queryClient.invalidateQueries({ queryKey: ['customers'] });
                setSelectedCustomer(null);
                showToast("Διαγράφηκε.", "success");
            } catch (e) {
                showToast("Σφάλμα διαγραφής.", "error");
            }
        }
    };

    const handleSaveLocation = async (customerId: string, coords: readonly [number, number] | null, branchId?: string | null) => {
        try {
            await saveLocation(customerId, coords, branchId);
            showToast(coords ? 'Η θέση στον χάρτη αποθηκεύτηκε.' : 'Επαναφορά στην αυτόματη θέση.', 'success');
        } catch (e) {
            showToast('Η αποθήκευση της θέσης απέτυχε.', 'error');
            throw e;
        }
    };

    // --- Render ---------------------------------------------------------------
    const regionFilterPanel = (
        <CustomerRegionFilter counts={regionCounts} selection={regions} onChange={setRegions} className="h-full" />
    );

    const renderCards = (list: CustomerDirectoryEntry[]) => (
        <div className="grid gap-4" style={CARD_GRID_STYLE}>
            {list.map(entry => (
                <CustomerCard
                    key={entry.customer.id}
                    entry={entry}
                    insight={insightFor(entry)}
                    onOpen={() => openCustomer(entry.customer)}
                    onShowOnMap={() => showOnMap(entry)}
                />
            ))}
        </div>
    );

    const isLoading = !customers;
    const emptyState = !isLoading && sorted.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-white/60 py-20 text-center">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                {regular.length === 0 ? <UserPlus size={26} /> : <Search size={24} />}
            </div>
            <div className="text-base font-black text-slate-700">
                {regular.length === 0 ? 'Δεν υπάρχουν ακόμα πελάτες' : 'Κανένας πελάτης δεν ταιριάζει'}
            </div>
            <div className="mt-1 text-sm text-slate-400">
                {regular.length === 0 ? 'Προσθέστε τον πρώτο σας πελάτη.' : 'Δοκιμάστε άλλη αναζήτηση ή αφαιρέστε φίλτρα.'}
            </div>
            {regular.length === 0 ? (
                <button type="button" onClick={startCreate} className="mt-5 flex items-center gap-2 rounded-xl bg-[#060b00] px-4 py-2.5 text-sm font-bold text-white shadow-lg hover:bg-black">
                    <Plus size={16} /> Νέος πελάτης
                </button>
            ) : hasFilters && (
                <button type="button" onClick={clearFilters} className="mt-5 flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-200">
                    <X size={16} /> Καθαρισμός φίλτρων
                </button>
            )}
        </div>
    );

    return (
        <div className="flex h-[calc(100vh-100px)] flex-col gap-4">
            <DesktopPageHeader
                icon={Users}
                title="Πελάτες"
                subtitle={customers
                    ? `${kpis.total} πελάτες σε ${kpis.periferies} περιφέρειες της Ελλάδας`
                    : 'Διαχείριση πελατολογίου και ιστορικού.'}
                tail={(
                    <>
                        <div className="relative min-w-[11rem] flex-1 xl:max-w-sm">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <input
                                type="text"
                                placeholder="Όνομα, τηλέφωνο, ΑΦΜ, πόλη…"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-9 text-sm font-bold outline-none transition-all focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10"
                            />
                            {searchTerm && (
                                <button type="button" onClick={() => setSearchTerm('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Καθαρισμός αναζήτησης">
                                    <X size={14} />
                                </button>
                            )}
                        </div>
                        <div className="flex rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Προβολή">
                            {VIEW_OPTIONS.map(opt => {
                                const Icon = opt.icon;
                                const active = view === opt.id;
                                return (
                                    <button
                                        key={opt.id}
                                        type="button"
                                        role="tab"
                                        aria-selected={active}
                                        onClick={() => setView(opt.id)}
                                        title={opt.label}
                                        className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition ${active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                                    >
                                        <Icon size={15} /> <span className="hidden xl:inline">{opt.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                        <button
                            type="button"
                            onClick={startCreate}
                            title="Νέος πελάτης"
                            className="flex shrink-0 items-center gap-2 rounded-xl bg-[#060b00] px-3.5 py-3 text-sm font-bold text-white shadow-lg transition-all hover:-translate-y-0.5 hover:bg-black active:scale-95"
                        >
                            <Plus size={18} strokeWidth={3} /> <span className="hidden xl:inline">Νέος πελάτης</span>
                        </button>
                    </>
                )}
                below={(
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-5 xl:gap-3">
                        <KpiTile icon={Users} label="Πελάτες" value={kpis.total} hint="Χωρίς τη Λιανική" tone="bg-slate-900/5 text-slate-700"
                            active={!hasFilters} onClick={hasFilters ? clearFilters : undefined} />
                        <KpiTile icon={Activity} label="Ενεργοί" value={kpis.active} hint={ACTIVITY_META.active.hint} tone="bg-emerald-50 text-emerald-600"
                            active={activityFilter === 'active'} onClick={() => setCategoryFilter(activityFilter === 'active' ? null : 'active')} />
                        <KpiTile icon={MapIcon} label="Περιοχές" value={kpis.units} hint={`${kpis.periferies} περιφέρειες`} tone="bg-sky-50 text-sky-600"
                            active={view === 'map'} onClick={() => setView('map')} />
                        <KpiTile icon={MapPinOff} label="Χωρίς περιοχή" value={kpis.noRegion} hint="Ελλιπής διεύθυνση / ΤΚ" tone="bg-amber-50 text-amber-600"
                            active={regions.length === 1 && regions[0] === NO_REGION_KEY}
                            onClick={kpis.noRegion ? () => setRegions(regions.length === 1 && regions[0] === NO_REGION_KEY ? [] : [NO_REGION_KEY]) : undefined} />
                        <KpiTile icon={Radar} label="Επικαλύψεις" value={assortmentIndex ? overlaps.length : '…'}
                            hint={criticalOverlaps ? `${criticalOverlaps} αποκλειστικότητες!` : `Γείτονες σε ${formatRadius(territoryPrefs.radiusKm)}, ίδια γκάμα`}
                            tone={criticalOverlaps ? 'bg-rose-50 text-rose-600' : 'bg-orange-50 text-orange-600'}
                            active={overlapsOpen || Boolean(idFilter)} onClick={assortmentIndex ? () => setOverlapsOpen(true) : undefined} />
                    </div>
                )}
            />

            <div className="relative flex min-h-0 flex-1 gap-4">
                {showDockedPanel && (
                    <aside className="flex w-72 shrink-0 flex-col rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
                        {regionFilterPanel}
                    </aside>
                )}

                {!isWide && panelDrawerOpen && (
                    <div className="absolute inset-0 z-40 flex">
                        <aside className="flex w-80 max-w-[85%] flex-col rounded-3xl border border-slate-200 bg-white p-4 shadow-2xl animate-in slide-in-from-left-4 fade-in duration-150">
                            {regionFilterPanel}
                            <button
                                type="button"
                                onClick={() => setPanelDrawerOpen(false)}
                                className="mt-3 rounded-xl bg-[#060b00] py-2.5 text-xs font-bold text-white"
                            >
                                Εμφάνιση {sorted.length} πελατών
                            </button>
                        </aside>
                        <button
                            type="button"
                            aria-label="Κλείσιμο φίλτρου περιοχών"
                            onClick={() => setPanelDrawerOpen(false)}
                            className="ml-2 flex-1 rounded-3xl bg-slate-900/10 backdrop-blur-[1px]"
                        />
                    </div>
                )}

                <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
                    {/* Toolbar */}
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={toggleRegionPanel}
                            title={showDockedPanel ? 'Απόκρυψη περιοχών' : 'Φίλτρο περιοχών'}
                            className={`flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold shadow-sm transition ${regions.length || panelDrawerOpen
                                ? 'border-sky-200 bg-sky-50 text-sky-800'
                                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}
                        >
                            {showDockedPanel ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
                            Περιοχές
                            {regions.length > 0 && <span className="rounded-full bg-sky-600 px-1.5 text-[10px] text-white">{regions.length}</span>}
                        </button>

                        <CustomerPurchaseFilter
                            index={assortmentIndex}
                            value={purchaseFilter}
                            onChange={setPurchaseFilter}
                            matchCount={purchaseActive ? sorted.length : undefined}
                        />

                        <CustomerCategoryFilter entries={regular} activity={activityFilter} tier={tierFilter} onChange={setCategoryFilter} />

                        <span className="flex-1" />
                        <span className="hidden shrink-0 whitespace-nowrap text-xs font-bold text-slate-400 md:inline">
                            {sorted.length} {sorted.length === 1 ? 'πελάτης' : 'πελάτες'}
                        </span>
                        {view !== 'map' && (
                            <div className="flex shrink-0 items-center gap-1 rounded-xl bg-white p-1 shadow-sm ring-1 ring-slate-100">
                                <select
                                    value={matchSortActive || sortKey !== 'match' ? sortKey : 'name'}
                                    onChange={e => applySort(e.target.value as PageSortKey, sortOptions.find(o => o.key === e.target.value)?.defaultDir)}
                                    className="cursor-pointer rounded-lg bg-transparent py-1 pl-2 pr-1 text-[11px] font-bold text-slate-700 outline-none"
                                    aria-label="Ταξινόμηση"
                                >
                                    {sortOptions.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                                </select>
                                <button
                                    type="button"
                                    onClick={() => applySort(sortKey, sortDir === 'asc' ? 'desc' : 'asc')}
                                    className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                                    title={sortDir === 'asc' ? 'Αύξουσα' : 'Φθίνουσα'}
                                >
                                    {sortDir === 'asc' ? <ArrowUpNarrowWide size={14} /> : <ArrowDownWideNarrow size={14} />}
                                </button>
                            </div>
                        )}
                    </div>

                    {(regions.length > 0 || hasFilters) && (
                        <div className="-mt-1 flex flex-wrap items-center gap-1.5">
                            {purchaseActive && (
                                <span className="flex items-center gap-1 rounded-full bg-violet-100 py-1 pl-3 pr-1 text-[11px] font-bold text-violet-900">
                                    <ShoppingBag size={11} /> {purchaseFilterSummary(assortmentIndex, purchaseFilter) || 'Φίλτρο αγορών'}
                                    {!assortmentIndex && <Loader2 size={11} className="animate-spin" />}
                                    <button type="button" onClick={() => setPurchaseFilter({ ...EMPTY_PURCHASE_FILTER, window: purchaseFilter.window })} className="rounded-full p-0.5 hover:bg-violet-200" aria-label="Αφαίρεση φίλτρου">
                                        <X size={12} />
                                    </button>
                                </span>
                            )}
                            {idFilter && (
                                <span className="flex items-center gap-1 rounded-full bg-orange-100 py-1 pl-3 pr-1 text-[11px] font-bold text-orange-900">
                                    <Radar size={11} /> Πελάτες με επικάλυψη ({idFilter.length})
                                    <button type="button" onClick={() => setIdFilter(null)} className="rounded-full p-0.5 hover:bg-orange-200" aria-label="Αφαίρεση φίλτρου">
                                        <X size={12} />
                                    </button>
                                </span>
                            )}
                            {regions.map(key => (
                                <span key={key} className="flex items-center gap-1 rounded-full bg-sky-100 py-1 pl-3 pr-1 text-[11px] font-bold text-sky-900">
                                    {regionFilterLabel(key)}
                                    <button type="button" onClick={() => setRegions(regions.filter(k => k !== key))} className="rounded-full p-0.5 hover:bg-sky-200" aria-label="Αφαίρεση φίλτρου">
                                        <X size={12} />
                                    </button>
                                </span>
                            ))}
                            {activityFilter && (
                                <span className="flex items-center gap-1 rounded-full bg-slate-200/70 py-1 pl-3 pr-1 text-[11px] font-bold text-slate-700">
                                    {ACTIVITY_META[activityFilter].plural}{tierFilter ? ` · ${TIER_META[tierFilter].plural}` : ''}
                                    <button type="button" onClick={() => setCategoryFilter(null)} className="rounded-full p-0.5 hover:bg-slate-300" aria-label="Αφαίρεση φίλτρου">
                                        <X size={12} />
                                    </button>
                                </span>
                            )}
                            <button type="button" onClick={clearFilters} className="rounded-full px-2 py-1 text-[11px] font-bold text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                                Καθαρισμός όλων
                            </button>
                        </div>
                    )}

                    {/* Content */}
                    {view === 'map' ? (
                        <Suspense fallback={(
                            <div className="flex flex-1 items-center justify-center rounded-3xl border border-slate-100 bg-white text-sm font-bold text-slate-400">
                                <Loader2 className="mr-2 animate-spin" size={18} /> Φόρτωση χάρτη…
                            </div>
                        )}>
                            <CustomersMap
                                className="flex-1"
                                regionSelection={regions}
                                entries={sorted}
                                focusRequest={focusRequest}
                                onOpenCustomer={openCustomer}
                                onSaveLocation={handleSaveLocation}
                                canEditLocation={canEditLocation}
                            />
                        </Suspense>
                    ) : (
                        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto pb-16 pr-1">
                            {showSystem && systemEntry && (
                                <div className="mb-4">
                                    <SystemCustomerCard entry={systemEntry} onOpen={() => openCustomer(systemEntry.customer)} />
                                </div>
                            )}

                            {isLoading ? (
                                <div className="grid gap-4" style={CARD_GRID_STYLE}>
                                    {Array.from({ length: 8 }, (_, i) => <CardSkeleton key={i} />)}
                                </div>
                            ) : emptyState || (view === 'list' ? (
                                <CustomerListView
                                    entries={sorted}
                                    renderInsight={insightFor}
                                    sortKey={sortKey === 'match' ? 'name' : sortKey}
                                    sortDir={sortDir}
                                    onSort={key => applySort(key)}
                                    onOpen={entry => openCustomer(entry.customer)}
                                    onShowOnMap={showOnMap}
                                />
                            ) : groups ? (
                                <div className="space-y-6">
                                    {groups.map(group => (
                                        <section key={group.id}>
                                            <div className="sticky top-0 z-10 -mx-1 mb-3 flex items-center gap-2 bg-gradient-to-b from-[#f8fafc] via-[#f8fafc]/95 to-transparent px-1 pb-2 pt-1">
                                                <Sparkles size={14} className="text-sky-500" />
                                                <h2 className="text-sm font-black text-slate-800">{group.label}</h2>
                                                <span className="rounded-full bg-slate-200/70 px-2 py-0.5 text-[10px] font-black text-slate-600">{group.entries.length}</span>
                                                <span className="h-px flex-1 bg-slate-200" />
                                            </div>
                                            {renderCards(group.entries)}
                                        </section>
                                    ))}
                                </div>
                            ) : renderCards(sorted))}
                        </div>
                    )}
                </main>
            </div>

            {overlapsOpen && assortmentIndex && (
                <CustomerOverlapsPanel
                    index={assortmentIndex}
                    onClose={() => setOverlapsOpen(false)}
                    onOpenCustomer={openCustomerById}
                    onFilterCustomers={ids => setIdFilter(ids)}
                    paused={Boolean(selectedCustomer)}
                />
            )}

            {/* View/Edit Modal */}
            {selectedCustomer && !isCreating && orders && (
                <CustomerDetailsModal
                    customer={selectedCustomer}
                    orders={orders}
                    onClose={() => setSelectedCustomer(null)}
                    onUpdate={handleUpdateCustomer}
                    onDelete={handleDeleteCustomer}
                    onPrintOrder={onPrintOrder}
                    onOpenCustomer={openCustomerById}
                    onShowOnMap={() => {
                        const entry = directory.find(e => e.customer.id === selectedCustomer.id);
                        setSelectedCustomer(null);
                        if (entry?.location.coords) showOnMap(entry);
                        else setView('map');
                    }}
                />
            )}

            {isCreating && selectedCustomer && (
                <CreateCustomerModal
                    draft={selectedCustomer}
                    tagSuggestions={tagSuggestions}
                    onSave={handleCreateCustomer}
                    onCancel={() => { setIsCreating(false); setSelectedCustomer(null); }}
                />
            )}
        </div>
    );
}
