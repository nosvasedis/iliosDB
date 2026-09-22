import { ProductionStage } from '../../types';
import { getFinderJumpGroupKey } from '../../utils/productionFinderStageJump';
import {
  getPolishingSubStageLabel,
  getProductionStageLabel,
  getProductionStageShortLabel,
  type ProductionStageColorKey,
} from '../../utils/productionStages';

export const PRODUCTION_SEND_STAGE_FILTER_ALL = 'all' as const;

export type ProductionSendStageFilter =
  | typeof PRODUCTION_SEND_STAGE_FILTER_ALL
  | Exclude<ProductionStage, ProductionStage.Polishing>
  | 'Polishing:pending'
  | 'Polishing:dispatched';

export type ProductionSendStageFilterColorKey = ProductionStageColorKey | 'teal';

export type ProductionSendStageFilterBatch = {
  current_stage: ProductionStage;
  pending_dispatch?: boolean;
  quantity?: number;
};

export type ProductionSendStageFilterOption = {
  key: Exclude<ProductionSendStageFilter, typeof PRODUCTION_SEND_STAGE_FILTER_ALL>;
  stage: ProductionStage;
  label: string;
  chipLabel: string;
  shortLabel: string;
  quantity: number;
  colorKey: ProductionSendStageFilterColorKey;
};

const STAGE_FILTER_ORDER: Array<Exclude<ProductionSendStageFilter, typeof PRODUCTION_SEND_STAGE_FILTER_ALL>> = [
  ProductionStage.AwaitingDelivery,
  ProductionStage.Waxing,
  ProductionStage.Casting,
  ProductionStage.Setting,
  'Polishing:pending',
  'Polishing:dispatched',
  ProductionStage.Assembly,
  ProductionStage.Labeling,
  ProductionStage.Ready,
];

const COMPACT_STAGE_LABELS: Record<string, string> = {
  [ProductionStage.AwaitingDelivery]: 'Αναμονή',
  [ProductionStage.Waxing]: 'Διαλογή',
  [ProductionStage.Casting]: 'Χυτήριο',
  [ProductionStage.Setting]: 'Καρφωτής',
  'Polishing:pending': 'Τεχν. Αναμονή',
  'Polishing:dispatched': 'Τεχν. Στον Τεχν.',
  [ProductionStage.Assembly]: 'Συναρμ.',
  [ProductionStage.Labeling]: 'Καρτελ.',
  [ProductionStage.Ready]: 'Έτοιμα',
};

const STAGE_FILTER_COLORS: Record<string, ProductionSendStageFilterColorKey> = {
  [ProductionStage.AwaitingDelivery]: 'indigo',
  [ProductionStage.Waxing]: 'slate',
  [ProductionStage.Casting]: 'orange',
  [ProductionStage.Setting]: 'purple',
  'Polishing:pending': 'teal',
  'Polishing:dispatched': 'blue',
  [ProductionStage.Assembly]: 'pink',
  [ProductionStage.Labeling]: 'yellow',
  [ProductionStage.Ready]: 'emerald',
};

export function getProductionSendStageFilterKey(
  batch: ProductionSendStageFilterBatch,
): Exclude<ProductionSendStageFilter, typeof PRODUCTION_SEND_STAGE_FILTER_ALL> {
  return getFinderJumpGroupKey(batch) as Exclude<ProductionSendStageFilter, typeof PRODUCTION_SEND_STAGE_FILTER_ALL>;
}

export function batchMatchesProductionSendStageFilter(
  batch: ProductionSendStageFilterBatch,
  filter: ProductionSendStageFilter,
): boolean {
  if (filter === PRODUCTION_SEND_STAGE_FILTER_ALL) return true;
  return getProductionSendStageFilterKey(batch) === filter;
}

export function rowMatchesProductionSendStageFilter(
  row: { batchDetails: ProductionSendStageFilterBatch[] },
  filter: ProductionSendStageFilter,
): boolean {
  if (filter === PRODUCTION_SEND_STAGE_FILTER_ALL) return true;
  return row.batchDetails.some((batch) => batchMatchesProductionSendStageFilter(batch, filter));
}

export function filterProductionSendRowsByStage<T extends { batchDetails: ProductionSendStageFilterBatch[] }>(
  rows: T[],
  filter: ProductionSendStageFilter,
): T[] {
  if (filter === PRODUCTION_SEND_STAGE_FILTER_ALL) return rows;
  return rows.filter((row) => rowMatchesProductionSendStageFilter(row, filter));
}

export function filterBatchesByProductionSendStage<T extends ProductionSendStageFilterBatch>(
  batches: T[],
  filter: ProductionSendStageFilter,
): T[] {
  if (filter === PRODUCTION_SEND_STAGE_FILTER_ALL) return batches;
  return batches.filter((batch) => batchMatchesProductionSendStageFilter(batch, filter));
}

function describeStageFilter(
  key: Exclude<ProductionSendStageFilter, typeof PRODUCTION_SEND_STAGE_FILTER_ALL>,
): Pick<ProductionSendStageFilterOption, 'stage' | 'label' | 'chipLabel' | 'shortLabel' | 'colorKey'> {
  if (key === 'Polishing:pending') {
    return {
      stage: ProductionStage.Polishing,
      label: getPolishingSubStageLabel('pending'),
      chipLabel: COMPACT_STAGE_LABELS[key],
      shortLabel: 'ΤΑ',
      colorKey: STAGE_FILTER_COLORS[key],
    };
  }
  if (key === 'Polishing:dispatched') {
    return {
      stage: ProductionStage.Polishing,
      label: getPolishingSubStageLabel('dispatched'),
      chipLabel: COMPACT_STAGE_LABELS[key],
      shortLabel: 'ΤΣ',
      colorKey: STAGE_FILTER_COLORS[key],
    };
  }

  return {
    stage: key,
    label: getProductionStageLabel(key),
    chipLabel: COMPACT_STAGE_LABELS[key] || getProductionStageLabel(key),
    shortLabel: getProductionStageShortLabel(key),
    colorKey: STAGE_FILTER_COLORS[key],
  };
}

export function buildProductionSendStageFilterOptions(
  batches: ProductionSendStageFilterBatch[],
): ProductionSendStageFilterOption[] {
  const quantities = new Map<string, number>();

  batches.forEach((batch) => {
    const key = getProductionSendStageFilterKey(batch);
    quantities.set(key, (quantities.get(key) || 0) + (batch.quantity || 0));
  });

  return STAGE_FILTER_ORDER.flatMap((key) => {
    const quantity = quantities.get(key) || 0;
    if (quantity <= 0) return [];
    return [{ key, quantity, ...describeStageFilter(key) }];
  });
}
