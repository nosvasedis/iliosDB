import { Product, ProductOptionColor } from '../types';

export const PRODUCT_OPTION_COLOR_LABELS: Record<ProductOptionColor, string> = {
  black: 'μαύρο',
  red: 'κόκκινο',
  blue: 'μπλε'
};

export const PRODUCT_OPTION_COLORS: ProductOptionColor[] = ['black', 'red', 'blue'];

function getSkuNumber(value: string): number | null {
  const match = value.toUpperCase().match(/^XR(\d+)/);
  if (!match) return null;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isXrCordEnamelSku(value: string | Product): boolean {
  const sku = typeof value === 'string' ? value : value.sku;
  const skuNumber = getSkuNumber(sku);
  return skuNumber !== null && skuNumber >= 1150 && skuNumber <= 1199;
}

export function isXrExtendedSizingSku(value: string | Product): boolean {
  const sku = typeof value === 'string' ? value : value.sku;
  const skuNumber = getSkuNumber(sku);
  return skuNumber !== null && skuNumber >= 100 && skuNumber <= 199;
}

export function getProductOptionColorLabel(color?: ProductOptionColor | null): string | null {
  if (!color) return null;
  return PRODUCT_OPTION_COLOR_LABELS[color] || null;
}
