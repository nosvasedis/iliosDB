import React, { useState } from 'react';
import {
  Users,
  Truck,
  Clock,
  Package,
  TrendingUp,
  AlertTriangle,
  Hash,
  User,
  Coins,
  Hammer,
  Gem,
  Gift,
} from 'lucide-react';
import { Gender } from '../../types';
import { formatCurrency } from '../../utils/pricingEngine';
import { getSkuFinishTextColor, getSkuStoneTextColor } from '../../utils/skuColoring';
import { getVariantComponents } from '../../utils/pricingEngine';
import SkuColorizedText from '../SkuColorizedText';
import SpecialCreationNote from '../SpecialCreationNote';
import {
  type SkuVariantDetail,
  formatMonthLabel,
} from '../../features/dashboard/skuVariantAnalytics';

const FINISH_BADGE: Record<string, string> = {
  '': 'bg-slate-100 text-slate-600 border-slate-200',
  P: 'bg-slate-100 text-slate-700 border-slate-300',
  X: 'bg-amber-50 text-amber-800 border-amber-200',
  D: 'bg-orange-50 text-orange-800 border-orange-200',
  H: 'bg-cyan-50 text-cyan-800 border-cyan-200',
};

const KPI_STYLES = [
  { label: 'Τεμάχια', icon: Package, bg: 'bg-emerald-50', ring: 'ring-emerald-100', labelColor: 'text-emerald-600', valueColor: 'text-emerald-900' },
  { label: 'Έσοδα', icon: TrendingUp, bg: 'bg-blue-50', ring: 'ring-blue-100', labelColor: 'text-blue-600', valueColor: 'text-blue-900' },
  { label: 'Κέρδος', icon: TrendingUp, bg: 'bg-teal-50', ring: 'ring-teal-100', labelColor: 'text-teal-600', valueColor: 'text-teal-900' },
  { label: 'Περιθώριο', icon: TrendingUp, bg: 'bg-amber-50', ring: 'ring-amber-100', labelColor: 'text-amber-700', valueColor: 'text-amber-900' },
  { label: 'Πελάτες', icon: Users, bg: 'bg-violet-50', ring: 'ring-violet-100', labelColor: 'text-violet-600', valueColor: 'text-violet-900' },
  { label: 'Παραγγελίες', icon: Hash, bg: 'bg-slate-100', ring: 'ring-slate-200', labelColor: 'text-slate-500', valueColor: 'text-slate-800' },
  { label: 'Αποστολές', icon: Truck, bg: 'bg-cyan-50', ring: 'ring-cyan-100', labelColor: 'text-cyan-700', valueColor: 'text-cyan-900' },
  { label: 'Ασήμι', icon: Coins, bg: 'bg-orange-50', ring: 'ring-orange-100', labelColor: 'text-orange-600', valueColor: 'text-orange-900' },
] as const;

const TAB_STYLES: Record<string, { active: string; idle: string }> = {
  summary: { active: 'bg-emerald-600 text-white shadow-sm', idle: 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100' },
  customers: { active: 'bg-violet-600 text-white shadow-sm', idle: 'bg-violet-50 text-violet-800 hover:bg-violet-100' },
  lines: { active: 'bg-blue-600 text-white shadow-sm', idle: 'bg-blue-50 text-blue-800 hover:bg-blue-100' },
  backlog: { active: 'bg-indigo-600 text-white shadow-sm', idle: 'bg-indigo-50 text-indigo-800 hover:bg-indigo-100' },
};

const CUSTOMER_RANK_ACCENT = [
  'border-l-4 border-l-amber-400 bg-amber-50/30',
  'border-l-4 border-l-slate-400 bg-slate-50/50',
  'border-l-4 border-l-orange-300 bg-orange-50/30',
];

type DetailTab = 'summary' | 'customers' | 'lines' | 'backlog';

interface Props {
  detail: SkuVariantDetail | null;
  gender?: Gender;
  onSelectVariant?: (variantSuffix: string, itemNote?: string | null) => void;
}

function EmptyState() {
  return (
    <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-500 ring-4 ring-emerald-100">
        <Hash size={24} />
      </div>
      <p className="text-sm font-bold text-slate-600">Επιλέξτε SKU ή αναζητήστε κωδικό</p>
      <p className="max-w-[240px] text-xs font-medium text-slate-400">
        Για λεπτομερή ανάλυση πωλήσεων, πελατών και αποστολών της περιόδου.
      </p>
    </div>
  );
}

function TimelineBars({ timeline }: { timeline: SkuVariantDetail['timeline'] }) {
  if (timeline.length === 0) return null;
  const maxQty = Math.max(...timeline.map((p) => p.quantity), 1);

  return (
    <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50/40 p-3">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-emerald-700">Χρονοδιάγραμμα πωλήσεων</p>
      <div className="space-y-2">
        {timeline.map((point) => (
          <div key={point.monthKey} className="flex items-center gap-2">
            <span className="w-14 shrink-0 text-[10px] font-bold text-emerald-800/70">
              {formatMonthLabel(point.monthKey)}
            </span>
            <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/80">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600"
                style={{ width: `${Math.max(6, (point.quantity / maxQty) * 100)}%` }}
              />
            </div>
            <span className="w-8 shrink-0 text-right text-[10px] font-black tabular-nums text-emerald-900">
              {point.quantity}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SkuVariantDetailPanel({ detail, gender, onSelectVariant }: Props) {
  const [tab, setTab] = useState<DetailTab>('summary');

  if (!detail) return <EmptyState />;

  const suffix = detail.variantSuffix;
  const { finish, stone } = getVariantComponents(suffix, gender);
  const finishBadge = FINISH_BADGE[finish.code] || FINISH_BADGE[''];
  const finishColor = getSkuFinishTextColor(finish.code);
  const stoneColor = getSkuStoneTextColor(stone.code);
  const { summary } = detail;

  const kpiValues = [
    String(summary.quantity),
    formatCurrency(summary.revenue),
    formatCurrency(summary.profit),
    summary.revenue > 0 ? `${summary.margin.toFixed(1)}%` : '—',
    String(summary.customerCount),
    String(summary.orderCount),
    String(summary.shipmentCount),
    `${summary.silverWeightGrams.toFixed(1)} g`,
  ];

  const tabs: { id: DetailTab; label: string; hint?: string; count?: number }[] = [
    { id: 'summary', label: 'Σύνοψη' },
    { id: 'customers', label: 'Πελάτες', count: detail.customers.length },
    {
      id: 'lines',
      label: 'Πωλήσεις',
      hint: 'Κάθε εγγραφή = μία αποστολή ή πραγματοποιημένη πώληση',
      count: detail.lines.length,
    },
    ...(detail.backlog.quantity > 0 ? [{ id: 'backlog' as const, label: 'Εκκρεμεί', count: detail.backlog.quantity }] : []),
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-slate-100 bg-white px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <SkuColorizedText
            sku={detail.sku}
            suffix={detail.variantSuffix}
            gender={gender}
            className="text-base sm:text-lg"
          />
          {detail.isMasterAggregate && (
            <span className="rounded-md bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800 ring-1 ring-blue-200">
              Όλες οι παραλλαγές
            </span>
          )}
        </div>
        <SpecialCreationNote sku={detail.sku} note={detail.itemNote} className="mt-2" />

        {!detail.isMasterAggregate && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold ${finishBadge}`}>
              <span className={finishColor}>{finish.name || 'Λουστρέ'}</span>
            </span>
            {stone.code && (
              <span className="rounded-md border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-bold ring-1 ring-violet-100">
                <span className={stoneColor}>{stone.name}</span>
              </span>
            )}
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-1.5">
          {tabs.map((t) => {
            const style = TAB_STYLES[t.id];
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all ${
                  tab === t.id ? style.active : style.idle
                }`}
              >
                {t.label}
                {t.count != null && t.count > 0 && (
                  <span className={`ml-1 ${tab === t.id ? 'opacity-80' : 'opacity-60'}`}>
                    ({t.count})
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {tab === 'lines' && (
          <p className="mt-2 text-[10px] font-medium leading-relaxed text-blue-600/80">
            Κάθε κάρτα είναι μία αποστολή ή πραγματοποιημένη πώληση αυτού του SKU (ημερομηνία, πελάτης, παραγγελία, ποσότητα).
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
        {tab === 'summary' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {KPI_STYLES.map((kpi, index) => {
                const Icon = kpi.icon;
                const value = kpiValues[index];
                const isProfit = kpi.label === 'Κέρδος';
                const profitNegative = isProfit && summary.profit < 0;
                return (
                  <div
                    key={kpi.label}
                    className={`rounded-xl px-3 py-2.5 ring-1 ${
                      profitNegative ? 'bg-red-50 ring-red-100' : `${kpi.bg} ${kpi.ring}`
                    }`}
                  >
                    <div className={`mb-0.5 flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide ${
                      profitNegative ? 'text-red-600' : kpi.labelColor
                    }`}
                    >
                      <Icon size={10} />
                      {kpi.label}
                    </div>
                    <p className={`text-sm font-black tabular-nums ${
                      profitNegative ? 'text-red-800' : kpi.valueColor
                    }`}
                    >
                      {value}
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <p className="mb-3 text-[10px] font-bold uppercase tracking-wide text-slate-500">Κατανομή κόστους</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-orange-50 px-2 py-2 text-center ring-1 ring-orange-100">
                  <Coins size={14} className="mx-auto mb-1 text-orange-500" />
                  <p className="text-[10px] font-bold text-orange-700">Ασήμι</p>
                  <p className="text-xs font-black text-orange-900">{formatCurrency(summary.costBreakdown.silver)}</p>
                </div>
                <div className="rounded-lg bg-violet-50 px-2 py-2 text-center ring-1 ring-violet-100">
                  <Hammer size={14} className="mx-auto mb-1 text-violet-500" />
                  <p className="text-[10px] font-bold text-violet-700">Εργασία</p>
                  <p className="text-xs font-black text-violet-900">{formatCurrency(summary.costBreakdown.labor)}</p>
                </div>
                <div className="rounded-lg bg-cyan-50 px-2 py-2 text-center ring-1 ring-cyan-100">
                  <Gem size={14} className="mx-auto mb-1 text-cyan-600" />
                  <p className="text-[10px] font-bold text-cyan-700">Υλικά</p>
                  <p className="text-xs font-black text-cyan-900">{formatCurrency(summary.costBreakdown.materials)}</p>
                </div>
              </div>
            </div>

            {summary.priceOverrideCount > 0 && (
              <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900 ring-1 ring-amber-100">
                <AlertTriangle size={14} className="text-amber-600" />
                {summary.priceOverrideCount} γραμμ{summary.priceOverrideCount === 1 ? 'ή' : 'ές'} με χειροκίνητη τιμή
              </div>
            )}

            {summary.giftQuantity > 0 && (
              <div className="flex items-center gap-2 rounded-xl border border-fuchsia-200 bg-fuchsia-50 px-3 py-2 text-xs font-bold text-fuchsia-900 ring-1 ring-fuchsia-100">
                <Gift size={14} className="text-fuchsia-600" />
                {summary.giftQuantity} τεμάχια δώρο (0€ έσοδα, κόστος παραγωγής μετράει)
              </div>
            )}

            {summary.profit < 0 && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs leading-relaxed text-red-900 ring-1 ring-red-100">
                <p className="font-bold text-red-800">Γιατί αρνητικό κέρδος;</p>
                <p className="mt-1 font-medium text-red-700/90">
                  {summary.giftQuantity > 0 && (
                    <span>{summary.giftQuantity} τεμ. δώρο — το κόστος παραγωγής μετράει ως ζημία. </span>
                  )}
                  {summary.belowCostQuantity > 0 && (
                    <span>{summary.belowCostQuantity} τεμ. κάτω από εκτιμώμενο κόστος. </span>
                  )}
                  {summary.giftQuantity === 0 && summary.belowCostQuantity === 0 && (
                    <span>Το συνολικό κόστος παραγωγής υπερβαίνει τα έσοδα.</span>
                  )}
                </p>
              </div>
            )}

            <TimelineBars timeline={detail.timeline} />

            {detail.variantBreakdown && detail.variantBreakdown.length > 0 && (
              <div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-blue-600">Ανά παραλλαγή</p>
                <div className="space-y-2">
                  {detail.variantBreakdown.map((row) => (
                    <button
                      key={row.key}
                      type="button"
                      onClick={() => onSelectVariant?.(row.variantSuffix, row.itemNote)}
                      className="flex w-full items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50/50 px-3 py-2.5 text-left transition-all hover:border-blue-200 hover:bg-blue-50"
                    >
                      <div className="min-w-0">
                        <SkuColorizedText sku={detail.sku} suffix={row.variantSuffix} gender={gender} className="text-sm" />
                        <SpecialCreationNote sku={detail.sku} note={row.itemNote} compact className="mt-1" />
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-black text-blue-900">{row.quantity} τεμ.</p>
                        <p className="text-[10px] font-semibold text-blue-600/80">{formatCurrency(row.revenue)}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {detail.sellers.length > 0 && (
              <div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-amber-700">Πλασιέδες</p>
                <div className="space-y-2">
                  {detail.sellers.map((seller) => (
                    <div
                      key={seller.id}
                      className="flex items-center justify-between rounded-xl border border-amber-100 bg-amber-50/60 px-3 py-2.5"
                    >
                      <span className="text-sm font-bold text-amber-900">{seller.name}</span>
                      <div className="text-right">
                        <p className="text-xs font-black text-amber-900">{seller.quantity} τεμ.</p>
                        <p className="text-[10px] text-amber-700/80">{formatCurrency(seller.revenue)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'customers' && (
          <div className="space-y-2.5">
            {detail.customers.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">Δεν βρέθηκαν πελάτες.</p>
            ) : (
              detail.customers.map((customer, index) => (
                <div
                  key={customer.id}
                  className={`rounded-xl border border-violet-100 bg-white p-3.5 shadow-sm ${
                    CUSTOMER_RANK_ACCENT[index] ?? 'border-l-4 border-l-violet-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-violet-950">
                        #{index + 1} {customer.name}
                      </p>
                      <p className="mt-0.5 text-[10px] font-semibold text-violet-600/80">
                        {customer.orderCount} παραγγελί{customer.orderCount === 1 ? 'α' : 'ες'} · {customer.quantityShare.toFixed(1)}%
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-black text-violet-900">{customer.quantity} τεμ.</p>
                      <p className="text-xs font-semibold text-blue-700">{formatCurrency(customer.revenue)}</p>
                      <p className={`text-[10px] font-bold ${customer.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {formatCurrency(customer.profit)}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'lines' && (
          <div className="space-y-2.5">
            {detail.lines.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">Δεν βρέθηκαν γραμμές πώλησης.</p>
            ) : (
              detail.lines.map((line, index) => {
                const dateStr = new Date(line.date).toLocaleDateString('el-GR', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                });
                const isGift = line.net <= 0.001;
                const accent = isGift
                  ? 'border-l-4 border-l-fuchsia-400 bg-fuchsia-50/40'
                  : line.profit < 0
                    ? 'border-l-4 border-l-red-300 bg-red-50/30'
                    : 'border-l-4 border-l-emerald-400 bg-emerald-50/20';

                return (
                  <div
                    key={`${line.orderId}-${line.shipmentId ?? 'legacy'}-${line.lineId ?? 'noline'}-${line.date}-${index}`}
                    className={`rounded-xl border border-slate-100 p-3.5 shadow-sm ${accent}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-slate-900">{line.customerName}</p>
                        <SpecialCreationNote sku={line.sku} note={line.itemNote} compact className="mt-1" />
                        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] font-semibold text-slate-500">
                          <span className="inline-flex items-center gap-0.5 rounded-md bg-white/80 px-1.5 py-0.5">
                            <Clock size={9} className="text-blue-500" />
                            {dateStr}
                          </span>
                          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-slate-600">
                            #{line.orderId.slice(-8)}
                          </span>
                          {line.shipmentNumber != null && (
                            <span className="inline-flex items-center gap-0.5 rounded-md bg-cyan-50 px-1.5 py-0.5 text-cyan-800">
                              <Truck size={9} />
                              #{line.shipmentNumber}
                            </span>
                          )}
                          {line.sellerName && (
                            <span className="inline-flex items-center gap-0.5 rounded-md bg-amber-50 px-1.5 py-0.5 text-amber-800">
                              <User size={9} />
                              {line.sellerName}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-black text-slate-800">
                          {line.quantity}× {formatCurrency(line.unitPrice)}
                        </p>
                        <p className="text-xs font-semibold text-blue-700">{formatCurrency(line.net)}</p>
                        <p className={`text-[10px] font-bold ${line.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {formatCurrency(line.profit)}
                        </p>
                      </div>
                    </div>
                    {(line.priceOverride || line.costWarning || isGift) && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {isGift && (
                          <span className="rounded-md bg-fuchsia-100 px-2 py-0.5 text-[9px] font-bold text-fuchsia-800 ring-1 ring-fuchsia-200">
                            Δώρο (0€)
                          </span>
                        )}
                        {line.priceOverride && (
                          <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[9px] font-bold text-amber-800 ring-1 ring-amber-200">
                            Χειροκίνητη τιμή
                          </span>
                        )}
                        {line.costWarning && (
                          <span className="rounded-md bg-red-100 px-2 py-0.5 text-[9px] font-bold text-red-800">
                            {line.costWarning}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {tab === 'backlog' && (
          <div className="space-y-3">
            <div className="rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-violet-50 px-4 py-3 ring-1 ring-indigo-100">
              <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-600">Εκκρεμεί αποστολή</p>
              <p className="mt-1 text-lg font-black text-indigo-950">
                {detail.backlog.quantity} τεμ. · {formatCurrency(detail.backlog.net)}
              </p>
            </div>
            {detail.backlog.lines.map((line, index) => (
              <div
                key={`backlog-${line.orderId}-${index}`}
                className="rounded-xl border border-indigo-100 border-l-4 border-l-indigo-400 bg-indigo-50/30 p-3"
              >
                <p className="text-sm font-black text-indigo-950">{line.customerName}</p>
                <SpecialCreationNote sku={line.sku} note={line.itemNote} compact className="mt-1" />
                <p className="mt-0.5 text-[10px] text-indigo-700/80">
                  #{line.orderId.slice(-8)} · {line.quantity} τεμ. · {formatCurrency(line.net)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
