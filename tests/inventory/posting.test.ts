import { describe, expect, it } from 'vitest';
import type { InventoryAvailability } from '../../features/inventory';
import {
  buildInventoryPostingLines,
  mergeRecentInventorySelections,
  normalizeInventorySizeInfo,
  summarizeInventorySelectionByWarehouse,
} from '../../features/inventory';

describe('smart inventory posting', () => {
  it.each([
    [' 054 ', '54'],
    ['19CM', '19cm'],
    ['19 εκ.', '19cm'],
    ['19,50 cm', '19.5cm'],
    ['  ειδικό   μεγάλο ', 'ΕΙΔΙΚΌ ΜΕΓΆΛΟ'],
    ['', ''],
  ])('normalizes size identity %s as %s', (input, expected) => {
    expect(normalizeInventorySizeInfo(input)).toBe(expected);
  });

  it('keeps blank fields unchanged and treats explicit zero as a counted quantity', () => {
    const lines = buildInventoryPostingLines([
      { productSku: 'DA100', variantSuffix: 'XLE', sizeInfo: '52', warehouseId: 'central', quantity: '' },
      { productSku: 'DA100', variantSuffix: 'XLE', sizeInfo: '54', warehouseId: 'central', quantity: '0' },
    ], 'count');

    expect(lines).toEqual([{
      productSku: 'DA100',
      variantSuffix: 'XLE',
      sizeInfo: '54',
      warehouseId: 'central',
      quantity: 0,
    }]);
  });

  it('builds one atomic payload across multiple sizes and warehouses', () => {
    const lines = buildInventoryPostingLines([
      { productSku: 'BR200', variantSuffix: 'DLE', sizeInfo: '19CM', warehouseId: 'central', quantity: '2' },
      { productSku: 'BR200', variantSuffix: 'DLE', sizeInfo: '21cm', warehouseId: 'central', quantity: '1' },
      { productSku: 'BR200', variantSuffix: 'DLE', sizeInfo: '19cm', warehouseId: 'showroom', quantity: '3' },
    ], 'count');

    expect(lines).toHaveLength(3);
    expect(lines.map((line) => `${line.sizeInfo}:${line.warehouseId}:${line.quantity}`)).toEqual([
      '19cm:central:2',
      '21cm:central:1',
      '19cm:showroom:3',
    ]);
  });

  it('rejects normalized duplicate identities and zero manual increases', () => {
    expect(() => buildInventoryPostingLines([
      { productSku: 'BR200', variantSuffix: 'DLE', sizeInfo: '19CM', warehouseId: 'showroom', quantity: '1' },
      { productSku: 'BR200', variantSuffix: 'DLE', sizeInfo: '19 cm', warehouseId: 'showroom', quantity: '2' },
    ], 'count')).toThrow(/περισσότερες από μία φορές/);

    expect(() => buildInventoryPostingLines([
      { productSku: 'BR200', variantSuffix: 'DLE', sizeInfo: '19cm', warehouseId: 'showroom', quantity: '0' },
    ], 'increase')).toThrow(/μεγαλύτερη από μηδέν/);
  });

  it('moves the latest selected variant to the front of recent SKU history', () => {
    const recent = mergeRecentInventorySelections([
      { productSku: 'DA100', variantSuffix: 'XLE' },
      { productSku: 'BR200', variantSuffix: 'DLE' },
    ], { productSku: 'br200', variantSuffix: 'dle' });

    expect(recent).toEqual([
      { productSku: 'BR200', variantSuffix: 'DLE' },
      { productSku: 'DA100', variantSuffix: 'XLE' },
    ]);
  });

  it('aggregates all size rows per warehouse for a search result', () => {
    const row = (overrides: Partial<InventoryAvailability>): InventoryAvailability => ({
      productSku: 'DA100',
      variantSuffix: 'XLE',
      sizeInfo: '52',
      warehouseId: 'central',
      warehouseName: 'Κεντρική Αποθήκη',
      warehouseType: 'Central',
      onHand: 2,
      reserved: 1,
      available: 1,
      incoming: 0,
      outstandingDemand: 0,
      productionDemand: 0,
      purchaseDemand: 0,
      projectedAvailable: 1,
      reorderPoint: 0,
      preferredSupplierId: null,
      updatedAt: '',
      ...overrides,
    });

    expect(summarizeInventorySelectionByWarehouse([
      row({}),
      row({ sizeInfo: '54', onHand: 3, reserved: 0, available: 3 }),
      row({ warehouseId: 'showroom', warehouseName: 'Δειγματολόγιο', onHand: 4, reserved: 0, available: 4 }),
      row({ productSku: 'OTHER', onHand: 99, reserved: 0, available: 99 }),
    ], 'DA100', 'XLE')).toEqual([
      { warehouseId: 'showroom', warehouseName: 'Δειγματολόγιο', onHand: 4, reserved: 0, available: 4 },
      { warehouseId: 'central', warehouseName: 'Κεντρική Αποθήκη', onHand: 5, reserved: 1, available: 4 },
    ]);
  });
});
