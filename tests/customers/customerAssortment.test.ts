import { describe, expect, it } from 'vitest';
import { OrderStatus, type Customer, type Order, type Product } from '../../types';
import {
  buildAssortmentIndex,
  checkSkusInTerritory,
  evaluatePurchaseFilter,
  findAllOverlaps,
  findNeighbors,
  getCustomerAssortment,
  getCustomerSuggestions,
  ignoreSkuKey,
  overlapsForCustomer,
  placesNear,
  purchaseFacetOptions,
  searchSkuOptions,
} from '../../features/customers/customerAssortment';
import { classifyJewelryKind } from '../../features/customers/jewelryKinds';

const NOW = new Date('2026-10-01T10:00:00Z').getTime();

const product = (sku: string, category: string, collections: number[] = [], extra: Partial<Product> = {}) => ({
  sku, prefix: sku.slice(0, 2), category, collections, description: `${category} ${sku}`, image_url: null,
  is_component: false, ...extra,
} as unknown as Product);

// Mykonos shops with exact pins (a few hundred metres apart) and one in Thessaloniki.
const customer = (id: string, name: string, lat: number | null, lng: number | null, address: string, extra: Partial<Customer> = {}): Customer => ({
  id, full_name: name, address, latitude: lat, longitude: lng, country: 'GR', created_at: '2024-01-01T00:00:00Z', ...extra,
});

let orderNo = 0;
const order = (customerId: string, date: string, items: Array<[string, number, number?]>, status = OrderStatus.Delivered): Order => ({
  id: `O-${++orderNo}`,
  customer_id: customerId,
  customer_name: customerId,
  created_at: date,
  status,
  total_price: 0,
  vat_rate: 0.24,
  items: items.map(([sku, quantity, price]) => ({ sku, quantity, price_at_order: price ?? 10 })),
} as Order);

const products = [
  product('RN100', 'Δαχτυλίδι', [1]),
  product('RN101', 'Δαχτυλίδι Πετράτο', [1]),
  product('SK200', 'Σκουλαρίκια', [2]),
  product('XR300', 'Βραχιόλι Μακραμέ', [2]),
  product('XR301', 'Βραχιόλι', [3]),
  product('PART1', 'Εξάρτημα', [], { is_component: true }),
];
const collections = [{ id: 1, name: 'Ωρίων' }, { id: 2, name: 'Κυκλάδες' }, { id: 3, name: 'Θάλασσα' }];

function fixture() {
  orderNo = 0;
  const customers = [
    customer('A', 'Κατάστημα Α', 37.4467, 25.3289, 'Ματογιάννη 1, 84600 - Μύκονος'),
    customer('B', 'Κατάστημα Β', 37.4475, 25.3275, 'Ενόπλων Δυνάμεων 5, 84600 - Μύκονος'),
    customer('C', 'Κατάστημα Γ', 40.6401, 22.9444, 'Τσιμισκή 10, 54623 - Θεσσαλονίκη'),
    customer('D', 'Κατάστημα Δ', 37.4470, 25.3280, 'Ματογιάννη 7, 84600 - Μύκονος', {
      profile: { exclusivity: { enabled: true, radius_km: 1, scopes: [{ kind: 'collection', key: '3' }] } },
    }),
  ];
  const orders = [
    order('A', '2026-08-01T10:00:00Z', [['RN100', 4], ['SK200', 2], ['PART1', 10]]),
    order('A', '2026-03-01T10:00:00Z', [['RN100', 2]]),
    order('A', '2025-01-01T10:00:00Z', [['RN100', 1]]),
    order('B', '2026-09-01T10:00:00Z', [['RN100', 3], ['XR300', 1], ['PART1', 5]]),
    order('B', '2026-09-02T10:00:00Z', [['XR301', 2]]),
    order('C', '2026-07-01T10:00:00Z', [['RN100', 5], ['RN101', 5], ['SK200', 1]]),
    order('C', '2026-07-05T10:00:00Z', [['RN101', 1]], OrderStatus.Cancelled),
    order('D', '2026-05-01T10:00:00Z', [['SK200', 1]]),
  ];
  return buildAssortmentIndex({ customers, orders, products, collections, now: NOW });
}

describe('jewellery kinds', () => {
  it('groups categories into kinds and falls back to SKU prefixes', () => {
    expect(classifyJewelryKind('X', 'Βραχιόλι Δερμάτινο Θρησκευτικό').id).toBe('bracelet');
    expect(classifyJewelryKind('X', 'ΔΑΧΤΥΛΙΔΙ').id).toBe('ring');
    expect(classifyJewelryKind('ΧΡ123', null).id).toBe('bracelet');
    expect(classifyJewelryKind('SP', null).id).toBe('special');
    expect(classifyJewelryKind('ZZ1', 'Μπομπονιέρα').label).toBe('Μπομπονιέρα');
  });
});

describe('customer assortment', () => {
  it('aggregates per window, ignores cancelled orders and marks new SKUs', () => {
    const index = fixture();
    const all = getCustomerAssortment(index, 'A', 'all');
    expect(all.totals.orders).toBe(3);
    expect(all.skus.find(s => s.sku === 'RN100')).toMatchObject({ qty: 7, orders: 3 });
    const recent = getCustomerAssortment(index, 'A', '6m');
    expect(recent.skus.find(s => s.sku === 'RN100')).toMatchObject({ qty: 4, isNew: false });
    expect(recent.skus.find(s => s.sku === 'SK200')?.isNew).toBe(true);
    expect(recent.kinds.map(k => k.label)).toContain('Σκουλαρίκια');
    const c = getCustomerAssortment(index, 'C', 'all');
    expect(c.skus.find(s => s.sku === 'RN101')?.qty).toBe(5);
  });
});

describe('neighbours and overlaps', () => {
  it('finds nearby shops by distance and keeps far ones apart', () => {
    const index = fixture();
    const ids = findNeighbors(index, 'A', 1).map(n => n.customerId).sort();
    expect(ids).toEqual(['B', 'D']);
    expect(findNeighbors(index, 'C', 25)).toEqual([]);
  });

  it('treats same town + postal area as neighbours when positions are only approximate', () => {
    const base = { label: 'x', coords: null, precision: 'area' as const, town: 'Φηρά', townKey: 'φηρα', countryCode: 'GR' };
    expect(placesNear({ ...base, postalPrefix: '847' }, { ...base, postalPrefix: '847' }, 1)).toEqual({ distanceKm: null });
    expect(placesNear({ ...base, postalPrefix: '105' }, { ...base, postalPrefix: '117' }, 1)).toBeNull();
  });

  it('reports shared SKUs, ignores components, honours muted SKUs and flags exclusivity breaches', () => {
    const index = fixture();
    const overlaps = findAllOverlaps(index, { radiusKm: 1, window: '12m' });
    const ab = overlaps.find(o => o.id === 'A|B')!;
    expect(ab.severity).toBe('high');
    expect(ab.sharedSkus.map(s => s.sku)).toEqual(['RN100']);
    const bd = overlaps.find(o => o.id === 'B|D')!;
    expect(bd.severity).toBe('critical');
    expect(bd.breaches[0]).toMatchObject({ holderId: 'D', otherId: 'B', skus: ['XR301'] });
    expect(overlaps[0].severity).toBe('critical');

    const muted = findAllOverlaps(index, { radiusKm: 1, window: '12m', ignored: new Set([ignoreSkuKey('RN100')]) });
    expect(muted.find(o => o.id === 'A|B')?.sharedSkus ?? []).toEqual([]);

    const forB = overlapsForCustomer(index, 'B', { radiusKm: 1, window: '12m' });
    expect(forB.every(o => o.aId === 'B')).toBe(true);
    expect(forB.find(o => o.bId === 'A')?.sharedSkus[0]).toMatchObject({ aQty: 3, bQty: 6 });
  });

  it('checks a draft order against the territory', () => {
    const index = fixture();
    const hits = checkSkusInTerritory(index, 'A', ['RN100', 'XR301', 'RN101', 'PART1'], { radiusKm: 1, window: '12m' });
    const rn = hits.find(h => h.sku === 'RN100')!;
    expect(rn.neighbors.map(n => n.customerId)).toEqual(['B']);
    expect(hits.find(h => h.sku === 'XR301')).toMatchObject({ blockedBy: [expect.objectContaining({ customerId: 'D' })] });
    expect(hits.find(h => h.sku === 'RN101')).toBeUndefined();
    expect(hits.find(h => h.sku === 'PART1')).toBeUndefined();
  });
});

describe('suggestions', () => {
  it('offers what peers buy, ranks territory-safe items first and blocks exclusivity', () => {
    const index = fixture();
    const s = getCustomerSuggestions(index, 'A', { radiusKm: 1, window: '12m' });
    expect(s.skus.map(x => x.sku)).not.toContain('RN100');
    const col3 = s.collections.find(c => c.id === 3);
    expect(col3).toBeUndefined(); // only one peer bought it
    const reorder = s.reorders.find(r => r.sku === 'RN100');
    expect(reorder).toBeUndefined(); // bought 2 months ago, inside its cadence
  });
});

describe('directory purchase filter', () => {
  it('filters customers that bought / never bought a facet', () => {
    const index = fixture();
    const bought = evaluatePurchaseFilter(index, { items: [{ facet: 'collection', key: '2' }], mode: 'bought', match: 'any', window: 'all' });
    expect([...bought].filter(([, m]) => m.matched).map(([id]) => id).sort()).toEqual(['A', 'B', 'C', 'D']);
    const rings = evaluatePurchaseFilter(index, { items: [{ facet: 'kind', key: 'ring' }], mode: 'not_bought', match: 'any', window: 'all' });
    expect([...rings].filter(([, m]) => m.matched).map(([id]) => id)).toEqual(['D']);
    const both = evaluatePurchaseFilter(index, { items: [{ facet: 'sku', key: 'RN100' }, { facet: 'sku', key: 'SK200' }], mode: 'bought', match: 'all', window: 'all' });
    expect(both.get('A')).toMatchObject({ matched: true, qty: 9 });
    expect(both.get('B')?.matched).toBe(false);
  });

  it('lists facet options with customer counts and searches SKUs', () => {
    const index = fixture();
    const options = purchaseFacetOptions(index, 'all');
    expect(options.kind.find(o => o.key === 'ring')?.customerCount).toBe(3);
    expect(options.collection.map(o => o.label)).toContain('Θάλασσα');
    expect(searchSkuOptions(index, 'rn1', 'all').map(o => o.key)).toEqual(['RN100', 'RN101']);
  });
});
