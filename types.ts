
export enum Gender {
  Men = 'Men',
  Women = 'Women',
  Unisex = 'Unisex'
}

export enum MaterialType {
  Stone = 'Stone',
  Cord = 'Cord',
  Component = 'Component',
  Enamel = 'Enamel',
  Leather = 'Leather'
}

export enum PlatingType {
  None = 'None',
  GoldPlated = 'Gold-Plated',
  TwoTone = 'Two-Tone',
  Platinum = 'Platinum'
}

export enum ProductionType {
  InHouse = 'InHouse', // Manufactured (Casting, Recipe)
  Imported = 'Imported' // Bought finished (Resale)
}

export enum VatRegime {
  Standard = 0.24,
  Reduced = 0.17,
  Zero = 0.00
}

export type ProductOptionColor = 'black' | 'red' | 'blue';

export interface Supplier {
  id: string;
  name: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
}

export interface Material {
  id: string;
  name: string;
  description?: string; // NEW: Specific description (e.g. "8mm Matte", "Faceted")
  type: MaterialType;
  cost_per_unit: number;
  unit: string;
  variant_prices?: Record<string, number>;
  supplier_id?: string; // Link to Supplier
  stock_qty?: number;   // Track raw material stock
  stones_per_strand?: number; // If sold as strand, how many stones per strand
}

export interface Mold {
  code: string;
  location: string;
  description: string;
  weight_g?: number; // NEW: Standard weight of the casting from this mold
}

export interface ProductMold {
  code: string;
  quantity: number;
}

export type RecipeItem =
  | { type: 'raw'; id: string; quantity: number; itemDetails?: Material }
  | { type: 'component'; sku: string; quantity: number; itemDetails?: Product };

export interface LaborCost {
  casting_cost: number;
  setter_cost: number;
  technician_cost: number;
  stone_setting_cost: number; // New: For Imported items requiring stones
  plating_cost_x: number;
  plating_cost_d: number;
  subcontract_cost: number;
  casting_cost_manual_override?: boolean;
  technician_cost_manual_override?: boolean;
  plating_cost_x_manual_override?: boolean;
  plating_cost_d_manual_override?: boolean;
}

export interface ProductVariant {
  suffix: string;
  description: string;
  stock_qty: number;
  stock_by_size?: Record<string, number>; // e.g. { "52": 10, "54": 5 }
  location_stock?: Record<string, number>;
  active_price?: number | null;
  selling_price?: number | null;
}

export interface Collection {
  id: number;
  name: string;
  description?: string;
}

export interface Product {
  sku: string;
  prefix: string;
  category: string;
  description?: string; // New field for STX description
  created_at?: string;
  gender: Gender;
  image_url: string | null;
  weight_g: number;
  secondary_weight_g?: number;
  plating_type: PlatingType;

  // Production Strategy
  production_type: ProductionType;
  supplier_id?: string; // Link to Supplier
  supplier_sku?: string; // New: Supplier's Product Code
  supplier_cost?: number;
  supplier_details?: Supplier; // Joined Data

  // Pricing
  active_price: number;
  draft_price: number;
  selling_price: number;

  // Inventory
  stock_qty: number;
  sample_qty: number;
  stock_by_size?: Record<string, number>;
  sample_stock_by_size?: Record<string, number>;

  location_stock?: Record<string, number>;

  // Manufacturing
  molds: ProductMold[];
  is_component: boolean;
  variants?: ProductVariant[];
  recipe: RecipeItem[];
  labor: LaborCost;

  // Organization
  collections?: number[];
}

export interface GlobalSettings {
  silver_price_gram: number;
  loss_percentage: number;
  barcode_width_mm: number;
  barcode_height_mm: number;
  retail_barcode_width_mm: number; // New
  retail_barcode_height_mm: number; // New
  last_calc_silver_price: number; // Historical anchor for last mass update
  local_image_storage?: boolean;
}

export interface PriceSnapshot {
  id: string;
  created_at: string;
  notes?: string;
  item_count: number;
}

export interface PriceSnapshotItem {
  id: string;
  snapshot_id: string;
  product_sku: string;
  variant_suffix: string | null;
  price: number;
}

export interface Warehouse {
  id: string;
  name: string;
  type: 'Central' | 'Showroom' | 'Store' | 'Other';
  is_system?: boolean;
  address?: string;
}

export interface WarehouseStock {
  warehouse_id: string;
  product_sku: string;
  variant_suffix?: string;
  quantity: number;
  size_info?: string;
}

export enum OrderStatus {
  Pending = 'Pending',
  InProduction = 'In Production',
  Ready = 'Ready',
  PartiallyDelivered = 'Partially Delivered',
  Delivered = 'Delivered',
  Cancelled = 'Cancelled'
}

export interface OrderItem {
  sku: string;
  variant_suffix?: string;
  quantity: number;
  price_at_order: number;
  price_override?: boolean;
  product_details?: Product;
  size_info?: string; // e.g., "58" or "19cm"
  cord_color?: ProductOptionColor;
  enamel_color?: ProductOptionColor;
  notes?: string;
  /** Stable row id for systemic SKU SP so multiple special lines never merge. */
  line_id?: string;
}

export interface Order {
  id: string;
  customer_id?: string;
  customer_name: string;
  customer_phone?: string;
  seller_id?: string; // Track which seller created this order
  seller_name?: string; // Display name of seller (Πλάσιε) for display everywhere
  seller_commission_percent?: number; // Ποσοστό προμήθειας πλασιέ στην παραγγελία
  created_at: string;
  status: OrderStatus;
  items: OrderItem[];
  total_price: number;
  notes?: string;
  custom_silver_rate?: number; // New: Locks in the silver price used at the time of order
  vat_rate?: number; // 0.24, 0.17, 0.00
  discount_percent?: number; // New: Discount percentage 0-100

  // NEW FEATURES
  tags?: string[]; // E.g. ['Exhibition A', 'Seller B']
  is_archived?: boolean;
  price_change_log?: PriceChangeRecord[];
}

/** Tracks a single SKU price delta when order prices are synced with the catalog. */
export interface ItemPriceDelta {
  lineKey: string;
  sku: string;
  variantSuffix?: string;
  oldPrice: number;
  newPrice: number;
}

/** A record of a price-sync event on an order, with per-SKU and aggregate totals. */
export interface PriceChangeRecord {
  timestamp: string;
  itemChanges: ItemPriceDelta[];
  totalsBefore: { subtotal: number; net: number; vat: number; total: number };
  totalsAfter: { subtotal: number; net: number; vat: number; total: number };
}

export type DeliveryPlanStatus = 'active' | 'completed' | 'cancelled';
export type DeliveryPlanningMode = 'exact' | 'month' | 'custom_period' | 'holiday_anchor';
export type DeliveryHolidayAnchor = 'orthodox_easter' | 'orthodox_christmas';
export type DeliveryReminderAction = 'call_client' | 'message_client' | 'confirm_ready' | 'arrange_delivery' | 'internal_followup';
export type DeliveryReminderSource = 'auto' | 'manual';
export type DeliveryUrgency = 'overdue' | 'today' | 'soon' | 'upcoming' | 'scheduled' | 'completed';

export interface OrderDeliveryPlan {
  id: string;
  order_id: string;
  plan_status: DeliveryPlanStatus;
  planning_mode: DeliveryPlanningMode;
  target_at?: string | null;
  window_start?: string | null;
  window_end?: string | null;
  holiday_anchor?: DeliveryHolidayAnchor | null;
  holiday_year?: number | null;
  holiday_offset_days?: number | null;
  contact_phone_override?: string | null;
  internal_notes?: string | null;
  snoozed_until?: string | null;
  completed_at?: string | null;
  cancelled_at?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderDeliveryReminder {
  id: string;
  plan_id: string;
  trigger_at: string;
  action_type: DeliveryReminderAction;
  reason: string;
  sort_order: number;
  source: DeliveryReminderSource;
  acknowledged_at?: string | null;
  completed_at?: string | null;
  completion_note?: string | null;
  completed_by?: string | null;
  snoozed_until?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DeliverySuggestion {
  id: string;
  category: 'date' | 'holiday' | 'reason' | 'warning' | 'nameday';
  label: string;
  description?: string;
  suggested_mode?: DeliveryPlanningMode;
  suggested_date?: string;
  suggested_holiday?: DeliveryHolidayAnchor;
  suggested_reason?: string;
}

export interface NamedayMatch {
  id: string;
  matched_name: string;
  canonical_name: string;
  label: string;
  date: string;
  days_until: number;
  is_today: boolean;
  is_upcoming: boolean;
}

export interface CalendarDayEvent {
  id: string;
  date: string;
  type: 'nameday' | 'major_event';
  title: string;
  subtitle?: string;
  priority: number;
}

export interface ShipmentGroup {
  time_key: string;
  shipment_index: number;
  /** Πλήθος παρτίδων (για εσωτερική λογική· το UI προτιμά total_qty). */
  total: number;
  /** Παρτίδες σε στάδιο Έτοιμα. */
  ready: number;
  /** Σύνολο τεμαχίων σε αυτή την ομαδοποίηση αποστολής. */
  total_qty: number;
  /** Τεμάχια που είναι ήδη στο στάδιο Έτοιμα. */
  ready_qty: number;
  is_ready: boolean;
  not_ready_batches: Array<{ sku: string; variant_suffix?: string; current_stage: ProductionStage; size_info?: string; cord_color?: ProductOptionColor; enamel_color?: ProductOptionColor; product_image?: string | null; gender?: Gender }>;
}

export interface ShipmentReadinessSummary {
  total_batches: number;
  ready_batches: number;
  /** Σύνολο τεμαχίων σε όλες τις παρτίδες της παραγγελίας (βάρος ποσοτήτων). */
  total_qty: number;
  /** Τεμάχια σε στάδιο Έτοιμα. */
  ready_qty: number;
  ready_fraction: number;
  is_fully_ready: boolean;
  is_partially_ready: boolean;
  shipments: ShipmentGroup[];
}

export interface EnrichedDeliveryItem {
  order: Order;
  customer?: Customer;
  plan: OrderDeliveryPlan;
  reminders: OrderDeliveryReminder[];
  next_reminder?: OrderDeliveryReminder;
  pending_reminders: OrderDeliveryReminder[];
  phone?: string | null;
  is_ready: boolean;
  needs_call: boolean;
  call_reasons: string[];
  /** When order is not ready: which batches are still in progress (for info pane). */
  readiness_detail?: { not_ready_batches: Array<{ sku: string; variant_suffix?: string; current_stage: ProductionStage; size_info?: string; cord_color?: ProductOptionColor; enamel_color?: ProductOptionColor; product_image?: string | null; gender?: Gender }> };
  urgency: DeliveryUrgency;
  suggestions: DeliverySuggestion[];
  matched_keywords: string[];
  nameday_matches: NamedayMatch[];
  next_nameday?: NamedayMatch | null;
  shipment_readiness?: ShipmentReadinessSummary;
  target_date?: string | null;
  window_start?: string | null;
  window_end?: string | null;
  shipment_history?: OrderShipment[];
}

// ─── Shipment Tracking ─────────────────────────────────────────────────────

export interface OrderShipment {
  id: string;
  order_id: string;
  shipment_number: number;
  shipped_at: string;
  shipped_by: string;
  delivery_plan_id?: string | null;
  notes?: string | null;
  created_at: string;
}

export interface OrderShipmentItem {
  id: string;
  shipment_id: string;
  sku: string;
  variant_suffix?: string | null;
  size_info?: string | null;
  cord_color?: ProductOptionColor | null;
  enamel_color?: ProductOptionColor | null;
  quantity: number;
  price_at_order: number;
  line_id?: string | null;
}

export interface BatchStageHistoryEntry {
  id: string;
  batch_id: string;
  from_stage?: ProductionStage | null;
  to_stage: ProductionStage;
  moved_by: string;
  moved_at: string;
  notes?: string | null;
}

export type ProductionTimingStatus = 'normal' | 'attention' | 'delayed' | 'critical';

export interface SyncOfflineResult {
  syncedCount: number;
  failedCount: number;
  remainingCount: number;
  wasQueueEmpty: boolean;
}

export type OfferStatus = 'Pending' | 'Accepted' | 'Declined';

export interface Offer {
  id: string;
  customer_id?: string;
  customer_name: string;
  customer_phone?: string;
  created_at: string;
  status: OfferStatus;
  custom_silver_price: number;
  discount_percent: number;
  items: OrderItem[];
  total_price: number; // Final price after discount
  notes?: string;
  vat_rate?: number; // 0.24, 0.17, 0.00
}

export interface Customer {
  id: string;
  full_name: string;
  phone?: string;
  email?: string;
  address?: string;
  vat_number?: string;
  vat_rate?: number; // New: 0.24, 0.17, 0.00
  notes?: string;
  created_at: string;
}

export enum ProductionStage {
  AwaitingDelivery = 'Αναμονή Παραλαβής',
  Waxing = 'Waxing',
  Casting = 'Casting',
  Setting = 'Setting',
  Polishing = 'Polishing',
  Assembly = 'Assembly',
  Labeling = 'Labeling',
  Ready = 'Ready'
}

export type BatchType = 'Νέα' | 'Φρεσκάρισμα' | 'Από Stock';

export interface ProductionBatch {
  id: string;
  order_id?: string;
  /** Present when batch is enriched from order / UI (e.g. production boards, stage PDF). */
  customer_name?: string;
  sku: string;
  variant_suffix?: string;
  quantity: number;
  current_stage: ProductionStage;
  created_at: string;
  updated_at: string;
  priority: 'Normal' | 'High';
  type?: BatchType;
  notes?: string;

  requires_setting: boolean;
  requires_assembly?: boolean; // NEW: computed from SKU - determines if Assembly stage is needed
  size_info?: string; // Added size info for production tracking
  cord_color?: ProductOptionColor;
  enamel_color?: ProductOptionColor;
  /** Matches order line `line_id` (required for multiple SP rows). */
  line_id?: string | null;

  product_image?: string | null;
  product_details?: Product;

  diffHours?: number;
  isDelayed?: boolean;

  on_hold?: boolean; // New: Batch is paused
  on_hold_reason?: string; // New: Reason for hold

  pending_dispatch?: boolean; // Batch is awaiting physical dispatch to technician (Polishing stage sub-status)
}

export interface EnhancedProductionBatch extends ProductionBatch {
  product_details?: Product;
  product_image?: string | null;
  diffHours?: number;
  isDelayed?: boolean;
  stageEnteredAt?: string;
  timeInStageHours?: number;
  timingStatus?: ProductionTimingStatus;
  timingLabel?: string;
  reminderKey?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text?: string;
  image?: string;
  attachedProductSku?: string;
  isTrendAnalysis?: boolean;
}

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  is_approved: boolean;
  role: 'admin' | 'user' | 'seller'; // Added seller
  commission_percent?: number; // Ποσοστό προμήθειας πλασιέ (0-100)
}

export interface AggregatedBatch extends ProductionBatch {
  cost_per_piece: number;
  total_cost: number;
}

export interface AggregatedData {
  molds: Map<string, { code: string; location: string; description: string; usedIn: Set<string> }>;
  materials: Map<string, { name: string; unit: string; totalQuantity: number; totalCost: number; usedIn: Map<string, number> }>;
  components: Map<string, { sku: string; totalQuantity: number; totalCost: number; usedIn: Map<string, number> }>;
  totalSilverWeight: number;
  batches: AggregatedBatch[];
  totalProductionCost: number;
  totalSilverCost: number;
  totalMaterialsCost: number;
  totalInHouseLaborCost: number;
  totalImportedLaborCost: number;
  totalSubcontractCost: number;
  orderId?: string;
  customerName?: string;
  // Optional: Imported items (not counted in in-house production totals)
  importedBatches?: AggregatedBatch[];
  importedTotalCost?: number;
}

export interface AssemblyPrintRow {
  id: string;
  order_id: string;
  customer_name: string;
  sku: string;
  variant_suffix?: string;
  size_info?: string;
  cord_color?: ProductOptionColor;
  enamel_color?: ProductOptionColor;
  quantity: number;
  notes?: string; // SKU notes from order item
}

export interface AssemblyPrintData {
  rows: AssemblyPrintRow[];
  selected_order_ids: string[];
  generated_at: string;
}

export interface StageBatchPrintData {
  stageName: string;
  stageId: string;
  customerName: string;
  orderId: string;
  batches: ProductionBatch[];
  generatedAt: string;
}

// --- NEW SUPPLIER ORDER TYPES ---

export type SupplierOrderType = 'Product' | 'Material';

export interface SupplierOrderItem {
  id: string;
  item_type: SupplierOrderType;
  item_id: string; // SKU for Product, ID for Material
  item_name: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  notes?: string;
  size_info?: string; // New: Store size for ring orders
  /** Customer names when the line comes from production/pending needs (order demand). */
  customer_reference?: string;
}

export interface SupplierOrder {
  id: string;
  supplier_id: string;
  supplier_name: string;
  created_at: string;
  status: 'Pending' | 'Received' | 'Cancelled';
  total_amount: number;
  items: SupplierOrderItem[];
  notes?: string;
  received_at?: string;
}

export interface AuditLog {
  id: string;
  user_name: string;
  action: string;
  details?: any;
  created_at: string;
}

declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }

  interface Window {
    aistudio?: AIStudio;
  }
}
