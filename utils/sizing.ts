
import { Product } from '../types';

export const SIZED_PREFIXES = {
    RINGS_MEN: 'RN',
    RINGS_WOMEN: 'DA',
    BRACELETS_WOMEN: 'BR',
    BRACELETS_MEN: 'XR',
    RINGS_SPECIAL_1: 'BDA',
    RINGS_SPECIAL_2: 'ΒΔΑ'
};

const RING_SIZES_MEN = Array.from({ length: 70 - 58 + 1 }, (_, i) => (58 + i).toString());
const RING_SIZES_WOMEN = Array.from({ length: 62 - 48 + 1 }, (_, i) => (48 + i).toString());
const BRACELET_SIZES_WOMEN = ['17cm', '19cm', '21cm'];
const BRACELET_SIZES_MEN = ['19cm', '21cm', '23cm'];

export function isSizable(product: { prefix: string, category?: string }): boolean {
    return getSizingInfo(product) !== null;
}

export function getSizingInfo(product: { prefix: string, category?: string }): { type: 'Νούμερο' | 'Μήκος', sizes: string[] } | null {
    const prefix = product.prefix.toUpperCase();
    
    // RINGS
    if (prefix === SIZED_PREFIXES.RINGS_MEN) {
        return { type: 'Νούμερο', sizes: RING_SIZES_MEN };
    }
    if (prefix === SIZED_PREFIXES.RINGS_WOMEN || prefix === 'BDA' || prefix === 'ΒΔΑ') {
        return { type: 'Νούμερο', sizes: RING_SIZES_WOMEN };
    }

    // BRACELETS
    if (prefix === SIZED_PREFIXES.BRACELETS_MEN) {
        // XR Rule: Only if category includes "Δερμάτινο"
        if (product.category && (product.category.includes('Δερμάτινο') || product.category.includes('Leather'))) {
            return { type: 'Μήκος', sizes: BRACELET_SIZES_MEN };
        }
        return null;
    }
    
    if (prefix === SIZED_PREFIXES.BRACELETS_WOMEN) {
        return { type: 'Μήκος', sizes: BRACELET_SIZES_WOMEN };
    }

    return null;
}
