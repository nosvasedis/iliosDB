import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Order, OrderStatus, ProductionBatch, ProductionStage } from '../../types';
import {
  buildInProductionCollapsedProgressSegments,
  buildOrderPipelineProductionStageSegments,
  buildOrderProductionStageSegments,
  buildPartialDeliveryProgressSegments,
  orderStatusShowsProductionProgress,
  orderUsesPartialDeliveryProgress,
} from '../../utils/orderReadiness';
import { getProductionStageLabel } from '../../utils/productionStages';
import {
  ORDER_PRODUCTION_STAGE_BAR_CLASSNAMES,
  POLISHING_PENDING_PRODUCTION_STAGE_STYLES,
  UNBATCHED_PRODUCTION_STAGE_STYLES,
} from './orderProductionBarStyles';

type Props = {
  order: Order;
  batches: ProductionBatch[] | undefined | null;
  ready: boolean;
  /** desktop: h-2; mobile: h-1.5 */
  density?: 'desktop' | 'mobile';
  /** Real shipped quantity from DB; used to correctly show unbatched stripe on PartiallyDelivered orders */
  shippedQty?: number;
  /** Hide the compact numeric label when the parent renders a custom readiness badge. */
  showPercentLabel?: boolean;
};

type DesktopExpandedBreakdown =
  | { mode: 'inProduction'; stageBreakdown: NonNullable<ReturnType<typeof buildOrderProductionStageSegments>> }
  | { mode: 'partialPipeline'; pipeline: NonNullable<ReturnType<typeof buildOrderPipelineProductionStageSegments>> };

function getStageSegmentBarClass(segment: { kind: 'stage' | 'unbatched'; stage?: ProductionStage; pendingDispatch?: boolean }) {
  if (segment.kind === 'stage' && segment.stage === ProductionStage.Polishing && segment.pendingDispatch === true) {
    return POLISHING_PENDING_PRODUCTION_STAGE_STYLES.bar;
  }
  if (segment.kind === 'stage' && segment.stage !== undefined) {
    return ORDER_PRODUCTION_STAGE_BAR_CLASSNAMES[segment.stage];
  }
  return UNBATCHED_PRODUCTION_STAGE_STYLES.bar;
}

function getStageSegmentLabel(stage: ProductionStage, pendingDispatch?: boolean): string {
  if (stage === ProductionStage.Polishing) {
    return pendingDispatch ? 'Τεχν. • Αναμονή' : 'Τεχν. • Στον Τεχν.';
  }
  return getProductionStageLabel(stage);
}

function getStagePillClass(segment: { kind: 'stage' | 'unbatched'; stage?: ProductionStage; pendingDispatch?: boolean }): string {
  if (segment.kind === 'unbatched') {
    return `${UNBATCHED_PRODUCTION_STAGE_STYLES.bg} ${UNBATCHED_PRODUCTION_STAGE_STYLES.text} ${UNBATCHED_PRODUCTION_STAGE_STYLES.border}`;
  }
  if (segment.stage === ProductionStage.Polishing && segment.pendingDispatch === true) {
    return `${POLISHING_PENDING_PRODUCTION_STAGE_STYLES.bg} ${POLISHING_PENDING_PRODUCTION_STAGE_STYLES.text} ${POLISHING_PENDING_PRODUCTION_STAGE_STYLES.border}`;
  }
  switch (segment.stage) {
    case ProductionStage.AwaitingDelivery:
      return 'bg-indigo-50 text-indigo-700 border-indigo-200';
    case ProductionStage.Waxing:
      return 'bg-slate-100 text-slate-700 border-slate-200';
    case ProductionStage.Casting:
      return 'bg-orange-50 text-orange-700 border-orange-200';
    case ProductionStage.Setting:
      return 'bg-purple-50 text-purple-700 border-purple-200';
    case ProductionStage.Polishing:
      return 'bg-blue-50 text-blue-700 border-blue-200';
    case ProductionStage.Assembly:
      return 'bg-pink-50 text-pink-700 border-pink-200';
    case ProductionStage.Labeling:
      return 'bg-yellow-50 text-yellow-700 border-yellow-200';
    case ProductionStage.Ready:
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    default:
      return 'bg-slate-50 text-slate-700 border-slate-200';
  }
}

function getSegmentPillName(
  segment: { kind: 'stage' | 'unbatched'; stage?: ProductionStage; pendingDispatch?: boolean },
  unbatchedPillLabel: string
): string {
  if (segment.kind === 'stage' && segment.stage !== undefined) {
    return getStageSegmentLabel(segment.stage, segment.pendingDispatch);
  }
  return unbatchedPillLabel;
}

function useDesktopExpandedBreakdown(
  order: Order,
  batches: ProductionBatch[] | undefined | null,
  density: 'desktop' | 'mobile',
  shippedQty?: number,
): DesktopExpandedBreakdown | null {
  return useMemo(() => {
    if (density !== 'desktop') return null;
    if (orderUsesPartialDeliveryProgress(order, shippedQty)) {
      const pipeline = buildOrderPipelineProductionStageSegments(order.id, batches);
      if (!pipeline?.segments.length) return null;
      return { mode: 'partialPipeline', pipeline };
    }
    if (order.status === OrderStatus.InProduction || order.status === OrderStatus.Pending) {
      const stageBreakdown = buildOrderProductionStageSegments(order, batches);
      if (!stageBreakdown?.segments.length) return null;
      return { mode: 'inProduction', stageBreakdown };
    }
    return null;
  }, [density, order, batches, shippedQty]);
}

function StageStripAndPills(props: {
  segments: Array<{
    kind: 'stage' | 'unbatched';
    stage?: ProductionStage;
    pendingDispatch?: boolean;
    quantity: number;
    pct: number;
  }>;
  unbatchedPillLabel: string;
  unbatchedSegmentTitle: string;
}) {
  const { segments, unbatchedPillLabel, unbatchedSegmentTitle } = props;
  return (
    <>
      <div className="mt-1.5 flex h-2.5 w-full overflow-hidden rounded-full border border-slate-200/80 bg-white/80">
        {segments.map((segment, index) => (
          <div
            key={`${segment.kind}-${segment.kind === 'stage' ? segment.stage : 'unassigned'}-${index}`}
            className={`${
              segment.kind === 'stage' && segment.stage !== undefined
                ? getStageSegmentBarClass(segment)
                : UNBATCHED_PRODUCTION_STAGE_STYLES.bar
            } min-w-px border-r border-white/60 last:border-r-0 transition-[width] duration-300`}
            style={{
              width: `${segment.pct}%`,
              ...(segment.kind === 'unbatched' ? UNBATCHED_PRODUCTION_STAGE_STYLES.barStyle : undefined),
            }}
            title={
              segment.kind === 'stage' && segment.stage !== undefined
                ? `${getProductionStageLabel(segment.stage)}: ${segment.quantity} τεμ.`
                : unbatchedSegmentTitle
            }
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {segments.map((segment, index) => (
          <span
            key={`pill-${segment.kind}-${index}`}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold shadow-sm ${getStagePillClass(segment)}`}
          >
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                segment.kind === 'stage' && segment.stage !== undefined
                  ? getStageSegmentBarClass(segment)
                  : UNBATCHED_PRODUCTION_STAGE_STYLES.bar
              }`}
              style={segment.kind === 'unbatched' ? UNBATCHED_PRODUCTION_STAGE_STYLES.barStyle : undefined}
            />
            <span className="shrink-0 text-[9px] tabular-nums">{segment.quantity}</span>
            <span className="min-w-0 truncate text-[9px]">{getSegmentPillName(segment, unbatchedPillLabel)}</span>
          </span>
        ))}
      </div>
    </>
  );
}

function StageStripAndPillsWithPolishingSplit(props: Parameters<typeof StageStripAndPills>[0]) {
  const { segments, unbatchedPillLabel, unbatchedSegmentTitle } = props;
  const polishingPendingSegment = segments.find(
    (segment) => segment.kind === 'stage' && segment.stage === ProductionStage.Polishing && segment.pendingDispatch === true
  );
  const polishingDispatchedSegment = segments.find(
    (segment) => segment.kind === 'stage' && segment.stage === ProductionStage.Polishing && segment.pendingDispatch === false
  );
  const hasJoinedPolishingPill = !!polishingPendingSegment && !!polishingDispatchedSegment;
  const polishingPendingQty = polishingPendingSegment?.quantity ?? 0;
  const polishingDispatchedQty = polishingDispatchedSegment?.quantity ?? 0;
  const polishingPillOrder = segments.findIndex(
    (segment) => segment.kind === 'stage' && segment.stage === ProductionStage.Polishing
  );
  return (
    <>
      <div className="mt-1.5 flex h-2.5 w-full overflow-hidden rounded-full border border-slate-200/80 bg-white/80">
        {segments.map((segment, index) => {
          const isUnbatched = segment.kind === 'unbatched';
          const label = segment.kind === 'stage' && segment.stage !== undefined
            ? `${getStageSegmentLabel(segment.stage, segment.pendingDispatch)}: ${segment.quantity} τεμ.`
            : unbatchedSegmentTitle;
          return (
            <div
              key={`${segment.kind}-${segment.kind === 'stage' ? segment.stage : 'unassigned'}-${segment.kind === 'stage' ? segment.pendingDispatch : ''}-${index}`}
              className={`${getStageSegmentBarClass(segment)} min-w-px border-r border-white/60 last:border-r-0 transition-[width] duration-300`}
              style={{
                width: `${segment.pct}%`,
                ...(isUnbatched ? UNBATCHED_PRODUCTION_STAGE_STYLES.barStyle : undefined),
              }}
              title={label}
            />
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {hasJoinedPolishingPill && (
          <span
            className="inline-flex max-w-full overflow-hidden rounded-full border border-slate-200 bg-white shadow-sm"
            style={{ order: polishingPillOrder }}
            title={`Τεχνίτης • Αναμονή: ${polishingPendingQty} τεμ. · Τεχνίτης • Στον Τεχνίτη: ${polishingDispatchedQty} τεμ.`}
          >
            <span className="inline-flex min-w-0 items-center gap-1 border-r border-teal-100 bg-teal-50 px-1.5 py-0.5 text-[9px] font-bold text-teal-700">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500" />
              <span className="shrink-0 tabular-nums">{polishingPendingQty}</span>
              <span className="min-w-0 truncate">Αναμονή</span>
            </span>
            <span className="inline-flex min-w-0 items-center gap-1 bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold text-blue-700">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
              <span className="shrink-0 tabular-nums">{polishingDispatchedQty}</span>
              <span className="min-w-0 truncate">Στον Τεχν.</span>
            </span>
          </span>
        )}
        {segments.filter((segment) => !(hasJoinedPolishingPill && segment.kind === 'stage' && segment.stage === ProductionStage.Polishing)).map((segment, index) => (
          <span
            key={`pill-${segment.kind}-${segment.kind === 'stage' ? segment.stage : 'unbatched'}-${segment.kind === 'stage' ? segment.pendingDispatch : ''}-${index}`}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold shadow-sm ${getStagePillClass(segment)}`}
            style={{ order: index }}
          >
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${getStageSegmentBarClass(segment)}`}
              style={segment.kind === 'unbatched' ? UNBATCHED_PRODUCTION_STAGE_STYLES.barStyle : undefined}
            />
            <span className="shrink-0 text-[9px] tabular-nums">{segment.quantity}</span>
            <span className="min-w-0 truncate text-[9px]">{getSegmentPillName(segment, unbatchedPillLabel)}</span>
          </span>
        ))}
      </div>
    </>
  );
}

/**
 * Παραγγελίες list: progress next to status.
 * Σε Παραγωγή / Μερική Παράδοση: συμπαγής μπάρα — σε desktop με ανάπτυγμα (ανά στάδιο, με σωστή σημασιολογία για μερική παράδοση).
 */
export function OrderListProgressBar({ order, batches, ready, density = 'desktop', shippedQty, showPercentLabel = true }: Props) {
  const [stagesExpanded, setStagesExpanded] = useState(false);
  const expandedBreakdown = useDesktopExpandedBreakdown(order, batches, density, shippedQty);

  if (!orderStatusShowsProductionProgress(order.status) || ready) return null;

  const h = density === 'desktop' ? 'h-2' : 'h-1.5';
  const partial = orderUsesPartialDeliveryProgress(order, shippedQty)
    ? buildPartialDeliveryProgressSegments(order, batches, shippedQty)
    : null;
  const inProd =
    !partial && (order.status === OrderStatus.InProduction || order.status === OrderStatus.Pending)
      ? buildInProductionCollapsedProgressSegments(order, batches)
      : null;

  const outerMobile = 'flex items-center gap-2 w-full max-w-full min-w-0';

  const chevronButton = (
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
  );

  if (partial && partial.segments.length > 0) {
    const mainTitle = `${partial.summaryTitle} · Σύνολο παραγγελίας: ${partial.itemsTotal} τεμ. · Ποσοστό ολοκλήρωσης: ${partial.overallCompletePercent}% (παραδοθέντα + έτοιμα) · Γκρι σκούρο=παραδόθηκαν, πράσινο=έτοιμα (προς αποστολή), κεχριμπάρι=σε παραγωγή, γκρι ανοιχτό=χωρίς ενεργή παραγωγή`;

    const bar = (
      <div className={`flex flex-1 min-w-[56px] ${h} rounded-full overflow-hidden border border-slate-200 bg-slate-100`}>
        {partial.segments.map((s, idx) => (
          <div
            key={idx}
            className={`${s.className} min-w-px border-r border-white/50 last:border-r-0 shrink-0 transition-[width] duration-300`}
            style={{ width: `${s.pct}%`, ...s.style }}
            title={s.label}
          />
        ))}
      </div>
    );

    const pctLabel = (
      <span
        className={`font-black text-slate-500 tabular-nums shrink-0 min-w-[2.25rem] text-right leading-none ${density === 'mobile' ? 'text-[9px]' : 'text-[10px]'}`}
      >
        {partial.overallCompletePercent}%
      </span>
    );

    if (density === 'mobile') {
      return (
        <div className={outerMobile} title={mainTitle}>
          {bar}
          {pctLabel}
        </div>
      );
    }

    return (
      <div className="flex min-w-0 w-full max-w-[min(100%,22rem)] flex-col gap-1.5" title={mainTitle}>
        <div className="flex min-w-0 items-center gap-1">
          {chevronButton}
          <div className={`flex min-w-0 flex-1 items-center gap-1.5 ${stagesExpanded ? 'max-w-none' : ''}`}>
            {bar}
            {showPercentLabel && pctLabel}
          </div>
        </div>

        {stagesExpanded && (
          <div className="animate-in slide-in-from-top-1 fade-in rounded-lg border border-amber-100 bg-gradient-to-br from-slate-50 to-amber-50/35 px-2.5 py-2 shadow-sm duration-200">
            <div className="text-[9px] font-black uppercase tracking-[0.12em] text-amber-800/90">Μερική παράδοση · ανάλυση σταδίων</div>
            <p className="mt-1 text-[9px] font-medium leading-snug text-slate-600">
              Η μπάρα ανά στάδιο αφορά μόνο τα <span className="font-bold text-slate-800">{partial.batchTotal}</span> τεμ. που
              βρίσκονται ακόμη σε παρτίδες παραγωγής. Τα παραδοθέντα και το ανοιχτό γκρι της κύριας μπάρας δεν εμφανίζονται
              εδώ ως «στάδιο».
            </p>

            {expandedBreakdown?.mode === 'partialPipeline' ? (
              <StageStripAndPillsWithPolishingSplit
                segments={expandedBreakdown.pipeline.segments}
                unbatchedPillLabel="Λοιπά"
                unbatchedSegmentTitle="Λοιπά"
              />
            ) : (
              <p className="mt-2 text-[9px] font-medium text-slate-500">
                Δεν υπάρχουν ενεργές παρτίδες για ανάλυση σταδίου (όλα τα υπόλοιπα τεμάχια έχουν ήδη φύγει από την
                παραγωγή).
              </p>
            )}

            <div className="mt-2 flex flex-wrap gap-1 border-t border-amber-100/80 pt-2">
              {partial.shippedQty > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-700/95 px-2 py-0.5 text-[9px] font-bold text-white shadow-sm">
                  Παραδόθηκαν · {partial.shippedQty}
                </span>
              )}
              {partial.remainderQty > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-300/90 px-2 py-0.5 text-[9px] font-bold text-slate-800 shadow-sm">
                  Χωρίς ενεργή παραγωγή · {partial.remainderQty}
                </span>
              )}
              {partial.readyQty > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[9px] font-bold text-emerald-800">
                  Έτοιμα (σύνολο) · {partial.readyQty}
                </span>
              )}
              {partial.wipQty > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[9px] font-bold text-amber-900">
                  Σε παραγωγή (σύνολο) · {partial.wipQty}
                </span>
              )}
            </div>
          </div>
        )}
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
            style={{ width: `${s.pct}%`, ...s.style }}
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

    const stageBreakdown = expandedBreakdown?.mode === 'inProduction' ? expandedBreakdown.stageBreakdown : null;

    return (
      <div className="flex min-w-0 w-full max-w-[min(100%,22rem)] flex-col gap-1.5" title={title}>
        <div className="flex min-w-0 items-center gap-1">
          {chevronButton}
          <div className={`flex min-w-0 flex-1 items-center gap-1.5 ${stagesExpanded ? 'max-w-none' : ''}`}>
            {bar}
            {showPercentLabel && pctLabel}
          </div>
        </div>

        {stagesExpanded && stageBreakdown && stageBreakdown.segments.length > 0 && (
          <div className="animate-in slide-in-from-top-1 fade-in rounded-lg border border-indigo-100 bg-gradient-to-br from-slate-50 to-indigo-50/40 px-2.5 py-2 shadow-sm duration-200">
            <div className="text-[9px] font-black uppercase tracking-[0.12em] text-indigo-500/90">Ανάλυση ανά στάδιο</div>
            <StageStripAndPillsWithPolishingSplit
              segments={stageBreakdown.segments}
              unbatchedPillLabel="Χωρίς παρτίδα"
              unbatchedSegmentTitle={`Δεν έχουν μπει ακόμη σε παρτίδα παραγωγής: ${stageBreakdown.segments.find((s) => s.kind === 'unbatched')?.quantity ?? 0} τεμ.`}
            />
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
