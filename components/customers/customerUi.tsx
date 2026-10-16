import React, { useState } from 'react';
import { Image as ImageIcon, MapPin, ShoppingBag } from 'lucide-react';
import { SEVERITY_META, type OverlapSeverity } from '../../features/customers/customerAssortment';
import {
  ACTIVITY_META,
  nextCategoryGap,
  TIER_META,
  tierRangeLabel,
  customerAvatarGradient,
  customerInitials,
  type CustomerActivity,
  type CustomerLocation,
  type CustomerOrderSummary,
  type CustomerTier,
} from '../../features/customers/customerLocation';
import { formatCurrency } from '../../utils/numberFormat';

export function CustomerAvatar({ name, seed, size = 44, className = '' }: { name: string; seed: string; size?: number; className?: string }) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-2xl font-black text-white shadow-sm ring-2 ring-white ${className}`}
      style={{ width: size, height: size, background: customerAvatarGradient(seed), fontSize: Math.round(size * 0.36) }}
      aria-hidden
    >
      {customerInitials(name)}
    </div>
  );
}

export function ActivityBadge({ activity, tier = null, compact = false }: { activity: CustomerActivity; tier?: CustomerTier | null; compact?: boolean }) {
  const activeTier = activity === 'active' ? tier : null;
  const meta = activeTier ? TIER_META[activeTier] : ACTIVITY_META[activity];
  const label = activeTier ? `${ACTIVITY_META.active.label} · ${meta.label}` : meta.label;
  const hint = activeTier ? `${tierRangeLabel(activeTier)} φέτος, χωρίς ΦΠΑ` : ACTIVITY_META[activity].hint;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${meta.soft}`}
      title={hint}
      aria-label={compact ? label : undefined}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {compact ? null : label}
    </span>
  );
}

export function CustomerCategorySummary({ summary }: { summary: CustomerOrderSummary }) {
  const next = nextCategoryGap(summary.yearRevenue);
  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-4" aria-label="Κατηγορία πελάτη βάσει ετήσιου τζίρου">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-black text-slate-800">Κατηγορία φέτος</span>
        <ActivityBadge activity={summary.activity} tier={summary.tier} />
      </div>
      <p className="mt-2 text-sm font-black text-slate-900">{formatCurrency(summary.yearRevenue)} <span className="text-[11px] font-semibold text-slate-500">χωρίς ΦΠΑ · {summary.yearOrderCount} παραγγ. φέτος</span></p>
      <p className="mt-1 text-[11px] text-slate-500">{next ? `Ακόμη ${formatCurrency(next.missing)} για την κατηγορία «${next.label}».` : 'Στην ανώτερη κατηγορία ετήσιου τζίρου.'}</p>
      <p className="mt-2 text-[10px] leading-relaxed text-slate-400">Από 1 Ιανουαρίου έως σήμερα, με βάση την ημερομηνία παραγγελίας. Οι ακυρωμένες εξαιρούνται.</p>
    </section>
  );
}

export function locationText(location: CustomerLocation): string | null {
  const parts = [location.town, location.unitLabel].filter(Boolean) as string[];
  const unique = parts.filter((p, i) => parts.findIndex(q => q.toLocaleLowerCase('el-GR') === p.toLocaleLowerCase('el-GR')) === i);
  return unique.length ? unique.join(' · ') : location.periferiaLabel;
}

export function RegionPill({ location, className = '' }: { location: CustomerLocation; className?: string }) {
  const text = locationText(location);
  if (!text) {
    return (
      <span className={`inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-400 ring-1 ring-slate-100 ${className}`}>
        <MapPin size={10} /> Χωρίς περιοχή
      </span>
    );
  }
  return (
    <span
      className={`inline-flex min-w-0 max-w-full items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-800 ring-1 ring-sky-100 ${className}`}
      title={[text, location.periferiaLabel, location.postalCode].filter(Boolean).join(' · ')}
    >
      <MapPin size={10} className="shrink-0 text-sky-500" />
      <span className="truncate">{text}</span>
    </span>
  );
}

/** Lazy product photo with a neutral placeholder. */
export function ProductThumb({ src, size = 36 }: { src: string | null; size?: number }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100 text-slate-300 ring-1 ring-slate-100" style={{ width: size, height: size }}>
      {src && !failed
        ? <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} className="h-full w-full object-cover" />
        : <ImageIcon size={Math.round(size * 0.45)} />}
    </span>
  );
}

/** Directory chips: pieces of the filtered items bought, and the worst territory overlap. */
export function TerritoryInsightChips({ matchQty, matchLast, severity }: { matchQty?: number | null; matchLast?: number | null; severity?: OverlapSeverity | null }) {
  if (!matchQty && !severity) return null;
  return (
    <>
      {Boolean(matchQty) && (
        <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-700 ring-1 ring-violet-100"
          title={matchLast ? `Τελευταία αγορά ${new Date(matchLast).toLocaleDateString('el-GR')}` : undefined}>
          <ShoppingBag size={10} /> {matchQty!.toLocaleString('el-GR')} τεμ.
        </span>
      )}
      {severity && (
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${SEVERITY_META[severity].tone}`} title={SEVERITY_META[severity].hint}>
          <span className={`h-1.5 w-1.5 rounded-full ${SEVERITY_META[severity].dot}`} /> {severity === 'critical' ? 'Αποκλειστικότητα' : 'Επικάλυψη'}
        </span>
      )}
    </>
  );
}
