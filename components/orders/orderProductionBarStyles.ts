import { ProductionStage } from '../../types';
import { UNBATCHED_STRIPE_STYLE } from '../../utils/orderReadiness';
import { getProductionStageLabel } from '../../utils/productionStages';

/** Solid bar strip colors per stage (list + mobile expanded bar). */
export const ORDER_PRODUCTION_STAGE_BAR_CLASSNAMES: Record<ProductionStage, string> = {
  [ProductionStage.AwaitingDelivery]: 'bg-indigo-500',
  [ProductionStage.Waxing]: 'bg-slate-500',
  [ProductionStage.Casting]: 'bg-orange-500',
  [ProductionStage.Setting]: 'bg-purple-500',
  [ProductionStage.Polishing]: 'bg-blue-500',
  [ProductionStage.Assembly]: 'bg-pink-500',
  [ProductionStage.Labeling]: 'bg-yellow-400',
  [ProductionStage.Ready]: 'bg-emerald-500',
};

/** Τεχνίτης sub-stages: teal = Αναμονή Αποστολής, blue = Στον Τεχνίτη. */
export const POLISHING_PENDING_DISPATCH_BAR_CLASSNAME = 'bg-teal-500';
export const POLISHING_DISPATCHED_BAR_CLASSNAME = 'bg-blue-500';

export function getOrderStageSegmentBarClassName(
  stage: ProductionStage,
  pendingDispatch?: boolean
): string {
  if (stage === ProductionStage.Polishing && pendingDispatch === true) {
    return POLISHING_PENDING_DISPATCH_BAR_CLASSNAME;
  }
  if (stage === ProductionStage.Polishing && pendingDispatch === false) {
    return POLISHING_DISPATCHED_BAR_CLASSNAME;
  }
  return ORDER_PRODUCTION_STAGE_BAR_CLASSNAMES[stage];
}

export function getOrderStageSegmentLabel(stage: ProductionStage, pendingDispatch?: boolean): string {
  if (stage === ProductionStage.Polishing) {
    return pendingDispatch ? 'Τεχν. • Αναμονή' : 'Τεχν. • Στον Τεχν.';
  }
  return getProductionStageLabel(stage);
}

/** Unbatched / not-yet-in-production pieces: bar strip + badge chrome. */
export const UNBATCHED_PRODUCTION_STAGE_STYLES = {
  bg: 'bg-slate-100',
  text: 'text-slate-600',
  border: 'border-slate-200',
  bar: 'bg-slate-400',
  barStyle: UNBATCHED_STRIPE_STYLE,
} as const;
