import { describe, expect, it } from 'vitest';
import { Gender, GlobalSettings, Material, Product, ProductionType } from '../../types';
import {
  buildBulkPricingPreview,
  countManualSellingPrices,
  detectLegacyManualPriceCandidates,
  filterPricingList,
  getCommitCandidates,
  isSellingPriceManual,
  pricesMatch,
  resolveSellingPriceManualOverride,
  summarizePricingPreview,
} from '../../utils/bulkPricingPreview';

const settings = {
  silver_price_gram: 1,
  loss_percentage: 0,
  barcode_width_mm: 0,
  barcode_height_mm: 0,
  retail_barcode_width_mm: 0,
  retail_barcode_height_mm: 0,
  last_calc_silver_price: 1,
} as GlobalSettings;

const materials: Material[] = [];

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    sku: 'PN1',
    prefix: 'PN',
    category: 'Βραχιόλι',
    gender: Gender.Women,
    image_url: null,
    weight_g: 2,
    plating_type: 'None' as any,
    production_type: ProductionType.InHouse,
    active_price: 10,
    draft_price: 10,
    selling_price: 40,
    stock_qty: 0,
    sample_qty: 0,
    is_component: false,
    variants: [
      {
        suffix: 'X',
        description: 'Gold',
        stock_qty: 0,
        selling_price: 50,
        selling_price_manual_override: true,
      },
      {
        suffix: 'P',
        description: 'Silver',
        stock_qty: 0,
        selling_price: 30,
        selling_price_manual_override: false,
      },
    ],
    recipe: [],
    molds: [],
    labor: {
      casting_cost: 0,
      setter_cost: 0,
      technician_cost: 0,
      stone_setting_cost: 0,
      plating_cost_x: 0,
      plating_cost_d: 0,
      subcontract_cost: 0,
    },
    ...overrides,
  } as Product;
}

describe('bulkPricingPreview', () => {
  it('detects manual selling prices on variants', () => {
    const product = makeProduct();
    expect(isSellingPriceManual(product, 'X', true)).toBe(true);
    expect(isSellingPriceManual(product, 'P', true)).toBe(false);
    expect(isSellingPriceManual(product, null, false)).toBe(false);
  });

  it('protects manual prices in selling formula mode', () => {
    const preview = buildBulkPricingPreview([makeProduct()], settings, materials, {
      mode: 'selling',
      markupMode: 'formula',
      markupPercent: 0,
    });

    const manual = preview.find((item) => item.variantSuffix === 'X');
    const automatic = preview.find((item) => item.variantSuffix === 'P');

    expect(manual?.status).toBe('manual_protected');
    expect(manual?.newPrice).toBe(50);
    expect(manual?.hasChange).toBe(false);
    expect(automatic?.status).not.toBe('manual_protected');
  });

  it('does not protect manual prices in cost mode', () => {
    const preview = buildBulkPricingPreview([makeProduct()], settings, materials, {
      mode: 'cost',
      markupMode: 'formula',
      markupPercent: 0,
    });

    expect(preview.every((item) => !item.isManualPrice)).toBe(true);
    expect(preview.every((item) => item.status !== 'manual_protected')).toBe(true);
  });

  it('excludes manual items from default commit candidates', () => {
    const preview = buildBulkPricingPreview([makeProduct()], settings, materials, {
      mode: 'selling',
      markupMode: 'formula',
      markupPercent: 0,
    });

    const defaultCommit = getCommitCandidates(preview, {
      mode: 'selling',
      markupMode: 'formula',
      forceApplyFormula: false,
      includeManualPrices: false,
    });

    expect(defaultCommit.some((item) => item.variantSuffix === 'X')).toBe(false);

    const includeManual = getCommitCandidates(preview, {
      mode: 'selling',
      markupMode: 'formula',
      forceApplyFormula: true,
      includeManualPrices: true,
    });

    expect(includeManual.some((item) => item.variantSuffix === 'X')).toBe(true);
  });

  it('filters and summarizes preview lists', () => {
    const preview = buildBulkPricingPreview([makeProduct()], settings, materials, {
      mode: 'selling',
      markupMode: 'formula',
      markupPercent: 0,
    });

    const manualOnly = filterPricingList(preview, 'manual', '');
    expect(manualOnly).toHaveLength(1);
    expect(manualOnly[0].variantSuffix).toBe('X');

    const summary = summarizePricingPreview(preview);
    expect(summary.manualProtected).toBe(1);
    expect(summary.total).toBe(2);
  });

  it('detects legacy manual candidates when price differs from formula', () => {
    const product = makeProduct({
      variants: [
        {
          suffix: 'P',
          description: 'Silver',
          stock_qty: 0,
          selling_price: 99,
          selling_price_manual_override: false,
        },
      ],
    });

    const candidates = detectLegacyManualPriceCandidates([product], settings, materials);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].variantSuffix).toBe('P');
    expect(candidates[0].currentPrice).toBe(99);
  });

  it('counts manual selling prices across inventory', () => {
    expect(countManualSellingPrices([makeProduct()])).toBe(1);
  });

  it('resolves manual override from price vs suggested', () => {
    expect(resolveSellingPriceManualOverride(50, 40, false)).toBe(true);
    expect(resolveSellingPriceManualOverride(40, 40, false)).toBe(false);
    expect(resolveSellingPriceManualOverride(50, 40, true)).toBe(false);
    expect(pricesMatch(40.005, 40)).toBe(true);
  });
});
