import { describe, expect, it } from 'vitest';
import { buildPartialOrderFromBatches } from '../../features/orders/partialOrder';
import { Order, OrderStatus, ProductionBatch, ProductionStage, VatRegime } from '../../types';

describe('buildPartialOrderFromBatches', () => {
  it('keeps only selected line quantities and recalculates the total', () => {
    const order: Order = {
      id: 'ORD-1',
      customer_name: 'Demo',
      customer_phone: '',
      created_at: '2026-01-01T00:00:00.000Z',
      status: OrderStatus.InProduction,
      vat_rate: VatRegime.Standard,
      discount_percent: 10,
      total_price: 999,
      items: [
        { sku: 'AA10', quantity: 3, price_at_order: 10, line_id: 'line-1' },
        { sku: 'BB20', quantity: 2, price_at_order: 20, line_id: 'line-2', size_info: '54' },
      ],
    };

    const selectedBatches: ProductionBatch[] = [
      {
        id: 'batch-1',
        sku: 'AA10',
        quantity: 2,
        current_stage: ProductionStage.Waxing,
        created_at: '2026-01-02T00:00:00.000Z',
        updated_at: '2026-01-02T00:00:00.000Z',
        line_id: 'line-1',
      } as ProductionBatch,
      {
        id: 'batch-2',
        sku: 'BB20',
        quantity: 1,
        current_stage: ProductionStage.Waxing,
        created_at: '2026-01-02T00:00:00.000Z',
        updated_at: '2026-01-02T00:00:00.000Z',
        line_id: 'line-2',
        size_info: '54',
      } as ProductionBatch,
    ];

    const partialOrder = buildPartialOrderFromBatches(order, selectedBatches);

    expect(partialOrder.items).toHaveLength(2);
    expect(partialOrder.items[0].quantity).toBe(2);
    expect(partialOrder.items[1].quantity).toBe(1);
    expect(partialOrder.total_price).toBeCloseTo(44.64, 5);
  });
});
