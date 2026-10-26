import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OrderStatus, type Order, type Product } from '../../types';
import { useOrderState } from '../../hooks/useOrderState';
import MobileOrderBuilder from '../../components/mobile/MobileOrderBuilder';
import OrderPriceModeToggle from '../../components/OrderBuilder/OrderPriceModeToggle';
import { api } from '../../lib/supabase';

vi.mock('../../lib/supabase', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../lib/supabase')>();
    return { ...actual, api: { ...actual.api, updateOrder: vi.fn() } };
});
vi.mock('../../components/UIProvider', () => ({ useUI: () => ({ showToast: vi.fn(), confirm: vi.fn() }) }));
vi.mock('../../components/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' }, profile: { id: 'u1', role: 'employee' } }) }));
vi.mock('../../hooks/api/useCollections', () => ({ useCollections: () => ({ data: [] }) }));
vi.mock('../../hooks/api/useOrders', () => ({ useCustomers: () => ({ data: [] }) }));
vi.mock('../../hooks/useLiveActivity', () => ({ dispatchLiveActivity: vi.fn() }));
vi.mock('../../lib/queryInvalidation', () => ({ invalidateAndRefetchAfterOrderMutation: vi.fn() }));
vi.mock('../../components/inventory/InventoryAvailabilityNote', () => ({ default: () => null }));
vi.mock('../../components/customers/OrderTerritoryAlert', () => ({ default: () => null }));

const products = ['BDA001', 'ΒΔΑ001'].map(sku => ({
    sku, prefix: sku.slice(0, 2), category: 'Γενικό', variants: [], selling_price: 10,
    collections: [], image_url: null, is_component: false,
} as Product));
const order: Order = {
    id: 'test-order', customer_name: 'Test', status: OrderStatus.Pending,
    created_at: '2026-10-22T00:00:00Z', vat_rate: 0.24, total_price: 12.4,
    items: [{ sku: 'BDA001', quantity: 1, price_at_order: 10, size_info: '52', line_id: 'line-1' }],
};
let renderer: ReturnType<typeof create>;
const mount = (children: React.ReactNode) => {
    act(() => { renderer = create(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>); });
};
beforeEach(() => {
    const storage = { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() };
    vi.stubGlobal('sessionStorage', storage);
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal('window', { clearTimeout });
    vi.spyOn(api, 'updateOrder').mockResolvedValue(undefined);
});
afterEach(() => {
    act(() => renderer?.unmount());
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('order builder pricing controls', () => {
    it('resolves complete sized SKUs consistently and clears invalid or removed sizes', () => {
        const sizedProducts = [{ ...products[0], sku: 'DA012', prefix: 'DA', variants: [
            { suffix: '', description: 'Λουστρέ' }, { suffix: 'D', description: 'Δίχρωμο' }, { suffix: 'DLA', description: 'Λάπις' },
        ] }] as Product[];
        let builder: ReturnType<typeof useOrderState>;
        function Harness() {
            builder = useOrderState({ products: sizedProducts, customers: [], onBack: vi.fn() });
            return null;
        }
        mount(<Harness />);
        const type = (value: string) => act(() => builder!.actions.handleSmartInput({ target: { value } } as any));
        type('DA012DLA-62');
        expect(builder!.state.selectedSize).toBe('62');
        expect(builder!.state.filteredVariants.map(v => v.suffix)).toEqual(['DLA']);
        expect(builder!.actions.getSkuComponents('DA012DLA-62', sizedProducts[0])).toMatchObject({ suffixStr: 'DLA', sizeText: '-62' });
        type('DA012DLA-99');
        expect(builder!.state.selectedSize).toBe('');
        act(() => builder!.actions.executeAddItem());
        act(() => builder!.actions.handleAddItem(sizedProducts[0].variants![2]));
        expect(builder!.state.selectedItems).toHaveLength(0);
        type('DA012DLA62');
        expect(builder!.state.selectedSize).toBe('62');
        act(() => builder!.actions.executeAddItem());
        expect(builder!.state.selectedItems[0]).toMatchObject({ sku: 'DA012', variant_suffix: 'DLA', size_info: '62' });
        type('DA012DLA 54');
        expect(builder!.state.selectedSize).toBe('54');
        type('DA012DLA');
        expect(builder!.state.selectedSize).toBe('');
        type('DA012DLA-52');
        act(() => builder!.setters.setSelectedSize('50'));
        expect(builder!.state.scanInput).toBe('DA012DLA-50');
        act(() => builder!.actions.executeAddItem());
        expect(builder!.state.selectedItems.map(item => item.size_info)).toEqual(['50', '62']);
        type('DA012DLA-DA013DLA');
        expect(builder!.state.selectedSize).toBe('');
        act(() => builder!.actions.executeAddItem());
        expect(builder!.state.pendingOrderRangeReview?.rows).toHaveLength(2);
    });

    it('keeps mobile rings editable through the dash and saves the selected size', async () => {
        const sizedProducts = [{ ...products[0], sku: 'RN001', prefix: 'RN', variants: [{ suffix: 'P', description: 'Πατίνα', selling_price: 10 }] }] as Product[];
        mount(<MobileOrderBuilder onBack={vi.fn()} initialOrder={{ ...order, items: [] }} products={sizedProducts} />);
        const input = () => renderer.root.findAllByType('input').find(i => i.props.placeholder?.startsWith('Κωδικός ή πλήρης'))!;
        for (const value of ['RN001P', 'RN001P-', 'RN001P-6', 'RN001P-62']) {
            act(() => input().props.onChange({ target: { value } }));
            expect(input().props.value).toBe(value);
        }
        expect(renderer.root.findByProps({ title: 'Μέγεθος 62' }).props.className).toContain('text-blue-600');
        act(() => input().props.onKeyDown({ key: 'Enter', preventDefault: vi.fn() }));
        act(() => renderer.root.findAllByType('button').find(b => b.props.className?.includes('bg-emerald-600') && b.props.onClick)!.props.onClick());
        await act(async () => { await renderer.root.findAllByType('button')[1].props.onClick(); });
        expect(api.updateOrder).toHaveBeenCalledWith(expect.objectContaining({
            items: [expect.objectContaining({ sku: 'RN001', variant_suffix: 'P', size_info: '62' })],
        }), undefined);
    });
    it('applies desktop retail mode to existing and scanned lines, edits, recalculation and save', async () => {
        let builder: ReturnType<typeof useOrderState>;
        function Harness() {
            builder = useOrderState({ initialOrder: order, products, customers: [], onBack: vi.fn() });
            return <OrderPriceModeToggle value={builder.state.priceMode} onChange={builder.actions.handlePriceModeChange} />;
        }
        mount(<Harness />);
        act(() => renderer.root.findByProps({ role: 'switch' }).props.onChange({ target: { checked: true } }));
        expect(builder!.state.selectedItems[0].price_at_order).toBe(30);
        act(() => builder!.actions.handleScanInOrder('ΒΔΑ001'));
        expect(builder!.state.selectedItems.map(item => item.price_at_order)).toEqual([30, 30]);
        act(() => builder!.actions.handleSelectMaster(products[1]));
        expect(builder!.state.sizeMode?.sizes).toContain('52');
        act(() => builder!.actions.updateItemVariantAndSize(builder!.state.selectedItems[0], undefined, '54'));
        expect(builder!.state.selectedItems[0]).toMatchObject({ price_at_order: 30, size_info: '54', price_mode: 'retail' });
        act(() => builder!.actions.handleRecalculatePrices());
        expect(builder!.state.selectedItems[0].price_at_order).toBe(30);
        expect(builder!.state.grandTotal).toBeCloseTo(74.4);
        await act(async () => { await builder!.actions.handleSaveOrder(); });
        expect(api.updateOrder).toHaveBeenCalledWith(expect.objectContaining({
            items: expect.arrayContaining([expect.objectContaining({ sku: 'ΒΔΑ001', size_info: '54', price_mode: 'retail', price_at_order: 30 })]),
            total_price: 74.4,
        }), undefined);
        act(() => renderer.root.findByProps({ role: 'switch' }).props.onChange({ target: { checked: false } }));
        expect(builder!.state.selectedItems.map(item => item.price_at_order)).toEqual([10, 10]);
    });

    it('restores the mobile switch on reopen and saves wholesale prices after switching back', async () => {
        mount(<MobileOrderBuilder onBack={vi.fn()} initialOrder={{ ...order, items: [{ ...order.items[0], price_at_order: 30, price_mode: 'retail' }] }} products={products} />);
        expect(renderer.root.findByProps({ role: 'switch' }).props.checked).toBe(true);
        act(() => renderer.root.findByProps({ role: 'switch' }).props.onChange({ target: { checked: false } }));
        expect(renderer.root.findByType(OrderPriceModeToggle).props.value).toBe('wholesale');
        // The first two controls in the mobile header are back and save.
        await act(async () => { await renderer.root.findAllByType('button')[1].props.onClick(); });
        expect(api.updateOrder).toHaveBeenCalledWith(expect.objectContaining({
            items: [expect.objectContaining({ price_at_order: 10, price_mode: 'wholesale', size_info: '52' })],
            total_price: 12.4,
        }), undefined);
    });
});
