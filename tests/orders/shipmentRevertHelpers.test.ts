import { describe, expect, it } from 'vitest';
import { planShipmentBatchRestores } from '../../features/orders/shipmentRevertHelpers';
import { OrderShipmentItem, ProductionBatch, ProductionStage } from '../../types';

const NOW = '2026-05-22T08:30:00.000Z';

function readyBatch(overrides: Partial<ProductionBatch>): ProductionBatch {
  return {
    id: overrides.id || 'batch-1',
    order_id: 'ORD-1',
    sku: 'KN006',
    variant_suffix: 'X',
    quantity: 1,
    current_stage: ProductionStage.Ready,
    created_at: '2026-04-01T00:00:00.000Z',
    updated_at: '2026-04-01T00:00:00.000Z',
    priority: 'Normal',
    requires_setting: false,
    ...overrides,
  } as ProductionBatch;
}

describe('planShipmentBatchRestores', () => {
  it('updates an existing batch instead of inserting a duplicate', () => {
    const existing = [readyBatch({ id: 'keep-me', sku: 'KN006', variant_suffix: 'X', quantity: 1 })];
    const shipmentItems = [
      {
        id: 'si-1',
        shipment_id: 'ship-1',
        sku: 'KN006',
        variant_suffix: 'X',
        quantity: 1,
        price_at_order: 10,
      } as OrderShipmentItem,
    ];

    const plan = planShipmentBatchRestores(shipmentItems, existing, 'ORD-1', NOW);

    expect(plan.inserts).toHaveLength(0);
    expect(plan.updates).toEqual([
      {
        id: 'keep-me',
        quantity: 2,
        current_stage: ProductionStage.Ready,
        updated_at: NOW,
      },
    ]);
  });

  it('inserts a batch only when no matching row exists', () => {
    const plan = planShipmentBatchRestores(
      [
        {
          id: 'si-2',
          shipment_id: 'ship-1',
          sku: 'PN175',
          variant_suffix: 'P',
          quantity: 1,
          price_at_order: 10,
        } as OrderShipmentItem,
      ],
      [],
      'ORD-1',
      NOW,
    );

    expect(plan.updates).toHaveLength(0);
    expect(plan.inserts).toHaveLength(1);
    expect(plan.inserts[0]).toMatchObject({
      order_id: 'ORD-1',
      sku: 'PN175',
      variant_suffix: 'P',
      quantity: 1,
      current_stage: ProductionStage.Ready,
    });
  });
});
