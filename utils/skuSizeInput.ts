import type { Product } from '../types';
import { findProductByScannedCode } from './pricingEngine';
import { getSizingInfo, type ProductSizingInfo } from './sizing';

/** A numeric tail after a complete SKU is a size; a second SKU remains a range. */
export function splitSkuSizeInput(input: string) {
    const normalized = input.trim().toUpperCase();
    const dashed = normalized.match(/^([^\s-]+)-(\d+(?:CM)?)$/);
    if (dashed) return { sku: dashed[1], sizeToken: dashed[2], sizeText: `-${dashed[2]}` };
    const spaced = normalized.match(/^([^\s]+)(\s+)(\d+(?:CM)?)$/);
    if (spaced) return { sku: spaced[1], sizeToken: spaced[3], sizeText: spaced[2] + spaced[3] };
    return { sku: normalized, sizeToken: undefined, sizeText: '' };
}

export function matchSkuSize(token: string | undefined, sizing?: Pick<ProductSizingInfo, 'sizes'> | null) {
    if (!token || !sizing) return undefined;
    const normalized = token.toUpperCase();
    return sizing.sizes.find(size => {
        const stored = size.toUpperCase();
        return stored === normalized || (stored.endsWith('CM') && stored.slice(0, -2) === normalized.replace(/CM$/, ''));
    });
}

export function resolveSkuSizeInput(input: string, products: Product[], allowCompact = false) {
    let parts = splitSkuSizeInput(input);
    let match = findProductByScannedCode(parts.sku, products);

    // Preserve legacy order entry such as RN001P62, but only after exact catalog lookup.
    // Resolve the complete variant first, so P cannot consume a longer stone/metal suffix.
    if (allowCompact && !match && !parts.sizeToken && !parts.sku.includes('-')) {
        for (const length of [3, 2]) {
            const tail = parts.sku.match(new RegExp(`^(.*?)(\\d{${length}}(?:CM)?)$`));
            if (!tail) continue;
            const candidate = findProductByScannedCode(tail[1], products);
            if (candidate && matchSkuSize(tail[2], getSizingInfo(candidate.product))) {
                parts = { sku: tail[1], sizeToken: tail[2], sizeText: tail[2] };
                match = candidate;
                break;
            }
        }
    }

    const size = matchSkuSize(parts.sizeToken, match ? getSizingInfo(match.product) : null);
    return { ...parts, match, size, invalidSize: Boolean(parts.sizeToken && !size) };
}
