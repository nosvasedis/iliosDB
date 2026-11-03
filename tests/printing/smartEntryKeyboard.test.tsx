// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BatchPrintPage from '../../components/BatchPrintPage';
import MobileBatchPrint from '../../components/mobile/MobileBatchPrint';
import OffersPage from '../../components/OffersPage';
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
vi.mock('../../components/BarcodeView', () => ({ default: ({ size }: { size?: string }) => <span data-barcode-size={size ?? ''} /> }));
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

let view: ReturnType<typeof render>;
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

type Surface = 'desktop' | 'mobile' | 'offers';
function mount(surface: Surface, skusText = '') {
  const setSkusText = vi.fn();
  const setPrintItems = vi.fn();
  view = render(surface === 'desktop'
    ? <BatchPrintPage allProducts={products} allCollections={[]} skusText={skusText} setSkusText={setSkusText} setPrintItems={setPrintItems} onPrintPhotoCatalog={vi.fn()} />
    : surface === 'mobile' ? <MobileBatchPrint />
      : <OffersPage products={products} materials={[]} collections={[]} settings={INITIAL_SETTINGS} onPrintOffer={vi.fn()} />);
  if (surface === 'offers') {
    fireEvent.click(buttons().find(button => (button.textContent ?? '').includes('Νέα Προσφορά'))!);
  }
  return { setSkusText, setPrintItems };
}
const buttons = () => Array.from(view.container.querySelectorAll('button'));
const inputs = () => Array.from(view.container.querySelectorAll('input'));
const spans = () => Array.from(view.container.querySelectorAll('span'));
const skuInput = () => inputs().find(input => input.placeholder?.startsWith('Πληκτρολογήστε') || input.placeholder === 'π.χ. DA100 ή 1005...')!;
const qtyInput = () => inputs().find(input => input.type === 'number' && input.className.includes('font-black text-xl'))!;
const type = (input: HTMLInputElement, value: string) => fireEvent.change(input, { target: { value } });
/** Returns true when the handler called preventDefault. */
function press(input: HTMLInputElement, key = 'Enter', modifiers = {}) {
  return !fireEvent.keyDown(input, { key, ctrlKey: false, metaKey: false, ...modifiers });
}

describe.each<Surface>(['desktop', 'mobile', 'offers'])('%s smart entry keyboard', surface => {
  it.each(['quantity', 'sku', 'button'])('adds the entered quantity once using %s', source => {
    const { setSkusText } = mount(surface);
    type(skuInput(), 'DA10X');
    type(qtyInput(), '7');
    if (source === 'button') {
      fireEvent.click(buttons().find(button => button.className.includes('h-[58px]') || (button.textContent ?? '').includes(' Προσθήκη'))!);
    } else {
      press(source === 'quantity' ? qtyInput() : skuInput());
    }
    expect(skuInput().value).toBe('');
    expect(showToast).toHaveBeenCalledTimes(1);
    if (surface === 'desktop') {
      expect(setSkusText).toHaveBeenCalledExactlyOnceWith('DA10X 7');
      expect(qtyInput().value).toBe('1');
    } else if (surface === 'offers') {
      expect(inputs().some(input => input.type === 'number' && input.value === '7')).toBe(true);
      expect(qtyInput().value).toBe('1');
    } else {
      expect(spans().some(span => span.textContent === 'x7')).toBe(true);
    }
  });

  it('keeps range expansion and applies the quantity to every entry', () => {
    const { setSkusText } = mount(surface);
    type(skuInput(), 'DA10X-DA11X');
    type(qtyInput(), '3');
    expect(press(qtyInput())).toBe(true);
    if (surface === 'desktop') expect(setSkusText).toHaveBeenCalledExactlyOnceWith('DA10X 3\nDA11X 3');
    else if (surface === 'offers') expect(inputs().filter(input => input.type === 'number' && input.value === '3')).toHaveLength(2);
    else expect(spans().filter(span => span.textContent === 'x3')).toHaveLength(2);
  });

  it('leaves other keys alone and preserves invalid SKU feedback', () => {
    const { setSkusText } = mount(surface);
    type(skuInput(), 'UNKNOWN');
    expect(press(qtyInput(), 'ArrowUp')).toBe(false);
    expect(showToast).not.toHaveBeenCalled();
    press(qtyInput());
    expect(skuInput().value).toBe(surface === 'offers' ? '' : 'UNKNOWN');
    expect(setSkusText).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(expect.any(String), 'error');
  });
});

describe('desktop batch print shortcut', () => {
  it('passes an inline size and quantity to the label renderer from the text queue', () => {
    const { setPrintItems } = mount('desktop', 'DA10X-52 62\nDA11X-54 2\nDA10X-99 1');
    press(qtyInput(), 'Enter', { ctrlKey: true });
    act(() => vi.runAllTimers());
    expect(setPrintItems).toHaveBeenCalledExactlyOnceWith([
      expect.objectContaining({ product: products[0], size: '52', quantity: 62 }),
      expect.objectContaining({ product: products[1], size: '54', quantity: 2 }),
    ]);
  });
  it.each(['sku', 'quantity'])('preserves Ctrl/Cmd+Enter printing from %s without adding the draft', source => {
    for (const modifiers of [{ ctrlKey: true }, { metaKey: true }]) {
      const { setSkusText, setPrintItems } = mount('desktop', 'DA11X 2');
      type(skuInput(), 'DA10X');
      const prevented = press(source === 'sku' ? skuInput() : qtyInput(), 'Enter', modifiers);
      act(() => vi.runAllTimers());
      expect(prevented).toBe(true);
      expect(setSkusText).not.toHaveBeenCalled();
      expect(setPrintItems).toHaveBeenCalledExactlyOnceWith([expect.objectContaining({ product: products[1], quantity: 2 })]);
      view.unmount();
    }
  });
});

describe.each<Surface>(['desktop', 'mobile'])('%s sized smart entry', surface => {
  it('highlights the size and adds the requested quantity', () => {
    const { setSkusText } = mount(surface);
    type(skuInput(), 'DA10X-52');
    expect(view.container.querySelector('[title="Μέγεθος 52"]')!.className).toContain('text-blue-600');
    type(qtyInput(), '62');
    press(qtyInput());
    if (surface === 'desktop') expect(setSkusText).toHaveBeenCalledExactlyOnceWith('DA10X-52 62');
    else {
      type(skuInput(), 'DA10X-54');
      press(qtyInput());
      fireEvent.click(buttons().find(b => (b.textContent ?? '').includes(' Προεπισκόπηση & Εκτύπωση'))!);
      const labels = Array.from(document.body.querySelectorAll('[data-barcode-size]'));
      expect(labels.filter(label => label.getAttribute('data-barcode-size') === '52')).toHaveLength(62);
      expect(labels.filter(label => label.getAttribute('data-barcode-size') === '54')).toHaveLength(1);
    }
  });
});
