import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BatchPrintPage from '../../components/BatchPrintPage';
import MobileBatchPrint from '../../components/mobile/MobileBatchPrint';
import OffersPage from '../../components/OffersPage';
import BarcodeView from '../../components/BarcodeView';
import { INITIAL_SETTINGS } from '../../constants';
import { Gender, PlatingType, ProductionType, type Product } from '../../types';

const { showToast } = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock('../../components/UIProvider', () => ({ useUI: () => ({ showToast, confirm: vi.fn() }) }));
vi.mock('../../lib/supabase', () => ({
  api: {}, CLOUDFLARE_WORKER_URL: '', AUTH_KEY_SECRET: '', RETAIL_CUSTOMER_ID: 'retail', RETAIL_CUSTOMER_NAME: 'Λιανική',
}));
vi.mock('../../lib/gemini', () => ({ extractSkusFromImage: vi.fn() }));
vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: {}, getDocument: vi.fn() }));
vi.mock('../../components/BarcodeScanner', () => ({ default: () => null }));
vi.mock('../../components/BarcodeView', () => ({ default: () => null }));
vi.mock('../../components/inventory/InventoryAvailabilityNote', () => ({ default: () => null }));
vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: any) => ({
    data: queryKey[0] === 'settings' ? INITIAL_SETTINGS : queryKey[0] === 'products' ? products : [],
    isLoading: false,
  }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

const products = ['DA10', 'DA11'].map(sku => ({
  sku, prefix: 'DA', category: 'Δαχτυλίδι', gender: Gender.Women,
  production_type: ProductionType.InHouse, plating_type: PlatingType.None,
  weight_g: 1, recipe: [], labor: {}, selling_price: 10,
  variants: [{ suffix: 'X', description: 'Επίχρυσο', stock_qty: 0 }],
})) as Product[];

let view: ReactTestRenderer;
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.stubGlobal('window', { setTimeout, clearTimeout });
  const stored = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
  });
});
afterEach(() => {
  act(() => view?.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

type Surface = 'desktop' | 'mobile' | 'offers';
function mount(surface: Surface, skusText = '') {
  const setSkusText = vi.fn();
  const setPrintItems = vi.fn();
  act(() => {
    view = create(surface === 'desktop'
      ? <BatchPrintPage allProducts={products} allCollections={[]} skusText={skusText} setSkusText={setSkusText} setPrintItems={setPrintItems} onPrintPhotoCatalog={vi.fn()} />
      : surface === 'mobile' ? <MobileBatchPrint />
        : <OffersPage products={products} materials={[]} collections={[]} settings={INITIAL_SETTINGS} onPrintOffer={vi.fn()} />);
  });
  if (surface === 'offers') {
    act(() => view.root.findAllByType('button').find(button => button.children.includes(' Νέα Προσφορά'))!.props.onClick());
  }
  return { setSkusText, setPrintItems };
}
const skuInput = () => view.root.findAllByType('input').find(input => input.props.placeholder?.startsWith('Πληκτρολογήστε') || input.props.placeholder === 'π.χ. DA100 ή 1005...')!;
const qtyInput = () => view.root.findAllByType('input').find(input => input.props.type === 'number' && input.props.className.includes('font-black text-xl'))!;
function enter(key = 'Enter', modifiers = {}) {
  return { key, ctrlKey: false, metaKey: false, preventDefault: vi.fn(), ...modifiers };
}

describe.each<Surface>(['desktop', 'mobile', 'offers'])('%s smart entry keyboard', surface => {
  it.each(['quantity', 'sku', 'button'])('adds the entered quantity once using %s', source => {
    const { setSkusText } = mount(surface);
    act(() => skuInput().props.onChange({ target: { value: 'DA10X' } }));
    act(() => qtyInput().props.onChange({ target: { value: '7' } }));
    act(() => {
      if (source === 'button') {
        view.root.findAllByType('button').find(button => button.props.className?.includes('h-[58px]') || button.children.includes(' Προσθήκη'))!.props.onClick();
      } else {
        (source === 'quantity' ? qtyInput() : skuInput()).props.onKeyDown(enter());
      }
    });
    expect(skuInput().props.value).toBe('');
    expect(showToast).toHaveBeenCalledTimes(1);
    if (surface === 'desktop') {
      expect(setSkusText).toHaveBeenCalledExactlyOnceWith('DA10X 7');
      expect(qtyInput().props.value).toBe(1);
    } else if (surface === 'offers') {
      expect(view.root.findAllByType('input').some(input => input.props.type === 'number' && input.props.value === 7)).toBe(true);
      expect(qtyInput().props.value).toBe(1);
    } else {
      expect(view.root.findAllByType('span').some(span => span.children.join('') === 'x7')).toBe(true);
    }
  });

  it('keeps range expansion and applies the quantity to every entry', () => {
    const { setSkusText } = mount(surface);
    act(() => skuInput().props.onChange({ target: { value: 'DA10X-DA11X' } }));
    act(() => qtyInput().props.onChange({ target: { value: '3' } }));
    const event = enter();
    act(() => qtyInput().props.onKeyDown(event));
    expect(event.preventDefault).toHaveBeenCalledOnce();
    if (surface === 'desktop') expect(setSkusText).toHaveBeenCalledExactlyOnceWith('DA10X 3\nDA11X 3');
    else if (surface === 'offers') expect(view.root.findAllByType('input').filter(input => input.props.type === 'number' && input.props.value === 3)).toHaveLength(2);
    else expect(view.root.findAllByType('span').filter(span => span.children.join('') === 'x3')).toHaveLength(2);
  });

  it('leaves other keys alone and preserves invalid SKU feedback', () => {
    const { setSkusText } = mount(surface);
    act(() => skuInput().props.onChange({ target: { value: 'UNKNOWN' } }));
    const arrow = enter('ArrowUp');
    act(() => qtyInput().props.onKeyDown(arrow));
    expect(arrow.preventDefault).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
    act(() => qtyInput().props.onKeyDown(enter()));
    expect(skuInput().props.value).toBe(surface === 'offers' ? '' : 'UNKNOWN');
    expect(setSkusText).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(expect.any(String), 'error');
  });
});

describe('desktop batch print shortcut', () => {
  it('passes an inline size and quantity to the label renderer from the text queue', () => {
    const { setPrintItems } = mount('desktop', 'DA10X-52 62\nDA11X-54 2\nDA10X-99 1');
    act(() => qtyInput().props.onKeyDown(enter('Enter', { ctrlKey: true })));
    act(() => vi.runAllTimers());
    expect(setPrintItems).toHaveBeenCalledExactlyOnceWith([
      expect.objectContaining({ product: products[0], size: '52', quantity: 62 }),
      expect.objectContaining({ product: products[1], size: '54', quantity: 2 }),
    ]);
  });
  it.each(['sku', 'quantity'])('preserves Ctrl/Cmd+Enter printing from %s without adding the draft', source => {
    for (const modifiers of [{ ctrlKey: true }, { metaKey: true }]) {
      const { setSkusText, setPrintItems } = mount('desktop', 'DA11X 2');
      act(() => skuInput().props.onChange({ target: { value: 'DA10X' } }));
      const event = enter('Enter', modifiers);
      act(() => (source === 'sku' ? skuInput() : qtyInput()).props.onKeyDown(event));
      act(() => vi.runAllTimers());
      expect(event.preventDefault).toHaveBeenCalledOnce();
      expect(setSkusText).not.toHaveBeenCalled();
      expect(setPrintItems).toHaveBeenCalledExactlyOnceWith([expect.objectContaining({ product: products[1], quantity: 2 })]);
      act(() => view.unmount());
    }
  });
});

describe.each<Surface>(['desktop', 'mobile'])('%s sized smart entry', surface => {
  it('highlights the size and adds the requested quantity', () => {
    const { setSkusText } = mount(surface);
    act(() => skuInput().props.onChange({ target: { value: 'DA10X-52' } }));
    expect(view.root.findByProps({ title: 'Μέγεθος 52' }).props.className).toContain('text-blue-600');
    act(() => qtyInput().props.onChange({ target: { value: '62' } }));
    act(() => qtyInput().props.onKeyDown(enter()));
    if (surface === 'desktop') expect(setSkusText).toHaveBeenCalledExactlyOnceWith('DA10X-52 62');
    else {
      act(() => skuInput().props.onChange({ target: { value: 'DA10X-54' } }));
      act(() => qtyInput().props.onKeyDown(enter()));
      act(() => view.root.findAllByType('button').find(b => b.children.includes(' Προεπισκόπηση & Εκτύπωση'))!.props.onClick());
      const labels = view.root.findAllByType(BarcodeView);
      expect(labels.filter(label => label.props.size === '52')).toHaveLength(62);
      expect(labels.filter(label => label.props.size === '54')).toHaveLength(1);
    }
  });
});
