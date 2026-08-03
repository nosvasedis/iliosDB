import { Gender, ProductionType } from '../../types';

export const SELLER_CATALOG_SCHEMA_VERSION = 1 as const;

export interface SellerCatalogVariant {
  suffix: string;
  description: string;
  selling_price: number | null;
  stock_qty: number;
  available_qty: number;
}

export interface SellerCatalogProduct {
  sku: string;
  category: string;
  gender: Gender;
  image_url: string | null;
  production_type: ProductionType;
  created_at: string;
  selling_price: number;
  stock_qty: number;
  available_qty: number;
  collections: number[];
  variants: SellerCatalogVariant[];
}

export interface SellerCatalogCollection {
  id: number;
  name: string;
  description?: string;
}

export interface SellerCatalogSnapshot {
  schemaVersion: typeof SELLER_CATALOG_SCHEMA_VERSION;
  generatedAt: string;
  /** Client time of the most recent successful full snapshot. */
  fullSyncedAt: number;
  /** Client time of the last full or partial cache write. */
  cacheSavedAt: number;
  products: SellerCatalogProduct[];
  collections: SellerCatalogCollection[];
}

export interface RawSellerCatalogSnapshot {
  schema_version?: unknown;
  generated_at?: unknown;
  products?: unknown;
  collections?: unknown;
}
