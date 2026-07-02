import { Product, ProductVariant } from '../../types';
import { FINISH_CODES, STONE_CODES_MEN, STONE_CODES_WOMEN } from '../../constants';
import { formatCurrency, getLabelDisplayPrice } from '../../utils/pricingEngine';

export type LabelFormat = 'standard' | 'simple' | 'retail';
export type LabelPriceTier = 'wholesale' | 'retail';

export interface LabelTextOverrides {
  displaySku?: string;
  stone?: string;
  brand?: string;
  price?: string;
  metal?: string;
  size?: string;
}

export interface BuiltLabelText {
  sourceSku: string;
  displaySku: string;
  skuMaster: string;
  suffix: string;
  stone: string;
  brand: string;
  price: string;
  metal: string;
  size: string;
}

interface BuildLabelTextInput {
  product: Product;
  variant?: ProductVariant;
  format?: LabelFormat;
  size?: string;
  showPrice?: boolean;
  priceTier?: LabelPriceTier;
  overrides?: LabelTextOverrides;
}

export function getLabelSourceSku(product: Product, variant?: ProductVariant): string {
  return `${product?.sku || ''}${variant?.suffix || ''}`;
}

export function getDefaultLabelStone(product: Product, variant?: ProductVariant): string {
  const suffix = variant?.suffix || '';

  if (product.sku.startsWith('ST') && (variant?.suffix === '' || !variant)) {
    return '';
  }

  if (variant?.description) {
    let desc = variant.description;
    const finishes = Object.values(FINISH_CODES);
    finishes.forEach((finish) => {
      if (finish) {
        const regex = new RegExp(`(^|\\s*-\\s*)${finish}(\\s*-\\s*|$)`, 'i');
        desc = desc.replace(regex, '').trim();
      }
    });
    desc = desc.replace(/Λουστρέ/gi, '').replace(/Πατίνα/gi, '').trim();
    desc = desc.replace(/^-+\s*/, '').replace(/\s*-+$/, '').trim();
    if (desc && desc.length > 2) return desc;
  }

  if (suffix) {
    const allStones = { ...STONE_CODES_MEN, ...STONE_CODES_WOMEN };
    const sortedCodes = Object.keys(allStones).sort((a, b) => b.length - a.length);
    for (const code of sortedCodes) {
      if (suffix.includes(code)) return (allStones as Record<string, string>)[code];
    }
  }

  return '';
}

export function getDefaultLabelPrice(
  product: Product,
  variant: ProductVariant | undefined,
  showPrice: boolean,
  priceTier: LabelPriceTier,
): string {
  if (!showPrice) return '';
  const wholesalePrice = variant?.selling_price ?? product?.selling_price ?? 0;
  const displayPrice = getLabelDisplayPrice(wholesalePrice, priceTier);
  return displayPrice > 0 ? formatCurrency(displayPrice) : '';
}

export function buildLabelText({
  product,
  variant,
  format = 'standard',
  size,
  showPrice: showPriceProp,
  priceTier = 'wholesale',
  overrides,
}: BuildLabelTextInput): BuiltLabelText {
  const sourceSku = getLabelSourceSku(product, variant);
  const showPrice = showPriceProp ?? format !== 'retail';
  const defaults: BuiltLabelText = {
    sourceSku,
    displaySku: sourceSku,
    skuMaster: product.sku,
    suffix: variant?.suffix || '',
    stone: getDefaultLabelStone(product, variant),
    brand: 'ILIOS',
    price: getDefaultLabelPrice(product, variant, showPrice, priceTier),
    metal: '925°',
    size: size || '',
  };

  return {
    ...defaults,
    ...overrides,
  };
}
