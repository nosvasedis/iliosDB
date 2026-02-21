/**
 * Formats an order ID for display by stripping the "ORD-" prefix.
 * Input:  "ORD-260221-047"
 * Output: "260221-047"
 * 
 * If the ID doesn't start with "ORD-", returns it as-is.
 */
export function formatOrderId(orderId: string | null | undefined): string {
    if (!orderId) return '';
    return orderId.startsWith('ORD-') ? orderId.slice(4) : orderId;
}
