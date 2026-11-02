import { describe, expect, it } from 'vitest';
import { MaterialType, type Material, type Product } from '../../types';
import type { FinanceCategory, FinanceExpense } from '../../features/finance/types';
import { summarizeBookedResources } from '../../features/finance/bookedResourceQuantities';

const materials: Material[] = [
  { id: 'stone', name: 'Ζιργκόν', description: '3mm', type: MaterialType.Stone, unit: 'τεμ.', cost_per_unit: 1, stones_per_strand: 100 },
  { id: 'cord', name: 'Κορδόνι', type: MaterialType.Cord, unit: 'm', cost_per_unit: 1 },
];
const categories = [
  { id: 'stones', link_kind: 'stones' }, { id: 'child', parent_id: 'stones' }, { id: 'worker', link_kind: 'worker' },
] as FinanceCategory[];
const expense = (lines: FinanceExpense['lines'], overrides: Partial<FinanceExpense> = {}): FinanceExpense => ({ id: 'e', category_id: 'stones', expense_date: '2026-11-02', lines, billing: 'X', status: 'unpaid', source_kind: 'supplier_order', ...overrides } as FinanceExpense);

describe('recorded purchase quantities', () => {
  it('uses saved quantities/units, groups by resource AND unit, never expands STX recipes or converts strands again', () => {
    const report = summarizeBookedResources([
      expense([{ label: 'Ζιργκόν παλιό όνομα', material_id: 'stone', qty: 1234, unit_price: 1 }, { label: 'STX', sku: 'STX001', qty: 7, unit_price: 1 }, { label: 'Κορδόνι', material_id: 'cord', qty: 0.125, unit_price: 1 }]),
      expense([{ label: 'Ζιργκόν', material_id: 'stone', qty: 2, unit: 'σειρές', unit_price: 10 }], { id: 'e2', doc_ref: 'INV-002' }),
    ], categories, materials, [{ sku: 'STX001', is_component: true, recipe: [{ type: 'raw', id: 'stone', quantity: 100 }] }] as Product[]);
    expect(report.stonePieces).toBe(1234);
    expect(report.componentPieces).toBe(7);
    expect(report.rows.find((row) => row.id === 'cord')).toMatchObject({ quantity: 0.125, unit: 'm', kind: 'material' });
    expect(report.rows.filter((row) => row.id === 'stone')).toHaveLength(2);
    expect(report.rows.find((row) => row.unit === 'σειρές')?.products[0].sku).toContain('INV-002');
    expect(report.warnings).toEqual([]);
  });

  it('excludes expected expenses, commissions, worker statements and finished-product purchases', () => {
    const line = { label: 'Ζιργκόν', material_id: 'stone', qty: 12, unit_price: 1 };
    const report = summarizeBookedResources([
      expense([line], { status: 'expected' }), expense([line], { source_kind: 'worker_statement' }), expense([line], { source_kind: 'commission' }),
      expense([{ label: 'Δαχτυλίδι', sku: 'DA001', qty: 10, unit_price: 20 }]),
      expense([{ label: 'Εργασία', qty: 1, unit_price: 200 }], { category_id: 'worker', source_kind: 'manual' }),
    ], categories, materials, [{ sku: 'DA001', is_component: false }] as Product[]);
    expect(report.rows).toEqual([]);
  });

  it('retains unlinked manual lines under inherited resource categories and flags unknown units', () => {
    const report = summarizeBookedResources([
      expense([{ label: 'Πέτρες χωρίς μητρώο', qty: 7, unit_price: 1 }], { category_id: 'child', source_kind: 'manual' }),
      expense([{ label: 'Υλικό που διαγράφηκε', material_id: 'gone', qty: 4, unit: 'τεμ', unit_price: 1 }]),
      expense([{ label: 'Μη έγκυρο', material_id: 'stone', qty: -2, unit_price: 1 }]),
    ], categories, materials, []);
    expect(report.rows.find((row) => row.name === 'Πέτρες χωρίς μητρώο')).toMatchObject({ quantity: 7, unit: 'μον.', kind: 'stone' });
    expect(report.rows.find((row) => row.id === 'gone')).toMatchObject({ quantity: 4, unit: 'τεμ.' });
    expect(report.warnings).toHaveLength(4);
    expect(report.stonePieces).toBe(4);
  });
});
