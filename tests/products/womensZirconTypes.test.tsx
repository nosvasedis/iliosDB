import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import SkuColorizedText from '../../components/SkuColorizedText';
import { SELLER_STONE_TEXT_COLORS } from '../../components/seller/skuColors';
import { FINISH_CODES } from '../../constants';
import { getDefaultLabelStone } from '../../features/printing/labelText';
import { enrichProductionBatchesForBoard } from '../../features/production/boardViewModel';
import { buildSearchableProducts, getAvailableRegistryStones } from '../../features/products/productRegistryViewModels';
import { getStoneChipStyle } from '../../features/products/registryStoneChipStyles';
import { buildSmartAddSuffixPlan, getStoneCatalogForGender } from '../../features/products/variantSmartAdd';
import { getPurchaseOrderLinePresentation } from '../../features/suppliers/purchaseOrderPresentation';
import { Gender, PlatingType, ProductionStage, ProductionType, type Product, type ProductionBatch } from '../../types';
import { DELIVERY_SKU_STONE_TEXT } from '../../utils/deliveryLabels';
import { analyzeSuffix, getVariantComponents, splitSkuComponents } from '../../utils/pricingEngine';
import { getSkuStoneTextColor } from '../../utils/skuColoring';

const product: Product = {
  sku: 'DA100', prefix: 'DA', category: 'Δαχτυλίδι', gender: Gender.Women,
  image_url: null, weight_g: 1, plating_type: PlatingType.None,
  production_type: ProductionType.InHouse, active_price: 0, draft_price: 0,
  selling_price: 0, stock_qty: 0, sample_qty: 0, is_component: false, recipe: [],
  labor: {
    casting_cost: 0, setter_cost: 0, technician_cost: 0, stone_setting_cost: 0,
    plating_cost_x: 0, plating_cost_d: 0, subcontract_cost: 0,
  },
};

describe.each([
  { code: 'CI', name: 'Κίτρινα Ζιργκόν', color: 'text-yellow-600' },
  { code: 'MUL', name: 'Πολύχρωμα Ζιργκόν', color: 'text-fuchsia-600' },
])('women’s zircon $code', ({ code, name, color }) => {
  it('is offered for women and unisex products and excluded from the men’s catalog', () => {
    for (const gender of [Gender.Women, Gender.Unisex, undefined]) {
      expect(getStoneCatalogForGender(gender)).toContainEqual({ code, name });
    }
    expect(getStoneCatalogForGender(Gender.Men).some((stone) => stone.code === code)).toBe(false);
  });

  it.each(Object.keys(FINISH_CODES))('supports finish "%s" in smart add, SKU parsing, labels and coloring', (finish) => {
    const suffix = finish + code;
    expect(buildSmartAddSuffixPlan([finish], code, new Set())).toEqual([
      { suffix, skippedDuplicate: false },
    ]);
    for (const gender of [Gender.Women, Gender.Unisex, undefined]) {
      expect(getVariantComponents(suffix, gender)).toMatchObject({
        finish: { code: finish }, stone: { code, name }, prefixLength: 0,
      });
    }
    expect(analyzeSuffix(suffix, Gender.Women)).toContain(name);
    expect(splitSkuComponents(product.sku + suffix)).toEqual({ master: product.sku, suffix });
    expect(getDefaultLabelStone(product, { suffix, description: '', stock_qty: 0 })).toBe(name);

    const html = renderToStaticMarkup(<SkuColorizedText sku={product.sku + suffix} gender={Gender.Women} />);
    for (const character of code) {
      expect(html).toContain(`class="${color}">${character}</span>`);
    }
  });

  it('appears as a named registry filter and retains color in supplier, seller and delivery views', () => {
    const variants = [{ suffix: 'X' + code, description: '', stock_qty: 0 }];
    const searchable = buildSearchableProducts([{ ...product, variants }], new Set());
    expect(getAvailableRegistryStones(searchable, Gender.Women)).toContainEqual({ id: code, name, count: 1 });
    expect(getSkuStoneTextColor(code)).toBe(color);
    expect(SELLER_STONE_TEXT_COLORS[code]).toBe(color);
    expect(DELIVERY_SKU_STONE_TEXT[code]).toBe(color);
    expect(getPurchaseOrderLinePresentation({
      id: 'line-1', item_type: 'Product', item_id: product.sku,
      item_name: product.sku + 'X' + code, quantity: 1, unit_cost: 0, total_cost: 0,
    }, product)).toMatchObject({ stoneCode: code, stoneColor: color, description: expect.stringContaining(name) });
    expect(getStoneChipStyle(code).text).toBe(code === 'CI' ? 'text-yellow-800' : 'text-fuchsia-800');
    if (code === 'MUL') expect(getStoneChipStyle(code).dot).toContain('bg-gradient-to-r');
  });

  it.each(Object.keys(FINISH_CODES))('requires stone setting for finish "%s" even without recipe materials', (finish) => {
    const batch: ProductionBatch = {
      id: 'batch-1', sku: product.sku, variant_suffix: finish + code, quantity: 1,
      current_stage: ProductionStage.Waxing, priority: 'Normal', requires_setting: false,
      created_at: '2026-10-22T00:00:00Z', updated_at: '2026-10-22T00:00:00Z',
    };
    const [enriched] = enrichProductionBatchesForBoard(
      [batch], new Map([[product.sku, product]]), new Map(), new Map(),
    );
    expect(enriched.requires_setting).toBe(true);
    const [plain] = enrichProductionBatchesForBoard(
      [{ ...batch, variant_suffix: finish }], new Map([[product.sku, product]]), new Map(), new Map(),
    );
    expect(plain.requires_setting).toBe(false);
  });
});
