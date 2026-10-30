import React, { useMemo } from 'react';
import type { Gender, ProductLinkMembership } from '../../types';
import { getLinkedSkus, resolveLinkedVariantSuffix, useProductLinkIndex } from '../../features/products/productLinks';
import LinkedProductsStrip from './LinkedProductsStrip';

export interface SetCatalogProduct {
    sku: string;
    image_url?: string | null;
    gender: Gender;
    variants?: Array<{ suffix: string }>;
    link_groups?: ProductLinkMembership[];
}

export default function CatalogSetLinks<P extends SetCatalogProduct>({ product, products, suffix, onSelect }: {
    product: P;
    products: P[];
    suffix?: string;
    onSelect: (product: P, suffix: string | null) => void;
}) {
    const index = useProductLinkIndex(products);
    const bySku = useMemo(() => new Map(products.map((p) => [p.sku, p])), [products]);
    const mates = getLinkedSkus(product.sku, index).map((sku) => bySku.get(sku)).filter((p): p is P => !!p);
    return <LinkedProductsStrip compact items={mates.map((mate) => ({
        sku: mate.sku, suffix: resolveLinkedVariantSuffix(mate, suffix), imageUrl: mate.image_url || null, gender: mate.gender,
        onSelect: () => onSelect(mate, resolveLinkedVariantSuffix(mate, suffix)),
    }))} />;
}
