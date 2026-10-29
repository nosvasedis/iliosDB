import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SmartVariantAddPanel from '../../components/ProductDetails/SmartVariantAddPanel';
import StoneCodeText from '../../components/StoneCodeText';
import { Gender, PlatingType, ProductionType, type Product } from '../../types';

const product = {
  sku: 'DA100', prefix: 'DA', category: 'Δαχτυλίδι', gender: Gender.Men,
  production_type: ProductionType.InHouse, plating_type: PlatingType.None,
  weight_g: 1, recipe: [], labor: {}, selling_price: 10,
} as Product;

let renderer: ReactTestRenderer;
afterEach(() => act(() => renderer?.unmount()));

function mount(suffixes: string[] = []) {
  const props = {
    product, settings: { silver_price_gram: 2.5 }, allMaterials: [], allProducts: [],
    existingVariants: suffixes.map((suffix) => ({ suffix, description: suffix, stock_qty: 0 })),
    onAddVariants: vi.fn(), showToast: vi.fn(),
  };
  act(() => { renderer = create(<SmartVariantAddPanel {...props} />); });
  return props;
}

const textOf = (node: any): string =>
  (node.children || []).map((child: any) => (typeof child === 'string' ? child : textOf(child))).join('');
const buttons = () => renderer.root.findAllByType('button');
const finish = (label: string) => buttons().find((b) => 'aria-pressed' in b.props && textOf(b).startsWith(label) && !b.props['aria-label']);
const stone = (name: string) => buttons().find((b) => b.props['aria-label'] === `Πέτρα ${name}`);
const plain = () => buttons().find((b) => textOf(b).includes('Σκέτο μέταλλο'))!;
const createButton = () => buttons().find((b) => textOf(b).includes('Δημιουργία'))!;
const selectAllButton = () => buttons().find((b) => typeof b.props.title === 'string' && b.props.title.startsWith('Επιλογή όλων'))!;
const created = (props: ReturnType<typeof mount>, call = 0) => props.onAddVariants.mock.calls[call][0].map((v: any) => v.suffix);
const visibleStoneCodes = () => renderer.root.findAllByType(StoneCodeText).map((s) => s.props.code);

describe('registry smart variant add', () => {
  it('starts without a finish and creates plain lustre once one is picked', () => {
    const props = mount();
    expect(createButton().props.disabled).toBe(true);
    act(() => finish('Λουστρέ')!.props.onClick());
    expect(createButton().props.disabled).toBe(false);
    act(() => createButton().props.onClick());
    expect(created(props)).toEqual(['']);
  });

  it('creates every finish × stone combination for several stones at once', () => {
    const props = mount();
    act(() => finish('Πατίνα')!.props.onClick());
    act(() => finish('Επίχρυσο')!.props.onClick());
    act(() => plain().props.onClick());
    act(() => stone('Μάτι Τίγρης')!.props.onClick());
    act(() => stone('Όνυχας')!.props.onClick());
    act(() => createButton().props.onClick());
    expect(created(props).sort()).toEqual(['PQN', 'PTG', 'XQN', 'XTG']);
  });

  it('skips combinations that already exist', () => {
    const props = mount(['XTG']);
    act(() => finish('Πατίνα')!.props.onClick());
    act(() => finish('Επίχρυσο')!.props.onClick());
    act(() => plain().props.onClick());
    act(() => stone('Μάτι Τίγρης')!.props.onClick());
    act(() => createButton().props.onClick());
    expect(created(props)).toEqual(['PTG']);
  });

  it('selects all stones of the active group with one click', () => {
    const props = mount();
    act(() => finish('Λουστρέ')!.props.onClick());
    act(() => plain().props.onClick());
    const suleman = buttons().find((b) => textOf(b).startsWith('Σουλεμάνηδες'))!;
    act(() => suleman.props.onClick());
    act(() => selectAllButton().props.onClick());
    act(() => createButton().props.onClick());
    expect(created(props).sort()).toEqual(['BSU', 'GSU', 'RSU']);
  });

  it('hides stones whose every finish already exists', () => {
    mount(['TG', 'PTG', 'DTG', 'XTG', 'HTG']);
    expect(visibleStoneCodes()).not.toContain('TG');
    expect(visibleStoneCodes()).toContain('QN');
  });

  it('adds a fully typed suffix and rejects an existing one', () => {
    const props = mount(['XTG']);
    act(() => buttons().find((b) => textOf(b).includes('Χειροκίνητη προσθήκη'))!.props.onClick());
    const suffixInput = () => renderer.root.findAll((n) => n.type === 'input' && n.props['aria-label'] === 'Πλήρες suffix')[0];
    const form = () => renderer.root.findByType('form');
    act(() => suffixInput().props.onChange({ target: { value: 'XTG' } }));
    act(() => form().props.onSubmit({ preventDefault() {} }));
    expect(props.onAddVariants).not.toHaveBeenCalled();
    act(() => suffixInput().props.onChange({ target: { value: 'PTG' } }));
    act(() => form().props.onSubmit({ preventDefault() {} }));
    expect(created(props)).toEqual(['PTG']);
  });
});
