import { describe, expect, it } from 'vitest';
import {
  allocationFromRequirement,
  buildSupplierPurchaseNeedPlan,
} from '../../features/suppliers/purchaseNeedPlanner';
import { Gender, OrderStatus, ProductionStage, ProductionType, type Product, type SupplierOrder } from '../../types';

const supplierId = 'supplier-1';
const product = (overrides: Partial<Product> = {}): Product => ({
  sku: 'IMP001',
  prefix: 'IMP',
  category: 'Ring',
  gender: Gender.Unisex,
  image_url: null,
  weight_g: 0,
  plating_type: 'None' as any,
  production_type: ProductionType.Imported,
  supplier_id: supplierId,
  active_price: 0,
  draft_price: 0,
  selling_price: 0,
  stock_qty: 0,
  sample_qty: 0,
  molds: [],
  is_component: false,
  recipe: [],
  variants: [{ suffix: 'X', description: 'Gold', stock_qty: 0, stock_by_size: {} }],
  labor: { casting_cost: 0, setter_cost: 0, technician_cost: 0, stone_setting_cost: 0, plating_cost_x: 0, plating_cost_d: 0, subcontract_cost: 0 },
  ...overrides,
});

const order = (id: string, createdAt: string, quantity: number, overrides: Record<string, unknown> = {}) => ({
  id,
  customer_name: `Customer ${id}`,
  created_at: createdAt,
  status: OrderStatus.Pending,
  items: [{ sku: 'IMP001', variant_suffix: 'X', quantity, price_at_order: 1, line_id: `line-${id}` }],
  total_price: quantity,
  ...overrides,
} as any);

const batch = (id: string, orderId: string, quantity: number, overrides: Record<string, unknown> = {}) => ({
  id,
  order_id: orderId,
  sku: 'IMP001',
  variant_suffix: 'X',
  quantity,
  current_stage: ProductionStage.AwaitingDelivery,
  created_at: '2026-07-02T00:00:00.000Z',
  updated_at: '2026-07-02T00:00:00.000Z',
  priority: 'Normal',
  requires_setting: false,
  line_id: `line-${orderId}`,
  ...overrides,
} as any);

describe('supplier purchase need planner', () => {
  it('keeps partially represented imported demand visible without duplicating the awaiting batch', () => {
    const customerOrder = order('o1', '2026-07-01T00:00:00.000Z', 5, { status: OrderStatus.InProduction });
    const plan = buildSupplierPurchaseNeedPlan({
      supplierId,
      products: [product()],
      orders: [customerOrder],
      productionBatches: [batch('b1', 'o1', 2)],
    });

    expect(plan.productionNeeds[0].totalQty).toBe(2);
    expect(plan.pendingOrderNeeds[0].totalQty).toBe(3);
  });

  it('subtracts shipped quantities from active partially delivered demand', () => {
    const customerOrder = order('o1', '2026-07-01T00:00:00.000Z', 5, { status: OrderStatus.PartiallyDelivered });
    const plan = buildSupplierPurchaseNeedPlan({
      supplierId,
      products: [product()],
      orders: [customerOrder],
      productionBatches: [],
      shipments: [{ id: 's1', order_id: 'o1' } as any],
      shipmentItems: [{ id: 'si1', shipment_id: 's1', sku: 'IMP001', variant_suffix: 'X', line_id: 'line-o1', quantity: 2 } as any],
    });

    expect(plan.pendingOrderNeeds[0].totalQty).toBe(3);
  });

  it('allocates stock once to the oldest order first', () => {
    const plan = buildSupplierPurchaseNeedPlan({
      supplierId,
      products: [product({ variants: [{ suffix: 'X', description: 'Gold', stock_qty: 2 }] })],
      orders: [
        order('old', '2026-07-01T00:00:00.000Z', 2),
        order('new', '2026-07-02T00:00:00.000Z', 3),
      ],
      productionBatches: [],
    });

    expect(plan.pendingOrderNeeds).toHaveLength(1);
    expect(plan.pendingOrderNeeds[0].totalQty).toBe(3);
    expect(plan.pendingOrderNeeds[0].requirements[0].customer).toBe('Customer new');
  });

  it('reserves exact sources from another pending supplier order', () => {
    const baseInput = {
      supplierId,
      products: [product()],
      orders: [order('o1', '2026-07-01T00:00:00.000Z', 2)],
      productionBatches: [],
    };
    const firstPlan = buildSupplierPurchaseNeedPlan(baseInput);
    const requirement = firstPlan.pendingOrderNeeds[0].requirements[0];
    const supplierOrder: SupplierOrder = {
      id: 'po1', supplier_id: supplierId, supplier_name: 'Supplier', created_at: '2026-07-02T00:00:00.000Z', status: 'Pending', total_amount: 0,
      items: [{
        id: 'i1', item_type: 'Product', item_id: 'IMP001', item_name: 'IMP001X', variant_suffix: 'X', quantity: 2,
        manual_quantity: 0, source_allocations: [allocationFromRequirement(requirement)], unit_cost: 0, total_cost: 0,
      }],
    };

    expect(buildSupplierPurchaseNeedPlan({ ...baseInput, supplierOrders: [supplierOrder] }).pendingOrderNeeds).toEqual([]);
  });

  it('uses legacy pending quantities as FIFO identity reservations', () => {
    const legacyOrder: SupplierOrder = {
      id: 'po1', supplier_id: supplierId, supplier_name: 'Supplier', created_at: '2026-07-02T00:00:00.000Z', status: 'Pending', total_amount: 0,
      items: [{ id: 'i1', item_type: 'Product', item_id: 'IMP001', item_name: 'IMP001X', quantity: 2, unit_cost: 0, total_cost: 0 }],
    };
    const plan = buildSupplierPurchaseNeedPlan({
      supplierId,
      products: [product()],
      orders: [order('old', '2026-07-01T00:00:00.000Z', 2), order('new', '2026-07-02T00:00:00.000Z', 1)],
      productionBatches: [],
      supplierOrders: [legacyOrder],
    });

    expect(plan.pendingOrderNeeds[0].totalQty).toBe(1);
    expect(plan.pendingOrderNeeds[0].requirements[0].customer).toBe('Customer new');
  });

  it('keeps received production allocations fulfilled while the batch remains awaiting inspection', () => {
    const customerOrder = order('o1', '2026-07-01T00:00:00.000Z', 2, { status: OrderStatus.InProduction });
    const baseInput = { supplierId, products: [product()], orders: [customerOrder], productionBatches: [batch('b1', 'o1', 2)] };
    const requirement = buildSupplierPurchaseNeedPlan(baseInput).productionNeeds[0].requirements[0];
    const received: SupplierOrder = {
      id: 'po1', supplier_id: supplierId, supplier_name: 'Supplier', created_at: '2026-07-02T00:00:00.000Z', received_at: '2026-07-03T00:00:00.000Z', status: 'Received', total_amount: 0,
      items: [{ id: 'i1', item_type: 'Product', item_id: 'IMP001', item_name: 'IMP001X', variant_suffix: 'X', quantity: 2, manual_quantity: 0, source_allocations: [allocationFromRequirement(requirement)], unit_cost: 0, total_cost: 0 }],
    };

    expect(buildSupplierPurchaseNeedPlan({ ...baseInput, supplierOrders: [received] }).productionNeeds).toEqual([]);
  });

  it('keeps a pending-order reservation when its source transitions into an awaiting batch', () => {
    const pendingOrder = order('o1', '2026-07-01T00:00:00.000Z', 2);
    const pendingPlan = buildSupplierPurchaseNeedPlan({ supplierId, products: [product()], orders: [pendingOrder], productionBatches: [] });
    const allocation = allocationFromRequirement(pendingPlan.pendingOrderNeeds[0].requirements[0]);
    const purchaseOrder: SupplierOrder = {
      id: 'po1', supplier_id: supplierId, supplier_name: 'Supplier', created_at: '2026-07-02T00:00:00.000Z', status: 'Pending', total_amount: 0,
      items: [{ id: 'i1', item_type: 'Product', item_id: 'IMP001', item_name: 'IMP001X', variant_suffix: 'X', quantity: 2, manual_quantity: 0, source_allocations: [allocation], unit_cost: 0, total_cost: 0 }],
    };
    const inProductionOrder = { ...pendingOrder, status: OrderStatus.InProduction };
    const plan = buildSupplierPurchaseNeedPlan({
      supplierId,
      products: [product()],
      orders: [inProductionOrder],
      productionBatches: [batch('b1', 'o1', 2)],
      supplierOrders: [purchaseOrder],
    });

    expect(plan.productionNeeds).toEqual([]);
    expect(plan.pendingOrderNeeds).toEqual([]);
    const receivedPlan = buildSupplierPurchaseNeedPlan({
      supplierId,
      products: [product()],
      orders: [inProductionOrder],
      productionBatches: [batch('b1', 'o1', 2)],
      supplierOrders: [{ ...purchaseOrder, status: 'Received', received_at: '2026-07-03T00:00:00.000Z' }],
    });
    expect(receivedPlan.productionNeeds).toEqual([]);
  });

  it('excludes unassigned awaiting products from every supplier smart list', () => {
    const unassignedProduct = product({ supplier_id: undefined, production_type: ProductionType.InHouse });
    const plan = buildSupplierPurchaseNeedPlan({
      supplierId,
      products: [unassignedProduct],
      orders: [],
      productionBatches: [batch('b1', '', 1)],
    });

    expect(plan.productionNeeds).toEqual([]);
    expect(plan.unassignedNeeds[0].totalQty).toBe(1);
  });

  it('keeps size and color identities separate', () => {
    const customerOrder = {
      ...order('o1', '2026-07-01T00:00:00.000Z', 1),
      items: [
        { sku: 'IMP001', variant_suffix: 'X', size_info: '52', cord_color: 'black', quantity: 1, price_at_order: 1, line_id: 'a' },
        { sku: 'IMP001', variant_suffix: 'X', size_info: '54', cord_color: 'red', quantity: 1, price_at_order: 1, line_id: 'b' },
      ],
    } as any;
    const plan = buildSupplierPurchaseNeedPlan({ supplierId, products: [product()], orders: [customerOrder], productionBatches: [] });

    expect(plan.pendingOrderNeeds).toHaveLength(2);
    expect(plan.pendingOrderNeeds.map((need) => [need.size, need.cordColor])).toEqual([['52', 'black'], ['54', 'red']]);
  });
});
