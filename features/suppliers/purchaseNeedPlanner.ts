import {
  Order,
  OrderShipment,
  OrderShipmentItem,
  OrderStatus,
  Product,
  ProductionBatch,
  ProductionStage,
  ProductionType,
  SupplierOrder,
  SupplierOrderItem,
  SupplierOrderSourceAllocation,
} from '../../types';
import { getRelevantProductionBatchesForOrderItem } from '../production/productionSendPlanner';
import { getShippedQuantitiesForOrderLines, itemKey } from '../../utils/shipmentUtils';

export type SupplierOrderNeedRequirement = {
  id: string;
  sourceType: 'production_batch' | 'customer_order';
  sourceId: string;
  orderId: string;
  lineId?: string | null;
  customer: string;
  quantity: number;
  orderCreatedAt?: string;
  orderNote?: string;
  itemNote?: string;
  productionNote?: string;
};

export type SupplierOrderGroupedNeed = {
  sku: string;
  variant: string;
  size?: string;
  cordColor?: string | null;
  enamelColor?: string | null;
  totalQty: number;
  product?: Product;
  requirements: SupplierOrderNeedRequirement[];
};

export type SupplierPurchaseNeedPlan = {
  productionNeeds: SupplierOrderGroupedNeed[];
  pendingOrderNeeds: SupplierOrderGroupedNeed[];
  unassignedNeeds: SupplierOrderGroupedNeed[];
};

export type SupplierPurchaseNeedPlannerInput = {
  supplierId: string;
  products: Product[];
  orders: Order[];
  productionBatches: ProductionBatch[];
  shipments?: OrderShipment[];
  shipmentItems?: OrderShipmentItem[];
  supplierOrders?: SupplierOrder[];
  currentDraftItems?: SupplierOrderItem[];
  currentSupplierOrderId?: string | null;
};

type WorkingRequirement = SupplierOrderNeedRequirement & {
  sku: string;
  variant: string;
  size?: string;
  cordColor?: string | null;
  enamelColor?: string | null;
  product?: Product;
  batchCreatedAt?: string;
  remaining: number;
};

const normalized = (value: string | null | undefined) => (value || '').trim().toLocaleUpperCase('el-GR');

export function supplierPurchaseIdentity(input: {
  sku: string;
  variant?: string | null;
  size?: string | null;
  cordColor?: string | null;
  enamelColor?: string | null;
}): string {
  return [
    normalized(input.sku),
    normalized(input.variant),
    normalized(input.size),
    (input.cordColor || '').trim().toLocaleLowerCase('el-GR'),
    (input.enamelColor || '').trim().toLocaleLowerCase('el-GR'),
  ].join('::');
}

function supplierStockIdentity(input: { sku: string; variant?: string | null; size?: string | null }): string {
  return [normalized(input.sku), normalized(input.variant), normalized(input.size)].join('::');
}

function deriveVariant(item: SupplierOrderItem, product?: Product): string {
  if (item.variant_suffix !== undefined && item.variant_suffix !== null) return item.variant_suffix;
  const sku = item.item_id.trim();
  const display = item.item_name.trim();
  if (!sku || !display.startsWith(sku)) return '';
  const suffix = display.slice(sku.length).trim();
  return product?.variants?.some((variant) => variant.suffix === suffix) ? suffix : '';
}

export function supplierOrderItemIdentity(item: SupplierOrderItem, products: Product[]): string {
  const product = products.find((candidate) => candidate.sku === item.item_id);
  return supplierPurchaseIdentity({
    sku: item.item_id,
    variant: deriveVariant(item, product),
    size: item.size_info,
    cordColor: item.cord_color,
    enamelColor: item.enamel_color,
  });
}

export function supplierOrderItemAllocationQty(item: SupplierOrderItem): number {
  return (item.source_allocations || []).reduce((sum, allocation) => sum + Math.max(0, Number(allocation.quantity || 0)), 0);
}

export function supplierOrderItemManualQty(item: SupplierOrderItem): number {
  if (item.manual_quantity !== undefined) return Math.max(0, Number(item.manual_quantity || 0));
  return Math.max(0, Number(item.quantity || 0) - supplierOrderItemAllocationQty(item));
}

export function allocationFromRequirement(requirement: SupplierOrderNeedRequirement): SupplierOrderSourceAllocation {
  return {
    id: requirement.id,
    source_type: requirement.sourceType,
    source_id: requirement.sourceId,
    order_id: requirement.orderId || undefined,
    line_id: requirement.lineId,
    customer: requirement.customer,
    quantity: requirement.quantity,
    order_created_at: requirement.orderCreatedAt,
    order_note: requirement.orderNote,
    item_note: requirement.itemNote,
    production_note: requirement.productionNote,
  };
}

function stockForRequirement(requirement: WorkingRequirement): number {
  const product = requirement.product;
  if (!product) return 0;
  const variant = requirement.variant
    ? product.variants?.find((candidate) => candidate.suffix === requirement.variant)
    : undefined;
  if (requirement.size) {
    const bySize = variant?.stock_by_size || product.stock_by_size;
    return Math.max(0, Number(bySize?.[requirement.size] || 0));
  }
  return Math.max(0, Number(variant ? variant.stock_qty : product.stock_qty || 0));
}

function consumeRequirement(requirement: WorkingRequirement, quantity: number): number {
  const used = Math.min(requirement.remaining, Math.max(0, quantity));
  requirement.remaining -= used;
  return used;
}

function applyExactAllocations(requirements: WorkingRequirement[], allocations: SupplierOrderSourceAllocation[]): void {
  const bySource = new Map(requirements.map((requirement) => [requirement.sourceId, requirement]));
  for (const allocation of allocations) {
    const requirement = bySource.get(allocation.source_id);
    if (!requirement || requirement.sourceType !== allocation.source_type) continue;
    consumeRequirement(requirement, allocation.quantity);
  }
}

function applyPools(
  requirements: WorkingRequirement[],
  pools: Map<string, number>,
  keyForRequirement: (requirement: WorkingRequirement) => string,
): void {
  for (const requirement of requirements) {
    if (requirement.remaining <= 0) continue;
    const key = keyForRequirement(requirement);
    const available = pools.get(key) || 0;
    if (available <= 0) continue;
    const used = consumeRequirement(requirement, available);
    pools.set(key, available - used);
  }
}

function groupRequirements(requirements: WorkingRequirement[]): SupplierOrderGroupedNeed[] {
  const groups = new Map<string, SupplierOrderGroupedNeed>();
  for (const requirement of requirements) {
    if (requirement.remaining <= 0) continue;
    const key = supplierPurchaseIdentity(requirement);
    if (!groups.has(key)) {
      groups.set(key, {
        sku: requirement.sku,
        variant: requirement.variant,
        size: requirement.size,
        cordColor: requirement.cordColor,
        enamelColor: requirement.enamelColor,
        totalQty: 0,
        product: requirement.product,
        requirements: [],
      });
    }
    const group = groups.get(key)!;
    group.totalQty += requirement.remaining;
    group.requirements.push({ ...requirement, quantity: requirement.remaining });
  }
  return [...groups.values()].sort((a, b) => {
    const skuCompare = `${a.sku}${a.variant}`.localeCompare(`${b.sku}${b.variant}`, undefined, { numeric: true });
    return skuCompare || (a.size || '').localeCompare(b.size || '', undefined, { numeric: true });
  });
}

function activeDemandOrder(order: Order): boolean {
  return !order.is_archived && order.status !== OrderStatus.Delivered && order.status !== OrderStatus.Cancelled;
}

/** Build the deterministic, supplier-specific net shortage used by both builders and save validation. */
export function buildSupplierPurchaseNeedPlan(input: SupplierPurchaseNeedPlannerInput): SupplierPurchaseNeedPlan {
  const productsBySku = new Map(input.products.map((product) => [product.sku, product]));
  const ordersById = new Map(input.orders.map((order) => [order.id, order]));
  const shipmentIdsByOrder = new Map<string, Set<string>>();
  for (const shipment of input.shipments || []) {
    const ids = shipmentIdsByOrder.get(shipment.order_id) || new Set<string>();
    ids.add(shipment.id);
    shipmentIdsByOrder.set(shipment.order_id, ids);
  }

  const productionRequirements: WorkingRequirement[] = [];
  const unassignedRequirements: WorkingRequirement[] = [];
  for (const batch of input.productionBatches) {
    if (batch.current_stage !== ProductionStage.AwaitingDelivery) continue;
    const product = productsBySku.get(batch.sku);
    if (!product) continue;
    if (product.supplier_id !== input.supplierId && product.supplier_id) continue;
    const order = batch.order_id ? ordersById.get(batch.order_id) : undefined;
    const orderItem = order?.items.find((item) =>
      item.sku === batch.sku
      && (item.variant_suffix || '') === (batch.variant_suffix || '')
      && (item.size_info || '') === (batch.size_info || '')
      && (!batch.line_id || item.line_id === batch.line_id)
    );
    const requirement: WorkingRequirement = {
      id: `production_batch:${batch.id}`,
      sourceType: 'production_batch',
      sourceId: batch.id,
      orderId: batch.order_id || '',
      lineId: batch.line_id,
      customer: order?.customer_name || (batch.order_id ? 'Άγνωστος' : 'Χωρίς σύνδεση παραγγελίας'),
      quantity: batch.quantity,
      orderCreatedAt: order?.created_at || batch.created_at,
      orderNote: order?.notes,
      itemNote: orderItem?.notes,
      productionNote: batch.notes,
      sku: batch.sku,
      variant: batch.variant_suffix || '',
      size: batch.size_info || undefined,
      cordColor: batch.cord_color,
      enamelColor: batch.enamel_color,
      product,
      batchCreatedAt: batch.created_at,
      remaining: batch.quantity,
    };
    if (!product.supplier_id) unassignedRequirements.push(requirement);
    else productionRequirements.push(requirement);
  }

  const pendingRequirements: WorkingRequirement[] = [];
  for (const order of input.orders.filter(activeDemandOrder).sort((a, b) =>
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime() || a.id.localeCompare(b.id)
  )) {
    const shipmentIds = shipmentIdsByOrder.get(order.id) || new Set<string>();
    const orderShipmentItems = (input.shipmentItems || []).filter((item) => shipmentIds.has(item.shipment_id));
    const shippedByLine = getShippedQuantitiesForOrderLines(order.items, orderShipmentItems);
    const occurrenceByKey = new Map<string, number>();

    order.items.forEach((item) => {
      const product = productsBySku.get(item.sku);
      if (product?.supplier_id !== input.supplierId || product.production_type !== ProductionType.Imported) return;
      const lineKey = itemKey(item.sku, item.variant_suffix, item.size_info, item.cord_color, item.enamel_color, item.line_id);
      const shipped = shippedByLine.get(lineKey) || 0;
      const represented = getRelevantProductionBatchesForOrderItem(item, order.items, input.productionBatches.filter((batch) => batch.order_id === order.id))
        .reduce((sum, batch) => sum + batch.quantity, 0);
      const remaining = Math.max(0, Number(item.quantity || 0) - shipped - represented);
      if (remaining <= 0) return;
      const naturalLineKey = supplierPurchaseIdentity({
        sku: item.sku,
        variant: item.variant_suffix,
        size: item.size_info,
        cordColor: item.cord_color,
        enamelColor: item.enamel_color,
      });
      const occurrence = occurrenceByKey.get(naturalLineKey) || 0;
      occurrenceByKey.set(naturalLineKey, occurrence + 1);
      const sourceId = item.line_id
        ? `${order.id}:line:${item.line_id}`
        : `${order.id}:item:${naturalLineKey}:${occurrence}`;
      pendingRequirements.push({
        id: `customer_order:${sourceId}`,
        sourceType: 'customer_order',
        sourceId,
        orderId: order.id,
        lineId: item.line_id,
        customer: order.customer_name,
        quantity: remaining,
        orderCreatedAt: order.created_at,
        orderNote: order.notes,
        itemNote: item.notes,
        sku: item.sku,
        variant: item.variant_suffix || '',
        size: item.size_info || undefined,
        cordColor: item.cord_color,
        enamelColor: item.enamel_color,
        product,
        remaining,
      });
    });
  }

  const exactAllocations: SupplierOrderSourceAllocation[] = [];
  const allocationFallbacks: Array<{ allocation: SupplierOrderSourceAllocation; key: string; productionOnly: boolean }> = [];
  const generalReservations = new Map<string, number>();
  const legacyReceivedReservations: Array<{ key: string; quantity: number; receivedAt: string }> = [];

  const collectLine = (item: SupplierOrderItem, status: SupplierOrder['status'], receivedAt?: string) => {
    if (item.item_type !== 'Product') return;
    const allocations = item.source_allocations || [];
    if (status === 'Pending') {
      exactAllocations.push(...allocations);
      allocationFallbacks.push(...allocations.map((allocation) => ({ allocation, key: supplierOrderItemIdentity(item, input.products), productionOnly: false })));
    }
    if (status === 'Received') {
      exactAllocations.push(...allocations.filter((allocation) => allocation.source_type === 'production_batch'));
      allocationFallbacks.push(...allocations
        .filter((allocation) => allocation.source_type === 'customer_order')
        .map((allocation) => ({ allocation, key: supplierOrderItemIdentity(item, input.products), productionOnly: true })));
    }
    const generalQty = supplierOrderItemManualQty(item);
    const key = supplierOrderItemIdentity(item, input.products);
    if (status === 'Pending' && generalQty > 0) {
      generalReservations.set(key, (generalReservations.get(key) || 0) + generalQty);
    } else if (status === 'Received' && allocations.length === 0 && generalQty > 0 && receivedAt) {
      legacyReceivedReservations.push({ key, quantity: generalQty, receivedAt });
    }
  };

  for (const supplierOrder of input.supplierOrders || []) {
    if (supplierOrder.id === input.currentSupplierOrderId || supplierOrder.supplier_id !== input.supplierId) continue;
    if (supplierOrder.status === 'Cancelled') continue;
    supplierOrder.items.forEach((item) => collectLine(item, supplierOrder.status, supplierOrder.received_at));
  }
  for (const item of input.currentDraftItems || []) collectLine(item, 'Pending');

  applyExactAllocations([...productionRequirements, ...pendingRequirements], exactAllocations);

  // A pending-order source can later become an Awaiting Delivery batch. Preserve its reservation
  // across that lifecycle transition by falling back to the same order line and purchase identity.
  const allRequirements = [...productionRequirements, ...pendingRequirements];
  const availableSourceIds = new Set(allRequirements.map((requirement) => requirement.sourceId));
  for (const { allocation, key, productionOnly } of allocationFallbacks) {
    if (availableSourceIds.has(allocation.source_id)) continue;
    let remaining = allocation.quantity;
    for (const requirement of allRequirements) {
      if (remaining <= 0) break;
      if (productionOnly && requirement.sourceType !== 'production_batch') continue;
      if (requirement.orderId !== (allocation.order_id || '')) continue;
      if (allocation.line_id && requirement.lineId !== allocation.line_id) continue;
      if (supplierPurchaseIdentity(requirement) !== key) continue;
      remaining -= consumeRequirement(requirement, remaining);
    }
  }

  // Received legacy lines can only fulfill awaiting batches that already existed at receipt time.
  for (const reservation of legacyReceivedReservations) {
    let remaining = reservation.quantity;
    for (const requirement of productionRequirements) {
      if (remaining <= 0) break;
      if (supplierPurchaseIdentity(requirement) !== reservation.key) continue;
      if (requirement.batchCreatedAt && new Date(requirement.batchCreatedAt) > new Date(reservation.receivedAt)) continue;
      remaining -= consumeRequirement(requirement, remaining);
    }
  }

  // Free stock is allocated once, FIFO, only to demand not already represented by a production batch.
  const stockPools = new Map<string, number>();
  for (const requirement of pendingRequirements) {
    const key = supplierStockIdentity(requirement);
    if (!stockPools.has(key)) stockPools.set(key, stockForRequirement(requirement));
  }
  applyPools(pendingRequirements, stockPools, supplierStockIdentity);

  // Legacy/manual PO quantities reserve remaining demand FIFO by exact purchase identity.
  applyPools([...productionRequirements, ...pendingRequirements], generalReservations, supplierPurchaseIdentity);

  return {
    productionNeeds: groupRequirements(productionRequirements),
    pendingOrderNeeds: groupRequirements(pendingRequirements),
    unassignedNeeds: groupRequirements(unassignedRequirements),
  };
}
