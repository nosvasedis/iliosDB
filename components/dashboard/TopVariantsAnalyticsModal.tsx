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
  ImageIcon,
} from 'lucide-react';
import { resolveImageUrl } from '../../lib/supabase';
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

const SORT_OPTIONS: { id: VariantAnalyticsSort; label: string }[] = [
  { id: 'quantity', label: 'Τεμάχια' },
  { id: 'revenue', label: 'Έσοδα' },
  { id: 'profit', label: 'Κέρδος' },
  { id: 'margin', label: 'Περιθώριο' },
];

const RANK_STYLES: Record<number, string> = {
  1: 'bg-amber-500 text-white',
  2: 'bg-slate-400 text-white',
  3: 'bg-orange-400 text-white',
};

interface Props {
  rows: EnrichedVariantAnalyticsRow[];
  periodLabel: string;
  shippedPieces: number;
  onClose: () => void;
  onOpenRegistry?: () => void;
}

function ProductThumb({ imageUrl, sku }: { imageUrl: string | null; sku: string }) {
  const src = resolveImageUrl(imageUrl);
  return (
    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-slate-100 bg-slate-50 shadow-sm">
      {src ? (
        <img src={src} alt={sku} loading="lazy" decoding="async" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-slate-300">
          <ImageIcon size={22} />
        </div>
      )}
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const medal = RANK_STYLES[rank];
  if (medal) {
    return (
      <span className={`inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded-lg px-1.5 text-xs font-black ${medal}`}>
        {rank}
      </span>
    );
  }
  return (
    <span className="inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded-lg bg-slate-100 text-xs font-black text-slate-500">
      {rank}
    </span>
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
      className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-900/60 p-3 backdrop-blur-sm sm:p-5 animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-label="Λεπτομερής κατάταξη κορυφαίων SKU"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — matches AuditLogs / AnalysisExplainer pattern */}
        <div className="shrink-0 border-b border-slate-100 bg-gradient-to-r from-emerald-50/80 to-slate-50 px-5 py-5 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <div className="shrink-0 rounded-xl bg-emerald-100 p-2.5 text-emerald-700">
                <Trophy size={22} />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-bold leading-snug text-slate-900 sm:text-xl">
                  Κορυφαία SKU
                </h2>
                <p className="mt-0.5 text-sm font-medium text-slate-500">
                  Λεπτομερής κατάταξη έως {rows.length} παραλλαγές · {periodLabel.toLowerCase()}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-200/60 hover:text-slate-700"
              aria-label="Κλείσιμο"
            >
              <X size={20} />
            </button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            {[
              { label: 'Παραλλαγές', value: String(summary.variantCount), icon: BarChart3 },
              { label: 'Τεμάχια', value: String(summary.totalQty), icon: Package },
              { label: 'Έσοδα', value: formatCurrency(summary.totalRevenue), icon: TrendingUp },
              { label: 'Εκτιμ. κέρδος', value: formatCurrency(summary.totalProfit), icon: Sparkles },
            ].map(({ label, value, icon: Icon }) => (
              <div
                key={label}
                className="rounded-2xl border border-slate-100 bg-white px-3 py-2.5 shadow-sm sm:px-4 sm:py-3"
              >
                <div className="mb-0.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  <Icon size={11} />
                  {label}
                </div>
                <p className="truncate text-base font-black tabular-nums text-slate-800 sm:text-lg">{value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Toolbar */}
        <div className="shrink-0 space-y-3 border-b border-slate-100 bg-white px-5 py-3 sm:px-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Αναζήτηση κωδικού, φινιρίσματος, πέτρας, κατηγορίας…"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm font-medium text-slate-700 outline-none transition-all focus:border-emerald-300 focus:bg-white focus:ring-4 focus:ring-emerald-500/10"
              />
            </div>
            {onOpenRegistry && (
              <button
                type="button"
                onClick={onOpenRegistry}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition-all hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-800"
              >
                <ExternalLink size={15} />
                Άνοιγμα μητρώου
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-400">Ταξινόμηση κατά</span>
            {SORT_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setSort(option.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                  sort === option.id
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Column headers — desktop */}
        <div className="hidden shrink-0 border-b border-slate-100 bg-slate-50/80 px-5 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 lg:grid lg:grid-cols-[2.5rem_3.5rem_minmax(0,1fr)_repeat(4,minmax(5rem,auto))] lg:items-center lg:gap-3 lg:px-6">
          <span>#</span>
          <span className="sr-only">Εικόνα</span>
          <span>Προϊόν</span>
          <span className="text-right">Τεμάχια</span>
          <span className="text-right">Έσοδα</span>
          <span className="text-right">Κέρδος</span>
          <span className="text-right">Περιθώριο</span>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto bg-slate-50/50 px-3 py-3 sm:px-4 lg:px-5">
          {displayed.length === 0 ? (
            <div className="py-16 text-center text-sm text-slate-400">
              Δεν βρέθηκαν αποτελέσματα για «{query}».
            </div>
          ) : (
            <div className="space-y-2">
              {displayed.map((row) => {
                const rowKey = `${row.sku}::${row.variantSuffix}`;
                const finishBadge = FINISH_BADGE[row.finishCode] || FINISH_BADGE[''];
                const stoneColor = getSkuStoneTextColor(row.stoneCode);
                const finishColor = getSkuFinishTextColor(row.finishCode);
                const isCopied = copiedSku === row.fullSku;

                return (
                  <div
                    key={rowKey}
                    className="group rounded-2xl border border-slate-100 bg-white p-3 shadow-sm transition-all hover:border-emerald-200 hover:shadow-md sm:p-3.5 lg:grid lg:grid-cols-[2.5rem_3.5rem_minmax(0,1fr)_repeat(4,minmax(5rem,auto))] lg:items-center lg:gap-3"
                  >
                    <div className="flex gap-3 lg:contents">
                      <div className="flex shrink-0 flex-col items-center gap-2 pt-0.5 lg:block">
                        <RankBadge rank={row.rank} />
                      </div>

                      <ProductThumb imageUrl={row.image} sku={row.sku} />

                      <div className="min-w-0 flex-1 lg:mt-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <SkuColorizedText
                          sku={row.sku}
                          suffix={row.variantSuffix}
                          gender={row.gender}
                          className="text-sm sm:text-base"
                        />
                        <button
                          type="button"
                          onClick={() => handleCopy(row.fullSku)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold text-slate-500 opacity-0 transition-all hover:border-slate-300 hover:text-slate-800 group-hover:opacity-100"
                          title="Αντιγραφή κωδικού"
                        >
                          {isCopied ? (
                            <>
                              <Check size={12} className="text-emerald-600" />
                              <span className="text-emerald-600">Αντιγράφηκε</span>
                            </>
                          ) : (
                            <>
                              <Copy size={12} />
                              Αντιγραφή
                            </>
                          )}
                        </button>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold ${finishBadge}`}>
                          <span className={finishColor}>{row.finishName}</span>
                        </span>
                        {row.stoneCode && (
                          <span className="rounded-md border border-violet-100 bg-violet-50 px-2 py-0.5 text-[10px] font-bold">
                            <span className={stoneColor}>{row.stoneName}</span>
                          </span>
                        )}
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                          {row.category.split(' ')[0]}
                        </span>
                        {row.collectionLabel !== '—' && (
                          <span className="max-w-[10rem] truncate rounded-md bg-fuchsia-50 px-2 py-0.5 text-[10px] font-bold text-fuchsia-700">
                            {row.collectionLabel}
                          </span>
                        )}
                      </div>

                      <div className="mt-2 lg:hidden">
                        <div className="mb-1 flex justify-between text-[10px] font-bold text-slate-400">
                          <span>Μερίδιο στη λίστα</span>
                          <span>{row.quantityShare.toFixed(1)}%</span>
                        </div>
                        <div className="h-1 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-emerald-500 transition-all"
                            style={{ width: `${Math.max(4, row.peakShare)}%` }}
                          />
                        </div>
                      </div>

                      {/* Mobile metrics */}
                      <div className="mt-3 grid grid-cols-2 gap-2 text-sm lg:hidden">
                        <div className="rounded-xl bg-slate-50 p-2">
                          <p className="text-[10px] font-bold text-slate-400">Τεμάχια</p>
                          <p className="font-black text-slate-900">{row.quantity}</p>
                        </div>
                        <div className="rounded-xl bg-slate-50 p-2">
                          <p className="text-[10px] font-bold text-slate-400">Έσοδα</p>
                          <p className="font-black text-slate-900">{formatCurrency(row.revenue)}</p>
                        </div>
                        <div className="rounded-xl bg-slate-50 p-2">
                          <p className="text-[10px] font-bold text-slate-400">Κέρδος</p>
                          <p className={`font-black ${row.profit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                            {formatCurrency(row.profit)}
                          </p>
                        </div>
                        <div className="rounded-xl bg-slate-50 p-2">
                          <p className="text-[10px] font-bold text-slate-400">Περιθώριο</p>
                          <p className="font-black text-slate-800">{row.margin.toFixed(1)}%</p>
                        </div>
                      </div>
                    </div>
                    </div>

                    {/* Desktop metrics */}
                    <div className="hidden text-right lg:block">
                      <p className="text-base font-black tabular-nums text-slate-900">{row.quantity}</p>
                      <p className="text-[10px] font-semibold text-slate-400">{row.quantityShare.toFixed(1)}% του συνόλου</p>
                    </div>
                    <div className="hidden text-right lg:block">
                      <p className="text-sm font-black tabular-nums text-slate-800">{formatCurrency(row.revenue)}</p>
                      <p className="text-[10px] font-semibold text-slate-400">μέση {formatCurrency(row.avgUnitRevenue)}</p>
                    </div>
                    <div className="hidden text-right lg:block">
                      <p className={`text-sm font-black tabular-nums ${row.profit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                        {formatCurrency(row.profit)}
                      </p>
                    </div>
                    <div className="hidden text-right lg:block">
                      <p className={`text-sm font-black tabular-nums ${row.margin >= 30 ? 'text-emerald-600' : row.margin >= 15 ? 'text-amber-600' : 'text-slate-600'}`}>
                        {row.margin.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-slate-100 bg-slate-50 px-5 py-4 sm:flex sm:items-center sm:justify-between sm:gap-4">
          <p className="text-center text-xs font-medium leading-relaxed text-slate-500 sm:text-left">
            Μετρούνται τα <strong className="font-bold text-slate-700">αποσταλμένα τεμάχια</strong> της περιόδου
            ({periodLabel.toLowerCase()}), συμπεριλαμβανομένων μερικών αποστολών — σύνολο{' '}
            <strong className="font-bold text-slate-700">{shippedPieces}</strong> τεμάχια.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="mt-3 w-full shrink-0 rounded-xl bg-slate-900 px-6 py-2.5 text-sm font-bold text-white transition-colors hover:bg-black sm:mt-0 sm:w-auto"
          >
            Κλείσιμο
          </button>
        </div>
      </div>
    </div>
  );
}
