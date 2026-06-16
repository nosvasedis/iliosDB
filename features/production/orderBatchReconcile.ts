import { OrderItem, ProductionBatch, ProductionStage } from '../../types';
import { buildItemIdentityKey } from '../../utils/itemIdentity';
import { isSpecialCreationSku } from '../../utils/specialCreationSku';

export type ReconcileCatalogItem = Pick<
  OrderItem,
  'sku' | 'variant_suffix' | 'size_info' | 'cord_color' | 'enamel_color' | 'notes' | 'line_id' | 'quantity'
>;

export type ReconcileKeyOptions = {
  naturalKeyDemandCount: Record<string, number>;
};

export function getNaturalCatalogKey(
  sku: string,
  variant: string | null | undefined,
  size: string | null | undefined,
  cordColor?: string | null,
  enamelColor?: string | null,
): string {
  return buildItemIdentityKey({
    sku: sku.toUpperCase(),
    variant_suffix: (variant || '').toUpperCase(),
    size_info: (size || '').toUpperCase(),
    cord_color: ((cordColor || '').toLowerCase() || null) as OrderItem['cord_color'],
    enamel_color: ((enamelColor || '').toLowerCase() || null) as OrderItem['enamel_color'],
  });
}

export function demandKeyForItem(item: ReconcileCatalogItem, options: ReconcileKeyOptions): string {
  if (item.line_id || isSpecialCreationSku(item.sku)) {
    return buildItemIdentityKey({
      sku: (item.sku || '').toUpperCase(),
      variant_suffix: (item.variant_suffix || '').toUpperCase(),
      size_info: (item.size_info || '').toUpperCase(),
      cord_color: ((item.cord_color || '').toLowerCase() || null) as OrderItem['cord_color'],
      enamel_color: ((item.enamel_color || '').toLowerCase() || null) as OrderItem['enamel_color'],
      line_id: item.line_id ?? null,
    });
  }
  const naturalKey = getNaturalCatalogKey(
    item.sku,
    item.variant_suffix,
    item.size_info,
    item.cord_color,
    item.enamel_color,
  );
  return options.naturalKeyDemandCount[naturalKey] > 1 ? `${naturalKey}::${item.notes || ''}` : naturalKey;
}

export function supplyKeyForBatch(batch: ProductionBatch, options: ReconcileKeyOptions): string {
  if (batch.line_id || isSpecialCreationSku(batch.sku)) {
    return buildItemIdentityKey({
      sku: (batch.sku || '').toUpperCase(),
      variant_suffix: (batch.variant_suffix || '').toUpperCase(),
      size_info: (batch.size_info || '').toUpperCase(),
      cord_color: ((batch.cord_color || '').toLowerCase() || null) as OrderItem['cord_color'],
      enamel_color: ((batch.enamel_color || '').toLowerCase() || null) as OrderItem['enamel_color'],
      line_id: batch.line_id ?? null,
    });
  }
  const naturalKey = getNaturalCatalogKey(
    batch.sku,
    batch.variant_suffix,
    batch.size_info,
    batch.cord_color,
    batch.enamel_color,
  );
  return options.naturalKeyDemandCount[naturalKey] > 1 ? `${naturalKey}::${batch.notes || ''}` : naturalKey;
}

export function buildNaturalKeyDemandCount(items: ReconcileCatalogItem[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    if (isSpecialCreationSku(item.sku)) continue;
    const key = getNaturalCatalogKey(
      item.sku,
      item.variant_suffix,
      item.size_info,
      item.cord_color,
      item.enamel_color,
    );
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

export type LineIdBindingResult = {
  items: OrderItem[];
  batchLineIdUpdates: Array<{ batchId: string; line_id: string }>;
};

/** Bind stable line_id values between order rows and existing batches before reconciliation. */
export function bindProductionLineIds(items: OrderItem[], batches: ProductionBatch[]): LineIdBindingResult {
  const batchLineIdUpdates: Array<{ batchId: string; line_id: string }> = [];
  const unmatchedBatches = batches.filter((batch) => !batch.line_id);

  const nextItems = items.map((item) => {
    if (item.line_id || isSpecialCreationSku(item.sku)) return item;

    const naturalKey = buildItemIdentityKey({ ...item, line_id: null });
    const batchIndex = unmatchedBatches.findIndex(
      (batch) => buildItemIdentityKey({ ...batch, line_id: null }) === naturalKey,
    );
    if (batchIndex === -1) {
      return { ...item, line_id: crypto.randomUUID() };
    }

    const batch = unmatchedBatches.splice(batchIndex, 1)[0];
    const lineId = crypto.randomUUID();
    batchLineIdUpdates.push({ batchId: batch.id, line_id: lineId });
    return { ...item, line_id: lineId };
  });

  return { items: nextItems, batchLineIdUpdates };
}

export type BatchIdentityMorph = {
  batchId: string;
  item: ReconcileCatalogItem;
};

export type BatchIdentitySubstitution = {
  batchIds: string[];
  item: ReconcileCatalogItem;
  quantity: number;
};

function catalogIdentityMatches(
  batch: Pick<ProductionBatch, 'sku' | 'variant_suffix' | 'size_info' | 'cord_color' | 'enamel_color'>,
  item: ReconcileCatalogItem,
): boolean {
  return (
    (batch.sku || '').toUpperCase() === (item.sku || '').toUpperCase() &&
    (batch.variant_suffix || '').toUpperCase() === (item.variant_suffix || '').toUpperCase() &&
    (batch.size_info || '').toUpperCase() === (item.size_info || '').toUpperCase() &&
    ((batch.cord_color || '').toLowerCase() || '') === ((item.cord_color || '').toLowerCase() || '') &&
    ((batch.enamel_color || '').toLowerCase() || '') === ((item.enamel_color || '').toLowerCase() || '')
  );
}

/** Morph batches that share a line_id with an order row whose catalog identity changed. */
export function planLineIdIdentityMorphs(
  items: ReconcileCatalogItem[],
  batches: ProductionBatch[],
): BatchIdentityMorph[] {
  const morphs: BatchIdentityMorph[] = [];
  const usedBatchIds = new Set<string>();

  for (const item of items) {
    if (!item.line_id) continue;
    for (const batch of batches) {
      if (usedBatchIds.has(batch.id)) continue;
      if (batch.line_id !== item.line_id) continue;
      usedBatchIds.add(batch.id);
      if (!catalogIdentityMatches(batch, item)) {
        morphs.push({ batchId: batch.id, item });
      }
      break;
    }
  }

  return morphs;
}

type DemandSupplyMaps = {
  demandMap: Record<string, { qty: number; item: ReconcileCatalogItem }>;
  supplyMap: Record<string, ProductionBatch[]>;
};

function buildDemandSupplyMaps(
  items: ReconcileCatalogItem[],
  batches: ProductionBatch[],
  shippedByDemandKey: Record<string, number>,
): DemandSupplyMaps {
  const naturalKeyDemandCount = buildNaturalKeyDemandCount(items);
  const keyOptions: ReconcileKeyOptions = { naturalKeyDemandCount };

  const demandMap: Record<string, { qty: number; item: ReconcileCatalogItem }> = {};
  for (const item of items) {
    const key = demandKeyForItem(item, keyOptions);
    if (!demandMap[key]) demandMap[key] = { qty: 0, item };
    demandMap[key].qty += item.quantity;
  }

  for (const key of Object.keys(shippedByDemandKey)) {
    if (demandMap[key]) {
      demandMap[key].qty = Math.max(0, demandMap[key].qty - shippedByDemandKey[key]);
    }
  }

  const supplyMap: Record<string, ProductionBatch[]> = {};
  for (const batch of batches) {
    const key = supplyKeyForBatch(batch, keyOptions);
    if (!supplyMap[key]) supplyMap[key] = [];
    supplyMap[key].push(batch);
  }

  return { demandMap, supplyMap };
}

/**
 * When a single catalog identity is replaced by another on the same master SKU
 * (e.g. DA082HSB → DA082HMAX), morph the existing batch instead of delete+create.
 */
export function planSameSkuIdentitySubstitutions(
  items: ReconcileCatalogItem[],
  batches: ProductionBatch[],
  shippedByDemandKey: Record<string, number>,
): BatchIdentitySubstitution[] {
  const { demandMap, supplyMap } = buildDemandSupplyMaps(items, batches, shippedByDemandKey);
  const allKeys = new Set([...Object.keys(demandMap), ...Object.keys(supplyMap)]);

  const orphanSurplus: Array<{ key: string; qty: number; batches: ProductionBatch[] }> = [];
  const orphanDeficit: Array<{ key: string; qty: number; item: ReconcileCatalogItem }> = [];

  for (const key of allKeys) {
    const targetQty = demandMap[key]?.qty || 0;
    const existingList = supplyMap[key] || [];
    const currentQty = existingList.reduce((sum, batch) => sum + batch.quantity, 0);
    if (targetQty === 0 && currentQty > 0) {
      orphanSurplus.push({ key, qty: currentQty, batches: existingList });
    } else if (targetQty > 0 && currentQty === 0) {
      orphanDeficit.push({ key, qty: targetQty, item: demandMap[key].item });
    }
  }

  if (orphanSurplus.length !== 1 || orphanDeficit.length !== 1) return [];
  const surplus = orphanSurplus[0];
  const deficit = orphanDeficit[0];
  if (surplus.qty !== deficit.qty) return [];
  if (isSpecialCreationSku(surplus.batches[0]?.sku) || isSpecialCreationSku(deficit.item.sku)) return [];
  if (surplus.batches.some((batch) => batch.sku !== deficit.item.sku)) return [];

  const sortedSupply = [...surplus.batches].sort((a, b) => {
    const stages = Object.values(ProductionStage);
    return stages.indexOf(a.current_stage) - stages.indexOf(b.current_stage);
  });

  return [{ batchIds: sortedSupply.map((batch) => batch.id), item: deficit.item, quantity: deficit.qty }];
}