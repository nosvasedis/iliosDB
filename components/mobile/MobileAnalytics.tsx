import React, { useMemo, useState } from 'react';
import {
  Activity,
  Award,
  BarChart3,
  Boxes,
  ChevronDown,
  FileText,
  Package,
  Printer,
  Receipt,
  TrendingUp,
  Truck,
  Users,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Product } from '../../types';
import { formatCurrency, formatDecimal } from '../../utils/pricingEngine';
import { FinancePeriodMode } from '../../utils/financeAnalytics';
import { useFinanceAnalytics } from '../../hooks/api/useFinanceAnalytics';
import SpecialCreationNote from '../SpecialCreationNote';
import FinancePeriodSelector from '../FinancePeriodSelector';
import MobileScreenHeader from './MobileScreenHeader';
import IliosLoader from '../ui/IliosLoader';

interface Props {
  products: Product[];
  onPrint?: (stats: any) => void;
}

function StatCard({
  title,
  value,
  hint,
  icon,
  tone,
}: {
  title: string;
  value: string;
  hint?: string;
  icon: React.ReactNode;
  tone: string;
}) {
  return (
    <div className={`rounded-3xl border p-4 shadow-sm ${tone}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] opacity-70">{title}</p>
          <p className="mt-2 break-words text-2xl font-black tracking-tight">{value}</p>
          {hint ? <p className="mt-1 text-xs font-medium leading-snug opacity-75">{hint}</p> : null}
        </div>
        <div className="shrink-0 rounded-2xl bg-white/70 p-3 shadow-sm">{icon}</div>
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-xs font-medium text-slate-500">
      {text}
    </div>
  );
}

export default function MobileAnalytics({ products, onPrint }: Props) {
  const [periodMode, setPeriodMode] = useState<FinancePeriodMode>('current_year');
  const [legalReconciliationOpen, setLegalReconciliationOpen] = useState(false);
  const { analytics: stats, isLoading, isError, error, refetch } = useFinanceAnalytics({
    products,
    period: { mode: periodMode },
  });

  const topProducts = useMemo(() => (stats?.topProducts || []).slice(0, 5), [stats]);
  const topCollections = useMemo(() => (stats?.topCollections || []).slice(0, 5), [stats]);
  const topCustomers = useMemo(() => (stats?.topCustomers || []).slice(0, 5), [stats]);
  const salesTrend = useMemo(() => (stats?.timeChartData || []).slice(-6), [stats]);

  const handlePrint = () => {
    if (!stats) return;
    onPrint?.({ ...stats, title: `Οικονομική Αναφορά - ${stats.period.label}` });
  };

  if (isLoading || !stats) {
    return <IliosLoader variant="section" detail="Οικονομικά" />;
  }

  if (isError) {
    return (
      <div className="min-h-full bg-slate-50">
        <MobileScreenHeader icon={BarChart3} title="Οικονομικά" subtitle="Πραγματοποιημένα έσοδα και εκκρεμότητες" iconClassName="text-indigo-700" />
        <div className="px-5 py-10">
          <div className="rounded-3xl border border-rose-200 bg-rose-50 p-5 text-rose-700 shadow-sm">
            <p className="text-sm font-black">Δεν φορτώθηκαν τα οικονομικά στοιχεία.</p>
            <p className="mt-2 text-xs font-medium">{(error as Error)?.message || 'Δοκιμάστε ξανά σε λίγο.'}</p>
            <button type="button" onClick={refetch} className="mt-4 rounded-xl bg-rose-700 px-4 py-2 text-xs font-black text-white">
              Ανανέωση
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-slate-50 pb-28">
      <MobileScreenHeader
        icon={BarChart3}
        title="Οικονομικά"
        subtitle={`Περίοδος: ${stats.period.label}`}
        iconClassName="text-indigo-700"
        right={(
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-black text-white shadow-sm"
          >
            <Printer size={14} />
            PDF
          </button>
        )}
      />

      <div className="space-y-4 px-4 pt-3">
        <div className="overflow-x-auto pb-1">
          <FinancePeriodSelector value={periodMode} onChange={setPeriodMode} />
        </div>

        <div className="grid grid-cols-1 gap-3">
          <StatCard
            title={stats.labels.realizedRevenue}
            value={formatCurrency(stats.totals.realizedNet)}
            hint={`${stats.totals.shippedPieces} τεμ. απεστάλησαν · χωρίς ΦΠΑ`}
            icon={<Truck size={20} className="text-emerald-700" />}
            tone="border-emerald-200 bg-emerald-50 text-emerald-950"
          />
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              title={stats.labels.grossProfit}
              value={formatCurrency(stats.totals.estimatedProfit)}
              hint={`Περιθώριο ${formatDecimal(stats.totals.margin, 1)}%`}
              icon={<TrendingUp size={20} className="text-blue-700" />}
              tone="border-blue-200 bg-blue-50 text-blue-950"
            />
            <StatCard
              title={stats.labels.backlogValue}
              value={formatCurrency(stats.totals.backlogNet)}
              hint={`${stats.totals.backlogPieces} τεμ. δεν έχουν φύγει`}
              icon={<Package size={20} className="text-indigo-700" />}
              tone="border-indigo-200 bg-indigo-50 text-indigo-950"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              title={stats.labels.discount}
              value={formatCurrency(stats.totals.discount)}
              hint="Αφαιρέθηκε πριν τον ΦΠΑ"
              icon={<Receipt size={20} className="text-amber-700" />}
              tone="border-amber-200 bg-amber-50 text-amber-950"
            />
            <StatCard
              title={stats.labels.vat}
              value={formatCurrency(stats.totals.vat)}
              hint={`Μικτή αξία ${formatCurrency(stats.totals.realizedGross)}`}
              icon={<FileText size={20} className="text-slate-700" />}
              tone="border-slate-200 bg-white text-slate-950"
            />
          </div>
        </div>

        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-900">Πορεία εσόδων και κέρδους</h3>
            <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Αποστολές</span>
          </div>
          {salesTrend.length > 0 ? (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={salesTrend} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <defs>
                    <linearGradient id="mobileRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.45} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="mobileProfit" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#059669" stopOpacity={0.45} />
                      <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 700 }} stroke="#94a3b8" />
                  <YAxis hide />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={{ borderRadius: 16, border: '1px solid #e2e8f0', fontSize: 12 }} />
                  <Area type="monotone" dataKey="revenue" stroke="#2563eb" strokeWidth={2.5} fill="url(#mobileRevenue)" name="Έσοδα" />
                  <Area type="monotone" dataKey="profit" stroke="#059669" strokeWidth={2.5} fill="url(#mobileProfit)" name="Κέρδος" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : <EmptyState text="Δεν υπάρχουν αποστολές για την επιλεγμένη περίοδο." />}
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-black text-slate-900"><Award size={16} className="text-amber-500" /> Πιο δυνατά προϊόντα</h3>
            <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Top 5</span>
          </div>
          {topProducts.length > 0 ? (
            <div className="space-y-2.5">
              {topProducts.map((product, index) => (
                <div key={product.key} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-900">#{index + 1} {product.sku}</p>
                    <SpecialCreationNote sku={product.sku} note={product.itemNote} compact className="mt-1" />
                    <p className="text-[11px] font-bold text-slate-500">{product.quantity} τεμ. · Κέρδος {formatCurrency(product.profit)}</p>
                  </div>
                  <p className="text-sm font-black text-slate-900">{formatCurrency(product.revenue)}</p>
                </div>
              ))}
            </div>
          ) : <EmptyState text="Δεν υπάρχουν προϊόντα με πραγματοποιημένα έσοδα." />}
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-black text-slate-900"><Boxes size={16} className="text-fuchsia-600" /> Συλλογές που ξεχώρισαν</h3>
            <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Έσοδα</span>
          </div>
          {topCollections.length > 0 ? (
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topCollections} layout="vertical" margin={{ top: 0, right: 16, left: 12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eef2f7" />
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fontWeight: 700 }} width={96} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={{ borderRadius: 16, border: '1px solid #e2e8f0', fontSize: 12 }} />
                  <Bar dataKey="revenue" radius={[0, 8, 8, 0]} fill="#7c3aed" name="Έσοδα" barSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <EmptyState text="Δεν υπάρχουν πωλήσεις συλλογών για την περίοδο." />}
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-900">Καλύτεροι πελάτες</h3>
            <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Top 5</span>
          </div>
          <div className="space-y-2.5">
            {topCustomers.length > 0 ? topCustomers.map((customer, index) => (
              <div key={`${customer.name}-${index}`} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-sm">
                    <Users size={16} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-900">{customer.name}</p>
                    <p className="text-[11px] font-bold text-slate-500">{customer.orders} παραγγελίες</p>
                  </div>
                </div>
                <p className="text-sm font-black text-slate-900">{formatCurrency(customer.revenue)}</p>
              </div>
            )) : <EmptyState text="Δεν υπάρχουν αρκετά στοιχεία πελατών για κατάταξη." />}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <button
            type="button"
            onClick={() => setLegalReconciliationOpen((open) => !open)}
            aria-expanded={legalReconciliationOpen}
            className="flex w-full items-center justify-between gap-3 p-4 text-left"
          >
            <h3 className="flex items-center gap-2 text-sm font-black text-slate-900"><Activity size={16} className="text-indigo-600" /> Συμφωνία με παραστατικά</h3>
            <ChevronDown size={18} className={`shrink-0 text-slate-400 transition-transform ${legalReconciliationOpen ? 'rotate-180' : ''}`} />
          </button>
          {legalReconciliationOpen && (
            <div className="border-t border-slate-100 px-4 pb-4 pt-3">
              <div className="mb-3 flex justify-end">
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${Math.abs(stats.legal.netGap) < 0.01 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                  Διαφορά {formatCurrency(stats.legal.netGap)}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-2xl bg-slate-50 p-3">
                  <p className="text-[9px] font-bold uppercase text-slate-400">Καθαρά</p>
                  <p className="text-xs font-black text-slate-900">{formatCurrency(stats.legal.issuedNet)}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <p className="text-[9px] font-bold uppercase text-slate-400">ΦΠΑ</p>
                  <p className="text-xs font-black text-slate-900">{formatCurrency(stats.legal.issuedVat)}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <p className="text-[9px] font-bold uppercase text-slate-400">Πλήθος</p>
                  <p className="text-xs font-black text-slate-900">{stats.legal.issuedCount}</p>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
