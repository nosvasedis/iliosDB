import { isXrExtendedSizingSku } from './xrOptions';

export const SIZED_PREFIXES = {
    RINGS_MEN: 'RN',
    RINGS_WOMEN: 'DA',
    BRACELETS_WOMEN: 'BR',
    BRACELETS_MEN: 'XR',
    RINGS_SPECIAL_1: 'BDA',
    RINGS_SPECIAL_2: 'Ξβ€™Ξβ€Ξβ€'
};

const RING_SIZES_MEN = Array.from({ length: 70 - 58 + 1 }, (_, i) => (58 + i).toString());
const RING_SIZES_WOMEN = Array.from({ length: 62 - 46 + 1 }, (_, i) => (46 + i).toString());
const BRACELET_SIZES_WOMEN = ['17cm', '19cm', '21cm'];
const BRACELET_SIZES_MEN = ['19cm', '21cm', '23cm', '25cm'];

export const SIZE_TYPE_NUMBER = 'ΞΒΞΞΞΒΞΞΞΒµΞΒΞΞ' as const;
export const SIZE_TYPE_LENGTH = 'ΞΒΞΒ®ΞΞΞΞΞβ€' as const;

export type ProductSizingInfo = {
    type: typeof SIZE_TYPE_NUMBER | typeof SIZE_TYPE_LENGTH;
    sizes: string[];
};

export function isSizable(product: { prefix: string, category?: string, sku?: string }): boolean {
    return getSizingInfo(product) !== null;
}

export function getSizingInfo(product: { prefix: string, category?: string, sku?: string }): ProductSizingInfo | null {
    const prefix = product.prefix.toUpperCase();

    if (prefix === SIZED_PREFIXES.RINGS_MEN) {
        return { type: SIZE_TYPE_NUMBER, sizes: RING_SIZES_MEN };
    }

    if (prefix === SIZED_PREFIXES.RINGS_WOMEN || prefix === 'BDA' || prefix === 'Ξβ€™Ξβ€Ξβ€') {
        return { type: SIZE_TYPE_NUMBER, sizes: RING_SIZES_WOMEN };
    }

    if (prefix === SIZED_PREFIXES.BRACELETS_MEN) {
        if (product.sku && isXrExtendedSizingSku(product.sku)) {
            return { type: SIZE_TYPE_LENGTH, sizes: BRACELET_SIZES_MEN };
        }

        if (product.category && (product.category.includes('Ξβ€ΞΒµΞΒΞΞΞΒ¬Ξβ€ΞΞ‰ΞΒ½ΞΞ') || product.category.includes('Leather'))) {
            return { type: SIZE_TYPE_LENGTH, sizes: BRACELET_SIZES_MEN };
        }
        return null;
    }

    if (prefix === SIZED_PREFIXES.BRACELETS_WOMEN) {
        return { type: SIZE_TYPE_LENGTH, sizes: BRACELET_SIZES_WOMEN };
    }

    return null;
}
