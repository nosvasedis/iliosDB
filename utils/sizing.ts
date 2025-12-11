import { Product } from '../types';

export const SIZED_PREFIXES = {
    RINGS_MEN: 'RN',
    RINGS_WOMEN: 'DA',
    BRACELETS_WOMEN: 'BR',
    BRACELETS_MEN: 'XR',
};

const RING_SIZES_MEN = Array.from({ length: 70 - 58 + 1 }, (_, i) => (58 + i).toString());
const RING_SIZES_WOMEN = Array.from({ length: 62 - 48 + 1 }, (_, i) => (48 + i).toString());
const BRACELET_SIZES_WOMEN = ['17cm', '19cm', '21cm'];
const BRACELET_SIZES_MEN = ['19cm', '21cm', '23cm'];

export function isSizable(product: { prefix: string }): boolean {
    return Object.values(SIZED_PREFIXES).includes(product.prefix);
}

export function getSizingInfo(product: { prefix: string }): { type: 'Νούμερο' | 'Μήκος', sizes: string[] } | null {
    switch (product.prefix) {
        case SIZED_PREFIXES.RINGS_MEN:
            return { type: 'Νούμερο', sizes: RING_SIZES_MEN };
        case SIZED_PREFIXES.RINGS_WOMEN:
            return { type: 'Νούμερο', sizes: RING_SIZES_WOMEN };
        case SIZED_PREFIXES.BRACELETS_MEN:
            return { type: 'Μήκος', sizes: BRACELET_SIZES_MEN };
        case SIZED_PREFIXES.BRACELETS_WOMEN:
            return { type: 'Μήκος', sizes: BRACELET_SIZES_WOMEN };
        default:
            return null;
    }
}
