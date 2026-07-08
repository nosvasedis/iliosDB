import { describe, expect, it } from 'vitest';
import { Gender, OrderStatus, ProductionStage } from '../../types';
import { RETAIL_CUSTOMER_ID, RETAIL_CUSTOMER_NAME, RETAIL_NOTE_PREFIX } from '../../lib/supabase';
import {
  buildSkuOrderSearchFacets,
  buildSkuOrderSearchResults,
  createEmptySkuOrderSearchFilters,
} from '../../features/orders/skuOrderSearch';

const product = (sku: string, gender = Gender.Women) => ({
  sku,
  gender,
  category: 'Δαχτυλίδι',
  image_url: null,
});

const order = (overrides: any) => ({
  id: 'order-1',
  customer_name: 'Alpha',
  created_at: '2026-04-01T09:00:00.000Z',
  status: OrderStatus.Pending,
  items: [],
  total_price: 100,
  tags: [],
  ...overrides,
});

describe('sku order search modal view model', () => {
  const products = [product('RN045', Gender.Unisex), product('BR001MS')];

  const orders = [
    order({
      id: 'older',
      customer_id: 'c1',
      customer_name: 'Alpha',
      created_at: '2026-04-01T09:00:00.000Z',
      status: OrderStatus.Pending,
      seller_id: 's1',
      seller_name: 'Maria',
      tags: ['Αθήνα'],
      items: [
        { sku: 'RN045', variant_suffix: 'DLE', quantity: 2, price_at_order: 90 },
        { sku: 'ZZ001', variant_suffix: 'XKR', quantity: 1, price_at_order: 40 },
      ],
    }),
    order({
      id: 'newer',
      customer_id: 'c2',
      customer_name: 'Beta',
      created_at: '2026-04-03T09:00:00.000Z',
      status: OrderStatus.Ready,
      seller_id: 's2',
      seller_name: 'Alexandros',
      tags: ['Θεσσαλονίκη'],
      items: [
        { sku: 'RN045', variant_suffix: 'TG', quantity: 3, price_at_order: 70 },
        { sku: 'BR001MS', variant_suffix: 'PAK', quantity: 1, price_at_order: 120 },
      ],
    }),
  ] as any[];

  it('finds master SKU variants, newest orders first, with metal and stone suffix metadata', () => {
    const results = buildSkuOrderSearchResults(orders, products as any[], 'RN045');

    expect(results.map((row) => row.order.id)).toEqual(['newer', 'older']);
    expect(results.map((row) => row.totalMatchedQty)).toEqual([3, 2]);
    expect(results[0].matchedItems[0]).toMatchObject({
      fullSku: 'RN045TG',
      finishCode: '',
      finishName: 'Λουστρέ',
      stoneCode: 'TG',
    });
    expect(results[1].matchedItems[0]).toMatchObject({
      fullSku: 'RN045DLE',
      finishCode: 'D',
      stoneCode: 'LE',
    });
  });

  it('filters matched results by finish, stone, customer, seller, tag, and status facets', () => {
    const filters = createEmptySkuOrderSearchFilters();
    filters.finishes.add('');
    filters.stones.add('TG');
    filters.customers.add('c2');
    filters.sellers.add('s2');
    filters.tags.add('Θεσσαλονίκη');
    filters.statuses.add(OrderStatus.Ready);

    const results = buildSkuOrderSearchResults(orders, products as any[], 'RN045', filters);

    expect(results).toHaveLength(1);
    expect(results[0].order.customer_name).toBe('Beta');
    expect(results[0].matchedItems).toHaveLength(1);
    expect(results[0].matchedItems[0].fullSku).toBe('RN045TG');
  });

  it('builds colorable filter facets from the current matched set', () => {
    const results = buildSkuOrderSearchResults(orders, products as any[], 'RN045');
    const facets = buildSkuOrderSearchFacets(results);

    expect(facets.customers.map((item) => item.label)).toEqual(['Alpha', 'Beta']);
    expect(facets.sellers.map((item) => item.label)).toEqual(['Alexandros', 'Maria']);
    expect(facets.tags.map((item) => item.label)).toEqual(['Αθήνα', 'Θεσσαλονίκη']);
    expect(facets.finishes.map((item) => item.key)).toEqual(expect.arrayContaining(['', 'D']));
    expect(facets.stones.map((item) => item.key)).toEqual(expect.arrayContaining(['TG', 'LE']));
  });

  it('shows the final retail client in customer facets', () => {
    const retailOrder = order({
      id: 'retail-order',
      customer_id: RETAIL_CUSTOMER_ID,
      customer_name: RETAIL_CUSTOMER_NAME,
      notes: `${RETAIL_NOTE_PREFIX} Eleni Nikolaou`,
      items: [
        { sku: 'RN045', variant_suffix: 'TG', quantity: 1, price_at_order: 70 },
      ],
    });

    const results = buildSkuOrderSearchResults([retailOrder] as any[], products as any[], 'RN045');
    const facets = buildSkuOrderSearchFacets(results);

    expect(facets.customers).toEqual([
      expect.objectContaining({
        label: `${RETAIL_CUSTOMER_NAME} · Eleni Nikolaou`,
      }),
    ]);
  });

  it('computes delivery and production status for the specific matched sku line', () => {
    const partialOrder = order({
      id: 'partial-order',
      status: OrderStatus.PartiallyDelivered,
      items: [
        { sku: 'RN045', variant_suffix: 'TG', quantity: 3, price_at_order: 70, line_id: 'line-rn' },
        { sku: 'BR001MS', variant_suffix: 'PAK', quantity: 2, price_at_order: 120, line_id: 'line-br' },
      ],
    });
    const shipments = [{
      id: 'shipment-1',
      order_id: 'partial-order',
      shipment_number: 7,
      shipped_at: '2026-04-04T09:00:00.000Z',
      shipped_by: 'Tester',
      created_at: '2026-04-04T09:00:00.000Z',
    }];
    const shipmentItems = [{
      id: 'shipment-item-1',
      shipment_id: 'shipment-1',
      sku: 'RN045',
      variant_suffix: 'TG',
      quantity: 2,
      price_at_order: 70,
      line_id: 'line-rn',
    }];
    const batches = [{
      id: 'batch-rn',
      order_id: 'partial-order',
      sku: 'RN045',
      variant_suffix: 'TG',
      quantity: 1,
      current_stage: ProductionStage.Ready,
      created_at: '2026-04-04T10:00:00.000Z',
      updated_at: '2026-04-04T10:00:00.000Z',
      priority: 'Normal',
      requires_setting: false,
      line_id: 'line-rn',
    }];

    const results = buildSkuOrderSearchResults(
      [partialOrder] as any[],
      products as any[],
      'RN045',
      createEmptySkuOrderSearchFilters(),
      { shipments: shipments as any[], shipmentItems: shipmentItems as any[], batches: batches as any[] },
    );

    expect(results[0].matchedItems).toHaveLength(1);
    expect(results[0].matchedItems[0]).toMatchObject({
      fullSku: 'RN045TG',
      shippedQty: 2,
      inProductionQty: 1,
      remainingQty: 0,
      fulfillmentKind: 'partially_delivered',
      showProductionStageChips: true,
    });
    expect(results[0].matchedItems[0].shipmentAllocations).toEqual([
      expect.objectContaining({ shipmentNumber: 7, quantity: 2 }),
    ]);
  });

  it('exposes the exact production stage and polishing substage for an in-production sku line', () => {
    const productionOrder = order({
      id: 'production-order',
      status: OrderStatus.InProduction,
      items: [
        { sku: 'RN045', variant_suffix: 'TG', quantity: 2, price_at_order: 70, line_id: 'line-rn' },
      ],
    });
    const batches = [{
      id: 'batch-rn-polishing',
      order_id: 'production-order',
      sku: 'RN045',
      variant_suffix: 'TG',
      quantity: 2,
      current_stage: ProductionStage.Polishing,
      pending_dispatch: true,
      created_at: '2026-04-04T10:00:00.000Z',
      updated_at: '2026-04-04T10:00:00.000Z',
      priority: 'Normal',
      requires_setting: false,
      line_id: 'line-rn',
    }];

    const results = buildSkuOrderSearchResults(
      [productionOrder] as any[],
      products as any[],
      'RN045',
      createEmptySkuOrderSearchFilters(),
      { batches: batches as any[] },
    );

    expect(results[0].matchedItems[0]).toMatchObject({
      fulfillmentKind: 'in_production',
      inProductionQty: 2,
      showProductionStageChips: false,
      productionStages: [
        expect.objectContaining({
          label: 'Τεχν. · Αναμονή',
          qty: 2,
        }),
      ],
    });
  });
});
