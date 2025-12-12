

export enum Gender {
  Men = 'Men',
  Women = 'Women',
  Unisex = 'Unisex'
}

export enum MaterialType {
  Stone = 'Stone',
  Cord = 'Cord',
  Chain = 'Chain',
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
  type: MaterialType;
  cost_per_unit: number;
  unit: string;
  variant_prices?: Record<string, number>; 
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
  gender: Gender;
  image_url: string | null;
  weight_g: number;
  secondary_weight_g?: number; 
  plating_type: PlatingType;
  
  // Production Strategy
  production_type: ProductionType;
  supplier_id?: string; // Link to Supplier
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
  role: 'admin' | 'user';
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