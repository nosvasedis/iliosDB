import { RETAIL_CUSTOMER_ID, RETAIL_CUSTOMER_NAME } from './retailConstants';
import { composeNotesWithRetailClient, extractRetailClientFromNotes } from './retailNotes';

export type OrderCustomerIdentity = { customer_id?: string | null; customer_name: string; notes?: string | null };

export function isRetailCustomerOrder(order: OrderCustomerIdentity): boolean {
    return order.customer_id === RETAIL_CUSTOMER_ID || order.customer_name.trim() === RETAIL_CUSTOMER_NAME;
}

/** Resolve the person behind the retail account without changing stored account identity. */
export function getOrderCustomerName(order: OrderCustomerIdentity, customerName?: string): string {
    if (isRetailCustomerOrder(order)) {
        return getRetailClientName(order) || 'Χωρίς όνομα πελάτη';
    }
    return customerName || order.customer_name;
}

/** An empty name is not a customer identity and must never match another empty retail order. */
export function getRetailClientName(order: OrderCustomerIdentity): string {
    return extractRetailClientFromNotes(order.notes).retailClientLabel
        || (order.customer_name.trim() !== RETAIL_CUSTOMER_NAME ? order.customer_name.trim() : '');
}

export function ordersHaveSameCustomer(a: OrderCustomerIdentity, b: OrderCustomerIdentity): boolean {
    if (isRetailCustomerOrder(a) || isRetailCustomerOrder(b)) {
        if (!isRetailCustomerOrder(a) || !isRetailCustomerOrder(b)) return false;
        const normalize = (name: string) => name.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('el-GR');
        const name = normalize(getRetailClientName(a));
        return !!name && name === normalize(getRetailClientName(b));
    }
    if (a.customer_id || b.customer_id) return !!a.customer_id && a.customer_id === b.customer_id;
    return !!a.customer_name.trim() && a.customer_name.trim() === b.customer_name.trim();
}


export function getOrderCustomerPhone(order: OrderCustomerIdentity & { customer_phone?: string | null }, customer?: { phone?: string | null }): string {
    return (isRetailCustomerOrder(order) ? order.customer_phone : customer?.phone || order.customer_phone) || '';
}

/** Canonical fields shared by order/offer saves and conversion; contact details stay on the order. */
export function buildOrderCustomerFields(order: OrderCustomerIdentity & { customer_phone?: string | null }, retailClientLabel?: string) {
    const retail = isRetailCustomerOrder(order);
    return {
        customer_id: retail ? RETAIL_CUSTOMER_ID : order.customer_id || undefined,
        customer_name: retail ? RETAIL_CUSTOMER_NAME : order.customer_name,
        customer_phone: order.customer_phone || '',
        notes: retail
            ? composeNotesWithRetailClient(order.notes || '', retailClientLabel ?? getRetailClientName(order))
            : extractRetailClientFromNotes(order.notes).cleanNotes,
    };
}
