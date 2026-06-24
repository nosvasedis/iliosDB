import React, { useMemo, useState, useCallback, useEffect } from 'react';
import {
  X,
  Trophy,
  Search,
  Copy,
  Check,
  TrendingUp,
  Package,
  BarChart3,
  Sparkles,
  ExternalLink,
  ArrowUpDown,
} from 'lucide-react';
import { formatCurrency } from '../../utils/pricingEngine';
import { getSkuFinishTextColor, getSkuStoneTextColor } from '../../utils/skuColoring';
import SkuColorizedText from '../SkuColorizedText';
import {
  type EnrichedVariantAnalyticsRow,
  type VariantAnalyticsSort,
  filterAndSortEnrichedVariants,
} from '../../features/dashboard/dashboardAnalysisViewModels';

const FINISH_BADGE: Record<string, string> = {
  '': 'bg-slate-100 text-slate-600 border-slate-200',
  P: 'bg-slate-100 text-slate-700 border-slate-300',
  X: 'bg-amber-50 text-amber-800 border-amber-200',
  D: 'bg-orange-50 text-orange-800 border-orange-200',
  H: 'bg-cyan-50 text-cyan-800 border-cyan-200',
};

const RANK_STYLES: Record<number, string> = {
  1: 'bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-amber-200/60',
  2: 'bg-gradient-to-br from-slate-300 to-slate-500 text-white shadow-slate-200/60',
  3: 'bg-gradient-to-br from-orange-300 to-orange-500 text-white shadow-orange-200/60',
};

interface Props {
  rows: EnrichedVariantAnalyticsRow[];
  periodLabel: string;
  shippedPieces: number;
  onClose: () => void;
  onOpenRegistry?: () => void;
}

function RankBadge({ rank }: { rank: number }) {
  const style = RANK_STYLES[rank];
  if (style) {
    return (
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-black shadow-md ${style}`}>
        #{rank}
      </div>
    );
  }
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-sm font-black text-slate-500">
      #{rank}
    </div>
  );
}

export default function TopVariantsAnalyticsModal({
  rows,
  periodLabel,
  shippedPieces,
  onClose,
  onOpenRegistry,
}: Props) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<VariantAnalyticsSort>('quantity');
  const [copiedSku, setCopiedSku] = useState<string | null>(null);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const displayed = useMemo(
    () => filterAndSortEnrichedVariants(rows, query, sort),
    [rows, query, sort],
  );

  const summary = useMemo(() => {
    const totalQty = rows.reduce((s, r) => s + r.quantity, 0);
    const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
    const totalProfit = rows.reduce((s, r) => s + r.profit, 0);
    return { totalQty, totalRevenue, totalProfit, variantCount: rows.length };
  }, [rows]);

  const handleCopy = useCallback(async (fullSku: string) => {
    try {
      await navigator.clipboard.writeText(fullSku);
      setCopiedSku(fullSku);
      window.setTimeout(() => setCopiedSku((current) => (current === fullSku ? null : current)), 1600);
    } catch {
      /* clipboard unavailable */
    }
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-900/65 p-3 backdrop-blur-sm sm:p-6 animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-label="Αναλυτική κατάταξη κορυφαίων SKU"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-2xl animate-in zoom-in-95 slide-in-from-bottom-4 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative overflow-hidden border-b border-slate-100 bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-900 px-6 py-5 text-white">
          <div className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-emerald-400/20 blur-3xl" />
          <div className="pointer-events-none absolute bottom-0 left-1/3 h-24 w-24 rounded-full bg-amber-400/10 blur-2xl" />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-white/10 p-3 backdrop-blur-sm">
                <Trophy size={26} className="text-amber-300" />
              </div>
              <div>
                <h2 className="text-xl font-black tracking-tight sm:text-2xl">Κορυφαία SKU — Πλήρης Ανάλυση</h2>
                <p className="mt-1 text-sm font-medium text-white/70">
                  Top {rows.length} παραλλαγές · {periodLabel.toLowerCase()} · αποστολές & μερικές παραδόσεις
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full bg-white/10 p-2 text-white/80 transition-all hover:scale-105 hover:bg-white/20 hover:text-white"
              aria-label="Κλείσιμο"
            >
              <X size={20} />
            </button>
          </div>

          <div className="relative mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Παραλλαγές', value: String(summary.variantCount), icon: BarChart3 },
              { label: 'Τεμάχια', value: String(summary.totalQty), icon: Package },
              { label: 'Έσοδα', value: formatCurrency(summary.totalRevenue), icon: TrendingUp },
              { label: 'Κέρδος', value: formatCurrency(summary.totalProfit), icon: Sparkles },
            ].map(({ label, value, icon: Icon }) => (
              <div
                key={label}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm transition-transform hover:scale-[1.02]"
              >
                <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-white/50">
                  <Icon size={12} />
                  {label}
                </div>
                <p className="text-lg font-black tabular-nums">{value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 bg-slate-50/80 px-5 py-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Αναζήτηση SKU, φινίρισμα, πέτρα, κατηγορία…"
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm font-semibold text-slate-700 outline-none transition-all focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
            />
          </div>
          <div className="relative">
            <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as VariantAnalyticsSort)}
              className="cursor-pointer appearance-none rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-8 text-sm font-bold text-slate-600 outline-none transition-all hover:border-slate-300"
            >
              <option value="quantity">Ταξινόμηση: Τεμάχια</option>
              <option value="revenue">Ταξινόμηση: Έσοδα</option>
              <option value="profit">Ταξινόμηση: Κέρδος</option>
              <option value="margin">Ταξινόμηση: Περιθώριο %</option>
            </select>
          </div>
          {onOpenRegistry && (
            <button
              type="button"
              onClick={onOpenRegistry}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition-all hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800 active:scale-[0.98]"
            >
              <ExternalLink size={15} />
              Μητρώο
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {displayed.length === 0 ? (
            <div className="py-16 text-center text-sm italic text-slate-400">
              Δεν βρέθηκαν αποτελέσματα για «{query}».
            </div>
          ) : (
            <div className="space-y-2.5">
              {displayed.map((row, index) => {
                const rowKey = `${row.sku}::${row.variantSuffix}`;
                const isHovered = hoveredKey === rowKey;
                const finishBadge = FINISH_BADGE[row.finishCode] || FINISH_BADGE[''];
                const stoneColor = getSkuStoneTextColor(row.stoneCode);
                const finishColor = getSkuFinishTextColor(row.finishCode);

                return (
                  <div
                    key={rowKey}
                    className={`group relative overflow-hidden rounded-2xl border bg-white p-4 transition-all duration-200 sm:p-4 ${
                      isHovered
                        ? 'border-emerald-300 shadow-lg shadow-emerald-100/50 -translate-y-0.5'
                        : 'border-slate-100 shadow-sm hover:border-slate-200'
                    }`}
                    style={{ animationDelay: `${Math.min(index, 12) * 30}ms` }}
                    onMouseEnter={() => setHoveredKey(rowKey)}
                    onMouseLeave={() => setHoveredKey(null)}
                  >
                    <div
                      className="absolute inset-y-0 left-0 w-1 rounded-l-2xl bg-gradient-to-b from-emerald-400 to-emerald-600 opacity-0 transition-opacity group-hover:opacity-100"
                      style={{ opacity: row.rank <= 3 ? 1 : undefined }}
                    />

                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <RankBadge rank={row.rank} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <SkuColorizedText
                              sku={row.sku}
                              suffix={row.variantSuffix}
                              gender={row.gender}
                              className="text-base sm:text-lg"
                            />
                            <button
                              type="button"
                              onClick={() => handleCopy(row.fullSku)}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500 opacity-0 transition-all hover:border-slate-300 hover:text-slate-800 group-hover:opacity-100"
                              title="Αντιγραφή πλήρους κωδικού"
                            >
                              {copiedSku === row.fullSku ? (
                                <>
                                  <Check size={12} className="text-emerald-600" />
                                  <span className="text-emerald-600">OK</span>
                                </>
                              ) : (
                                <>
                                  <Copy size={12} />
                                  Copy
                                </>
                              )}
                            </button>
                          </div>

                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span className={`rounded-lg border px-2 py-0.5 text-[11px] font-bold ${finishBadge}`}>
                              <span className={finishColor}>{row.finishName}</span>
                            </span>
                            {row.stoneCode && (
                              <span className="rounded-lg border border-violet-100 bg-violet-50 px-2 py-0.5 text-[11px] font-bold">
                                <span className={stoneColor}>{row.stoneName}</span>
                              </span>
                            )}
                            <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                              {row.category.split(' ')[0]}
                            </span>
                            {row.collectionLabel !== '—' && (
                              <span className="rounded-lg bg-fuchsia-50 px-2 py-0.5 text-[11px] font-bold text-fuchsia-700">
                                {row.collectionLabel}
                              </span>
                            )}
                          </div>

                          <div className="mt-3">
                            <div className="mb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                              <span>Μερίδιο πωλήσεων</span>
                              <span>{row.quantityShare.toFixed(1)}%</span>
                            </div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all duration-500"
                                style={{ width: `${Math.max(4, row.peakShare)}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="grid shrink-0 grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4 lg:text-right">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Τεμ.</p>
                          <p className="text-lg font-black text-slate-900 tabular-nums">{row.quantity}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Έσοδα</p>
                          <p className="text-sm font-black text-slate-800 tabular-nums">{formatCurrency(row.revenue)}</p>
                          <p className="text-[10px] font-semibold text-slate-400">
                            μ.ο. {formatCurrency(row.avgUnitRevenue)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Κέρδος</p>
                          <p className={`text-sm font-black tabular-nums ${row.profit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                            {formatCurrency(row.profit)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Περιθ.</p>
                          <p className={`text-sm font-black tabular-nums ${row.margin >= 30 ? 'text-emerald-600' : row.margin >= 15 ? 'text-amber-600' : 'text-slate-600'}`}>
                            {row.margin.toFixed(1)}%
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t border-slate-100 bg-slate-50 px-5 py-4 text-center text-xs font-medium text-slate-500">
          Μετράει κάθε <strong className="text-slate-700">αποσταλμένο τεμάχιο</strong> (πλήρεις & μερικές αποστολές) για{' '}
          {periodLabel.toLowerCase()} — σύνολο {shippedPieces} τεμ. στην περίοδο. Κωδικοί κανονικοποιούνται (κεφαλαία, διαχωρισμός master/suffix).
        </div>
      </div>
    </div>
  );
}
