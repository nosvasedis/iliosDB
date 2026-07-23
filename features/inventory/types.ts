import type { Offer, Order } from '../../types';

export interface InventoryIdentity {
  productSku: string;
  variantSuffix: string;
  sizeInfo: string;
  warehouseId: string;
}

export interface InventoryAvailability extends InventoryIdentity {
  warehouseName: string;
  warehouseType: string;
  onHand: number;
  reserved: number;
  available: number;
  incoming: number;
  outstandingDemand: number;
  productionDemand: number;
  purchaseDemand: number;
  projectedAvailable: number;
  reorderPoint: number;
  preferredSupplierId: string | null;
  updatedAt: string;
}

export type InventoryOperationType =
  | 'order_reservation'
  | 'reservation_release'
  | 'adjustment'
  | 'transfer_out'
  | 'transfer_in'
  | 'supplier_receipt'
  | 'shipment_issue'
  | 'shipment_reversal'
  | 'legacy_issue_reversal'
  | 'opening_reconciliation';

export interface InventoryEvent extends InventoryIdentity {
  id: string;
  sequenceNo: number;
  operationType: InventoryOperationType | string;
  onHandDelta: number;
  reservedDelta: number;
  onHandAfter: number;
  reservedAfter: number;
  referenceType: string | null;
  referenceId: string | null;
  referenceLineId: string | null;
  transferGroupId: string | null;
  reversalOf: string | null;
  actorUserId: string | null;
  actorName: string | null;
  reason: string;
  createdAt: string;
}

export interface InventoryReservation extends InventoryIdentity {
  id: string;
  orderId: string;
  orderLineId: string;
  initialQuantity: number;
  quantity: number;
  state: 'active' | 'released' | 'consumed';
  createdAt: string;
  updatedAt: string;
}

export interface InventoryAllocationPreview extends InventoryIdentity {
  lineId: string;
  requested: number;
  reserved: number;
  shortage: number;
}

export interface SaveOrderInventoryResult {
  order: Order;
  allocations: InventoryAllocationPreview[];
  idempotent?: boolean;
}

export interface InventoryAdjustmentInput extends InventoryIdentity {
  mode: 'set' | 'delta';
  quantity: number;
  reason: string;
  idempotencyKey?: string;
}

export interface InventoryTransferInput {
  productSku: string;
  variantSuffix: string;
  sizeInfo: string;
  sourceWarehouseId: string;
  destinationWarehouseId: string;
  quantity: number;
  reason: string;
  idempotencyKey?: string;
}

export interface InventoryReorderPolicyInput extends InventoryIdentity {
  reorderPoint: number;
  preferredSupplierId?: string | null;
}

export interface InventoryReconciliationStatus {
  blockingCount: number;
  warningCount: number;
  lastCheckedAt: string | null;
}

export interface InventoryReconciliationIssue {
  id: string;
  issueType: string;
  severity: 'blocking' | 'warning';
  productSku: string | null;
  variantSuffix: string;
  sizeInfo: string;
  warehouseId: string | null;
  expectedQuantity: number | null;
  actualQuantity: number | null;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface ConvertOfferInventoryInput {
  offer: Offer;
  order: Order;
  idempotencyKey?: string;
}

export interface ShipOrderInventoryInput {
  orderId: string;
  shippedBy: string;
  items: Array<{
    sku: string;
    variant_suffix?: string | null;
    size_info?: string | null;
    cord_color?: string | null;
    enamel_color?: string | null;
    quantity: number;
    price_at_order: number;
    line_id?: string | null;
  }>;
  deliveryPlanId?: string | null;
  notes?: string | null;
  nextPlan?: Record<string, unknown> | null;
  nextReminders?: Array<Record<string, unknown>>;
  idempotencyKey?: string;
}

export interface RevertShipmentInventoryInput {
  orderId: string;
  shipmentId: string;
  idempotencyKey?: string;
}

export type InventoryMutationName =
  | 'save-order'
  | 'release-order'
  | 'set-order-status'
  | 'delete-order'
  | 'adjustment'
  | 'transfer'
  | 'supplier-receipt'
  | 'ship-order'
  | 'revert-shipment'
  | 'offer-conversion'
  | 'reorder-policy';
