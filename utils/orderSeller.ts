import type { Order, UserProfile } from '../types';

function clampPercent(value: number | null | undefined): number {
  if (value == null || Number.isNaN(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

export type ResolvedOrderSeller = {
  sellerId: string | null;
  sellerName: string | null;
  sellerCommissionPercent: number;
};

type SellerLookup = Map<string, UserProfile> | UserProfile[] | null | undefined;

function lookupSeller(sellerId: string | null | undefined, sellers: SellerLookup): UserProfile | undefined {
  if (!sellerId || !sellers) return undefined;
  if (sellers instanceof Map) return sellers.get(sellerId);
  return sellers.find((seller) => seller.id === sellerId);
}

/**
 * Canonical seller fields for an order. Profile name wins when seller_id is set so
 * analytics stay in sync after reassignment or profile renames.
 */
export function resolveOrderSeller(
  order: Pick<Order, 'seller_id' | 'seller_name' | 'seller_commission_percent'>,
  sellers?: SellerLookup,
): ResolvedOrderSeller {
  const sellerId = order.seller_id || null;
  if (!sellerId) {
    return { sellerId: null, sellerName: null, sellerCommissionPercent: 0 };
  }

  const seller = lookupSeller(sellerId, sellers);
  return {
    sellerId,
    sellerName: seller?.full_name || order.seller_name || null,
    sellerCommissionPercent: clampPercent(order.seller_commission_percent ?? seller?.commission_percent ?? 0),
  };
}

/** Persist seller_name / commission when saving an order with seller_id. */
export function withResolvedOrderSeller<T extends Pick<Order, 'seller_id' | 'seller_name' | 'seller_commission_percent'>>(
  order: T,
  sellers?: SellerLookup,
): T {
  const resolved = resolveOrderSeller(order, sellers);
  if (!resolved.sellerId) {
    return {
      ...order,
      seller_id: undefined,
      seller_name: undefined,
      seller_commission_percent: null,
    };
  }

  return {
    ...order,
    seller_id: resolved.sellerId,
    seller_name: resolved.sellerName || undefined,
    seller_commission_percent: order.seller_commission_percent ?? resolved.sellerCommissionPercent ?? null,
  };
}
