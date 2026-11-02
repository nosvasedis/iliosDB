import { MaterialType, type Material, type Product } from '../../types';
import type { FinanceCategory, FinanceExpense } from './types';
import { resourceUnit, type ResourceKind, type ResourceQuantities, type ResourceQuantityRow } from './resourceQuantities';

/** Recorded purchase lines only. Never expand recipes or count payments/work charges as purchases. */
export function summarizeBookedResources(expenses: readonly FinanceExpense[], categories: readonly FinanceCategory[], materials: readonly Material[], products: readonly Product[]): ResourceQuantities {
  const materialById = new Map(materials.map((material) => [material.id, material]));
  const productBySku = new Map(products.map((product) => [product.sku, product]));
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const rows = new Map<string, ResourceQuantityRow>();
  const warnings = new Set<string>();
  for (const expense of expenses) {
    if (expense.status === 'expected' || expense.source_kind === 'worker_statement' || expense.source_kind === 'commission') continue;
    let category = categoryById.get(expense.category_id);
    const seen = new Set<string>();
    while (category && !category.link_kind && category.parent_id && !seen.has(category.id)) {
      seen.add(category.id);
      category = categoryById.get(category.parent_id);
    }
    const link = category?.link_kind;
    for (const line of expense.lines || []) {
      const material = line.material_id ? materialById.get(line.material_id) : undefined;
      const product = line.sku ? productBySku.get(line.sku) : undefined;
      const component = !!line.sku && (product?.is_component || /^STX/i.test(line.sku) || link === 'stx');
      if (!material && !line.material_id && !component && !(link === 'stones' || link === 'materials' || link === 'stx')) continue;
      // Purchases of finished jewellery are not raw materials.
      if (line.sku && product && !component) continue;
      if (!Number.isFinite(line.qty) || line.qty <= 0) { warnings.add(`Μη έγκυρη ποσότητα: ${line.label}`); continue; }
      const kind: ResourceKind = component || (!line.material_id && link === 'stx') ? 'component'
        : material ? (material.type === MaterialType.Stone ? 'stone' : 'material') : link === 'stones' ? 'stone' : 'material';
      const unit = resourceUnit(line.unit || (component ? 'τεμ.' : material?.unit || ''));
      const id = line.material_id || line.sku || (line.label || 'Χωρίς περιγραφή').trim();
      if (!line.material_id && !line.sku) warnings.add(`Χωρίς σύνδεση μητρώου: ${line.label}`);
      if (unit === 'μον.') warnings.add(`Δεν έχει καταγραφεί μονάδα: ${line.label}`);
      if (line.material_id && !material) warnings.add(`Λείπει υλικό μητρώου: ${line.label}`);
      const key = JSON.stringify([line.material_id ? 'material' : line.sku ? 'sku' : 'label', id, kind, unit]);
      let row = rows.get(key);
      if (!row) {
        row = { key, id, name: material?.name || line.sku || line.label, description: material?.description || product?.description || '', kind, unit, quantity: 0, products: [] };
        rows.set(key, row);
      }
      row.quantity += line.qty;
      // Keep the saved label/date/reference visible even if the catalogue name changes.
      row.products.push({ sku: `${expense.expense_date} · ${expense.doc_ref || expense.id.slice(0, 8)} · ${line.label}`, variantSuffix: '', pieces: 0, quantity: line.qty });
    }
  }
  const sorted = [...rows.values()].sort((a, b) => a.name.localeCompare(b.name, 'el', { numeric: true }));
  return { rows: sorted, warnings: [...warnings], pieces: 0,
    stonePieces: sorted.filter((row) => row.kind === 'stone' && row.unit === 'τεμ.').reduce((sum, row) => sum + row.quantity, 0),
    componentPieces: sorted.filter((row) => row.kind === 'component' && row.unit === 'τεμ.').reduce((sum, row) => sum + row.quantity, 0),
  };
}
