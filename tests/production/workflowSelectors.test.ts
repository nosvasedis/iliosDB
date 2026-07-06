import { describe, expect, it } from 'vitest';
import { Gender, ProductionStage, ProductionType } from '../../types';
import {
  buildAssemblyOrderCandidates,
  buildProductionFinderIndex,
  filterAndSortProductionFinderBatches,
  filterAndSortProductionFinderIndexedBatches,
  filterProductionStagePopupBatches,
  buildLabelPrintQueue,
  getNextProductionStage,
  groupProductionBatchesByStage,
  groupProductionBatchesForDisplay,
  sortProductionDisplayLevel1Keys,
} from '../../features/production/workflowSelectors';
import { requiresAssemblyStage } from '../../constants';

describe('production workflow selectors', () => {
  it('includes the expanded SK and BR assembly SKU ranges', () => {
    expect(requiresAssemblyStage('SK201')).toBe(true);
    expect(requiresAssemblyStage('SK235')).toBe(true);
    expect(requiresAssemblyStage('SK236')).toBe(false);
    expect(requiresAssemblyStage('BR300')).toBe(true);
    expect(requiresAssemblyStage('BR350')).toBe(true);
    expect(requiresAssemblyStage('BR351')).toBe(false);
  });

  it('resolves next stages including skipped and imported flows', () => {
    expect(getNextProductionStage(ProductionStage.AwaitingDelivery, {
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

    expect(getNextProductionStage(ProductionStage.Casting, {
      id: 'b2',
      sku: 'PN2',
      quantity: 1,
      current_stage: ProductionStage.Casting,
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
      priority: 'Normal',
      requires_setting: false,
      requires_assembly: false,
    })).toBe(ProductionStage.Polishing);
  });

  it('groups batches by stage and display hierarchy', () => {
    const batches = [
      {
        id: 'b1',
        sku: 'PN2',
        quantity: 1,
        current_stage: ProductionStage.Waxing,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
        priority: 'Normal',
        requires_setting: true,
        product_details: { gender: Gender.Women, collections: [1] } as any,
      },
      {
        id: 'b2',
        sku: 'PN1',
        quantity: 2,
        current_stage: ProductionStage.Waxing,
        created_at: '2024-01-02T00:00:00.000Z',
        updated_at: '2024-01-02T00:00:00.000Z',
        priority: 'Normal',
        requires_setting: true,
        product_details: { gender: Gender.Women, collections: [1] } as any,
      },
    ] as any;

    const byStage = groupProductionBatchesByStage(batches);
    const byDisplay = groupProductionBatchesForDisplay(
      batches,
      new Map([[1, { name: 'Spring' }]]),
      'gender',
      'alpha',
    );

    expect(byStage.Waxing).toHaveLength(2);
    expect(byDisplay[Gender.Women].Spring.map((batch) => batch.sku)).toEqual(['PN1', 'PN2']);
  });

  it('orders collection sub-groups by chronology when sort is newest', () => {
    const batches = [
      {
        id: 'oldColl',
        sku: 'AA1',
        quantity: 1,
        current_stage: ProductionStage.Waxing,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
        stageEnteredAt: '2024-01-01T08:00:00.000Z',
        priority: 'Normal',
        requires_setting: true,
        product_details: { gender: Gender.Women, collections: [1] } as any,
      },
      {
        id: 'newColl',
        sku: 'ZZ9',
        quantity: 1,
        current_stage: ProductionStage.Waxing,
        created_at: '2024-01-02T00:00:00.000Z',
        updated_at: '2024-01-02T00:00:00.000Z',
        stageEnteredAt: '2024-06-01T08:00:00.000Z',
        priority: 'Normal',
        requires_setting: true,
        product_details: { gender: Gender.Women, collections: [2] } as any,
      },
    ] as any;

    const byDisplay = groupProductionBatchesForDisplay(
      batches,
      new Map([
        [1, { name: 'AlphaColl' }],
        [2, { name: 'ZetaColl' }],
      ]),
      'gender',
      'newest',
    );

    const collOrder = Object.keys(byDisplay[Gender.Women]);
    // Alphabetical would be AlphaColl, ZetaColl; newest puts ZetaColl (June) first.
    expect(collOrder).toEqual(['ZetaColl', 'AlphaColl']);
    expect(byDisplay[Gender.Women].ZetaColl.map((b) => b.sku)).toEqual(['ZZ9']);
  });

  it('sorts customer keys per stage column from visible batch chronology', () => {
    const grouped = {
      Βήτα: { Γενικά: [{ stageEnteredAt: '2024-01-01T00:00:00.000Z', created_at: '2024-01-01T00:00:00.000Z' } as any] },
      Άλφα: { Γενικά: [{ stageEnteredAt: '2024-06-01T00:00:00.000Z', created_at: '2024-06-01T00:00:00.000Z' } as any] },
    };

    expect(sortProductionDisplayLevel1Keys(['Βήτα', 'Άλφα'], grouped, 'customer', 'alpha')).toEqual(['Άλφα', 'Βήτα']);
    expect(sortProductionDisplayLevel1Keys(['Βήτα', 'Άλφα'], grouped, 'customer', 'newest')).toEqual(['Άλφα', 'Βήτα']);
    expect(sortProductionDisplayLevel1Keys(['Βήτα', 'Άλφα'], grouped, 'customer', 'oldest')).toEqual(['Βήτα', 'Άλφα']);
  });

  it('builds label print queues in customer order', () => {
    const products = new Map([
      ['PN1', { sku: 'PN1', variants: [{ suffix: '', description: 'Lustre', stock_qty: 0 }] }],
    ] as any);

    const queue = buildLabelPrintQueue([
      {
        id: 'b1',
        sku: 'PN1',
        quantity: 2,
        current_stage: ProductionStage.Ready,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
        priority: 'Normal',
        requires_setting: false,
        customer_name: 'Zeta',
      },
      {
        id: 'b2',
        sku: 'PN1',
        quantity: 1,
        current_stage: ProductionStage.Ready,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
        priority: 'Normal',
        requires_setting: false,
        customer_name: 'Alpha',
      },
    ] as any, 'customer', products);

    expect(queue.map((item) => item.quantity)).toEqual([1, 2]);
  });

  it('finds production batches by English customer first name', () => {
    const batches = [
      {
        id: 'b-rahim',
        sku: 'PN1',
        variant_suffix: '',
        order_id: 'ord-rahim',
        customer_name: 'Rahimzianov',
        quantity: 1,
        current_stage: ProductionStage.Waxing,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
        priority: 'Normal',
        requires_setting: false,
      },
      {
        id: 'b-other',
        sku: 'DA2',
        variant_suffix: '',
        order_id: 'ord-other',
        customer_name: 'Other Client',
        quantity: 1,
        current_stage: ProductionStage.Waxing,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
        priority: 'Normal',
        requires_setting: false,
      },
    ] as any;

    expect(filterAndSortProductionFinderBatches(batches, 'Rah').map((batch) => batch.id)).toEqual(['b-rahim']);
    expect(filterAndSortProductionFinderIndexedBatches(buildProductionFinderIndex(batches), 'Rah').map((batch) => batch.id)).toEqual(['b-rahim']);
  });

  it('keeps two-letter production finder terms strict for SKU prefixes', () => {
    const batches = [
      {
        id: 'b-sku',
        sku: 'PN1',
        variant_suffix: '',
        order_id: 'ord-sku',
        customer_name: 'Sku Client',
        quantity: 1,
        current_stage: ProductionStage.Waxing,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
        priority: 'Normal',
        requires_setting: false,
      },
      {
        id: 'b-customer',
        sku: 'DA2',
        variant_suffix: '',
        order_id: 'ord-customer',
        customer_name: 'Pnina Customer',
        quantity: 1,
        current_stage: ProductionStage.Waxing,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
        priority: 'Normal',
        requires_setting: false,
      },
    ] as any;

    expect(filterAndSortProductionFinderBatches(batches, 'PN').map((batch) => batch.id)).toEqual(['b-sku']);
    expect(filterAndSortProductionFinderIndexedBatches(buildProductionFinderIndex(batches), 'PN').map((batch) => batch.id)).toEqual(['b-sku']);
  });

  it('filters stage popup batches across SKU, order, customer, notes, and product metadata', () => {
    const batches = [
      {
        id: 'b-sku',
        sku: 'PN100',
        variant_suffix: '-R',
        order_id: 'ORD-123',
        customer_name: 'Niki Client',
        quantity: 1,
        current_stage: ProductionStage.AwaitingDelivery,
        notes: 'engrave initials',
        size_info: '54',
        cord_color: 'black',
        enamel_color: 'red',
        on_hold_reason: 'waiting approval',
        product_details: { category: 'Rings', description: 'Minimal ring' },
      },
      {
        id: 'b-greek',
        sku: 'DA200',
        variant_suffix: '',
        order_id: 'ORD-456',
        customer_name: 'Νίκη Παπα',
        quantity: 1,
        current_stage: ProductionStage.AwaitingDelivery,
        notes: 'urgent gift',
        product_details: { category: 'Bracelets', description: 'Pearl piece' },
      },
      {
        id: 'b-other',
        sku: 'BR300',
        variant_suffix: '',
        order_id: 'ORD-789',
        customer_name: 'Other Client',
        quantity: 1,
        current_stage: ProductionStage.AwaitingDelivery,
        notes: '',
        product_details: { category: 'Chains', description: 'Plain chain' },
      },
    ] as any;

    expect(filterProductionStagePopupBatches(batches, 'PN100-R').map((batch) => batch.id)).toEqual(['b-sku']);
    expect(filterProductionStagePopupBatches(batches, 'approval').map((batch) => batch.id)).toEqual(['b-sku']);
    expect(filterProductionStagePopupBatches(batches, 'niki').map((batch) => batch.id)).toEqual(['b-sku', 'b-greek']);
    expect(filterProductionStagePopupBatches(batches, 'pearl').map((batch) => batch.id)).toEqual(['b-greek']);
    expect(filterProductionStagePopupBatches(batches, '').map((batch) => batch.id)).toEqual(['b-sku', 'b-greek', 'b-other']);
  });

  it('skips assembly candidate orders while their items are missing', () => {
    const candidates = buildAssemblyOrderCandidates(
      [{ id: 'ord-partial', customer_name: 'Ada', items: undefined } as any],
      [{
        id: 'b1',
        order_id: 'ord-partial',
        sku: 'PN1',
        quantity: 1,
        current_stage: ProductionStage.Polishing,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
        priority: 'Normal',
        requires_setting: false,
      }] as any,
    );

    expect(candidates).toEqual([]);
  });
});
