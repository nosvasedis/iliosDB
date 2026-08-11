import { describe, expect, it } from 'vitest';
import type { OrderItem } from '../../types';
import { calculateOrderFinancials } from '../../features/orders/orderFinancials';

describe('οικονομικά μικτής παραγγελίας', () => {
  it('χρεώνει τώρα μόνο τις γραμμές πώλησης', () => {
    const items = [
      { sku: 'SALE-1', quantity: 2, price_at_order: 100, fulfillment_mode: 'sale' },
      { sku: 'CONS-1', quantity: 3, price_at_order: 50, fulfillment_mode: 'consignment' },
    ] as OrderItem[];

    const result = calculateOrderFinancials(items, 10, 0.24);

    expect(result.saleSubtotal).toBe(200);
    expect(result.consignmentSubtotal).toBe(150);
    expect(result.discountAmount).toBe(20);
    expect(result.payableNow).toBeCloseTo(223.2);
    expect(result.consignmentValue).toBeCloseTo(186);
  });

  it('αντιμετωπίζει τις παλιές γραμμές χωρίς τύπο ως πώληση', () => {
    const result = calculateOrderFinancials([
      { sku: 'LEGACY', quantity: 1, price_at_order: 80 },
    ] as OrderItem[], 0, 0.24);

    expect(result.payableNow).toBeCloseTo(99.2);
    expect(result.consignmentValue).toBe(0);
  });
});
