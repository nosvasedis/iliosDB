import { Gender, LaborCost, PlatingType, Product, ProductionType } from '../types';

/** Reserved systemic code for one-off / special creations (not a catalog product). */
export const SPECIAL_CREATION_SKU = 'SP';

export function isSpecialCreationSku(sku: string | undefined | null): boolean {
  return (sku || '').trim().toUpperCase() === SPECIAL_CREATION_SKU;
}

const SPECIAL_LABOR: LaborCost = {
  casting_cost: 0,
  setter_cost: 0,
  technician_cost: 0,
  stone_setting_cost: 0,
  plating_cost_x: 0,
  plating_cost_d: 0,
  subcontract_cost: 0
};

/** Synthetic catalog row for UI/PDF when the line is SP (no DB product). */
export function getSpecialCreationProductStub(): Product {
  return {
    sku: SPECIAL_CREATION_SKU,
    prefix: 'SP',
    category: 'Ειδική δημιουργία',
    description: 'Ειδική κατασκευή / χειροκίνητη τιμολόγηση',
    gender: Gender.Unisex,
    image_url: null,
    weight_g: 0,
    plating_type: PlatingType.None,
    production_type: ProductionType.InHouse,
    active_price: 0,
    draft_price: 0,
    selling_price: 0,
    stock_qty: 0,
    sample_qty: 0,
    molds: [],
    is_component: false,
    recipe: [],
    labor: SPECIAL_LABOR
  };
}
