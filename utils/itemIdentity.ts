import { ProductOptionColor } from '../types';

export interface ItemIdentityLike {
  sku: string;
  variant_suffix?: string | null;
  size_info?: string | null;
  cord_color?: ProductOptionColor | string | null;
  enamel_color?: ProductOptionColor | string | null;
  line_id?: string | null;
}

export function buildItemIdentityKey(item: ItemIdentityLike): string {
  const base = [
    item.sku,
    item.variant_suffix || '',
    item.size_info || '',
    item.cord_color || '',
    item.enamel_color || ''
  ].join('::');
  return item.line_id ? `${base}::lid:${item.line_id}` : base;
}

export function getItemIdentityParts(item: ItemIdentityLike) {
  return {
    variant_suffix: item.variant_suffix || null,
    size_info: item.size_info || null,
    cord_color: item.cord_color || null,
    enamel_color: item.enamel_color || null
  };
}
