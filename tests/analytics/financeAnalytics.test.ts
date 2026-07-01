import { describe, expect, it } from 'vitest';
import {
  Gender,
  LegalDocument,
  Material,
  MaterialType,
  Order,
  OrderShipment,
  OrderShipmentItem,
  OrderStatus,
  PlatingType,
  Product,
  ProductionType,
  VatRegime,
} from '../../types';
import { buildFinanceAnalytics, getDefaultFinancePeriod } from '../../utils/financeAnalytics';

const settings = {
  silver_price_gram: 1,
  loss_percentage: 0,
  barcode_width_mm: 50,
  barcode_height_mm: 30,
  retail_barcode_width_mm: 72,
  retail_barcode_height_mm: 10,
  last_calc_silver_price: 1,
};

const materials: Material[] = [
  { id: 'stone', name: 'Ζιργκόν', type: MaterialType.Stone, cost_per_unit: 1, unit: 'τεμ.' },
  { id: 'stone-var', name: 'Πέτρα με τιμή παραλλαγής', type: MaterialType.Stone, cost_per_unit: 1, unit: 'τεμ.', variant_prices: { X: 4 } },
];

function product(overrides: Partial<Product>): Product {
  return {
    sku: overrides.sku || 'SKU',
    prefix: overrides.prefix || 'SK',
    category: overrides.category || 'Δαχτυλίδι',
    gender: overrides.gender || Gender.Women,
    image_url: null,
    weight_g: overrides.weight_g ?? 5,
    secondary_weight_g: overrides.secondary_weight_g,
    plating_type: overrides.plating_type || PlatingType.None,
    production_type: overrides.production_type || ProductionType.InHouse,
    active_price: overrides.active_price ?? 10,
    draft_price: overrides.draft_price ?? 10,
    selling_price: overrides.selling_price ?? 30,
    stock_qty: overrides.stock_qty ?? 0,
    sample_qty: 0,
    molds: [],
    is_component: overrides.is_component ?? false,
    variants: overrides.variants,
    recipe: overrides.recipe || [],
    labor: overrides.labor || {
      casting_cost: 0,
      setter_cost: 0,
      technician_cost: 0,
      stone_setting_cost: 0,
      plating_cost_x: 0,
      plating_cost_d: 0,
      subcontract_cost: 0,
    },
    collections: overrides.collections || [],
  };
}

function order(overrides: Partial<Order>): Order {
  return {
    id: overrides.id || 'order-1',
    customer_id: overrides.customer_id,
    customer_name: overrides.customer_name || 'Πελάτης',
    customer_phone: '',
    seller_id: overrides.seller_id,
    seller_name: overrides.seller_name,
    seller_commission_percent: overrides.seller_commission_percent,
    created_at: overrides.created_at || '2026-02-01T10:00:00.000Z',
    status: overrides.status || OrderStatus.Pending,
    items: overrides.items || [],
    total_price: overrides.total_price || 0,
    vat_rate: overrides.vat_rate,
    discount_percent: overrides.discount_percent,
    custom_silver_rate: overrides.custom_silver_rate,
  };
}

function shipment(overrides: Partial<OrderShipment>): OrderShipment {
  return {
    id: overrides.id || 'ship-1',
    order_id: overrides.order_id || 'order-1',
    shipment_number: overrides.shipment_number || 1,
    shipped_at: overrides.shipped_at || '2026-03-05T10:00:00.000Z',
    shipped_by: overrides.shipped_by || 'admin',
    created_at: overrides.created_at || overrides.shipped_at || '2026-03-05T10:00:00.000Z',
  };
}

function shipmentItem(overrides: Partial<OrderShipmentItem>): OrderShipmentItem {
  return {
    id: overrides.id || 'ship-item-1',
    shipment_id: overrides.shipment_id || 'ship-1',
    sku: overrides.sku || 'SKU',
    variant_suffix: overrides.variant_suffix,
    size_info: overrides.size_info,
    cord_color: overrides.cord_color,
    enamel_color: overrides.enamel_color,
    quantity: overrides.quantity || 1,
    price_at_order: overrides.price_at_order || 10,
    line_id: overrides.line_id,
  };
}

describe('buildFinanceAnalytics', () => {
  it('counts only shipped net revenue and keeps remaining quantities as backlog', () => {
    const analytics = buildFinanceAnalytics({
      orders: [
        order({
          id: 'order-partial',
          status: OrderStatus.PartiallyDelivered,
          discount_percent: 10,
          vat_rate: VatRegime.Standard,
          items: [{ sku: 'RING', quantity: 5, price_at_order: 100, line_id: 'line-a' }],
        }),
      ],
      shipments: [shipment({ id: 'shipment-a', order_id: 'order-partial', shipped_at: '2026-03-05T10:00:00.000Z' })],
      shipmentItems: [shipmentItem({ shipment_id: 'shipment-a', sku: 'RING', quantity: 2, price_at_order: 100, line_id: 'line-a' })],
      products: [product({ sku: 'RING', collections: [1] })],
      materials,
      settings,
      collections: [{ id: 1, name: 'Άνοιξη' }],
      sellers: [],
      legalDocuments: [],
      period: { mode: 'all_time' },
      now: new Date('2026-06-12T10:00:00.000Z'),
    });

    expect(analytics.totals.realizedNet).toBeCloseTo(180);
    expect(analytics.totals.discount).toBeCloseTo(20);
    expect(analytics.totals.vat).toBeCloseTo(43.2);
    expect(analytics.totals.backlogNet).toBeCloseTo(270);
    expect(analytics.totals.shippedPieces).toBe(2);
    expect(analytics.totals.backlogPieces).toBe(3);
    expect(analytics.topProducts[0]).toMatchObject({ sku: 'RING', quantity: 2, revenue: 180 });
    expect(analytics.topCollections[0]).toMatchObject({ id: 1, name: 'Άνοιξη', quantity: 2, revenue: 180 });
  });

  it('treats delivered legacy orders without shipments as fully shipped', () => {
    const analytics = buildFinanceAnalytics({
      orders: [
        order({
          id: 'legacy',
          status: OrderStatus.Delivered,
          created_at: '2025-12-20T10:00:00.000Z',
          items: [{ sku: 'LEG', quantity: 3, price_at_order: 40 }],
          vat_rate: VatRegime.Zero,
        }),
      ],
      shipments: [],
      shipmentItems: [],
      products: [product({ sku: 'LEG' })],
      materials,
      settings,
      collections: [],
      sellers: [],
      legalDocuments: [],
      period: { mode: 'all_time' },
      now: new Date('2026-06-12T10:00:00.000Z'),
    });

    expect(analytics.totals.realizedNet).toBe(120);
    expect(analytics.totals.backlogNet).toBe(0);
    expect(analytics.events.realized[0]).toMatchObject({ source: 'legacy_delivered_order', orderId: 'legacy' });
  });

  it('uses shipment dates for period filtering and default period is the current year', () => {
    const analytics = buildFinanceAnalytics({
      orders: [
        order({ id: 'o-2025', status: OrderStatus.PartiallyDelivered, items: [{ sku: 'A', quantity: 1, price_at_order: 100 }] }),
        order({ id: 'o-2026', status: OrderStatus.PartiallyDelivered, items: [{ sku: 'A', quantity: 1, price_at_order: 200 }] }),
      ],
      shipments: [
        shipment({ id: 's-2025', order_id: 'o-2025', shipped_at: '2025-12-31T10:00:00.000Z' }),
        shipment({ id: 's-2026', order_id: 'o-2026', shipped_at: '2026-01-01T10:00:00.000Z' }),
      ],
      shipmentItems: [
        shipmentItem({ shipment_id: 's-2025', sku: 'A', quantity: 1, price_at_order: 100 }),
        shipmentItem({ shipment_id: 's-2026', sku: 'A', quantity: 1, price_at_order: 200 }),
      ],
      products: [product({ sku: 'A' })],
      materials,
      settings,
      collections: [],
      sellers: [],
      legalDocuments: [],
      period: getDefaultFinancePeriod(new Date('2026-06-12T10:00:00.000Z')),
      now: new Date('2026-06-12T10:00:00.000Z'),
    });

    expect(analytics.period.label).toBe('Τρέχον έτος');
    expect(analytics.totals.realizedNet).toBe(200);
    expect(analytics.timeChartData.map((item) => item.name)).toEqual(['Ιαν 26']);
  });

  it('keeps month and quarter dashboard stats populated at a new period boundary', () => {
    const commonInput = {
      orders: [
        order({ id: 'o-may', status: OrderStatus.PartiallyDelivered, items: [{ sku: 'A', quantity: 1, price_at_order: 50 }] }),
        order({ id: 'o-jun', status: OrderStatus.PartiallyDelivered, items: [{ sku: 'A', quantity: 1, price_at_order: 100 }] }),
        order({ id: 'o-apr', status: OrderStatus.PartiallyDelivered, items: [{ sku: 'A', quantity: 1, price_at_order: 200 }] }),
        order({ id: 'o-mar', status: OrderStatus.PartiallyDelivered, items: [{ sku: 'A', quantity: 1, price_at_order: 400 }] }),
      ],
      shipments: [
        shipment({ id: 's-may', order_id: 'o-may', shipped_at: '2026-05-31T10:00:00.000Z' }),
        shipment({ id: 's-jun', order_id: 'o-jun', shipped_at: '2026-06-30T10:00:00.000Z' }),
        shipment({ id: 's-apr', order_id: 'o-apr', shipped_at: '2026-04-01T10:00:00.000Z' }),
        shipment({ id: 's-mar', order_id: 'o-mar', shipped_at: '2026-03-31T10:00:00.000Z' }),
      ],
      shipmentItems: [
        shipmentItem({ shipment_id: 's-may', sku: 'A', quantity: 1, price_at_order: 50 }),
        shipmentItem({ shipment_id: 's-jun', sku: 'A', quantity: 1, price_at_order: 100 }),
        shipmentItem({ shipment_id: 's-apr', sku: 'A', quantity: 1, price_at_order: 200 }),
        shipmentItem({ shipment_id: 's-mar', sku: 'A', quantity: 1, price_at_order: 400 }),
      ],
      products: [product({ sku: 'A' })],
      materials,
      settings,
      collections: [],
      sellers: [],
      legalDocuments: [],
      now: new Date('2026-07-01T10:00:00.000Z'),
    };

    const month = buildFinanceAnalytics({
      ...commonInput,
      period: { mode: 'current_month' },
    });
    const quarter = buildFinanceAnalytics({
      ...commonInput,
      period: { mode: 'current_quarter' },
    });

    expect(month.totals.realizedNet).toBe(100);
    expect(month.costBreakdown.silver).toBe(5);
    expect(quarter.totals.realizedNet).toBe(350);
    expect(quarter.costBreakdown.silver).toBe(15);
  });

  it('calculates variant-aware estimated cost and profit', () => {
    const analytics = buildFinanceAnalytics({
      orders: [order({ id: 'variant-order', status: OrderStatus.Delivered, items: [{ sku: 'VAR', variant_suffix: 'X', quantity: 1, price_at_order: 50 }] })],
      shipments: [],
      shipmentItems: [],
      products: [
        product({
          sku: 'VAR',
          weight_g: 2,
          variants: [{ suffix: 'X', description: 'Επίχρυσο', stock_qty: 0, selling_price: 50 }],
          recipe: [{ type: 'raw', id: 'stone-var', quantity: 1 }],
          labor: {
            casting_cost: 0,
            setter_cost: 0,
            technician_cost: 0,
            stone_setting_cost: 0,
            plating_cost_x: 3,
            plating_cost_d: 0,
            subcontract_cost: 0,
          },
        }),
      ],
      materials,
      settings,
      collections: [],
      sellers: [],
      legalDocuments: [],
      period: { mode: 'all_time' },
      now: new Date('2026-06-12T10:00:00.000Z'),
    });

    const line = analytics.itemsBreakdown[0];
    // Suffix "X" is finish (Επίχρυσο), not a stone code — recipe uses base material cost (1€), not variant_prices.X (4€).
    expect(line.estimatedCost).toBeCloseTo(8.9);
    expect(line.profit).toBeCloseTo(41.1);
    expect(line.costBreakdown).toMatchObject({
      silver: 2,
      materials: 1,
      labor: 5.9, // casting 0.3 + technician 2.6 + plating 3
    });
  });

  it('aggregates topVariants separately per sku and variant suffix', () => {
    const analytics = buildFinanceAnalytics({
      orders: [
        order({
          id: 'variant-order',
          status: OrderStatus.PartiallyDelivered,
          items: [
            { sku: 'VAR', variant_suffix: 'X', quantity: 2, price_at_order: 50 },
            { sku: 'VAR', variant_suffix: 'P', quantity: 1, price_at_order: 40 },
          ],
        }),
      ],
      shipments: [shipment({ id: 'variant-ship', order_id: 'variant-order' })],
      shipmentItems: [
        shipmentItem({ shipment_id: 'variant-ship', sku: 'VAR', variant_suffix: 'X', quantity: 2, price_at_order: 50 }),
        shipmentItem({ shipment_id: 'variant-ship', sku: 'VAR', variant_suffix: 'P', quantity: 1, price_at_order: 40 }),
      ],
      products: [
        product({
          sku: 'VAR',
          variants: [
            { suffix: 'X', description: 'Επίχρυσο', stock_qty: 0, selling_price: 50 },
            { suffix: 'P', description: 'Πατίνα', stock_qty: 0, selling_price: 40 },
          ],
        }),
      ],
      materials,
      settings,
      collections: [],
      sellers: [],
      legalDocuments: [],
      period: { mode: 'all_time' },
      now: new Date('2026-06-12T10:00:00.000Z'),
    });

    expect(analytics.topVariants).toHaveLength(2);
    expect(analytics.topVariants.find((row) => row.variantSuffix === 'X')).toMatchObject({
      sku: 'VAR',
      quantity: 2,
      revenue: 100,
    });
    expect(analytics.topVariants.find((row) => row.variantSuffix === 'P')).toMatchObject({
      sku: 'VAR',
      quantity: 1,
      revenue: 40,
    });
  });

  it('merges variant suffixes regardless of case', () => {
    const analytics = buildFinanceAnalytics({
      orders: [
        order({
          id: 'case-order',
          status: OrderStatus.PartiallyDelivered,
          items: [
            { sku: 'VAR', variant_suffix: 'xtg', quantity: 2, price_at_order: 50, line_id: 'line-a' },
            { sku: 'VAR', variant_suffix: 'XTG', quantity: 3, price_at_order: 50, line_id: 'line-b' },
          ],
        }),
      ],
      shipments: [shipment({ id: 'case-ship', order_id: 'case-order' })],
      shipmentItems: [
        shipmentItem({ shipment_id: 'case-ship', sku: 'VAR', variant_suffix: 'xtg', quantity: 2, price_at_order: 50, line_id: 'line-a' }),
        shipmentItem({ shipment_id: 'case-ship', sku: 'VAR', variant_suffix: 'XTG', quantity: 3, price_at_order: 50, line_id: 'line-b' }),
      ],
      products: [product({ sku: 'VAR', variants: [{ suffix: 'XTG', description: '', stock_qty: 0, selling_price: 50 }] })],
      materials,
      settings,
      collections: [],
      sellers: [],
      legalDocuments: [],
      period: { mode: 'all_time' },
      now: new Date('2026-06-12T10:00:00.000Z'),
    });

    expect(analytics.topVariants).toHaveLength(1);
    expect(analytics.topVariants[0]).toMatchObject({ variantSuffix: 'XTG', quantity: 5, revenue: 250 });
  });

  it('resolves full sku lines without variant_suffix into proper variant buckets', () => {
    const analytics = buildFinanceAnalytics({
      orders: [
        order({
          id: 'full-sku-order',
          status: OrderStatus.PartiallyDelivered,
          items: [{ sku: 'RN045XTG', quantity: 2, price_at_order: 40 }],
        }),
      ],
      shipments: [shipment({ id: 'full-sku-ship', order_id: 'full-sku-order' })],
      shipmentItems: [
        shipmentItem({ shipment_id: 'full-sku-ship', sku: 'RN045XTG', quantity: 2, price_at_order: 40 }),
      ],
      products: [
        product({
          sku: 'RN045',
          variants: [{ suffix: 'XTG', description: '', stock_qty: 0, selling_price: 40 }],
        }),
      ],
      materials,
      settings,
      collections: [],
      sellers: [],
      legalDocuments: [],
      period: { mode: 'all_time' },
      now: new Date('2026-06-12T10:00:00.000Z'),
    });

    expect(analytics.topVariants).toHaveLength(1);
    expect(analytics.topVariants[0]).toMatchObject({ sku: 'RN045', variantSuffix: 'XTG', quantity: 2 });
  });

  it('calculates seller earned commission from shipped net value and pending commission from backlog', () => {
    const analytics = buildFinanceAnalytics({
      orders: [
        order({
          id: 'seller-order',
          status: OrderStatus.PartiallyDelivered,
          seller_id: 'seller-1',
          seller_name: 'Μαρία',
          seller_commission_percent: 5,
          items: [{ sku: 'SELL', quantity: 4, price_at_order: 100 }],
        }),
      ],
      shipments: [shipment({ id: 'seller-shipment', order_id: 'seller-order' })],
      shipmentItems: [shipmentItem({ shipment_id: 'seller-shipment', sku: 'SELL', quantity: 1, price_at_order: 100 })],
      products: [product({ sku: 'SELL' })],
      materials,
      settings,
      collections: [],
      sellers: [{ id: 'seller-1', email: 'maria@example.com', full_name: 'Μαρία', is_approved: true, role: 'seller', commission_percent: 10 }],
      legalDocuments: [],
      period: { mode: 'all_time' },
      now: new Date('2026-06-12T10:00:00.000Z'),
    });

    expect(analytics.topSellers[0]).toMatchObject({
      id: 'seller-1',
      name: 'Μαρία',
      revenue: 100,
      earnedCommission: 5,
      pendingCommission: 15,
    });
  });

  it('reconciles issued legal documents separately from operational shipped revenue', () => {
    const issued = {
      id: 'legal-1',
      source_kind: 'order',
      document_kind: 'invoice',
      aade_document_type: '1.1',
      status: 'issued',
      issue_date: '2026-03-06',
      issuer: {} as any,
      counterpart: {} as any,
      payment_method_code: 5,
      currency: 'EUR',
      revenue_classification: [],
      totals: { net: 80, vat: 19.2, gross: 99.2, quantity: 1 },
      created_at: '2026-03-06T10:00:00.000Z',
      updated_at: '2026-03-06T10:00:00.000Z',
    } as LegalDocument;

    const draft = { ...issued, id: 'legal-draft', status: 'draft', totals: { net: 999, vat: 0, gross: 999, quantity: 1 } } as LegalDocument;

    const analytics = buildFinanceAnalytics({
      orders: [order({ id: 'legal-order', status: OrderStatus.Delivered, items: [{ sku: 'LGL', quantity: 1, price_at_order: 100 }] })],
      shipments: [],
      shipmentItems: [],
      products: [product({ sku: 'LGL' })],
      materials,
      settings,
      collections: [],
      sellers: [],
      legalDocuments: [issued, draft],
      period: { mode: 'all_time' },
      now: new Date('2026-06-12T10:00:00.000Z'),
    });

    expect(analytics.legal.issuedNet).toBe(80);
    expect(analytics.legal.issuedVat).toBe(19.2);
    expect(analytics.legal.issuedGross).toBe(99.2);
    expect(analytics.legal.netGap).toBe(20);
  });

  it('exposes Greek user-facing labels for the main economic concepts', () => {
    const analytics = buildFinanceAnalytics({
      orders: [],
      shipments: [],
      shipmentItems: [],
      products: [],
      materials,
      settings,
      collections: [],
      sellers: [],
      legalDocuments: [],
      period: { mode: 'all_time' },
      now: new Date('2026-06-12T10:00:00.000Z'),
    });

    expect(analytics.labels.realizedRevenue).toBe('Πραγματοποιημένα έσοδα');
    expect(analytics.labels.backlogValue).toBe('Εκκρεμής αξία παραγγελιών');
    expect(analytics.labels.estimatedCost).toBe('Εκτιμώμενο κόστος');
    expect(analytics.labels.legalReconciliation).toBe('Συμφωνία με παραστατικά');
  });

  it('excludes SP special-creation lines from product, collection, and item listings but keeps them in totals', () => {
    const analytics = buildFinanceAnalytics({
      orders: [
        order({
          id: 'mixed-order',
          status: OrderStatus.Delivered,
          items: [
            { sku: 'RING', quantity: 1, price_at_order: 100, line_id: 'line-ring' },
            { sku: 'SP', quantity: 2, price_at_order: 250, line_id: 'line-sp-a' },
          ],
        }),
      ],
      shipments: [],
      shipmentItems: [],
      products: [product({ sku: 'RING', collections: [1] })],
      materials,
      settings,
      collections: [{ id: 1, name: 'Άνοιξη' }],
      sellers: [],
      legalDocuments: [],
      period: { mode: 'all_time' },
      now: new Date('2026-06-12T10:00:00.000Z'),
    });

    expect(analytics.totals.realizedNet).toBe(600);
    expect(analytics.topProducts.map((row) => row.sku)).toEqual(['RING']);
    expect(analytics.topCollections.map((row) => row.name)).toEqual(['Άνοιξη']);
    expect(analytics.categoryChartData.map((row) => row.name)).not.toContain('Ειδική δημιουργία');
    expect(analytics.itemsBreakdown.map((row) => row.sku)).toEqual(['RING']);
    expect(analytics.events.realized.some((row) => row.sku === 'SP')).toBe(true);
  });

  it('dedupes identical realized shipment rows (duplicate shipment_item records)', () => {
    const analytics = buildFinanceAnalytics({
      orders: [
        order({
          id: 'order-dup',
          customer_name: 'Gallery',
          items: [{ sku: 'SKU1', variant_suffix: 'X', quantity: 2, price_at_order: 17.1, line_id: 'line-1' }],
        }),
      ],
      shipments: [shipment({ id: 'ship-dup', order_id: 'order-dup', shipment_number: 1, shipped_at: '2026-04-22T10:00:00.000Z' })],
      shipmentItems: [
        shipmentItem({ id: 'si-1', shipment_id: 'ship-dup', sku: 'SKU1', variant_suffix: 'X', quantity: 2, price_at_order: 17.1, line_id: 'line-1' }),
        shipmentItem({ id: 'si-2', shipment_id: 'ship-dup', sku: 'SKU1', variant_suffix: 'X', quantity: 2, price_at_order: 17.1, line_id: 'line-1' }),
      ],
      products: [product({ sku: 'SKU1' })],
      materials,
      settings,
      period: { mode: 'all_time' },
      now: new Date('2026-06-12T10:00:00.000Z'),
    });

    expect(analytics.events.realized).toHaveLength(1);
    expect(analytics.totals.shippedPieces).toBe(2);
    expect(analytics.events.realized[0].lineId).toBe('line-1');
  });

  it('uses current order seller on all shipment lines after assignment', () => {
    const analytics = buildFinanceAnalytics({
      orders: [
        order({
          id: 'order-seller',
          customer_name: 'Gallery',
          seller_id: 'seller-alex',
          seller_name: 'Αλέξανδρος Παπαϊωαννίδης',
          seller_commission_percent: 10,
          items: [{ sku: 'SKU1', variant_suffix: 'X', quantity: 2, price_at_order: 17.1, line_id: 'line-1' }],
        }),
      ],
      shipments: [shipment({ id: 'ship-1', order_id: 'order-seller', shipment_number: 500, shipped_at: '2026-04-22T10:00:00.000Z' })],
      shipmentItems: [
        shipmentItem({ shipment_id: 'ship-1', sku: 'SKU1', variant_suffix: 'X', quantity: 2, price_at_order: 17.1, line_id: 'line-1' }),
      ],
      products: [product({ sku: 'SKU1' })],
      materials,
      settings,
      sellers: [{ id: 'seller-alex', email: 'alex@test.com', full_name: 'Αλέξανδρος Παπαϊωαννίδης', is_approved: true, role: 'seller', commission_percent: 8 }],
      period: { mode: 'all_time' },
      now: new Date('2026-06-12T10:00:00.000Z'),
    });

    expect(analytics.events.realized).toHaveLength(1);
    expect(analytics.events.realized[0]).toMatchObject({
      sellerId: 'seller-alex',
      sellerName: 'Αλέξανδρος Παπαϊωαννίδης',
      sellerCommissionPercent: 10,
      quantity: 2,
    });
  });

  it('resolves seller name from profile when order seller_name is missing', () => {
    const analytics = buildFinanceAnalytics({
      orders: [
        order({
          id: 'order-no-name',
          seller_id: 'seller-alex',
          items: [{ sku: 'SKU1', quantity: 1, price_at_order: 100, line_id: 'line-1' }],
        }),
      ],
      shipments: [shipment({ id: 'ship-1', order_id: 'order-no-name' })],
      shipmentItems: [shipmentItem({ shipment_id: 'ship-1', sku: 'SKU1', quantity: 1, price_at_order: 100, line_id: 'line-1' })],
      products: [product({ sku: 'SKU1' })],
      materials,
      settings,
      sellers: [{ id: 'seller-alex', email: 'alex@test.com', full_name: 'Αλέξανδρος Παπαϊωαννίδης', is_approved: true, role: 'seller' }],
      period: { mode: 'all_time' },
      now: new Date('2026-06-12T10:00:00.000Z'),
    });

    expect(analytics.events.realized[0].sellerName).toBe('Αλέξανδρος Παπαϊωαννίδης');
  });
});
