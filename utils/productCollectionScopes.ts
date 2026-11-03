import { Gender } from '../types';
import { getProductCategoryBreadcrumb, getProductCategoryPath } from './productCategories';

export interface CollectionScopeProduct {
  category?: string | null;
  gender?: Gender | null;
  collections?: readonly number[] | null;
  is_component?: boolean;
}
export interface ProductCollectionOption { id: string; name: string; depth: number }

const genderLabel = (gender?: Gender | null) => gender === Gender.Men ? 'Ανδρικά' : gender === Gender.Women ? 'Γυναικεία' : gender === Gender.Unisex ? 'Ουδέτερα' : 'Φύλο μη ορισμένο';

/** Virtual filter scopes, never collection records or membership writes. */
export function getUnassignedCollectionPath(product: CollectionScopeProduct): ProductCollectionOption[] {
  const genderKey = `none:${product.gender || 'unknown'}`;
  const base = `Χωρίς συλλογή · ${genderLabel(product.gender)}`;
  const categories = getProductCategoryPath(product.category);
  if (!categories.length) categories.push('Χωρίς κατηγορία');
  return [
    { id: 'none', name: 'Χωρίς συλλογή — όλα', depth: 0 },
    { id: genderKey, name: base, depth: 1 },
    ...categories.map((category, index) => ({ id: `${genderKey}:${encodeURIComponent(category)}`, name: `${base} · ${getProductCategoryBreadcrumb(category)}`, depth: index + 2 })),
  ];
}

/** One mutually exclusive reporting bucket per unassigned item, at its saved category detail. */
export function getUnassignedCollectionGroup(product: CollectionScopeProduct): ProductCollectionOption {
  const path = getUnassignedCollectionPath(product);
  return path[path.length - 1];
}

export function matchesProductCollection(product: CollectionScopeProduct, selection: string | number): boolean {
  const key = String(selection);
  if (!key || key.toLowerCase() === 'all') return true;
  if (key === 'none' || key.startsWith('none:')) {
    return !product.collections?.length && getUnassignedCollectionPath(product).some((entry) => entry.id === key);
  }
  return !!product.collections?.includes(Number(key));
}

export function getProductCollectionOptions(products: readonly CollectionScopeProduct[], collections: readonly { id: number; name: string }[]): ProductCollectionOption[] {
  const scopes = new Map<string, ProductCollectionOption>();
  products.forEach((product) => {
    if (product.is_component || product.collections?.length) return;
    getUnassignedCollectionPath(product).forEach((scope) => scopes.set(scope.id, scope));
  });
  const unassigned = [...scopes.values()].sort((a, b) => a.id === 'none' ? -1 : b.id === 'none' ? 1 : a.name.localeCompare(b.name, 'el'));
  return [...collections.map((collection) => ({ id: String(collection.id), name: collection.name, depth: 0 })), ...unassigned];
}
