import type { Material, Product, Supplier, SupplierOrder } from '../../types';

export const MATERIAL_TYPE_LABELS: Record<string, string> = {
    Stone: 'Πέτρα',
    Cord: 'Κορδόνι',
    Component: 'Εξάρτημα',
    Enamel: 'Σμάλτο',
    Leather: 'Δέρμα',
};

const AVATAR_TONES = [
    'from-violet-500 to-purple-700',
    'from-emerald-500 to-teal-700',
    'from-amber-400 to-orange-600',
    'from-sky-500 to-blue-700',
    'from-rose-500 to-pink-700',
    'from-indigo-500 to-blue-800',
    'from-teal-500 to-cyan-700',
    'from-lime-500 to-emerald-700',
];

/** Stable gradient per supplier name so the same supplier always looks the same. */
export function supplierAvatarTone(name: string): string {
    let hash = 0;
    for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) | 0;
    return AVATAR_TONES[Math.abs(hash) % AVATAR_TONES.length];
}

export function supplierInitials(name: string): string {
    const words = name.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return '?';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
}

export const orderShortId = (id: string) => id.slice(0, 6).toUpperCase();

export const orderPieces = (order: SupplierOrder) =>
    (order.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);

export function formatRelativeDay(iso?: string): string {
    if (!iso) return '—';
    const date = new Date(iso);
    const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const days = Math.round((startOf(new Date()) - startOf(date)) / 86_400_000);
    if (days <= 0) return 'Σήμερα';
    if (days === 1) return 'Χθες';
    if (days < 30) return `Πριν ${days} ημέρες`;
    return date.toLocaleDateString('el-GR');
}

export interface SupplierStats {
    productCount: number;
    materialCount: number;
    orderCount: number;
    pendingOrderCount: number;
    pendingPieces: number;
    lastOrderAt?: string;
}

const emptyStats = (): SupplierStats => ({
    productCount: 0,
    materialCount: 0,
    orderCount: 0,
    pendingOrderCount: 0,
    pendingPieces: 0,
});

export function buildSupplierStats(
    suppliers: Supplier[],
    products: Product[] = [],
    materials: Material[] = [],
    orders: SupplierOrder[] = [],
): Map<string, SupplierStats> {
    const stats = new Map<string, SupplierStats>(suppliers.map((supplier) => [supplier.id, emptyStats()]));
    for (const product of products) {
        const entry = product.supplier_id ? stats.get(product.supplier_id) : undefined;
        if (entry) entry.productCount += 1;
    }
    for (const material of materials) {
        const entry = material.supplier_id ? stats.get(material.supplier_id) : undefined;
        if (entry) entry.materialCount += 1;
    }
    for (const order of orders) {
        const entry = stats.get(order.supplier_id);
        if (!entry) continue;
        entry.orderCount += 1;
        if (order.status === 'Pending') {
            entry.pendingOrderCount += 1;
            entry.pendingPieces += orderPieces(order);
        }
        if (!entry.lastOrderAt || order.created_at > entry.lastOrderAt) entry.lastOrderAt = order.created_at;
    }
    return stats;
}

export const getSupplierStats = (stats: Map<string, SupplierStats>, id: string): SupplierStats =>
    stats.get(id) ?? emptyStats();

export const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
