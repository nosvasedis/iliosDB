
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
  Delivered = 'Delivered',
  Cancelled = 'Cancelled'
}

export interface OrderItem {
  sku: string;
  variant_suffix?: string;
  quantity: number;
  price_at_order: number; 
  product_details?: Product; 
  size_info?: string; // e.g., "58" or "19cm"
  notes?: string;
}

export interface Order {
  id: string;
  customer_id?: string; 
  customer_name: string; 
  customer_phone?: string;
  seller_id?: string; // NEW: Track which seller created this order
  created_at: string;
  status: OrderStatus;
  items: OrderItem[];
  total_price: number;
  notes?: string;
  custom_silver_rate?: number; // New: Locks in the silver price used at the time of order
  vat_rate?: number; // 0.24, 0.17, 0.00
  discount_percent?: number; // New: Discount percentage 0-100
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
  Labeling = 'Labeling',   
  Ready = 'Ready'          
}

export type BatchType = 'Νέα' | 'Φρεσκάρισμα';

export interface ProductionBatch {
  id: string;
  order_id?: string; 
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
  size_info?: string; // Added size info for production tracking
  
  product_image?: string | null;
  product_details?: Product;
  
  diffHours?: number;
  isDelayed?: boolean;

  on_hold?: boolean; // New: Batch is paused
  on_hold_reason?: string; // New: Reason for hold
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

declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }

  interface Window {
    aistudio?: AIStudio;
  }
}