import { isXrExtendedSizingSku } from './xrOptions';

export const SIZED_PREFIXES = {
    RINGS_MEN: 'RN',
    RINGS_WOMEN: 'DA',
    RINGS_DM: 'DM',
    BRACELETS_WOMEN: 'BR',
    BRACELETS_MEN: 'XR',
    RINGS_SPECIAL_1: 'BDA',
    RINGS_SPECIAL_2: 'ΒΔΑ'
};

const RING_SIZES_MEN = Array.from({ length: 70 - 58 + 1 }, (_, i) => (58 + i).toString());
const RING_SIZES_WOMEN = Array.from({ length: 62 - 46 + 1 }, (_, i) => (46 + i).toString());
const BRACELET_SIZES_WOMEN = ['17cm', '19cm', '21cm'];
const BRACELET_SIZES_MEN = ['19cm', '21cm', '23cm', '25cm'];

export const SIZE_TYPE_NUMBER = 'Νούμερο' as const;
export const SIZE_TYPE_LENGTH = 'Μήκος' as const;

export type ProductSizingInfo = {
    type: typeof SIZE_TYPE_NUMBER | typeof SIZE_TYPE_LENGTH;
    sizes: string[];
};

type SizingProduct = { prefix: string, category?: string, sku?: string, gender?: string };

function isRingCategory(category?: string): boolean {
    const normalized = (category || '').trim().toUpperCase();
    return normalized.includes('ΔΑΧΤΥΛ') || normalized.includes('ΔΑΚΤΥΛ') || normalized.includes('RING');
}

export function isSizable(product: SizingProduct): boolean {
    return getSizingInfo(product) !== null;
}

export function getSizingInfo(product: SizingProduct): ProductSizingInfo | null {
    const prefix = product.prefix.toUpperCase();

    if (prefix === SIZED_PREFIXES.RINGS_MEN) {
        return { type: SIZE_TYPE_NUMBER, sizes: RING_SIZES_MEN };
    }

    if (prefix === SIZED_PREFIXES.RINGS_WOMEN || prefix === 'BDA' || prefix === 'ΒΔΑ') {
        return { type: SIZE_TYPE_NUMBER, sizes: RING_SIZES_WOMEN };
    }

    if (prefix === SIZED_PREFIXES.RINGS_DM && isRingCategory(product.category)) {
        return { type: SIZE_TYPE_NUMBER, sizes: RING_SIZES_WOMEN };
    }

    if (prefix === SIZED_PREFIXES.BRACELETS_MEN) {
        if (product.sku && isXrExtendedSizingSku(product.sku)) {
            return { type: SIZE_TYPE_LENGTH, sizes: BRACELET_SIZES_MEN };
        }

        if (product.category && (product.category.includes('Δερμάτινο') || product.category.includes('Leather'))) {
            return { type: SIZE_TYPE_LENGTH, sizes: BRACELET_SIZES_MEN };
        }
        return null;
    }

    if (prefix === SIZED_PREFIXES.BRACELETS_WOMEN) {
        return { type: SIZE_TYPE_LENGTH, sizes: BRACELET_SIZES_WOMEN };
    }

    return null;
}
