/** Supabase tables permitted while inspection mode is active. */
export const INSPECTION_ALLOWED_TABLES = new Set([
  'legal_settings',
  'legal_sbz_status',
  'legal_numbering_sequences',
  'legal_carriers',
  'legal_documents',
  'legal_document_lines',
  'legal_external_item_aliases',
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
  'inspection',
  'legal_catalog',
  'legal_sbz_status',
  'legal_settings',
  'legal_numbering_sequences',
  'legal_carriers',
  'legal_documents',
  'legal_document_lines',
  'legal_external_item_aliases',
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
  'legal_numbering_sequences',
  'legal_carriers',
  'legal_documents',
  'legal_document_lines',
  'legal_external_item_aliases',
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
  return INSPECTION_ALLOWED_WORKER_ROUTES.has(route);
}

export const INSPECTION_ALLOWED_WORKER_ROUTES = new Set([
  '/inspection/snapshot', '/inspection/support', '/legal/catalog',
  '/inspection/customer',
  '/sbz/status', '/sbz/submit', '/sbz/cancel-delivery', '/sbz/reconcile', '/sbz/sync', '/sbz/attach',
  '/aade/credential-status', '/aade/test-registry-connection', '/aade/lookup-vat-registry',
]);

export const INSPECTION_ALLOWED_RPCS = new Set([
  'save_sbz_draft',
  'has_inspection_exit_pin',
  'inspection_session_state', 'inspection_current_profile', 'enter_inspection_session', 'exit_inspection_session',
  'get_inspection_snapshot',
]);

export function isInspectionRpcAllowed(rpcName: string): boolean {
  return INSPECTION_ALLOWED_RPCS.has(rpcName);
}

export function isInspectionQueryKeyAllowed(queryKey: readonly unknown[]): boolean {
  const root = queryKey[0];
  if (typeof root !== 'string') return false;
  return INSPECTION_ALLOWED_QUERY_ROOTS.has(root);
}
