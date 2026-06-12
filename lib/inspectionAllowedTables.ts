/** Supabase tables permitted while inspection mode is active. */
export const INSPECTION_ALLOWED_TABLES = new Set([
  'legal_settings',
  'legal_numbering_sequences',
  'legal_carriers',
  'legal_documents',
  'legal_document_lines',
  'legal_payments',
  'legal_transmissions',
  'legal_delivery_events',
  'legal_audit_log',
  'legal_sync_runs',
  'proforma_documents',
  'proforma_document_lines',
  'products',
  'product_variants',
  'customers',
  'orders',
  'order_shipments',
  'order_shipment_items',
  'profiles',
]);

/** React Query root keys that may remain cached during inspection mode. */
export const INSPECTION_ALLOWED_QUERY_ROOTS = new Set([
  'legal_settings',
  'legal_numbering_sequences',
  'legal_carriers',
  'legal_documents',
  'legal_document_lines',
  'legal_transmissions',
  'legal_delivery_events',
  'legal_sync_runs',
  'legal_aade_credentials',
  'proforma_documents',
  'proforma_document_lines',
  'products',
  'customers',
  'orders',
]);

/** Realtime subscriptions while inspection mode is active. */
export const INSPECTION_REALTIME_TABLES = [
  'legal_settings',
  'legal_numbering_sequences',
  'legal_carriers',
  'legal_documents',
  'legal_document_lines',
  'legal_transmissions',
  'legal_delivery_events',
  'legal_sync_runs',
  'proforma_documents',
  'proforma_document_lines',
] as const;

export function isInspectionTableAllowed(tableName: string): boolean {
  return INSPECTION_ALLOWED_TABLES.has(tableName);
}

export function isInspectionWorkerRouteAllowed(route: string): boolean {
  return route.startsWith('/aade/');
}

export const INSPECTION_ALLOWED_RPCS = new Set([
  'allocate_legal_document_number',
  'has_inspection_exit_pin',
  'set_inspection_exit_pin',
  'verify_inspection_exit_pin',
]);

export function isInspectionRpcAllowed(rpcName: string): boolean {
  return INSPECTION_ALLOWED_RPCS.has(rpcName);
}

export function isInspectionQueryKeyAllowed(queryKey: readonly unknown[]): boolean {
  const root = queryKey[0];
  if (typeof root !== 'string') return false;
  return INSPECTION_ALLOWED_QUERY_ROOTS.has(root);
}
