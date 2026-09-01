import { Product, ProductVariant } from '../../types';
import { LabelPriceTier, LabelTextOverrides } from './labelText';
import { PrintLabelItem } from './printTypes';

export type LabelPrintFormat = 'standard' | 'retail';

export const LABEL_PRINT_STORAGE_KEYS = {
  format: 'batch_print_format',
  showPrice: 'batch_print_show_price',
  priceTier: 'batch_print_price_tier',
} as const;

export interface LabelPrintSettings {
  format: LabelPrintFormat;
  showPrice: boolean;
  priceTier: LabelPriceTier;
}

export const LABEL_TEXT_OVERRIDE_FIELDS: Array<[keyof LabelTextOverrides, string]> = [
  ['displaySku', 'SKU / Όνομα'],
  ['stone', 'Πέτρα / Περιγραφή'],
  ['brand', 'Επωνυμία'],
  ['price', 'Τιμή'],
  ['metal', 'Μέταλλο'],
  ['size', 'Μέγεθος'],
];

type StorageReader = Pick<Storage, 'getItem'>;

function getDefaultStorage(): StorageReader {
  if (typeof localStorage === 'undefined') {
    return { getItem: () => null };
  }
  return localStorage;
}

function readStoredFormat(value: string | null): LabelPrintFormat {
  return value === 'retail' ? 'retail' : 'standard';
}

function readStoredPriceTier(value: string | null): LabelPriceTier {
  return value === 'retail' ? 'retail' : 'wholesale';
}

export function readLabelPrintSettings(storage: StorageReader = getDefaultStorage()): LabelPrintSettings {
  const format = readStoredFormat(storage.getItem(LABEL_PRINT_STORAGE_KEYS.format));
  const savedShowPrice = storage.getItem(LABEL_PRINT_STORAGE_KEYS.showPrice);
  return {
    format,
    showPrice: savedShowPrice !== null ? savedShowPrice === 'true' : format === 'standard',
    priceTier: readStoredPriceTier(storage.getItem(LABEL_PRINT_STORAGE_KEYS.priceTier)),
  };
}

export function registryBarcodeItemKey(variant?: ProductVariant | null): string {
  return variant ? variant.suffix : 'master';
}

export function hasLabelTextOverrides(overrides?: LabelTextOverrides): boolean {
  return Boolean(overrides && Object.keys(overrides).length > 0);
}

interface BuildRegistryBarcodePrintItemsInput {
  product: Product;
  variants: ProductVariant[];
  format: LabelPrintFormat;
  showPrice: boolean;
  priceTier: LabelPriceTier;
  labelOverrides?: Record<string, LabelTextOverrides>;
  quantity?: number;
  variantKey?: string;
}

export function buildRegistryBarcodePrintItems({
  product,
  variants,
  format,
  showPrice,
  priceTier,
  labelOverrides = {},
  quantity = 1,
  variantKey,
}: BuildRegistryBarcodePrintItemsInput): PrintLabelItem[] {
  const sources = variants.length > 0
    ? variants.map(variant => ({ variant, key: registryBarcodeItemKey(variant) }))
    : [{ variant: undefined, key: registryBarcodeItemKey() }];

  return sources
    .filter(item => variantKey === undefined || item.key === variantKey)
    .map(({ variant, key }) => {
      const overrides = labelOverrides[key];
      return {
        product,
        ...(variant ? { variant } : {}),
        quantity,
        format,
        showPrice,
        priceTier,
        ...(hasLabelTextOverrides(overrides) ? { labelOverrides: overrides } : {}),
      };
    });
}
