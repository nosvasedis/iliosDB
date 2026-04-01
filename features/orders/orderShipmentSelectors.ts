import { Order, ProductionBatch } from '../../types';

export interface ShipmentSummary {
  totalItems: number;
  uniqueSkus: number;
}

export function getShipmentSummary(shipmentBatches: ProductionBatch[]): ShipmentSummary {
  const totalItems = shipmentBatches.reduce((sum, batch) => sum + batch.quantity, 0);
  const uniqueSkus = new Set(shipmentBatches.map((batch) => batch.sku)).size;
  return { totalItems, uniqueSkus };
}

export function getShipmentStageBreakdown(shipmentBatches: ProductionBatch[]): Record<string, number> {
  return shipmentBatches.reduce<Record<string, number>>((acc, batch) => {
    acc[batch.current_stage] = (acc[batch.current_stage] || 0) + batch.quantity;
    return acc;
  }, {});
}

export function getShipmentValue(
  order: Pick<Order, 'items' | 'vat_rate' | 'discount_percent' | 'total_price'>,
  shipmentBatches: ProductionBatch[],
): number {
  const vatRate = order.vat_rate !== undefined ? order.vat_rate : 0.24;
  const discountFactor = 1 - ((order.discount_percent || 0) / 100);

  let value = 0;
  shipmentBatches.forEach((batch) => {
    const item = order.items.find((orderItem) =>
      orderItem.sku === batch.sku &&
      (orderItem.variant_suffix || '') === (batch.variant_suffix || '') &&
      (orderItem.size_info || '') === (batch.size_info || '')
    );

    if (item) {
      value += item.price_at_order * batch.quantity * discountFactor;
    }
  });

  return value * (1 + vatRate);
}
