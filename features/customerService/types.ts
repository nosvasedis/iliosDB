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
  RepairOriginType,
} from '../../types';

export interface CustomerServiceWorkspaceData {
  consignments: Consignment[];
  consignmentLines: ConsignmentLine[];
  consignmentAllocations: ConsignmentAllocation[];
  consignmentSettlements: ConsignmentSettlement[];
  consignmentPayments: ConsignmentPayment[];
  consignmentReturns: ConsignmentReturn[];
  consignmentEvents: ConsignmentEvent[];
  repairIntakes: RepairIntake[];
  repairItems: RepairItem[];
  repairCycles: RepairCycle[];
  repairCostLines: RepairCostLine[];
  repairCharges: RepairCharge[];
  repairAttachments: RepairAttachment[];
  repairEvents: RepairEvent[];
}

export interface BulkConsignmentLineInput {
  product_sku: string;
  variant_suffix?: string;
  size_info?: string;
  cord_color?: string | null;
  enamel_color?: string | null;
  quantity: number;
  locked_unit_cost: number;
  locked_unit_price: number;
  price_override_reason?: string | null;
  order_line_id?: string | null;
  allocations?: Array<{ production_batch_id: string; quantity: number }>;
}

export interface BulkConsignmentGroupInput {
  customer_id: string;
  seller_id?: string | null;
  source_order_id?: string | null;
  source_warehouse_id: string;
  review_due_at?: string;
  notes?: string | null;
  lines: BulkConsignmentLineInput[];
}

export interface RepairItemInput {
  origin_type: RepairOriginType;
  source_order_id?: string | null;
  source_order_line_id?: string | null;
  source_consignment_settlement_id?: string | null;
  product_sku?: string | null;
  variant_suffix?: string;
  size_info?: string;
  description: string;
  intake_condition?: string | null;
  accessories?: string | null;
  previous_repair_item_id?: string | null;
  priority?: 'Normal' | 'High';
  requires_setting?: boolean;
  requires_assembly?: boolean;
}

export interface RepairIntakeInput {
  customerId: string;
  sellerId?: string | null;
  notes?: string | null;
  items: RepairItemInput[];
}
