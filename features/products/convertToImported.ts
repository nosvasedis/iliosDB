import { GlobalSettings, Material, Product, ProductionType, Supplier } from '../../types';
import {
  calculateProductCost,
  estimateVariantCost,
  getIliosSuggestedPriceForProduct,
} from '../../utils/pricingEngine';
import { DEFAULT_PLATING_RATE } from '../../utils/laborFormula';

export interface ImportedConversionInput {
  supplierId?: string | null;
  supplierSku?: string | null;
  supplierCost?: number | null;
  technicianCostPerGram?: number;
  platingCostPerGram?: number;
  stoneSettingCost?: number;
  weightG?: number;
  secondaryWeightG?: number;
  supplierDetails?: Supplier | null;
}

const emptyToNull = (value?: string | null): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

export function computeImportedConversion(
  product: Product,
  settings: GlobalSettings,
  allMaterials: Material[],
  allProducts: Product[],
  input: ImportedConversionInput = {},
): {
  newProduct: Product;
  oldCost: ReturnType<typeof calculateProductCost>;
  newCost: ReturnType<typeof calculateProductCost>;
  oldIlios: number;
  newIlios: number;
} {
  if (product.production_type !== ProductionType.InHouse) {
    throw new Error('computeImportedConversion called on a non-InHouse product');
  }
  if (product.is_component) {
    throw new Error('computeImportedConversion called on a component');
  }

  const weightG = input.weightG === undefined ? product.weight_g : Number(input.weightG) || 0;
  const secondaryWeightG = input.secondaryWeightG === undefined
    ? (product.secondary_weight_g || 0)
    : Number(input.secondaryWeightG) || 0;
  const skipCasting = weightG > 0 || secondaryWeightG > 0 ? false : !!product.skip_casting;

  const newProduct: Product = {
    ...product,
    production_type: ProductionType.Imported,
    supplier_id: emptyToNull(input.supplierId),
    supplier_sku: emptyToNull(input.supplierSku),
    supplier_cost: input.supplierCost == null ? null : Number(input.supplierCost),
    supplier_details: input.supplierDetails ?? (emptyToNull(input.supplierId) ? product.supplier_details : undefined),
    weight_g: weightG,
    secondary_weight_g: secondaryWeightG,
    skip_casting: skipCasting,
    recipe: [],
    molds: [],
    labor: {
      casting_cost: 0,
      setter_cost: 0,
      technician_cost: Number(input.technicianCostPerGram) || 0,
      stone_setting_cost: Number(input.stoneSettingCost) || 0,
      plating_cost_x: input.platingCostPerGram === undefined ? DEFAULT_PLATING_RATE : Number(input.platingCostPerGram) || 0,
      plating_cost_d: product.labor.plating_cost_d || 0,
      subcontract_cost: product.labor.subcontract_cost || 0,
      casting_cost_manual_override: false,
      technician_cost_manual_override: false,
      plating_cost_x_manual_override: false,
      plating_cost_d_manual_override: false,
    },
  };

  newProduct.variants = (product.variants || []).map((variant) => {
    const { total } = estimateVariantCost(newProduct, variant.suffix, settings, allMaterials, allProducts);
    return { ...variant, active_price: total };
  });

  return {
    newProduct,
    oldCost: calculateProductCost(product, settings, allMaterials, allProducts),
    newCost: calculateProductCost(newProduct, settings, allMaterials, allProducts),
    oldIlios: getIliosSuggestedPriceForProduct(product, null, settings, allMaterials, allProducts),
    newIlios: getIliosSuggestedPriceForProduct(newProduct, null, settings, allMaterials, allProducts),
  };
}

export function toImportedSavePayload(product: Product, cost: number): Record<string, unknown> {
  return {
    sku: product.sku,
    prefix: product.sku.substring(0, 2),
    category: product.category,
    description: product.is_component ? product.description : null,
    gender: product.gender,
    image_url: product.image_url,
    weight_g: product.weight_g,
    secondary_weight_g: product.secondary_weight_g || null,
    invoice_total_weight_g: product.invoice_total_weight_g && product.invoice_total_weight_g > 0
      ? product.invoice_total_weight_g
      : null,
    selling_price: product.is_component ? 0 : product.selling_price,
    selling_price_manual_override: product.is_component ? false : !!product.selling_price_manual_override,
    plating_type: product.plating_type,
    labor_casting: product.labor.casting_cost,
    labor_setter: product.labor.setter_cost,
    labor_technician: product.labor.technician_cost,
    labor_plating_x: product.labor.plating_cost_x,
    labor_plating_d: product.labor.plating_cost_d,
    labor_subcontract: product.labor.subcontract_cost,
    labor_casting_manual_override: false,
    labor_technician_manual_override: false,
    labor_plating_x_manual_override: false,
    labor_plating_d_manual_override: false,
    active_price: cost,
    draft_price: cost,
    is_component: product.is_component,
    skip_casting: !!product.skip_casting,
    production_type: product.production_type,
    supplier_id: product.supplier_id || null,
    supplier_sku: product.supplier_sku || null,
    supplier_cost: product.supplier_cost ?? null,
    labor_stone_setting: product.labor.stone_setting_cost,
  };
}
