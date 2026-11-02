import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Gender, MaterialType, PlatingType, ProductionType, type Material, type Product } from '../../types';
import { getStoneFamily } from '../../features/resources/stoneFamilies';
import { StoneFamilyHint } from '../../components/resources/StoneFamily';
import { createRecipeResourceResolver, summarizeResourceQuantities } from '../../features/finance/resourceQuantities';
import { summarizeBookedResources } from '../../features/finance/bookedResourceQuantities';
import type { FinanceLineEvent } from '../../utils/financeAnalytics';
import type { FinanceExpense } from '../../features/finance/types';
import { calculateProductCost, estimateVariantCost } from '../../utils/pricingEngine';

const stone = (name: string, extra: Partial<Material> = {}): Material => ({ id: name, name, type: MaterialType.Stone, unit: 'Τεμ', cost_per_unit: 1, ...extra });
const settings = { silver_price_gram: 1, loss_percentage: 0, barcode_width_mm: 50, barcode_height_mm: 30, retail_barcode_width_mm: 72, retail_barcode_height_mm: 10, last_calc_silver_price: 1 };
const product: Product = { sku: 'DA001', prefix: 'DA', category: 'Δαχτυλίδι', gender: Gender.Women, image_url: null, weight_g: 0, plating_type: PlatingType.None, production_type: ProductionType.InHouse, active_price: 1, draft_price: 1, selling_price: 10, stock_qty: 0, sample_qty: 0, molds: [], is_component: false, recipe: [], labor: { casting_cost: 0, setter_cost: 0, technician_cost: 0, stone_setting_cost: 0, plating_cost_x: 0, plating_cost_d: 0, subcontract_cost: 0 } };

describe('stone families shared by materials and finance', () => {
  it.each(['2,50mm ζιργκόν γυναικείο', 'Πέτρα γυναικεία ΖΙΡΓΚΟΝ ΚΝ δαχτυλίδι', '3,00mm ΖΙΡΓΚΌΝ', 'White zircon 3mm'])('recognizes zircon names with case/tonos differences: %s', (name) => {
    expect(getStoneFamily(stone(name))).toBe('zircon');
  });

  it.each(['Κορδόνι Αιματίτης (XR)', 'Κορδόνι Όνυχας (XR)', '  ΚΟΡΔΟΝΙ   ΟΝΥΧΑΣ (XR) ', 'Κορδόνι Αιματίτης'])('separates the necklace exceptions: %s', (name) => {
    expect(getStoneFamily(stone(name))).toBe('necklace');
  });

  it('defaults conventional stones to doublets and keeps real cord materials and strand pricing separate', () => {
    expect(getStoneFamily(stone('10x12 οβάλ Γυναικεία'))).toBe('doublet');
    expect(getStoneFamily(stone('001TXAOL(16)', { stones_per_strand: 25 }))).toBe('strand');
    expect(getStoneFamily(stone('ζιργκόν σε σειρά', { stones_per_strand: 100 }))).toBe('strand');
    expect(getStoneFamily(stone('Κορδόνι Όνυχας', { type: MaterialType.Cord }))).toBeNull();
  });

  it('previews classification for a newly entered or renamed material without changing saved pricing data', () => {
    const material = stone('Γυναικεία πέτρα', { variant_prices: { SB: 4 }, stock_qty: 9 });
    const original = JSON.stringify(material);
    expect(renderToStaticMarkup(<StoneFamilyHint material={material} />)).toContain('Διπλέτες');
    const markup = renderToStaticMarkup(<StoneFamilyHint material={{ ...material, name: 'ζιργκόν 3mm' }} />);
    expect(markup).toContain('bg-sky-50');
    expect(JSON.stringify(material)).toBe(original);
  });

  it('propagates the same families through nested STX recipes and recorded purchases without changing counts', () => {
    const materials = [stone('Οβάλ'), stone('ζιργκόν'), stone('Κορδόνι Αιματίτης (XR)'), stone('001QN', { stones_per_strand: 30 })];
    const component = { ...product, sku: 'STX001', is_component: true, recipe: materials.map((material) => ({ type: 'raw' as const, id: material.id, quantity: 2 })) };
    const parent = { ...product, recipe: [{ type: 'component' as const, sku: 'STX001', quantity: 3 }] };
    const resolved = createRecipeResourceResolver([parent, component], materials)('DA001');
    const report = summarizeResourceQuantities([{ sku: 'DA001', quantity: 2, recipeResources: resolved }] as FinanceLineEvent[]);
    expect(report.stonePieces).toBe(48);
    expect(report.rows.filter((row) => row.kind === 'stone').map((row) => [row.stoneFamily, row.quantity])).toEqual(expect.arrayContaining([['doublet', 12], ['zircon', 12], ['necklace', 12], ['strand', 12]]));
    const expenses = [{ id: 'e', category_id: 'stones', status: 'paid', source_kind: 'supplier_order', expense_date: '2026-11-02', lines: materials.map((material) => ({ label: material.name, material_id: material.id, qty: 5, unit_price: 2 })) }] as FinanceExpense[];
    const purchases = summarizeBookedResources(expenses, [], materials, []);
    expect(purchases.stonePieces).toBe(20);
    expect(new Set(purchases.rows.map((row) => row.stoneFamily)).size).toBe(4);
  });

  it('preserves special variant prices and per-stone strand costs after classification', () => {
    const conventional = stone('10x12 οβάλ Γυναικεία', { variant_prices: { SB: 4 } });
    const strand = stone('001QN', { stones_per_strand: 100, cost_per_unit: 0.1 });
    const materials = [conventional, strand];
    const priced = { ...product, recipe: [{ type: 'raw' as const, id: conventional.id, quantity: 2 }, { type: 'raw' as const, id: strand.id, quantity: 3 }] };
    materials.forEach(getStoneFamily);
    expect(calculateProductCost(priced, settings, materials, [priced]).rawTotal).toBeCloseTo(2.3);
    expect(estimateVariantCost(priced, 'XSB', settings, materials, [priced]).rawTotal).toBeCloseTo(8.3);
    expect(conventional.variant_prices).toEqual({ SB: 4 });
    expect(strand.stones_per_strand).toBe(100);
    expect(strand.cost_per_unit).toBe(0.1);
  });
});
