export const LEGAL_SHIPPING_ITEM_CODE = '000';
export const LEGAL_SHIPPING_ITEM_DESCRIPTION = 'Μεταφορικά';

export function isLegalShippingItemCode(value?: string | null): boolean {
  return String(value || '').trim().toUpperCase() === LEGAL_SHIPPING_ITEM_CODE;
}
