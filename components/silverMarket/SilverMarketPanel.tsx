import { ArrowDownRight, ArrowUpRight, ChartNoAxesCombined, ChevronDown, RefreshCw } from 'lucide-react';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { useSilverMarket } from '../../hooks/api/useSilverMarket';
import type { SilverRange } from '../../lib/silverMarketContract';
import { formatDecimal } from '../../utils/numberFormat';
import SilverHistoryChart, { formatMarketTime } from './SilverHistoryChart';

const RANGES: Array<{ value: SilverRange; label: string; compact: string }> = [
  { value: '24h', label: '24 ώρες', compact: '24 ώρες' },
  { value: '7d', label: '7 ημέρες', compact: '7 ημ.' },
  { value: '30d', label: '30 ημέρες', compact: '30 ημ.' },
  { value: '90d', label: '90 ημέρες', compact: '90 ημ.' },
  { value: '6m', label: '6 μήνες', compact: '6 μήνες' },
  { value: '1y', label: '1 έτος', compact: '1 έτος' },
];
const INTERVAL_LABEL = { '15m': 'Ανά 15 λεπτά', '1h': 'Ανά ώρα', '4h': 'Ανά 4 ώρες', '1d': 'Ημερήσια' };
const QUOTE_MAX_AGE_MS = 5 * 60_000;

const priceText = (value: number) => `${formatDecimal(value, 3)} €/g`;
const signed = (value: number, precision: number) => {
  const rounded = Number(value.toFixed(precision));
  return `${rounded > 0 ? '+' : ''}${formatDecimal(rounded, precision)}`;
};

function Price({ value }: { value?: number }) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return <span className="text-xl font-bold text-slate-500">—</span>;
  }
  return (
    <div className="flex flex-wrap items-baseline gap-x-1.5 tabular-nums text-slate-900">
      <span className="text-[clamp(1.45rem,4vw,2.15rem)] leading-tight font-bold tracking-tight">{formatDecimal(value, 3)}</span>
      <span className="text-xs font-semibold text-slate-600">€/g</span>
    </div>
  );
}

export default function SilverMarketPanel({ savedPrice, controls }: { savedPrice?: number; controls?: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const [range, setRange] = useState<SilverRange>('7d');
  const [expiredQuote, setExpiredQuote] = useState<string>();
  const titleId = useId();
  const historyId = useId();
  const fromSettings = controls != null;
  const full = expanded || fromSettings;
  const { quote, history, online, canRefresh } = useSilverMarket(full ? range : '7d');
  const quotedAt = quote.data?.quotedAt;

  useEffect(() => {
    if (!quotedAt) return;
    const wait = Date.parse(quotedAt) + QUOTE_MAX_AGE_MS - Date.now();
    if (wait <= 0) return;
    const timeout = window.setTimeout(() => setExpiredQuote(quotedAt), wait);
    return () => window.clearTimeout(timeout);
  }, [quotedAt]);

  const quoteStale = quote.data && (quote.data.stale || !online || quote.isError
    || expiredQuote === quotedAt || Date.now() - Date.parse(quote.data.quotedAt) >= QUOTE_MAX_AGE_MS);
  const historyStale = history.data && (history.data.stale || !online || history.isError);
  const marketPrice = quote.data?.priceEurPerGram;
  const difference = marketPrice !== undefined && savedPrice !== undefined && savedPrice > 0 && Number.isFinite(savedPrice)
    ? marketPrice - savedPrice : undefined;
  const movementIcon = difference > 0 ? <ArrowUpRight size={13} /> : difference < 0 ? <ArrowDownRight size={13} /> : null;
  const series = history.data;
  const points = series?.points ?? [];
  const visibleHistory = points.length > 1;
  const first = points[0];
  const last = points[points.length - 1];
  const refreshing = quote.isFetching || history.isFetching;

  return (
    <section aria-labelledby={titleId} className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xs sm:p-5">
      <header className="mb-3.5 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-800" aria-hidden="true">
            <ChartNoAxesCombined size={18} />
          </span>
          <h2 id={titleId} className="text-lg font-bold tracking-tight text-slate-900">Ασήμι</h2>
        </div>
        <button
          type="button" disabled={!canRefresh || refreshing}
          onClick={() => { void quote.refetch(); void history.refetch(); }}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-teal-700 disabled:opacity-60"
        >
          <RefreshCw size={14} className={refreshing ? 'motion-safe:animate-spin' : undefined} aria-hidden="true" />
          Ανανέωση αγοράς
        </button>
      </header>

      <div className={`grid min-w-0 grid-cols-2 gap-2.5 sm:gap-3 ${full ? '' : 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.1fr)]'}`}>
        <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-3 sm:px-4">
          <p className="text-xs font-semibold text-slate-700 sm:text-sm">Τιμή προγράμματος</p>
          <Price value={savedPrice} />
          <p className="mt-1 text-xs text-slate-600">Βάση κοστολόγησης</p>
        </div>
        <div className="min-w-0 rounded-xl border border-teal-200 bg-linear-to-br from-teal-50 to-white px-2.5 py-3 sm:px-4">
          <p className="text-xs font-semibold text-teal-900 sm:text-sm">Τιμή αγοράς <span className="block sm:inline">· XAG spot</span></p>
          <Price value={marketPrice} />
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-600">
            {quote.data ? (
              <>
                {quoteStale && <span className="font-semibold text-amber-800" role="status">Τελευταία διαθέσιμη</span>}
                <time dateTime={quotedAt} title="Ώρα Ελλάδας">{formatMarketTime(quotedAt)}</time>
                <a href="https://gold-api.com/assets/silver" target="_blank" rel="noreferrer" className="underline underline-offset-2">Gold API</a>
              </>
            ) : (
              <span role="status">{quote.isLoading ? 'Φόρτωση τιμής…' : online ? 'Η τιμή αγοράς δεν είναι διαθέσιμη' : 'Εκτός σύνδεσης'}</span>
            )}
          </div>
        </div>

        {!full && (
          <div className="col-span-2 min-w-0 rounded-xl border border-slate-200 px-3 py-2 lg:col-span-1">
            <p className="text-xs font-semibold text-slate-600">Πορεία 7 ημερών</p>
            {visibleHistory ? <SilverHistoryChart series={series} compact /> : (
              <p className="flex h-14 items-center text-xs text-slate-600">
                {history.isLoading ? 'Φόρτωση ιστορικού…' : 'Δεν υπάρχουν διαθέσιμα σημεία για προεπισκόπηση'}
              </p>
            )}
            {visibleHistory && historyStale && <p className="text-xs font-semibold text-amber-800">Τελευταίο διαθέσιμο ιστορικό</p>}
          </div>
        )}
      </div>

      <div className="mt-2.5 flex min-h-9 flex-wrap items-center justify-between gap-x-4 gap-y-1">
        {difference !== undefined ? (
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs">
            <span className="font-medium text-slate-600">Διαφορά αγοράς–προγράμματος</span>
            <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 font-bold tabular-nums text-slate-800">
              <span aria-hidden="true">{movementIcon}</span>
              {signed(difference, 3)} €/g <span>({signed(difference / savedPrice * 100, 1)}%)</span>
            </span>
          </div>
        ) : <span />}
        {!fromSettings && (
          <button
            type="button" aria-expanded={expanded} aria-controls={historyId} onClick={() => setExpanded(!expanded)}
            className="inline-flex min-h-9 items-center gap-1 rounded-lg px-1.5 text-xs font-bold text-teal-800 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-teal-700"
          >
            {expanded ? 'Σύμπτυξη γραφήματος' : 'Πλήρες γράφημα'}
            <ChevronDown size={15} className={expanded ? 'rotate-180' : undefined} aria-hidden="true" />
          </button>
        )}
      </div>

      <div id={historyId} hidden={!full} className={fromSettings ? 'mt-2.5 grid gap-4 md:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]' : 'mt-2.5'}>
        {controls && <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-4">{controls}</div>}
        {full && (
          <div className="min-w-0 rounded-xl border border-slate-200 p-2.5 sm:p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-900">Ιστορικό αγοράς <span className="font-medium text-slate-500">· €/g</span></h3>
              <div role="group" aria-label="Περίοδος ιστορικού" className="inline-grid max-w-full grid-cols-3 gap-0.5 rounded-lg bg-slate-100 p-0.5 min-[430px]:grid-cols-6">
                {RANGES.map((option) => (
                  <button
                    key={option.value} type="button" aria-label={option.label} aria-pressed={range === option.value} onClick={() => setRange(option.value)}
                    className={`min-h-9 rounded-md px-2 text-[11px] font-bold focus-visible:outline-2 focus-visible:outline-teal-700 ${range === option.value ? 'bg-white text-teal-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
                  >{option.compact}</button>
                ))}
              </div>
            </div>

            {historyStale && last && (
              <p className="mb-2 text-xs font-semibold text-amber-800" role="status">Τελευταίο διαθέσιμο σημείο · {formatMarketTime(last.quotedAt, series.interval === '1d')}</p>
            )}
            {visibleHistory ? (
              <>
                <SilverHistoryChart series={series} compact={false} />
                <dl className="mt-2 grid grid-cols-3 gap-1.5 border-t border-slate-100 pt-2 text-xs sm:gap-3">
                  <div><dt className="text-slate-600">Μεταβολή</dt><dd className="mt-0.5 font-bold tabular-nums text-slate-900">{signed((last.priceEurPerGram / first.priceEurPerGram - 1) * 100, 1)}%</dd></div>
                  <div><dt className="text-slate-600">Χαμηλό</dt><dd className="mt-0.5 font-bold tabular-nums text-slate-900">{priceText(Math.min(...points.map((point) => point.priceEurPerGram)))}</dd></div>
                  <div><dt className="text-slate-600">Υψηλό</dt><dd className="mt-0.5 font-bold tabular-nums text-slate-900">{priceText(Math.max(...points.map((point) => point.priceEurPerGram)))}</dd></div>
                </dl>
              </>
            ) : (
              <div role="status" className="grid min-h-40 place-content-center rounded-lg bg-slate-50 p-4 text-center text-sm text-slate-600">
                {history.isLoading ? 'Φόρτωση ιστορικού…' : first ? (
                  <><span>Ένα διαθέσιμο σημείο στην περίοδο</span><span className="mt-1 font-bold text-slate-800">{formatMarketTime(first.quotedAt, series.interval === '1d')} · {priceText(first.priceEurPerGram)}</span></>
                ) : history.isError || !series ? 'Το ιστορικό δεν είναι διαθέσιμο' : 'Δεν υπάρχουν καταγραφές για αυτή την περίοδο'}
              </div>
            )}
          </div>
        )}
      </div>

      {(visibleHistory || full) && (
        <p className="mt-2.5 flex flex-wrap gap-x-1.5 text-[11px] text-slate-600">
          {series && <span>{INTERVAL_LABEL[series.interval]} ·</span>}
          <a href="https://standardbullion.com/market-data" target="_blank" rel="noreferrer" className="underline underline-offset-2">Data by Standard Bullion</a>
          <span>· Ενδεικτική μετατροπή με ημερήσια ισοτιμία ΕΚΤ</span>
        </p>
      )}
    </section>
  );
}
