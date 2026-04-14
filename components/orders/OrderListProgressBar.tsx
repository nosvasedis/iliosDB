import React from 'react';
import { Order, OrderStatus, ProductionBatch } from '../../types';
import {
  buildInProductionCollapsedProgressSegments,
  buildPartialDeliveryProgressSegments,
  orderStatusShowsProductionProgress,
} from '../../utils/orderReadiness';

type Props = {
  order: Order;
  batches: ProductionBatch[] | undefined | null;
  ready: boolean;
  /** desktop: h-2; mobile: h-1.5 */
  density?: 'desktop' | 'mobile';
};

/**
 * Παραγγελίες list: progress next to status.
 * Σε Παραγωγή: collapsed bar (έτοιμα | wip | χωρίς batch) vs full order qty.
 * Μερική Παράδοση: split bar (παραδοθέντα | έτοιμα | σε παραγωγή | υπόλοιπο).
 */
export function OrderListProgressBar({ order, batches, ready, density = 'desktop' }: Props) {
  if (!orderStatusShowsProductionProgress(order.status) || ready) return null;

  const h = density === 'desktop' ? 'h-2' : 'h-1.5';
  const partial =
    order.status === OrderStatus.PartiallyDelivered ? buildPartialDeliveryProgressSegments(order, batches) : null;
  const inProd =
    order.status === OrderStatus.InProduction ? buildInProductionCollapsedProgressSegments(order, batches) : null;

  const outer =
    density === 'mobile'
      ? 'flex items-center gap-2 w-full max-w-full min-w-0'
      : 'flex items-center gap-1.5 min-w-0 flex-1 max-w-[200px]';

  if (partial && partial.segments.length > 0) {
    return (
      <div
        className={outer}
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
    const title = `${inProd.summaryTitle} · Σύνολο παραγγελίας: ${inProd.itemsTotal} τεμ. · Ποσοστό: ${inProd.readyPercentVsOrder}% έτοιμα ως προς όλη την παραγγελία · Πράσινο=έτοιμα, κεχριμπάρι=σε παραγωγή, γκρι ανοιχτό=χωρίς ενεργή παραγωγή`;
    return (
      <div className={outer} title={title}>
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
        <span
          className={`font-black text-slate-500 tabular-nums shrink-0 min-w-[2.25rem] text-right leading-none ${density === 'mobile' ? 'text-[9px]' : 'text-[10px]'}`}
        >
          {inProd.readyPercentVsOrder}%
        </span>
      </div>
    );
  }

  return null;
}
