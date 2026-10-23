import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SmartVariantAddPanel from '../../components/ProductDetails/SmartVariantAddPanel';
import StoneCodeText from '../../components/StoneCodeText';
import { Gender, PlatingType, ProductionType, type Product } from '../../types';

const product = {
  sku: 'DA100', prefix: 'DA', category: 'Δαχτυλίδι', gender: Gender.Unisex,
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

const finishButtons = () => renderer.root.findAllByType('button').filter((button) => 'aria-pressed' in button.props);
const finish = (label: string) => finishButtons().find((button) => button.children.includes(label));
const createButton = () => renderer.root.findAllByType('button').find((button) => button.children.includes('Δημιουργία'))!;
const stoneInput = () => renderer.root.findAllByType('input')[0];
const stoneOptions = () => renderer.root.findAllByType('option').map((option) => option.props.value);
const chooseStone = (code: string) => act(() => renderer.root.findByType('select').props.onChange({ target: { value: code } }));

describe('registry smart variant add', () => {
  it('starts without a finish and still allows manually selecting lustre', () => {
    const props = mount();
    expect(finishButtons().every((button) => button.props['aria-pressed'] === false)).toBe(true);
    expect(createButton().props.disabled).toBe(true);
    act(() => finish('Λουστρέ')!.props.onClick());
    expect(createButton().props.disabled).toBe(false);
    act(() => createButton().props.onClick());
    expect(props.onAddVariants.mock.calls[0][0].map((variant) => variant.suffix)).toEqual(['']);
  });

  it('hides existing plain finishes and filters by the full finish/stone combination', () => {
    mount(['', 'X', 'PTG']);
    expect(finish('Λουστρέ')).toBeUndefined();
    expect(finish('Επίχρυσο')).toBeUndefined();
    expect(finish('Πατίνα')).toBeDefined();
    chooseStone('TG');
    expect(finish('Πατίνα')).toBeUndefined();
    expect(finish('Λουστρέ')).toBeDefined();
    expect(finish('Επίχρυσο')).toBeDefined();
    expect(createButton().props.disabled).toBe(true);
  });

  it('offers a stone while any selected finish is missing and only creates that missing variant', () => {
    const props = mount(['XTG']);
    act(() => finish('Επίχρυσο')!.props.onClick());
    expect(stoneOptions()).not.toContain('TG');
    act(() => finish('Πατίνα')!.props.onClick());
    expect(stoneOptions()).toContain('TG');
    chooseStone('TG');
    expect(finish('Επίχρυσο')).toBeUndefined();
    expect(finish('Πατίνα')!.props['aria-pressed']).toBe(true);
    act(() => createButton().props.onClick());
    expect(props.onAddVariants.mock.calls[0][0].map((variant) => variant.suffix)).toEqual(['PTG']);
  });

  it('hides fully exhausted stones in both the dropdown and chips with no finish selected', () => {
    mount(['TG', 'PTG', 'DTG', 'XTG', 'HTG']);
    expect(stoneOptions()).not.toContain('TG');
    expect(renderer.root.findAllByType(StoneCodeText).some((stone) => stone.props.code === 'TG')).toBe(false);
    act(() => stoneInput().props.onChange({ target: { value: 'TG' } }));
    expect(finishButtons()).toHaveLength(0);
    expect(createButton().props.disabled).toBe(true);
  });

  it('refreshes the available combinations after a newly added variant reaches the modal', () => {
    const props = mount();
    act(() => finish('Επίχρυσο')!.props.onClick());
    chooseStone('TG');
    act(() => createButton().props.onClick());
    act(() => renderer.update(<SmartVariantAddPanel {...props} existingVariants={props.onAddVariants.mock.calls[0][0]} />));
    expect(stoneOptions()).not.toContain('TG');
    act(() => stoneInput().props.onChange({ target: { value: 'TG' } }));
    expect(finish('Επίχρυσο')).toBeUndefined();
    expect(finish('Πατίνα')).toBeDefined();
    expect(createButton().props.disabled).toBe(true);
  });

  it('allows advanced suffix entry without a selected finish and prevents existing suffixes', () => {
    const props = mount(['XTG']);
    act(() => renderer.root.findAllByType('button').find((button) => button.children.includes('Προχωρημένο: πλήρες suffix'))!.props.onClick());
    const advancedInput = () => renderer.root.findAllByType('input').at(-1)!;
    act(() => advancedInput().props.onChange({ target: { value: 'XTG' } }));
    expect(createButton().props.disabled).toBe(true);
    act(() => advancedInput().props.onChange({ target: { value: 'PTG' } }));
    expect(createButton().props.disabled).toBe(false);
    act(() => createButton().props.onClick());
    expect(props.onAddVariants.mock.calls[0][0].map((variant) => variant.suffix)).toEqual(['PTG']);
  });
});
