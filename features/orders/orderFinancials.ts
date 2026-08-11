import type { OrderItem } from '../../types';

export interface OrderFinancials {
  saleSubtotal: number;
  consignmentSubtotal: number;
  discountAmount: number;
  saleNet: number;
  saleVat: number;
  payableNow: number;
  consignmentVat: number;
  consignmentValue: number;
}

export function calculateOrderFinancials(
  items: readonly OrderItem[],
  discountPercent: number,
  vatRate: number,
): OrderFinancials {
  const saleSubtotal = items
    .filter((item) => (item.fulfillment_mode || 'sale') === 'sale')
    .reduce((sum, item) => sum + item.price_at_order * item.quantity, 0);
  const consignmentSubtotal = items
    .filter((item) => item.fulfillment_mode === 'consignment')
    .reduce((sum, item) => sum + item.price_at_order * item.quantity, 0);
  const discountAmount = saleSubtotal * (Math.max(0, discountPercent) / 100);
  const saleNet = saleSubtotal - discountAmount;
  const saleVat = saleNet * vatRate;
  const consignmentVat = consignmentSubtotal * vatRate;
  return {
    saleSubtotal,
    consignmentSubtotal,
    discountAmount,
    saleNet,
    saleVat,
    payableNow: saleNet + saleVat,
    consignmentVat,
    consignmentValue: consignmentSubtotal + consignmentVat,
  };
}
