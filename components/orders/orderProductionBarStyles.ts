import { ProductionStage } from '../../types';

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

/** Unbatched / not-yet-in-production pieces: bar strip + badge chrome. */
export const UNBATCHED_PRODUCTION_STAGE_STYLES = {
  bg: 'bg-slate-100',
  text: 'text-slate-600',
  border: 'border-slate-200',
  bar: 'bg-slate-300',
} as const;
