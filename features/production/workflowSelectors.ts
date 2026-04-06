import { AssemblyPrintRow, Collection, EnhancedProductionBatch, Material, MaterialType, Order, OrderStatus, Product, ProductVariant, ProductionBatch, ProductionStage, StageBatchPrintData } from '../../types';
import { formatOrderId } from '../../utils/orderUtils';
import { PRODUCTION_STAGE_ORDER_INDEX } from '../../utils/productionStages';
import { getVariantComponents } from '../../utils/pricingEngine';
import { getBatchStageChronologyTimestamp } from './selectors';
import { RETAIL_CUSTOMER_ID, RETAIL_CUSTOMER_NAME } from '../../lib/supabase';
import { extractRetailClientFromNotes } from '../../utils/retailNotes';
import { requiresAssemblyStage } from '../../constants';
import { isSpecialCreationSku } from '../../utils/specialCreationSku';

export type ProductionDisplayGroupMode = 'gender' | 'customer';
export type ProductionDisplaySortOrder = 'alpha' | 'newest' | 'oldest';
export type LabelPrintSortMode = 'as_sent' | 'customer';

export interface ProductionLabelPrintItem {
  product: Product;
  variant?: ProductVariant;
  quantity: number;
  size?: string;
  format: 'standard';
}

type ProductionDisplayBatch = EnhancedProductionBatch & { customer_name?: string };

function compareBatchesBySkuForDisplay(a: ProductionDisplayBatch, b: ProductionDisplayBatch): number {
  const fullA = `${a.sku}${a.variant_suffix || ''}`;
  const fullB = `${b.sku}${b.variant_suffix || ''}`;
  return fullA.localeCompare(fullB, undefined, { numeric: true, sensitivity: 'base' });
}

function minMaxChronologyForBatches(batches: ProductionDisplayBatch[]): { minT: number; maxT: number } {
  let minT = Infinity;
  let maxT = -Infinity;
  batches.forEach((batch) => {
    const t = getBatchStageChronologyTimestamp(batch);
    if (t < minT) minT = t;
    if (t > maxT) maxT = t;
  });
  return {
    minT: minT === Infinity ? 0 : minT,
    maxT: maxT === -Infinity ? 0 : maxT,
  };
}

/**
 * Order top-level keys (e.g. customer names) for one stage column using the batches visible there.
 */
export function sortProductionDisplayLevel1Keys(
  level1Keys: string[],
  groupedData: Record<string, Record<string, ProductionDisplayBatch[]>>,
  groupMode: ProductionDisplayGroupMode,
  sortOrder: ProductionDisplaySortOrder,
): string[] {
  if (groupMode !== 'customer') return level1Keys;

  return [...level1Keys].sort((a, b) => {
    if (sortOrder === 'alpha') {
      return a.localeCompare(b, 'el', { sensitivity: 'base' });
    }

    const agg = (key: string) => {
      const byColl = groupedData[key];
      if (!byColl) return { minT: 0, maxT: 0 };
      let minT = Infinity;
      let maxT = -Infinity;
      Object.values(byColl).forEach((batches) => {
        const { minT: lo, maxT: hi } = minMaxChronologyForBatches(batches);
        if (lo < minT) minT = lo;
        if (hi > maxT) maxT = hi;
      });
      return {
        minT: minT === Infinity ? 0 : minT,
        maxT: maxT === -Infinity ? 0 : maxT,
      };
    };

    const aa = agg(a);
    const ab = agg(b);

    if (sortOrder === 'newest') {
      if (ab.maxT !== aa.maxT) return ab.maxT - aa.maxT;
    } else if (sortOrder === 'oldest') {
      if (aa.minT !== ab.minT) return aa.minT - ab.minT;
    }

    return a.localeCompare(b, 'el', { sensitivity: 'base' });
  });
}
type MobileFoundBatch = EnhancedProductionBatch & { customer_name?: string; customerName?: string };
type MobilePrintSelectorBatch = ProductionBatch & { customer_name?: string };

export interface MobilePrintSelectorGroup {
  name: string;
  items: MobilePrintSelectorBatch[];
}

export interface MobileSettingStoneItem {
  name: string;
  description?: string;
  quantity: number;
  unit: string;
}

export interface AssemblyOrderCandidate {
  order: Order;
  rows: AssemblyPrintRow[];
  assemblySkuCount: number;
  totalAssemblyQty: number;
}

export interface MobileSettingStoneOrderListItem {
  key: string;
  orderId: string | null;
  customerName: string;
  batchCount: number;
}

export function getNextProductionStage(currentStage: ProductionStage, batch: ProductionBatch): ProductionStage | null {
  const stages = [
    ProductionStage.AwaitingDelivery,
    ProductionStage.Waxing,
    ProductionStage.Casting,
    ProductionStage.Setting,
    ProductionStage.Polishing,
    ProductionStage.Assembly,
    ProductionStage.Labeling,
    ProductionStage.Ready,
  ];

  const currentIndex = stages.indexOf(currentStage);
  if (currentIndex === -1 || currentIndex === stages.length - 1) return null;

  if (batch.product_details?.production_type === 'Imported' && currentStage === ProductionStage.AwaitingDelivery) {
    return ProductionStage.Labeling;
  }

  let nextIndex = currentIndex + 1;
  if (stages[nextIndex] === ProductionStage.Setting && !batch.requires_setting) {
    nextIndex++;
  }
  if (stages[nextIndex] === ProductionStage.Assembly && !batch.requires_assembly) {
    nextIndex++;
  }

  return stages[nextIndex] || null;
}

export function getMobileProductionNextStage(batch: ProductionBatch): ProductionStage | null {
  return getNextProductionStage(batch.current_stage, batch);
}

export function groupProductionBatchesByStage<T extends ProductionBatch>(batches: T[]): Record<string, T[]> {
  return batches.reduce<Record<string, T[]>>((acc, batch) => {
    if (!acc[batch.current_stage]) acc[batch.current_stage] = [];
    acc[batch.current_stage].push(batch);
    return acc;
  }, {});
}

export function groupProductionBatchesForDisplay(
  batches: ProductionDisplayBatch[],
  collectionsMap: Map<number, Pick<Collection, 'name'>>,
  groupMode: ProductionDisplayGroupMode,
  sortOrder: ProductionDisplaySortOrder,
): Record<string, Record<string, ProductionDisplayBatch[]>> {
  const groups: Record<string, Record<string, ProductionDisplayBatch[]>> = {};

  batches.forEach((batch) => {
    const level1Key =
      groupMode === 'customer'
        ? batch.customer_name || 'Χωρίς Πελάτη'
        : batch.product_details?.gender || 'Unknown';

    let collectionName = 'Γενικά';
    const collectionIds = batch.product_details?.collections || [];
    if (collectionIds.length > 0) {
      const collection = collectionsMap.get(collectionIds[0]);
      if (collection) collectionName = collection.name;
    }

    if (!groups[level1Key]) groups[level1Key] = {};
    if (!groups[level1Key][collectionName]) groups[level1Key][collectionName] = [];
    groups[level1Key][collectionName].push(batch);
  });

  Object.keys(groups).forEach((level1Key) => {
    const inner = groups[level1Key];
    Object.keys(inner).forEach((collectionKey) => {
      inner[collectionKey].sort((a, b) => {
        if (sortOrder === 'newest' || sortOrder === 'oldest') {
          const timeA = getBatchStageChronologyTimestamp(a);
          const timeB = getBatchStageChronologyTimestamp(b);
          const primary = sortOrder === 'newest' ? timeB - timeA : timeA - timeB;
          if (primary !== 0) return primary;
          return compareBatchesBySkuForDisplay(a, b);
        }

        return compareBatchesBySkuForDisplay(a, b);
      });
    });

    // Preserve insertion order of collection sub-groups: alpha (el) or by chronology so
    // newest/oldest applies across collections, not only inside each collection bucket.
    const collKeys = Object.keys(inner);
    collKeys.sort((a, b) => {
      if (sortOrder === 'alpha') {
        return a.localeCompare(b, 'el', { sensitivity: 'base' });
      }
      const sa = minMaxChronologyForBatches(inner[a]);
      const sb = minMaxChronologyForBatches(inner[b]);
      if (sortOrder === 'newest') {
        if (sb.maxT !== sa.maxT) return sb.maxT - sa.maxT;
      } else if (sortOrder === 'oldest') {
        if (sa.minT !== sb.minT) return sa.minT - sb.minT;
      }
      return a.localeCompare(b, 'el', { sensitivity: 'base' });
    });

    const reordered: Record<string, ProductionDisplayBatch[]> = {};
    collKeys.forEach((k) => {
      reordered[k] = inner[k];
    });
    groups[level1Key] = reordered;
  });

  return groups;
}

export function buildLabelPrintQueue(
  selected: ProductionDisplayBatch[],
  mode: LabelPrintSortMode,
  productsMap: Map<string, Product>,
): ProductionLabelPrintItem[] {
  return [...selected]
    .sort((a, b) => {
      if (mode === 'customer') {
        const nameA = a.customer_name || '';
        const nameB = b.customer_name || '';
        const byCustomer = nameA.localeCompare(nameB, 'el', { sensitivity: 'base' });
        if (byCustomer !== 0) return byCustomer;
      }

      const byStageChronology = getBatchStageChronologyTimestamp(a) - getBatchStageChronologyTimestamp(b);
      if (byStageChronology !== 0) return byStageChronology;

      const byCreatedAt = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (byCreatedAt !== 0) return byCreatedAt;

      return `${a.sku}${a.variant_suffix || ''}`.localeCompare(`${b.sku}${b.variant_suffix || ''}`, undefined, { numeric: true, sensitivity: 'base' });
    })
    .flatMap((batch) => {
      const product = productsMap.get(batch.sku);
      if (!product) return [];

      const printItem: ProductionLabelPrintItem = {
        product,
        quantity: batch.quantity,
        size: batch.size_info || undefined,
        format: 'standard',
      };

      const variant = product.variants?.find((candidate) => (candidate.suffix || '') === (batch.variant_suffix || ''));
      if (variant) printItem.variant = variant;

      return [printItem];
    });
}

/** Minimum finder term length (after trim). */
export const PRODUCTION_FINDER_MIN_TERM_LENGTH = 2;

export type ProductionFinderBatchFields = Pick<
  ProductionBatch,
  'sku' | 'current_stage' | 'order_id' | 'variant_suffix'
> & { customer_name?: string | null };

export function normalizeProductionFinderTerm(finderTerm: string): string | null {
  const term = finderTerm.trim().toUpperCase();
  if (term.length < PRODUCTION_FINDER_MIN_TERM_LENGTH) return null;
  return term;
}

/**
 * Letter-led alphanumeric queries (e.g. XR, DA, PN1) use SKU-prefix matching only,
 * so order_id / customer overlaps do not pull unrelated SKUs from the same order.
 */
export function isStrictProductionFinderSkuQuery(term: string): boolean {
  return /^[A-Z]{2}[A-Z0-9]*$/.test(term);
}

export function matchesProductionFinderBatch(batch: ProductionFinderBatchFields, term: string): boolean {
  const fullSku = `${batch.sku}${batch.variant_suffix || ''}`.toUpperCase();
  const skuMatch = fullSku.startsWith(term);

  if (isStrictProductionFinderSkuQuery(term)) {
    return skuMatch;
  }

  const orderMatch = (batch.order_id || '').toUpperCase().includes(term);
  const customerMatch = !!(batch.customer_name && batch.customer_name.toUpperCase().includes(term));
  return skuMatch || orderMatch || customerMatch;
}

export function compareProductionFinderBatches(
  a: ProductionFinderBatchFields,
  b: ProductionFinderBatchFields,
  term: string,
): number {
  const stageA = PRODUCTION_STAGE_ORDER_INDEX[a.current_stage] ?? 99;
  const stageB = PRODUCTION_STAGE_ORDER_INDEX[b.current_stage] ?? 99;
  if (stageA !== stageB) return stageA - stageB;

  const fullA = `${a.sku}${a.variant_suffix || ''}`.toUpperCase();
  const fullB = `${b.sku}${b.variant_suffix || ''}`.toUpperCase();
  const aExact = fullA === term;
  const bExact = fullB === term;
  if (aExact === bExact) return 0;
  return aExact ? -1 : 1;
}

export function filterAndSortProductionFinderBatches<T extends ProductionFinderBatchFields>(
  batches: T[],
  finderTerm: string,
): T[] {
  const term = normalizeProductionFinderTerm(finderTerm);
  if (!term) return [];

  return batches
    .filter((batch) => matchesProductionFinderBatch(batch, term))
    .sort((a, b) => compareProductionFinderBatches(a, b, term));
}

export function buildMobileProductionFoundBatches(
  enrichedBatches: MobileFoundBatch[],
  finderTerm: string,
): MobileFoundBatch[] {
  return filterAndSortProductionFinderBatches(enrichedBatches, finderTerm).map((batch) => ({
    ...batch,
    customerName: batch.customer_name || 'Άγνωστο',
  }));
}

export function groupMobilePrintSelectorBatches(
  batches: MobilePrintSelectorBatch[],
  searchTerm = '',
): Array<[string, MobilePrintSelectorGroup]> {
  const groups: Record<string, MobilePrintSelectorGroup> = {};

  batches.forEach((batch) => {
    const key = batch.order_id || 'no_order';
    if (!groups[key]) {
      groups[key] = {
        name: batch.customer_name
          ? `${batch.customer_name}${batch.order_id ? ` (#${formatOrderId(batch.order_id)})` : ''}`
          : (batch.order_id ? `Παραγγελία #${formatOrderId(batch.order_id)}` : 'Χωρίς Παραγγελία'),
        items: [],
      };
    }
    groups[key].items.push(batch);
  });

  return Object.entries(groups)
    .sort((a, b) => b[1].items.length - a[1].items.length)
    .filter(([_, group]) => group.name.toLowerCase().includes(searchTerm.toLowerCase())
      || group.items.some((item) => item.sku.toLowerCase().includes(searchTerm.toLowerCase())))
    .map(([key, group]) => [key, group]);
}

export function buildMobileSettingStoneOrderGroups(
  settingBatches: MobilePrintSelectorBatch[],
): Map<string, MobilePrintSelectorBatch[]> {
  const orderGroups = new Map<string, MobilePrintSelectorBatch[]>();
  settingBatches.forEach((batch) => {
    const key = batch.order_id || '__none__';
    const arr = orderGroups.get(key) || [];
    arr.push(batch);
    orderGroups.set(key, arr);
  });
  return orderGroups;
}

export function buildMobileSettingStoneOrderList(
  orderGroups: Map<string, MobilePrintSelectorBatch[]>,
  orders: Order[],
): MobileSettingStoneOrderListItem[] {
  return Array.from(orderGroups.entries()).map(([key, batches]) => {
    const order = key !== '__none__' ? orders.find((candidate) => candidate.id === key) : null;
    return {
      key,
      orderId: key !== '__none__' ? key : null,
      customerName: order?.customer_name || batches[0]?.customer_name || 'Χωρίς Πελάτη',
      batchCount: batches.length,
    };
  });
}

export function buildMobileSettingStoneBreakdown(
  orderGroups: Map<string, MobilePrintSelectorBatch[]>,
  selectedOrderKey: string | null,
  allProducts: Product[],
  allMaterials: Material[],
): MobileSettingStoneItem[] {
  if (!selectedOrderKey) return [];
  const orderBatches = orderGroups.get(selectedOrderKey) || [];
  const stoneMap = new Map<string, MobileSettingStoneItem>();

  orderBatches.forEach((batch) => {
    const product = allProducts.find((candidate) => candidate.sku === batch.sku);
    if (!product) return;

    let hasRecipeStones = false;
    product.recipe.forEach((item) => {
      if (item.type !== 'raw') return;
      const mat = allMaterials.find((material) => material.id === item.id);
      if (!mat || mat.type !== MaterialType.Stone) return;
      hasRecipeStones = true;

      const totalQty = item.quantity * batch.quantity;
      const existing = stoneMap.get(mat.id);
      if (existing) existing.quantity += totalQty;
      else stoneMap.set(mat.id, { name: mat.name, description: mat.description, quantity: totalQty, unit: mat.unit || 'τεμ' });
    });

    if (!hasRecipeStones) {
      const { stone } = getVariantComponents(batch.variant_suffix || '', product.gender);
      if (stone.code) {
        const key = `sfx_${stone.code}`;
        const existing = stoneMap.get(key);
        if (existing) existing.quantity += batch.quantity;
        else stoneMap.set(key, { name: stone.name || stone.code, quantity: batch.quantity, unit: 'τεμ' });
      }
    }
  });

  return Array.from(stoneMap.values()).sort((a, b) => b.quantity - a.quantity);
}

export function buildAssemblyOrderCandidates(
  orders: Order[],
  batches: Array<EnhancedProductionBatch | ProductionBatch>,
): AssemblyOrderCandidate[] {
  if (!orders || orders.length === 0) return [];

  const readyQtyByKey = new Map<string, number>();
  batches.forEach((batch) => {
    if (!batch.order_id) return;
    if (batch.current_stage !== ProductionStage.Ready) return;
    const key = [
      batch.order_id,
      batch.sku,
      batch.variant_suffix || '',
      batch.size_info || '',
    ].join('::');
    readyQtyByKey.set(key, (readyQtyByKey.get(key) || 0) + (batch.quantity || 0));
  });

  return orders
    .filter((order) =>
      !order.is_archived &&
      (order.status === OrderStatus.Pending || order.status === OrderStatus.InProduction) &&
      order.items.some((item) => requiresAssemblyStage(item.sku) && !isSpecialCreationSku(item.sku)),
    )
    .map((order) => {
      const qtyByKey = new Map<string, number>();
      const notesByKey = new Map<string, Set<string>>();

      const isRetailOrder =
        order.customer_id === RETAIL_CUSTOMER_ID ||
        order.customer_name === RETAIL_CUSTOMER_NAME;
      const { retailClientLabel } = extractRetailClientFromNotes(order.notes);
      const displayCustomerName =
        isRetailOrder && retailClientLabel
          ? `${RETAIL_CUSTOMER_NAME} - ${retailClientLabel}`
          : order.customer_name;

      order.items.forEach((item) => {
        if (!requiresAssemblyStage(item.sku) || isSpecialCreationSku(item.sku)) return;

        const key = [
          order.id,
          item.sku,
          item.variant_suffix || '',
          item.size_info || '',
        ].join('::');

        qtyByKey.set(key, (qtyByKey.get(key) || 0) + (item.quantity || 0));
        if (item.notes && item.notes.trim()) {
          if (!notesByKey.has(key)) notesByKey.set(key, new Set());
          notesByKey.get(key)!.add(item.notes.trim());
        }
      });

      const rows = Array.from(qtyByKey.entries())
        .map(([key, orderedQty], idx) => {
          const [orderId, sku, variantSuffix, sizeInfo] = key.split('::');
          const readyQty = readyQtyByKey.get(key) || 0;
          const remainingQty = Math.max(0, orderedQty - readyQty);
          if (remainingQty <= 0) return null;

          const notes = Array.from(notesByKey.get(key) || [])
            .filter(Boolean)
            .join(' - ');

          return {
            id: `assembly-order-${order.id}-${idx}`,
            order_id: orderId,
            customer_name: displayCustomerName,
            sku,
            variant_suffix: variantSuffix || undefined,
            size_info: sizeInfo || undefined,
            quantity: remainingQty,
            notes: notes || undefined,
          } as AssemblyPrintRow;
        })
        .filter((row): row is AssemblyPrintRow => row !== null)
        .sort((a, b) => {
          const skuA = `${a.sku}${a.variant_suffix || ''}`.toUpperCase();
          const skuB = `${b.sku}${b.variant_suffix || ''}`.toUpperCase();
          const bySku = skuA.localeCompare(skuB, undefined, { numeric: true });
          if (bySku !== 0) return bySku;
          return (a.size_info || '').localeCompare(b.size_info || '');
        });

      return {
        order,
        rows,
        assemblySkuCount: rows.length,
        totalAssemblyQty: rows.reduce((sum, row) => sum + row.quantity, 0),
      } as AssemblyOrderCandidate;
    })
    .filter((candidate) => candidate.rows.length > 0)
    .sort((a, b) => new Date(b.order.created_at).getTime() - new Date(a.order.created_at).getTime());
}

export function buildStageBatchPrintPayload(
  selected: ProductionBatch[],
  stageId: ProductionStage,
  stageName: string,
): StageBatchPrintData | null {
  if (!selected.length) return null;

  const orderIds = [...new Set(selected.map((batch) => (batch.order_id || '').trim()).filter(Boolean))];
  let customerName: string;
  let orderId: string;

  if (orderIds.length === 1) {
    orderId = orderIds[0];
    customerName = selected.find((batch) => (batch.order_id || '').trim() === orderId)?.customer_name?.trim() || '—';
  } else if (orderIds.length === 0) {
    orderId = '';
    const names = [...new Set(selected.map((batch) => (batch.customer_name || '').trim()).filter(Boolean))];
    customerName =
      names.length === 1 ? names[0]
      : names.length > 1 ? `Διάφοροι πελάτες (${names.length})`
      : 'Χωρίς πελάτη';
  } else {
    orderId = '';
    customerName = `Πολλαπλές εντολές (${orderIds.length})`;
  }

  return {
    stageName,
    stageId,
    customerName,
    orderId,
    batches: selected,
    generatedAt: new Date().toISOString(),
  };
}
