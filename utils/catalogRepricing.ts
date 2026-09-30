import type { GlobalSettings, Material, Product } from '../types';
import { ProductionType } from '../types';
import { mapProductsWithRelations } from '../features/products/mappers';
import { INITIAL_SETTINGS } from '../constants';
import { calculateProductCost, estimateVariantCost, getIliosSuggestedPriceForProduct, shouldUseSplitTechnicianCost } from './pricingEngine';
import { computeAutoLaborCosts } from './laborFormula';
import { isLegalReservedItemCode } from './legalItemCodes';
import { isSpecialCreationSku } from './specialCreationSku';

export interface PricingCatalogSnapshot {
  fingerprint: string;
  settings: Record<string, any>;
  products: Array<Record<string, any>>;
  variants: Array<Record<string, any>>;
  recipes: Array<Record<string, any>>;
  materials: Array<Record<string, any>>;
}

export interface CataloguePriceChange {
  sku: string;
  suffix: string | null;
  values: Record<string, number>;
  before: Record<string, number | null>;
  manualSelling: boolean;
}

export function mapPricingSnapshot(snapshot: PricingCatalogSnapshot): { settings: GlobalSettings; products: Product[]; materials: Material[] } {
  const products = mapProductsWithRelations(snapshot.products as any, {
    variants: snapshot.variants as any,
    recipes: snapshot.recipes as any,
  }, { publicImageBaseUrl: '', centralWarehouseId: 'central', showroomWarehouseId: 'showroom' });
  const materials = snapshot.materials.map(row => ({ ...row, cost_per_unit: Number(row.cost_per_unit), variant_prices: row.variant_prices || {} })) as Material[];
  return { settings: { ...INITIAL_SETTINGS, ...snapshot.settings, silver_price_gram: Number(snapshot.settings.silver_price_gram) }, products, materials };
}

export function buildCatalogueRepricing(snapshot: PricingCatalogSnapshot, options: { replaceManualSelling?: boolean } = {}): { rows: CataloguePriceChange[]; masterCount: number; variantCount: number; manualCount: number; serviceCount: number } {
  const { settings, products, materials } = mapPricingSnapshot(snapshot);
  if (!Number.isFinite(settings.silver_price_gram) || settings.silver_price_gram < 0) throw new Error('Μη έγκυρη τιμή ασημιού.');
  const productsMap = new Map(products.map(p => [p.sku, p]));
  const materialsMap = new Map(materials.map(m => [m.id, m]));
  // The engine's normal display behavior tolerates missing recipe references.
  // A persistent mass write must instead stop, including on circular graphs.
  const checkRecipe = (product: Product, path: Set<string>, depth: number) => {
    if (path.has(product.sku) || depth > 10) throw new Error(`Κυκλική ή υπερβολικά βαθιά συνταγή: ${product.sku}`);
    if (product.production_type === ProductionType.Imported) return;
    const next = new Set(path).add(product.sku);
    for (const item of product.recipe) {
      // Existing signed recipe adjustments retain the engine's cost deduction.
      if (!Number.isFinite(item.quantity)) throw new Error(`Μη έγκυρη ποσότητα συνταγής: ${product.sku}`);
      if (item.type === 'raw') {
        const material = materialsMap.get(item.id);
        if (!material || !Number.isFinite(material.cost_per_unit) || material.cost_per_unit < 0) throw new Error(`Λείπει υλικό ή έχει μη έγκυρο κόστος: ${product.sku}`);
      } else {
        const component = productsMap.get(item.sku);
        if (!component) throw new Error(`Λείπει εξάρτημα συνταγής: ${product.sku}`);
        checkRecipe(component, next, depth + 1);
      }
    }
  };
  const rows: CataloguePriceChange[] = [];
  let manualCount = 0; let serviceCount = 0;
  for (const product of products) {
    if (isLegalReservedItemCode(product.sku) || isSpecialCreationSku(product.sku)) { serviceCount++; continue; }
    checkRecipe(product, new Set(), 0);
    const rawMaster = snapshot.products.find(p => p.sku === product.sku)!;
    const process = (suffix: string | null, raw: Record<string, any>, manual: boolean) => {
      if (manual) manualCount++;
      const cost = suffix === null
        ? calculateProductCost(product, settings, materials, products, 0, new Set(), undefined, productsMap, materialsMap)
        : estimateVariantCost(product, suffix, settings, materials, products, undefined, productsMap, materialsMap);
      const values: Record<string, number> = { active_price: cost.total };
      if (suffix === null) {
        values.draft_price = cost.total;
        if (product.production_type === ProductionType.InHouse) {
          const auto = computeAutoLaborCosts(product, products, shouldUseSplitTechnicianCost(product), settings);
          if (auto.casting_cost !== undefined) values.labor_casting = auto.casting_cost;
          const technicianConfigured = Object.keys(settings.pricing_rules || {}).some(key => key.startsWith('technician_') || key === 'stx_technician_rate');
          if (technicianConfigured && auto.technician_cost !== undefined) values.labor_technician = auto.technician_cost;
          if (settings.pricing_rules?.plating_rate !== undefined) {
            if (auto.plating_cost_x !== undefined) values.labor_plating_x = auto.plating_cost_x;
            if (auto.plating_cost_d !== undefined) values.labor_plating_d = auto.plating_cost_d;
          }
        }
      }
      // STX is priced as a component cost by the existing new-product flow.
      if ((!manual || options.replaceManualSelling) && !product.is_component) values.selling_price = getIliosSuggestedPriceForProduct(product, suffix, settings, materials, products, productsMap, materialsMap);
      const before: Record<string, number | null> = {};
      for (const [key, value] of Object.entries(values)) {
        if (!Number.isFinite(value) || value < 0 || value > 100000000) throw new Error(`Μη έγκυρη τιμή: ${product.sku}${suffix ?? ''}`);
        before[key] = raw[key] == null ? null : Number(raw[key]);
        // Include an unchanged manual price when explicitly replacing it, so
        // the transaction also resets its flag to automatic formula pricing.
        if (before[key] !== null && Math.abs(before[key]! - value) < 0.000001 && !(key === 'selling_price' && manual && options.replaceManualSelling)) { delete values[key]; delete before[key]; }
      }
      if (Object.keys(values).length) rows.push({ sku: product.sku, suffix, values, before, manualSelling: manual });
    };
    process(null, rawMaster, !!product.selling_price_manual_override);
    for (const variant of product.variants || []) {
      const rawVariant = snapshot.variants.find(v => v.product_sku === product.sku && v.suffix === variant.suffix)!;
      process(variant.suffix, rawVariant, !!variant.selling_price_manual_override);
    }
  }
  return { rows, masterCount: rows.filter(r => r.suffix === null).length, variantCount: rows.filter(r => r.suffix !== null).length, manualCount, serviceCount };
}
