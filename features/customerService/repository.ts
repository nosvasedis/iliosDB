import { isLocalMode, supabase } from '../../lib/supabase';
import type {
  Consignment,
  ConsignmentAllocation,
  ConsignmentEvent,
  ConsignmentLine,
  ConsignmentPayment,
  ConsignmentReturn,
  ConsignmentSettlement,
  RepairAttachment,
  RepairCharge,
  RepairCostLine,
  RepairCycle,
  RepairEvent,
  RepairIntake,
  RepairItem,
  RepairStatus,
} from '../../types';
import { customerServiceErrorMessage } from './greek';
import type {
  BulkConsignmentGroupInput,
  CustomerServiceWorkspaceData,
  RepairIntakeInput,
} from './types';

function operationKey(prefix: string): string {
  return `${prefix}:${crypto.randomUUID()}`;
}

function assertOnline(): void {
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  if (isLocalMode || offline) {
    throw new Error('Η ενέργεια απαιτεί ενεργή σύνδεση. Δεν πραγματοποιήθηκε καμία μεταβολή.');
  }
}

async function rows<T>(table: string, orderColumn = 'created_at'): Promise<T[]> {
  const { data, error } = await supabase.from(table).select('*').order(orderColumn, { ascending: false });
  if (error) throw new Error(customerServiceErrorMessage(error));
  return (data || []) as T[];
}

export const customerServiceRepository = {
  async getWorkspaceData(): Promise<CustomerServiceWorkspaceData> {
    const [
      consignments,
      consignmentLines,
      consignmentAllocations,
      consignmentSettlements,
      consignmentPayments,
      consignmentReturns,
      consignmentEvents,
      repairIntakes,
      repairItems,
      repairCycles,
      repairCostLines,
      repairCharges,
      repairAttachments,
      repairEvents,
    ] = await Promise.all([
      rows<Consignment>('consignments'),
      rows<ConsignmentLine>('consignment_lines'),
      rows<ConsignmentAllocation>('consignment_allocations'),
      rows<ConsignmentSettlement>('consignment_settlements', 'sold_at'),
      rows<ConsignmentPayment>('consignment_payments', 'paid_at'),
      rows<ConsignmentReturn>('consignment_returns', 'received_at'),
      rows<ConsignmentEvent>('consignment_events'),
      rows<RepairIntake>('repair_intakes'),
      rows<RepairItem>('repair_items'),
      rows<RepairCycle>('repair_cycles'),
      rows<RepairCostLine>('repair_cost_lines'),
      rows<RepairCharge>('repair_charges'),
      rows<RepairAttachment>('repair_attachments'),
      rows<RepairEvent>('repair_events'),
    ]);
    return {
      consignments,
      consignmentLines,
      consignmentAllocations,
      consignmentSettlements,
      consignmentPayments,
      consignmentReturns,
      consignmentEvents,
      repairIntakes,
      repairItems: repairItems.map((item) => ({ ...item, received_at: item.created_at })),
      repairCycles,
      repairCostLines,
      repairCharges,
      repairAttachments,
      repairEvents,
    };
  },

  async createBulkConsignments(groups: BulkConsignmentGroupInput[]) {
    assertOnline();
    const { data, error } = await supabase.rpc('create_bulk_consignments_v1', {
      p_groups: groups,
      p_idempotency_key: operationKey('consignment-bulk'),
    });
    if (error) throw new Error(customerServiceErrorMessage(error));
    return data;
  },

  async getConsignmentInventoryReconciliation(): Promise<Array<{ product_sku: string; variant_suffix: string; size_info: string; expected_quantity: number; actual_quantity: number; difference: number }>> {
    assertOnline();
    const { data, error } = await supabase.rpc('get_consignment_inventory_reconciliation_v1');
    if (error) throw new Error(customerServiceErrorMessage(error));
    return (data || []) as Array<{ product_sku: string; variant_suffix: string; size_info: string; expected_quantity: number; actual_quantity: number; difference: number }>;
  },

  async handoffConsignment(consignmentId: string) {
    assertOnline();
    const { data, error } = await supabase.rpc('handoff_consignment_v1', {
      p_consignment_id: consignmentId,
      p_idempotency_key: operationKey(`consignment-handoff:${consignmentId}`),
    });
    if (error) throw new Error(customerServiceErrorMessage(error));
    return data;
  },

  async overrideConsignmentPrice(lineId: string, unitPrice: number, reason: string) {
    assertOnline();
    const { data, error } = await supabase.rpc('override_consignment_line_price_v1', {
      p_line_id: lineId,
      p_new_unit_price: unitPrice,
      p_reason: reason,
    });
    if (error) throw new Error(customerServiceErrorMessage(error));
    return data;
  },

  async recordConsignmentSale(input: { lineId: string; quantity: number; unitPrice: number; reason?: string | null }) {
    assertOnline();
    const { data, error } = await supabase.rpc('settle_consignment_sale_v1', {
      p_line_id: input.lineId,
      p_quantity: input.quantity,
      p_unit_price: input.unitPrice,
      p_price_override_reason: input.reason || null,
      p_idempotency_key: operationKey(`consignment-sale:${input.lineId}`),
    });
    if (error) throw new Error(customerServiceErrorMessage(error));
    return data;
  },

  async recordConsignmentPayment(input: { settlementId: string; amount: number; method?: string; notes?: string }) {
    assertOnline();
    const { data, error } = await supabase.rpc('record_consignment_payment_v1', {
      p_settlement_id: input.settlementId,
      p_amount: input.amount,
      p_payment_method: input.method || null,
      p_notes: input.notes || null,
      p_idempotency_key: operationKey(`consignment-payment:${input.settlementId}`),
    });
    if (error) throw new Error(customerServiceErrorMessage(error));
    return data;
  },

  async receiveConsignmentReturn(input: { lineId: string; quantity: number; notes?: string }) {
    assertOnline();
    const { data, error } = await supabase.rpc('receive_consignment_return_v1', {
      p_line_id: input.lineId,
      p_quantity: input.quantity,
      p_notes: input.notes || null,
      p_idempotency_key: operationKey(`consignment-return:${input.lineId}`),
    });
    if (error) throw new Error(customerServiceErrorMessage(error));
    return data;
  },

  async routeConsignmentReturn(input: { returnId: string; resolution: 'restocked' | 'production' | 'damaged'; destinationWarehouseId?: string | null; reason: string }) {
    assertOnline();
    const { data, error } = await supabase.rpc('route_consignment_return_v1', {
      p_return_id: input.returnId,
      p_resolution: input.resolution,
      p_destination_warehouse_id: input.destinationWarehouseId || null,
      p_reason: input.reason,
      p_idempotency_key: operationKey(`consignment-route:${input.returnId}`),
    });
    if (error) throw new Error(customerServiceErrorMessage(error));
    return data;
  },

  async createConsignmentLegalDraft(settlementId: string): Promise<string> {
    assertOnline();
    const { data, error } = await supabase.rpc('create_consignment_legal_draft_v1', {
      p_settlement_id: settlementId,
    });
    if (error) throw new Error(customerServiceErrorMessage(error));
    return String(data);
  },

  async reverseConsignmentSettlement(settlementId: string, reason: string) {
    assertOnline();
    const { data, error } = await supabase.rpc('reverse_consignment_settlement_v1', {
      p_settlement_id: settlementId,
      p_reason: reason,
      p_idempotency_key: operationKey(`consignment-sale-reversal:${settlementId}`),
    });
    if (error) throw new Error(customerServiceErrorMessage(error));
    return data;
  },

  async reverseConsignmentReturn(returnId: string, reason: string) {
    assertOnline();
    const { data, error } = await supabase.rpc('reverse_consignment_return_v1', {
      p_return_id: returnId,
      p_reason: reason,
      p_idempotency_key: operationKey(`consignment-return-reversal:${returnId}`),
    });
    if (error) throw new Error(customerServiceErrorMessage(error));
    return data;
  },

  async cancelConsignment(consignmentId: string, reason: string) {
    assertOnline();
    const { data, error } = await supabase.rpc('cancel_consignment_v1', {
      p_consignment_id: consignmentId,
      p_reason: reason,
      p_idempotency_key: operationKey(`consignment-cancel:${consignmentId}`),
    });
    if (error) throw new Error(customerServiceErrorMessage(error));
    return data;
  },

  async createRepairIntake(input: RepairIntakeInput) {
    assertOnline();
    const { data, error } = await supabase.rpc('create_repair_intake_v1', {
      p_customer_id: input.customerId,
      p_seller_id: input.sellerId || null,
      p_items: input.items,
      p_notes: input.notes || null,
      p_idempotency_key: operationKey('repair-intake'),
    });
    if (error) throw new Error(customerServiceErrorMessage(error));
    return data;
  },

  async completeRepairQualityCheck(input: { repairItemId: string; passed: boolean; notes?: string; returnStage?: string }) {
    assertOnline();
    const { data, error } = await supabase.rpc('complete_repair_quality_check_v1', {
      p_repair_item_id: input.repairItemId,
      p_passed: input.passed,
      p_notes: input.notes || null,
      p_return_stage: input.returnStage || null,
      p_idempotency_key: operationKey(`repair-quality:${input.repairItemId}`),
    });
    if (error) throw new Error(customerServiceErrorMessage(error));
    return data;
  },

  async markRepairDelivered(repairItemId: string) {
    assertOnline();
    const { data, error } = await supabase.rpc('mark_repair_delivered_v1', {
      p_repair_item_id: repairItemId,
      p_idempotency_key: operationKey(`repair-delivered:${repairItemId}`),
    });
    if (error) throw new Error(customerServiceErrorMessage(error));
    return data;
  },

  async setRepairExceptionState(repairItemId: string, status: Extract<RepairStatus, 'on_hold' | 'irreparable' | 'cancelled' | 'in_production'>, reason: string) {
    assertOnline();
    const { data, error } = await supabase.rpc('set_repair_exception_state_v1', {
      p_repair_item_id: repairItemId,
      p_status: status,
      p_reason: reason,
    });
    if (error) throw new Error(customerServiceErrorMessage(error));
    return data;
  },

  async recordRepairCost(input: {
    repairItemId: string;
    costType: 'labor' | 'material' | 'component' | 'external';
    description: string;
    quantity: number;
    unitCost: number;
    productSku?: string | null;
    variantSuffix?: string;
    sizeInfo?: string;
    warehouseId?: string | null;
  }) {
    assertOnline();
    const { data, error } = await supabase.rpc('record_repair_cost_line_v1', {
      p_repair_item_id: input.repairItemId,
      p_cost_type: input.costType,
      p_description: input.description,
      p_quantity: input.quantity,
      p_unit_cost: input.unitCost,
      p_product_sku: input.productSku || null,
      p_variant_suffix: input.variantSuffix || '',
      p_size_info: input.sizeInfo || '',
      p_warehouse_id: input.warehouseId || null,
      p_idempotency_key: operationKey(`repair-cost:${input.repairItemId}`),
    });
    if (error) throw new Error(customerServiceErrorMessage(error));
    return data;
  },

  async setRepairCharge(input: { repairItemId: string; chargeType: 'warranty' | 'chargeable' | 'unrecorded'; amount: number; paidAmount: number; notes?: string }) {
    assertOnline();
    const { data, error } = await supabase.rpc('set_repair_charge_v1', {
      p_repair_item_id: input.repairItemId,
      p_charge_type: input.chargeType,
      p_amount: input.amount,
      p_paid_amount: input.paidAmount,
      p_notes: input.notes || null,
    });
    if (error) throw new Error(customerServiceErrorMessage(error));
    return data;
  },

  async createRepairLegalDraft(repairItemId: string): Promise<string> {
    assertOnline();
    const { data, error } = await supabase.rpc('create_repair_legal_draft_v1', {
      p_repair_item_id: repairItemId,
    });
    if (error) throw new Error(customerServiceErrorMessage(error));
    return String(data);
  },

  async uploadRepairAttachment(repairItemId: string, file: File, attachmentType: 'intake' | 'quality' | 'other' = 'intake'): Promise<RepairAttachment> {
    assertOnline();
    const { data: slot, error: slotError } = await supabase.rpc('create_repair_attachment_slot_v1', {
      p_repair_item_id: repairItemId,
      p_file_name: file.name,
      p_content_type: file.type,
      p_attachment_type: attachmentType,
    });
    if (slotError) throw new Error(customerServiceErrorMessage(slotError));
    const attachment = slot as RepairAttachment;
    const { error: uploadError } = await supabase.storage
      .from('repair-attachments')
      .upload(attachment.storage_path, file, { contentType: file.type, upsert: false });
    if (uploadError) throw new Error(customerServiceErrorMessage(uploadError));
    return attachment;
  },

  async getAttachmentSignedUrl(path: string): Promise<string> {
    const { data, error } = await supabase.storage.from('repair-attachments').createSignedUrl(path, 900);
    if (error) throw new Error(customerServiceErrorMessage(error));
    return data.signedUrl;
  },
};
