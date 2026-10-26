import type { LaborCost, OrderItem, Product } from '../types';

export const orderItemsDraftSnapshot = (items: OrderItem[]) => items.map(({ product_details, ...item }) => item);

// Derived costs and refreshed stock are not edits. Include all user-controlled
// catalogue fields, but only manually controlled labour/price values.
export function laborDraftSnapshot(value: LaborCost) {
  const labor = { ...value };
  if (!labor.casting_cost_manual_override) delete labor.casting_cost;
  if (!labor.technician_cost_manual_override) delete labor.technician_cost;
  if (!labor.plating_cost_x_manual_override) delete labor.plating_cost_x;
  if (!labor.plating_cost_d_manual_override) delete labor.plating_cost_d;
  return labor;
}

export function productDraftSnapshot(product: Product) {
  const { active_price, draft_price, stock_qty, sample_qty, ...rest } = product;
  const labor = laborDraftSnapshot(product.labor);
  const variants = product.variants?.map(({ active_price, stock_qty, ...variant }) => variant);
  return { ...rest, labor, variants };
}
