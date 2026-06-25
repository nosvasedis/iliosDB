import { describe, expect, it } from 'vitest';
import { resolveOrderSeller, withResolvedOrderSeller } from '../../utils/orderSeller';

const sellers = [
  { id: 's1', full_name: 'Αλέξανδρος Παπαϊωαννίδης', email: 'a@test.com', is_approved: true, role: 'seller' as const, commission_percent: 12 },
];

describe('orderSeller', () => {
  it('prefers profile name when seller_id is set', () => {
    const resolved = resolveOrderSeller(
      { seller_id: 's1', seller_name: 'Παλιό όνομα', seller_commission_percent: 5 },
      sellers,
    );
    expect(resolved).toMatchObject({
      sellerId: 's1',
      sellerName: 'Αλέξανδρος Παπαϊωαννίδης',
      sellerCommissionPercent: 5,
    });
  });

  it('falls back to order seller_name when profile is missing', () => {
    const resolved = resolveOrderSeller(
      { seller_id: 'legacy', seller_name: 'Παλιός Πλασιέ', seller_commission_percent: null },
      sellers,
    );
    expect(resolved.sellerName).toBe('Παλιός Πλασιέ');
  });

  it('withResolvedOrderSeller persists canonical seller fields on save', () => {
    const order = withResolvedOrderSeller(
      {
        seller_id: 's1',
        seller_name: undefined,
        seller_commission_percent: undefined,
      },
      sellers,
    );
    expect(order.seller_name).toBe('Αλέξανδρος Παπαϊωαννίδης');
    expect(order.seller_commission_percent).toBe(12);
  });
});
