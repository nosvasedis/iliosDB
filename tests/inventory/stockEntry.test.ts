import { describe, expect, it } from 'vitest';
import type { Product } from '../../types';
import type { InventoryAvailability } from '../../features/inventory';
import {
  buildStockEntryPostingLines,
  countConsolidationWarnings,
  describeConsignmentDraw,
  parseStockEntryInput,
  planConsignmentDraw,
  planConsignmentDraws,
  stockSizeOptions,
  summarizeSizes,
} from '../../features/inventory/stockEntry';

const products = [
  { sku: 'RN001', prefix: 'RN', variants: [{ suffix: '' }, { suffix: 'P' }] },
  { sku: 'DA012', prefix: 'DA', variants: [{ suffix: 'D' }, { suffix: 'X' }] },
  { sku: 'BR001', prefix: 'BR', variants: [{ suffix: 'P' }] },
  { sku: 'SK001', prefix: 'SK', variants: [] },
] as unknown as Product[];

const CENTRAL = 'central';

function row(sizeInfo: string, onHand: number, reserved = 0, overrides: Partial<InventoryAvailability> = {}): InventoryAvailability {
  return {
    productSku: 'RN001', variantSuffix: 'P', sizeInfo, warehouseId: CENTRAL,
    warehouseName: 'Κεντρική', warehouseType: 'Central',
    onHand, reserved, available: onHand - reserved,
    incoming: 0, outstandingDemand: 0, productionDemand: 0, purchaseDemand: 0, projectedAvailable: 0,
    reorderPoint: 0, preferredSupplierId: null, updatedAt: '',
    ...overrides,
  };
}

describe('stock size options', () => {
  it('always offers «Χωρίς μέγεθος» first, also for rings and bracelets', () => {
    expect(stockSizeOptions(products[0])[0]).toBe('');
    expect(stockSizeOptions(products[0])).toContain('62');
    expect(stockSizeOptions(products[2])).toEqual(['', '17cm', '19cm', '21cm']);
    expect(stockSizeOptions(products[3])).toEqual(['']);
    expect(stockSizeOptions(products[2], ['18cm'])).toContain('18cm');
  });
});

describe('quick stock entry parsing', () => {
  it.each([
    ['RN001P', 'P', '', null],
    ['RN001P 62', 'P', '62', null],
    ['RN001P-62 x3', 'P', '62', 3],
    ['RN001P 62 4', 'P', '62', 4],
    ['RN001P62', 'P', '62', null],
    ['RN001P x2', 'P', '', 2],
    ['DA012D 3', 'D', '', 3],
    ['BR001P 19', 'P', '19cm', null],
    ['SK001 5', '', '', 5],
  ])('%s', (input, variant, size, quantity) => {
    const result = parseStockEntryInput(input, products);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entry.variantSuffix).toBe(variant);
    expect(result.entry.sizeInfo).toBe(size);
    expect(result.entry.quantity).toBe(quantity);
  });

  it('reports unknown codes and missing variants', () => {
    expect(parseStockEntryInput('ZZ999', products)).toMatchObject({ ok: false, reason: 'not-found' });
    expect(parseStockEntryInput('DA012', products)).toMatchObject({ ok: false, reason: 'needs-variant' });
    expect(parseStockEntryInput('  ', products)).toMatchObject({ ok: false, reason: 'empty' });
  });
});

describe('consignment draw plan (mirrors the handoff RPC)', () => {
  it('takes unsized first, then the largest sizes, then books the rest directly', () => {
    const plan = planConsignmentDraw(
      { productSku: 'RN001', variantSuffix: 'P', sizeInfo: '', quantity: 7 },
      [row('', 1), row('62', 2), row('64', 4, 1)],
      CENTRAL,
    );
    expect(plan.sources).toEqual([
      { sizeInfo: '', quantity: 1 },
      { sizeInfo: '64', quantity: 3 },
      { sizeInfo: '62', quantity: 2 },
    ]);
    expect(plan).toMatchObject({ fromStock: 6, direct: 1 });
  });

  it('sized lines use the exact size, then unsized stock, never other sizes', () => {
    const plan = planConsignmentDraw(
      { productSku: 'RN001', variantSuffix: 'P', sizeInfo: '62', quantity: 4 },
      [row('62', 1), row('', 2), row('64', 5)],
      CENTRAL,
    );
    expect(plan).toMatchObject({ fromStock: 3, direct: 1 });
  });

  it('never blocks when the warehouse is empty', () => {
    const plan = planConsignmentDraw({ productSku: 'RN001', variantSuffix: 'P', quantity: 2 }, [], CENTRAL);
    expect(plan).toEqual({ fromStock: 0, direct: 2, sources: [] });
    expect(describeConsignmentDraw(plan)).toContain('Νέα καταχώριση');
  });

  it('accounts for earlier lines competing for the same stock', () => {
    const plans = planConsignmentDraws(
      [
        { productSku: 'RN001', variantSuffix: 'P', quantity: 2 },
        { productSku: 'RN001', variantSuffix: 'P', quantity: 2 },
      ],
      [row('', 3)],
      CENTRAL,
    );
    expect(plans.map((plan) => plan.direct)).toEqual([0, 1]);
  });
});

describe('stock entry posting lines', () => {
  it('merges repeated lines and keeps sizes optional', () => {
    const lines = buildStockEntryPostingLines(
      [
        { productSku: 'rn001', variantSuffix: 'p', sizeInfo: '', quantity: 2 },
        { productSku: 'RN001', variantSuffix: 'P', sizeInfo: '', quantity: 1 },
        { productSku: 'RN001', variantSuffix: 'P', sizeInfo: '62', quantity: 1 },
      ],
      'increase',
      CENTRAL,
      [],
    );
    expect(lines).toEqual([
      { productSku: 'RN001', variantSuffix: 'P', sizeInfo: '', warehouseId: CENTRAL, quantity: 3 },
      { productSku: 'RN001', variantSuffix: 'P', sizeInfo: '62', warehouseId: CENTRAL, quantity: 1 },
    ]);
  });

  it('an unsized count zeroes sized buckets so the total is exact', () => {
    const availability = [row('62', 2), row('64', 1)];
    const drafts = [{ productSku: 'RN001', variantSuffix: 'P', sizeInfo: '', quantity: 5 }];
    expect(countConsolidationWarnings(drafts, CENTRAL, availability)).toEqual(['RN001P']);
    const lines = buildStockEntryPostingLines(drafts, 'count', CENTRAL, availability);
    expect(lines.map((line) => [line.sizeInfo, line.quantity])).toEqual([['', 5], ['62', 0], ['64', 0]]);
  });

  it('refuses to zero a sized bucket with reservations', () => {
    expect(() => buildStockEntryPostingLines(
      [{ productSku: 'RN001', variantSuffix: 'P', sizeInfo: '', quantity: 5 }],
      'count',
      CENTRAL,
      [row('62', 2, 1)],
    )).toThrow(/δεσμευμένα/);
  });
});

describe('size summary', () => {
  it('lists sizes then unsized', () => {
    expect(summarizeSizes([row('', 3), row('64', 1), row('62', 2), row('66', 0)])).toBe('62×2 · 64×1 · χωρίς×3');
  });
});
