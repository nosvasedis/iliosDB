import { describe, expect, it } from 'vitest';
import { OrderStatus } from '../../types';
import { canAccessOrderProductionManagement } from '../../features/orders/statusPresentation';

describe('canAccessOrderProductionManagement', () => {
  it.each([
    OrderStatus.Pending,
    OrderStatus.InProduction,
    OrderStatus.Ready,
    OrderStatus.PartiallyDelivered,
    OrderStatus.Delivered,
  ])('allows production management for %s orders', (status) => {
    expect(canAccessOrderProductionManagement(status)).toBe(true);
  });

  it('keeps cancelled orders out of production management', () => {
    expect(canAccessOrderProductionManagement(OrderStatus.Cancelled)).toBe(false);
  });
});
