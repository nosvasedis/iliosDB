import { Gender, LaborCost, OrderItem, PlatingType, Product, ProductionType } from '../types';

/** Reserved systemic code for one-off / special creations (not a catalog product). */
export const SPECIAL_CREATION_SKU = 'SP';
export const MISSING_SPECIAL_CREATION_NOTE = '⚠ SP χωρίς σημείωση';
const MISSING_SPECIAL_CREATION_NOTE_KEY = '__missing_sp_note__';

export function isSpecialCreationSku(sku: string | undefined | null): boolean {
  return (sku || '').trim().toUpperCase() === SPECIAL_CREATION_SKU;
}

/** Keeps the authored layout while removing meaningless outer whitespace. */
export function cleanSpecialCreationNote(note: string | undefined | null): string {
  return (note || '').normalize('NFC').trim();
}

/** Stable comparison key: whitespace/case-only differences represent the same creation. */
export function normalizeSpecialCreationNote(note: string | undefined | null): string {
  const cleaned = cleanSpecialCreationNote(note);
  if (!cleaned) return '';
  return cleaned.replace(/\s+/g, ' ').toLocaleLowerCase('el-GR');
}

export function getSpecialCreationNoteKey(note: string | undefined | null): string {
  return normalizeSpecialCreationNote(note) || MISSING_SPECIAL_CREATION_NOTE_KEY;
}

export function getSpecialCreationDisplayNote(
  sku: string | undefined | null,
  note: string | undefined | null,
): string | null {
  if (!isSpecialCreationSku(sku)) return null;
  return cleanSpecialCreationNote(note) || MISSING_SPECIAL_CREATION_NOTE;
}

export function hasRequiredSpecialCreationNote(
  item: Pick<OrderItem, 'sku' | 'notes'>,
): boolean {
  return !isSpecialCreationSku(item.sku) || cleanSpecialCreationNote(item.notes).length > 0;
}

export function findSpecialCreationItemsMissingNotes(
  items: Array<Pick<OrderItem, 'sku' | 'notes'>>,
): Array<Pick<OrderItem, 'sku' | 'notes'>> {
  return items.filter((item) => !hasRequiredSpecialCreationNote(item));
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
