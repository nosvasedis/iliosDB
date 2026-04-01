import { describe, expect, it } from 'vitest';
import { buildAggregatedPrintData } from '../../features/printing';
import { GlobalSettings, Material, PlatingType, Product, ProductionBatch, ProductionStage, ProductionType } from '../../types';

const settings = {
  silver_price_gram: 1,
} as GlobalSettings;

const makeProduct = (sku: string, productionType: ProductionType): Product => ({
  sku,
  prefix: sku.slice(0, 2),
  category: 'Test',
  gender: 'Unisex' as Product['gender'],
  image_url: null,
  weight_g: 2,
  secondary_weight_g: 1,
  plating_type: PlatingType.None,
  production_type: productionType,
  active_price: 0,
  draft_price: 0,
  selling_price: 0,
  stock_qty: 0,
  sample_qty: 0,
  recipe: [],
  variants: [],
  molds: [],
  labor: {
    casting_cost: 1,
    setter_cost: 0,
    technician_cost: 1,
    stone_setting_cost: 0,
    plating_cost_x: 0,
    plating_cost_d: 0,
    subcontract_cost: 0,
    casting_cost_manual_override: false,
    technician_cost_manual_override: false,
    plating_cost_x_manual_override: false,
    plating_cost_d_manual_override: false,
  },
});

describe('buildAggregatedPrintData', () => {
  it('returns null when required dependencies are missing', () => {
    expect(buildAggregatedPrintData([], undefined, undefined, undefined)).toBeNull();
  });

  it('splits imported batches into the imported section when requested', () => {
    const products: Product[] = [
      makeProduct('IN1', ProductionType.InHouse),
      makeProduct('IM1', ProductionType.Imported),
    ];
    const batches: ProductionBatch[] = [
      {
        id: 'batch-1',
        sku: 'IN1',
        quantity: 2,
        current_stage: ProductionStage.Waxing,
        created_at: '2026-01-02T00:00:00.000Z',
        updated_at: '2026-01-02T00:00:00.000Z',
      } as ProductionBatch,
      {
        id: 'batch-2',
        sku: 'IM1',
        quantity: 1,
        current_stage: ProductionStage.Waxing,
        created_at: '2026-01-02T00:00:00.000Z',
        updated_at: '2026-01-02T00:00:00.000Z',
      } as ProductionBatch,
    ];

    const aggregated = buildAggregatedPrintData(batches, products, [] as Material[], settings, {
      splitImportedBatches: true,
      orderId: 'ORD-5',
      customerName: 'Client',
    });

    expect(aggregated).not.toBeNull();
    expect(aggregated?.batches).toHaveLength(1);
    expect(aggregated?.importedBatches).toHaveLength(1);
    expect(aggregated?.orderId).toBe('ORD-5');
    expect(aggregated?.customerName).toBe('Client');
  });
});
