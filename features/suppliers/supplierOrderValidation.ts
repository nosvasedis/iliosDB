import type { SupplierOrderItem } from '../../types';
import { api } from '../../lib/supabase';
import { buildSupplierPurchaseNeedPlan } from './purchaseNeedPlanner';

export type SupplierOrderDraftConflict = {
  sourceId: string;
  customer: string;
  requestedQty: number;
  availableQty: number;
};

export function hasSmartSupplierAllocations(items: SupplierOrderItem[]): boolean {
  return items.some((item) => (item.source_allocations?.length || 0) > 0);
}

export async function validateSupplierOrderDraftLive(input: {
  supplierId: string;
  items: SupplierOrderItem[];
  currentSupplierOrderId?: string | null;
}): Promise<SupplierOrderDraftConflict[]> {
  if (!hasSmartSupplierAllocations(input.items)) return [];
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('Η αποθήκευση έξυπνης εντολής απαιτεί σύνδεση για τελικό έλεγχο.');
  }

  const [products, orders, productionBatches, shipments, shipmentItems, supplierOrders] = await Promise.all([
    api.getProducts(),
    api.getOrders(),
    api.getProductionBatches(),
    api.getOrderShipments(),
    api.getAllOrderShipmentItems(),
    api.getSupplierOrders(),
  ]);
  const plan = buildSupplierPurchaseNeedPlan({
    supplierId: input.supplierId,
    products,
    orders,
    productionBatches,
    shipments,
    shipmentItems,
    supplierOrders,
    currentSupplierOrderId: input.currentSupplierOrderId,
  });
  const availableBySource = new Map<string, number>();
  for (const need of [...plan.productionNeeds, ...plan.pendingOrderNeeds]) {
    for (const requirement of need.requirements) {
      availableBySource.set(requirement.sourceId, (availableBySource.get(requirement.sourceId) || 0) + requirement.quantity);
    }
  }

  const requestedBySource = new Map<string, { customer: string; quantity: number }>();
  for (const item of input.items) {
    for (const allocation of item.source_allocations || []) {
      const existing = requestedBySource.get(allocation.source_id) || { customer: allocation.customer, quantity: 0 };
      existing.quantity += allocation.quantity;
      requestedBySource.set(allocation.source_id, existing);
    }
  }

  return [...requestedBySource.entries()].flatMap(([sourceId, requested]) => {
    const availableQty = availableBySource.get(sourceId) || 0;
    return requested.quantity > availableQty
      ? [{ sourceId, customer: requested.customer, requestedQty: requested.quantity, availableQty }]
      : [];
  });
}

