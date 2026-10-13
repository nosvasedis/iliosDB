import { Gender, PlatingType, ProductionType, type Product } from '../../types';
import { resolveInvoiceTotalWeight } from '../../utils/invoiceTotalWeight';
import { mapProductsWithRelations } from '../products/mappers';
import { isVisibleProductCatalogRow } from '../products/catalogVisibility';
import type { LegalCatalogItem } from './types';

/** The context is server-only; the returned DTO never contains recipes, labor or inventory. */
export function buildLegalCatalog(context: { products: any[]; variants: any[]; recipes: any[]; materials: any[] }): LegalCatalogItem[] {
  const products = mapProductsWithRelations(context.products, { variants: context.variants, recipes: context.recipes }, {
    publicImageBaseUrl: 'https://ilios-image-handler.iliosdb.workers.dev', centralWarehouseId: '', showroomWarehouseId: '',
  });
  return products.filter((product) => isVisibleProductCatalogRow(product)).map((product) => ({
    sku: product.sku, prefix: product.prefix, category: product.category, description: product.description || '', image_url: product.image_url,
    gender: product.gender, plating_type: product.plating_type, production_type: product.production_type,
    is_component: product.is_component, skip_casting: !!product.skip_casting,
    weight_g: product.weight_g, secondary_weight_g: product.secondary_weight_g ?? null,
    active_price: product.active_price, selling_price: product.selling_price,
    selling_price_manual_override: !!product.selling_price_manual_override,
    resolved_invoice_weight: resolveInvoiceTotalWeight(product, products, context.materials),
    variants: (product.variants || []).map((variant) => ({
      suffix: variant.suffix, description: variant.description,
      active_price: variant.active_price ?? null, selling_price: variant.selling_price ?? null,
      selling_price_manual_override: !!variant.selling_price_manual_override,
    })),
  }));
}

/** Compatibility adapter for the existing legal editor. Inventory is unavailable in this DTO. */
export function legalCatalogProducts(items: LegalCatalogItem[]): Product[] {
  return items.map((item) => ({
    ...item, gender: item.gender || Gender.Unisex, plating_type: item.plating_type || PlatingType.None,
    production_type: item.production_type || ProductionType.InHouse,
    draft_price: 0, stock_qty: 0, sample_qty: 0, molds: [], recipe: [], collections: [],
    labor: { casting_cost: 0, setter_cost: 0, technician_cost: 0, stone_setting_cost: 0, plating_cost_x: 0, plating_cost_d: 0, subcontract_cost: 0 },
    variants: item.variants.map((variant) => ({ ...variant, stock_qty: 0 })),
  }));
}
