import { Gender, Material, MaterialType, PlatingType, Product, ProductVariant } from '../../types';
import { getVariantComponents } from '../../utils/pricingEngine';
import { getCategoryGroup, skuCollator } from '../catalog/catalogUi';

/** The shop sells at retail: three times the wholesale price. */
export const STORE_RETAIL_MULTIPLIER = 3;

const FINISH_ORDER = ['', 'P', 'X', 'D', 'H'];

export type StonesFilter = 'all' | 'with' | 'without';
export type PlatingFilter = 'all' | 'lustre' | 'gold' | 'platinum';

export interface StoreCatalogFilters {
    search: string;
    group: string;
    gender: 'All' | Gender;
    stones: StonesFilter;
    plating: PlatingFilter;
    onlyInStock: boolean;
    sortBy: 'sku' | 'created_at';
}

interface StoreCatalogEntry {
    product: Product;
    search: string;
    group: string;
    hasStones: boolean;
    finishes: ReadonlySet<string>;
    totalStock: number;
    createdAt: string;
}

export interface StoreCatalogIndex {
    entries: StoreCatalogEntry[];
    groups: string[];
}

export function sortStoreVariants(variants: readonly ProductVariant[], gender: Gender): ProductVariant[] {
    const rank = (suffix: string) => {
        const { finish, stone } = getVariantComponents(suffix, gender);
        const r = FINISH_ORDER.indexOf(finish.code);
        return { r: r >= 0 ? r : 99, stone: stone.code };
    };
    return [...variants].sort((a, b) => {
        const ra = rank(a.suffix);
        const rb = rank(b.suffix);
        return ra.r - rb.r || ra.stone.localeCompare(rb.stone) || a.suffix.localeCompare(b.suffix);
    });
}

function buildIndex(products: readonly Product[], materials: readonly Material[]): StoreCatalogIndex {
    // One Set lookup per recipe line instead of scanning every material for every product.
    const stoneIds = new Set(materials.filter((m) => m.type === MaterialType.Stone).map((m) => m.id));
    const groups = new Set<string>();

    const entries = products.filter((p) => !p.is_component).map((source) => {
        const variants = sortStoreVariants(source.variants || [], source.gender);
        const product: Product = { ...source, variants };
        const finishes = new Set<string>();
        const { finish: masterFinish } = getVariantComponents(product.sku, product.gender);
        if (product.plating_type === PlatingType.GoldPlated) finishes.add('X');
        if (product.plating_type === PlatingType.Platinum) finishes.add('H');
        if (product.plating_type === PlatingType.None) finishes.add(masterFinish.code || '');

        const variantSkus: string[] = [];
        let totalStock = product.available_qty ?? product.stock_qty ?? 0;
        variants.forEach((v) => {
            finishes.add(getVariantComponents(v.suffix, product.gender).finish.code);
            variantSkus.push(`${product.sku}${v.suffix}`);
            totalStock += v.available_qty ?? v.stock_qty ?? 0;
        });

        const group = getCategoryGroup(product.category || '');
        groups.add(group);
        return {
            product,
            search: `${product.sku} ${product.category} ${variantSkus.join(' ')}`.toLowerCase(),
            group,
            hasStones: (product.recipe || []).some((item) => item.type === 'raw' && stoneIds.has(item.id)),
            finishes,
            totalStock,
            createdAt: product.created_at || '',
        };
    });

    return { entries, groups: [...groups].sort((a, b) => a.localeCompare(b, 'el')) };
}

const cache = new WeakMap<readonly Product[], { materials: readonly Material[]; index: StoreCatalogIndex }>();

/** Cached per products/materials snapshot, so reopening the catalogue costs nothing. */
export function getStoreCatalogIndex(products: readonly Product[], materials: readonly Material[]): StoreCatalogIndex {
    const hit = cache.get(products);
    if (hit && hit.materials === materials) return hit.index;
    const index = buildIndex(products, materials);
    cache.set(products, { materials, index });
    return index;
}

export function selectStoreCatalog(index: StoreCatalogIndex, f: StoreCatalogFilters): Product[] {
    const q = f.search.trim().toLowerCase();
    const out = index.entries.filter((e) => {
        if (q && !e.search.includes(q)) return false;
        if (f.group !== 'All' && e.group !== f.group) return false;
        if (f.gender !== 'All' && e.product.gender !== f.gender) return false;
        if (f.stones === 'with' && !e.hasStones) return false;
        if (f.stones === 'without' && e.hasStones) return false;
        if (f.plating === 'lustre' && !e.finishes.has('') && !e.finishes.has('P')) return false;
        if (f.plating === 'gold' && !e.finishes.has('X')) return false;
        if (f.plating === 'platinum' && !e.finishes.has('H')) return false;
        if (f.onlyInStock && e.totalStock <= 0) return false;
        return true;
    });
    out.sort((a, b) => (f.sortBy === 'created_at'
        ? b.createdAt.localeCompare(a.createdAt)
        : skuCollator.compare(a.product.sku, b.product.sku)));
    return out.map((e) => e.product);
}
