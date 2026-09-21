import { describe, expect, it } from 'vitest';
import {
  Gender,
  Material,
  MaterialType,
  PlatingType,
  Product,
  ProductionType,
} from '../../types';
import { resolveInvoiceTotalWeight } from '../../utils/invoiceTotalWeight';

function makeProduct(sku: string, overrides: Partial<Product> = {}): Product {
  return {
    sku,
    prefix: sku.slice(0, 3),
    category: 'Δαχτυλίδι',
    gender: Gender.Unisex,
    image_url: null,
    weight_g: 1,
    secondary_weight_g: 0,
    invoice_total_weight_g: null,
    plating_type: PlatingType.None,
    production_type: ProductionType.InHouse,
    active_price: 0,
    draft_price: 0,
    selling_price: 0,
    stock_qty: 0,
    sample_qty: 0,
    molds: [],
    is_component: sku.startsWith('STX'),
    variants: [],
    recipe: [],
    labor: {
      casting_cost: 0,
      setter_cost: 0,
      technician_cost: 0,
      stone_setting_cost: 0,
      plating_cost_x: 0,
      plating_cost_d: 0,
      subcontract_cost: 0,
    },
    ...overrides,
  };
}

function makeMaterial(id: string, unitWeight: number | null): Material {
  return {
    id,
    name: `Υλικό ${id}`,
    type: MaterialType.Component,
    cost_per_unit: 0,
    unit: 'τεμ',
    unit_weight_g: unitWeight,
  };
}

describe('invoice total weight', () => {
  it('uses primary plus secondary weight for a product without a recipe', () => {
    const product = makeProduct('R1', { weight_g: 4, secondary_weight_g: 1.5 });
    expect(resolveInvoiceTotalWeight(product)).toEqual({
      value: 5.5,
      source: 'automatic',
      missingItems: [],
    });
  });

  it('adds known material weights and accepts an explicit zero-weight material', () => {
    const product = makeProduct('R2', {
      weight_g: 2,
      recipe: [
        { type: 'raw', id: 'm1', quantity: 3 },
        { type: 'raw', id: 'm0', quantity: 7 },
      ],
    });
    expect(resolveInvoiceTotalWeight(product, [product], [makeMaterial('m1', 0.25), makeMaterial('m0', 0)])).toEqual({
      value: 2.75,
      source: 'automatic',
      missingItems: [],
    });
  });

  it('adds STX weights recursively, including their own recipes', () => {
    const nested = makeProduct('STX2', {
      weight_g: 0.5,
      recipe: [{ type: 'raw', id: 'm1', quantity: 2 }],
    });
    const component = makeProduct('STX1', {
      weight_g: 1,
      secondary_weight_g: 0.2,
      recipe: [{ type: 'component', sku: 'STX2', quantity: 2 }],
    });
    const product = makeProduct('R3', {
      weight_g: 2,
      recipe: [{ type: 'component', sku: 'STX1', quantity: 3 }],
    });

    expect(resolveInvoiceTotalWeight(product, [product, component, nested], [makeMaterial('m1', 0.1)])).toEqual({
      value: 9.8,
      source: 'automatic',
      missingItems: [],
    });
  });

  it('keeps a positive manual override authoritative until it is cleared', () => {
    const product = makeProduct('R4', {
      weight_g: 2,
      invoice_total_weight_g: 9.25,
      recipe: [{ type: 'raw', id: 'unknown', quantity: 1 }],
    });
    expect(resolveInvoiceTotalWeight(product).source).toBe('manual');
    expect(resolveInvoiceTotalWeight(product).value).toBe(9.25);

    const automatic = resolveInvoiceTotalWeight({ ...product, invoice_total_weight_g: null }, [product], []);
    expect(automatic.source).toBe('missing');
    expect(automatic.value).toBeNull();
  });

  it('marks unknown material weights as incomplete', () => {
    const product = makeProduct('R5', {
      recipe: [{ type: 'raw', id: 'm1', quantity: 1 }],
    });
    const result = resolveInvoiceTotalWeight(product, [product], [makeMaterial('m1', null)]);
    expect(result.value).toBeNull();
    expect(result.source).toBe('missing');
    expect(result.missingItems).toContain('Υλικό Υλικό m1: λείπει βάρος μονάδας');
  });

  it('detects circular component recipes without recursing forever', () => {
    const first = makeProduct('STXA', {
      recipe: [{ type: 'component', sku: 'STXB', quantity: 1 }],
    });
    const second = makeProduct('STXB', {
      recipe: [{ type: 'component', sku: 'STXA', quantity: 1 }],
    });
    const result = resolveInvoiceTotalWeight(first, [first, second], []);
    expect(result.value).toBeNull();
    expect(result.source).toBe('missing');
    expect(result.missingItems).toContain('Κυκλική συνταγή: STXA');
  });
});
