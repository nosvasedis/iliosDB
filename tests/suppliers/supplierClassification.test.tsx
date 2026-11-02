import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Supplier } from '../../types';
import SuppliersPage from '../../components/SuppliersPage';
import SupplierFormModal from '../../components/suppliers/SupplierFormModal';
import SupplierCard from '../../components/suppliers/SupplierCard';
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

const roots: ReturnType<typeof create>[] = [];
const textOf = (node: ReactTestInstance): string => node.children.map(child => typeof child === 'string' ? child : textOf(child)).join('');
const button = (root: ReactTestInstance, label: string) => root.findAllByType('button').find(node => textOf(node).trim() === label)!;
const fixture: Supplier[] = [
    { id: 'gold', name: 'Gold Market', kind: 'supplier' },
    { id: 'legacy', name: 'Κοκκινίδης Νίκος' },
    { id: 'vodafone', name: 'Vodafone', kind: 'utility' },
    { id: 'dei', name: 'ΔΕΗ', kind: 'utility' },
    { id: 'aade', name: 'ΑΑΔΕ', kind: 'service' },
];
async function mount(element: React.ReactElement) {
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(element); roots.push(renderer); });
    return renderer;
}
beforeEach(() => { state.suppliers = fixture; state.orders = []; state.save.mockReset(); state.invalidate.mockReset(); });
afterEach(async () => { await act(async () => roots.splice(0).forEach(root => root.unmount())); });

describe('supplier and partner classification', () => {
    it('counts saved types separately and retains suppliers without a legacy kind', () => {
        expect(countSupplierKinds(fixture)).toEqual({ supplier: 2, utility: 2, service: 1, worker: 0, person: 0 });
        expect(countSupplierKinds()).toEqual({ supplier: 0, utility: 0, service: 0, worker: 0, person: 0 });
    });

    it('shows the correct supplier KPI, all five contacts, type badges, and a supplier filter', async () => {
        const { root } = await mount(<SuppliersPage />);
        expect(root.findAllByType(SupplierCard)).toHaveLength(5);
        expect(root.findAllByType('div').some(node => textOf(node) === '2Προμηθευτές')).toBe(true);
        expect(button(root, 'Όλοι5').props['aria-pressed']).toBe(true);
        const vodafone = root.findAllByType(SupplierCard).find(card => card.props.supplier.id === 'vodafone')!;
        expect(textOf(vodafone)).toContain('Πάροχος');
        await act(async () => button(root, 'Προμηθευτές2').props.onClick());
        expect(root.findAllByType(SupplierCard).map(card => card.props.supplier.id).sort()).toEqual(['gold', 'legacy']);
        await act(async () => button(root, 'Πάροχοι2').props.onClick());
        expect(root.findAllByType(SupplierCard).map(card => card.props.supplier.id).sort()).toEqual(['dei', 'vodafone']);
        await act(async () => button(root, 'Υπηρεσίες1').props.onClick());
        expect(root.findAllByType(SupplierCard).map(card => card.props.supplier.id)).toEqual(['aade']);
    });

    it('includes people and workers and keeps search scoped to the selected type', async () => {
        state.suppliers = [...fixture, { id: 'person', name: 'Επαφή', kind: 'person' }, { id: 'worker', name: 'Τεχνίτης', kind: 'worker' }];
        const { root } = await mount(<SuppliersPage />);
        expect(button(root, 'Πρόσωπα1')).toBeDefined();
        expect(button(root, 'Συνεργάτες1')).toBeDefined();
        await act(async () => button(root, 'Πάροχοι2').props.onClick());
        await act(async () => root.findByType('input').props.onChange({ target: { value: 'Vodafone' } }));
        expect(root.findAllByType(SupplierCard).map(card => card.props.supplier.id)).toEqual(['vodafone']);
        await act(async () => button(root, 'Προμηθευτές2').props.onClick());
        expect(root.findAllByType(SupplierCard)).toHaveLength(0);
        expect(textOf(root)).toContain('Δεν βρέθηκαν επαφές.');
    });

    it('keeps the supplier selector available in an empty list', async () => {
        state.suppliers = [];
        const { root } = await mount(<SuppliersPage />);
        expect(button(root, 'Προμηθευτές0')).toBeDefined();
        expect(button(root, 'Όλοι0')).toBeDefined();
    });

    it('edits a provider to a supplier without dropping existing contact fields', async () => {
        const onSave = vi.fn();
        const initial = { ...fixture[2], phone: '2100000000', iban: 'GR-test' };
        const { root } = await mount(<SupplierFormModal initial={initial} existingSuppliers={fixture} onSave={onSave} onClose={() => {}} />);
        await act(async () => button(root, 'Προμηθευτής').props.onClick());
        await act(async () => button(root, 'Αποθήκευση').props.onClick());
        expect(onSave).toHaveBeenCalledWith({ ...initial, kind: 'supplier' });
    });

    it('filters mobile contacts by type and saves a changed type through the existing API', async () => {
        const { root } = await mount(<MobileCustomers mode="suppliers" />);
        await act(async () => button(root, 'Προμηθευτές 2').props.onClick());
        expect(textOf(root)).toContain('Gold Market');
        expect(textOf(root)).not.toContain('Vodafone');
        await act(async () => button(root, 'Πάροχοι 2').props.onClick());
        expect(textOf(root)).toContain('Vodafone');
        expect(textOf(root)).toContain('ΔΕΗ');
        expect(textOf(root)).not.toContain('Gold Market');
        // Open the provider, then use the real mobile editor.
        const editButtons = root.findAllByType('button').filter(node => node.props['aria-label'] === 'Προβολή προμηθευτή');
        await act(async () => editButtons[0].props.onClick({ stopPropagation() {} }));
        await act(async () => button(root, 'edit supplier').props.onClick());
        expect(root.findByType('select').props.value).toBe('utility');
        await act(async () => root.findByType('select').props.onChange({ target: { value: 'supplier' } }));
        await act(async () => root.findAllByType('button').find(node => textOf(node).includes('Αποθήκευση'))!.props.onClick());
        expect(state.save).toHaveBeenCalledWith({ ...fixture[2], kind: 'supplier' });
        expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['suppliers'] });
    });
});
