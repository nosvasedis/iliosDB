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

/**
 * Generates an order ID in app format: ORD-YYMMDD-NNN (e.g. ORD-250228-047).
 */
export function generateOrderId(): string {
    const now = new Date();
    const yy = now.getFullYear().toString().slice(-2);
    const mm = (now.getMonth() + 1).toString().padStart(2, '0');
    const dd = now.getDate().toString().padStart(2, '0');
    const nnn = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `ORD-${yy}${mm}${dd}-${nnn}`;
}
