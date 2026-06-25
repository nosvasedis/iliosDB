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
} from 'lucide-react';
import { Gender } from '../../types';
import { formatCurrency } from '../../utils/pricingEngine';
import { getSkuFinishTextColor, getSkuStoneTextColor } from '../../utils/skuColoring';
import { getVariantComponents } from '../../utils/pricingEngine';
import SkuColorizedText from '../SkuColorizedText';
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

type DetailTab = 'summary' | 'customers' | 'lines' | 'backlog';

interface Props {
  detail: SkuVariantDetail | null;
  gender?: Gender;
  onSelectVariant?: (variantSuffix: string) => void;
}

function EmptyState() {
  return (
    <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-500">
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
    <div className="mt-4 space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Χρονοδιάγραμμα πωλήσεων</p>
      <div className="space-y-1.5">
        {timeline.map((point) => (
          <div key={point.monthKey} className="flex items-center gap-2">
            <span className="w-14 shrink-0 text-[10px] font-bold text-slate-500">
              {formatMonthLabel(point.monthKey)}
            </span>
            <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${Math.max(6, (point.quantity / maxQty) * 100)}%` }}
              />
            </div>
            <span className="w-8 shrink-0 text-right text-[10px] font-black tabular-nums text-slate-600">
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

  const tabs: { id: DetailTab; label: string; count?: number }[] = [
    { id: 'summary', label: 'Σύνοψη' },
    { id: 'customers', label: 'Πελάτες', count: detail.customers.length },
    { id: 'lines', label: 'Γραμμές', count: detail.lines.length },
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
            <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">
              Όλες οι παραλλαγές
            </span>
          )}
        </div>

        {!detail.isMasterAggregate && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold ${finishBadge}`}>
              <span className={finishColor}>{finish.name || 'Λουστρέ'}</span>
            </span>
            {stone.code && (
              <span className="rounded-md border border-violet-100 bg-violet-50 px-2 py-0.5 text-[10px] font-bold">
                <span className={stoneColor}>{stone.name}</span>
              </span>
            )}
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-1.5">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all ${
                tab === t.id
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {t.label}
              {t.count != null && t.count > 0 && (
                <span className={`ml-1 ${tab === t.id ? 'text-emerald-100' : 'text-slate-400'}`}>
                  ({t.count})
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
        {tab === 'summary' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {[
                { label: 'Τεμάχια', value: String(summary.quantity), icon: Package },
                { label: 'Έσοδα', value: formatCurrency(summary.revenue), icon: TrendingUp },
                { label: 'Κέρδος', value: formatCurrency(summary.profit), icon: TrendingUp },
                { label: 'Περιθώριο', value: `${summary.margin.toFixed(1)}%`, icon: TrendingUp },
                { label: 'Πελάτες', value: String(summary.customerCount), icon: Users },
                { label: 'Παραγγελίες', value: String(summary.orderCount), icon: Hash },
                { label: 'Αποστολές', value: String(summary.shipmentCount), icon: Truck },
                { label: 'Ασήμι', value: `${summary.silverWeightGrams.toFixed(1)} g`, icon: Coins },
              ].map(({ label, value, icon: Icon }) => (
                <div key={label} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
                  <div className="mb-0.5 flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-slate-400">
                    <Icon size={10} />
                    {label}
                  </div>
                  <p className="text-sm font-black tabular-nums text-slate-800">{value}</p>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-slate-100 bg-white p-3">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Κατανομή κόστους</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <Coins size={14} className="mx-auto mb-1 text-slate-400" />
                  <p className="text-[10px] font-bold text-slate-500">Ασήμι</p>
                  <p className="text-xs font-black text-slate-800">{formatCurrency(summary.costBreakdown.silver)}</p>
                </div>
                <div>
                  <Hammer size={14} className="mx-auto mb-1 text-slate-400" />
                  <p className="text-[10px] font-bold text-slate-500">Εργασία</p>
                  <p className="text-xs font-black text-slate-800">{formatCurrency(summary.costBreakdown.labor)}</p>
                </div>
                <div>
                  <Gem size={14} className="mx-auto mb-1 text-slate-400" />
                  <p className="text-[10px] font-bold text-slate-500">Υλικά</p>
                  <p className="text-xs font-black text-slate-800">{formatCurrency(summary.costBreakdown.materials)}</p>
                </div>
              </div>
            </div>

            {summary.priceOverrideCount > 0 && (
              <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
                <AlertTriangle size={14} />
                {summary.priceOverrideCount} γραμμ{summary.priceOverrideCount === 1 ? 'ή' : 'ές'} με χειροκίνητη τιμή
              </div>
            )}

            {summary.profit < 0 && (
              <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2.5 text-xs leading-relaxed text-red-800">
                <p className="font-bold">Γιατί αρνητικό κέρδος;</p>
                <p className="mt-1 font-medium text-red-700/90">
                  {summary.giftQuantity > 0 && (
                    <span>{summary.giftQuantity} τεμ. δώρο (τιμή 0€) — το κόστος παραγωγής μετράει ως ζημία. </span>
                  )}
                  {summary.belowCostQuantity > 0 && (
                    <span>{summary.belowCostQuantity} τεμ. πωλήθηκαν κάτω από εκτιμώμενο κόστος (έκπτωση ή χειροκίνητη τιμή). </span>
                  )}
                  {summary.giftQuantity === 0 && summary.belowCostQuantity === 0 && (
                    <span>Το συνολικό κόστος παραγωγής υπερβαίνει τα έσοδα της περιόδου.</span>
                  )}
                </p>
              </div>
            )}

            <TimelineBars timeline={detail.timeline} />

            {detail.variantBreakdown && detail.variantBreakdown.length > 0 && (
              <div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  Ανά παραλλαγή
                </p>
                <div className="space-y-1.5">
                  {detail.variantBreakdown.map((row) => (
                    <button
                      key={row.variantSuffix || '__base__'}
                      type="button"
                      onClick={() => onSelectVariant?.(row.variantSuffix)}
                      className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-100 bg-white px-3 py-2.5 text-left transition-all hover:border-emerald-200 hover:bg-emerald-50/50"
                    >
                      <SkuColorizedText
                        sku={detail.sku}
                        suffix={row.variantSuffix}
                        gender={gender}
                        className="text-sm"
                      />
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-black text-slate-800">{row.quantity} τεμ.</p>
                        <p className="text-[10px] font-semibold text-slate-400">{formatCurrency(row.revenue)}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {detail.sellers.length > 0 && (
              <div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Πλασιέδες</p>
                <div className="space-y-1.5">
                  {detail.sellers.map((seller) => (
                    <div
                      key={seller.id}
                      className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2"
                    >
                      <span className="text-sm font-bold text-slate-700">{seller.name}</span>
                      <div className="text-right">
                        <p className="text-xs font-black text-slate-800">{seller.quantity} τεμ.</p>
                        <p className="text-[10px] text-slate-400">{formatCurrency(seller.revenue)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'customers' && (
          <div className="space-y-2">
            {detail.customers.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">Δεν βρέθηκαν πελάτες.</p>
            ) : (
              detail.customers.map((customer, index) => (
                <div
                  key={customer.id}
                  className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-900">
                        #{index + 1} {customer.name}
                      </p>
                      <p className="mt-0.5 text-[10px] font-semibold text-slate-400">
                        {customer.orderCount} παραγγελί{customer.orderCount === 1 ? 'α' : 'ες'} · {customer.quantityShare.toFixed(1)}% του συνόλου
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-black text-slate-800">{customer.quantity} τεμ.</p>
                      <p className="text-xs font-semibold text-slate-500">{formatCurrency(customer.revenue)}</p>
                      <p className={`text-[10px] font-bold ${customer.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        Κέρδος {formatCurrency(customer.profit)}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'lines' && (
          <div className="space-y-2">
            {detail.lines.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">Δεν βρέθηκαν γραμμές πώλησης.</p>
            ) : (
              detail.lines.map((line, index) => {
                const dateStr = new Date(line.date).toLocaleDateString('el-GR', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                });
                return (
                  <div
                    key={`${line.orderId}-${line.shipmentId ?? 'legacy'}-${index}`}
                    className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-slate-900">{line.customerName}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] font-semibold text-slate-400">
                          <span className="flex items-center gap-0.5">
                            <Clock size={9} />
                            {dateStr}
                          </span>
                          <span className="font-mono">#{line.orderId.slice(-8)}</span>
                          {line.shipmentNumber != null && (
                            <span className="flex items-center gap-0.5">
                              <Truck size={9} />
                              Αποστολή #{line.shipmentNumber}
                            </span>
                          )}
                          {line.sellerName && (
                            <span className="flex items-center gap-0.5">
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
                        <p className="text-xs font-semibold text-slate-500">{formatCurrency(line.net)}</p>
                        <p className={`text-[10px] font-bold ${line.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {formatCurrency(line.profit)}
                        </p>
                      </div>
                    </div>
                    {(line.priceOverride || line.costWarning || line.net <= 0.001) && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {line.net <= 0.001 && (
                          <span className="rounded-md bg-fuchsia-50 px-2 py-0.5 text-[9px] font-bold text-fuchsia-700">
                            Δώρο (0€)
                          </span>
                        )}
                        {line.priceOverride && (
                          <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[9px] font-bold text-amber-700">
                            Χειροκίνητη τιμή
                          </span>
                        )}
                        {line.costWarning && (
                          <span className="rounded-md bg-red-50 px-2 py-0.5 text-[9px] font-bold text-red-700">
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
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-500">Εκκρεμεί αποστολή</p>
              <p className="mt-1 text-lg font-black text-indigo-900">
                {detail.backlog.quantity} τεμ. · {formatCurrency(detail.backlog.net)}
              </p>
            </div>
            {detail.backlog.lines.map((line, index) => (
              <div
                key={`backlog-${line.orderId}-${index}`}
                className="rounded-xl border border-indigo-100 bg-white p-3"
              >
                <p className="text-sm font-black text-slate-900">{line.customerName}</p>
                <p className="mt-0.5 text-[10px] text-slate-400">
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
