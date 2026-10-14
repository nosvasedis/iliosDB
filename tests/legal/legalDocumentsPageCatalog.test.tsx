import React from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Gender, PlatingType, ProductionType, type Product } from '../../types';
import type { LegalCatalogItem } from '../../features/inspection/types';

const mocks = vi.hoisted(() => ({
  loadLegalCatalog: vi.fn(), mutateAsync: vi.fn(), showToast: vi.fn(), confirm: vi.fn(),
  profile: { id: 'owner', role: 'admin', full_name: 'Owner', is_approved: true },
  emptyQuery: { data: [], isLoading: false, isError: false, isPending: false, refetch: vi.fn() },
}));
vi.mock('../../lib/supabase', () => ({ api: {}, supabase: {}, isLocalMode: false }));
vi.mock('../../components/AuthContext', () => ({ useAuth: () => ({ profile: mocks.profile }) }));
vi.mock('../../components/UIProvider', () => ({ useUI: () => ({ showToast: mocks.showToast, confirm: mocks.confirm }) }));
vi.mock('../../features/inspection/repository', () => ({ loadLegalCatalog: mocks.loadLegalCatalog, loadInspectionSnapshot: vi.fn() }));
vi.mock('../../hooks/api/useOrders', () => ({
  useOrdersWithItems: () => mocks.emptyQuery, useCustomers: () => mocks.emptyQuery,
  useAllShipments: () => mocks.emptyQuery, useAllShipmentItems: () => mocks.emptyQuery,
}));
vi.mock('../../hooks/api/useSellers', () => ({ useSellers: () => mocks.emptyQuery }));
vi.mock('../../hooks/api/useLegalDocuments', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  const result = { ...mocks.emptyQuery, mutateAsync: mocks.mutateAsync };
  return {
    ...Object.fromEntries(Object.keys(original).map((name) => [name, () => result])),
    useLegalSettings: () => ({ data: undefined }),
    useAadeCredentialStatus: () => ({ data: undefined }),
  };
});
vi.mock('../../components/legal/SbzSettings', () => ({ default: () => null, useSbzStatus: () => ({ data: undefined }) }));
vi.mock('../../components/legal/SkuProductPicker', () => ({ default: () => <div data-testid="sku-picker" /> }));
import LegalDocumentsPage from '../../components/LegalDocumentsPage';
import SkuProductPicker from '../../components/legal/SkuProductPicker';
import { legalCatalogProducts } from '../../features/inspection/catalog';

const item: LegalCatalogItem = {
  sku: 'RN001', prefix: 'RN', category: 'Δαχτυλίδι', description: 'Δαχτυλίδι δοκιμής', image_url: null,
  gender: Gender.Unisex, plating_type: PlatingType.None, production_type: ProductionType.InHouse,
  is_component: false, skip_casting: false, weight_g: 5, secondary_weight_g: null,
  active_price: 50, selling_price: 100, selling_price_manual_override: false,
  resolved_invoice_weight: { value: 9, source: 'automatic', missingItems: [] },
  variants: [{ suffix: 'H', description: 'Επιπλατινωμένο', active_price: 55, selling_price: 120, selling_price_manual_override: false }],
};
const catalog = (saved = false) => ({ version: 1, items: [item], fetchedAt: '2026-10-14T10:00:00Z', saved });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe('legal document page catalog loading', () => {
  let client: QueryClient;
  let renderer: ReactTestRenderer | undefined;
  const page = (props: Partial<React.ComponentProps<typeof LegalDocumentsPage>> = {}) => (
    <QueryClientProvider client={client}><LegalDocumentsPage products={[]} onPrintLegalDocument={() => {}} {...props} /></QueryClientProvider>
  );
  const text = () => JSON.stringify(renderer!.toJSON());
  const content = (node: ReactTestInstance | string): string => typeof node === 'string'
    ? node : node.children.map(content).join('');
  const button = (label: string) => renderer!.root.findAllByType('button').find((node) =>
    content(node).includes(label),
  )!;
  async function settle(run: () => void | Promise<void>) {
    await act(async () => { await run(); await vi.advanceTimersByTimeAsync(5); });
  }
  async function mount(props: Parameters<typeof page>[0] = {}) {
    await settle(() => { renderer = create(page(props)); });
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mocks.loadLegalCatalog.mockReset();
    mocks.mutateAsync.mockRejectedValue(new Error('This render test must not issue or save a document'));
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    vi.stubGlobal('localStorage', { getItem: () => null });
    vi.stubGlobal('sessionStorage', { getItem: () => null });
  });
  afterEach(async () => {
    if (renderer) await act(async () => { renderer!.unmount(); });
    renderer = undefined;
    client.clear();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders the workspace when a pending server catalog arrives', async () => {
    const response = deferred<ReturnType<typeof catalog>>();
    mocks.loadLegalCatalog.mockReturnValue(response.promise);
    await mount();
    expect(text()).toContain('Ανάκτηση καταλόγου έκδοσης από τον server');
    expect(text()).not.toContain('Δημιουργία βήμα προς βήμα');
    await settle(() => { response.resolve(catalog()); });
    expect(text()).toContain('Δημιουργία βήμα προς βήμα');
    expect(text()).not.toContain('Ανανέωση καταλόγου');
    await settle(() => { button('Χειροκίνητα').props.onClick(); });
    await settle(() => { button('Έναρξη καταχώρισης').props.onClick(); });
    const picker = renderer!.root.findByType(SkuProductPicker);
    expect(picker.props.products.find((product: Product) => product.sku === item.sku)).toMatchObject({
      selling_price: 100, resolved_invoice_weight: { value: 9 }, variants: [{ suffix: 'H', selling_price: 120 }],
    });
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
  });

  it('renders immediately with a prefetched catalog', async () => {
    client.setQueryData(['legal_catalog', 'owner'], catalog());
    mocks.loadLegalCatalog.mockResolvedValue(catalog());
    await mount();
    expect(text()).toContain('Δημιουργία βήμα προς βήμα');
    expect(text()).not.toContain('Ανανέωση καταλόγου');
  });

  it('allows a failed catalog request to be retried without enabling creation prematurely', async () => {
    mocks.loadLegalCatalog.mockRejectedValueOnce(new Error('server unavailable')).mockResolvedValue(catalog());
    await mount();
    expect(text()).toContain('Δεν ανακτήθηκε ο κατάλογος έκδοσης');
    expect(text()).not.toContain('Δημιουργία βήμα προς βήμα');
    await settle(() => { button('Ανανέωση καταλόγου').props.onClick(); });
    expect(text()).toContain('Δημιουργία βήμα προς βήμα');
  });

  it('requires a fresh server catalog before creating from a saved copy', async () => {
    mocks.loadLegalCatalog.mockResolvedValueOnce(catalog(true)).mockResolvedValue(catalog());
    await mount();
    expect(text()).toContain('Χρησιμοποιείται αποθηκευμένος κατάλογος');
    expect(text()).not.toContain('Δημιουργία βήμα προς βήμα');
    await settle(() => { button('Ανανέωση καταλόγου').props.onClick(); });
    expect(text()).toContain('Δημιουργία βήμα προς βήμα');
  });

  it('keeps inspection creation gated and renders the supplied catalog once ready', async () => {
    await mount({ presentation: 'inspection', products: legalCatalogProducts([item]), inspectionCatalogReady: false });
    expect(text()).toContain('Για νέα δημιουργία απαιτούνται σύνδεση');
    expect(text()).not.toContain('Δημιουργία βήμα προς βήμα');
    await settle(() => { renderer!.update(page({ presentation: 'inspection', products: legalCatalogProducts([item]), inspectionCatalogReady: true })); });
    expect(text()).toContain('Δημιουργία βήμα προς βήμα');
    expect(mocks.loadLegalCatalog).not.toHaveBeenCalled();
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
  });
});
