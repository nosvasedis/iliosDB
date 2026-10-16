import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  CheckCircle2,
  ChevronDown,
  Copy,
  Eye,
  EyeOff,
  Gem,
  Layers3,
  Lightbulb,
  MapPinned,
  Package,
  Radar,
  RefreshCcw,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import type { Customer } from '../../types';
import {
  customerName,
  findNeighbors,
  formatDistance,
  formatRadius,
  getCustomerAssortment,
  getCustomerSuggestions,
  ignoreCollectionKey,
  ignoreSkuKey,
  isTerritoryCustomer,
  overlapsForCustomer,
  RADIUS_OPTIONS,
  SEVERITY_META,
  WINDOW_OPTIONS,
  type AssortmentWindow,
  type ExclusivityBreach,
  type MixRow,
  type SkuRow,
  type TerritoryOverlap,
  type TerritoryStatus,
} from '../../features/customers/customerAssortment';
import { isExclusivityActive, readCustomerProfile } from '../../features/customers/customerProfile';
import { formatCurrency, formatNumber } from '../../utils/numberFormat';
import { useUI } from '../UIProvider';
import SkuColorizedText from '../SkuColorizedText';
import { useAssortmentIndex, useTerritoryPrefs } from './useCustomerTerritory';
import { ProductThumb } from './customerUi';

type Section = 'range' | 'territory' | 'ideas';

interface Props {
  customer: Customer;
  /** Opens another customer's card (neighbour). */
  onOpenCustomer?: (customerId: string) => void;
  /** Jumps to the orders tab, filtered. */
  onOpenOrders?: (query: string) => void;
  compact?: boolean;
  initialSection?: Section;
}

type NamedOverlap = Omit<TerritoryOverlap, 'breaches'> & {
  bName: string;
  breaches: Array<ExclusivityBreach & { holderName: string; otherName: string }>;
};

const card = 'rounded-2xl border border-slate-100 bg-white shadow-sm';

const formatDate = (t: number | null | undefined) => (t && Number.isFinite(t) ? new Date(t).toLocaleDateString('el-GR') : '—');

function Pills<T extends string | number>({ value, options, onChange, label }: { value: T; options: Array<{ id: T; label: string }>; onChange: (v: T) => void; label: string }) {
  return (
    <div className="inline-flex rounded-xl bg-slate-100 p-1" role="group" aria-label={label}>
      {options.map(o => (
        <button key={String(o.id)} type="button" aria-pressed={value === o.id} onClick={() => onChange(o.id)}
          className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[11px] font-black transition ${value === o.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Stat({ label, value, sub, tone = 'slate' }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: 'slate' | 'sky' | 'violet' | 'emerald' }) {
  const tones = { slate: 'text-slate-900', sky: 'text-sky-700', violet: 'text-violet-700', emerald: 'text-emerald-700' };
  return (
    <div className={`${card} px-4 py-3`}>
      <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</div>
      <div className={`mt-0.5 text-xl font-black tabular-nums ${tones[tone]}`}>{value}</div>
      {sub && <div className="truncate text-[11px] font-semibold text-slate-400">{sub}</div>}
    </div>
  );
}

function Empty({ icon: Icon, title, detail }: { icon: typeof Package; title: string; detail?: string }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-200 bg-white/60 px-6 py-10 text-center">
      <Icon size={30} className="text-slate-300" />
      <p className="mt-2 text-sm font-black text-slate-700">{title}</p>
      {detail && <p className="mt-1 max-w-md text-xs text-slate-500">{detail}</p>}
    </div>
  );
}

function MixBars({ rows, active, onSelect, color }: { rows: MixRow[]; active?: string | null; onSelect?: (key: string | null) => void; color: string }) {
  const max = rows[0]?.qty || 1;
  return (
    <div className="space-y-1">
      {rows.map(row => {
        const on = active === row.key;
        return (
          <button key={row.key} type="button" disabled={!onSelect} onClick={() => onSelect?.(on ? null : row.key)}
            className={`block w-full rounded-xl px-2.5 py-1.5 text-left transition ${on ? 'bg-slate-900 text-white' : onSelect ? 'hover:bg-slate-50' : ''}`}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-xs font-black">{row.label}</span>
              <span className={`shrink-0 text-[11px] font-bold tabular-nums ${on ? 'text-white/70' : 'text-slate-500'}`}>
                {formatNumber(row.qty)} τεμ. · {formatNumber(row.skuCount)} κωδ. · {Math.round(row.share)}%
              </span>
            </div>
            <div className={`mt-1 h-1.5 overflow-hidden rounded-full ${on ? 'bg-white/20' : 'bg-slate-100'}`}>
              <div className="h-full rounded-full" style={{ width: `${Math.max(3, (row.qty / max) * 100)}%`, background: on ? '#fff' : color }} />
            </div>
          </button>
        );
      })}
    </div>
  );
}

const STATUS_META: Record<TerritoryStatus, { label: string; icon: typeof CheckCircle2; tone: string }> = {
  free: { label: 'Ελεύθερο στην περιοχή', icon: CheckCircle2, tone: 'bg-emerald-50 text-emerald-700 ring-emerald-100' },
  nearby: { label: 'Υπάρχει σε γείτονα', icon: AlertTriangle, tone: 'bg-amber-50 text-amber-800 ring-amber-100' },
  blocked: { label: 'Αποκλειστικότητα γείτονα', icon: Ban, tone: 'bg-rose-50 text-rose-700 ring-rose-100' },
};

function StatusBadge({ status, names }: { status: TerritoryStatus; names: string[] }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span className={`inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${meta.tone}`} title={names.join(', ')}>
      <Icon size={10} className="shrink-0" />
      <span className="truncate">{status === 'free' ? meta.label : `${meta.label}: ${names.slice(0, 2).join(', ')}${names.length > 2 ? ` +${names.length - 2}` : ''}`}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------

function OverlapCard({ overlap, onOpenCustomer, onMute, ignored, defaultOpen }: {
  overlap: NamedOverlap;
  onOpenCustomer?: (id: string) => void;
  onMute: (key: string) => void;
  ignored: ReadonlySet<string>;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  const meta = SEVERITY_META[overlap.severity];
  const name = overlap.bName;
  return (
    <article className={`${card} overflow-hidden`}>
      <button type="button" onClick={() => setOpen(o => !o)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50/60">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${meta.dot}`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="truncate text-sm font-black text-slate-900">{name}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${meta.tone}`}>{meta.label}</span>
          </div>
          <div className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] font-semibold text-slate-400">
            <span className="inline-flex items-center gap-1"><MapPinned size={11} /> {formatDistance(overlap.distanceKm)}{overlap.town ? ` · ${overlap.town}` : ''}</span>
            {overlap.sharedSkus.length > 0 && <span>{formatNumber(overlap.sharedSkus.length)} κοινοί κωδικοί</span>}
            {overlap.sharedCollections.length > 0 && <span>{formatNumber(overlap.sharedCollections.length)} κοινές συλλογές</span>}
          </div>
        </div>
        <ChevronDown size={16} className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="space-y-3 border-t border-slate-100 bg-slate-50/50 px-4 py-3">
          {overlap.breaches.map((b, i) => (
            <div key={i} className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">
              <div className="flex items-center gap-1.5 font-black"><ShieldCheck size={13} /> Αποκλειστικότητα: {b.holderName} · {b.scope}</div>
              <div className="mt-1 font-semibold">{b.otherName} πήρε: <span className="font-mono">{b.skus.join(', ')}</span></div>
            </div>
          ))}
          {overlap.sharedSkus.length > 0 && (
            <div>
              <div className="mb-1.5 text-[10px] font-black uppercase tracking-wider text-slate-400">Κοινοί κωδικοί · εμείς / {name}</div>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {overlap.sharedSkus.map(s => (
                  <div key={s.sku} className="flex items-center gap-2 rounded-xl bg-white px-2 py-1.5 ring-1 ring-slate-100">
                    <ProductThumb src={s.image} size={32} />
                    <div className="min-w-0 flex-1">
                      <SkuColorizedText sku={s.sku} className="text-xs font-black" />
                      <div className="truncate text-[10px] text-slate-400">{s.description || '—'}</div>
                    </div>
                    <div className="shrink-0 text-right text-[10px] font-bold tabular-nums text-slate-600">
                      {formatNumber(s.aQty)} / {formatNumber(s.bQty)}
                      <div className="text-slate-400">{formatDate(Math.max(s.aLast, s.bLast))}</div>
                    </div>
                    <button type="button" onClick={() => onMute(ignoreSkuKey(s.sku))} title="Αγνόηση κωδικού στους ελέγχους (π.χ. βασικό είδος)" className="shrink-0 rounded-lg p-1 text-slate-300 hover:bg-slate-100 hover:text-slate-600">
                      {ignored.has(ignoreSkuKey(s.sku)) ? <Eye size={13} /> : <EyeOff size={13} />}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {overlap.sharedCollections.length > 0 && (
            <div>
              <div className="mb-1.5 text-[10px] font-black uppercase tracking-wider text-slate-400">Κοινές συλλογές · τεμάχια εμείς / {name}</div>
              <div className="flex flex-wrap gap-1.5">
                {overlap.sharedCollections.map(c => (
                  <span key={c.id} className="inline-flex items-center gap-1 rounded-full bg-white py-1 pl-2.5 pr-1 text-[11px] font-bold text-slate-700 ring-1 ring-slate-200">
                    {c.name} <span className="tabular-nums text-slate-400">{formatNumber(c.aQty)}/{formatNumber(c.bQty)}</span>
                    <button type="button" onClick={() => onMute(ignoreCollectionKey(c.id))} title="Αγνόηση συλλογής στους ελέγχους" className="rounded-full p-0.5 text-slate-300 hover:bg-slate-100 hover:text-slate-600"><EyeOff size={11} /></button>
                  </span>
                ))}
              </div>
            </div>
          )}
          {onOpenCustomer && (
            <button type="button" onClick={() => onOpenCustomer(overlap.bId)} className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-black">
              Καρτέλα {name} <ArrowRight size={12} />
            </button>
          )}
        </div>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------

export default function CustomerAssortmentPanel({ customer, onOpenCustomer, onOpenOrders, compact = false, initialSection = 'range' }: Props) {
  const { showToast } = useUI();
  const index = useAssortmentIndex();
  const prefs = useTerritoryPrefs();
  const [section, setSection] = useState<Section>(initialSection);
  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<string | null>(null);
  const [collectionFilter, setCollectionFilter] = useState<string | null>(null);
  const [sort, setSort] = useState<'qty' | 'net' | 'last' | 'orders'>('qty');
  const [showAll, setShowAll] = useState(false);
  const [onlySafe, setOnlySafe] = useState(false);
  const territory = isTerritoryCustomer(customer.id);
  const period: AssortmentWindow = prefs.window;
  const radiusKm = prefs.radiusKm;
  const overlapOptions = useMemo(() => ({ radiusKm, window: period, ignored: prefs.ignoredSet }), [radiusKm, period, prefs.ignoredSet]);

  const view = useMemo(() => (index ? getCustomerAssortment(index, customer.id, period) : null), [index, customer.id, period]);
  const neighbors = useMemo(() => (index && territory ? findNeighbors(index, customer.id, radiusKm) : []), [index, territory, customer.id, radiusKm]);
  const overlaps = useMemo<NamedOverlap[]>(() => {
    if (!index || !territory) return [];
    return overlapsForCustomer(index, customer.id, overlapOptions).map(o => ({
      ...o,
      bName: customerName(index, o.bId),
      breaches: o.breaches.map(b => ({ ...b, holderName: customerName(index, b.holderId), otherName: customerName(index, b.otherId) })),
    }));
  }, [index, territory, customer.id, overlapOptions]);
  const suggestions = useMemo(() => (index && section === 'ideas' ? getCustomerSuggestions(index, customer.id, { ...overlapOptions, limit: 24 }) : null), [index, section, customer.id, overlapOptions]);

  // SKU → neighbours carrying it (for the range table).
  const nearbyBySku = useMemo(() => {
    const map = new Map<string, string[]>();
    overlaps.forEach(o => o.sharedSkus.forEach(s => map.set(s.sku, [...(map.get(s.sku) ?? []), o.bName])));
    return map;
  }, [overlaps]);

  const skuRows = useMemo(() => {
    if (!view) return [];
    const q = query.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const rows = view.skus.filter(row => (!kindFilter || row.kindId === kindFilter)
      && (!collectionFilter || row.collectionNames.includes(collectionFilter))
      && (!q || `${row.sku} ${row.description ?? ''} ${row.collectionNames.join(' ')}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q)));
    const key = (r: SkuRow) => (sort === 'qty' ? r.qty : sort === 'net' ? r.net : sort === 'last' ? r.last : r.orders);
    return [...rows].sort((a, b) => key(b) - key(a) || b.qty - a.qty);
  }, [view, query, kindFilter, collectionFilter, sort]);

  const profile = useMemo(() => readCustomerProfile(customer), [customer]);
  const exclusivity = isExclusivityActive(profile.exclusivity) ? profile.exclusivity : null;

  if (!index || !view) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map(i => <div key={i} className="h-20 animate-pulse rounded-2xl bg-white" />)}</div>
        <div className="h-64 animate-pulse rounded-2xl bg-white" />
      </div>
    );
  }

  const critical = overlaps.filter(o => o.severity === 'critical').length;
  const sections: Array<{ id: Section; label: string; icon: typeof Gem; badge?: React.ReactNode }> = [
    { id: 'range', label: 'Γκάμα', icon: Gem, badge: view.totals.skuCount ? <span className="rounded-full bg-slate-200 px-1.5 text-[10px] font-black text-slate-600">{formatNumber(view.totals.skuCount)}</span> : null },
    ...(territory ? [{
      id: 'territory' as const, label: 'Περιοχή', icon: Radar,
      badge: overlaps.length ? <span className={`rounded-full px-1.5 text-[10px] font-black text-white ${critical ? 'bg-rose-600' : 'bg-orange-500'}`}>{formatNumber(overlaps.length)}</span> : null,
    }] : []),
    { id: 'ideas', label: 'Προτάσεις', icon: Lightbulb },
  ];

  const copySkus = async (skus: string[]) => {
    try {
      await navigator.clipboard.writeText(skus.join('\n'));
      showToast(`Αντιγράφηκαν ${skus.length} κωδικοί`, 'success');
    } catch {
      showToast('Δεν ήταν δυνατή η αντιγραφή', 'error');
    }
  };

  const visibleSkus = showAll ? skuRows : skuRows.slice(0, compact ? 20 : 40);
  const otherNeighbors = neighbors.filter(n => !overlaps.some(o => o.bId === n.customerId));

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-xl bg-white p-1 shadow-sm ring-1 ring-slate-100" role="tablist" aria-label="Ενότητες">
          {sections.map(s => {
            const Icon = s.icon;
            const active = section === s.id;
            return (
              <button key={s.id} type="button" role="tab" aria-selected={active} onClick={() => setSection(s.id)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-black transition ${active ? 'bg-[#060b00] text-white' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}>
                <Icon size={14} /> {s.label} {s.badge}
              </button>
            );
          })}
        </div>
        <span className="flex-1" />
        <Pills label="Περίοδος" value={period} onChange={prefs.setWindow} options={WINDOW_OPTIONS.map(o => ({ id: o.id, label: o.short }))} />
        {territory && section !== 'range' && (
          <label className="flex items-center gap-1.5 rounded-xl bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-500 shadow-sm ring-1 ring-slate-100">
            <Radar size={13} /> Ακτίνα
            <select value={radiusKm} onChange={e => prefs.setRadius(Number(e.target.value))} className="bg-transparent font-black text-slate-800 outline-none">
              {RADIUS_OPTIONS.map(r => <option key={r} value={r}>{formatRadius(r)}</option>)}
            </select>
          </label>
        )}
      </div>

      {/* ---------------- Range ---------------- */}
      {section === 'range' && (
        !view.hasHistory ? (
          <Empty icon={Package} title="Δεν υπάρχουν ακόμα αγορές" detail="Η γκάμα του πελάτη θα εμφανιστεί μόλις καταχωρηθεί η πρώτη παραγγελία." />
        ) : view.totals.qty === 0 ? (
          <Empty icon={Package} title="Καμία αγορά σε αυτή την περίοδο" detail="Επιλέξτε μεγαλύτερη περίοδο για να δείτε το ιστορικό." />
        ) : (
          <div className="space-y-4">
            <div className={`grid gap-3 ${compact ? 'grid-cols-2' : 'grid-cols-2 xl:grid-cols-4'}`}>
              <Stat label="Κωδικοί" value={formatNumber(view.totals.skuCount)} sub={view.totals.newSkuCount ? `${formatNumber(view.totals.newSkuCount)} νέοι στην περίοδο` : 'καμία νέα προσθήκη'} tone="sky" />
              <Stat label="Συλλογές" value={formatNumber(view.totals.collectionCount)} sub={`${formatNumber(view.totals.kindCount)} είδη κοσμημάτων`} tone="violet" />
              <Stat label="Τεμάχια" value={formatNumber(view.totals.qty)} sub={`${formatNumber(view.totals.orders)} παραγγελίες`} />
              <Stat label="Αξία προϊόντων" value={formatCurrency(view.totals.net)} sub="χωρίς ΦΠΑ, μετά την έκπτωση" tone="emerald" />
            </div>

            <div className={`grid gap-4 ${compact ? '' : 'lg:grid-cols-2'}`}>
              <section className={`${card} p-4`}>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-black text-slate-800"><Gem size={15} className="text-sky-500" /> Είδη κοσμημάτων</h3>
                <MixBars rows={view.kinds} active={kindFilter} onSelect={key => { setKindFilter(key); setShowAll(false); }} color="linear-gradient(90deg,#38bdf8,#6366f1)" />
              </section>
              <section className={`${card} p-4`}>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-black text-slate-800"><Layers3 size={15} className="text-violet-500" /> Συλλογές</h3>
                {view.collections.length ? (
                  <div className="max-h-[260px] overflow-y-auto pr-1 custom-scrollbar">
                    <MixBars rows={view.collections} active={collectionFilter ? view.collections.find(c => c.label === collectionFilter)?.key : null}
                      onSelect={key => { setCollectionFilter(key ? view.collections.find(c => c.key === key)?.label ?? null : null); setShowAll(false); }} color="linear-gradient(90deg,#a78bfa,#d946ef)" />
                  </div>
                ) : <p className="py-6 text-center text-xs text-slate-400">Οι κωδικοί του δεν ανήκουν σε συλλογή.</p>}
              </section>
            </div>

            <section className={`${card} overflow-hidden`}>
              <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
                <h3 className="flex items-center gap-2 text-sm font-black text-slate-800"><Package size={15} className="text-slate-500" /> Κωδικοί</h3>
                {(kindFilter || collectionFilter) && (
                  <button type="button" onClick={() => { setKindFilter(null); setCollectionFilter(null); }} className="inline-flex items-center gap-1 rounded-full bg-slate-900 py-0.5 pl-2.5 pr-1 text-[10px] font-bold text-white">
                    {[kindFilter && view.kinds.find(k => k.key === kindFilter)?.label, collectionFilter].filter(Boolean).join(' · ')} <X size={11} />
                  </button>
                )}
                <span className="flex-1" />
                <div className="relative">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Κωδικός, περιγραφή…" className="w-44 rounded-xl border border-slate-200 py-1.5 pl-8 pr-2 text-xs font-semibold outline-none focus:border-slate-400" />
                </div>
                <select value={sort} onChange={e => setSort(e.target.value as typeof sort)} className="rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-bold text-slate-700 outline-none" aria-label="Ταξινόμηση">
                  <option value="qty">Τεμάχια</option>
                  <option value="net">Αξία</option>
                  <option value="orders">Παραγγελίες</option>
                  <option value="last">Πιο πρόσφατα</option>
                </select>
              </div>
              {skuRows.length === 0 ? (
                <p className="py-8 text-center text-xs text-slate-400">Κανένας κωδικός δεν ταιριάζει.</p>
              ) : (
                <div className="divide-y divide-slate-50">
                  {visibleSkus.map(row => {
                    const nearby = nearbyBySku.get(row.sku);
                    return (
                      <div key={row.sku} className="flex items-center gap-3 px-4 py-2 transition hover:bg-slate-50/70">
                        <ProductThumb src={row.image} size={compact ? 34 : 40} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <SkuColorizedText sku={row.sku} className="text-[13px] font-black" />
                            {row.isNew && <span className="rounded-full bg-sky-100 px-1.5 py-px text-[9px] font-black uppercase text-sky-700">νέο</span>}
                            {!row.known && !row.special && <span className="rounded-full bg-slate-100 px-1.5 py-px text-[9px] font-bold text-slate-500">εκτός καταλόγου</span>}
                            {nearby && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-1.5 py-px text-[9px] font-black text-orange-700 ring-1 ring-orange-100" title={`Το έχουν και: ${nearby.join(', ')}`}>
                                <AlertTriangle size={9} /> {nearby.length} γείτον{nearby.length === 1 ? 'ας' : 'ες'}
                              </span>
                            )}
                          </div>
                          <div className="truncate text-[11px] font-semibold text-slate-400">
                            {[row.description, row.kindLabel, row.collectionNames.join(', ')].filter(Boolean).join(' · ')}
                          </div>
                          {!compact && row.variants.length > 1 && (
                            <div className="mt-0.5 flex flex-wrap gap-1">
                              {row.variants.slice(0, 6).map(v => <span key={v.suffix || '_'} className="rounded bg-slate-100 px-1 font-mono text-[9px] font-bold text-slate-500">{v.suffix || 'βάση'} ×{formatNumber(v.qty)}</span>)}
                            </div>
                          )}
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-sm font-black tabular-nums text-slate-900">{formatNumber(row.qty)} <span className="text-[10px] font-bold text-slate-400">τεμ.</span></div>
                          <div className="text-[10px] font-semibold text-slate-400">{formatNumber(row.orders)} παρ. · {formatDate(row.last)}</div>
                        </div>
                        {onOpenOrders && (
                          <button type="button" onClick={() => onOpenOrders(row.sku)} title="Παραγγελίες με αυτόν τον κωδικό" className="hidden shrink-0 rounded-lg p-1.5 text-slate-300 hover:bg-slate-100 hover:text-slate-700 sm:block">
                            <ArrowRight size={14} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {skuRows.length > visibleSkus.length && (
                <button type="button" onClick={() => setShowAll(true)} className="w-full border-t border-slate-100 py-2.5 text-xs font-bold text-sky-700 hover:bg-sky-50">
                  Εμφάνιση όλων ({formatNumber(skuRows.length)})
                </button>
              )}
            </section>
          </div>
        )
      )}

      {/* ---------------- Territory ---------------- */}
      {section === 'territory' && territory && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-start gap-3 rounded-2xl border border-sky-100 bg-sky-50/60 px-4 py-3 text-xs text-sky-950">
            <Radar size={16} className="mt-0.5 shrink-0 text-sky-500" />
            <div className="min-w-0 flex-1 leading-relaxed">
              <b>{formatNumber(neighbors.length)} πελάτες</b> σε ακτίνα {formatRadius(radiusKm)} από τα καταστήματα του {customer.full_name}
              {overlaps.length ? <> — <b>{formatNumber(overlaps.length)}</b> με επικάλυψη γκάμας στην περίοδο.</> : '.'}
              <span className="block text-sky-800/70">Ίδια πόλη/ΤΚ μετράει ως γειτονιά όταν δεν υπάρχει ακριβής θέση. Για ακρίβεια, τοποθετήστε τα καταστήματα στον χάρτη.</span>
            </div>
            {prefs.ignored.length > 0 && (
              <button type="button" onClick={prefs.clearIgnored} className="shrink-0 rounded-lg bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50" title="Επαναφορά κωδικών/συλλογών που έχουν αγνοηθεί">
                {formatNumber(prefs.ignored.length)} αγνοημένα · επαναφορά
              </button>
            )}
          </div>

          {exclusivity && (
            <div className="flex items-start gap-2.5 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-xs text-violet-950">
              <ShieldCheck size={16} className="mt-0.5 shrink-0 text-violet-600" />
              <span>Ο πελάτης έχει <b>αποκλειστικότητα σε ακτίνα {formatRadius(exclusivity.radius_km)}</b>. Παραβιάσεις από γειτονικά καταστήματα εμφανίζονται πρώτες με κόκκινο.</span>
            </div>
          )}

          {!index.places.get(customer.id)?.length ? (
            <Empty icon={MapPinned} title="Χωρίς τοποθεσία" detail="Συμπληρώστε διεύθυνση με ΤΚ και πόλη (ή καταστήματα) για να εντοπιστούν οι γειτονικοί πελάτες." />
          ) : overlaps.length === 0 ? (
            <Empty icon={CheckCircle2} title="Καμία επικάλυψη στην περιοχή" detail={neighbors.length ? 'Οι γειτονικοί πελάτες δεν έχουν πάρει ίδιους κωδικούς ή συλλογές στην περίοδο.' : 'Δεν υπάρχουν άλλοι πελάτες σε αυτή την ακτίνα.'} />
          ) : (
            <div className="space-y-2">
              {overlaps.map((o, i) => <OverlapCard key={o.id} overlap={o} onOpenCustomer={onOpenCustomer} onMute={prefs.toggleIgnored} ignored={prefs.ignoredSet} defaultOpen={i === 0} />)}
            </div>
          )}

          {otherNeighbors.length > 0 && (
            <section className={`${card} p-4`}>
              <h4 className="mb-2 text-[10px] font-black uppercase tracking-wider text-slate-400">Γειτονικοί πελάτες χωρίς επικάλυψη</h4>
              <div className="flex flex-wrap gap-1.5">
                {otherNeighbors.map(n => (
                  <button key={n.customerId} type="button" disabled={!onOpenCustomer} onClick={() => onOpenCustomer?.(n.customerId)}
                    className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-700 ring-1 ring-slate-100 enabled:hover:bg-white enabled:hover:ring-slate-300">
                    {customerName(index, n.customerId)} <span className="font-semibold text-slate-400">{formatDistance(n.distanceKm)}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* ---------------- Ideas ---------------- */}
      {section === 'ideas' && suggestions && (
        <div className="space-y-4">
          {suggestions.reorders.length > 0 && (
            <section className={`${card} p-4`}>
              <h3 className="flex items-center gap-2 text-sm font-black text-slate-800"><RefreshCcw size={15} className="text-sky-500" /> Ώρα για επαναπαραγγελία</h3>
              <p className="mb-3 text-[11px] text-slate-400">Κωδικοί που ο πελάτης παίρνει τακτικά και έχουν ξεπεράσει τον συνήθη κύκλο τους.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {suggestions.reorders.map(r => (
                  <div key={r.sku} className="flex items-center gap-2.5 rounded-xl bg-slate-50 px-2.5 py-2">
                    <ProductThumb src={r.image} size={36} />
                    <div className="min-w-0 flex-1">
                      <SkuColorizedText sku={r.sku} className="text-xs font-black" />
                      <div className="truncate text-[10px] text-slate-500">{formatNumber(r.orders)} παραγγελίες · κάθε ~{formatNumber(r.cadenceDays)} ημ. · τελευταία πριν {formatNumber(r.daysSince)} ημ.</div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {territory && suggestions.collections.length > 0 && (
            <section className={`${card} p-4`}>
              <h3 className="flex items-center gap-2 text-sm font-black text-slate-800"><Layers3 size={15} className="text-violet-500" /> Συλλογές που δεν έχει ακόμα</h3>
              <p className="mb-3 text-[11px] text-slate-400">Δημοφιλείς σε άλλους πελάτες ({WINDOW_OPTIONS.find(o => o.id === period)?.short.toLowerCase()}), με έλεγχο για γειτονικά καταστήματα σε {formatRadius(radiusKm)}.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {suggestions.collections.slice(0, 10).map(c => (
                  <div key={c.id} className="rounded-xl bg-slate-50 px-3 py-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-xs font-black text-slate-800">{c.name}</span>
                      <span className="shrink-0 text-[10px] font-bold text-slate-400">{formatNumber(c.peerCount)} πελάτες · {formatNumber(c.peerQty)} τεμ.</span>
                    </div>
                    <div className="mt-1"><StatusBadge status={c.status} names={c.status === 'blocked' ? c.blockedBy : c.nearbyNames} /></div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className={`${card} p-4`}>
            <div className="flex flex-wrap items-start gap-2">
              <div className="min-w-0 flex-1">
                <h3 className="flex items-center gap-2 text-sm font-black text-slate-800"><Sparkles size={15} className="text-amber-500" /> Κωδικοί που πουλάνε σε άλλους</h3>
                <p className="text-[11px] text-slate-400">
                  {suggestions.focusKinds.length ? `Στα είδη που ήδη δουλεύει (${suggestions.focusKinds.join(', ')}). ` : ''}
                  Πρώτα όσα είναι ελεύθερα στην περιοχή του.
                </p>
              </div>
              {territory && (
                <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600">
                  <input type="checkbox" className="accent-emerald-600" checked={onlySafe} onChange={e => setOnlySafe(e.target.checked)} /> Μόνο ελεύθερα
                </label>
              )}
              {suggestions.skus.some(s => s.status === 'free') && (
                <button type="button" onClick={() => copySkus(suggestions.skus.filter(s => s.status === 'free').map(s => s.sku))}
                  className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-black">
                  <Copy size={12} /> Αντιγραφή ελεύθερων
                </button>
              )}
            </div>
            {suggestions.skus.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-400">Δεν υπάρχουν προτάσεις για αυτή την περίοδο.</p>
            ) : (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {suggestions.skus.filter(s => !onlySafe || s.status === 'free').map(s => (
                  <div key={s.sku} className="flex items-center gap-2.5 rounded-xl bg-slate-50 px-2.5 py-2">
                    <ProductThumb src={s.image} size={40} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <SkuColorizedText sku={s.sku} className="text-xs font-black" />
                        <span className="shrink-0 text-[10px] font-bold text-slate-400">{formatNumber(s.peerCount)} πελ. · {formatNumber(s.peerQty)} τεμ.</span>
                      </div>
                      <div className="truncate text-[10px] text-slate-500">{[s.description, s.collectionNames.join(', ')].filter(Boolean).join(' · ')}</div>
                      {territory && <div className="mt-1"><StatusBadge status={s.status} names={s.status === 'blocked' ? s.blockedBy : s.nearbyNames} /></div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
