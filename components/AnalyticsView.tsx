import React, { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowLeft,
  Award,
  BarChart3,
  Boxes,
  ChevronDown,
  FileText,
  HelpCircle,
  Loader2,
  Package,
  Printer,
  Scale,
  ShoppingBag,
  TrendingUp,
  Truck,
  UserCheck,
  Wallet,
} from 'lucide-react';
import { Product } from '../types';
import { formatCurrency, formatDecimal } from '../utils/pricingEngine';
import { FinancePeriodMode } from '../utils/financeAnalytics';
import { useFinanceAnalytics } from '../hooks/api/useFinanceAnalytics';
import FinancePeriodSelector from './FinancePeriodSelector';
import DesktopPageHeader from './DesktopPageHeader';

interface Props {
  products: Product[];
  onBack?: () => void;
  onPrint?: (stats: any) => void;
}

function percent(value: number) {
  return `${formatDecimal(value || 0, 1)}%`;
}

function KpiCard({
  label,
  value,
  helper,
  icon,
  tone = 'light',
}: {
  label: string;
  value: string;
  helper: string;
  icon: React.ReactNode;
  tone?: 'light' | 'dark' | 'green';
}) {
  const toneClass = tone === 'dark'
    ? 'border-slate-900 bg-slate-900 text-white'
    : tone === 'green'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
      : 'border-slate-100 bg-white text-slate-950';

  return (
    <div className={`rounded-3xl border p-6 shadow-sm ${toneClass}`}>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-black uppercase text-current opacity-60">{label}</div>
          <div className="mt-2 text-3xl font-black">{value}</div>
        </div>
        <div className="rounded-2xl bg-white/60 p-3 text-slate-700 shadow-sm">{icon}</div>
      </div>
      <p className="text-xs font-semibold leading-relaxed opacity-70">{helper}</p>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm font-semibold text-slate-500">
      {text}
    </div>
  );
}

export default function AnalyticsView({ products, onBack, onPrint }: Props) {
  const [periodMode, setPeriodMode] = useState<FinancePeriodMode>('current_year');
  const [legalReconciliationOpen, setLegalReconciliationOpen] = useState(false);
  const { analytics: stats, isLoading: loading, isError: failed, error: loadError, refetch } = useFinanceAnalytics({
    products,
    period: { mode: periodMode },
  });

  const handlePrint = () => {
    if (!stats) return;
    onPrint?.({ ...stats, title: `Οικονομική Ανάλυση - ${stats.period.label}` });
  };

  if (loading || !stats) {
    return (
      <div className="flex min-h-[420px] flex-col items-center justify-center gap-4 text-slate-500">
        <Loader2 className="animate-spin text-emerald-600" size={36} />
        <p className="text-sm font-black">Φόρτωση οικονομικών στοιχείων...</p>
      </div>
    );
  }

  if (failed) {
    return (
      <div className="mx-auto max-w-2xl rounded-3xl border border-rose-200 bg-rose-50 p-6 text-rose-800">
        <h2 className="text-lg font-black">Δεν φορτώθηκαν τα οικονομικά στοιχεία</h2>
        <p className="mt-2 text-sm font-semibold">Δοκιμάστε ξανά. Αν συνεχιστεί, ελέγξτε τη σύνδεση και τα δεδομένα παραστατικών.</p>
        <p className="mt-4 rounded-xl bg-white/70 p-3 text-xs font-mono">{(loadError as Error)?.message || 'Άγνωστο σφάλμα'}</p>
        <button type="button" onClick={refetch} className="mt-4 rounded-xl bg-rose-700 px-4 py-2 text-sm font-bold text-white">
          Ανανέωση
        </button>
      </div>
    );
  }

  const topProducts = stats.topProducts.slice(0, 8);
  const topCollections = stats.topCollections.slice(0, 6);
  const topSellers = stats.topSellers.slice(0, 6);

  return (
    <div className="mx-auto max-w-7xl space-y-8 pb-20 print:hidden">
      <DesktopPageHeader
        icon={BarChart3}
        title="Οικονομικά"
        subtitle={`Καθαρή εικόνα για ${stats.period.label.toLowerCase()}: έσοδα από αποστολές, εκκρεμότητες και κέρδος.`}
        leading={onBack ? (
          <button type="button" onClick={onBack} className="-ml-1 rounded-2xl p-3 text-slate-400 transition-all hover:bg-slate-100 hover:text-slate-800 active:scale-95">
            <ArrowLeft size={20} />
          </button>
        ) : undefined}
        tail={(
          <div className="flex flex-wrap items-center gap-3">
            <FinancePeriodSelector value={periodMode} onChange={setPeriodMode} />
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-black text-white shadow-sm transition-all hover:bg-black active:scale-95"
            >
              <Printer size={18} />
              Εκτύπωση PDF
            </button>
          </div>
        )}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label={stats.labels.realizedRevenue}
          value={formatCurrency(stats.totals.realizedNet)}
          helper="Μόνο όσα έχουν αποσταλεί ή παραδοθεί, μετά την έκπτωση και χωρίς ΦΠΑ."
          icon={<Truck size={22} />}
          tone="green"
        />
        <KpiCard
          label={stats.labels.backlogValue}
          value={formatCurrency(stats.totals.backlogNet)}
          helper="Αξία τεμαχίων που υπάρχουν ακόμα σε ανοιχτές παραγγελίες."
          icon={<Package size={22} />}
        />
        <KpiCard
          label={stats.labels.grossProfit}
          value={formatCurrency(stats.totals.estimatedProfit)}
          helper={`Εκτιμώμενο περιθώριο ${percent(stats.totals.margin)} με βάση το καλύτερο διαθέσιμο κόστος.`}
          icon={<TrendingUp size={22} />}
          tone="dark"
        />
        <KpiCard
          label="Τεμάχια που έφυγαν"
          value={String(stats.totals.shippedPieces)}
          helper={`${stats.totals.realizedOrderCount} παραγγελίες με πραγματοποιημένη αξία στην περίοδο.`}
          icon={<ShoppingBag size={22} />}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm lg:col-span-8">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-black text-slate-900">Πορεία εσόδων και κέρδους</h3>
              <p className="mt-1 text-xs font-semibold text-slate-500">Με βάση την ημερομηνία αποστολής.</p>
            </div>
          </div>
          {stats.timeChartData.length > 0 ? (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.timeChartData} margin={{ top: 10, right: 16, left: -8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fontWeight: 700 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" tickFormatter={(value) => `${value}€`} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={{ borderRadius: 16, border: '1px solid #e2e8f0', fontSize: 12 }} />
                  <Bar dataKey="revenue" name="Έσοδα" fill="#059669" radius={[8, 8, 0, 0]} />
                  <Line type="monotone" dataKey="profit" name="Κέρδος" stroke="#0f172a" strokeWidth={3} dot={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState text="Δεν υπάρχουν αποστολές για την επιλεγμένη περίοδο." />
          )}
        </section>

        <section className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm lg:col-span-4">
          <h3 className="text-lg font-black text-slate-900">Κόστος παραγωγής</h3>
          <p className="mt-1 text-xs font-semibold text-slate-500">Εκτίμηση από μέταλλο, εργασία και υλικά.</p>
          <div className="mt-6 space-y-4">
            {[
              ['Ασήμι', stats.costBreakdown.silver, 'bg-slate-500'],
              ['Εργασία', stats.costBreakdown.labor, 'bg-blue-500'],
              ['Υλικά', stats.costBreakdown.materials, 'bg-violet-500'],
            ].map(([label, value, color]) => (
              <div key={label as string}>
                <div className="mb-1 flex items-center justify-between text-xs font-black text-slate-600">
                  <span>{label}</span>
                  <span>{formatCurrency(value as number)}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${color}`}
                    style={{ width: `${stats.totals.estimatedCost > 0 ? Math.max(4, ((value as number) / stats.totals.estimatedCost) * 100) : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          {stats.costWarnings.length > 0 && (
            <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-semibold text-amber-800">
              <div className="mb-1 flex items-center gap-2 font-black"><HelpCircle size={14} /> Σημείωση κόστους</div>
              {stats.costWarnings.slice(0, 3).join(' · ')}
            </div>
          )}
        </section>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-black text-slate-900"><Award size={20} className="text-amber-500" /> Πιο δυνατά προϊόντα</h3>
          {topProducts.length > 0 ? (
            <div className="space-y-3">
              {topProducts.map((item, index) => (
                <div key={item.sku} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-900">#{index + 1} {item.sku}</p>
                    <p className="text-xs font-semibold text-slate-500">{item.quantity} τεμ. · Κέρδος {formatCurrency(item.profit)}</p>
                  </div>
                  <div className="text-right text-sm font-black text-slate-900">{formatCurrency(item.revenue)}</div>
                </div>
              ))}
            </div>
          ) : <EmptyState text="Δεν υπάρχουν προϊόντα με πραγματοποιημένα έσοδα." />}
        </section>

        <section className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-black text-slate-900"><Boxes size={20} className="text-fuchsia-600" /> Συλλογές που ξεχώρισαν</h3>
          {topCollections.length > 0 ? (
            <div className="space-y-3">
              {topCollections.map((item, index) => (
                <div key={`${item.id}-${item.name}`} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-900">#{index + 1} {item.name}</p>
                    <p className="text-xs font-semibold text-slate-500">{item.quantity} τεμ. · Περιθώριο {percent(item.margin)}</p>
                  </div>
                  <div className="text-right text-sm font-black text-slate-900">{formatCurrency(item.revenue)}</div>
                </div>
              ))}
            </div>
          ) : <EmptyState text="Δεν υπάρχουν πωλήσεις συλλογών για την περίοδο." />}
        </section>

        <section className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-black text-slate-900"><UserCheck size={20} className="text-sky-600" /> Πλασιέ</h3>
          {topSellers.length > 0 ? (
            <div className="space-y-3">
              {topSellers.map((item, index) => (
                <div key={item.id} className="rounded-2xl bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-black text-slate-900">#{index + 1} {item.name}</p>
                    <p className="text-sm font-black text-slate-900">{formatCurrency(item.revenue)}</p>
                  </div>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    Κερδισμένη προμήθεια {formatCurrency(item.earnedCommission)} · Εκκρεμεί {formatCurrency(item.pendingCommission)}
                  </p>
                </div>
              ))}
            </div>
          ) : <EmptyState text="Δεν υπάρχουν πωλήσεις από πλασιέ για την περίοδο." />}
        </section>
      </div>

      <section className="rounded-3xl border border-slate-100 bg-white shadow-sm">
        <button
          type="button"
          onClick={() => setLegalReconciliationOpen((open) => !open)}
          aria-expanded={legalReconciliationOpen}
          className="flex w-full items-center justify-between gap-4 p-6 text-left transition-colors hover:bg-slate-50/80"
        >
          <div>
            <h3 className="flex items-center gap-2 text-lg font-black text-slate-900"><FileText size={20} className="text-indigo-600" /> {stats.labels.legalReconciliation}</h3>
            <p className="mt-1 text-xs font-semibold text-slate-500">Σύγκριση πραγματοποιημένων εσόδων με εκδοθέντα παραστατικά.</p>
          </div>
          <ChevronDown size={20} className={`shrink-0 text-slate-400 transition-transform ${legalReconciliationOpen ? 'rotate-180' : ''}`} />
        </button>
        {legalReconciliationOpen && (
          <div className="border-t border-slate-100 px-6 pb-6 pt-5">
            <div className={`mb-5 inline-flex rounded-2xl px-4 py-2 text-sm font-black ${Math.abs(stats.legal.netGap) < 0.01 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
              Διαφορά: {formatCurrency(stats.legal.netGap)}
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <KpiCard label="Καθαρή αξία παραστατικών" value={formatCurrency(stats.legal.issuedNet)} helper={`${stats.legal.issuedCount} εκδοθέντα παραστατικά.`} icon={<FileText size={20} />} />
              <KpiCard label="ΦΠΑ παραστατικών" value={formatCurrency(stats.legal.issuedVat)} helper="Σύνολο ΦΠΑ από τα εκδοθέντα παραστατικά." icon={<Scale size={20} />} />
              <KpiCard label="Μικτή αξία παραστατικών" value={formatCurrency(stats.legal.issuedGross)} helper="Καθαρή αξία μαζί με ΦΠΑ." icon={<Wallet size={20} />} />
              <KpiCard label="Πραγματοποιημένα έσοδα" value={formatCurrency(stats.totals.realizedNet)} helper="Λειτουργική εικόνα από αποστολές." icon={<Truck size={20} />} />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
