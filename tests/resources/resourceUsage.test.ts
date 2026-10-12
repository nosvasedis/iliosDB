import { describe, expect, it } from 'vitest';
import type { Product, ProductVariant, RecipeItem } from '../../types';
import { compareSkuValues } from '../../utils/skuSort';
import {
  buildResourceUsageRows, createResourceUsageIndex, filterResourceUsage,
  getResourceUsageIndex, placeResourceUsagePopover,
} from '../../features/resources/resourceUsage';

const product = (sku: string, recipe: RecipeItem[] = [], extra: Partial<Product> = {}): Product =>
  ({ sku, recipe, molds: [], variants: [], image_url: null, ...extra } as Product);
const raw = (id: string, quantity = 1): RecipeItem => ({ type: 'raw', id, quantity });
const component = (sku: string, quantity = 1): RecipeItem => ({ type: 'component', sku, quantity });
const material = { kind: 'material' as const, id: 'stone' };
const mold = { kind: 'mold' as const, id: 'LSTX1' };

describe('resource usage graph', () => {
  it('finds exact direct links, deduplicates and sorts SKU numbers naturally', () => {
    const products = [product('DA10', [raw('stone'), raw('stone')]), product('DA2', [raw('stone')]), product('DA1', [raw('other')])];
    expect(createResourceUsageIndex(products).getUsage(material).map(entry => entry.product.sku)).toEqual(['DA2', 'DA10']);
  });

  it('retains the catalog sorting policy for mixed and prefixed SKU codes', () => {
    const skus = ['STX10', 'STX2', 'SK263S', 'SK263', 'da10', 'DA2', 'ΔΑ3', 'DA1XLA'];
    const entries = createResourceUsageIndex(skus.map(sku => product(sku, [raw('stone')]))).getUsage(material);
    expect(entries.map(entry => entry.product.sku)).toEqual([...skus].sort(compareSkuValues));
  });

  it('finds materials and molds through multiple component levels, including STX itself', () => {
    const products = [
      product('STX1', [raw('stone')], { molds: [{ code: 'LSTX1', quantity: 2 }], is_component: true }),
      product('STX2', [component('STX1')]), product('DA2', [component('STX2')]),
    ];
    const index = createResourceUsageIndex(products);
    for (const resource of [material, mold]) {
      expect(index.getUsage(resource).map(({ product, direct, viaSku }) => [product.sku, direct, viaSku])).toEqual([
        ['STX1', true, undefined], ['DA2', false, 'STX2'], ['STX2', false, 'STX1'],
      ]);
    }
  });

  it('keeps direct precedence through cycles, self references and multiple paths', () => {
    const products = [
      product('STX1', [raw('stone'), component('STX2'), component('STX1')]),
      product('STX2', [component('STX1')]),
      product('DA1', [raw('stone'), component('STX1'), component('STX2')]),
    ];
    const entries = createResourceUsageIndex(products).getUsage(material);
    expect(entries.map(entry => [entry.product.sku, entry.direct])).toEqual([
      ['DA1', true], ['STX1', true], ['STX2', false],
    ]);
  });

  it('ignores missing components and zero, negative or invalid quantities', () => {
    const products = [
      product('STX1', [raw('stone')]),
      product('DA1', [component('missing'), component('STX1', 0), raw('stone', -1)]),
      product('DA2', [component('STX1', -1), raw('stone', NaN)], { molds: [{ code: 'LSTX1', quantity: 0 }] }),
    ];
    const index = createResourceUsageIndex(products);
    expect(index.getUsage(material).map(entry => entry.product.sku)).toEqual(['STX1']);
    expect(index.getUsage(mold)).toEqual([]);
  });

  it('does not confuse a material id with an identically named mold code', () => {
    const index = createResourceUsageIndex([product('DA1', [raw('L1')]), product('DA2', [], { molds: [{ code: 'L1', quantity: 1 }] })]);
    expect(index.getUsage({ kind: 'material', id: 'L1' })[0].product.sku).toBe('DA1');
    expect(index.getUsage({ kind: 'mold', id: 'L1' })[0].product.sku).toBe('DA2');
  });

  it('reuses per-snapshot results and updates recipes, images and variants with a new snapshot', () => {
    const before = [product('DA1', [raw('stone')])];
    const after = [product('DA1'), product('DA2', [raw('stone')], { image_url: 'new.webp', variants: [{ suffix: 'XLA' } as ProductVariant] })];
    const index = getResourceUsageIndex(before);
    expect(getResourceUsageIndex(before)).toBe(index);
    expect(index.getUsage(material)).toBe(index.getUsage(material));
    const entry = getResourceUsageIndex(after).getUsage(material)[0];
    expect(entry.product.sku).toBe('DA2');
    expect(entry.product.image_url).toBe('new.webp');
    expect(entry.product.variants?.[0].suffix).toBe('XLA');
    expect(index.getUsage(material)[0].product.sku).toBe('DA1');
  });

  it('handles a 10,000-level recipe without recursion or duplicate results', () => {
    const products = Array.from({ length: 10000 }, (_, index) =>
      product(`STX${index}`, index ? [component(`STX${index - 1}`)] : [raw('stone')]));
    const start = performance.now();
    const index = createResourceUsageIndex(products);
    const entries = index.getUsage(material);
    const elapsed = performance.now() - start;
    expect(entries).toHaveLength(10000);
    expect(new Set(entries.map(entry => entry.product.sku)).size).toBe(10000);
    expect(index.getUsage(material)).toBe(entries);
    console.info(`Resource usage: 10,000-level graph indexed and resolved in ${elapsed.toFixed(1)} ms`);
  });
});

describe('grouped usage search and variants', () => {
  const variants = ['XLA', 'DLE', 'XLA'].map(suffix => ({ suffix } as ProductVariant));
  const entries = createResourceUsageIndex([
    product('SK263S', [raw('stone')], { variants }), product('DA2', [raw('stone')]),
  ]).getUsage(material);

  it('searches complete variant SKUs case-insensitively while retaining the master group', () => {
    expect(filterResourceUsage(entries, ' sk263sxla ').map(entry => entry.product.sku)).toEqual(['SK263S']);
    expect(filterResourceUsage(entries, 'DA2')).toHaveLength(1);
    expect(filterResourceUsage(entries, 'missing')).toEqual([]);
    expect(filterResourceUsage(entries, '')).toBe(entries);
  });

  it('only creates variant rows for the expanded master and preserves explicit suffixes', () => {
    expect(buildResourceUsageRows(entries, null)).toHaveLength(2);
    const rows = buildResourceUsageRows(entries, 'SK263S');
    expect(rows).toHaveLength(4);
    expect(rows.filter(row => row.kind === 'variant').map(row => row.kind === 'variant' && [row.entry.product.sku, row.variant.suffix])).toEqual([
      ['SK263S', 'DLE'], ['SK263S', 'XLA'],
    ]);
    expect(new Set(rows.map(row => row.key)).size).toBe(rows.length);
  });

  it('shows the matching full SKU when a searched group is expanded', () => {
    const matches = filterResourceUsage(entries, 'sk263sxla');
    const rows = buildResourceUsageRows(matches, 'SK263S', 'sk263sxla');
    expect(rows.map(row => row.key)).toEqual(['product:SK263S', 'variant:SK263S:XLA']);
  });

  it('keeps thousands of variants collapsed until their group is opened', () => {
    const large = createResourceUsageIndex([product('DA1', [raw('stone')], {
      variants: Array.from({ length: 5000 }, (_, index) => ({ suffix: `X${index}` } as ProductVariant)),
    })]).getUsage(material);
    expect(buildResourceUsageRows(large, null)).toHaveLength(1);
    expect(buildResourceUsageRows(large, 'DA1')).toHaveLength(5001);
  });
});

describe('popover viewport placement', () => {
  it('opens below an anchor when there is room', () => {
    expect(placeResourceUsagePopover({ left: 50, right: 250, top: 50, bottom: 90 }, { width: 1200, height: 900 })).toEqual({
      left: 50, top: 96, width: 360, height: 380,
    });
  });

  it('opens above a bottom/right anchor without exceeding the viewport', () => {
    expect(placeResourceUsagePopover({ left: 1000, right: 1200, top: 800, bottom: 840 }, { width: 1200, height: 900 })).toEqual({
      left: 832, top: 414, width: 360, height: 380,
    });
  });

  it('fits narrow screens and a keyboard-reduced visual viewport', () => {
    const viewport = { width: 320, height: 260, top: 100, left: 20 };
    const placement = placeResourceUsagePopover({ left: 0, right: 320, top: 400, bottom: 440 }, viewport);
    expect(placement).toEqual({ left: 28, top: 108, width: 304, height: 244 });
  });
});
