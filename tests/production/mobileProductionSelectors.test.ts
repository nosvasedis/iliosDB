import { describe, expect, it } from 'vitest';
import { Gender, MaterialType, OrderStatus, ProductionStage, ProductionType } from '../../types';
import {
  buildMobileProductionFoundBatches,
  buildMobileSettingStoneBreakdown,
  buildMobileSettingStoneOrderGroups,
  buildMobileSettingStoneOrderList,
  getMobileProductionNextStage,
  groupMobilePrintSelectorBatches,
  matchesProductionFinderBatch,
} from '../../features/production/workflowSelectors';

describe('mobile production selectors', () => {
  it('resolves next stages using the shared production rules', () => {
    expect(getMobileProductionNextStage({
      id: 'b1',
      sku: 'PN1',
      quantity: 1,
      current_stage: ProductionStage.AwaitingDelivery,
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
      priority: 'Normal',
      requires_setting: false,
      product_details: { production_type: ProductionType.Imported } as any,
    })).toBe(ProductionStage.Labeling);
  });

  it('filters and sorts found batches by stage then exact match', () => {
    const found = buildMobileProductionFoundBatches([
      {
        id: 'b1',
        sku: 'PN2',
        quantity: 1,
        current_stage: ProductionStage.Polishing,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
        priority: 'Normal',
        requires_setting: true,
        customer_name: 'Alpha',
      },
      {
        id: 'b2',
        sku: 'PN1',
        quantity: 1,
        current_stage: ProductionStage.Waxing,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
        priority: 'Normal',
        requires_setting: true,
        customer_name: 'Beta',
      },
    ] as any, 'pn1');

    expect(found.map((batch) => batch.sku)).toEqual(['PN1']);
    expect(found[0].customerName).toBe('Beta');
  });

  it('uses SKU prefix matching so internal fragments do not match', () => {
    const found = buildMobileProductionFoundBatches(
      [
        {
          id: 'b1',
          sku: 'DA100',
          quantity: 1,
          current_stage: ProductionStage.Waxing,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
          priority: 'Normal',
          requires_setting: true,
          customer_name: 'Zed',
        },
        {
          id: 'b2',
          sku: 'XR5',
          quantity: 1,
          current_stage: ProductionStage.Waxing,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
          priority: 'Normal',
          requires_setting: true,
          customer_name: 'Zed',
        },
      ] as any,
      'XR',
    );
    expect(found.map((b) => b.sku)).toEqual(['XR5']);
  });

  it('strict letter-led queries ignore order_id so other SKUs on the same order do not appear', () => {
    const batchDa = {
      id: 'b-da',
      sku: 'DA1',
      order_id: 'order-with-XR-in-id',
      quantity: 1,
      current_stage: ProductionStage.Waxing,
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
      priority: 'Normal',
      requires_setting: true,
      customer_name: 'Client',
    };
    const batchXr = {
      ...batchDa,
      id: 'b-xr',
      sku: 'XR99',
    };
    const found = buildMobileProductionFoundBatches([batchDa, batchXr] as any, 'XR');
    expect(found.map((b) => b.sku)).toEqual(['XR99']);
    expect(matchesProductionFinderBatch(batchDa as any, 'XR')).toBe(false);
  });

  it('non letter-led queries still match customer name (Greek)', () => {
    const found = buildMobileProductionFoundBatches(
      [
        {
          id: 'b1',
          sku: 'ZZ9',
          quantity: 1,
          current_stage: ProductionStage.Waxing,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
          priority: 'Normal',
          requires_setting: true,
          customer_name: 'Νίκος Α.',
        },
      ] as any,
      'Νίκ',
    );
    expect(found).toHaveLength(1);
    expect(found[0].sku).toBe('ZZ9');
  });

  it('groups print selector batches and builds the setting-stone breakdown', () => {
    const batches = [
      {
        id: 'b1',
        order_id: 'ord-1',
        sku: 'PN1',
        quantity: 2,
        current_stage: ProductionStage.Labeling,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
        priority: 'Normal',
        requires_setting: true,
        customer_name: 'Ada',
      },
      {
        id: 'b2',
        order_id: 'ord-1',
        sku: 'PN2',
        variant_suffix: 'AK',
        quantity: 1,
        current_stage: ProductionStage.Labeling,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
        priority: 'Normal',
        requires_setting: true,
        customer_name: 'Ada',
      },
    ] as any;

    const grouped = groupMobilePrintSelectorBatches(batches, 'ada');
    expect(grouped).toHaveLength(1);
    expect(grouped[0][1].items).toHaveLength(2);

    const orderGroups = buildMobileSettingStoneOrderGroups(batches);
    const orderList = buildMobileSettingStoneOrderList(orderGroups, [
      { id: 'ord-1', customer_name: 'Ada', status: OrderStatus.Pending, items: [] } as any,
    ]);
    expect(orderList[0]).toEqual({
      key: 'ord-1',
      orderId: 'ord-1',
      customerName: 'Ada',
      batchCount: 2,
    });

    const breakdown = buildMobileSettingStoneBreakdown(orderGroups, 'ord-1', [
      {
        sku: 'PN1',
        gender: Gender.Women,
        recipe: [{ type: 'raw', id: 'stone-1', quantity: 1 }],
      },
      {
        sku: 'PN2',
        gender: Gender.Women,
        recipe: [],
        variants: [{ suffix: 'AK', description: 'Aqua', stock_qty: 0 }],
        variant_suffix: 'AK',
      },
    ] as any, [
      { id: 'stone-1', name: 'Zircon', description: 'White stone', unit: 'τεμ', type: MaterialType.Stone },
    ] as any);

    expect(breakdown).toEqual([
      expect.objectContaining({ name: 'Zircon', quantity: 2, unit: 'τεμ' }),
      expect.objectContaining({ name: 'Άκουα Ζιργκόν', quantity: 1, unit: 'τεμ' }),
    ]);
  });
});
