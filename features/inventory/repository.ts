import type { Offer, Order, SupplierOrder, Warehouse } from '../../types';
import { SYSTEM_IDS, isLocalMode, supabase } from '../../lib/supabase';
import { toInventoryOperationError } from './greek';
import type {
  ConvertOfferInventoryInput,
  InventoryAdjustmentInput,
  InventoryAvailability,
  InventoryEvent,
  InventoryPostingInput,
  InventoryPostingResult,
  InventoryReconciliationStatus,
  InventoryReconciliationIssue,
  InventoryReorderPolicyInput,
  InventoryReservation,
  InventoryTransferInput,
  SaveOrderInventoryResult,
  ShipOrderInventoryInput,
  RevertShipmentInventoryInput,
} from './types';
import { normalizeInventorySizeInfo } from './posting';

type AvailabilityRow = {
  product_sku: string;
  variant_suffix: string;
  size_info: string;
  warehouse_id: string;
  warehouse_name: string;
  warehouse_type: string;
  on_hand: number | string;
  reserved: number | string;
  available: number | string;
  incoming: number | string;
  outstanding_demand: number | string;
  production_demand: number | string;
  purchase_demand: number | string;
  projected_available: number | string;
  reorder_point: number | string;
  preferred_supplier_id: string | null;
  updated_at: string;
};

function operationKey(prefix: string): string {
  return `${prefix}:${crypto.randomUUID()}`;
}

function assertOnline(): void {
  const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
  if (isLocalMode || isOffline) {
    throw new Error('Οι μεταβολές αποθέματος απαιτούν ενεργή σύνδεση. Τα διαθέσιμα στοιχεία παραμένουν μόνο για ανάγνωση.');
  }
}

function normalizeOrderInventoryIdentities(order: Order): Order {
  return {
    ...order,
    items: order.items.map((item) => ({
      ...item,
      size_info: normalizeInventorySizeInfo(item.size_info) || undefined,
    })),
  };
}

function mapAvailability(row: AvailabilityRow): InventoryAvailability {
  return {
    productSku: row.product_sku,
    variantSuffix: row.variant_suffix || '',
    sizeInfo: normalizeInventorySizeInfo(row.size_info),
    warehouseId: row.warehouse_id,
    warehouseName: row.warehouse_name,
    warehouseType: row.warehouse_type,
    onHand: Number(row.on_hand || 0),
    reserved: Number(row.reserved || 0),
    available: Number(row.available || 0),
    incoming: Number(row.incoming || 0),
    outstandingDemand: Number(row.outstanding_demand || 0),
    productionDemand: Number(row.production_demand || 0),
    purchaseDemand: Number(row.purchase_demand || 0),
    projectedAvailable: Number(row.projected_available || 0),
    reorderPoint: Number(row.reorder_point || 0),
    preferredSupplierId: row.preferred_supplier_id,
    updatedAt: row.updated_at,
  };
}

export const inventoryRepository = {
  async getAvailability(): Promise<InventoryAvailability[]> {
    const { data, error } = await supabase
      .from('inventory_availability_v')
      .select('*')
      .order('product_sku')
      .order('variant_suffix')
      .order('size_info')
      .order('warehouse_name');
    if (error) throw toInventoryOperationError('save-order', error);
    return ((data || []) as AvailabilityRow[]).map(mapAvailability);
  },

  async getMovementHistory(limit = 250): Promise<InventoryEvent[]> {
    const { data, error } = await supabase
      .from('inventory_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw toInventoryOperationError('adjustment', error);
    return (data || []).map((row: any) => ({
      id: row.id,
      sequenceNo: Number(row.sequence_no || 0),
      operationType: row.operation_type,
      productSku: row.product_sku,
      variantSuffix: row.variant_suffix || '',
      sizeInfo: normalizeInventorySizeInfo(row.size_info),
      warehouseId: row.warehouse_id,
      onHandDelta: Number(row.on_hand_delta || 0),
      reservedDelta: Number(row.reserved_delta || 0),
      onHandAfter: Number(row.on_hand_after || 0),
      reservedAfter: Number(row.reserved_after || 0),
      referenceType: row.reference_type,
      referenceId: row.reference_id,
      referenceLineId: row.reference_line_id,
      transferGroupId: row.transfer_group_id,
      reversalOf: row.reversal_of,
      actorUserId: row.actor_user_id,
      actorName: row.actor_name,
      reason: row.reason,
      createdAt: row.created_at,
    }));
  },

  async getOrderReservations(orderId: string): Promise<InventoryReservation[]> {
    const { data, error } = await supabase
      .from('inventory_reservations')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at');
    if (error) throw toInventoryOperationError('save-order', error);
    return (data || []).map((row: any) => ({
      id: row.id,
      orderId: row.order_id,
      orderLineId: row.order_line_id,
      productSku: row.product_sku,
      variantSuffix: row.variant_suffix || '',
      sizeInfo: normalizeInventorySizeInfo(row.size_info),
      warehouseId: row.warehouse_id,
      initialQuantity: Number(row.initial_quantity || 0),
      quantity: Number(row.quantity || 0),
      state: row.state,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  },

  async getReconciliationStatus(): Promise<InventoryReconciliationStatus> {
    const { data, error } = await supabase
      .from('inventory_reconciliation_status_v')
      .select('*')
      .single();
    if (error) throw toInventoryOperationError('adjustment', error);
    return {
      blockingCount: Number(data?.blocking_count || 0),
      warningCount: Number(data?.warning_count || 0),
      lastCheckedAt: data?.last_checked_at || null,
    };
  },

  async getReconciliationIssues(): Promise<InventoryReconciliationIssue[]> {
    const { data, error } = await supabase
      .from('inventory_reconciliation_issues')
      .select('*')
      .is('resolved_at', null)
      .order('severity')
      .order('created_at');
    if (error) throw toInventoryOperationError('adjustment', error);
    return (data || []).map((row: any) => ({
      id: row.id,
      issueType: row.issue_type,
      severity: row.severity,
      productSku: row.product_sku,
      variantSuffix: row.variant_suffix || '',
      sizeInfo: normalizeInventorySizeInfo(row.size_info),
      warehouseId: row.warehouse_id,
      expectedQuantity: row.expected_quantity == null ? null : Number(row.expected_quantity),
      actualQuantity: row.actual_quantity == null ? null : Number(row.actual_quantity),
      details: row.details || {},
      createdAt: row.created_at,
    }));
  },

  async resolveReconciliationIssue(input: { issueId: string; resolutionNote: string; targetOnHand?: number | null; targetWarehouseId?: string | null }): Promise<void> {
    assertOnline();
    const { error } = await supabase.rpc('resolve_inventory_reconciliation_issue_v1', {
      p_issue_id: input.issueId,
      p_resolution_note: input.resolutionNote,
      p_target_on_hand: input.targetOnHand ?? null,
      p_idempotency_key: operationKey(`reconciliation:${input.issueId}`),
      p_target_warehouse_id: input.targetWarehouseId ?? null,
    });
    if (error) throw toInventoryOperationError('adjustment', error);
  },

  async saveOrderAndReserve(order: Order, idempotencyKey = operationKey(`order:${order.id}`)): Promise<SaveOrderInventoryResult> {
    assertOnline();
    const { data, error } = await supabase.rpc('save_order_with_inventory_v1', {
      p_order: normalizeOrderInventoryIdentities(order),
      p_idempotency_key: idempotencyKey,
    });
    if (error) throw toInventoryOperationError('save-order', error);
    return data as SaveOrderInventoryResult;
  },

  async releaseOrder(orderId: string, reason: string, idempotencyKey = operationKey(`order-release:${orderId}`)): Promise<number> {
    assertOnline();
    const { data, error } = await supabase.rpc('release_order_inventory_v1', {
      p_order_id: orderId,
      p_reason: reason,
      p_idempotency_key: idempotencyKey,
    });
    if (error) throw toInventoryOperationError('release-order', error);
    return Number(data || 0);
  },

  async setOrderStatus(orderId: string, status: string, idempotencyKey = operationKey(`order-status:${orderId}:${status}`)): Promise<void> {
    assertOnline();
    const { error } = await supabase.rpc('set_order_status_with_inventory_v1', {
      p_order_id: orderId,
      p_status: status,
      p_idempotency_key: idempotencyKey,
    });
    if (error) throw toInventoryOperationError('set-order-status', error);
  },

  async deleteOrder(orderId: string, idempotencyKey = operationKey(`order-delete:${orderId}`)): Promise<void> {
    assertOnline();
    const { error } = await supabase.rpc('delete_order_with_inventory_v1', {
      p_order_id: orderId,
      p_idempotency_key: idempotencyKey,
    });
    if (error) throw toInventoryOperationError('delete-order', error);
  },

  async adjustStock(input: InventoryAdjustmentInput): Promise<void> {
    assertOnline();
    const { error } = await supabase.rpc('adjust_inventory_stock_v1', {
      p_product_sku: input.productSku,
      p_variant_suffix: input.variantSuffix || '',
      p_size_info: normalizeInventorySizeInfo(input.sizeInfo),
      p_warehouse_id: input.warehouseId,
      p_mode: input.mode,
      p_quantity: input.quantity,
      p_reason: input.reason,
      p_idempotency_key: input.idempotencyKey || operationKey(`adjustment:${input.productSku}`),
    });
    if (error) throw toInventoryOperationError('adjustment', error);
  },

  async postInventoryEntries(input: InventoryPostingInput): Promise<InventoryPostingResult> {
    assertOnline();
    const idempotencyKey = input.idempotencyKey || operationKey('inventory-posting');
    const { data, error } = await supabase.rpc('post_inventory_entries_v1', {
      p_mode: input.mode,
      p_lines: input.lines.map((line) => ({
        product_sku: line.productSku,
        variant_suffix: line.variantSuffix || '',
        size_info: normalizeInventorySizeInfo(line.sizeInfo),
        warehouse_id: line.warehouseId,
        quantity: line.quantity,
      })),
      p_reason: input.reason,
      p_idempotency_key: idempotencyKey,
    });
    if (error) throw toInventoryOperationError('inventory-posting', error);

    const result = (data || {}) as any;
    return {
      postedCount: Number(result.posted_count || 0),
      changedCount: Number(result.changed_count || 0),
      countedZeroCount: Number(result.counted_zero_count || 0),
      idempotent: Boolean(result.idempotent),
      balances: Array.isArray(result.balances)
        ? result.balances.map((row: any) => ({
          productSku: String(row.product_sku || ''),
          variantSuffix: String(row.variant_suffix || ''),
          sizeInfo: normalizeInventorySizeInfo(row.size_info),
          warehouseId: String(row.warehouse_id || ''),
          onHand: Number(row.on_hand || 0),
          reserved: Number(row.reserved || 0),
          available: Number(row.available || 0),
        }))
        : [],
    };
  },

  async batchAdjustStock(
    items: Array<{ productSku: string; variantSuffix?: string; sizeInfo?: string; quantity: number }>,
    warehouseId: string,
    reason: string,
    idempotencyKey = operationKey('batch-adjustment'),
  ): Promise<number> {
    assertOnline();
    const { data, error } = await supabase.rpc('batch_adjust_inventory_stock_v1', {
      p_items: items.map((item) => ({
        product_sku: item.productSku,
        variant_suffix: item.variantSuffix || '',
        size_info: normalizeInventorySizeInfo(item.sizeInfo),
        quantity: item.quantity,
      })),
      p_warehouse_id: warehouseId,
      p_reason: reason,
      p_idempotency_key: idempotencyKey,
    });
    if (error) throw toInventoryOperationError('adjustment', error);
    return Number(data || 0);
  },

  async transferStock(input: InventoryTransferInput): Promise<void> {
    assertOnline();
    const { error } = await supabase.rpc('transfer_inventory_stock_v1', {
      p_product_sku: input.productSku,
      p_variant_suffix: input.variantSuffix || '',
      p_size_info: normalizeInventorySizeInfo(input.sizeInfo),
      p_source_warehouse_id: input.sourceWarehouseId,
      p_destination_warehouse_id: input.destinationWarehouseId,
      p_quantity: input.quantity,
      p_reason: input.reason,
      p_idempotency_key: input.idempotencyKey || operationKey(`transfer:${input.productSku}`),
    });
    if (error) throw toInventoryOperationError('transfer', error);
  },

  async setReorderPolicy(input: InventoryReorderPolicyInput): Promise<void> {
    assertOnline();
    const { error } = await supabase.rpc('set_inventory_reorder_policy_v1', {
      p_product_sku: input.productSku,
      p_variant_suffix: input.variantSuffix || '',
      p_size_info: normalizeInventorySizeInfo(input.sizeInfo),
      p_warehouse_id: input.warehouseId,
      p_reorder_point: input.reorderPoint,
      p_preferred_supplier_id: input.preferredSupplierId || null,
    });
    if (error) throw toInventoryOperationError('reorder-policy', error);
  },

  async receiveSupplierOrder(order: SupplierOrder, warehouseId = order.receipt_warehouse_id || SYSTEM_IDS.CENTRAL): Promise<void> {
    assertOnline();
    const { error } = await supabase.rpc('receive_supplier_order_inventory_v1', {
      p_order_id: order.id,
      p_warehouse_id: warehouseId,
      p_idempotency_key: operationKey(`supplier-receipt:${order.id}`),
    });
    if (error) throw toInventoryOperationError('supplier-receipt', error);
  },

  async shipOrder(input: ShipOrderInventoryInput): Promise<Record<string, unknown>> {
    assertOnline();
    const { data, error } = await supabase.rpc('create_partial_shipment_v2', {
      p_order_id: input.orderId,
      p_shipped_by: input.shippedBy,
      p_items: input.items.map((item) => ({
        ...item,
        size_info: normalizeInventorySizeInfo(item.size_info) || null,
      })),
      p_delivery_plan_id: input.deliveryPlanId || null,
      p_notes: input.notes || null,
      p_next_plan: input.nextPlan || null,
      p_next_reminders: input.nextReminders || [],
      p_idempotency_key: input.idempotencyKey || operationKey(`shipment:${input.orderId}`),
    });
    if (error) throw toInventoryOperationError('ship-order', error);
    return (data || {}) as Record<string, unknown>;
  },

  async revertShipment(input: RevertShipmentInventoryInput): Promise<Record<string, unknown>> {
    assertOnline();
    const { data, error } = await supabase.rpc('revert_partial_shipment_v2', {
      p_order_id: input.orderId,
      p_shipment_id: input.shipmentId,
      p_idempotency_key: input.idempotencyKey || `shipment-revert:${input.shipmentId}`,
    });
    if (error) throw toInventoryOperationError('revert-shipment', error);
    return (data || {}) as Record<string, unknown>;
  },

  async convertOfferToOrder(input: ConvertOfferInventoryInput): Promise<{ orderId: string }> {
    assertOnline();
    const { data, error } = await supabase.rpc('convert_offer_to_order_v1', {
      p_offer_id: input.offer.id,
      p_order: normalizeOrderInventoryIdentities(input.order),
      p_idempotency_key: input.idempotencyKey || operationKey(`offer:${input.offer.id}`),
    });
    if (error) throw toInventoryOperationError('offer-conversion', error);
    return { orderId: String((data as any)?.order_id || input.order.id) };
  },

  async saveWarehouse(warehouse: Partial<Warehouse> & { name: string; type: Warehouse['type'] }): Promise<void> {
    assertOnline();
    const payload = {
      ...warehouse,
      id: warehouse.id || crypto.randomUUID(),
      is_system: warehouse.is_system || false,
    };
    const query = warehouse.id
      ? supabase.from('warehouses').update(payload).eq('id', warehouse.id)
      : supabase.from('warehouses').insert(payload);
    const { error } = await query;
    if (error) throw toInventoryOperationError('adjustment', error);
  },

  async deleteWarehouse(warehouseId: string): Promise<void> {
    assertOnline();
    if (warehouseId === SYSTEM_IDS.CENTRAL || warehouseId === SYSTEM_IDS.SHOWROOM) {
      throw new Error('Οι αποθήκες συστήματος δεν μπορούν να διαγραφούν.');
    }
    const { error } = await supabase.from('warehouses').delete().eq('id', warehouseId);
    if (error) throw toInventoryOperationError('adjustment', error);
  },
};

export function withOfferSource(order: Order, offer: Offer): Order {
  return { ...order, source_offer_id: offer.id };
}
