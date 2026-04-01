import { Order, ProductionBatch } from '../../types';
import { buildItemIdentityKey } from '../../utils/itemIdentity';

export function buildPartialOrderFromBatches(order: Order, selectedBatches: ProductionBatch[]): Order {
  const partialItems = new Map<string, { item: typeof order.items[number]; qty: number }>();

  selectedBatches.forEach((batch) => {
    const key = buildItemIdentityKey(batch);
    const existingItem = order.items.find((item) => buildItemIdentityKey(item) === key);
    if (!existingItem) return;

    if (!partialItems.has(key)) {
      partialItems.set(key, { item: existingItem, qty: 0 });
    }
    partialItems.get(key)!.qty += batch.quantity;
  });

  const partialTotal = Array.from(partialItems.values()).reduce(
    (sum, { item, qty }) => sum + item.price_at_order * qty,
    0
  );
  const discountFactor = 1 - ((order.discount_percent || 0) / 100);
  const discountedPartialTotal = partialTotal * discountFactor;
  const vatRate = order.vat_rate !== undefined ? order.vat_rate : 0.24;
  const partialGrandTotal = discountedPartialTotal * (1 + vatRate);

  return {
    ...order,
    items: Array.from(partialItems.values()).map(({ item, qty }) => ({
      ...item,
      quantity: qty,
    })),
    total_price: partialGrandTotal,
  };
}
