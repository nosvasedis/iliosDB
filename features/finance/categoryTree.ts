import type { FinanceCategory } from './types';

export interface FinanceCategoryNode {
  category: FinanceCategory;
  depth: number;
  children: FinanceCategoryNode[];
}

/** Level names shown to the user; deeper levels keep the last label. */
export const CATEGORY_LEVEL_LABELS = ['Είδος', 'Ενότητα', 'Υποενότητα'];
export const categoryLevelLabel = (depth: number): string =>
  CATEGORY_LEVEL_LABELS[Math.min(depth, CATEGORY_LEVEL_LABELS.length - 1)];

const byPosition = (a: FinanceCategory, b: FinanceCategory) =>
  a.position - b.position || a.name.localeCompare(b.name, 'el');

export function buildCategoryTree(categories: readonly FinanceCategory[], includeArchived = false): FinanceCategoryNode[] {
  const visible = categories.filter((category) => includeArchived || !category.is_archived);
  const ids = new Set(visible.map((category) => category.id));
  const childrenOf = new Map<string | null, FinanceCategory[]>();
  visible.forEach((category) => {
    // An orphan (archived or deleted parent) is shown at the top level instead of disappearing.
    const parent = category.parent_id && ids.has(category.parent_id) ? category.parent_id : null;
    childrenOf.set(parent, [...(childrenOf.get(parent) || []), category]);
  });
  const build = (parent: string | null, depth: number, seen: Set<string>): FinanceCategoryNode[] =>
    (childrenOf.get(parent) || []).sort(byPosition).filter((category) => !seen.has(category.id)).map((category) => {
      const nextSeen = new Set(seen).add(category.id);
      return { category, depth, children: build(category.id, depth + 1, nextSeen) };
    });
  return build(null, 0, new Set());
}

export function flattenTree(nodes: readonly FinanceCategoryNode[]): FinanceCategoryNode[] {
  return nodes.flatMap((node) => [node, ...flattenTree(node.children)]);
}

export function categoryPath(categoryId: string | null | undefined, categories: readonly FinanceCategory[]): FinanceCategory[] {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const path: FinanceCategory[] = [];
  const seen = new Set<string>();
  let current = categoryId ? byId.get(categoryId) : undefined;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current);
    current = current.parent_id ? byId.get(current.parent_id) : undefined;
  }
  return path;
}

export const categoryBreadcrumb = (categoryId: string | null | undefined, categories: readonly FinanceCategory[]): string =>
  categoryPath(categoryId, categories).map((category) => category.name).join(' › ');

/** The category itself plus every descendant id. */
export function descendantIds(categoryId: string, categories: readonly FinanceCategory[]): Set<string> {
  const result = new Set([categoryId]);
  let grew = true;
  while (grew) {
    grew = false;
    categories.forEach((category) => {
      if (category.parent_id && result.has(category.parent_id) && !result.has(category.id)) {
        result.add(category.id);
        grew = true;
      }
    });
  }
  return result;
}

/** Root (Είδος) of a category, used for top-level colours and roll-ups. */
export const rootCategory = (categoryId: string | null | undefined, categories: readonly FinanceCategory[]): FinanceCategory | undefined =>
  categoryPath(categoryId, categories)[0];

/** Inherited colour: the nearest ancestor that defines one. */
export function categoryColor(categoryId: string | null | undefined, categories: readonly FinanceCategory[], fallback = '#64748b'): string {
  const path = categoryPath(categoryId, categories);
  for (let index = path.length - 1; index >= 0; index -= 1) {
    if (path[index].color) return path[index].color!;
  }
  return fallback;
}

/** Inherited icon: the nearest ancestor that defines one (subsections may leave it empty). */
export function categoryIconKey(categoryId: string | null | undefined, categories: readonly FinanceCategory[]): string | null {
  const path = categoryPath(categoryId, categories);
  for (let index = path.length - 1; index >= 0; index -= 1) {
    if (path[index].icon) return path[index].icon!;
  }
  return null;
}

/** Inherited value from the nearest ancestor (e.g. default party, default Χ/Τ, link kind). */
export function inheritedCategoryValue<K extends 'default_party_id' | 'default_billing' | 'link_kind' | 'nature'>(
  categoryId: string | null | undefined,
  categories: readonly FinanceCategory[],
  key: K,
): FinanceCategory[K] | undefined {
  const path = categoryPath(categoryId, categories);
  for (let index = path.length - 1; index >= 0; index -= 1) {
    const value = path[index][key];
    if (value !== null && value !== undefined) return value;
  }
  return undefined;
}

/** Sums leaf amounts into every ancestor. */
export function rollUpTotals(amountByCategory: ReadonlyMap<string, number>, categories: readonly FinanceCategory[]): Map<string, number> {
  const totals = new Map<string, number>();
  amountByCategory.forEach((amount, categoryId) => {
    categoryPath(categoryId, categories).forEach((category) => {
      totals.set(category.id, (totals.get(category.id) || 0) + amount);
    });
  });
  return totals;
}

/** Whether moving a category under a new parent would create a cycle. */
export function wouldCreateCycle(categoryId: string, newParentId: string | null, categories: readonly FinanceCategory[]): boolean {
  if (!newParentId) return false;
  return descendantIds(categoryId, categories).has(newParentId);
}

/** New positions after moving one sibling up or down. */
export function reorderSiblings(
  categoryId: string,
  direction: -1 | 1,
  categories: readonly FinanceCategory[],
): Array<Pick<FinanceCategory, 'id' | 'parent_id' | 'position'>> {
  const target = categories.find((category) => category.id === categoryId);
  if (!target) return [];
  const siblings = categories.filter((category) => category.parent_id === target.parent_id && !category.is_archived).sort(byPosition);
  const index = siblings.findIndex((category) => category.id === categoryId);
  const swapWith = index + direction;
  if (index < 0 || swapWith < 0 || swapWith >= siblings.length) return [];
  const reordered = [...siblings];
  [reordered[index], reordered[swapWith]] = [reordered[swapWith], reordered[index]];
  return reordered.map((category, position) => ({ id: category.id, parent_id: category.parent_id, position }));
}
