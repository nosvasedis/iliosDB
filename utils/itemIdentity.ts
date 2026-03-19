import { ProductOptionColor } from '../types';

export interface ItemIdentityLike {
  sku: string;
  variant_suffix?: string | null;
  size_info?: string | null;
  cord_color?: ProductOptionColor | null;
  enamel_color?: ProductOptionColor | null;
}

export function buildItemIdentityKey(item: ItemIdentityLike): string {
  return [
    item.sku,
    item.variant_suffix || '',
    item.size_info || '',
    item.cord_color || '',
    item.enamel_color || ''
  ].join('::');
}

export function getItemIdentityParts(item: ItemIdentityLike) {
  return {
    variant_suffix: item.variant_suffix || null,
    size_info: item.size_info || null,
    cord_color: item.cord_color || null,
    enamel_color: item.enamel_color || null
  };
}
