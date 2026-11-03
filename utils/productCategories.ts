import { normalizeGreekForSearch } from './greekSearch';

/** SKU categories only. Financial expense categories and AADE classifications are separate domains. */
export const normalizeProductCategory = (category?: string | null): string => normalizeGreekForSearch(category || '').replace(/ς/g, 'σ').replace(/\s+/g, ' ').trim();

const ROOTS = [
  { label: 'Βραχιόλι', aliases: ['Βραχιόλι', 'Βραχιόλια'] },
  { label: 'Κολιέ', aliases: ['Κολιέ'] },
  { label: 'Δαχτυλίδι', aliases: ['Δαχτυλίδι', 'Δαχτυλίδια', 'Δακτυλίδι', 'Δακτυλίδια'] },
  { label: 'Σκουλαρίκια', aliases: ['Σκουλαρίκια', 'Σκουλαρίκι'] },
  { label: 'Μενταγιόν', aliases: ['Μενταγιόν'] },
  { label: 'Σταυρός', aliases: ['Σταυρός', 'Σταυροί'] },
  { label: 'Τσόκερ', aliases: ['Τσόκερ'] },
  { label: 'Σετ', aliases: ['Σετ'] },
  { label: 'Αλυσίδα', aliases: ['Αλυσίδα', 'Αλυσίδες'] },
  { label: 'Τσάντα', aliases: ['Τσάντα'] },
  { label: 'Καρφίτσα', aliases: ['Καρφίτσα', 'Καρφίτσες'] },
  // Ροζάριο deliberately stays its own category, as confirmed by the user.
  { label: 'Ροζάριο', aliases: ['Ροζάριο'] },
].map((root) => ({ ...root, keys: root.aliases.map(normalizeProductCategory) }));

const BRACELET_SUBPARENTS = ['Βραχιόλι Δερμάτινο', 'Βραχιόλι Μακραμέ'];
const isWithin = (value: string, parent: string): boolean => value === parent || value.startsWith(`${parent} `);

/** The saved detailed category remains authoritative; ambiguous prefixes such as KL are never used. */
export function getProductCategoryRoot(category?: string | null): string {
  const value = (category || '').trim().replace(/\s+/g, ' ');
  const key = normalizeProductCategory(value);
  return ROOTS.find((root) => root.keys.some((alias) => isWithin(key, alias)))?.label || value;
}

export function getProductCategoryPath(category?: string | null): string[] {
  const value = (category || '').trim().replace(/\s+/g, ' ');
  if (!value) return [];
  const root = getProductCategoryRoot(value);
  const key = normalizeProductCategory(value);
  if (key === normalizeProductCategory(root) || ROOTS.some((candidate) => candidate.label === root && candidate.keys.includes(key))) return [root];
  const path = [root];
  if (root === 'Βραχιόλι') {
    const parent = BRACELET_SUBPARENTS.find((candidate) => isWithin(key, normalizeProductCategory(candidate)));
    if (parent) path.push(parent);
  }
  if (normalizeProductCategory(path[path.length - 1]) !== key) path.push(value);
  return path;
}

/** A parent includes every descendant. A child includes only its own branch. */
export function matchesProductCategory(category: string | null | undefined, selection: string): boolean {
  const target = normalizeProductCategory(selection);
  if (!target || target === 'all') return true;
  const path = getProductCategoryPath(category);
  return path.some((entry) => normalizeProductCategory(entry) === target)
    || (!!path.length && getProductCategoryRoot(selection) === path[0] && isWithin(normalizeProductCategory(category), target));
}

export function getProductCategoryBreadcrumb(category?: string | null): string {
  const path = getProductCategoryPath(category);
  return path.map((entry, index) => index === 0 ? entry : entry.split(' ').slice(path[index - 1].split(' ').length).join(' ') || entry).join(' › ');
}

export interface ProductCategoryOption { value: string; label: string; depth: number; root: string }

/** Adds virtual parents even when the catalogue contains children only. No product is counted twice. */
export function getProductCategoryOptions(categories: readonly string[]): ProductCategoryOption[] {
  const entries = new Map<string, ProductCategoryOption>();
  for (const category of categories) {
    const path = getProductCategoryPath(category);
    path.forEach((value, depth) => {
      const key = normalizeProductCategory(value);
      if (!entries.has(key)) entries.set(key, { value, label: value, depth, root: path[0] });
    });
  }
  return [...entries.values()].sort((a, b) => {
    const root = a.root.localeCompare(b.root, 'el');
    if (root) return root;
    if (matchesProductCategory(b.value, a.value)) return -1;
    if (matchesProductCategory(a.value, b.value)) return 1;
    return a.value.localeCompare(b.value, 'el');
  });
}

/** Price-list selections store actual catalogue categories; parent buttons toggle their complete branch. */
export function toggleProductCategorySelection(selected: readonly string[], category: string, available: readonly string[]): string[] {
  const branch = available.filter((entry) => matchesProductCategory(entry, category));
  const full = branch.length > 0 && branch.every((entry) => selected.includes(entry));
  const next = new Set(selected);
  branch.forEach((entry) => full ? next.delete(entry) : next.add(entry));
  return [...next];
}
