import { Gender, PlatingType, ProductionType, type LegalSystemItem, type Product } from '../types';
import {
  LEGAL_REPAIR_ITEM_CODE,
  LEGAL_REPAIR_ITEM_DESCRIPTION,
  LEGAL_SHIPPING_ITEM_CODE,
  LEGAL_SHIPPING_ITEM_DESCRIPTION,
  isLegalReservedItemCode,
} from './legalItemCodes';
import { getLegalLineUnitMeta, isLegalLineUnit } from './legalUnits';

/** Built-in codes with special tax handling (000 μεταφορικά, 001 επισκευή). Read-only. */
export const LEGAL_BUILTIN_SYSTEM_ITEMS: ReadonlyArray<LegalSystemItem & { builtin: true; note: string }> = [
  { code: LEGAL_SHIPPING_ITEM_CODE, description: LEGAL_SHIPPING_ITEM_DESCRIPTION, unit: 'pcs', default_price: 6, is_active: true, builtin: true, note: 'Χαρακτηρίζεται αυτόματα ως παροχή υπηρεσιών.' },
  { code: LEGAL_REPAIR_ITEM_CODE, description: LEGAL_REPAIR_ITEM_DESCRIPTION, unit: 'pcs', default_price: 1, is_active: true, builtin: true, note: 'Τιμολόγιο Παροχής Υπηρεσιών (2.1).' },
];

/** First set agreed for deliveries to the foundry (χυτήριο). Seeded once by migration. */
export const LEGAL_DEFAULT_SYSTEM_ITEMS: LegalSystemItem[] = [
  { code: 'ΑΦΟΣ', description: 'Ασήμι 999°', unit: 'g', default_price: null, is_active: true },
  { code: 'ΜΠΟΚ', description: 'Κράμα μετάλλου ασήμι 925°', unit: 'g', default_price: null, is_active: true },
  { code: 'ΚΕΡ', description: 'Κέρινα ομοιώματα μέρους κοσμημάτων', unit: 'pcs', default_price: null, is_active: true },
  { code: 'ΕΠΕΞ', description: 'Ακατέργαστα κοσμήματα 925°', unit: 'g', default_price: null, is_active: true },
];

/** Codes are matched case-insensitively; Greek and Latin letters stay distinct. */
export function normalizeLegalSystemCode(value?: string | null): string {
  return String(value || '').trim().toLocaleUpperCase('el-GR').replace(/\s+/g, '');
}

export function sanitizeLegalSystemItems(value: unknown): LegalSystemItem[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const items: LegalSystemItem[] = [];
  for (const raw of value) {
    const code = normalizeLegalSystemCode((raw as any)?.code);
    const description = String((raw as any)?.description || '').trim();
    if (!code || !description || seen.has(code) || isLegalReservedItemCode(code)) continue;
    seen.add(code);
    const price = (raw as any)?.default_price;
    items.push({
      code,
      description,
      unit: isLegalLineUnit((raw as any)?.unit) ? (raw as any).unit : 'pcs',
      default_price: price === null || price === undefined || price === '' || !Number.isFinite(Number(price)) ? null : Math.max(0, Number(price)),
      is_active: (raw as any)?.is_active !== false,
    });
  }
  return items;
}

/** Problems with a code before it is saved. Product SKUs are passed to avoid shadowing a real product. */
export function validateLegalSystemItem(item: LegalSystemItem, others: LegalSystemItem[], productSkus: Iterable<string> = []): string | null {
  const code = normalizeLegalSystemCode(item.code);
  if (!code) return 'Συμπληρώστε κωδικό.';
  if (code.length > 20) return 'Ο κωδικός πρέπει να έχει έως 20 χαρακτήρες.';
  if (!/^[0-9A-ZΑ-Ω._-]+$/u.test(code)) return 'Ο κωδικός δέχεται μόνο γράμματα, αριθμούς, τελεία, παύλα και κάτω παύλα.';
  if (isLegalReservedItemCode(code)) return `Ο κωδικός ${code} είναι δεσμευμένος από το σύστημα.`;
  if (others.some((other) => normalizeLegalSystemCode(other.code) === code)) return `Ο κωδικός ${code} υπάρχει ήδη.`;
  for (const sku of productSkus) {
    if (normalizeLegalSystemCode(sku) === code) return `Ο κωδικός ${code} είναι ήδη κωδικός προϊόντος.`;
  }
  if (!item.description.trim()) return 'Συμπληρώστε περιγραφή.';
  if (item.description.trim().length > 300) return 'Η περιγραφή πρέπει να έχει έως 300 χαρακτήρες.';
  if (item.default_price !== null && item.default_price !== undefined && (!Number.isFinite(item.default_price) || item.default_price < 0)) return 'Η τιμή πρέπει να είναι θετικός αριθμός.';
  return null;
}

export function findLegalSystemItem(items: LegalSystemItem[] | null | undefined, code?: string | null): LegalSystemItem | null {
  const normalized = normalizeLegalSystemCode(code);
  if (!normalized) return null;
  return (items || []).find((item) => normalizeLegalSystemCode(item.code) === normalized) || null;
}

/** Catalogue rows for the line picker. Prices are per stored (AADE) unit, like real products. */
export function legalSystemItemProducts(items: LegalSystemItem[] | null | undefined): Product[] {
  return sanitizeLegalSystemItems(items).filter((item) => item.is_active).map((item) => {
    const meta = getLegalLineUnitMeta(item.unit);
    const storedPrice = item.default_price ? Math.round((item.default_price / meta.factor) * 100) / 100 : 0;
    return {
      sku: item.code,
      prefix: item.code,
      category: 'Συστημικός κωδικός',
      description: item.description,
      gender: Gender.Unisex,
      image_url: null,
      weight_g: 0,
      plating_type: PlatingType.None,
      production_type: ProductionType.Imported,
      active_price: storedPrice,
      draft_price: storedPrice,
      selling_price: storedPrice,
      stock_qty: 0,
      sample_qty: 0,
      molds: [],
      is_component: false,
      variants: [],
      recipe: [],
      labor: { casting_cost: 0, setter_cost: 0, technician_cost: 0, stone_setting_cost: 0, plating_cost_x: 0, plating_cost_d: 0, subcontract_cost: 0 },
      collections: [],
    } as Product;
  });
}
