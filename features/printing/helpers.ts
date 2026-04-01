import { ProductionBatch } from '../../types';
import { transliterateForBarcode } from '../../utils/pricingEngine';

export const sanitizePrintSegment = (value: string) => value
  .replace(/[\s\W]+/g, '_')
  .replace(/_+/g, '_')
  .replace(/^_+|_+$/g, '');

export const getSafeClientName = (name?: string) => {
  if (!name) return '';
  return sanitizePrintSegment(transliterateForBarcode(name).trim());
};

export const getSingleOrderFromBatches = (batches: ProductionBatch[]) => {
  const orderIds = [...new Set(batches.map((batch) => batch.order_id).filter(Boolean))] as string[];
  if (orderIds.length !== 1) return null;
  const enriched = batches as Array<ProductionBatch & { customer_name?: string }>;
  const customerName = enriched.find((batch) => batch.customer_name)?.customer_name;
  return { orderId: orderIds[0], customerName };
};
