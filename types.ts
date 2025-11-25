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
  Platinum = 'Platinum',
  RoseGold = 'Rose-Gold'
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
}

export interface ProductVariant {
  suffix: string; // e.g. 'PKR', 'P', 'X'
  description: string; // e.g. 'Κορνεόλη', 'Πατίνα'
  stock_qty: number;
}

export interface Product {
  sku: string; // Primary Key
  prefix: string;
  category: string;
  gender: Gender;
  image_url: string;
  weight_g: number;
  plating_type: PlatingType;
  
  // Pricing
  active_price: number; // Cost Price
  draft_price: number;
  selling_price: number; // Commercial Selling Price
  
  // Inventory
  stock_qty: number;
  sample_qty: number;
  
  // Manufacturing
  molds: string[]; // Array of Mold Codes (e.g. ['A-12', 'B-02'])
  is_component: boolean; // Is this an STX part?
  variants?: ProductVariant[]; // Specific versions (Stones, Patina, etc)
  recipe: RecipeItem[]; 
  labor: LaborCost;
}

export interface GlobalSettings {
  silver_price_gram: number;
  loss_percentage: number;
}