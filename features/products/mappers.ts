import {
  Gender,
  PlatingType,
  Product,
  ProductVariant,
  ProductionType,
} from '../../types';

type RawStockRow = {
  product_sku: string;
  variant_suffix?: string | null;
  warehouse_id: string;
  quantity?: number | null;
  on_hand?: number | null;
  reserved?: number | null;
  size_info?: string | null;
};

const stockQuantity = (row: RawStockRow): number => Number(row.on_hand ?? row.quantity ?? 0);
const reservedQuantity = (row: RawStockRow): number => Number(row.reserved ?? 0);

type RawVariantRow = {
  product_sku: string;
  suffix: string;
  description?: string | null;
  stock_qty?: number | null;
  stock_by_size?: Record<string, number> | null;
  active_price?: number | null;
  selling_price?: number | null;
  selling_price_manual_override?: boolean | null;
};

type RawRecipeRow = {
  parent_sku: string;
  type: 'raw' | 'component';
  material_id?: string | null;
  component_sku?: string | null;
  quantity?: number | string | null;
};

type RawMoldRow = {
  product_sku: string;
  mold_code: string;
  quantity?: number | null;
};

type RawCollectionRow = {
  product_sku: string;
  collection_id: number;
};

type RawProductRow = {
  sku: string;
  prefix: string;
  category: string;
  description?: string | null;
  gender: Gender;
  image_url?: string | null;
  weight_g: number | string;
  secondary_weight_g?: number | string | null;
  plating_type: PlatingType;
  production_type?: ProductionType | string | null;
  supplier_id?: string | null;
  supplier_sku?: string | null;
  supplier_cost?: number | string | null;
  active_price?: number | string | null;
  draft_price?: number | string | null;
  selling_price?: number | string | null;
  stock_qty?: number | null;
  sample_qty?: number | null;
  stock_by_size?: Record<string, number> | null;
  sample_stock_by_size?: Record<string, number> | null;
  is_component?: boolean | null;
  suppliers?: unknown;
  created_at?: string | null;
  labor_casting?: number | string | null;
  labor_setter?: number | string | null;
  labor_technician?: number | string | null;
  labor_plating_x?: number | string | null;
  labor_plating_d?: number | string | null;
  labor_subcontract?: number | string | null;
  labor_stone_setting?: number | string | null;
  labor_technician_manual_override?: boolean | null;
  labor_plating_x_manual_override?: boolean | null;
  labor_plating_d_manual_override?: boolean | null;
  labor_casting_manual_override?: boolean | null;
  selling_price_manual_override?: boolean | null;
};

export interface ProductTableMappingContext {
  publicImageBaseUrl: string;
  centralWarehouseId: string;
  showroomWarehouseId: string;
}

export interface ProductTableRelations {
  variants?: RawVariantRow[];
  recipes?: RawRecipeRow[];
  molds?: RawMoldRow[];
  collections?: RawCollectionRow[];
  stock?: RawStockRow[];
}

const buildStockMap = (rows: RawStockRow[] = []) => {
  const stockMap = new Map<string, RawStockRow[]>();
  rows.forEach((row) => {
    const key = row.variant_suffix ? `${row.product_sku}::${row.variant_suffix}` : row.product_sku;
    if (!stockMap.has(key)) stockMap.set(key, []);
    stockMap.get(key)!.push(row);
  });
  return stockMap;
};

const buildVariantMap = (rows: RawVariantRow[] = []) => {
  const variantMap = new Map<string, RawVariantRow[]>();
  rows.forEach((row) => {
    if (!variantMap.has(row.product_sku)) variantMap.set(row.product_sku, []);
    variantMap.get(row.product_sku)!.push(row);
  });
  return variantMap;
};

const buildRecipeMap = (rows: RawRecipeRow[] = []) => {
  const recipeMap = new Map<string, RawRecipeRow[]>();
  rows.forEach((row) => {
    if (!recipeMap.has(row.parent_sku)) recipeMap.set(row.parent_sku, []);
    recipeMap.get(row.parent_sku)!.push(row);
  });
  return recipeMap;
};

const buildMoldsMap = (rows: RawMoldRow[] = []) => {
  const moldsMap = new Map<string, RawMoldRow[]>();
  rows.forEach((row) => {
    if (!moldsMap.has(row.product_sku)) moldsMap.set(row.product_sku, []);
    moldsMap.get(row.product_sku)!.push(row);
  });
  return moldsMap;
};

const buildCollectionsMap = (rows: RawCollectionRow[] = []) => {
  const collectionsMap = new Map<string, number[]>();
  rows.forEach((row) => {
    if (!collectionsMap.has(row.product_sku)) collectionsMap.set(row.product_sku, []);
    collectionsMap.get(row.product_sku)!.push(row.collection_id);
  });
  return collectionsMap;
};

export function resolveProductImageUrl(url: string | null | undefined, publicImageBaseUrl: string): string | null {
  if (!url) return null;
  if (url.startsWith('data:')) return url;
  if (url.includes('picsum.photos')) return url;

  try {
    const parts = url.split('/');
    const filename = parts[parts.length - 1];
    if (filename && filename.trim() !== '') {
      return `${publicImageBaseUrl}/${filename}`;
    }
  } catch {
    return url;
  }

  return url;
}

function mapProductRow(
  row: RawProductRow,
  context: ProductTableMappingContext,
  maps: {
    stockMap: Map<string, RawStockRow[]>;
    variantMap: Map<string, RawVariantRow[]>;
    recipeMap: Map<string, RawRecipeRow[]>;
    moldsMap: Map<string, RawMoldRow[]>;
    collectionsMap: Map<string, number[]>;
  },
  options: { includeRecipes: boolean; includeMolds: boolean; includeCreatedAt: boolean },
): Product {
  const customStock: Record<string, number> = {};
  const customReserved: Record<string, number> = {};
  const customAvailable: Record<string, number> = {};
  const pStock = maps.stockMap.get(row.sku) || [];
  pStock.forEach((stockRow) => {
    customStock[stockRow.warehouse_id] = (customStock[stockRow.warehouse_id] || 0) + stockQuantity(stockRow);
    customReserved[stockRow.warehouse_id] = (customReserved[stockRow.warehouse_id] || 0) + reservedQuantity(stockRow);
    customAvailable[stockRow.warehouse_id] = (customAvailable[stockRow.warehouse_id] || 0) + stockQuantity(stockRow) - reservedQuantity(stockRow);
  });
  if (!(context.centralWarehouseId in customStock)) customStock[context.centralWarehouseId] = Number(row.stock_qty || 0);
  if (!(context.showroomWarehouseId in customStock)) customStock[context.showroomWarehouseId] = Number(row.sample_qty || 0);
  Object.entries(customStock).forEach(([warehouseId, onHand]) => {
    if (!(warehouseId in customReserved)) customReserved[warehouseId] = 0;
    if (!(warehouseId in customAvailable)) customAvailable[warehouseId] = onHand;
  });
  const productCentralSizeMap = Object.fromEntries(
    pStock
      .filter((stockRow) => stockRow.warehouse_id === context.centralWarehouseId && !!stockRow.size_info)
      .map((stockRow) => [stockRow.size_info as string, stockQuantity(stockRow)])
  );
  const productShowroomSizeMap = Object.fromEntries(
    pStock
      .filter((stockRow) => stockRow.warehouse_id === context.showroomWarehouseId && !!stockRow.size_info)
      .map((stockRow) => [stockRow.size_info as string, stockQuantity(stockRow)])
  );

  const baseVariants = maps.variantMap.get(row.sku) || [];
  const variants: ProductVariant[] = baseVariants.map((variantRow) => {
    const vCustomStock: Record<string, number> = {};
    const vCustomReserved: Record<string, number> = {};
    const vCustomAvailable: Record<string, number> = {};
    const vStock = maps.stockMap.get(`${row.sku}::${variantRow.suffix}`) || [];
    vStock.forEach((stockRow) => {
      vCustomStock[stockRow.warehouse_id] = (vCustomStock[stockRow.warehouse_id] || 0) + stockQuantity(stockRow);
      vCustomReserved[stockRow.warehouse_id] = (vCustomReserved[stockRow.warehouse_id] || 0) + reservedQuantity(stockRow);
      vCustomAvailable[stockRow.warehouse_id] = (vCustomAvailable[stockRow.warehouse_id] || 0) + stockQuantity(stockRow) - reservedQuantity(stockRow);
    });
    if (!(context.centralWarehouseId in vCustomStock)) vCustomStock[context.centralWarehouseId] = Number(variantRow.stock_qty || 0);
    Object.entries(vCustomStock).forEach(([warehouseId, onHand]) => {
      if (!(warehouseId in vCustomReserved)) vCustomReserved[warehouseId] = 0;
      if (!(warehouseId in vCustomAvailable)) vCustomAvailable[warehouseId] = onHand;
    });
    const variantCentralSizeMap = Object.fromEntries(
      vStock
        .filter((stockRow) => stockRow.warehouse_id === context.centralWarehouseId && !!stockRow.size_info)
        .map((stockRow) => [stockRow.size_info as string, stockQuantity(stockRow)])
    );
    return {
      suffix: variantRow.suffix,
      description: variantRow.description || '',
      stock_qty: vCustomStock[context.centralWarehouseId] || 0,
      stock_by_size: Object.keys(variantCentralSizeMap).length > 0 ? variantCentralSizeMap : (variantRow.stock_by_size || {}),
      location_stock: vCustomStock,
      reserved_qty: vCustomReserved[context.centralWarehouseId] || 0,
      available_qty: vCustomAvailable[context.centralWarehouseId] || 0,
      location_reserved: vCustomReserved,
      location_available: vCustomAvailable,
      active_price: variantRow.active_price != null ? Number(variantRow.active_price) : null,
      selling_price: variantRow.selling_price != null ? Number(variantRow.selling_price) : null,
      selling_price_manual_override: !!variantRow.selling_price_manual_override,
    };
  });

  const recipes = options.includeRecipes
    ? (maps.recipeMap.get(row.sku) || []).map((recipeRow) => ({
        type: recipeRow.type,
        id: recipeRow.material_id,
        sku: recipeRow.component_sku,
        quantity: Number(recipeRow.quantity || 0),
      }))
    : [];

  const molds = options.includeMolds
    ? Array.from(
      new Map(
        (maps.moldsMap.get(row.sku) || []).map((moldRow) => [moldRow.mold_code, { code: moldRow.mold_code, quantity: moldRow.quantity || 1 }])
      ).values()
    )
    : [];

  return {
    sku: row.sku,
    prefix: row.prefix,
    category: row.category,
    description: row.description || '',
    gender: row.gender,
    image_url: resolveProductImageUrl(row.image_url, context.publicImageBaseUrl),
    weight_g: Number(row.weight_g),
    secondary_weight_g: row.secondary_weight_g != null ? Number(row.secondary_weight_g) : undefined,
    plating_type: row.plating_type,
    production_type: (row.production_type as ProductionType) || ProductionType.InHouse,
    supplier_id: row.supplier_id || null,
    supplier_sku: row.supplier_sku || null,
    supplier_cost: Number(row.supplier_cost || 0),
    supplier_details: row.suppliers,
    active_price: Number(row.active_price || 0),
    draft_price: Number(row.draft_price || 0),
    selling_price: Number(row.selling_price || 0),
    selling_price_manual_override: !!row.selling_price_manual_override,
    stock_qty: customStock[context.centralWarehouseId] || 0,
    sample_qty: customStock[context.showroomWarehouseId] || 0,
    stock_by_size: Object.keys(productCentralSizeMap).length > 0 ? productCentralSizeMap : (row.stock_by_size || {}),
    sample_stock_by_size: Object.keys(productShowroomSizeMap).length > 0 ? productShowroomSizeMap : (row.sample_stock_by_size || {}),
    location_stock: customStock,
    reserved_qty: customReserved[context.centralWarehouseId] || 0,
    available_qty: customAvailable[context.centralWarehouseId] || 0,
    location_reserved: customReserved,
    location_available: customAvailable,
    molds,
    is_component: !!row.is_component,
    variants,
    recipe: recipes,
    collections: maps.collectionsMap.get(row.sku) || [],
    labor: {
      casting_cost: Number(row.labor_casting || 0),
      setter_cost: Number(row.labor_setter || 0),
      technician_cost: Number(row.labor_technician || 0),
      plating_cost_x: Number(row.labor_plating_x || 0),
      plating_cost_d: Number(row.labor_plating_d || 0),
      subcontract_cost: Number(row.labor_subcontract || 0),
      stone_setting_cost: Number(row.labor_stone_setting || 0),
      casting_cost_manual_override: !!row.labor_casting_manual_override,
      technician_cost_manual_override: !!row.labor_technician_manual_override,
      plating_cost_x_manual_override: !!row.labor_plating_x_manual_override,
      plating_cost_d_manual_override: !!row.labor_plating_d_manual_override,
    },
    created_at: options.includeCreatedAt ? (row.created_at || new Date(0).toISOString()) : undefined,
  } as Product;
}

/** Join supplier rows in-memory (avoids PostgREST embed duplication on every product row). */
export function attachSuppliersToProductRows<T extends { supplier_id?: string | null }>(
  rows: T[],
  suppliers: Array<{ id: string } & Record<string, unknown>>,
): Array<T & { suppliers: Record<string, unknown> | null }> {
  const byId = new Map(suppliers.map((supplier) => [supplier.id, supplier]));
  return rows.map((row) => ({
    ...row,
    suppliers: row.supplier_id ? (byId.get(row.supplier_id) ?? null) : null,
  }));
}

export function mapProductsWithRelations(
  rows: RawProductRow[],
  relations: ProductTableRelations,
  context: ProductTableMappingContext,
): Product[] {
  const maps = {
    stockMap: buildStockMap(relations.stock),
    variantMap: buildVariantMap(relations.variants),
    recipeMap: buildRecipeMap(relations.recipes),
    moldsMap: buildMoldsMap(relations.molds),
    collectionsMap: buildCollectionsMap(relations.collections),
  };
  return rows.map((row) => mapProductRow(row, context, maps, { includeRecipes: true, includeMolds: true, includeCreatedAt: true }));
}

export function mapCatalogProductsWithRelations(
  rows: RawProductRow[],
  relations: ProductTableRelations,
  context: ProductTableMappingContext,
): Product[] {
  const maps = {
    stockMap: buildStockMap(relations.stock),
    variantMap: buildVariantMap(relations.variants),
    recipeMap: buildRecipeMap(relations.recipes),
    moldsMap: buildMoldsMap(relations.molds),
    collectionsMap: buildCollectionsMap(relations.collections),
  };
  return rows.map((row) => mapProductRow(row, context, maps, { includeRecipes: false, includeMolds: false, includeCreatedAt: true }));
}
