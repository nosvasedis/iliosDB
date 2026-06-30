import { describe, expect, it } from 'vitest';
import { Gender, PlatingType, Product, ProductVariant, ProductionType } from '../../types';
import {
  buildOrderRangeAddEntries,
  parseOrderRangeInput,
  resolveOrderRangeInput,
} from '../../features/orders/orderRangeEntry';

const makeProduct = (overrides: Partial<Product>): Product =>
  ({
    sku: 'DM001',
    prefix: 'DM',
    category: 'Ring',
    gender: Gender.Women,
    image_url: null,
    weight_g: 1,
    plating_type: PlatingType.None,
    production_type: ProductionType.InHouse,
    active_price: 0,
    draft_price: 0,
    selling_price: 12,
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
    variants: [],
    ...overrides,
  }) as Product;

const variant = (suffix: string): ProductVariant => ({
  suffix,
  description: suffix || 'Lustre',
  stock_qty: 0,
  selling_price: suffix ? 18 : 12,
});

describe('order range entry', () => {
  it('parses padded ranges and preserves a matching suffix', () => {
    expect(parseOrderRangeInput('DM001H-DM035H')).toEqual({
      prefix: 'DM',
      start: 1,
      end: 35,
      width: 3,
      suffix: 'H',
    });
  });

  it('rejects malformed ranges before resolving products', () => {
    expect(parseOrderRangeInput('DM010-DM001')).toBeNull();
    expect(parseOrderRangeInput('DM001-RN002')).toBeNull();
    expect(parseOrderRangeInput('DM001H-DM002X')).toBeNull();
  });

  it('resolves valid rows while reporting missing products', () => {
    const products = [
      makeProduct({ sku: 'DM001', variants: [variant('H')] }),
      makeProduct({ sku: 'DM003', variants: [variant('H')] }),
    ];

    const result = resolveOrderRangeInput('DM001H-DM003H', products);

    expect(result?.rows.map((row) => [row.displaySku, row.status])).toEqual([
      ['DM001H', 'ready'],
      ['DM002H', 'missing_product'],
      ['DM003H', 'ready'],
    ]);
    expect(result?.readyRows).toHaveLength(2);
  });

  it('marks bare master rows with multiple variants as ambiguous', () => {
    const products = [
      makeProduct({ sku: 'DM001', variants: [variant('H'), variant('X')] }),
    ];

    const result = resolveOrderRangeInput('DM001-DM001', products);

    expect(result?.rows[0].status).toBe('ambiguous_variant');
    expect(result?.readyRows).toHaveLength(0);
  });

  it('allows bare master rows when the catalog resolves to a single empty variant', () => {
    const products = [
      makeProduct({ sku: 'DM001', variants: [variant('')] }),
    ];

    const result = resolveOrderRangeInput('DM001-DM001', products);

    expect(result?.rows[0].status).toBe('ready');
    expect(result?.rows[0].variant?.suffix).toBe('');
  });

  it('rejects component products and missing suffixes', () => {
    const products = [
      makeProduct({ sku: 'DM001', is_component: true, variants: [variant('H')] }),
      makeProduct({ sku: 'DM002', variants: [variant('X')] }),
    ];

    const result = resolveOrderRangeInput('DM001H-DM002H', products);

    expect(result?.rows.map((row) => row.status)).toEqual(['missing_product', 'missing_variant']);
    expect(result?.readyRows).toHaveLength(0);
  });

  it('exposes sizing and builds add entries with optional per-row sizes', () => {
    const products = [
      makeProduct({ sku: 'DM001', prefix: 'DM', category: 'Ring', variants: [variant('H')] }),
      makeProduct({ sku: 'DM002', prefix: 'DM', category: 'Ring', variants: [variant('H')] }),
    ];

    const result = resolveOrderRangeInput('DM001H-DM002H', products)!;
    expect(result.hasSizableRows).toBe(true);
    expect(result.rows[0].sizing?.sizes).toContain('52');

    const entries = buildOrderRangeAddEntries(result.rows, { DM001: '52', DM002: '' });

    expect(entries.map((entry) => [entry.product.sku, entry.variant?.suffix, entry.size])).toEqual([
      ['DM001', 'H', '52'],
      ['DM002', 'H', ''],
    ]);
  });
});
