import { Order } from '../../types';

export interface SellerIdentity {
    id?: string;
    email: string;
    fullName: string;
}

/** Match by seller_id (primary) OR seller_name (fallback for orders saved before migration). */
export function isSellerOrder(order: Order, seller: SellerIdentity): boolean {
    if (order.seller_id && seller.id && order.seller_id === seller.id) return true;
    if (order.seller_name) {
        if (seller.fullName && order.seller_name === seller.fullName) return true;
        if (seller.email && order.seller_name === seller.email) return true;
    }
    return false;
}
