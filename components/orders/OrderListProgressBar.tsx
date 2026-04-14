import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Order, OrderStatus, ProductionBatch, ProductionStage } from '../../types';
import {
  buildInProductionCollapsedProgressSegments,
  buildOrderProductionStageSegments,
  buildPartialDeliveryProgressSegments,
  orderStatusShowsProductionProgress,
} from '../../utils/orderReadiness';
import { getProductionStageLabel } from '../../utils/productionStages';
import {
  ORDER_PRODUCTION_STAGE_BAR_CLASSNAMES,
  UNBATCHED_PRODUCTION_STAGE_STYLES,
} from './orderProductionBarStyles';

type Props = {
  order: Order;
  batches: ProductionBatch[] | undefined | null;
  ready: boolean;
  /** desktop: h-2; mobile: h-1.5 */
  density?: 'desktop' | 'mobile';
};

/**
 * Παραγγελίες list: progress next to status.
 * Σε Παραγωγή: συμπαγής μπάρα (έτοιμα | wip | χωρίς παρτίδα) — σε desktop με ανάπτυγμα ανά στάδιο.
 * Μερική Παράδοση: split bar (παραδοθέντα | έτοιμα | σε παραγωγή | υπόλοιπο).
 */
export function OrderListProgressBar({ order, batches, ready, density = 'desktop' }: Props) {
  const [stagesExpanded, setStagesExpanded] = useState(false);

  if (!orderStatusShowsProductionProgress(order.status) || ready) return null;

  const h = density === 'desktop' ? 'h-2' : 'h-1.5';
  const partial =
    order.status === OrderStatus.PartiallyDelivered ? buildPartialDeliveryProgressSegments(order, batches) : null;
  const inProd =
    order.status === OrderStatus.InProduction ? buildInProductionCollapsedProgressSegments(order, batches) : null;

  const stageBreakdown = useMemo(
    () =>
      order.status === OrderStatus.InProduction && density === 'desktop'
        ? buildOrderProductionStageSegments(order, batches)
        : null,
    [order, batches, density]
  );

  const outerMobile = 'flex items-center gap-2 w-full max-w-full min-w-0';
  const outerDesktopRow = 'flex items-center gap-1.5 min-w-0 w-full flex-1 max-w-[200px]';

  if (partial && partial.segments.length > 0) {
    return (
      <div
        className={density === 'mobile' ? outerMobile : outerDesktopRow}
        title={`${partial.summaryTitle} · Σύνολο παραγγελίας: ${order.items.reduce((s, i) => s + (i.quantity || 0), 0)} τεμ. · Γκρι σκούρο=παραδόθηκαν, πράσινο=έτοιμα, κεχριμπάρι=σε παραγωγή, γκρι ανοιχτό=χωρίς ενεργή παραγωγή`}
      >
        <div className={`flex flex-1 min-w-[56px] ${h} rounded-full overflow-hidden border border-slate-200 bg-slate-100`}>
          {partial.segments.map((s, idx) => (
            <div
              key={idx}
              className={`${s.className} min-w-px border-r border-white/50 last:border-r-0 shrink-0 transition-[width] duration-300`}
              style={{ width: `${s.pct}%` }}
              title={s.label}
            />
          ))}
        </div>
        <span
          className={`font-black text-slate-500 tabular-nums shrink-0 min-w-[2.25rem] text-right leading-none ${density === 'mobile' ? 'text-[9px]' : 'text-[10px]'}`}
        >
          {partial.overallCompletePercent}%
        </span>
      </div>
    );
  }

  if (inProd && inProd.segments.length > 0) {
    const title = `${inProd.summaryTitle} · Σύνολο παραγγελίας: ${inProd.itemsTotal} τεμ. · Ποσοστό: ${inProd.readyPercentVsOrder}% έτοιμα ως προς όλη την παραγγελία · Πράσινο=έτοιμα, κεχριμπάρι=σε παραγωγή (όλα τα στάδια πλην έτοιμων), γκρι ανοιχτό=δεν έχουν μπει ακόμη σε παρτίδα παραγωγής`;

    const bar = (
      <div className={`flex flex-1 min-w-[56px] ${h} rounded-full overflow-hidden border border-slate-200 bg-slate-100`}>
        {inProd.segments.map((s, idx) => (
          <div
            key={idx}
            className={`${s.className} min-w-px border-r border-white/50 last:border-r-0 shrink-0 transition-[width] duration-300`}
            style={{ width: `${s.pct}%` }}
            title={s.label}
          />
        ))}
      </div>
    );

    const pctLabel = (
      <span
        className={`font-black text-slate-500 tabular-nums shrink-0 min-w-[2.25rem] text-right leading-none ${density === 'mobile' ? 'text-[9px]' : 'text-[10px]'}`}
      >
        {inProd.readyPercentVsOrder}%
      </span>
    );

    if (density === 'mobile') {
      return (
        <div className={outerMobile} title={title}>
          {bar}
          {pctLabel}
        </div>
      );
    }

    return (
      <div className="flex min-w-0 w-full max-w-[min(100%,22rem)] flex-col gap-1.5" title={title}>
        <div className="flex items-center gap-1 min-w-0">
          <button
            type="button"
            className="shrink-0 rounded-md p-0.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-expanded={stagesExpanded}
            aria-label={stagesExpanded ? 'Σύμπτυξη ανάλυσης σταδίων' : 'Ανάπτυξη ανάλυσης σταδίων'}
            title={stagesExpanded ? 'Σύμπτυξη ανάλυσης σταδίων παραγωγής' : 'Ανάπτυξη ανάλυσης σταδίων παραγωγής'}
            onClick={(e) => {
              e.stopPropagation();
              setStagesExpanded((v) => !v);
            }}
          >
            {stagesExpanded ? <ChevronUp size={16} strokeWidth={2.5} /> : <ChevronDown size={16} strokeWidth={2.5} />}
          </button>
          <div className={`flex min-w-0 flex-1 items-center gap-1.5 ${stagesExpanded ? 'max-w-none' : ''}`}>
            {bar}
            {pctLabel}
          </div>
        </div>

        {stagesExpanded && stageBreakdown && stageBreakdown.segments.length > 0 && (
          <div className="animate-in slide-in-from-top-1 fade-in rounded-lg border border-indigo-100 bg-gradient-to-br from-slate-50 to-indigo-50/40 px-2.5 py-2 shadow-sm duration-200">
            <div className="text-[9px] font-black uppercase tracking-[0.12em] text-indigo-500/90">Ανάλυση ανά στάδιο</div>
            <div className="mt-1.5 flex h-2.5 w-full overflow-hidden rounded-full border border-slate-200/80 bg-white/80">
              {stageBreakdown.segments.map((segment, index) => (
                <div
                  key={`${segment.kind}-${segment.kind === 'stage' ? segment.stage : 'unassigned'}-${index}`}
                  className={`${
                    segment.kind === 'stage'
                      ? ORDER_PRODUCTION_STAGE_BAR_CLASSNAMES[segment.stage as ProductionStage]
                      : UNBATCHED_PRODUCTION_STAGE_STYLES.bar
                  } min-w-px border-r border-white/60 last:border-r-0 transition-[width] duration-300`}
                  style={{ width: `${segment.pct}%` }}
                  title={
                    segment.kind === 'stage'
                      ? `${getProductionStageLabel(segment.stage)}: ${segment.quantity} τεμ.`
                      : `Δεν έχουν μπει ακόμη σε παρτίδα παραγωγής: ${segment.quantity} τεμ.`
                  }
                />
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {stageBreakdown.segments.map((segment, index) => (
                <span
                  key={`pill-${segment.kind}-${index}`}
                  className="inline-flex items-center gap-1 rounded-full border border-white/80 bg-white/90 px-2 py-0.5 text-[9px] font-bold text-slate-700 shadow-sm"
                >
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      segment.kind === 'stage'
                        ? ORDER_PRODUCTION_STAGE_BAR_CLASSNAMES[segment.stage as ProductionStage]
                        : UNBATCHED_PRODUCTION_STAGE_STYLES.bar
                    }`}
                  />
                  {segment.kind === 'stage'
                    ? `${getProductionStageLabel(segment.stage)} · ${segment.quantity}`
                    : `Χωρίς παρτίδα · ${segment.quantity}`}
                </span>
              ))}
            </div>
            {stageBreakdown.assignedQty < stageBreakdown.totalQty && (
              <p className="mt-1.5 text-[9px] font-medium leading-snug text-slate-500">
                Το γκρι τμήμα είναι ποσότητα που δεν έχει ακόμη μπει σε παρτίδα παραγωγής.
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  return null;
}
