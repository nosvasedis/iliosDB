// @vitest-environment jsdom
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import CatalogProductCard from '../../components/catalog/CatalogProductCard';
import { getStoreCatalogIndex, selectStoreCatalog } from '../../components/employee/storeCatalog';
import { mapProductsWithRelations } from '../../features/products/mappers';
import { Gender, PlatingType, ProductionType } from '../../types';

const products = mapProductsWithRelations([{
    sku: 'BDA002', prefix: 'BD', category: 'Δαχτυλίδι', gender: Gender.Women,
    image_url: 'https://legacy-bucket.r2.dev/BDA002.jpg', weight_g: 1,
    plating_type: PlatingType.None, production_type: ProductionType.InHouse,
}], {}, { publicImageBaseUrl: 'https://ilios-image-handler.iliosdb.workers.dev', centralWarehouseId: '', showroomWarehouseId: '' });

afterEach(cleanup);

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
        const view = render(<CatalogProductCard product={products[0]} density="regular" onOpen={() => {}} />);
        fireEvent.error(view.container.querySelector('img')!);
        expect(view.container.querySelectorAll('img')).toHaveLength(0);
        const updated = { ...products[0], image_url: 'https://ilios-image-handler.iliosdb.workers.dev/BDA002-new.webp' };
        view.rerender(<CatalogProductCard product={updated} density="regular" onOpen={() => {}} />);
        expect(view.container.querySelector('img')!.getAttribute('src')).toBe(updated.image_url);
    });
});
