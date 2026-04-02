import { describe, expect, it } from 'vitest';
import { Collection, Gender, PlatingType, Product, ProductVariant, ProductionType } from '../../types';
import {
  buildOrderContextAffinitySkuSet,
  buildProductSearchIndex,
  computeSmartSkuSuggestions,
  expandCollectionDigitCoresForAnchor,
  expandOrionDigitCoresForAnchor,
  getActiveMasterSetMates,
  getCollectionCoreSiblings,
  getCollectionWideFinishHint,
  getFamilyClusterSiblings,
  getScopedVariantHintStringsForProduct,
  isOrionCollectionName,
  parseMasterSkuParts,
  shouldExcludeDaMnSkCrosswalkSibling,
  suggestionDesirabilityScore,
  variantSuffixMatchesOrderHints,
  type SuggestionRankContext,
} from '../../features/orders/smartSkuSuggestions';

const makeProduct = (overrides: Partial<Product>): Product =>
  ({
    sku: 'PN1',
    prefix: 'PN',
    category: 'Μενταγιόν',
    gender: Gender.Men,
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

describe('smartSkuSuggestions', () => {
  const orionCollections: Collection[] = [{ id: 42, name: 'Ωρίων' }];

  it('detects Ωρίων / Orion collection names', () => {
    expect(isOrionCollectionName('Ωρίων')).toBe(true);
    expect(isOrionCollectionName('orion gold')).toBe(true);
    expect(isOrionCollectionName('Άλλη σειρά')).toBe(false);
  });

  it('Orion: RN301 links PN301, PN601, XR601 via shared collection cores', () => {
    const products = [
      makeProduct({ sku: 'RN301', gender: Gender.Men, collections: [42] }),
      makeProduct({ sku: 'PN301', gender: Gender.Men, collections: [42] }),
      makeProduct({ sku: 'PN601', gender: Gender.Men, collections: [42] }),
      makeProduct({ sku: 'XR601', gender: Gender.Men, collections: [42] }),
      makeProduct({ sku: 'PN999', gender: Gender.Men, collections: [42] }),
    ];
    const index = buildProductSearchIndex(products, orionCollections);
    expect(index.orionCollectionIds.has(42)).toBe(true);
    expect(expandOrionDigitCoresForAnchor(parseMasterSkuParts('RN301')!)).toEqual(['301', '601']);
    const rn = index.skuMap.get('RN301')!;
    const sibs = getCollectionCoreSiblings(index, rn)
      .map((p) => p.sku)
      .sort();
    expect(sibs).toEqual(['PN301', 'PN601', 'XR601']);
  });

  /** Greek Rho+Nu — same visual as “RN” on many labels; must get Orion bands, not only Latin RN. */
  const GREEK_RN = '\u03A1\u039D';

  it('Orion: Greek ΡΝ410 expands cores like RN410 (401–425 band)', () => {
    const parts = parseMasterSkuParts(`${GREEK_RN}410`);
    expect(parts?.letters).toBe(GREEK_RN);
    expect(expandOrionDigitCoresForAnchor(parts!)).toEqual(['410', '710']);
  });

  it('Orion: ΡΝ410 links Latin PN410, PN710, XR710 (Greek RN prefix on master)', () => {
    const products = [
      makeProduct({ sku: `${GREEK_RN}410`, gender: Gender.Men, collections: [42] }),
      makeProduct({ sku: 'PN410', gender: Gender.Men, collections: [42] }),
      makeProduct({ sku: 'PN710', gender: Gender.Men, collections: [42] }),
      makeProduct({ sku: 'XR710', gender: Gender.Men, collections: [42] }),
    ];
    const index = buildProductSearchIndex(products, orionCollections);
    const anchor = index.skuMap.get(`${GREEK_RN}410`)!;
    expect(
      getCollectionCoreSiblings(index, anchor)
        .map((p) => p.sku)
        .sort(),
    ).toEqual(['PN410', 'PN710', 'XR710']);
  });

  it('Orion: RN410↔710 pairing works even when no collection is named Ωρίων on the index', () => {
    const products = [
      makeProduct({ sku: 'RN410', gender: Gender.Men, collections: [7] }),
      makeProduct({ sku: 'PN710', gender: Gender.Men, collections: [7] }),
    ];
    const index = buildProductSearchIndex(products);
    expect(index.orionCollectionIds.size).toBe(0);
    expect(getCollectionCoreSiblings(index, index.skuMap.get('RN410')!).map((p) => p.sku).sort()).toEqual(['PN710']);
  });

  it('Orion: RN410 links PN410, PN710, XR710 (401–425 band)', () => {
    const products = [
      makeProduct({ sku: 'RN410', gender: Gender.Men, collections: [42] }),
      makeProduct({ sku: 'PN410', gender: Gender.Men, collections: [42] }),
      makeProduct({ sku: 'PN710', gender: Gender.Men, collections: [42] }),
      makeProduct({ sku: 'XR710', gender: Gender.Men, collections: [42] }),
    ];
    const index = buildProductSearchIndex(products, orionCollections);
    expect(expandOrionDigitCoresForAnchor(parseMasterSkuParts('RN410')!)).toEqual(['410', '710']);
    const sibs = getCollectionCoreSiblings(index, index.skuMap.get('RN410')!)
      .map((p) => p.sku)
      .sort();
    expect(sibs).toEqual(['PN410', 'PN710', 'XR710']);
  });

  it('Orion: RN615 links PN615, PN915, XR915 (601–625 band)', () => {
    expect(expandOrionDigitCoresForAnchor(parseMasterSkuParts('RN615')!)).toEqual(['615', '915']);
    const products = [
      makeProduct({ sku: 'RN615', gender: Gender.Men, collections: [42] }),
      makeProduct({ sku: 'PN615', gender: Gender.Men, collections: [42] }),
      makeProduct({ sku: 'PN915', gender: Gender.Men, collections: [42] }),
      makeProduct({ sku: 'XR915', gender: Gender.Men, collections: [42] }),
    ];
    const index = buildProductSearchIndex(products, orionCollections);
    const sibs = getCollectionCoreSiblings(index, index.skuMap.get('RN615')!)
      .map((p) => p.sku)
      .sort();
    expect(sibs).toEqual(['PN615', 'PN915', 'XR915']);
  });

  it('Orion: PN625 links RN325, PN325, XR625', () => {
    const products = [
      makeProduct({ sku: 'RN325', gender: Gender.Men, collections: [42] }),
      makeProduct({ sku: 'PN325', gender: Gender.Men, collections: [42] }),
      makeProduct({ sku: 'PN625', gender: Gender.Men, collections: [42] }),
      makeProduct({ sku: 'XR625', gender: Gender.Men, collections: [42] }),
    ];
    const index = buildProductSearchIndex(products, orionCollections);
    const pn625 = index.skuMap.get('PN625')!;
    expect(getCollectionCoreSiblings(index, pn625).map((p) => p.sku).sort()).toEqual(['PN325', 'RN325', 'XR625']);
  });

  it('parses master SKU letter and digit core', () => {
    expect(parseMasterSkuParts('DA023')).toEqual({ letters: 'DA', digits: '023', num: 23 });
    expect(parseMasterSkuParts('SK025')).toEqual({ letters: 'SK', digits: '025', num: 25 });
  });

  it('variantSuffixMatchesOrderHints: DA…DAI context highlights SK…DAI, not bare D', () => {
    expect(variantSuffixMatchesOrderHints('DAI', ['DAI'])).toBe(true);
    expect(variantSuffixMatchesOrderHints('D', ['DAI'])).toBe(false);
    expect(variantSuffixMatchesOrderHints('DAI', ['DA'])).toBe(true);
    expect(variantSuffixMatchesOrderHints('AI', ['DAI'])).toBe(true);
    expect(variantSuffixMatchesOrderHints('DAI', [])).toBe(false);
  });

  it('maps DA001–009 to MN901–909 / SK901–909 cores in the same collection', () => {
    const products = [
      makeProduct({ sku: 'DA003', gender: Gender.Women, collections: [1] }),
      makeProduct({ sku: 'MN003', gender: Gender.Women, collections: [1] }),
      makeProduct({ sku: 'SK003', gender: Gender.Women, collections: [1] }),
      makeProduct({ sku: 'MN903', gender: Gender.Women, collections: [1] }),
      makeProduct({ sku: 'SK903', gender: Gender.Women, collections: [1] }),
      makeProduct({ sku: 'ST003', gender: Gender.Women, collections: [1] }),
    ];
    const index = buildProductSearchIndex(products);
    const da = index.skuMap.get('DA003')!;
    expect(expandCollectionDigitCoresForAnchor(parseMasterSkuParts('DA003')!)).toEqual(
      expect.arrayContaining(['003', '903']),
    );
    const sibs = getCollectionCoreSiblings(index, da).map((p) => p.sku).sort();
    expect(sibs).toContain('MN903');
    expect(sibs).toContain('SK903');
    expect(sibs).toContain('ST003');
    expect(sibs).not.toContain('MN003');
    expect(sibs).not.toContain('SK003');
  });

  it('excludes low MN/SK when anchor is MN903 (prefers DA/ST on 003 core)', () => {
    const a = parseMasterSkuParts('MN903')!;
    const b = parseMasterSkuParts('SK003')!;
    expect(shouldExcludeDaMnSkCrosswalkSibling(a, b)).toBe(true);
  });

  it('ranks collection-set MN901 above unrelated MN112 when DA001/SK901 are on the order', () => {
    const vx: ProductVariant = { suffix: 'XRZ', description: '', stock_qty: 0 };
    const products = [
      makeProduct({ sku: 'DA001', gender: Gender.Women, collections: [1], variants: [vx] }),
      makeProduct({ sku: 'SK901', gender: Gender.Women, collections: [1], variants: [vx] }),
      makeProduct({ sku: 'MN901', gender: Gender.Women, collections: [1], variants: [vx] }),
      makeProduct({ sku: 'MN112', gender: Gender.Women, collections: [99], variants: [vx] }),
    ];
    const index = buildProductSearchIndex(products);
    const aff = buildOrderContextAffinitySkuSet(index, ['DA001', 'SK901']);
    expect(aff.has('MN901')).toBe(true);
    expect(aff.has('MN112')).toBe(false);
    const result = computeSmartSkuSuggestions({
      index,
      skuPart: 'MN',
      orderContextMasterSkus: ['DA001', 'SK901'],
      orderContextVariantSuffixes: ['XRZ'],
    });
    expect(result?.topChips[0]?.sku).toBe('MN901');
  });

  it('scoped cart hints: DA035PCO boosts MN035 variant score over MN034 (same collection)', () => {
    const vco: ProductVariant = { suffix: 'PCO', description: '', stock_qty: 0 };
    const products = [
      makeProduct({ sku: 'DA035', gender: Gender.Women, collections: [10], variants: [vco] }),
      makeProduct({ sku: 'MN035', gender: Gender.Women, collections: [10], variants: [vco] }),
      makeProduct({ sku: 'MN034', gender: Gender.Women, collections: [10], variants: [vco] }),
    ];
    const resolve = (sku: string) => products.find((p) => p.sku === sku);
    const orderItems = [
      { sku: 'DA035', variant_suffix: 'PCO', quantity: 1, price_at_order: 1, product_details: products[0] },
    ];
    const ctx: SuggestionRankContext = {
      searchTerm: 'MN',
      typedVariant: null,
      orderVariantSuffixes: [],
      orderVariantResolution: { orderItems, resolveProduct: resolve },
    };
    expect(suggestionDesirabilityScore(products[1], ctx)).toBeGreaterThan(suggestionDesirabilityScore(products[2], ctx));
  });

  it('scoped cart hints: no shared collection — SK035 does not inherit DA035PCO', () => {
    const v: ProductVariant = { suffix: 'PCO', description: '', stock_qty: 0 };
    const da = makeProduct({ sku: 'DA035', gender: Gender.Women, collections: [1], variants: [v] });
    const sk = makeProduct({ sku: 'SK035', gender: Gender.Women, collections: [2], variants: [v] });
    const resolve = (sku: string) => (sku === 'DA035' ? da : sku === 'SK035' ? sk : undefined);
    const orderItems = [{ sku: 'DA035', variant_suffix: 'PCO', quantity: 1, price_at_order: 1, product_details: da }];
    expect(getScopedVariantHintStringsForProduct(sk, orderItems, resolve)).toEqual([]);
  });

  it('getCollectionWideFinishHint: 3+ units with finish P in same collection', () => {
    const vp: ProductVariant = { suffix: 'PCO', description: '', stock_qty: 0 };
    const vak: ProductVariant = { suffix: 'PAK', description: '', stock_qty: 0 };
    const p1 = makeProduct({ sku: 'A01', gender: Gender.Women, collections: [5], variants: [vp] });
    const p2 = makeProduct({ sku: 'A02', gender: Gender.Women, collections: [5], variants: [vak] });
    const target = makeProduct({ sku: 'A03', gender: Gender.Women, collections: [5], variants: [vp] });
    const resolve = (sku: string) => {
      if (sku === 'A01') return p1;
      if (sku === 'A02') return p2;
      return undefined;
    };
    const orderItems = [
      { sku: 'A01', variant_suffix: 'PCO', quantity: 2, price_at_order: 1, product_details: p1 },
      { sku: 'A02', variant_suffix: 'PAK', quantity: 1, price_at_order: 1, product_details: p2 },
    ];
    expect(getCollectionWideFinishHint(target, orderItems, resolve, 3)).toBe('P');
    const targetMen = makeProduct({ sku: 'A03', gender: Gender.Men, collections: [5], variants: [vp] });
    expect(getCollectionWideFinishHint(targetMen, orderItems, resolve, 3)).toBeNull();
  });

  it('prioritizes products that match recent order variant suffix', () => {
    const v: ProductVariant = { suffix: 'DTMP', description: 't', stock_qty: 0 };
    const v2: ProductVariant = { suffix: 'PAK', description: 'p', stock_qty: 0 };
    const withTmp = makeProduct({ sku: 'SK011', gender: Gender.Women, variants: [v] });
    const withPak = makeProduct({ sku: 'SK012', gender: Gender.Women, variants: [v2] });
    const ctx = {
      searchTerm: 'SK01',
      typedVariant: null,
      orderVariantSuffixes: ['DTMP'],
    };
    expect(suggestionDesirabilityScore(withTmp, ctx)).toBeGreaterThan(suggestionDesirabilityScore(withPak, ctx));
  });

  it('indexes collection+core siblings', () => {
    const products = [
      makeProduct({ sku: 'SK025', collections: [7] }),
      makeProduct({ sku: 'DA025', collections: [7] }),
      makeProduct({ sku: 'ZZ999', collections: [7] }),
    ];
    const index = buildProductSearchIndex(products);
    const sk = index.skuMap.get('SK025')!;
    const sibs = getCollectionCoreSiblings(index, sk);
    expect(sibs.map((p) => p.sku).sort()).toEqual(['DA025']);
  });

  it('finds family cluster mates when mod100 matches and num >= 100', () => {
    const products = [
      makeProduct({ sku: 'RN302', collections: [1] }),
      makeProduct({ sku: 'RN402', collections: [1] }),
      makeProduct({ sku: 'PN302', collections: [1] }),
    ];
    const index = buildProductSearchIndex(products);
    const rn302 = index.skuMap.get('RN302')!;
    const family = getFamilyClusterSiblings(index, rn302);
    expect(family.map((p) => p.sku).sort()).toEqual(['RN402']);
  });

  it('computes suggestions with search, set, and order context sections', () => {
    const v: ProductVariant = { suffix: 'DPCO', description: 'Δοκιμή', stock_qty: 0 };
    const products = [
      makeProduct({ sku: 'SK025', collections: [5], variants: [v] }),
      makeProduct({ sku: 'DA025', collections: [5], variants: [v] }),
      makeProduct({ sku: 'MN099', collections: [] }),
    ];
    const index = buildProductSearchIndex(products);
    const result = computeSmartSkuSuggestions({
      index,
      skuPart: 'SK02',
      orderContextMasterSkus: [],
    });
    expect(result).not.toBeNull();
    const headers = result!.virtualRows.filter((r) => r.kind === 'header').map((r) => r.label);
    expect(headers).toContain('Από αναζήτηση');
    expect(headers).toContain('Ίδιο σετ (συλλογή)');
    const skus = result!.virtualRows.filter((r) => r.kind === 'product').map((r) => r.product.sku);
    expect(skus).toContain('DA025');
  });

  it('filters set mates by variant suffix when typing full code', () => {
    const v1: ProductVariant = { suffix: 'DPCO', description: 'A', stock_qty: 0 };
    const v2: ProductVariant = { suffix: 'PAK', description: 'B', stock_qty: 0 };
    const products = [
      makeProduct({ sku: 'SK025', collections: [3], variants: [v1, v2] }),
      makeProduct({ sku: 'DA025', collections: [3], variants: [v1] }),
      makeProduct({ sku: 'MN025', collections: [3], variants: [v2] }),
    ];
    const index = buildProductSearchIndex(products);
    const result = computeSmartSkuSuggestions({
      index,
      skuPart: 'SK025DPCO',
      orderContextMasterSkus: [],
    });
    expect(result).not.toBeNull();
    const setSkus = result!.virtualRows
      .filter((r) => r.kind === 'product' && r.sectionId === 'set')
      .map((r) => (r as { product: Product }).product.sku);
    expect(setSkus).toEqual(['DA025']);
    expect(setSkus).not.toContain('MN025');
  });

  it('merges order-context collection mates', () => {
    const products = [
      makeProduct({ sku: 'SK010', collections: [9] }),
      makeProduct({ sku: 'DA010', collections: [9] }),
    ];
    const index = buildProductSearchIndex(products);
    const result = computeSmartSkuSuggestions({
      index,
      skuPart: 'XY',
      orderContextMasterSkus: ['SK010'],
    });
    expect(result).not.toBeNull();
    const orderSkus = result!.virtualRows
      .filter((r) => r.kind === 'product' && r.sectionId === 'order')
      .map((r) => (r as { product: Product }).product.sku);
    expect(orderSkus).toContain('DA010');
  });

  it('getActiveMasterSetMates respects typed variant tail', () => {
    const v: ProductVariant = { suffix: 'DPCO', description: 'A', stock_qty: 0 };
    const products = [
      makeProduct({ sku: 'SK025', collections: [2], variants: [v] }),
      makeProduct({ sku: 'DA025', collections: [2], variants: [v] }),
      makeProduct({ sku: 'MN025', collections: [2], variants: [] }),
    ];
    const index = buildProductSearchIndex(products);
    const master = index.skuMap.get('SK025')!;
    const mates = getActiveMasterSetMates(index, master, 'SK025DPCO');
    expect(mates.map((p) => p.sku)).toEqual(['DA025']);
  });
});
