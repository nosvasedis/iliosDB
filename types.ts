
export enum Gender {
  Men = 'Men',
  Women = 'Women',
  Unisex = 'Unisex'
}

export enum MaterialType {
  Stone = 'Stone',
  Cord = 'Cord',
  Chain = 'Chain',
  Component = 'Component'
}

export enum PlatingType {
  None = 'None',
  GoldPlated = 'Gold-Plated',
  TwoTone = 'Two-Tone',
  Platinum = 'Platinum'
}

export interface Material {
  id: string;
  name: string;
  type: MaterialType;
  cost_per_unit: number;
  unit: string;
}

export interface Mold {
  code: string; // Primary Key, e.g. "A-12"
  location: string; // e.g. "Syrtari 1"
  description: string; // e.g. "Main Body"
}

// New Polymorphic Recipe Item
export type RecipeItem = 
  | { type: 'raw'; id: string; quantity: number; itemDetails?: Material } // Link to Materials Table
  | { type: 'component'; sku: string; quantity: number; itemDetails?: Product }; // Link to Products Table (Recursive)

export interface LaborCost {
  casting_cost: number;
  setter_cost: number;
  technician_cost: number;
  plating_cost: number;
  technician_cost_manual_override?: boolean;
}

export interface ProductVariant {
  suffix: string; // e.g. 'PKR', 'P', 'X'
  description: string; // e.g. 'Κορνεόλη', 'Πατίνα'
  stock_qty: number;
  location_stock?: Record<string, number>; // New: Warehouse specific stock for this variant
  
  // Pricing Overrides (Optional - falls back to Master if null)
  active_price?: number | null; // Variant specific Cost
  selling_price?: number | null; // Variant specific Wholesale
}

export interface Collection {
  id: number;
  name: string;
  description?: string;
}

export interface Product {
  sku: string; // Primary Key
  prefix: string;
  category: string;
  gender: Gender;
  image_url: string | null;
  weight_g: number;
  plating_type: PlatingType;
  
  // Pricing
  active_price: number; // Cost Price (Silver + Labor + Materials)
  draft_price: number;
  selling_price: number; // Wholesale Price (Τιμή Χονδρικής) - Retail is x3
  
  // Inventory (Legacy System Columns)
  stock_qty: number; // Central
  sample_qty: number; // Showroom
  
  // Dynamic Inventory (New)
  location_stock?: Record<string, number>; // key: warehouse_id, value: qty

  // Manufacturing
  molds: string[]; // Array of Mold Codes (e.g. ['A-12', 'B-02'])
  is_component: boolean; // Is this an STX part?
  variants?: ProductVariant[]; // Specific versions (Stones, Patina, etc)
  recipe: RecipeItem[]; 
  labor: LaborCost;

  // Organization
  collections?: number[]; // Array of collection IDs
}

export interface GlobalSettings {
  silver_price_gram: number;
  loss_percentage: number;
  barcode_width_mm: number;
  barcode_height_mm: number;
}

// --- WAREHOUSE MANAGEMENT ---
export interface Warehouse {
    id: string;
    name: string;
    type: 'Central' | 'Showroom' | 'Store' | 'Other';
    is_system?: boolean; // If true, maps to standard columns (stock_qty, sample_qty)
    address?: string;
}

export interface WarehouseStock {
    warehouse_id: string;
    product_sku: string;
    variant_suffix?: string; // New: Support for variant specific stock in custom warehouses
    quantity: number;
}

// --- NEW ORDERS & PRODUCTION TYPES ---

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
  price_at_order: number; // Wholesale price snapshot
  product_details?: Product; // Populated for UI
}

export interface Order {
  id: string;
  customer_id?: string; // Link to Customer
  customer_name: string; // Fallback / Cache
  customer_phone?: string;
  created_at: string;
  status: OrderStatus;
  items: OrderItem[];
  total_price: number;
  notes?: string;
}

export interface Customer {
  id: string;
  full_name: string;
  phone?: string;
  email?: string;
  address?: string;
  vat_number?: string;
  notes?: string;
  created_at: string;
}

export enum ProductionStage {
  Waxing = 'Waxing',       // Λάστιχα/Κεριά
  Casting = 'Casting',     // Χυτήριο
  Setting = 'Setting',     // Καρφωτής (Conditional)
  Polishing = 'Polishing', // Τεχνίτης/Γυάλισμα
  Labeling = 'Labeling',   // Καρτελάκια/QC
  Ready = 'Ready'          // Έτοιμο για κατάστημα
}

export interface ProductionBatch {
  id: string;
  order_id?: string; // Optional (might be stock production)
  sku: string;
  variant_suffix?: string;
  quantity: number;
  current_stage: ProductionStage;
  created_at: string;
  updated_at: string;
  priority: 'Normal' | 'High';
  notes?: string;
  
  // Computed helpers for UI
  product_image?: string | null;
  requires_setting?: boolean; // Does it have stones?
  
  // UI Logic helpers
  diffHours?: number;
  isDelayed?: boolean;
}

// --- AI STUDIO TYPES ---

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text?: string;
  image?: string;
  attachedProductSku?: string;
  isTrendAnalysis?: boolean;
}

// --- AUTH TYPES ---
export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  is_approved: boolean;
  role: 'admin' | 'user';
}
