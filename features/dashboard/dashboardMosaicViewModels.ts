import { Offer, Order, OrderStatus, Product, ProductionBatch, ProductionStage } from '../../types';
import {
  buildPartialDeliveryProgressSegments,
  isOrderReadyForShipment,
} from '../../utils/orderReadiness';
import type { InventoryAvailability } from '../inventory';

export interface ProductionPulseSummary {
  delayed: number;
  onHold: number;
  ready: number;
  inProgress: number;
  healthScore: number;
}

export interface InventoryRiskRow {
  sku: string;
  suffix: string;
  stock: number;
  label: string;
}

export interface DemandPressureRow {
  sku: string;
  suffix: string;
  demand: number;
  stock: number;
  gap: number;
  label: string;
}

export interface OffersPipelineSummary {
  count: number;
  totalValue: number;
}

export type ReadyOrderShipmentKind = 'full' | 'partial';

export interface ReadyOrderEntry {
  orderId: string;
  customerName: string;
  kind: ReadyOrderShipmentKind;
  /** Τεμάχια έτοιμα προς την επόμενη αποστολή */
  readyQty: number;
  shippedQty: number;
  totalQty: number;
}

export interface ReadyOrdersSummary {
  total: number;
  fullCount: number;
  partialCount: number;
  entries: ReadyOrderEntry[];
}

const LOW_STOCK_THRESHOLD = 5;
const DELAYED_HOURS = 48;

export function buildProductionPulse(batches: ProductionBatch[] | undefined): ProductionPulseSummary {
  const list = batches ?? [];
  const active = list.filter((b) => b.current_stage !== ProductionStage.Ready);
  const now = Date.now();

  let delayed = 0;
  let onHold = 0;
  let ready = 0;

  list.forEach((batch) => {
    if (batch.current_stage === ProductionStage.Ready) {
      ready += 1;
      return;
    }
    if (batch.on_hold) {
      onHold += 1;
      return;
    }
    const lastUpdate = new Date(batch.updated_at).getTime();
    const diffHours = (now - lastUpdate) / (1000 * 60 * 60);
    if (diffHours > DELAYED_HOURS) delayed += 1;
  });

  const inProgress = active.length - onHold;
  const healthScore =
    inProgress > 0 ? Math.max(0, Math.round(100 - (delayed / inProgress) * 100)) : 100;

  return { delayed, onHold, ready, inProgress, healthScore };
}

export function buildInventoryRiskRows(products: Product[], limit = 3): {
  totalLowStock: number;
  rows: InventoryRiskRow[];
} {
  const rows: InventoryRiskRow[] = [];

  products.forEach((product) => {
    if (product.is_component) return;

    if (product.variants && product.variants.length > 0) {
      product.variants.forEach((variant) => {
        const stock = variant.stock_qty ?? 0;
        if (stock < LOW_STOCK_THRESHOLD) {
          rows.push({
            sku: product.sku,
            suffix: variant.suffix,
            stock,
            label: variant.suffix ? `${product.sku}${variant.suffix}` : product.sku,
          });
        }
      });
      return;
    }

    if (product.stock_qty < LOW_STOCK_THRESHOLD) {
      rows.push({
        sku: product.sku,
        suffix: '',
        stock: product.stock_qty,
        label: product.sku,
      });
    }
  });

  rows.sort((a, b) => a.stock - b.stock);

  return {
    totalLowStock: rows.length,
    rows: rows.slice(0, limit),
  };
}

export function buildCanonicalInventoryRiskRows(
  availability: InventoryAvailability[],
  limit = 3,
): { totalLowStock: number; rows: InventoryRiskRow[] } {
  const rows = availability
    .filter((row) => row.reorderPoint > 0 && row.available <= row.reorderPoint)
    .map((row) => ({
      sku: row.productSku,
      suffix: row.variantSuffix,
      stock: row.available,
      label: [row.productSku + row.variantSuffix, row.sizeInfo, row.warehouseName].filter(Boolean).join(' · '),
    }))
    .sort((a, b) => a.stock - b.stock || a.label.localeCompare(b.label, 'el'));
  return { totalLowStock: rows.length, rows: rows.slice(0, limit) };
}

export function buildDemandPressureRows(
  products: Product[],
  orders: Order[] | undefined,
  limit = 3,
): { totalPressure: number; rows: DemandPressureRow[] } {
  const demandMap: Record<string, { sku: string; suffix: string; demand: number }> = {};

  (orders ?? []).forEach((order) => {
    if (
      order.status !== OrderStatus.Pending &&
      order.status !== OrderStatus.InProduction &&
      order.status !== OrderStatus.PartiallyDelivered
    ) {
      return;
    }
    order.items.forEach((item) => {
      const key = `${item.sku}::${item.variant_suffix || ''}`;
      const existing = demandMap[key];
      if (existing) {
        existing.demand += item.quantity;
      } else {
        demandMap[key] = {
          sku: item.sku,
          suffix: item.variant_suffix || '',
          demand: item.quantity,
        };
      }
    });
  });

  const rows: DemandPressureRow[] = [];

  products.forEach((product) => {
    if (product.is_component) return;

    const addRow = (suffix: string, stock: number) => {
      const key = `${product.sku}::${suffix}`;
      const entry = demandMap[key];
      if (!entry || entry.demand <= stock) return;
      rows.push({
        sku: product.sku,
        suffix,
        demand: entry.demand,
        stock,
        gap: entry.demand - stock,
        label: suffix ? `${product.sku}${suffix}` : product.sku,
      });
    };

    if (product.variants && product.variants.length > 0) {
      product.variants.forEach((variant) => addRow(variant.suffix, variant.stock_qty ?? 0));
    } else {
      addRow('', product.stock_qty);
    }
  });

  rows.sort((a, b) => b.gap - a.gap);

  return {
    totalPressure: rows.length,
    rows: rows.slice(0, limit),
  };
}

export function buildCanonicalDemandPressureRows(
  availability: InventoryAvailability[],
  limit = 3,
): { totalPressure: number; rows: DemandPressureRow[] } {
  const rows = availability
    .filter((row) => row.outstandingDemand > row.available)
    .map((row) => ({
      sku: row.productSku,
      suffix: row.variantSuffix,
      demand: row.outstandingDemand,
      stock: row.available,
      gap: row.outstandingDemand - row.available,
      label: [row.productSku + row.variantSuffix, row.sizeInfo, row.warehouseName].filter(Boolean).join(' · '),
    }))
    .sort((a, b) => b.gap - a.gap || a.label.localeCompare(b.label, 'el'));
  return { totalPressure: rows.length, rows: rows.slice(0, limit) };
}

export function buildOffersSummary(offers: Offer[] | undefined): OffersPipelineSummary {
  const pending = (offers ?? []).filter((o) => o.status === 'Pending');
  return {
    count: pending.length,
    totalValue: pending.reduce((acc, o) => acc + (o.total_price || 0), 0),
  };
}

/**
 * Orders ready for shipment — mirrors Παραγγελίες «Αποστολή 100%» badge,
 * including Μερική Παράδοση (uses real shipped quantities from DB).
 */
export function buildReadyOrdersSummary(
  orders: Order[] | undefined,
  batches: ProductionBatch[] | undefined,
  shippedQtyByOrderId?: Map<string, number>,
): ReadyOrdersSummary {
  const entries: ReadyOrderEntry[] = [];
  if (!orders) {
    return { total: 0, fullCount: 0, partialCount: 0, entries };
  }

  for (const order of orders) {
    const shippedQty = shippedQtyByOrderId?.get(order.id);
    if (!isOrderReadyForShipment(order, batches, shippedQty)) continue;

    const partialProgress = buildPartialDeliveryProgressSegments(order, batches, shippedQty);
    const isPartialContext = order.status === OrderStatus.PartiallyDelivered;
    const kind: ReadyOrderShipmentKind = isPartialContext ? 'partial' : 'full';

    const itemsTotal =
      partialProgress?.itemsTotal ??
      (Array.isArray(order.items)
        ? order.items.reduce((sum, item) => sum + (item.quantity || 0), 0)
        : order.item_total_qty ?? 0);

    entries.push({
      orderId: order.id,
      customerName: order.customer_name,
      kind,
      readyQty: partialProgress?.readyQty ?? itemsTotal,
      shippedQty: partialProgress?.shippedQty ?? shippedQty ?? 0,
      totalQty: itemsTotal,
    });
  }

  const partialCount = entries.filter((entry) => entry.kind === 'partial').length;
  const fullCount = entries.filter((entry) => entry.kind === 'full').length;

  return {
    total: entries.length,
    fullCount,
    partialCount,
    entries,
  };
}

/** @deprecated Prefer buildReadyOrdersSummary — kept for simple count callers */
export function countReadyOrders(
  orders: Order[] | undefined,
  batches: ProductionBatch[] | undefined,
  shippedQtyByOrderId?: Map<string, number>,
): number {
  return buildReadyOrdersSummary(orders, batches, shippedQtyByOrderId).total;
}
