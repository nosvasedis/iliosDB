import { describe, expect, it } from 'vitest';
import { Gender, type Product } from '../../types';
import { getProductCategoryRoot, getProductCategoryPath, getProductCategoryOptions, matchesProductCategory, toggleProductCategorySelection } from '../../utils/productCategories';
import { getProductCollectionOptions, getUnassignedCollectionGroup, matchesProductCollection } from '../../utils/productCollectionScopes';
import { buildSearchableProducts, filterRegistryProducts } from '../../features/products/productRegistryViewModels';
import { buildProfitabilityRows } from '../../features/analytics/analyticsViewModels';
import { createEmptySkuModalFilters, buildFilterFacets, filterFinanceEventsForModal } from '../../features/dashboard/skuModalFilters';
import { rankFinanceAnalyticsFromEvents, type FinanceLineEvent } from '../../utils/financeAnalytics';
import { pickRateCard } from '../../features/finance/workerStatements';
import type { FinanceRateCard } from '../../features/finance/types';
import { groupProductionBatchesForDisplay } from '../../features/production/workflowSelectors';

const event = (sku: string, category: string, gender = Gender.Men, collectionId: number | null = null): FinanceLineEvent => ({
  source: 'shipment', orderId: sku, lineId: sku, date: '2026-11-01T10:00:00Z', customerName: 'Δοκιμή',
  sellerCommissionPercent: 0, sku, category, gender, collectionId, collectionName: collectionId === null ? 'Χωρίς συλλογή' : 'Άνοιξη',
  quantity: 2, unitPrice: 50, subtotal: 100, discount: 0, net: 100, vat: 24, gross: 124,
  estimatedUnitCost: 20, estimatedCost: 40, profit: 60, margin: 60, productImage: null, silverWeight: 0,
  costBreakdown: { silver: 0, labor: 0, materials: 40 }, priceOverride: false,
});
const events = [event('XR1', 'Βραχιόλι με Πέτρες'), event('XR2', 'Βραχιόλι Μασίφ'), event('KL1', 'Κολιέ Πετράτο', Gender.Women, 1), event('KL2', 'Κολιέ Μασίφ'), event('RZ1', 'Ροζάριο')];

describe('SKU hierarchy and unassigned collection scopes', () => {
  it('includes every known subtype under its parent without swallowing unrelated categories', () => {
    for (const category of ['Βραχιόλι με Πέτρες', 'Βραχιόλι Μασίφ', 'Βραχιόλι Δερμάτινο', 'Βραχιόλι Μακραμέ Πολύχρωμο']) {
      expect(matchesProductCategory(category, 'Βραχιόλι')).toBe(true);
    }
    expect(matchesProductCategory('Κολιέ Πετράτο', 'Κολιέ')).toBe(true);
    expect(matchesProductCategory('Κολιέ Μασίφ', 'κολιε')).toBe(true);
    expect(matchesProductCategory('Βραχιόλι Μασίφ', 'Βραχιόλι με Πέτρες')).toBe(false);
    expect(matchesProductCategory('Κολιέτα', 'Κολιέ')).toBe(false);
    expect(getProductCategoryRoot('Ροζάριο')).toBe('Ροζάριο');
    expect(getProductCategoryRoot('Ειδικό κόσμημα')).toBe('Ειδικό κόσμημα');
    expect(getProductCategoryRoot('Μενταγιόν Θρησκευτικό')).toBe('Μενταγιόν');
    expect(getProductCategoryPath('Σκουλαρίκι')).toEqual(['Σκουλαρίκια']);
    expect(getProductCategoryPath('Βραχιόλια')).toEqual(['Βραχιόλι']);
  });

  it('offers virtual parents, intermediate branches, and independently selectable leaves', () => {
    expect(getProductCategoryPath('Βραχιόλι Δερμάτινο Θρησκευτικό')).toEqual(['Βραχιόλι', 'Βραχιόλι Δερμάτινο', 'Βραχιόλι Δερμάτινο Θρησκευτικό']);
    const available = ['Κολιέ Πετράτο', 'Κολιέ Μασίφ', 'Ροζάριο'];
    expect(getProductCategoryOptions(available).filter(option => option.depth === 0).map(option => option.value)).toEqual(['Κολιέ', 'Ροζάριο']);
    const selected = toggleProductCategorySelection([], 'Κολιέ', available);
    expect(selected).toEqual(['Κολιέ Πετράτο', 'Κολιέ Μασίφ']);
    expect(toggleProductCategorySelection(selected, 'Κολιέ Μασίφ', available)).toEqual(['Κολιέ Πετράτο']);
    expect(toggleProductCategorySelection(selected, 'Κολιέ', available)).toEqual([]);
  });

  it('distinguishes unassigned gender, category and subtype without changing collection membership', () => {
    const men = { gender: Gender.Men, category: 'Δαχτυλίδι', collections: [] };
    const women = { ...men, gender: Gender.Women };
    const leather = { ...men, category: 'Βραχιόλι Δερμάτινο Θρησκευτικό' };
    const scope = getUnassignedCollectionGroup(men);
    expect(scope.name).toBe('Χωρίς συλλογή · Ανδρικά · Δαχτυλίδι');
    expect(matchesProductCollection(men, scope.id)).toBe(true);
    expect(matchesProductCollection(women, scope.id)).toBe(false);
    expect(matchesProductCollection({ ...men, collections: [1] }, scope.id)).toBe(false);
    const options = getProductCollectionOptions([men, women, leather], [{ id: 1, name: 'Άνοιξη' }]);
    const bracelet = options.find(option => option.name === 'Χωρίς συλλογή · Ανδρικά · Βραχιόλι')!;
    expect(matchesProductCollection(leather, bracelet.id)).toBe(true);
    expect(options.filter(option => option.id === 'none')).toHaveLength(1);
    expect(getUnassignedCollectionGroup({ category: 'Δαχτυλίδι' }).name).toContain('Φύλο μη ορισμένο');
    expect(men.collections).toEqual([]);
  });

  it('uses the same parent and collection semantics in the actual registry filter', () => {
    const products = events.map(row => ({ sku: row.sku, category: row.category, gender: row.gender, recipe: [], collections: row.collectionId === null ? [] : [row.collectionId] })) as Product[];
    const searchable = buildSearchableProducts(products, new Set());
    const filters = { category: 'Κολιέ', gender: 'All' as const, searchTerm: '', stone: 'all', plating: 'all', productionType: 'all', collection: 'all', sortBy: 'sku_asc' as const };
    expect(filterRegistryProducts(searchable, filters).map(product => product.sku)).toEqual(['KL1', 'KL2']);
    expect(filterRegistryProducts(searchable, { ...filters, collection: getUnassignedCollectionGroup(products[3]).id }).map(product => product.sku)).toEqual(['KL2']);
  });

  it('reconciles parent and subtype financial totals and separates each unassigned bucket exactly once', () => {
    const stats = rankFinanceAnalyticsFromEvents({ orders: [], period: { mode: 'all_time' } }, { realized: events, backlog: [] });
    expect(stats.categoryChartData.find(row => row.name === 'Βραχιόλι')).toMatchObject({ revenue: 200, quantity: 4, profit: 120 });
    expect(stats.categoryChartData.find(row => row.name === 'Κολιέ')).toMatchObject({ revenue: 200, quantity: 4 });
    expect(stats.subcategoryChartData).toHaveLength(5);
    for (const rows of [stats.categoryChartData, stats.subcategoryChartData, stats.topCollections]) {
      expect(rows.reduce((total, row) => total + row.revenue, 0)).toBe(stats.totals.realizedNet);
      expect(rows.reduce((total, row) => total + row.quantity, 0)).toBe(stats.totals.shippedPieces);
    }
    expect(stats.topCollections).toHaveLength(5);
    expect(stats.topCollections.find(row => row.id === 1)?.name).toBe('Άνοιξη');
    expect(stats.events.realized.map(row => row.category)).toEqual(events.map(row => row.category));
    expect(buildProfitabilityRows(events, null, 'subcategory')).toHaveLength(5);
    expect(buildProfitabilityRows(events, null, 'category')).toHaveLength(3);
    expect(buildProfitabilityRows(events, null, 'collection').map(row => row.key).sort()).toEqual(stats.topCollections.map(row => row.key!).sort());
  });

  it('applies hierarchy and unassigned drilldown consistently in dashboard event filters', () => {
    const facets = buildFilterFacets(events, new Map(), []);
    expect(facets.categories).toContain('Βραχιόλι');
    const filters = createEmptySkuModalFilters();
    filters.categories.add('Βραχιόλι');
    expect(filterFinanceEventsForModal(events, filters, new Map(), [])).toHaveLength(2);
    filters.collections.add(getUnassignedCollectionGroup(events[0]).id);
    expect(filterFinanceEventsForModal(events, filters, new Map(), []).map(row => row.sku)).toEqual(['XR1']);
  });

  it('inherits parent work rates but gives specific subtype rules precedence at equal priority', () => {
    const parent: FinanceRateCard = { id: 'parent', party_id: 'worker', label: 'Βραχιόλια', unit: 'per_piece', rate: 1, match: { category: 'Βραχιόλι' }, priority: 0, is_active: true };
    const leaf = { ...parent, id: 'leather', rate: 2, match: { category: 'Βραχιόλι Δερμάτινο' } };
    const context = { sku: 'XR1', stage: 'Assembly', variantSuffix: '', category: 'Βραχιόλι Δερμάτινο Θρησκευτικό' };
    expect(pickRateCard([parent], context)?.id).toBe('parent');
    expect(pickRateCard([parent, leaf], context)?.id).toBe('leather');
    expect(pickRateCard([{ ...parent, priority: 10 }, leaf], context)?.id).toBe('parent');
    expect(pickRateCard([parent], { ...context, category: 'Ροζάριο' })).toBeUndefined();
  });

  it('keeps production batches without collections detailed and preserves real collection names', () => {
    const batches = events.slice(0, 3).map(row => ({ id: row.sku, sku: row.sku, quantity: 2, product_details: { gender: row.gender, category: row.category, collections: row.collectionId === null ? [] : [row.collectionId] } }));
    const grouped = groupProductionBatchesForDisplay(batches as any, new Map([[1, { name: 'Άνοιξη' }]]), 'gender', 'alpha');
    expect(Object.keys(grouped[Gender.Men])).toHaveLength(2);
    expect(Object.keys(grouped[Gender.Men]).every(name => name.startsWith('Χωρίς συλλογή · Ανδρικά · Βραχιόλι'))).toBe(true);
    expect(grouped[Gender.Women]['Άνοιξη']).toHaveLength(1);
  });
});
