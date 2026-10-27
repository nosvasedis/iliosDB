/**
 * One-shot handoff into the Μητρώο Κωδικών from other pages (e.g. the dashboard).
 * The caller stores a SKU before navigating; the registry consumes it on mount,
 * pre-fills its search and opens the product when it exists.
 */
let pendingRegistrySku: string | null = null;

export function requestRegistrySku(sku: string): void {
  pendingRegistrySku = sku.trim() || null;
}

export function consumeRegistrySku(): string | null {
  const sku = pendingRegistrySku;
  pendingRegistrySku = null;
  return sku;
}
