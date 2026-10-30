import React, { useMemo } from 'react';
import type { Product, OrderItem } from '../../types';
import { findMissingSetMates, useProductLinkIndex } from '../../features/products/productLinks';
import LinkedProductsStrip from './LinkedProductsStrip';

interface Props {
    products?: Product[];
    items: OrderItem[];
    activeProduct?: Product | null;
    activeSuffix?: string | null;
    onChoose: (product: Product, suffix: string | null) => void;
}

/** Suggestions only: the normal editor still chooses sizes, options and prices. */
export default function SetCompletionHints({ products, items, activeProduct, activeSuffix, onChoose }: Props) {
    const index = useProductLinkIndex(products);
    const bySku = useMemo(() => new Map((products || []).filter((p) => !p.is_component).map((p) => [p.sku, p])), [products]);
    const mates = useMemo(() => {
        const present = new Set(items.map((item) => item.sku));
        const sources = activeProduct ? [{ sku: activeProduct.sku, variant_suffix: activeSuffix }] : items;
        const seen = new Set<string>();
        return sources.flatMap((source) => findMissingSetMates(source.sku, source.variant_suffix, present, index, bySku))
            .filter((mate) => {
                if (seen.has(mate.product.sku)) return false;
                seen.add(mate.product.sku);
                return true;
            });
    }, [items, activeProduct, activeSuffix, index, bySku]);

    return <LinkedProductsStrip compact title={activeProduct ? 'Σετ με' : 'Συμπλήρωση σετ'} items={mates.map(({ product, suffix }) => ({
        sku: product.sku, suffix, imageUrl: product.image_url, gender: product.gender,
        aside: suffix === null ? 'Επιλογή παραλλαγής' : product.category,
        onSelect: () => onChoose(product, suffix),
    }))} />;
}
