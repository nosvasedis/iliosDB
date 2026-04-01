import { Order, OrderShipment, OrderShipmentItem, Product } from '../../types';
import { buildItemIdentityKey } from '../../utils/itemIdentity';

export interface OrderShipmentsSnapshot {
  shipments: OrderShipment[];
  items: OrderShipmentItem[];
}

export interface StockDeductionEntry {
  table: 'products' | 'product_variants';
  match: Record<string, string>;
  updateData: Record<string, unknown>;
  movementReason: string;
  sku: string;
  variantSuffix?: string | null;
  qty: number;
}

export function buildOrderShipmentItemKey(
  sku: string,
  variantSuffix?: string | null,
  sizeInfo?: string | null,
  cordColor?: string | null,
  enamelColor?: string | null,
  lineId?: string | null
): string {
  return buildItemIdentityKey({
    sku,
    variant_suffix: variantSuffix,
    size_info: sizeInfo,
    cord_color: cordColor as any,
    enamel_color: enamelColor as any,
    line_id: lineId || null,
  });
}

export function getOrderShipmentsSnapshotFromTables(
  shipments: OrderShipment[],
  items: OrderShipmentItem[],
  orderId: string,
): OrderShipmentsSnapshot {
  const filteredShipments = shipments
    .filter((shipment) => shipment.order_id === orderId)
    .sort((a, b) => a.shipment_number - b.shipment_number);
  const shipmentIds = new Set(filteredShipments.map((shipment) => shipment.id));
  const filteredItems = items.filter((item) => shipmentIds.has(item.shipment_id));

  return { shipments: filteredShipments, items: filteredItems };
}

export function getOrderSnapshotById(orders: Order[], orderId: string): Order | null {
  return orders.find((order) => order.id === orderId) || null;
}

export function checkStockForOrderItems(
  itemsToSend: { sku: string; variant: string | null; qty: number; size_info?: string; cord_color?: string | null; enamel_color?: string | null }[],
  allProducts: Product[]
): Array<{ sku: string; variant_suffix: string | null; size_info: string | null; cord_color?: string | null; enamel_color?: string | null; requested_qty: number; available_in_stock: number }> {
  return itemsToSend.map((item) => {
    const product = allProducts.find((p) => p.sku === item.sku);
    if (!product) {
      return {
        sku: item.sku,
        variant_suffix: item.variant,
        size_info: item.size_info || null,
        cord_color: item.cord_color || null,
        enamel_color: item.enamel_color || null,
        requested_qty: item.qty,
        available_in_stock: 0,
      };
    }

    let available = 0;
    const variant = item.variant ? product.variants?.find((v) => v.suffix === item.variant) : null;

    if (item.size_info) {
      const stockBySize = variant?.stock_by_size || (product as any).stock_by_size;
      if (stockBySize && typeof stockBySize === 'object') {
        available = stockBySize[item.size_info] || 0;
      }
    } else {
      available = variant ? (variant.stock_qty || 0) : (product.stock_qty || 0);
    }

    return {
      sku: item.sku,
      variant_suffix: item.variant,
      size_info: item.size_info || null,
      cord_color: item.cord_color || null,
      enamel_color: item.enamel_color || null,
      requested_qty: item.qty,
      available_in_stock: Math.max(0, available),
    };
  });
}

export function buildStockDeductionEntries(
  orderId: string,
  items: { sku: string; variant_suffix: string | null; qty: number; size_info?: string | null; cord_color?: string | null; enamel_color?: string | null }[],
  allProducts: Product[]
): StockDeductionEntry[] {
  const movementReason = `Εκτέλεση από Stock — Παραγγελία #${orderId.slice(0, 12)}`;

  const entries: StockDeductionEntry[] = [];
  items.forEach((item) => {
    if (item.qty <= 0) return [];
    const product = allProducts.find((p) => p.sku === item.sku);
    if (!product) return;

    const variant = item.variant_suffix ? product.variants?.find((v) => v.suffix === item.variant_suffix) : null;

    if (variant) {
      const updateData: Record<string, unknown> = {
        stock_qty: Math.max(0, (variant.stock_qty || 0) - item.qty),
      };

      if (item.size_info && variant.stock_by_size && typeof variant.stock_by_size === 'object') {
        const newBySize = { ...variant.stock_by_size };
        newBySize[item.size_info] = Math.max(0, (newBySize[item.size_info] || 0) - item.qty);
        updateData.stock_by_size = newBySize;
      }

      entries.push({
        table: 'product_variants',
        match: { product_sku: item.sku, suffix: item.variant_suffix || '' },
        updateData,
        movementReason,
        sku: item.sku,
        variantSuffix: item.variant_suffix,
        qty: item.qty,
      });
      return;
    }

    const updateData: Record<string, unknown> = {
      stock_qty: Math.max(0, (product.stock_qty || 0) - item.qty),
    };

    if (item.size_info && (product as any).stock_by_size && typeof (product as any).stock_by_size === 'object') {
      const newBySize = { ...(product as any).stock_by_size };
      newBySize[item.size_info] = Math.max(0, (newBySize[item.size_info] || 0) - item.qty);
      updateData.stock_by_size = newBySize;
    }

    entries.push({
      table: 'products',
      match: { sku: item.sku },
      updateData,
      movementReason,
      sku: item.sku,
      variantSuffix: item.variant_suffix,
      qty: item.qty,
    });
  });

  return entries;
}
