// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Supplier } from '../../types';
import SuppliersPage from '../../components/SuppliersPage';
import SupplierFormModal from '../../components/suppliers/SupplierFormModal';
import MobileCustomers from '../../components/mobile/MobileCustomers';
import { countSupplierKinds } from '../../components/suppliers/supplierUi';

const state = vi.hoisted(() => ({ suppliers: [] as Supplier[], orders: [] as any[], save: vi.fn(), invalidate: vi.fn() }));
vi.mock('../../lib/supabase', () => ({ api: { saveSupplier: (...args: unknown[]) => state.save(...args) }, supabase: {}, INTERNAL_CUSTOMER_ID: 'internal', RETAIL_CUSTOMER_ID: 'retail' }));
vi.mock('@tanstack/react-query', async importOriginal => ({
    ...await importOriginal<typeof import('@tanstack/react-query')>(),
    useQuery: ({ queryKey }: { queryKey: string[] }) => ({ data: queryKey[0] === 'suppliers' ? state.suppliers : queryKey[0] === 'supplier_orders' ? state.orders : [], refetch: vi.fn() }),
    useQueryClient: () => ({ invalidateQueries: state.invalidate }),
}));
vi.mock('../../components/AuthContext', () => ({ useAuth: () => ({ profile: { role: 'seller' } }) }));
vi.mock('../../components/PrintContext', () => ({ usePrint: () => ({ setSupplierOrderToPrint: vi.fn() }) }));
vi.mock('../../components/UIProvider', () => ({ useUI: () => ({ showToast: vi.fn(), confirm: vi.fn() }) }));
vi.mock('../../hooks/api/useFinance', () => ({ useFinanceWorkspace: () => ({ data: undefined }) }));
vi.mock('../../hooks/useEscapeToClose', () => ({ useEscapeToClose: vi.fn() }));
vi.mock('../../hooks/useRestartBlocker', () => ({ useRestartDraft: vi.fn() }));
vi.mock('../../features/suppliers/supplierLogo', () => ({ uploadSupplierLogo: vi.fn() }));
vi.mock('../../components/DesktopPurchaseOrderBuilder', () => ({ default: () => null }));
vi.mock('../../components/SupplierOrderPrintView', () => ({ default: () => null }));
vi.mock('../../components/suppliers/SupplierReceiptModal', () => ({ default: () => null }));
vi.mock('../../components/suppliers/SupplierDetailsModal', () => ({ default: () => null }));
vi.mock('../../hooks/api/useOrders', () => ({ useCustomers: () => ({ data: [] }), useOrdersWithItems: () => ({ data: [] }) }));
vi.mock('../../hooks/api/useSuppliers', () => ({ useSuppliers: () => ({ data: state.suppliers }) }));
vi.mock('../../components/customers/useCustomerDirectory', () => ({ useCustomerDirectory: () => ({ directory: [], saveLocation: vi.fn(), canEditLocation: false }) }));
vi.mock('../../components/customers/useCustomerTerritory', () => ({ useAssortmentIndex: () => undefined }));
vi.mock('../../components/customers/useCustomerVatLookup', () => ({ useCustomerVatLookup: () => ({ isSearching: false }) }));
vi.mock('../../components/mobile/MobileSupplierDetails', () => ({ default: ({ onEditSupplier }: { onEditSupplier: () => void }) => <button onClick={onEditSupplier}>edit supplier</button> }));
vi.mock('../../components/mobile/MobileCustomerDetails', () => ({ default: () => null }));
// Tag each real card with its supplier id so the tests can see which cards render.
vi.mock('../../components/suppliers/SupplierCard', async importOriginal => {
    const original = await importOriginal<typeof import('../../components/suppliers/SupplierCard')>();
    const Card = original.default as React.ComponentType<any>;
    return { ...original, default: (props: any) => <div data-supplier-card={props.supplier.id}><Card {...props} /></div> };
});

const textOf = (node: Element | null = document.body) => node?.textContent ?? '';
const button = (label: string) => Array.from(document.body.querySelectorAll('button')).find(node => textOf(node).trim() === label)!;
const cards = () => Array.from(document.body.querySelectorAll<HTMLElement>('[data-supplier-card]'));
const cardIds = () => cards().map(card => card.dataset.supplierCard);
const click = (element: Element) => act(async () => { fireEvent.click(element); });
const fixture: Supplier[] = [
    { id: 'gold', name: 'Gold Market', kind: 'supplier' },
    { id: 'legacy', name: 'Κοκκινίδης Νίκος' },
    { id: 'vodafone', name: 'Vodafone', kind: 'utility' },
    { id: 'dei', name: 'ΔΕΗ', kind: 'utility' },
    { id: 'aade', name: 'ΑΑΔΕ', kind: 'service' },
];
async function mount(element: React.ReactElement) {
    await act(async () => { render(element); });
}
beforeEach(() => { state.suppliers = fixture; state.orders = []; state.save.mockReset(); state.invalidate.mockReset(); });
afterEach(cleanup);

describe('supplier and partner classification', () => {
    it('counts saved types separately and retains suppliers without a legacy kind', () => {
        expect(countSupplierKinds(fixture)).toEqual({ supplier: 2, utility: 2, service: 1, worker: 0, person: 0 });
        expect(countSupplierKinds()).toEqual({ supplier: 0, utility: 0, service: 0, worker: 0, person: 0 });
    });

    it('shows the correct supplier KPI, all five contacts, type badges, and a supplier filter', async () => {
        await mount(<SuppliersPage />);
        expect(cards()).toHaveLength(5);
        expect(Array.from(document.body.querySelectorAll('div')).some(node => textOf(node) === '2Προμηθευτές')).toBe(true);
        expect(button('Όλοι5').getAttribute('aria-pressed')).toBe('true');
        const vodafone = cards().find(card => card.dataset.supplierCard === 'vodafone')!;
        expect(textOf(vodafone)).toContain('Πάροχος');
        await click(button('Προμηθευτές2'));
        expect(cardIds().sort()).toEqual(['gold', 'legacy']);
        await click(button('Πάροχοι2'));
        expect(cardIds().sort()).toEqual(['dei', 'vodafone']);
        await click(button('Υπηρεσίες1'));
        expect(cardIds()).toEqual(['aade']);
    });

    it('includes people and workers and keeps search scoped to the selected type', async () => {
        state.suppliers = [...fixture, { id: 'person', name: 'Επαφή', kind: 'person' }, { id: 'worker', name: 'Τεχνίτης', kind: 'worker' }];
        await mount(<SuppliersPage />);
        expect(button('Πρόσωπα1')).toBeDefined();
        expect(button('Συνεργάτες1')).toBeDefined();
        await click(button('Πάροχοι2'));
        await act(async () => { fireEvent.change(document.body.querySelector('input')!, { target: { value: 'Vodafone' } }); });
        expect(cardIds()).toEqual(['vodafone']);
        await click(button('Προμηθευτές2'));
        expect(cards()).toHaveLength(0);
        expect(textOf()).toContain('Δεν βρέθηκαν επαφές.');
    });

    it('keeps the supplier selector available in an empty list', async () => {
        state.suppliers = [];
        await mount(<SuppliersPage />);
        expect(button('Προμηθευτές0')).toBeDefined();
        expect(button('Όλοι0')).toBeDefined();
    });

    it('edits a provider to a supplier without dropping existing contact fields', async () => {
        const onSave = vi.fn();
        const initial = { ...fixture[2], phone: '2100000000', iban: 'GR-test' };
        await mount(<SupplierFormModal initial={initial} existingSuppliers={fixture} onSave={onSave} onClose={() => {}} />);
        await click(button('Προμηθευτής'));
        await click(button('Αποθήκευση'));
        expect(onSave).toHaveBeenCalledWith({ ...initial, kind: 'supplier' });
    });

    it('filters mobile contacts by type and saves a changed type through the existing API', async () => {
        await mount(<MobileCustomers mode="suppliers" />);
        await click(button('Προμηθευτές 2'));
        expect(textOf()).toContain('Gold Market');
        expect(textOf()).not.toContain('Vodafone');
        await click(button('Πάροχοι 2'));
        expect(textOf()).toContain('Vodafone');
        expect(textOf()).toContain('ΔΕΗ');
        expect(textOf()).not.toContain('Gold Market');
        // Open the provider, then use the real mobile editor.
        const editButtons = Array.from(document.body.querySelectorAll('button')).filter(node => node.getAttribute('aria-label') === 'Προβολή προμηθευτή');
        await click(editButtons[0]);
        await click(button('edit supplier'));
        expect(document.body.querySelector('select')!.value).toBe('utility');
        await act(async () => { fireEvent.change(document.body.querySelector('select')!, { target: { value: 'supplier' } }); });
        await click(Array.from(document.body.querySelectorAll('button')).find(node => textOf(node).includes('Αποθήκευση'))!);
        expect(state.save).toHaveBeenCalledWith({ ...fixture[2], kind: 'supplier' });
        expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['suppliers'] });
    });
});
