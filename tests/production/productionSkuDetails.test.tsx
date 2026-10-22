import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Gender, OrderStatus, ProductionStage, ProductionType, type Order, type Product, type ProductionBatch } from '../../types';
import ProductionSendModal from '../../components/ProductionSendModal';
import ProductDetails from '../../components/ProductDetails';
import { STAGES } from '../../components/production/stageConstants';

const mocks = vi.hoisted(() => ({
    showToast: vi.fn(), confirm: vi.fn(), shipments: { shipments: [], items: [] }, history: [],
    settings: vi.fn(() => ({ data: { silver_price_gram: 2.5 }, isError: false })),
    molds: vi.fn(() => ({ data: [], isError: false })),
    print: vi.fn(),
}));
vi.mock('../../components/UIProvider', () => ({ useUI: () => ({ showToast: mocks.showToast, confirm: mocks.confirm }) }));
vi.mock('../../hooks/api/useOrders', () => ({ useOrderShipmentsForOrder: () => ({ data: mocks.shipments, isLoading: false }) }));
vi.mock('../../hooks/api/useProductionBatches', () => ({ useBatchStageHistoryEntries: () => ({ data: mocks.history }) }));
vi.mock('../../hooks/api/useSettings', () => ({ useSettings: mocks.settings }));
vi.mock('../../hooks/api/useMolds', () => ({ useMolds: mocks.molds }));
vi.mock('../../components/PrintContext', () => ({ usePrint: () => ({ setPrintItems: mocks.print }) }));
vi.mock('../../components/ProductDetails', () => ({ default: (props: any) => <div data-testid="sku-details"><button aria-label="Κλείσιμο στοιχείων SKU" onClick={props.onClose}>Κλείσιμο</button></div> }));
vi.mock('@tanstack/react-virtual', () => ({ useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 100,
    getVirtualItems: () => Array.from({ length: count }, (_, index) => ({ index, key: index, start: index * 100 })),
    measureElement: () => {},
}) }));

const product = {
    sku: 'BDA001', prefix: 'BD', category: 'Δαχτυλίδι', gender: Gender.Women,
    production_type: ProductionType.InHouse, selling_price: 10, collections: [],
    variants: [{ suffix: 'X', selling_price: 12 }], recipe: [], molds: [], labor: {},
} as Product;
const order = {
    id: 'test-production', customer_name: 'Δοκιμή', created_at: '2026-10-22T00:00:00Z',
    status: OrderStatus.InProduction, total_price: 12,
    items: [{ sku: 'BDA001', variant_suffix: 'X', quantity: 1, price_at_order: 12, line_id: 'line-1' }],
} as Order;
const batch = {
    id: 'batch-1', order_id: order.id, sku: product.sku, variant_suffix: 'X', line_id: 'line-1',
    quantity: 1, current_stage: ProductionStage.Waxing, created_at: order.created_at, updated_at: order.created_at,
} as ProductionBatch;
let renderer: ReactTestRenderer;
let client: QueryClient;
let listeners: Set<(event: { key: string }) => void>;
const onClose = vi.fn();
beforeEach(() => {
    vi.clearAllMocks();
    listeners = new Set();
    vi.stubGlobal('window', {
        addEventListener: (type: string, listener: any) => { if (type === 'keydown') listeners.add(listener); },
        removeEventListener: (type: string, listener: any) => { if (type === 'keydown') listeners.delete(listener); },
        setInterval, clearInterval, setTimeout, clearTimeout,
    });
    vi.stubGlobal('document', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => {
    act(() => renderer?.unmount());
    client.clear();
    vi.unstubAllGlobals();
});
const mount = () => act(() => {
    renderer = create(<QueryClientProvider client={client}><ProductionSendModal order={order} products={[product]} materials={[]} collections={[]} existingBatches={[batch]} onClose={onClose} /></QueryClientProvider>);
});
const openSku = async (last = false) => {
    const stopPropagation = vi.fn();
    const buttons = renderer.root.findAllByProps({ 'aria-label': 'Προβολή στοιχείων BDA001X' });
    await act(async () => {
        buttons[last ? buttons.length - 1 : 0].props.onClick({ stopPropagation });
        await import('../../components/production/ProductionSkuDetails');
    });
    expect(stopPropagation).toHaveBeenCalledOnce();
};

describe('production management SKU details', () => {
    it('opens existing SKU details with the selected variant above the production modal and returns on close', async () => {
        mount();
        expect(mocks.settings).not.toHaveBeenCalled();
        expect(mocks.molds).not.toHaveBeenCalled();
        await openSku();
        expect(renderer.root.findByType(ProductDetails).props).toMatchObject({
            product, initialVariantSuffix: 'X', zIndex: 650, allProducts: [product],
        });
        act(() => renderer.root.findByProps({ 'aria-label': 'Κλείσιμο στοιχείων SKU' }).props.onClick());
        expect(renderer.root.findAllByType(ProductDetails)).toHaveLength(0);
        expect(renderer.root.findAllByProps({ 'aria-label': 'Προβολή στοιχείων BDA001X' })).toHaveLength(1);
        expect(onClose).not.toHaveBeenCalled();
    });

    it('opens SKU details from the stage popup and Escape leaves the popup in place', async () => {
        mount();
        const stageLabel = STAGES.find(stage => stage.id === ProductionStage.Waxing)!.label;
        act(() => renderer.root.findAllByType('button').find(button => button.props.title?.startsWith(`${stageLabel}:`))!.props.onClick());
        expect(renderer.root.findAllByProps({ 'aria-label': 'Προβολή στοιχείων BDA001X' })).toHaveLength(2);
        await openSku(true);
        expect(renderer.root.findByType(ProductDetails).props.initialVariantSuffix).toBe('X');
        act(() => { for (const listener of [...listeners]) listener({ key: 'Escape' }); });
        expect(renderer.root.findAllByType(ProductDetails)).toHaveLength(0);
        expect(renderer.root.findAllByProps({ 'aria-label': 'Προβολή στοιχείων BDA001X' })).toHaveLength(2);
        expect(onClose).not.toHaveBeenCalled();
    });
});
