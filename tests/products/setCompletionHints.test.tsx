// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SetCompletionHints from '../../components/products/SetCompletionHints';
import CatalogSetLinks from '../../components/products/CatalogSetLinks';
import type { Product, OrderItem } from '../../types';

const products = [
    { sku: 'KL255', variants: [{ suffix: 'X' }], link_groups: [{ group_id: 'set', position: 0 }] },
    { sku: 'SK227', variants: [{ suffix: 'X' }], link_groups: [{ group_id: 'set', position: 1 }] },
    { sku: 'RN001', variants: [{ suffix: 'P' }], link_groups: [{ group_id: 'set', position: 2 }] },
    { sku: 'PART', is_component: true, variants: [], link_groups: [{ group_id: 'set', position: 3 }] },
].map((p) => ({ ...p, image_url: null, category: 'Κόσμημα', gender: 'Women' })) as unknown as Product[];

afterEach(cleanup);

describe('set suggestions in order and offer editors', () => {
    it('excludes present items/components and leaves addition to the normal editor', () => {
        const items = [{ sku: 'KL255', variant_suffix: 'X', quantity: 2 }] as OrderItem[];
        const onChoose = vi.fn();
        const view = render(<SetCompletionHints products={products} items={items} onChoose={onChoose} />);
        expect(onChoose).not.toHaveBeenCalled();
        const buttons = Array.from(view.container.querySelectorAll('button')).filter((button) => button.title?.startsWith('Επιλογή '));
        expect(buttons.map((button) => button.title)).toEqual(['Επιλογή SK227', 'Επιλογή RN001']);
        fireEvent.click(buttons[0]);
        expect(onChoose).toHaveBeenLastCalledWith(products[1], 'X');
        fireEvent.click(buttons[1]);
        expect(onChoose).toHaveBeenLastCalledWith(products[2], null);
        expect(items).toEqual([{ sku: 'KL255', variant_suffix: 'X', quantity: 2 }]);
    });

    it('updates after adding a mate and supports old catalogs with no links', () => {
        const view = render(<SetCompletionHints products={products} items={[{ sku: 'KL255' }, { sku: 'SK227' }, { sku: 'RN001' }] as OrderItem[]} onChoose={() => {}} />);
        expect(view.container.innerHTML).toBe('');
        view.rerender(<SetCompletionHints products={[{ sku: 'OLD' }] as Product[]} items={[{ sku: 'OLD' }] as OrderItem[]} onChoose={() => {}} />);
        expect(view.container.innerHTML).toBe('');
    });

    it('shows active product mates before adding a line and preserves the chosen suffix', () => {
        const onChoose = vi.fn();
        const view = render(<SetCompletionHints products={products} items={[]} activeProduct={products[0]} activeSuffix="X" onChoose={onChoose} />);
        fireEvent.click(view.getByTitle('Επιλογή SK227'));
        expect(onChoose).toHaveBeenCalledWith(products[1], 'X');
    });

    it('finds catalog mates outside the currently filtered grid or collection', () => {
        const onSelect = vi.fn();
        const view = render(<CatalogSetLinks product={products[0]} products={products.slice(0, 3)} suffix="X" onSelect={onSelect} />);
        fireEvent.click(view.getByTitle('Επιλογή SK227'));
        expect(onSelect).toHaveBeenCalledWith(products[1], 'X');
    });
});
