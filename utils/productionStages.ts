import { ProductionStage } from '../types';

export type ProductionStageColorKey =
  | 'indigo'
  | 'slate'
  | 'orange'
  | 'purple'
  | 'blue'
  | 'pink'
  | 'yellow'
  | 'emerald';

export interface ProductionStageMeta {
  id: ProductionStage;
  label: string;
  shortLabel: string;
  colorKey: ProductionStageColorKey;
  order: number;
}

export const PRODUCTION_STAGE_META: Record<ProductionStage, ProductionStageMeta> = {
  [ProductionStage.AwaitingDelivery]: {
    id: ProductionStage.AwaitingDelivery,
    label: 'Αναμονή Παραλαβής',
    shortLabel: 'ΑΝ',
    colorKey: 'indigo',
    order: 0,
  },
  [ProductionStage.Waxing]: {
    id: ProductionStage.Waxing,
    label: 'Διαλογή',
    shortLabel: 'ΔΙ',
    colorKey: 'slate',
    order: 1,
  },
  [ProductionStage.Casting]: {
    id: ProductionStage.Casting,
    label: 'Χυτήριο',
    shortLabel: 'ΧΥ',
    colorKey: 'orange',
    order: 2,
  },
  [ProductionStage.Setting]: {
    id: ProductionStage.Setting,
    label: 'Καρφωτής',
    shortLabel: 'ΚΑ',
    colorKey: 'purple',
    order: 3,
  },
  [ProductionStage.Polishing]: {
    id: ProductionStage.Polishing,
    label: 'Τεχνίτης',
    shortLabel: 'ΤΕ',
    colorKey: 'blue',
    order: 4,
  },
  [ProductionStage.Assembly]: {
    id: ProductionStage.Assembly,
    label: 'Συναρμολόγηση',
    shortLabel: 'ΣΥ',
    colorKey: 'pink',
    order: 5,
  },
  [ProductionStage.Labeling]: {
    id: ProductionStage.Labeling,
    label: 'Καρτελάκια - Πακετάρισμα',
    shortLabel: 'ΚΠ',
    colorKey: 'yellow',
    order: 6,
  },
  [ProductionStage.Ready]: {
    id: ProductionStage.Ready,
    label: 'Έτοιμα',
    shortLabel: 'ΕΤ',
    colorKey: 'emerald',
    order: 7,
  },
};

export const PRODUCTION_STAGES: ProductionStageMeta[] = Object.values(PRODUCTION_STAGE_META).sort(
  (a, b) => a.order - b.order,
);

export const PRODUCTION_STAGE_LABELS: Record<ProductionStage, string> = PRODUCTION_STAGES.reduce(
  (acc, stage) => {
    acc[stage.id] = stage.label;
    return acc;
  },
  {} as Record<ProductionStage, string>,
);

export const PRODUCTION_STAGE_SHORT_LABELS: Record<ProductionStage, string> = PRODUCTION_STAGES.reduce(
  (acc, stage) => {
    acc[stage.id] = stage.shortLabel;
    return acc;
  },
  {} as Record<ProductionStage, string>,
);

export const PRODUCTION_STAGE_ORDER_INDEX: Record<ProductionStage, number> = PRODUCTION_STAGES.reduce(
  (acc, stage, index) => {
    acc[stage.id] = index;
    return acc;
  },
  {} as Record<ProductionStage, number>,
);

export function getProductionStageMeta(stage: ProductionStage | string): ProductionStageMeta | null {
  return (PRODUCTION_STAGE_META as Record<string, ProductionStageMeta | undefined>)[stage] || null;
}

export function getProductionStageLabel(stage: ProductionStage | string): string {
  return getProductionStageMeta(stage)?.label || String(stage);
}

export function getProductionStageShortLabel(stage: ProductionStage | string): string {
  return getProductionStageMeta(stage)?.shortLabel || String(stage);
}
