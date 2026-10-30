import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { act, create } from 'react-test-renderer';
import { describe, expect, it } from 'vitest';
import CatalogProductCard from '../../components/catalog/CatalogProductCard';
import { getStoreCatalogIndex, selectStoreCatalog } from '../../components/employee/storeCatalog';
import { mapProductsWithRelations } from '../../features/products/mappers';
import { Gender, PlatingType, ProductionType } from '../../types';

const products = mapProductsWithRelations([{
    sku: 'BDA002', prefix: 'BD', category: 'Δαχτυλίδι', gender: Gender.Women,
    image_url: 'https://legacy-bucket.r2.dev/BDA002.jpg', weight_g: 1,
    plating_type: PlatingType.None, production_type: ProductionType.InHouse,
}], {}, { publicImageBaseUrl: 'https://ilios-image-handler.iliosdb.workers.dev', centralWarehouseId: '', showroomWarehouseId: '' });

describe('redesigned store photo wiring', () => {
    it('preserves the mapped image through catalog indexing and filtering into the card', () => {
        const filtered = selectStoreCatalog(getStoreCatalogIndex(products, []), {
            search: 'BDA002', group: 'All', gender: 'All', stones: 'all', plating: 'all', onlyInStock: false, sortBy: 'sku',
        });
        const html = renderToStaticMarkup(<CatalogProductCard product={filtered[0]} density="compact" priority onOpen={() => {}} />);
        expect(html).toContain('src="https://ilios-image-handler.iliosdb.workers.dev/BDA002.jpg"');
        expect(html).toContain('loading="eager"');
    });

    it('does not keep a failed-image placeholder when the product photo changes', () => {
        let view!: ReturnType<typeof create>;
        act(() => { view = create(<CatalogProductCard product={products[0]} density="regular" onOpen={() => {}} />); });
        act(() => view.root.findByType('img').props.onError());
        expect(view.root.findAllByType('img')).toHaveLength(0);
        const updated = { ...products[0], image_url: 'https://ilios-image-handler.iliosdb.workers.dev/BDA002-new.webp' };
        act(() => view.update(<CatalogProductCard product={updated} density="regular" onOpen={() => {}} />));
        expect(view.root.findByType('img').props.src).toBe(updated.image_url);
        act(() => view.unmount());
    });
});
