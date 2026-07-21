import { describe, expect, it } from 'vitest';
import {
  buildProductionSendItemsFromSelection,
  clearProductionSendSelection,
  getProductionSendSelectionSummary,
  getProductionSendOrderStatus,
  selectVisibleProductionSendRows,
  unselectVisibleProductionSendRows,
  updateProductionSendQuantity,
  type ProductionSendRowInput,
} from '../../features/production/productionSendPlanner';
import { OrderStatus } from '../../types';

const row = (overrides: Partial<ProductionSendRowInput>): ProductionSendRowInput => ({
  sku: 'PN001',
  variant_suffix: 'H',
  quantity: 1,
  price_at_order: 10,
  remainingQty: 1,
  originalIndex: 0,
  ...overrides,
});

describe('production send selection helpers', () => {
  it('preserves partial-delivery status when starting a later production part', () => {
    expect(getProductionSendOrderStatus(0)).toBe(OrderStatus.InProduction);
    expect(getProductionSendOrderStatus(2)).toBe(OrderStatus.PartiallyDelivered);
  });

  it('selects visible pending rows at their remaining quantity', () => {
    const rows = [
      row({ originalIndex: 0, sku: 'PN001', remainingQty: 3 }),
      row({ originalIndex: 1, sku: 'PN002', remainingQty: 0 }),
      row({ originalIndex: 2, sku: 'PN003', remainingQty: 2 }),
    ];

    expect(selectVisibleProductionSendRows({ 9: 4 }, rows)).toEqual({
      0: 3,
      2: 2,
      9: 4,
    });
  });

  it('unselects visible rows while preserving hidden selections', () => {
    const rows = [
      row({ originalIndex: 0, remainingQty: 3 }),
      row({ originalIndex: 2, remainingQty: 2 }),
    ];

    expect(unselectVisibleProductionSendRows({ 0: 3, 2: 2, 9: 4 }, rows)).toEqual({
      9: 4,
    });
  });

  it('clears all selected production quantities', () => {
    expect(clearProductionSendSelection()).toEqual({});
  });

  it('clamps partial row quantities to the row remaining quantity', () => {
    const pendingRow = row({ originalIndex: 4, remainingQty: 5 });

    expect(updateProductionSendQuantity({}, pendingRow, 8)).toEqual({ 4: 5 });
    expect(updateProductionSendQuantity({ 4: 2 }, pendingRow, -1)).toEqual({});
  });

  it('builds send items from partial row quantities and ignores zero-remaining rows', () => {
    const rows = [
      row({ originalIndex: 0, sku: 'PN001', variant_suffix: 'H', remainingQty: 3, size_info: '54', line_id: 'line-1' }),
      row({ originalIndex: 1, sku: 'PN002', variant_suffix: null, remainingQty: 0 }),
      row({ originalIndex: 2, sku: 'PN003', variant_suffix: 'P', remainingQty: 5, cord_color: 'black', enamel_color: 'red', notes: 'rush' }),
    ];

    expect(buildProductionSendItemsFromSelection(rows, { 0: 2, 1: 6, 2: 9 })).toEqual([
      {
        sku: 'PN001',
        variant: 'H',
        qty: 2,
        size_info: '54',
        cord_color: null,
        enamel_color: null,
        notes: undefined,
        line_id: 'line-1',
      },
      {
        sku: 'PN003',
        variant: 'P',
        qty: 5,
        size_info: undefined,
        cord_color: 'black',
        enamel_color: 'red',
        notes: 'rush',
        line_id: null,
      },
    ]);
  });

  it('summarizes visible pending, selected lines, and hidden selections', () => {
    const allRows = [
      row({ originalIndex: 0, remainingQty: 3 }),
      row({ originalIndex: 1, remainingQty: 0 }),
      row({ originalIndex: 2, remainingQty: 5 }),
    ];
    const visibleRows = [allRows[0], allRows[1]];

    expect(getProductionSendSelectionSummary(allRows, visibleRows, { 0: 2, 2: 4, 8: 10 })).toEqual({
      totalSelectedQty: 6,
      selectedLineCount: 2,
      visiblePendingQty: 3,
      visibleSelectedQty: 2,
      hiddenSelectedQty: 4,
      hiddenSelectedLineCount: 1,
      totalPendingQty: 8,
    });
  });
});
