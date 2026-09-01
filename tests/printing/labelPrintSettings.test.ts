import { describe, expect, it } from 'vitest';
import { Gender, PlatingType, ProductionType, Product, ProductVariant } from '../../types';
import {
  buildRegistryBarcodePrintItems,
  readLabelPrintSettings,
  registryBarcodeItemKey,
} from '../../features/printing/labelPrintSettings';

class MemoryStorage {
  private items = new Map<string, string>();

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
}

const makeProduct = (overrides: Partial<Product> = {}): Product => ({
  sku: 'DA050',
  prefix: 'DA',
  category: 'Ring',
  description: '',
  gender: Gender.Women,
  image_url: null,
  weight_g: 1,
  plating_type: PlatingType.None,
  production_type: ProductionType.InHouse,
  active_price: 10,
  draft_price: 10,
  selling_price: 10,
  stock_qty: 0,
  sample_qty: 0,
  molds: [],
  is_component: false,
  recipe: [],
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
});

const makeVariant = (overrides: Partial<ProductVariant> = {}): ProductVariant => ({
  suffix: 'XKR',
  description: 'Gold - Κοράλλι',
  stock_qty: 0,
  selling_price: 20,
  ...overrides,
});

describe('label print settings persistence', () => {
  it('defaults to wholesale labels with price shown', () => {
    expect(readLabelPrintSettings(new MemoryStorage())).toEqual({
      format: 'standard',
      showPrice: true,
      priceTier: 'wholesale',
    });
  });

  it('hides price by default only when the saved format is retail and no price preference exists', () => {
    const storage = new MemoryStorage();
    storage.setItem('batch_print_format', 'retail');

    expect(readLabelPrintSettings(storage)).toEqual({
      format: 'retail',
      showPrice: false,
      priceTier: 'wholesale',
    });
  });

  it('keeps an explicit price preference even when the label format changes', () => {
    const storage = new MemoryStorage();
    storage.setItem('batch_print_format', 'retail');
    storage.setItem('batch_print_show_price', 'true');
    storage.setItem('batch_print_price_tier', 'retail');

    expect(readLabelPrintSettings(storage)).toEqual({
      format: 'retail',
      showPrice: true,
      priceTier: 'retail',
    });
  });
});

describe('registry barcode print payload', () => {
  it('prints every variant with the chosen price visibility and tier', () => {
    const product = makeProduct();
    const variants = [makeVariant(), makeVariant({ suffix: 'P', selling_price: 18 })];

    const items = buildRegistryBarcodePrintItems({
      product,
      variants,
      format: 'retail',
      showPrice: true,
      priceTier: 'retail',
      labelOverrides: {
        P: { brand: 'ILI' },
      },
    });

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      product,
      variant: variants[0],
      quantity: 1,
      format: 'retail',
      showPrice: true,
      priceTier: 'retail',
    });
    expect(items[1].labelOverrides).toEqual({ brand: 'ILI' });
  });

  it('prints a single selected variant or the master SKU when there are no variants', () => {
    const product = makeProduct();
    const variant = makeVariant();

    const one = buildRegistryBarcodePrintItems({
      product,
      variants: [variant],
      format: 'standard',
      showPrice: false,
      priceTier: 'wholesale',
      variantKey: registryBarcodeItemKey(variant),
    });

    expect(one).toEqual([{
      product,
      variant,
      quantity: 1,
      format: 'standard',
      showPrice: false,
      priceTier: 'wholesale',
    }]);

    const master = buildRegistryBarcodePrintItems({
      product,
      variants: [],
      format: 'standard',
      showPrice: true,
      priceTier: 'wholesale',
    });

    expect(master).toEqual([{
      product,
      quantity: 1,
      format: 'standard',
      showPrice: true,
      priceTier: 'wholesale',
    }]);
  });

  it('prints only the base variant when its suffix is empty', () => {
    const product = makeProduct();
    const base = makeVariant({ suffix: '', selling_price: 12 });
    const plated = makeVariant({ suffix: 'X' });

    const items = buildRegistryBarcodePrintItems({
      product,
      variants: [base, plated],
      format: 'standard',
      showPrice: true,
      priceTier: 'wholesale',
      variantKey: registryBarcodeItemKey(base),
    });

    expect(items).toHaveLength(1);
    expect(items[0].variant).toBe(base);
  });
});
