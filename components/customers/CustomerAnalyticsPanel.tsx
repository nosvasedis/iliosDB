import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BadgeEuro,
  BarChart3,
  Boxes,
  CalendarClock,
  Check,
  Clipboard,
  Clock3,
  Copy,
  Gauge,
  Layers3,
  Lightbulb,
  Package,
  PackageCheck,
  Percent,
  RefreshCcw,
  ShoppingBag,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
  Wallet,
} from 'lucide-react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Customer, Order } from '../../types';
import { useProducts } from '../../hooks/api/useProducts';
import { useFinanceAnalytics } from '../../hooks/api/useFinanceAnalytics';
import {
  buildCustomerAnalytics,
  CustomerAnalyticsPeriod,
  CustomerMixRow,
  CustomerOpportunity,
  CustomerPerformanceRow,
  CustomerSuccessMetric,
  sortCustomerPerformanceRows,
} from '../../features/customers/customerAnalytics';
import { formatCurrency } from '../../utils/pricingEngine';
import { useUI } from '../UIProvider';
import IliosLoader from '../ui/IliosLoader';

type AnalysisSection = 'summary' | 'products' | 'categories' | 'behavior' | 'opportunities';
type ProductMode = 'products' | 'variants';

interface Props {
  customer: Customer;
  orders: Order[];
  isRetailSystemCustomer?: boolean;
  compact?: boolean;
  onOpenOrders?: (query?: string) => void;
}

const sectionTabs: Array<{ id: AnalysisSection; label: string; icon: typeof BarChart3 }> = [
  { id: 'summary', label: 'Σύνοψη', icon: BarChart3 },
  { id: 'products', label: 'Προϊόντα', icon: Package },
  { id: 'categories', label: 'Κατηγορίες', icon: Layers3 },
  { id: 'behavior', label: 'Συμπεριφορά', icon: Gauge },
  { id: 'opportunities', label: 'Ευκαιρίες', icon: Lightbulb },
];

const periodOptions: Array<{ id: CustomerAnalyticsPeriod; label: string }> = [
  { id: '90d', label: '90 ημέρες' },
  { id: '12m', label: '12 μήνες' },
  { id: 'all', label: 'Όλα' },
];

const successOptions: Array<{ id: CustomerSuccessMetric; label: string }> = [
  { id: 'profit', label: 'Κέρδος' },
  { id: 'revenue', label: 'Τζίρος' },
  { id: 'quantity', label: 'Τεμάχια' },
  { id: 'margin', label: 'Περιθώριο' },
];

const cardClass = 'rounded-2xl border border-slate-100 bg-white shadow-sm';

function formatDate(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('el-GR');
}

function formatPercent(value: number) {
  return `${Number(value || 0).toLocaleString('el-GR', { maximumFractionDigits: 1 })}%`;
}

function Delta({ value }: { value: number | null }) {
  if (value === null) return <span className="text-[10px] font-bold text-slate-400">χωρίς σύγκριση</span>;
  const positive = value >= 0;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-black ${positive ? 'text-emerald-600' : 'text-rose-600'}`}>
      {positive ? <TrendingUp size={11} aria-hidden="true" /> : <TrendingDown size={11} aria-hidden="true" />}
      {positive ? '+' : ''}{formatPercent(value)} έναντι προηγούμενης
    </span>
  );
}

function KpiCard({
  label,
  value,
  helper,
  icon,
  tone = 'slate',
}: {
  label: string;
  value: string;
  helper: React.ReactNode;
  icon: React.ReactNode;
  tone?: 'slate' | 'emerald' | 'indigo' | 'amber' | 'rose';
}) {
  const tones = {
    slate: 'border-slate-100 bg-white text-slate-950',
    emerald: 'border-emerald-100 bg-emerald-50/70 text-emerald-950',
    indigo: 'border-indigo-100 bg-indigo-50/70 text-indigo-950',
    amber: 'border-amber-100 bg-amber-50/70 text-amber-950',
    rose: 'border-rose-100 bg-rose-50/70 text-rose-950',
  };
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${tones[tone]}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-wider opacity-55">{label}</p>
          <p className="mt-1.5 font-mono text-xl font-black tracking-tight sm:text-2xl">{value}</p>
        </div>
        <div className="rounded-xl bg-white/80 p-2.5 text-slate-600 shadow-sm">{icon}</div>
      </div>
      <div className="mt-3 min-h-4 text-[10px] font-semibold leading-relaxed opacity-70">{helper}</div>
    </div>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center">
      <Package size={34} className="mx-auto text-slate-300" aria-hidden="true" />
      <p className="mt-3 text-sm font-black text-slate-700">{title}</p>
      <p className="mx-auto mt-1 max-w-lg text-xs font-medium leading-relaxed text-slate-500">{detail}</p>
    </div>
  );
}

function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T;
  options: Array<{ id: T; label: string }>;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="inline-flex rounded-xl bg-slate-100 p-1" role="group" aria-label={label}>
      {options.map(option => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          className={`whitespace-nowrap rounded-lg px-2.5 py-2 text-[10px] font-black transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:px-3 ${
            value === option.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
          }`}
          aria-pressed={value === option.id}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function MixRanking({ title, rows, icon }: { title: string; rows: CustomerMixRow[]; icon: React.ReactNode }) {
  if (rows.length === 0) return <EmptyState title={`Δεν υπάρχουν ${title.toLowerCase()}`} detail="Η κατάταξη θα εμφανιστεί μόλις υπάρξουν πραγματοποιημένες πωλήσεις." />;
  return (
    <section className={`${cardClass} p-4 sm:p-5`}>
      <div className="mb-5 flex items-center gap-2">
        <div className="rounded-xl bg-slate-100 p-2 text-slate-600">{icon}</div>
        <div>
          <h3 className="text-sm font-black text-slate-900">{title}</h3>
          <p className="text-[10px] font-semibold text-slate-500">Μερίδιο στον πραγματοποιημένο καθαρό τζίρο</p>
        </div>
      </div>
      <div className="space-y-4">
        {rows.slice(0, 8).map((row, index) => (
          <div key={row.key}>
            <div className="mb-1.5 flex items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-xs font-black text-slate-800">#{index + 1} {row.name}</p>
                <p className="text-[10px] font-semibold text-slate-400">{row.quantity} τεμ. · κέρδος {formatCurrency(row.profit)} · {formatPercent(row.margin)}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-mono text-xs font-black text-slate-900">{formatCurrency(row.revenue)}</p>
                <p className="text-[10px] font-bold text-slate-500">{formatPercent(row.share)}</p>
              </div>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-blue-400" style={{ width: `${Math.max(row.share, row.share > 0 ? 2 : 0)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function OpportunityCard({ opportunity, onAction }: { opportunity: CustomerOpportunity; onAction: (opportunity: CustomerOpportunity) => void }) {
  const tone = opportunity.severity === 'high'
    ? 'border-rose-200 bg-rose-50/70'
    : opportunity.severity === 'positive'
      ? 'border-emerald-200 bg-emerald-50/70'
      : 'border-amber-200 bg-amber-50/70';
  const Icon = opportunity.type === 'cross_sell' ? Sparkles : opportunity.type === 'reorder' ? RefreshCcw : opportunity.type === 'margin' ? Percent : opportunity.type === 'backlog' ? PackageCheck : CalendarClock;
  return (
    <article className={`rounded-2xl border p-4 ${tone}`}>
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-white p-2.5 text-slate-700 shadow-sm"><Icon size={18} aria-hidden="true" /></div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-black text-slate-900">{opportunity.title}</h3>
          <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-600">{opportunity.description}</p>
          <div className="mt-3 rounded-xl border border-white/80 bg-white/70 p-3">
            <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Γιατί εμφανίζεται</p>
            <p className="mt-1 text-[11px] font-medium leading-relaxed text-slate-600">{opportunity.reason}</p>
          </div>
          {opportunity.action && (
            <button type="button" onClick={() => onAction(opportunity)} className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-[10px] font-black text-slate-700 shadow-sm transition-colors hover:bg-slate-900 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
              {opportunity.action === 'copy' ? <Copy size={13} /> : <ArrowRight size={13} />}
              {opportunity.action === 'copy' ? 'Αντιγραφή SKU' : opportunity.sku ? 'Σχετικές παραγγελίες' : 'Προβολή παραγγελιών'}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

export default function CustomerAnalyticsPanel({ customer, orders, isRetailSystemCustomer = false, compact = false, onOpenOrders }: Props) {
  const [period, setPeriod] = useState<CustomerAnalyticsPeriod>('12m');
  const [section, setSection] = useState<AnalysisSection>('summary');
  const [productMode, setProductMode] = useState<ProductMode>('products');
  const [successMetric, setSuccessMetric] = useState<CustomerSuccessMetric>('profit');
  const [copiedSku, setCopiedSku] = useState<string | null>(null);
  const { showToast } = useUI();
  const productsQuery = useProducts();
  const financeQuery = useFinanceAnalytics({ products: productsQuery.data || [], period: { mode: 'all_time' } });

  const viewModel = useMemo(() => {
    if (!financeQuery.analytics || !productsQuery.data) return null;
    return buildCustomerAnalytics({
      customer,
      allOrders: orders,
      realizedEvents: financeQuery.analytics.events.realized,
      backlogEvents: financeQuery.analytics.events.backlog,
      products: productsQuery.data,
      period,
      isRetailSystemCustomer,
    });
  }, [customer, financeQuery.analytics, isRetailSystemCustomer, orders, period, productsQuery.data]);

  const rows = useMemo(() => {
    if (!viewModel) return [];
    return sortCustomerPerformanceRows(productMode === 'products' ? viewModel.products : viewModel.variants, successMetric).slice(0, 10);
  }, [productMode, successMetric, viewModel]);

  const copySku = async (sku: string) => {
    try {
      await navigator.clipboard.writeText(sku);
      setCopiedSku(sku);
      showToast(`Το SKU ${sku} αντιγράφηκε`, 'success');
      window.setTimeout(() => setCopiedSku(current => current === sku ? null : current), 1800);
    } catch {
      showToast('Δεν ήταν δυνατή η αντιγραφή του SKU.', 'error');
    }
  };

  const handleOpportunity = (opportunity: CustomerOpportunity) => {
    if (opportunity.action === 'copy' && opportunity.sku) void copySku(opportunity.sku);
    else onOpenOrders?.(opportunity.sku || '');
  };

  if (productsQuery.isError || financeQuery.isError) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-800">
        <div className="flex items-start gap-3">
          <AlertTriangle size={22} className="shrink-0" />
          <div>
            <h3 className="font-black">Δεν φορτώθηκε η ανάλυση πελάτη</h3>
            <p className="mt-1 text-xs font-semibold">Δοκιμάστε ξανά. Τα στοιχεία πελάτη και οι παραγγελίες παραμένουν διαθέσιμα.</p>
            <button type="button" onClick={() => { productsQuery.refetch(); financeQuery.refetch(); }} className="mt-3 rounded-xl bg-rose-700 px-4 py-2 text-xs font-black text-white">Ανανέωση</button>
          </div>
        </div>
      </div>
    );
  }

  if (productsQuery.isLoading || financeQuery.isLoading || !viewModel) {
    return <IliosLoader variant="section" detail="Ανάλυση πελάτη" className="min-h-[360px]" />;
  }

  const healthTone = viewModel.health.state === 'risk' ? 'rose' : viewModel.health.state === 'watch' ? 'amber' : viewModel.health.state === 'active' ? 'emerald' : 'indigo';

  return (
    <div className={`space-y-4 ${compact ? 'pb-20' : 'max-w-6xl'}`}>
      <div className="sticky top-0 z-10 rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex gap-1 overflow-x-auto custom-scrollbar" role="tablist" aria-label="Ενότητες ανάλυσης πελάτη">
            {sectionTabs.map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={section === tab.id}
                  aria-controls={`customer-analysis-${tab.id}`}
                  onClick={() => setSection(tab.id)}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2.5 text-[11px] font-black transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${section === tab.id ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'}`}
                >
                  <Icon size={14} aria-hidden="true" /> {tab.label}
                  {tab.id === 'opportunities' && viewModel.opportunities.length > 0 && <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[9px]">{viewModel.opportunities.length}</span>}
                </button>
              );
            })}
          </div>
          <Segmented<CustomerAnalyticsPeriod> value={period} options={periodOptions} onChange={setPeriod} label="Περίοδος ανάλυσης" />
        </div>
      </div>

      <div id={`customer-analysis-${section}`} role="tabpanel" className="animate-in fade-in slide-in-from-bottom-2 duration-300">
        {section === 'summary' && (
          <div className="space-y-4">
            <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 p-5 text-white shadow-sm sm:p-6">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="max-w-3xl">
                  <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-300">
                    <Sparkles size={12} /> Εμπορική εικόνα
                  </div>
                  <h2 className="text-lg font-black leading-snug sm:text-2xl">{viewModel.headline}</h2>
                  <p className="mt-2 text-xs font-medium leading-relaxed text-slate-300 sm:text-sm">{viewModel.subheadline || 'Οι δείκτες ενημερώνονται από αποστολές, παραγγελίες και το τρέχον κόστος προϊόντων.'}</p>
                </div>
                <div className="shrink-0 rounded-2xl border border-white/10 bg-white/10 px-4 py-3">
                  <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Υγεία πελάτη</p>
                  <p className="mt-1 text-base font-black">{viewModel.health.label}</p>
                  <p className="mt-1 max-w-[220px] text-[10px] font-medium leading-relaxed text-slate-300">{viewModel.health.detail}</p>
                </div>
              </div>
            </section>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
              <KpiCard label="Πραγματοποιημένος τζίρος" value={formatCurrency(viewModel.metrics.revenue.current)} helper={<Delta value={viewModel.metrics.revenue.changePercent} />} icon={<Wallet size={18} />} tone="emerald" />
              <KpiCard label="Εκτιμώμενο κέρδος" value={formatCurrency(viewModel.metrics.profit.current)} helper={<><Delta value={viewModel.metrics.profit.changePercent} /><span className="mt-1 block">Περιθώριο {formatPercent(viewModel.metrics.margin)}</span></>} icon={<BadgeEuro size={18} />} tone="indigo" />
              <KpiCard label="Πραγματοποιημένες παρ." value={String(viewModel.metrics.realizedOrders)} helper={`Μ.Ο. ${formatCurrency(viewModel.metrics.averageOrderValue)} ανά παραγγελία`} icon={<ShoppingBag size={18} />} />
              <KpiCard label="Τεμάχια που έφυγαν" value={String(viewModel.metrics.shippedPieces)} helper={`Τελευταία αποστολή ${formatDate(viewModel.metrics.lastShipmentDate)}`} icon={<PackageCheck size={18} />} />
              <KpiCard label="Ανοιχτή αξία" value={formatCurrency(viewModel.metrics.backlogRevenue)} helper={`${viewModel.metrics.backlogPieces} τεμάχια δεν έχουν αποσταλεί`} icon={<Clock3 size={18} />} tone={viewModel.metrics.backlogRevenue > 0 ? 'amber' : 'slate'} />
              <KpiCard label="Κατάσταση σχέσης" value={viewModel.health.label} helper={`Τελευταία παραγγελία ${formatDate(viewModel.metrics.lastOrderDate)}`} icon={<Target size={18} />} tone={healthTone} />
            </div>

            <section className={`${cardClass} p-4 sm:p-5`}>
              <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h3 className="text-sm font-black text-slate-900">Πορεία τζίρου και κέρδους</h3>
                  <p className="text-[10px] font-semibold text-slate-500">Με βάση την ημερομηνία αποστολής· οι παλιές παραδομένες παραγγελίες χρησιμοποιούν την ημερομηνία παραγγελίας.</p>
                </div>
                <div className="flex items-center gap-3 text-[10px] font-bold text-slate-500"><span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Τζίρος</span><span className="flex items-center gap-1"><span className="h-0.5 w-3 bg-slate-900" /> Κέρδος</span></div>
              </div>
              {viewModel.trend.length > 0 ? (
                <div className="h-64 sm:h-72" aria-label="Γράφημα πορείας τζίρου και κέρδους">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={viewModel.trend} margin={{ top: 10, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fontWeight: 700 }} stroke="#94a3b8" />
                      <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" tickFormatter={value => `${value}€`} />
                      <Tooltip formatter={(value: number, name: string) => [formatCurrency(value), name === 'revenue' ? 'Τζίρος' : 'Κέρδος']} contentStyle={{ borderRadius: 14, border: '1px solid #e2e8f0', fontSize: 11 }} />
                      <Bar dataKey="revenue" fill="#10b981" radius={[6, 6, 0, 0]} />
                      <Line type="monotone" dataKey="profit" stroke="#0f172a" strokeWidth={2.5} dot={{ r: 2 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              ) : <EmptyState title="Δεν υπάρχουν πραγματοποιημένες πωλήσεις" detail="Οι ενεργές παραγγελίες φαίνονται ως ανοιχτή αξία μέχρι να αποσταλούν." />}
            </section>
          </div>
        )}

        {section === 'products' && (
          <div className="space-y-4">
            <div className={`${cardClass} flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between`}>
              <Segmented<ProductMode> value={productMode} options={[{ id: 'products', label: 'Προϊόντα' }, { id: 'variants', label: 'Παραλλαγές' }]} onChange={setProductMode} label="Επίπεδο κατάταξης προϊόντων" />
              <Segmented<CustomerSuccessMetric> value={successMetric} options={successOptions} onChange={setSuccessMetric} label="Κριτήριο επιτυχίας προϊόντος" />
            </div>
            {rows.length > 0 ? (
              <section className={`${cardClass} overflow-hidden`}>
                <div className="border-b border-slate-100 px-4 py-4 sm:px-5">
                  <h3 className="flex items-center gap-2 text-sm font-black text-slate-900"><Trophy size={17} className="text-amber-500" /> Πιο επιτυχημένα {productMode === 'products' ? 'προϊόντα' : 'παραλλαγές'}</h3>
                  <p className="mt-1 text-[10px] font-semibold text-slate-500">Κατάταξη με βάση: {successOptions.find(option => option.id === successMetric)?.label.toLowerCase()}.</p>
                </div>
                <div className="overflow-x-auto custom-scrollbar">
                  <table className="w-full min-w-[860px] text-left">
                    <thead className="bg-slate-50 text-[9px] font-black uppercase tracking-wider text-slate-400">
                      <tr><th className="px-4 py-3">Προϊόν</th><th className="px-3 py-3">Κατηγορία</th><th className="px-3 py-3 text-right">Παρ.</th><th className="px-3 py-3 text-right">Τεμ.</th><th className="px-3 py-3 text-right">Τζίρος</th><th className="px-3 py-3 text-right">Κέρδος</th><th className="px-3 py-3 text-right">Περιθ.</th><th className="px-3 py-3 text-right">Τελευταία</th><th className="px-4 py-3" /></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rows.map((row: CustomerPerformanceRow, index) => (
                        <tr key={row.key} className="group transition-colors hover:bg-slate-50/80">
                          <td className="px-4 py-3">
                            <button type="button" onClick={() => onOpenOrders?.(row.sku)} className="flex items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-lg">
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-100 bg-slate-50">
                                {row.image ? <img src={row.image} alt="" className="h-full w-full object-cover" /> : <Package size={17} className="text-slate-300" />}
                              </div>
                              <div className="min-w-0"><p className="font-mono text-xs font-black text-slate-900">#{index + 1} {row.label}</p><p className="mt-0.5 text-[10px] font-semibold text-slate-400">{row.collection}</p></div>
                            </button>
                          </td>
                          <td className="px-3 py-3 text-[11px] font-bold text-slate-600">{row.category}</td>
                          <td className="px-3 py-3 text-right font-mono text-xs font-bold text-slate-600">{row.orderCount}</td>
                          <td className="px-3 py-3 text-right font-mono text-xs font-bold text-slate-600">{row.quantity}</td>
                          <td className="px-3 py-3 text-right font-mono text-xs font-black text-slate-900">{formatCurrency(row.revenue)}</td>
                          <td className={`px-3 py-3 text-right font-mono text-xs font-black ${row.profit < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{formatCurrency(row.profit)}</td>
                          <td className="px-3 py-3 text-right font-mono text-xs font-bold text-slate-700">{formatPercent(row.margin)}</td>
                          <td className="px-3 py-3 text-right text-[10px] font-semibold text-slate-500">{formatDate(row.lastPurchase)}</td>
                          <td className="px-4 py-3"><button type="button" onClick={() => void copySku(row.sku)} className="rounded-lg p-2 text-slate-400 hover:bg-white hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" aria-label={`Αντιγραφή SKU ${row.sku}`}>{copiedSku === row.sku ? <Check size={15} className="text-emerald-600" /> : <Clipboard size={15} />}</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : <EmptyState title="Δεν υπάρχουν προϊόντα στην περίοδο" detail="Αλλάξτε περίοδο ή περιμένετε να πραγματοποιηθούν αποστολές για να δημιουργηθεί κατάταξη." />}
          </div>
        )}

        {section === 'categories' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <KpiCard label="Κυρίαρχη κατηγορία" value={viewModel.dominantCategory?.name || '—'} helper={viewModel.dominantCategory ? `${formatPercent(viewModel.dominantCategory.share)} του τζίρου` : 'Δεν υπάρχει αρκετό ιστορικό'} icon={<Target size={18} />} tone="indigo" />
              <KpiCard label="Διαφοροποίηση" value={`${viewModel.diversificationCount} κατηγ.`} helper="Εμπορικές κατηγορίες με πραγματοποιημένο τζίρο" icon={<Layers3 size={18} />} />
              <div className="col-span-2 sm:col-span-1"><KpiCard label="Ελλιπή δεδομένα" value={String(viewModel.dataQuality.reduce((sum, row) => sum + row.skus.length, 0))} helper="SKU που χρειάζονται αντιστοίχιση ή κατηγορία" icon={<AlertTriangle size={18} />} tone={viewModel.dataQuality.length > 0 ? 'amber' : 'slate'} /></div>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <MixRanking title="Κατηγορίες" rows={viewModel.categories} icon={<Layers3 size={17} />} />
              <MixRanking title="Συλλογές" rows={viewModel.collections} icon={<Boxes size={17} />} />
            </div>
            {viewModel.dataQuality.length > 0 && (
              <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <AlertTriangle size={20} className="shrink-0 text-amber-600" />
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-black text-amber-950">Ποιότητα καταλόγου</h3>
                    <p className="mt-1 text-[11px] font-medium leading-relaxed text-amber-800">Δεν χρησιμοποιούμε το ασαφές «Άλλο». Οι παρακάτω γραμμές χρειάζονται πραγματική κατηγορία ή αντιστοίχιση SKU.</p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {viewModel.dataQuality.map(issue => (
                        <div key={issue.kind} className="rounded-xl border border-amber-200 bg-white/70 p-3">
                          <p className="text-xs font-black text-slate-800">{issue.label}</p>
                          <p className="mt-1 break-words font-mono text-[10px] font-semibold text-slate-500">{issue.skus.join(', ')}</p>
                          <p className="mt-2 text-[10px] font-bold text-slate-500">{issue.quantity} τεμ. · {formatCurrency(issue.revenue)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            )}
          </div>
        )}

        {section === 'behavior' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <KpiCard label="Συνήθης ρυθμός" value={viewModel.health.typicalCadenceDays ? `${viewModel.health.typicalCadenceDays} ημέρες` : '—'} helper={viewModel.health.daysSinceLastOrder !== null ? `${viewModel.health.daysSinceLastOrder} ημέρες από την τελευταία παραγγελία` : 'Χρειάζονται τουλάχιστον δύο παραγγελίες'} icon={<CalendarClock size={18} />} tone={healthTone} />
              <KpiCard label="Μέσο καλάθι" value={`${viewModel.behavior.averageBasketPieces} τεμ.`} helper={`${viewModel.behavior.averageBasketProducts} διαφορετικά προϊόντα ανά παραγγελία`} icon={<ShoppingBag size={18} />} />
              <KpiCard label="Μέση έκπτωση" value={formatPercent(viewModel.behavior.weightedDiscountPercent)} helper="Σταθμισμένη με την αξία πριν από την έκπτωση" icon={<Percent size={18} />} tone={viewModel.behavior.weightedDiscountPercent >= 10 ? 'amber' : 'slate'} />
              <KpiCard label="Επαναλαμβανόμενα προϊόντα" value={formatPercent(viewModel.behavior.repeatProductRate)} helper={`${viewModel.behavior.activeMonths} ενεργοί μήνες στην περίοδο`} icon={<RefreshCcw size={18} />} />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <section className={`${cardClass} p-4 sm:p-5`}>
                <h3 className="text-sm font-black text-slate-900">Μίγμα κατάστασης παραγγελιών</h3>
                <p className="mt-1 text-[10px] font-semibold text-slate-500">Με βάση τις μη ακυρωμένες παραγγελίες της περιόδου.</p>
                {viewModel.behavior.statusMix.length > 0 ? <div className="mt-5 space-y-3">{viewModel.behavior.statusMix.map(row => <div key={row.status}><div className="mb-1 flex justify-between text-[11px] font-bold text-slate-600"><span>{row.label}</span><span>{row.count} · {formatPercent(row.share)}</span></div><div className="h-2 rounded-full bg-slate-100"><div className="h-full rounded-full bg-slate-800" style={{ width: `${row.share}%` }} /></div></div>)}</div> : <div className="mt-4"><EmptyState title="Χωρίς παραγγελίες" detail="Δεν υπάρχει μίγμα κατάστασης για την επιλεγμένη περίοδο." /></div>}
              </section>
              <section className={`${cardClass} p-4 sm:p-5`}>
                <h3 className="text-sm font-black text-slate-900">Συνδυασμοί που επαναλαμβάνονται</h3>
                <p className="mt-1 text-[10px] font-semibold text-slate-500">Ζεύγη SKU που εμφανίστηκαν μαζί σε τουλάχιστον δύο παραγγελίες.</p>
                {viewModel.behavior.pairs.length > 0 ? <div className="mt-4 space-y-2">{viewModel.behavior.pairs.map(pair => <div key={pair.skus.join('-')} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-3"><span className="font-mono text-xs font-black text-slate-800">{pair.skus[0]} + {pair.skus[1]}</span><span className="rounded-full bg-white px-2 py-1 text-[10px] font-black text-slate-500 shadow-sm">{pair.count} φορές</span></div>)}</div> : <div className="mt-4"><EmptyState title="Δεν υπάρχουν επαναλαμβανόμενοι συνδυασμοί" detail="Χρειάζονται τουλάχιστον δύο παραγγελίες με το ίδιο ζεύγος προϊόντων." /></div>}
              </section>
            </div>
            <section className={`${cardClass} p-4 sm:p-5`}>
              <h3 className="text-sm font-black text-slate-900">Εποχικότητα πραγματοποιημένων πωλήσεων</h3>
              <p className="mt-1 text-[10px] font-semibold text-slate-500">Συγκέντρωση όλων των ετών ανά ημερολογιακό μήνα μέσα στην επιλεγμένη περίοδο.</p>
              <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-12">
                {viewModel.behavior.seasonality.map(row => {
                  const maxRevenue = Math.max(...viewModel.behavior.seasonality.map(item => item.revenue), 1);
                  const intensity = row.revenue / maxRevenue;
                  return <div key={row.month} className="rounded-xl border border-slate-100 p-2 text-center" style={{ backgroundColor: `rgba(16, 185, 129, ${0.05 + intensity * 0.22})` }}><p className="text-[9px] font-black text-slate-500">{row.month}</p><p className="mt-1 font-mono text-[10px] font-black text-slate-800">{row.orders}</p><p className="mt-0.5 text-[8px] font-semibold text-slate-500">{formatCurrency(row.revenue)}</p></div>;
                })}
              </div>
            </section>
          </div>
        )}

        {section === 'opportunities' && (
          <div className="space-y-4">
            <section className="rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4 sm:p-5">
              <div className="flex items-start gap-3"><Lightbulb size={21} className="shrink-0 text-indigo-600" /><div><h2 className="text-sm font-black text-indigo-950">Εξηγήσιμες εμπορικές ευκαιρίες</h2><p className="mt-1 text-[11px] font-medium leading-relaxed text-indigo-800">Οι προτάσεις προκύπτουν από ρυθμό αγορών, εκκρεμότητες, περιθώριο και συμπεριφορά παρόμοιων πελατών. Δεν είναι πρόβλεψη τεχνητής νοημοσύνης.</p></div></div>
            </section>
            {viewModel.opportunities.length > 0 ? <div className="grid gap-3 lg:grid-cols-2">{viewModel.opportunities.map(opportunity => <OpportunityCard key={opportunity.id} opportunity={opportunity} onAction={handleOpportunity} />)}</div> : <div className={`${cardClass} p-4`}><EmptyState title="Δεν εντοπίστηκε άμεση ενέργεια" detail="Δεν υπάρχουν καθυστερήσεις, ασυνήθιστα περιθώρια ή επαρκή μοτίβα για ασφαλή πρόταση αυτή τη στιγμή." /></div>}
          </div>
        )}
      </div>
    </div>
  );
}
