import { AggregatedBatch, AggregatedData, Material, Product, ProductionBatch, GlobalSettings } from '../../types';
import { calculateProductCost } from '../../utils/pricingEngine';
import { getSafeClientName } from './helpers';

export interface BuildAggregatedPrintDataOptions {
  splitImportedBatches?: boolean;
  orderId?: string;
  customerName?: string;
}

const buildFallbackBatch = (batch: ProductionBatch): AggregatedBatch => ({
  ...batch,
  cost_per_piece: 0,
  total_cost: 0,
});

/**
 * Shared production aggregation logic for print surfaces.
 * The helper supports both the desktop split-imported view and the mobile combined view.
 */
export function buildAggregatedPrintData(
  batches: ProductionBatch[],
  products: Product[] | undefined,
  materials: Material[] | undefined,
  settings: GlobalSettings | undefined,
  options: BuildAggregatedPrintDataOptions = {}
): AggregatedData | null {
  if (!products || !materials || !settings || batches.length === 0) return null;

  const productsBySku = new Map(products.map((product) => [product.sku, product]));
  const splitImported = options.splitImportedBatches ?? false;

  let totalSilverWeight = 0;
  let totalSilverCost = 0;
  let totalMaterialsCost = 0;
  let totalInHouseLaborCost = 0;
  let totalImportedLaborCost = 0;
  let totalSubcontractCost = 0;

  const primaryBatches: AggregatedBatch[] = [];
  const importedBatches: AggregatedBatch[] = [];

  for (const batch of batches) {
    const product = productsBySku.get(batch.sku);
    if (!product) {
      primaryBatches.push(buildFallbackBatch(batch));
      continue;
    }

    const cost = calculateProductCost(product, settings, materials, products);
    const costPerPiece = cost.total;
    const totalCost = costPerPiece * batch.quantity;
    const labor = cost.breakdown.labor || 0;
    const subcontractCost = cost.breakdown.details?.subcontract_cost || 0;
    totalSubcontractCost += subcontractCost * batch.quantity;

    if (product.production_type === 'Imported') {
      totalImportedLaborCost += labor * batch.quantity;
      if (splitImported) {
        importedBatches.push({ ...batch, cost_per_piece: costPerPiece, total_cost: totalCost, product_details: product });
      } else {
        totalSilverWeight += (product.weight_g + (product.secondary_weight_g || 0)) * batch.quantity;
        totalSilverCost += (cost.breakdown.silver || 0) * batch.quantity;
        totalMaterialsCost += (cost.breakdown.materials || 0) * batch.quantity;
        primaryBatches.push({ ...batch, cost_per_piece: costPerPiece, total_cost: totalCost, product_details: product });
      }
    } else {
      totalSilverWeight += (product.weight_g + (product.secondary_weight_g || 0)) * batch.quantity;
      totalSilverCost += (cost.breakdown.silver || 0) * batch.quantity;
      totalMaterialsCost += (cost.breakdown.materials || 0) * batch.quantity;
      totalInHouseLaborCost += labor * batch.quantity;
      primaryBatches.push({ ...batch, cost_per_piece: costPerPiece, total_cost: totalCost, product_details: product });
    }
  }

  const totalProductionCost = primaryBatches.reduce((sum, batch) => sum + batch.total_cost, 0);
  const importedTotalCost = importedBatches.length > 0
    ? importedBatches.reduce((sum, batch) => sum + batch.total_cost, 0)
    : undefined;

  return {
    molds: new Map(),
    materials: new Map(),
    components: new Map(),
    totalSilverWeight,
    batches: primaryBatches,
    totalProductionCost,
    totalSilverCost,
    totalMaterialsCost,
    totalInHouseLaborCost,
    totalImportedLaborCost,
    totalSubcontractCost,
    orderId: options.orderId,
    customerName: options.customerName,
    importedBatches: importedBatches.length > 0 ? importedBatches : undefined,
    importedTotalCost,
  };
}

export const buildAggregatedPrintTitle = (customerName?: string, orderId?: string) =>
  `${getSafeClientName(customerName) || 'Order'}_${orderId || 'summary'}`;
