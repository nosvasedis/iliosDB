import { Gender, ProductionType } from '../../types';
import { R2_PUBLIC_URL } from '../../lib/supabase';
import { resolveProductImageUrl } from '../products/mappers';
import {
  RawSellerCatalogSnapshot,
  SELLER_CATALOG_SCHEMA_VERSION,
  SellerCatalogCollection,
  SellerCatalogProduct,
  SellerCatalogSnapshot,
  SellerCatalogVariant,
} from './types';

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const requiredString = (value: unknown, path: string): string => {
  if (typeof value !== 'string') throw new Error(`Invalid seller catalogue field: ${path}`);
  return value;
};

const finiteNumber = (value: unknown, path: string): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid seller catalogue field: ${path}`);
  return parsed;
};

const nullableNumber = (value: unknown, path: string): number | null =>
  value == null ? null : finiteNumber(value, path);

const parseGender = (value: unknown, path: string): Gender => {
  if (Object.values(Gender).includes(value as Gender)) return value as Gender;
  throw new Error(`Invalid seller catalogue field: ${path}`);
};

const parseProductionType = (value: unknown, path: string): ProductionType => {
  if (value == null || value === '') return ProductionType.InHouse;
  if (Object.values(ProductionType).includes(value as ProductionType)) return value as ProductionType;
  throw new Error(`Invalid seller catalogue field: ${path}`);
};

const parseVariant = (value: unknown, index: number): SellerCatalogVariant => {
  if (!isRecord(value)) throw new Error(`Invalid seller catalogue variant at index ${index}`);
  return {
    suffix: requiredString(value.suffix, `variants[${index}].suffix`),
    description: typeof value.description === 'string' ? value.description : '',
    selling_price: nullableNumber(value.selling_price, `variants[${index}].selling_price`),
    stock_qty: finiteNumber(value.stock_qty, `variants[${index}].stock_qty`),
    available_qty: finiteNumber(value.available_qty, `variants[${index}].available_qty`),
  };
};

const parseProduct = (value: unknown, index: number): SellerCatalogProduct => {
  if (!isRecord(value)) throw new Error(`Invalid seller catalogue product at index ${index}`);
  if (!Array.isArray(value.collection_ids) || !Array.isArray(value.variants)) {
    throw new Error(`Invalid seller catalogue product relations at index ${index}`);
  }

  const sku = requiredString(value.sku, `products[${index}].sku`);
  return {
    sku,
    category: requiredString(value.category, `products[${index}].category`),
    gender: parseGender(value.gender, `products[${index}].gender`),
    image_url: value.image_url == null
      ? null
      : resolveProductImageUrl(requiredString(value.image_url, `products[${index}].image_url`), R2_PUBLIC_URL),
    production_type: parseProductionType(value.production_type, `products[${index}].production_type`),
    created_at: requiredString(value.created_at, `products[${index}].created_at`),
    selling_price: finiteNumber(value.selling_price, `products[${index}].selling_price`),
    stock_qty: finiteNumber(value.stock_qty, `products[${index}].stock_qty`),
    available_qty: finiteNumber(value.available_qty, `products[${index}].available_qty`),
    collections: value.collection_ids.map((id, collectionIndex) =>
      finiteNumber(id, `products[${index}].collection_ids[${collectionIndex}]`)),
    variants: value.variants.map(parseVariant),
  };
};

const parseCollection = (value: unknown, index: number): SellerCatalogCollection => {
  if (!isRecord(value)) throw new Error(`Invalid seller catalogue collection at index ${index}`);
  return {
    id: finiteNumber(value.id, `collections[${index}].id`),
    name: requiredString(value.name, `collections[${index}].name`),
    description: value.description == null ? undefined : requiredString(value.description, `collections[${index}].description`),
  };
};

export function parseSellerCatalogRpcSnapshot(
  value: RawSellerCatalogSnapshot | unknown,
  syncedAt = Date.now(),
): SellerCatalogSnapshot {
  if (!isRecord(value) || value.schema_version !== SELLER_CATALOG_SCHEMA_VERSION) {
    throw new Error('Unsupported seller catalogue schema version.');
  }
  if (!Array.isArray(value.products) || !Array.isArray(value.collections)) {
    throw new Error('Invalid seller catalogue snapshot shape.');
  }

  return {
    schemaVersion: SELLER_CATALOG_SCHEMA_VERSION,
    generatedAt: requiredString(value.generated_at, 'generated_at'),
    fullSyncedAt: syncedAt,
    cacheSavedAt: syncedAt,
    products: value.products.map(parseProduct),
    collections: value.collections.map(parseCollection),
  };
}

export function isSellerCatalogSnapshot(value: unknown): value is SellerCatalogSnapshot {
  if (!isRecord(value)
    || value.schemaVersion !== SELLER_CATALOG_SCHEMA_VERSION
    || typeof value.generatedAt !== 'string'
    || !Number.isFinite(value.fullSyncedAt)
    || !Number.isFinite(value.cacheSavedAt)
    || !Array.isArray(value.products)
    || !Array.isArray(value.collections)) {
    return false;
  }

  try {
    value.products.forEach((product, index) => {
      if (!isRecord(product)
        || typeof product.sku !== 'string'
        || typeof product.category !== 'string'
        || !Object.values(Gender).includes(product.gender as Gender)
        || (product.image_url !== null && typeof product.image_url !== 'string')
        || !Object.values(ProductionType).includes(product.production_type as ProductionType)
        || typeof product.created_at !== 'string'
        || !Number.isFinite(product.selling_price)
        || !Number.isFinite(product.stock_qty)
        || !Number.isFinite(product.available_qty)
        || !Array.isArray(product.collections)
        || !Array.isArray(product.variants)) {
        throw new Error(`Invalid cached product at index ${index}`);
      }
      if (!product.collections.every((collectionId) => Number.isFinite(collectionId))) {
        throw new Error(`Invalid cached product collections at index ${index}`);
      }
      product.variants.forEach((variant, variantIndex) => {
        if (!isRecord(variant)
          || typeof variant.suffix !== 'string'
          || typeof variant.description !== 'string'
          || (variant.selling_price !== null && !Number.isFinite(variant.selling_price))
          || !Number.isFinite(variant.stock_qty)
          || !Number.isFinite(variant.available_qty)) {
          throw new Error(`Invalid cached variant at index ${index}:${variantIndex}`);
        }
      });
    });
    value.collections.forEach((collection, index) => {
      if (!isRecord(collection)
        || !Number.isFinite(collection.id)
        || typeof collection.name !== 'string'
        || (collection.description !== undefined && typeof collection.description !== 'string')) {
        throw new Error(`Invalid cached collection at index ${index}`);
      }
    });
    return true;
  } catch {
    return false;
  }
}
