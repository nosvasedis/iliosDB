import { formatDecimal, formatNumber } from '../../utils/numberFormat';
import React, { useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Clock,
  Gift,
  Hash,
  Truck,
  User,
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

type DetailTab = 'summary' | 'customers' | 'lines' | 'backlog';

interface Props {
  detail: SkuVariantDetail | null;
  gender?: Gender;
  onSelectVariant?: (variantSuffix: string, itemNote?: string | null) => void;
}

const COST_PARTS = [
  { key: 'silver', label: 'Ασήμι', bar: 'bg-slate-400' },
  { key: 'labor', label: 'Εργασία', bar: 'bg-amber-400' },
  { key: 'materials', label: 'Υλικά', bar: 'bg-violet-400' },
] as const;

function EmptyState() {
  return (
    <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
        <BarChart3 size={24} />
      </div>
      <p className="text-sm font-bold text-slate-700">Επιλέξτε κωδικό από την κατάταξη</p>
      <p className="max-w-[260px] text-xs font-medium leading-relaxed text-slate-400">
        ή αναζητήστε κωδικό για ανάλυση πωλήσεων, πελατών και αποστολών της περιόδου.
      </p>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">{children}</p>;
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: 'positive' | 'negative' }) {
  return (
    <div className="min-w-0 rounded-2xl bg-slate-50 px-3.5 py-3">
      <p className="truncate text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p
        className={`mt-0.5 truncate text-base font-black tabular-nums ${
          tone === 'negative' ? 'text-rose-600' : tone === 'positive' ? 'text-emerald-700' : 'text-slate-900'
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function TimelineBars({ timeline }: { timeline: SkuVariantDetail['timeline'] }) {
  if (timeline.length === 0) return null;
  const maxQty = Math.max(...timeline.map((p) => p.quantity), 1);

  return (
    <div>
      <SectionLabel>Πωλήσεις ανά μήνα</SectionLabel>
      <div className="flex h-28 items-end gap-1.5 rounded-2xl bg-slate-50 px-3 pb-2 pt-4">
        {timeline.map((point) => (
          <div key={point.monthKey} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${formatMonthLabel(point.monthKey)}: ${formatNumber(point.quantity)} τεμ.`}>
            <span className="text-[9px] font-black tabular-nums text-slate-600">{formatNumber(point.quantity)}</span>
            <div
              className="w-full max-w-[2rem] rounded-t-md bg-emerald-500"
              style={{ height: `${Math.max(6, (point.quantity / maxQty) * 64)}px` }}
            />
            <span className="w-full truncate text-center text-[9px] font-bold text-slate-400">{formatMonthLabel(point.monthKey)}</span>
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
  const finishColor = getSkuFinishTextColor(finish.code);
  const stoneColor = getSkuStoneTextColor(stone.code);
  const { summary } = detail;
  const costTotal = summary.costBreakdown.silver + summary.costBreakdown.labor + summary.costBreakdown.materials;

  const tabs: { id: DetailTab; label: string; count?: number }[] = [
    { id: 'summary', label: 'Σύνοψη' },
    { id: 'customers', label: 'Πελάτες', count: detail.customers.length },
    { id: 'lines', label: 'Πωλήσεις', count: detail.lines.length },
    ...(detail.backlog.quantity > 0 ? [{ id: 'backlog' as const, label: 'Εκκρεμεί', count: detail.backlog.quantity }] : []),
  ];
  const activeTab = tabs.some((t) => t.id === tab) ? tab : 'summary';

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-slate-200/70 px-4 pt-4 sm:px-6 sm:pt-5">
        <div className="flex flex-wrap items-center gap-2">
          <SkuColorizedText sku={detail.sku} suffix={detail.variantSuffix} gender={gender} className="text-lg sm:text-xl" />
          {detail.isMasterAggregate && (
            <span className="rounded-md bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-700 ring-1 ring-sky-100">
              Όλες οι παραλλαγές
            </span>
          )}
        </div>
        <SpecialCreationNote sku={detail.sku} note={detail.itemNote} className="mt-2" />

        {!detail.isMasterAggregate && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
            <span className="rounded-md bg-slate-100 px-2 py-0.5">
              <span className={finishColor}>{finish.name || 'Λουστρέ'}</span>
            </span>
            {stone.code && (
              <span className="rounded-md bg-slate-100 px-2 py-0.5">
                <span className={stoneColor}>{stone.name}</span>
              </span>
            )}
          </div>
        )}

        <nav className="-mb-px mt-4 flex gap-1 overflow-x-auto" aria-label="Ενότητες ανάλυσης">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-current={activeTab === t.id ? 'page' : undefined}
              className={`shrink-0 whitespace-nowrap border-b-2 px-3 pb-2.5 pt-1 text-xs font-bold transition-colors ${
                activeTab === t.id
                  ? 'border-emerald-600 text-slate-900'
                  : 'border-transparent text-slate-400 hover:text-slate-700'
              }`}
            >
              {t.label}
              {t.count != null && t.count > 0 && (
                <span className={`ml-1.5 rounded-full px-1.5 py-px text-[10px] tabular-nums ${activeTab === t.id ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                  {formatNumber(t.count)}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
        {activeTab === 'summary' && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-4">
              <Kpi label="Τεμάχια" value={formatNumber(summary.quantity)} />
              <Kpi label="Έσοδα" value={formatCurrency(summary.revenue)} />
              <Kpi label="Κέρδος" value={formatCurrency(summary.profit)} tone={summary.profit < 0 ? 'negative' : 'positive'} />
              <Kpi label="Περιθώριο" value={summary.revenue > 0 ? `${formatDecimal(summary.margin, 1)}%` : '—'} />
              <Kpi label="Πελάτες" value={formatNumber(summary.customerCount)} />
              <Kpi label="Παραγγελίες" value={formatNumber(summary.orderCount)} />
              <Kpi label="Αποστολές" value={formatNumber(summary.shipmentCount)} />
              <Kpi label="Ασήμι" value={`${formatDecimal(summary.silverWeightGrams, 1)} g`} />
            </div>

            {(summary.priceOverrideCount > 0 || summary.giftQuantity > 0 || summary.profit < 0) && (
              <div className="space-y-2">
                {summary.priceOverrideCount > 0 && (
                  <div className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 ring-1 ring-amber-100">
                    <AlertTriangle size={14} className="shrink-0 text-amber-500" />
                    {formatNumber(summary.priceOverrideCount)} γραμμ{summary.priceOverrideCount === 1 ? 'ή' : 'ές'} με χειροκίνητη τιμή
                  </div>
                )}
                {summary.giftQuantity > 0 && (
                  <div className="flex items-center gap-2 rounded-xl bg-fuchsia-50 px-3 py-2 text-xs font-semibold text-fuchsia-900 ring-1 ring-fuchsia-100">
                    <Gift size={14} className="shrink-0 text-fuchsia-500" />
                    {formatNumber(summary.giftQuantity)} τεμάχια δώρο (0 € έσοδα, το κόστος παραγωγής μετράει)
                  </div>
                )}
                {summary.profit < 0 && (
                  <div className="rounded-xl bg-rose-50 px-3 py-2.5 text-xs leading-relaxed text-rose-900 ring-1 ring-rose-100">
                    <p className="font-bold">Γιατί αρνητικό κέρδος;</p>
                    <p className="mt-0.5 font-medium text-rose-800/90">
                      {summary.giftQuantity > 0 && <span>{formatNumber(summary.giftQuantity)} τεμ. δώρο — το κόστος μετράει ως ζημία. </span>}
                      {summary.belowCostQuantity > 0 && <span>{formatNumber(summary.belowCostQuantity)} τεμ. πουλήθηκαν κάτω από το εκτιμώμενο κόστος. </span>}
                      {summary.giftQuantity === 0 && summary.belowCostQuantity === 0 && <span>Το συνολικό κόστος παραγωγής υπερβαίνει τα έσοδα.</span>}
                    </p>
                  </div>
                )}
              </div>
            )}

            <div>
              <SectionLabel>Κατανομή κόστους · {formatCurrency(costTotal)}</SectionLabel>
              <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100">
                {costTotal > 0 && COST_PARTS.map((part) => (
                  <div key={part.key} className={part.bar} style={{ width: `${(summary.costBreakdown[part.key] / costTotal) * 100}%` }} />
                ))}
              </div>
              <div className="mt-2.5 grid grid-cols-3 gap-2">
                {COST_PARTS.map((part) => (
                  <div key={part.key} className="min-w-0">
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${part.bar}`} />
                      {part.label}
                    </p>
                    <p className="truncate text-xs font-black tabular-nums text-slate-800">{formatCurrency(summary.costBreakdown[part.key])}</p>
                  </div>
                ))}
              </div>
            </div>

            <TimelineBars timeline={detail.timeline} />

            {detail.variantBreakdown && detail.variantBreakdown.length > 0 && (
              <div>
                <SectionLabel>Ανά παραλλαγή</SectionLabel>
                <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl ring-1 ring-slate-200/70">
                  {detail.variantBreakdown.map((row) => (
                    <button
                      key={row.key}
                      type="button"
                      onClick={() => onSelectVariant?.(row.variantSuffix, row.itemNote)}
                      className="flex w-full items-center justify-between gap-3 bg-white px-3.5 py-2.5 text-left transition-colors hover:bg-slate-50"
                    >
                      <div className="min-w-0">
                        <SkuColorizedText sku={detail.sku} suffix={row.variantSuffix} gender={gender} className="text-sm" />
                        <SpecialCreationNote sku={detail.sku} note={row.itemNote} compact className="mt-1" />
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-black tabular-nums text-slate-900">{formatNumber(row.quantity)} τεμ.</p>
                        <p className="text-[11px] font-semibold text-slate-400">{formatCurrency(row.revenue)}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {detail.sellers.length > 0 && (
              <div>
                <SectionLabel>Πλασιέδες</SectionLabel>
                <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl ring-1 ring-slate-200/70">
                  {detail.sellers.map((seller) => (
                    <div key={seller.id} className="flex items-center justify-between gap-3 bg-white px-3.5 py-2.5">
                      <span className="truncate text-sm font-bold text-slate-800">{seller.name}</span>
                      <div className="shrink-0 text-right">
                        <p className="text-xs font-black tabular-nums text-slate-900">{formatNumber(seller.quantity)} τεμ.</p>
                        <p className="text-[11px] text-slate-400">{formatCurrency(seller.revenue)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'customers' && (
          detail.customers.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">Δεν βρέθηκαν πελάτες.</p>
          ) : (
            <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl ring-1 ring-slate-200/70">
              {detail.customers.map((customer, index) => (
                <div key={customer.id} className="flex items-center gap-3 bg-white px-3.5 py-3">
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-black tabular-nums ${
                      index === 0 ? 'bg-amber-400 text-amber-950' : index === 1 ? 'bg-slate-300 text-slate-800' : index === 2 ? 'bg-orange-300 text-orange-950' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {formatNumber(index + 1)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-slate-900">{customer.name}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, customer.quantityShare)}%` }} />
                      </div>
                      <span className="shrink-0 text-[10px] font-bold tabular-nums text-slate-400">
                        {formatDecimal(customer.quantityShare, 1)}% · {formatNumber(customer.orderCount)} παραγγ.
                      </span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-black tabular-nums text-slate-900">{formatNumber(customer.quantity)} τεμ.</p>
                    <p className="text-[11px] font-semibold text-slate-500">{formatCurrency(customer.revenue)}</p>
                    <p className={`text-[10px] font-bold ${customer.profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {formatCurrency(customer.profit)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {activeTab === 'lines' && (
          <>
            <p className="mb-3 text-[11px] font-medium text-slate-400">Κάθε γραμμή είναι μία αποστολή ή πραγματοποιημένη πώληση αυτού του κωδικού.</p>
            {detail.lines.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">Δεν βρέθηκαν γραμμές πώλησης.</p>
            ) : (
              <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl ring-1 ring-slate-200/70">
                {detail.lines.map((line, index) => {
                  const dateStr = new Date(line.date).toLocaleDateString('el-GR', { day: 'numeric', month: 'short', year: 'numeric' });
                  const isGift = line.net <= 0.001;
                  const accent = isGift ? 'bg-fuchsia-400' : line.profit < 0 ? 'bg-rose-400' : 'bg-emerald-400';
                  return (
                    <div
                      key={`${line.orderId}-${line.shipmentId ?? 'legacy'}-${line.lineId ?? 'noline'}-${line.date}-${index}`}
                      className="relative bg-white py-3 pl-4 pr-3.5"
                    >
                      <span className={`absolute inset-y-2 left-0 w-1 rounded-r-full ${accent}`} aria-hidden />
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-slate-900">{line.customerName}</p>
                          <SpecialCreationNote sku={line.sku} note={line.itemNote} compact className="mt-1" />
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium text-slate-500">
                            <span className="inline-flex items-center gap-1"><Clock size={11} className="text-slate-400" />{dateStr}</span>
                            <span className="inline-flex items-center gap-1 font-mono"><Hash size={11} className="text-slate-400" />{line.orderId.slice(-8)}</span>
                            {line.shipmentNumber != null && (
                              <span className="inline-flex items-center gap-1"><Truck size={11} className="text-slate-400" />Αποστολή {formatNumber(line.shipmentNumber)}</span>
                            )}
                            {line.sellerName && (
                              <span className="inline-flex items-center gap-1"><User size={11} className="text-slate-400" />{line.sellerName}</span>
                            )}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-black tabular-nums text-slate-900">{formatNumber(line.quantity)} × {formatCurrency(line.unitPrice)}</p>
                          <p className="text-[11px] font-semibold text-slate-500">{formatCurrency(line.net)}</p>
                          <p className={`text-[10px] font-bold ${line.profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{formatCurrency(line.profit)}</p>
                        </div>
                      </div>
                      {(line.priceOverride || line.costWarning || isGift) && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {isGift && <span className="rounded-md bg-fuchsia-50 px-2 py-0.5 text-[10px] font-bold text-fuchsia-700">Δώρο (0 €)</span>}
                          {line.priceOverride && <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">Χειροκίνητη τιμή</span>}
                          {line.costWarning && <span className="rounded-md bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700">{line.costWarning}</span>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {activeTab === 'backlog' && (
          <div className="space-y-3">
            <div className="rounded-2xl bg-sky-50 px-4 py-3 ring-1 ring-sky-100">
              <p className="text-[10px] font-bold uppercase tracking-wide text-sky-600">Εκκρεμεί αποστολή</p>
              <p className="mt-0.5 text-lg font-black tabular-nums text-slate-900">
                {formatNumber(detail.backlog.quantity)} τεμ. · {formatCurrency(detail.backlog.net)}
              </p>
            </div>
            <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl ring-1 ring-slate-200/70">
              {detail.backlog.lines.map((line, index) => (
                <div key={`backlog-${line.orderId}-${index}`} className="flex items-start justify-between gap-3 bg-white px-3.5 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900">{line.customerName}</p>
                    <SpecialCreationNote sku={line.sku} note={line.itemNote} compact className="mt-1" />
                    <p className="mt-0.5 font-mono text-[11px] text-slate-400">#{line.orderId.slice(-8)}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-black tabular-nums text-slate-900">{formatNumber(line.quantity)} τεμ.</p>
                    <p className="text-[11px] font-semibold text-slate-500">{formatCurrency(line.net)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
