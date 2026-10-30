import React, { useCallback, useState } from 'react';
import CatalogProductGrid from '../catalog/CatalogProductGrid';
import { SellerCatalogProduct } from '../../features/sellerCatalog/types';
import SellerImageLightbox from './SellerImageLightbox';

interface Props {
    products: SellerCatalogProduct[];
    allProducts?: SellerCatalogProduct[];
    resetKey?: string;
    empty?: React.ReactNode;
    onAddToOrder?: (product: SellerCatalogProduct, variantSuffix?: string) => void;
}

/** Seller catalogue grid: tapping a card opens the full-screen image lightbox. */
export default function SellerProductGrid({ products, allProducts = products, resetKey, empty, onAddToOrder }: Props) {
    const [lightbox, setLightbox] = useState<{ product: SellerCatalogProduct; variantIndex: number } | null>(null);
    const openLightbox = useCallback((product: SellerCatalogProduct, variantIndex: number) => {
        setLightbox({ product, variantIndex });
    }, []);

    return (
        <CatalogProductGrid products={products} allProducts={allProducts} resetKey={resetKey} empty={empty} onOpen={openLightbox} onAddToOrder={onAddToOrder}>
            {lightbox && <SellerImageLightbox key={lightbox.product.sku} item={lightbox} products={allProducts} onSelectProduct={(product, suffix) => openLightbox(product, Math.max(0, product.variants.findIndex((variant) => variant.suffix === suffix)))} onClose={() => setLightbox(null)} />}
        </CatalogProductGrid>
    );
}
