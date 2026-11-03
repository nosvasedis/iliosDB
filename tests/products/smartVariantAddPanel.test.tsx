// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SmartVariantAddPanel from '../../components/ProductDetails/SmartVariantAddPanel';
import { Gender, PlatingType, ProductionType, type Product } from '../../types';

vi.mock('../../components/StoneCodeText', () => ({ default: ({ code }: { code: string }) => <span data-stone-code={code}>{code}</span> }));

const product = {
  sku: 'DA100', prefix: 'DA', category: 'Δαχτυλίδι', gender: Gender.Men,
  production_type: ProductionType.InHouse, plating_type: PlatingType.None,
  weight_g: 1, recipe: [], labor: {}, selling_price: 10,
} as Product;

let view: ReturnType<typeof render>;
afterEach(cleanup);

function mount(suffixes: string[] = []) {
  const props = {
    product, settings: { silver_price_gram: 2.5 }, allMaterials: [], allProducts: [],
    existingVariants: suffixes.map((suffix) => ({ suffix, description: suffix, stock_qty: 0 })),
    onAddVariants: vi.fn(), showToast: vi.fn(),
  };
  view = render(<SmartVariantAddPanel {...props} />);
  return props;
}

const textOf = (node: Element) => node.textContent || '';
const buttons = () => Array.from(view.container.querySelectorAll('button'));
const finish = (label: string) => buttons().find((b) => b.hasAttribute('aria-pressed') && textOf(b).startsWith(label) && !b.getAttribute('aria-label'));
const stone = (name: string) => buttons().find((b) => b.getAttribute('aria-label') === `Πέτρα ${name}`);
const plain = () => buttons().find((b) => textOf(b).includes('Σκέτο μέταλλο'))!;
const createButton = () => buttons().find((b) => textOf(b).includes('Δημιουργία'))!;
const selectAllButton = () => buttons().find((b) => b.title.startsWith('Επιλογή όλων'))!;
const pressed = (b: Element) => b.getAttribute('aria-pressed') === 'true';
const created = (props: ReturnType<typeof mount>, call = 0) => props.onAddVariants.mock.calls[call][0].map((v: any) => v.suffix);
const visibleStoneCodes = () => Array.from(view.container.querySelectorAll('[data-stone-code]')).map((s) => s.getAttribute('data-stone-code'));

describe('registry smart variant add', () => {
  it('starts without a finish and creates plain lustre once one is picked', () => {
    const props = mount();
    expect(createButton().disabled).toBe(true);
    fireEvent.click(finish('Λουστρέ')!);
    expect(createButton().disabled).toBe(false);
    fireEvent.click(createButton());
    expect(created(props)).toEqual(['']);
  });

  it('creates every finish × stone combination for several stones at once', () => {
    const props = mount();
    fireEvent.click(finish('Πατίνα')!);
    fireEvent.click(finish('Επίχρυσο')!);
    fireEvent.click(plain());
    fireEvent.click(stone('Μάτι Τίγρης')!);
    fireEvent.click(stone('Όνυχας')!);
    fireEvent.click(createButton());
    expect(created(props).sort()).toEqual(['PQN', 'PTG', 'XQN', 'XTG']);
  });

  it('treats plain metal and stones as mutually exclusive', () => {
    const props = mount();
    fireEvent.click(finish('Επίχρυσο')!);
    expect(pressed(plain())).toBe(true);
    fireEvent.click(stone('Μάτι Τίγρης')!);
    expect(pressed(plain())).toBe(false);
    fireEvent.click(createButton());
    expect(created(props)).toEqual(['XTG']);
    fireEvent.click(stone('Όνυχας')!);
    fireEvent.click(plain());
    expect(pressed(stone('Όνυχας')!)).toBe(false);
    expect(pressed(plain())).toBe(true);
  });

  it('skips combinations that already exist', () => {
    const props = mount(['XTG']);
    fireEvent.click(finish('Πατίνα')!);
    fireEvent.click(finish('Επίχρυσο')!);
    fireEvent.click(plain());
    fireEvent.click(stone('Μάτι Τίγρης')!);
    fireEvent.click(createButton());
    expect(created(props)).toEqual(['PTG']);
  });

  it('selects all stones of the active group with one click', () => {
    const props = mount();
    fireEvent.click(finish('Λουστρέ')!);
    fireEvent.click(plain());
    const suleman = buttons().find((b) => textOf(b).startsWith('Σουλεμάνηδες'))!;
    fireEvent.click(suleman);
    fireEvent.click(selectAllButton());
    fireEvent.click(createButton());
    expect(created(props).sort()).toEqual(['BSU', 'GSU', 'RSU']);
  });

  it('hides stones whose every finish already exists', () => {
    mount(['TG', 'PTG', 'DTG', 'XTG', 'HTG']);
    expect(visibleStoneCodes()).not.toContain('TG');
    expect(visibleStoneCodes()).toContain('QN');
  });

  it('adds a fully typed suffix and rejects an existing one', () => {
    const props = mount(['XTG']);
    fireEvent.click(buttons().find((b) => textOf(b).includes('Χειροκίνητη προσθήκη'))!);
    const suffixInput = () => view.getByLabelText('Πλήρες suffix');
    const form = () => view.container.querySelector('form')!;
    fireEvent.change(suffixInput(), { target: { value: 'XTG' } });
    fireEvent.submit(form());
    expect(props.onAddVariants).not.toHaveBeenCalled();
    fireEvent.change(suffixInput(), { target: { value: 'PTG' } });
    fireEvent.submit(form());
    expect(created(props)).toEqual(['PTG']);
  });
});
