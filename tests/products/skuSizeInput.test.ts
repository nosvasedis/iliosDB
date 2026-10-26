import { describe, expect, it } from 'vitest';
import type { Product } from '../../types';
import { resolveSkuSizeInput } from '../../utils/skuSizeInput';
import { expandSkuRange } from '../../utils/pricingEngine';
import { parseOrderRangeInput } from '../../features/orders/orderRangeEntry';

const products = [
    { sku: 'RN001', prefix: 'RN', variants: [{ suffix: '' }, { suffix: 'P' }] },
    { sku: 'RN199', prefix: 'RN', variants: [] },
    { sku: 'DA012', prefix: 'DA', variants: [{ suffix: '' }, { suffix: 'D' }, { suffix: 'DLA' }] },
    { sku: 'BR001', prefix: 'BR', variants: [] },
    { sku: 'SK001', prefix: 'SK', variants: [] },
] as Product[];

describe('complete SKU size entry', () => {
    it.each([
        ['RN001P-62', 'RN001P', '62', 'P'],
        ['DA012DLA-62', 'DA012DLA', '62', 'DLA'],
        ['RN199-62', 'RN199', '62', undefined],
        ['BR001-19', 'BR001', '19cm', undefined],
        ['BR001-19cm', 'BR001', '19cm', undefined],
        ['DA012DLA62', 'DA012DLA', '62', 'DLA'],
        ['RN001P 62', 'RN001P', '62', 'P'],
    ])('resolves %s after the entire finish/stone suffix', (input, sku, size, suffix) => {
        const result = resolveSkuSizeInput(input, products, true);
        expect(result).toMatchObject({ sku, size, invalidSize: false });
        expect(result.match?.variant?.suffix).toBe(suffix);
    });

    it.each(['RN001P-99', 'RN001P-62CM', 'SK001-62', 'DA012D-62LA', 'DA012MISSING-62'])('does not resolve unsupported or misplaced sizes: %s', input => {
        const result = resolveSkuSizeInput(input, products, true);
        expect(result.invalidSize || !result.match).toBe(true);
    });

    it('gives real catalog SKUs precedence over legacy compact sizes', () => {
        expect(resolveSkuSizeInput('RN19962', [...products, { sku: 'RN19962', prefix: 'RN' } as Product], true))
            .toMatchObject({ sku: 'RN19962', size: undefined, match: { product: { sku: 'RN19962' } } });
    });

    it('leaves full SKU ranges and their expansion unchanged', () => {
        const input = 'DA010DLA-DA012DLA';
        expect(resolveSkuSizeInput(input, products, true)).toMatchObject({ sku: input, sizeText: '', invalidSize: false });
        expect(expandSkuRange(input)).toEqual(['DA010DLA', 'DA011DLA', 'DA012DLA']);
        expect(parseOrderRangeInput(input)).toMatchObject({ start: 10, end: 12, suffix: 'DLA' });
        expect(parseOrderRangeInput('DA012DLA-62')).toBeNull();
    });
});
