import {
  Collection,
  GlobalSettings,
  LegalDocument,
  Material,
  Order,
  OrderItem,
  OrderShipment,
  OrderShipmentItem,
  OrderStatus,
  Product,
  UserProfile,
} from '../types';
import { calculateProductCost, estimateVariantCost } from './pricingEngine';
import { getShippedQuantitiesForOrderLines, itemKey } from '../utils/shipmentUtils';
import { isSpecialCreationSku } from './specialCreationSku';
import { resolveFinanceLineSku, variantRankingKey, normalizeVariantSuffix } from './financeLineSku';

const RETAIL_CUSTOMER_ID = '00000000-0000-0000-0000-000000000003';
const RETAIL_CUSTOMER_NAME = 'Λιανική';

export type FinancePeriodMode = 'current_month' | 'current_quarter' | 'current_year' | 'all_time';

export interface FinancePeriodSelection {
  mode: FinancePeriodMode;
}

export interface ResolvedFinancePeriod extends FinancePeriodSelection {
  label: string;
  start: Date | null;
  end: Date | null;
}

export interface FinanceAnalyticsInput {
  orders: Order[];
  shipments: OrderShipment[];
  shipmentItems: OrderShipmentItem[];
  products: Product[];
  materials: Material[];
  settings: GlobalSettings;
  collections?: Collection[];
  sellers?: UserProfile[];
  legalDocuments?: LegalDocument[];
  period?: FinancePeriodSelection;
  now?: Date;
}

export interface FinanceLineEvent {
  source: 'shipment' | 'legacy_delivered_order' | 'backlog';
  orderId: string;
  shipmentId?: string | null;
  shipmentNumber?: number | null;
  date: string;
  customerId?: string | null;
  customerName: string;
  sellerId?: string | null;
  sellerName?: string | null;
  sellerCommissionPercent: number;
  sku: string;
  variantSuffix?: string | null;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  discount: number;
  net: number;
  vat: number;
  gross: number;
  estimatedUnitCost: number;
  estimatedCost: number;
  profit: number;
  margin: number;
  category: string;
  collectionId: number | null;
  collectionName: string;
  productImage: string | null;
  silverWeight: number;
  costBreakdown: {
    silver: number;
    labor: number;
    materials: number;
  };
  priceOverride: boolean;
  costWarning?: string;
}

export interface FinanceTotals {
  realizedNet: number;
  realizedGross: number;
  discount: number;
  vat: number;
  estimatedCost: number;
  estimatedProfit: number;
  margin: number;
  backlogNet: number;
  backlogGross: number;
  backlogVat: number;
  shippedPieces: number;
  backlogPieces: number;
  realizedOrderCount: number;
  activeOrderCount: number;
  averageOrderValue: number;
  averageBasketSize: number;
  silverWeightGrams: number;
  silverWeightKg: number;
}

export interface FinanceRankingBase {
  revenue: number;
  estimatedCost: number;
  profit: number;
  margin: number;
  quantity: number;
}

export interface FinanceProductRanking extends FinanceRankingBase {
  sku: string;
  image: string | null;
}

export interface FinanceVariantRanking extends FinanceRankingBase {
  sku: string;
  variantSuffix: string;
  image: string | null;
  category: string;
}

export interface FinanceCollectionRanking extends FinanceRankingBase {
  id: number | null;
  name: string;
}

export interface FinanceCustomerRanking {
  id: string;
  name: string;
  revenue: number;
  orders: number;
}

export interface FinanceSellerRanking {
  id: string;
  name: string;
  revenue: number;
  earnedCommission: number;
  pendingRevenue: number;
  pendingCommission: number;
  orders: number;
}

export interface FinanceCategoryRanking extends FinanceRankingBase {
  name: string;
}

export interface FinanceTimePoint {
  name: string;
  revenue: number;
  profit: number;
}

export interface FinanceLegalReconciliation {
  issuedNet: number;
  issuedVat: number;
  issuedGross: number;
  issuedCount: number;
  netGap: number;
}

export interface FinanceAnalytics {
  period: ResolvedFinancePeriod;
  labels: Record<
    | 'realizedRevenue'
    | 'backlogValue'
    | 'estimatedCost'
    | 'grossProfit'
    | 'margin'
    | 'discount'
    | 'vat'
    | 'legalReconciliation',
    string
  >;
  totals: FinanceTotals;
  costBreakdown: {
    silver: number;
    labor: number;
    materials: number;
  };
  legal: FinanceLegalReconciliation;
  events: {
    realized: FinanceLineEvent[];
    backlog: FinanceLineEvent[];
  };
  itemsBreakdown: FinanceLineEvent[];
  backlogBreakdown: FinanceLineEvent[];
  topProducts: FinanceProductRanking[];
  topVariants: FinanceVariantRanking[];
  topCollections: FinanceCollectionRanking[];
  topCustomers: FinanceCustomerRanking[];
  topSellers: FinanceSellerRanking[];
  categoryChartData: FinanceCategoryRanking[];
  timeChartData: FinanceTimePoint[];
  costWarnings: string[];
  isSingleOrder: boolean;
  totalRevenue: number;
  totalProfit: number;
  totalCost: number;
  totalItems: number;
  totalItemsSold: number;
  orderCount: number;
  avgOrderValue: number;
  averageOrderValue: number;
  avgBasketSize: number;
  avgMargin: number;
  profitMargin: number;
  cogsPercent: number;
  silverSoldWeight: number;
  silverSoldKg: number;
  silverCostSum: number;
  laborCostSum: number;
  materialCostSum: number;
}

const GREEK_LABELS: FinanceAnalytics['labels'] = {
  realizedRevenue: 'Πραγματοποιημένα έσοδα',
  backlogValue: 'Εκκρεμής αξία παραγγελιών',
  estimatedCost: 'Εκτιμώμενο κόστος',
  grossProfit: 'Μικτό κέρδος',
  margin: 'Περιθώριο',
  discount: 'Έκπτωση',
  vat: 'ΦΠΑ',
  legalReconciliation: 'Συμφωνία με παραστατικά',
};

function roundMoney(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function clampPercent(value?: number | null): number {
  if (!Number.isFinite(value ?? NaN)) return 0;
  return Math.min(100, Math.max(0, Number(value)));
}

function resolvePeriod(selection: FinancePeriodSelection | undefined, now: Date): ResolvedFinancePeriod {
  const mode = selection?.mode || 'current_year';
  const year = now.getFullYear();
  const month = now.getMonth();

  if (mode === 'all_time') return { mode, label: 'Όλα', start: null, end: null };
  if (mode === 'current_month') {
    return {
      mode,
      label: 'Τρέχων μήνας',
      start: new Date(year, month, 1),
      end: new Date(year, month + 1, 1),
    };
  }
  if (mode === 'current_quarter') {
    const quarterStartMonth = Math.floor(month / 3) * 3;
    return {
      mode,
      label: 'Τρέχον τρίμηνο',
      start: new Date(year, quarterStartMonth, 1),
      end: new Date(year, quarterStartMonth + 3, 1),
    };
  }
  return {
    mode: 'current_year',
    label: 'Τρέχον έτος',
    start: new Date(year, 0, 1),
    end: new Date(year + 1, 0, 1),
  };
}

export function getDefaultFinancePeriod(now: Date = new Date()): ResolvedFinancePeriod {
  return resolvePeriod({ mode: 'current_year' }, now);
}

export const FINANCE_PERIOD_OPTIONS: Array<{ mode: FinancePeriodMode; label: string }> = [
  { mode: 'current_month', label: 'Μήνας' },
  { mode: 'current_quarter', label: 'Τρίμηνο' },
  { mode: 'current_year', label: 'Έτος' },
  { mode: 'all_time', label: 'Όλα' },
];

export function isWithinFinancePeriod(dateValue: string | undefined, period: ResolvedFinancePeriod): boolean {
  if (!period.start || !period.end) return true;
  if (!dateValue) return false;
  const time = new Date(dateValue).getTime();
  return time >= period.start.getTime() && time < period.end.getTime();
}

function monthKey(dateValue: string): string {
  const date = new Date(dateValue);
  const month = date.toLocaleDateString('el-GR', { month: 'short' }).replace('.', '');
  return `${month.charAt(0).toUpperCase()}${month.slice(1)} ${String(date.getFullYear()).slice(-2)}`;
}

function getOrderVatRate(order: Order): number {
  return order.vat_rate !== undefined ? order.vat_rate : 0.24;
}

function getProductUnitCost(params: {
  product?: Product;
  variantSuffix?: string | null;
  order: Order;
  settings: GlobalSettings;
  materials: Material[];
  products: Product[];
  productsMap: Map<string, Product>;
  materialsMap: Map<string, Material>;
}): { total: number; breakdown: { silver: number; labor: number; materials: number }; warning?: string } {
  const { product, variantSuffix, order, settings, materials, products, productsMap, materialsMap } = params;
  if (!product) {
    return {
      total: 0,
      breakdown: { silver: 0, labor: 0, materials: 0 },
      warning: `Δεν βρέθηκε προϊόν για υπολογισμό κόστους.`,
    };
  }

  const effectiveSettings = {
    ...settings,
    silver_price_gram: order.custom_silver_rate || settings.silver_price_gram,
  };

  const result = variantSuffix !== undefined && variantSuffix !== null && variantSuffix !== ''
    ? estimateVariantCost(product, variantSuffix, effectiveSettings, materials, products, undefined, productsMap, materialsMap)
    : calculateProductCost(product, effectiveSettings, materials, products, 0, new Set(), undefined, productsMap, materialsMap);

  return {
    total: Number(result.total || 0),
    breakdown: {
      silver: Number(result.breakdown?.silver || 0),
      labor: Number(result.breakdown?.labor || 0),
      materials: Number(result.breakdown?.materials || 0),
    },
  };
}

function buildLineEvent(params: {
  source: FinanceLineEvent['source'];
  order: Order;
  item: Pick<OrderItem, 'sku' | 'variant_suffix' | 'quantity' | 'price_at_order' | 'size_info' | 'cord_color' | 'enamel_color' | 'line_id' | 'price_override'>;
  quantity: number;
  date: string;
  shipment?: OrderShipment | null;
  product?: Product;
  collectionById: Map<number, Collection>;
  settings: GlobalSettings;
  materials: Material[];
  products: Product[];
  productsMap: Map<string, Product>;
  materialsMap: Map<string, Material>;
  sellerById: Map<string, UserProfile>;
}): FinanceLineEvent {
  const {
    source,
    order,
    item,
    quantity,
    date,
    shipment,
    product,
    collectionById,
    settings,
    materials,
    products,
    productsMap,
    materialsMap,
    sellerById,
  } = params;

  const discountPercent = clampPercent(order.discount_percent);
  const vatRate = getOrderVatRate(order);
  const subtotal = Number(item.price_at_order || 0) * quantity;
  const discount = subtotal * (discountPercent / 100);
  const net = subtotal - discount;
  const vat = net * vatRate;
  const gross = net + vat;

  const resolvedSku = resolveFinanceLineSku(item, products, productsMap);
  const effectiveProduct = resolvedSku.product ?? product;
  const effectiveVariantSuffix = resolvedSku.variantSuffix || null;

  const unitCost = getProductUnitCost({
    product: effectiveProduct,
    variantSuffix: effectiveVariantSuffix,
    order,
    settings,
    materials,
    products,
    productsMap,
    materialsMap,
  });
  const estimatedCost = unitCost.total * quantity;
  const profit = net - estimatedCost;
  const seller = order.seller_id ? sellerById.get(order.seller_id) : undefined;
  const sellerCommissionPercent = clampPercent(order.seller_commission_percent ?? seller?.commission_percent ?? 0);
  const productCollections = effectiveProduct?.collections || product?.collections || [];
  const collectionId = productCollections.length > 0 ? productCollections[0] : null;
  const collectionName = collectionId !== null ? (collectionById.get(collectionId)?.name || 'Χωρίς όνομα') : 'Χωρίς συλλογή';
  const category = isSpecialCreationSku(resolvedSku.masterSku)
    ? 'Ειδική δημιουργία'
    : (effectiveProduct?.category || product?.category || 'Χωρίς προϊόν');
  const silverWeight = ((effectiveProduct?.weight_g || product?.weight_g || 0) + (effectiveProduct?.secondary_weight_g || product?.secondary_weight_g || 0)) * quantity;

  return {
    source,
    orderId: order.id,
    shipmentId: shipment?.id || null,
    shipmentNumber: shipment?.shipment_number || null,
    date,
    customerId: order.customer_id || null,
    customerName: order.customer_name,
    sellerId: order.seller_id || null,
    sellerName: order.seller_name || seller?.full_name || null,
    sellerCommissionPercent,
    sku: resolvedSku.masterSku,
    variantSuffix: effectiveVariantSuffix,
    quantity,
    unitPrice: Number(item.price_at_order || 0),
    subtotal,
    discount,
    net,
    vat,
    gross,
    estimatedUnitCost: unitCost.total,
    estimatedCost,
    profit,
    margin: net > 0 ? (profit / net) * 100 : 0,
    category,
    collectionId,
    collectionName,
    productImage: effectiveProduct?.image_url || product?.image_url || null,
    silverWeight,
    costBreakdown: {
      silver: unitCost.breakdown.silver * quantity,
      labor: unitCost.breakdown.labor * quantity,
      materials: unitCost.breakdown.materials * quantity,
    },
    priceOverride: Boolean(item.price_override),
    costWarning: unitCost.warning ? `${resolvedSku.masterSku}: ${unitCost.warning}` : undefined,
  };
}

function addRankingTotals<T extends FinanceRankingBase>(target: T, event: FinanceLineEvent) {
  target.revenue += event.net;
  target.estimatedCost += event.estimatedCost;
  target.profit += event.profit;
  target.quantity += event.quantity;
  target.margin = target.revenue > 0 ? (target.profit / target.revenue) * 100 : 0;
}

function sortRankings<T extends FinanceRankingBase>(values: T[]): T[] {
  return values
    .map((item) => ({ ...item, revenue: roundMoney(item.revenue), estimatedCost: roundMoney(item.estimatedCost), profit: roundMoney(item.profit) }))
    .sort((a, b) => b.revenue - a.revenue);
}

function getShippedQuantityMap(
  order: Order,
  shipments: OrderShipment[],
  shipmentItems: OrderShipmentItem[],
): Map<string, number> {
  const shipmentIds = new Set(shipments.filter((shipment) => shipment.order_id === order.id).map((shipment) => shipment.id));
  const filteredItems = shipmentItems.filter((item) => shipmentIds.has(item.shipment_id));
  return getShippedQuantitiesForOrderLines(order.items, filteredItems);
}

export function buildFinanceAnalytics(input: FinanceAnalyticsInput): FinanceAnalytics {
  const now = input.now || new Date();
  const period = resolvePeriod(input.period, now);
  const orders = input.orders || [];
  const products = input.products || [];
  const materials = input.materials || [];
  const settings = input.settings;
  const shipments = input.shipments || [];
  const shipmentItems = input.shipmentItems || [];
  const productsMap = new Map(products.map((product) => [product.sku, product]));
  const materialsMap = new Map(materials.map((material) => [material.id, material]));
  const collectionById = new Map((input.collections || []).map((collection) => [collection.id, collection]));
  const sellerById = new Map((input.sellers || []).map((seller) => [seller.id, seller]));
  const shipmentsById = new Map(shipments.map((shipment) => [shipment.id, shipment]));
  const shipmentsByOrderId = new Map<string, OrderShipment[]>();

  shipments.forEach((shipment) => {
    const rows = shipmentsByOrderId.get(shipment.order_id) || [];
    rows.push(shipment);
    shipmentsByOrderId.set(shipment.order_id, rows);
  });

  const realizedEvents: FinanceLineEvent[] = [];
  const backlogEvents: FinanceLineEvent[] = [];

  orders
    .filter((order) => order.status !== OrderStatus.Cancelled)
    .forEach((order) => {
      const orderShipments = shipmentsByOrderId.get(order.id) || [];
      const orderItems = Array.isArray(order.items) ? order.items : [];

      shipmentItems.forEach((shipmentItem) => {
        const shipment = shipmentsById.get(shipmentItem.shipment_id);
        if (!shipment || shipment.order_id !== order.id) return;
        const product = productsMap.get(shipmentItem.sku);
        const event = buildLineEvent({
          source: 'shipment',
          order,
          item: shipmentItem,
          quantity: shipmentItem.quantity,
          date: shipment.shipped_at,
          shipment,
          product,
          collectionById,
          settings,
          materials,
          products,
          productsMap,
          materialsMap,
          sellerById,
        });
        if (isWithinFinancePeriod(event.date, period)) realizedEvents.push(event);
      });

      if (order.status === OrderStatus.Delivered && orderShipments.length === 0) {
        orderItems.forEach((item) => {
          const event = buildLineEvent({
            source: 'legacy_delivered_order',
            order,
            item,
            quantity: item.quantity,
            date: order.created_at,
            shipment: null,
            product: productsMap.get(item.sku),
            collectionById,
            settings,
            materials,
            products,
            productsMap,
            materialsMap,
            sellerById,
          });
          if (isWithinFinancePeriod(event.date, period)) realizedEvents.push(event);
        });
      }

      const shipped = getShippedQuantityMap(order, shipments, shipmentItems);
      orderItems.forEach((item) => {
        if (order.status === OrderStatus.Delivered && orderShipments.length === 0) return;
        const key = itemKey(item.sku, item.variant_suffix, item.size_info, item.cord_color, item.enamel_color, item.line_id);
        const remainingQty = item.quantity - (shipped.get(key) || 0);
        if (remainingQty <= 0) return;
        backlogEvents.push(buildLineEvent({
          source: 'backlog',
          order,
          item,
          quantity: remainingQty,
          date: order.created_at,
          shipment: null,
          product: productsMap.get(item.sku),
          collectionById,
          settings,
          materials,
          products,
          productsMap,
          materialsMap,
          sellerById,
        }));
      });
    });

  const totals = realizedEvents.reduce<FinanceTotals>(
    (acc, event) => {
      acc.realizedNet += event.net;
      acc.realizedGross += event.gross;
      acc.discount += event.discount;
      acc.vat += event.vat;
      acc.estimatedCost += event.estimatedCost;
      acc.estimatedProfit += event.profit;
      acc.shippedPieces += event.quantity;
      acc.silverWeightGrams += event.silverWeight;
      return acc;
    },
    {
      realizedNet: 0,
      realizedGross: 0,
      discount: 0,
      vat: 0,
      estimatedCost: 0,
      estimatedProfit: 0,
      margin: 0,
      backlogNet: 0,
      backlogGross: 0,
      backlogVat: 0,
      shippedPieces: 0,
      backlogPieces: 0,
      realizedOrderCount: 0,
      activeOrderCount: 0,
      averageOrderValue: 0,
      averageBasketSize: 0,
      silverWeightGrams: 0,
      silverWeightKg: 0,
    },
  );

  const backlogOrderIds = new Set<string>();
  backlogEvents.forEach((event) => {
    totals.backlogNet += event.net;
    totals.backlogGross += event.gross;
    totals.backlogVat += event.vat;
    totals.backlogPieces += event.quantity;
    backlogOrderIds.add(event.orderId);
  });

  const realizedOrderIds = new Set(realizedEvents.map((event) => event.orderId));
  totals.realizedOrderCount = realizedOrderIds.size;
  totals.activeOrderCount = backlogOrderIds.size;
  totals.averageOrderValue = totals.realizedOrderCount > 0 ? totals.realizedNet / totals.realizedOrderCount : 0;
  totals.averageBasketSize = totals.realizedOrderCount > 0 ? totals.shippedPieces / totals.realizedOrderCount : 0;
  totals.margin = totals.realizedNet > 0 ? (totals.estimatedProfit / totals.realizedNet) * 100 : 0;
  totals.silverWeightKg = totals.silverWeightGrams / 1000;

  const costBreakdown = realizedEvents.reduce(
    (acc, event) => {
      acc.silver += event.costBreakdown.silver;
      acc.labor += event.costBreakdown.labor;
      acc.materials += event.costBreakdown.materials;
      return acc;
    },
    { silver: 0, labor: 0, materials: 0 },
  );

  const topProductsMap = new Map<string, FinanceProductRanking>();
  const topVariantsMap = new Map<string, FinanceVariantRanking>();
  const topCollectionsMap = new Map<string, FinanceCollectionRanking>();
  const topCustomersMap = new Map<string, FinanceCustomerRanking>();
  const topSellersMap = new Map<string, FinanceSellerRanking>();
  const categoryMap = new Map<string, FinanceCategoryRanking>();
  const timeMap = new Map<string, FinanceTimePoint>();
  const timeOrderMap = new Map<string, number>();

  realizedEvents.forEach((event) => {
    const isSpecialLine = isSpecialCreationSku(event.sku);

    if (!isSpecialLine) {
      const productRow = topProductsMap.get(event.sku) || {
        sku: event.sku,
        image: event.productImage,
        revenue: 0,
        estimatedCost: 0,
        profit: 0,
        margin: 0,
        quantity: 0,
      };
      addRankingTotals(productRow, event);
      topProductsMap.set(event.sku, productRow);

      const variantKey = variantRankingKey(event.sku, event.variantSuffix || '');
      const variantRow = topVariantsMap.get(variantKey) || {
        sku: event.sku,
        variantSuffix: normalizeVariantSuffix(event.variantSuffix),
        image: event.productImage,
        category: event.category,
        revenue: 0,
        estimatedCost: 0,
        profit: 0,
        margin: 0,
        quantity: 0,
      };
      addRankingTotals(variantRow, event);
      topVariantsMap.set(variantKey, variantRow);

      const collectionKey = event.collectionId === null ? 'none' : String(event.collectionId);
      const collectionRow = topCollectionsMap.get(collectionKey) || {
        id: event.collectionId,
        name: event.collectionName,
        revenue: 0,
        estimatedCost: 0,
        profit: 0,
        margin: 0,
        quantity: 0,
      };
      addRankingTotals(collectionRow, event);
      topCollectionsMap.set(collectionKey, collectionRow);

      const categoryRow = categoryMap.get(event.category) || {
        name: event.category,
        revenue: 0,
        estimatedCost: 0,
        profit: 0,
        margin: 0,
        quantity: 0,
      };
      addRankingTotals(categoryRow, event);
      categoryMap.set(event.category, categoryRow);
    }

    const shouldRankCustomer = !(event.customerId === RETAIL_CUSTOMER_ID || event.customerName === RETAIL_CUSTOMER_NAME);
    if (shouldRankCustomer) {
      const customerKey = event.customerId || event.customerName;
      const customerRow = topCustomersMap.get(customerKey) || {
        id: customerKey,
        name: event.customerName,
        revenue: 0,
        orders: 0,
      };
      customerRow.revenue += event.net;
      topCustomersMap.set(customerKey, customerRow);
    }

    if (event.sellerId) {
      const sellerRow = topSellersMap.get(event.sellerId) || {
        id: event.sellerId,
        name: event.sellerName || 'Πλασιέ',
        revenue: 0,
        earnedCommission: 0,
        pendingRevenue: 0,
        pendingCommission: 0,
        orders: 0,
      };
      sellerRow.revenue += event.net;
      sellerRow.earnedCommission += event.net * (event.sellerCommissionPercent / 100);
      topSellersMap.set(event.sellerId, sellerRow);
    }

    const timeKey = monthKey(event.date);
    const timeRow = timeMap.get(timeKey) || { name: timeKey, revenue: 0, profit: 0 };
    timeRow.revenue += event.net;
    timeRow.profit += event.profit;
    timeMap.set(timeKey, timeRow);
    const eventDate = new Date(event.date);
    const monthStart = new Date(eventDate.getFullYear(), eventDate.getMonth(), 1).getTime();
    timeOrderMap.set(timeKey, Math.min(timeOrderMap.get(timeKey) ?? monthStart, monthStart));
  });

  realizedOrderIds.forEach((orderId) => {
    const order = orders.find((item) => item.id === orderId);
    if (order?.seller_id) {
      const sellerRow = topSellersMap.get(order.seller_id);
      if (sellerRow) sellerRow.orders += 1;
    }
  });

  backlogEvents.forEach((event) => {
    if (!event.sellerId) return;
    const sellerRow = topSellersMap.get(event.sellerId) || {
      id: event.sellerId,
      name: event.sellerName || 'Πλασιέ',
      revenue: 0,
      earnedCommission: 0,
      pendingRevenue: 0,
      pendingCommission: 0,
      orders: 0,
    };
    sellerRow.pendingRevenue += event.net;
    sellerRow.pendingCommission += event.net * (event.sellerCommissionPercent / 100);
    topSellersMap.set(event.sellerId, sellerRow);
  });

  realizedEvents.forEach((event) => {
    const customerKey = event.customerId || event.customerName;
    const customerRow = topCustomersMap.get(customerKey);
    if (customerRow) customerRow.orders = new Set(realizedEvents.filter((row) => (row.customerId || row.customerName) === customerKey).map((row) => row.orderId)).size;
  });

  const legalDocuments = input.legalDocuments || [];
  const issuedLegal = legalDocuments.filter((document) => document.status === 'issued' && isWithinFinancePeriod(document.issue_date || document.created_at, period));
  const legal: FinanceLegalReconciliation = {
    issuedNet: roundMoney(issuedLegal.reduce((sum, document) => sum + (document.totals?.net || 0), 0)),
    issuedVat: roundMoney(issuedLegal.reduce((sum, document) => sum + (document.totals?.vat || 0), 0)),
    issuedGross: roundMoney(issuedLegal.reduce((sum, document) => sum + (document.totals?.gross || 0), 0)),
    issuedCount: issuedLegal.length,
    netGap: 0,
  };
  legal.netGap = roundMoney(totals.realizedNet - legal.issuedNet);

  const sortedTime = Array.from(timeMap.values())
    .sort((a, b) => (timeOrderMap.get(a.name) || 0) - (timeOrderMap.get(b.name) || 0))
    .map((item) => ({ ...item, revenue: roundMoney(item.revenue), profit: roundMoney(item.profit) }));

  const roundedTotals: FinanceTotals = {
    ...totals,
    realizedNet: roundMoney(totals.realizedNet),
    realizedGross: roundMoney(totals.realizedGross),
    discount: roundMoney(totals.discount),
    vat: roundMoney(totals.vat),
    estimatedCost: roundMoney(totals.estimatedCost),
    estimatedProfit: roundMoney(totals.estimatedProfit),
    backlogNet: roundMoney(totals.backlogNet),
    backlogGross: roundMoney(totals.backlogGross),
    backlogVat: roundMoney(totals.backlogVat),
    averageOrderValue: roundMoney(totals.averageOrderValue),
    silverWeightGrams: roundMoney(totals.silverWeightGrams),
    silverWeightKg: totals.silverWeightKg,
  };

  const costWarnings = Array.from(new Set([...realizedEvents, ...backlogEvents].map((event) => event.costWarning).filter((warning): warning is string => Boolean(warning))));

  return {
    period,
    labels: GREEK_LABELS,
    totals: roundedTotals,
    costBreakdown: {
      silver: roundMoney(costBreakdown.silver),
      labor: roundMoney(costBreakdown.labor),
      materials: roundMoney(costBreakdown.materials),
    },
    legal,
    events: {
      realized: realizedEvents,
      backlog: backlogEvents,
    },
    itemsBreakdown: realizedEvents.filter((event) => !isSpecialCreationSku(event.sku)),
    backlogBreakdown: backlogEvents.filter((event) => !isSpecialCreationSku(event.sku)),
    topProducts: sortRankings(Array.from(topProductsMap.values())),
    topVariants: sortRankings(Array.from(topVariantsMap.values())),
    topCollections: sortRankings(Array.from(topCollectionsMap.values())),
    topCustomers: Array.from(topCustomersMap.values())
      .map((item) => ({ ...item, revenue: roundMoney(item.revenue) }))
      .sort((a, b) => b.revenue - a.revenue),
    topSellers: Array.from(topSellersMap.values())
      .map((item) => ({
        ...item,
        revenue: roundMoney(item.revenue),
        earnedCommission: roundMoney(item.earnedCommission),
        pendingRevenue: roundMoney(item.pendingRevenue),
        pendingCommission: roundMoney(item.pendingCommission),
      }))
      .sort((a, b) => b.revenue + b.pendingRevenue - (a.revenue + a.pendingRevenue)),
    categoryChartData: sortRankings(Array.from(categoryMap.values())),
    timeChartData: sortedTime,
    costWarnings,
    isSingleOrder: orders.filter((order) => order.status !== OrderStatus.Cancelled).length === 1,
    totalRevenue: roundedTotals.realizedNet,
    totalProfit: roundedTotals.estimatedProfit,
    totalCost: roundedTotals.estimatedCost,
    totalItems: roundedTotals.shippedPieces,
    totalItemsSold: roundedTotals.shippedPieces,
    orderCount: roundedTotals.realizedOrderCount,
    avgOrderValue: roundedTotals.averageOrderValue,
    averageOrderValue: roundedTotals.averageOrderValue,
    avgBasketSize: roundedTotals.averageBasketSize,
    avgMargin: roundedTotals.margin,
    profitMargin: roundedTotals.margin,
    cogsPercent: roundedTotals.realizedNet > 0 ? (roundedTotals.estimatedCost / roundedTotals.realizedNet) * 100 : 0,
    silverSoldWeight: roundedTotals.silverWeightGrams,
    silverSoldKg: roundedTotals.silverWeightKg,
    silverCostSum: roundMoney(costBreakdown.silver),
    laborCostSum: roundMoney(costBreakdown.labor),
    materialCostSum: roundMoney(costBreakdown.materials),
  };
}
