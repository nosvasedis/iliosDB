import { describe, expect, it } from 'vitest';
import { Gender, MaterialType, PlatingType, ProductionType, OrderStatus, type Product, type Material } from '../../types';
import { getProductCategoryRoot, matchesProductCategory } from '../../utils/productCategories';
import { getComponentFamily } from '../../features/resources/componentFamilies';
import { getProductTheme, getReligiousCollectionIds } from '../../features/products/productThemes';
import { getStoneFamily, materialResourceTab } from '../../features/resources/stoneFamilies';
import { getLegalDocumentItemKind } from '../../utils/legalItemCodes';
import { getLegalDocumentCatalogProducts } from '../../utils/legalDocuments';
import { buildSearchableProducts, filterRegistryProducts, getGroupedProductCategories } from '../../features/products/productRegistryViewModels';
import { buildSellerCatalogIndex, selectSellerCatalogProducts } from '../../features/sellerCatalog/selectors';
import { getStoreCatalogIndex, selectStoreCatalog } from '../../components/employee/storeCatalog';
import { createRecipeResourceResolver, summarizeResourceQuantities } from '../../features/finance/resourceQuantities';
import { summarizeBookedResources } from '../../features/finance/bookedResourceQuantities';
import { calculateProductCost, estimateVariantCost, parseSku } from '../../utils/pricingEngine';
import type { FinanceExpense } from '../../features/finance/types';
import { buildFinanceAnalytics, type FinanceLineEvent } from '../../utils/financeAnalytics';

const product = (sku: string, overrides: Partial<Product> = {}): Product => ({
  sku, prefix: 'DA', category: 'Δαχτυλίδι', gender: Gender.Women, image_url: null,
  weight_g: 0, plating_type: PlatingType.None, production_type: ProductionType.InHouse,
  active_price: 1, draft_price: 1, selling_price: 10, stock_qty: 0, sample_qty: 0,
  recipe: [], molds: [], variants: [], collections: [],
  labor: { casting_cost: 0, setter_cost: 0, technician_cost: 0, stone_setting_cost: 0, plating_cost_x: 0, plating_cost_d: 0, subcontract_cost: 0 }, ...overrides,
});
const settings = { silver_price_gram: 1, loss_percentage: 0 } as any;

describe('catalogue classifications', () => {
  it('places sellable chains and clasps under accessories and recognises newly entered codes', () => {
    expect(getProductCategoryRoot('Καδένα')).toBe('Αξεσουάρ');
    expect(getProductCategoryRoot('Κούμπωμα')).toBe('Αξεσουάρ');
    expect(matchesProductCategory('Καδένα', 'Αξεσουάρ')).toBe(true);
    expect(matchesProductCategory('Κούμπωμα', 'Καδένα')).toBe(false);
    expect(parseSku('KD0155')).toEqual({ category: 'Καδένα', gender: Gender.Unisex });
    expect(parseSku('KOU8')).toEqual({ category: 'Κούμπωμα', gender: Gender.Unisex });
    expect(parseSku('STX134').category).toBe('Εξάρτημα (STX)');
    expect(getProductCategoryRoot('Δαχτυλίδι')).toBe('Δαχτυλίδι');
  });

  it.each([
    ['Καδένα 150', 'chain'], ['Καβουράκι M', 'clasp'], ['Κούμπωμα ανεροσόλ', 'clasp'],
    ['Τελειώματα καδένα-μηχανής m', 'ending'], ['exte αλυσίδα / 7 πόντοι', 'extension'],
    ['Γράνα σκουλαρικιών', 'earring'], ['Ζευγάρι πείροι-πεταλούδες', 'earring'],
    ['Γράνα μεγάλη', 'pin'], ['Κρικάκι μικρό κολιέ', 'connector'], ['Σφραγίδα μικρή 925', 'stamp'],
    ['Μαργαρίτα πιπίλα', 'decorative'], ['Μπαρίτσα κυρτή', 'decorative'], ['Πλακέ', 'clasp'], ['', 'other'],
  ])('classifies component description %s without changing the SKU or description', (description, family) => {
    const item = product('STX001', { description, is_component: true });
    const before = JSON.stringify(item);
    expect(getComponentFamily(item)).toBe(family);
    expect(getComponentFamily({ ...item, is_component: false })).toBeNull();
    expect(JSON.stringify(item)).toBe(before);
  });

  it('treats theme as an independent facet and does not infer a theme for every unlabelled item', () => {
    const religiousIds = getReligiousCollectionIds([{ id: 5, name: 'Ψαλμός' }, { id: 7, name: 'Νέδα' }]);
    expect(getProductTheme(product('XR1', { category: 'Βραχιόλι Δερμάτινο Θρησκευτικό' }))).toBe('religious');
    expect(getProductTheme(product('PN1', { collections: [5] }), religiousIds)).toBe('religious');
    expect(getProductTheme(product('BDA1', { collections: [7] }), religiousIds)).toBe('unspecified');
    expect(getProductTheme(product('RZ1', { category: 'Ροζάριο' }))).toBe('religious');
    expect(getProductTheme(product('BST1', { category: 'Σταυρός' }))).toBe('religious');
    expect(getProductTheme(product('STX1', { category: 'Σταυρός', is_component: true }))).toBe('unspecified');
  });

  it('filters component families and themes independently in the real registry selector', () => {
    const products = [product('STX1', { is_component: true, description: 'Τελειώματα καδένα' }), product('STX2', { is_component: true, description: 'Καδένα 150' }), product('PN1', { collections: [5] })];
    const searchable = buildSearchableProducts(products, new Set(), [{ id: 5, name: 'Ψαλμός' }]);
    const filters = { category: 'All', gender: 'All' as const, searchTerm: '', stone: 'all', plating: 'all', productionType: 'all', collection: 'all', sortBy: 'sku_asc' as const };
    expect(filterRegistryProducts(searchable, { ...filters, componentFamily: 'ending' }).map(row => row.sku)).toEqual(['STX1']);
    expect(filterRegistryProducts(searchable, { ...filters, theme: 'religious' }).map(row => row.sku)).toEqual(['PN1']);
  });

  it('carries collection-based theme into finance without replacing category or changing totals', () => {
    const item = product('PN1', { category: 'Μενταγιόν', collections: [5] });
    const stats = buildFinanceAnalytics({
      products: [item], materials: [], settings, collections: [{ id: 5, name: 'Ψαλμός' }], shipments: [], shipmentItems: [],
      orders: [{ id: 'o1', customer_name: 'Δοκιμή', created_at: '2026-11-03T10:00:00Z', status: OrderStatus.Delivered, total_price: 30, items: [{ sku: item.sku, quantity: 3, price_at_order: 10 }] }],
      period: { mode: 'all_time' },
    });
    expect(stats.events.realized[0]).toMatchObject({ theme: 'religious', category: 'Μενταγιόν', collectionId: 5 });
    expect(stats.themeChartData).toEqual([expect.objectContaining({ name: 'Θρησκευτικό', quantity: 3, revenue: 30 })]);
    expect(stats.themeChartData.reduce((sum, row) => sum + row.revenue, 0)).toBe(stats.totals.realizedNet);
    expect(stats.themeChartData.reduce((sum, row) => sum + row.quantity, 0)).toBe(stats.totals.shippedPieces);
  });

  it('recognises pearls for quantities while preserving stored material type, costs and special variant prices', () => {
    const pearl: Material = { id: 'pearl', name: 'Μαργαριτάρι 2,5-3,0', type: MaterialType.Component, cost_per_unit: 0.5, unit: 'Τεμ', variant_prices: { SB: 0.8 } };
    const stx = product('STX1', { is_component: true, description: 'Γράνα μεγάλη', recipe: [{ type: 'raw', id: pearl.id, quantity: 3 }] });
    const parent = product('DA1', { recipe: [{ type: 'component', sku: stx.sku, quantity: 2 }] });
    const before = JSON.stringify(pearl);
    const variantBefore = estimateVariantCost(parent, 'XSB', settings, [pearl], [parent, stx]).rawTotal;
    expect(getStoneFamily(pearl)).toBe('pearl');
    expect(materialResourceTab(pearl)).toBe(MaterialType.Stone);
    expect(getStoneFamily({ ...pearl, name: 'Μαργαρίτα πιπίλα' })).toBeNull();
    const resources = createRecipeResourceResolver([parent, stx], [pearl])(parent.sku);
    const report = summarizeResourceQuantities([{ sku: parent.sku, quantity: 4, recipeResources: resources }] as FinanceLineEvent[]);
    expect(report.stonePieces).toBe(24);
    expect(report.componentPieces).toBe(8);
    expect(report.rows.find(row => row.id === pearl.id)).toMatchObject({ stoneFamily: 'pearl', kind: 'stone', quantity: 24 });
    expect(report.rows.find(row => row.id === stx.sku)).toMatchObject({ componentFamily: 'pin', quantity: 8 });
    expect(calculateProductCost(parent, settings, [pearl], [parent, stx]).rawTotal).toBeCloseTo(3);
    expect(estimateVariantCost(parent, 'XSB', settings, [pearl], [parent, stx]).rawTotal).toBeCloseTo(variantBefore);
    expect(JSON.stringify(pearl)).toBe(before);
    const expenses = [{ id: 'e', category_id: 'raw', status: 'paid', expense_date: '2026-11-03', lines: [{ material_id: pearl.id, label: pearl.name, qty: 12 }, { sku: stx.sku, label: 'Γράνα μεγάλη', qty: 7 }] }] as FinanceExpense[];
    const booked = summarizeBookedResources(expenses, [], [pearl], [stx]);
    expect(booked.stonePieces).toBe(12);
    expect(booked.rows.find(row => row.id === stx.sku)?.componentFamily).toBe('pin');
  });

  it('confines virtual services/shipping to the legal catalogue and keeps them out of registry, seller and store', () => {
    const legal = getLegalDocumentCatalogProducts([product('DA1')]);
    expect(legal.map(row => row.sku)).toEqual(['000', '001', 'DA1']);
    expect(getLegalDocumentItemKind('000')).toBe('shipping');
    expect(getLegalDocumentItemKind('001')).toBe('repair');
    expect(getLegalDocumentItemKind('DA1')).toBe('goods');
    expect(buildSearchableProducts(legal, new Set()).map(row => row.product.sku)).toEqual(['DA1']);
    expect(getGroupedProductCategories(legal).parents).toEqual(['Δαχτυλίδι']);
    const sellerProducts = legal.map(row => ({ ...row, available_qty: 0, variants: [], created_at: '2026-11-03' }));
    const index = buildSellerCatalogIndex(sellerProducts, getProductCategoryRoot);
    expect(selectSellerCatalogProducts(index, { search: '', categoryGroup: 'All', gender: 'All', collection: 'All', finish: null, stone: null, stoneMode: 'All', productionType: 'All', onlyInStock: false, sortBy: 'sku' }).map(row => row.sku)).toEqual(['DA1']);
    expect(selectStoreCatalog(getStoreCatalogIndex(legal, []), { search: '', group: 'All', gender: 'All', stones: 'all', plating: 'all', onlyInStock: false, sortBy: 'sku' }).map(row => row.sku)).toEqual(['DA1']);
    expect(getLegalDocumentCatalogProducts(legal).filter(row => row.sku === '000')).toHaveLength(1);
  });
});
