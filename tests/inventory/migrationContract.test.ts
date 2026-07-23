import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  new URL('../../supabase/migrations/20260723063518_transactional_inventory_v1.sql', import.meta.url),
  'utf8',
);

const hardeningSql = readFileSync(
  new URL(
    '../../supabase/migrations/20260723064125_transactional_inventory_v1_hardening.sql',
    import.meta.url,
  ),
  'utf8',
);

const initialZeroInventorySql = readFileSync(
  new URL(
    '../../supabase/migrations/20260723065553_initialize_empty_inventory.sql',
    import.meta.url,
  ),
  'utf8',
);

const smartPostingSql = readFileSync(
  new URL(
    '../../supabase/migrations/20260723081226_inventory_smart_posting.sql',
    import.meta.url,
  ),
  'utf8',
);

const movementReversalSql = readFileSync(
  new URL(
    '../../supabase/migrations/20260723091008_inventory_event_reversal.sql',
    import.meta.url,
  ),
  'utf8',
);

const countSessionSql = readFileSync(
  new URL(
    '../../supabase/migrations/20260723095652_inventory_count_sessions.sql',
    import.meta.url,
  ),
  'utf8',
);

const countSessionIndexesSql = readFileSync(
  new URL(
    '../../supabase/migrations/20260723100339_inventory_count_foreign_key_indexes.sql',
    import.meta.url,
  ),
  'utf8',
);

const flexibleWarehousesSql = readFileSync(
  new URL(
    '../../supabase/migrations/20260723102506_flexible_warehouse_management.sql',
    import.meta.url,
  ),
  'utf8',
);

const shipmentAwareDemandSql = readFileSync(
  new URL(
    '../../supabase/migrations/20260723105559_shipment_aware_inventory_demand.sql',
    import.meta.url,
  ),
  'utf8',
);

describe('transactional inventory migration contract', () => {
  it.each([
    'inventory_balances',
    'inventory_reservations',
    'inventory_events',
    'inventory_command_results',
    'inventory_cutover_balance_snapshot',
    'inventory_reorder_policies',
    'inventory_shipment_allocations',
    'inventory_reconciliation_issues',
  ])('creates %s', (table) => {
    expect(sql).toContain(`public.${table}`);
  });

  it.each([
    'save_order_with_inventory_v1',
    'release_order_inventory_v1',
    'set_order_status_with_inventory_v1',
    'delete_order_with_inventory_v1',
    'adjust_inventory_stock_v1',
    'batch_adjust_inventory_stock_v1',
    'transfer_inventory_stock_v1',
    'set_inventory_reorder_policy_v1',
    'receive_supplier_order_inventory_v1',
    'convert_offer_to_order_v1',
    'delete_production_batch_inventory_v1',
    'revert_order_production_inventory_v1',
    'dispatch_order_to_production_inventory_v1',
    'resolve_inventory_reconciliation_issue_v1',
    'assert_product_inventory_retirable_v1',
  ])('defines and locks down RPC %s', (rpc) => {
    expect(sql).toContain(`FUNCTION public.${rpc}`);
    expect(sql).toMatch(new RegExp(`FUNCTION public\\.${rpc}[\\s\\S]*?SECURITY DEFINER`));
    expect(sql).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${rpc}[\\s\\S]*?FROM PUBLIC, anon;`));
  });

  it('does not expose privileged inventory helpers directly to authenticated clients', () => {
    expect(sql).toContain('REVOKE ALL ON FUNCTION private.save_order_with_inventory_core(jsonb, text) FROM authenticated;');
    expect(sql).toContain('REVOKE ALL ON FUNCTION private.release_order_reservations_core(text, text, text) FROM authenticated;');
    expect(sql).toContain('REVOKE ALL ON FUNCTION private.restore_legacy_inventory_batch_core(text, text) FROM authenticated;');
  });

  it('uses a security-invoker canonical availability view', () => {
    expect(sql).toMatch(/VIEW public\.inventory_availability_v\s+WITH \(security_invoker = true\)/);
    expect(sql).toContain('on_hand - balance.reserved AS available');
    expect(sql).toContain('VIEW public.inventory_legacy_shadow_comparison_v');
    expect(sql).toContain('inventory_cutover_balance_snapshot');
  });

  it('posts shipment issue and reversal through database triggers', () => {
    expect(sql).toContain('consume_inventory_reservation_for_shipment');
    expect(sql).toContain('restore_inventory_reservation_for_shipment');
    expect(sql).toContain('CREATE TRIGGER inventory_consume_on_shipment_item_insert');
    expect(sql).toContain('CREATE TRIGGER inventory_restore_on_shipment_item_delete');
    expect(sql).toContain('FUNCTION public.create_partial_shipment_v2');
    expect(sql).toContain('FUNCTION public.revert_partial_shipment_v2');
    expect(sql).toContain("command_row.operation_type <> 'shipment_create'");
    expect(sql).toContain("command_row.operation_type <> 'shipment_revert'");
    expect(sql).toContain("restored_row.stock_quantity > 0");
    expect(sql).toContain('private.rebalance_ready_batch_sources');
  });

  it('receives customer-linked purchasing demand as physical and reserved stock', () => {
    expect(sql).toContain('v_quantity, v_committed, balance_row.on_hand, balance_row.reserved');
    expect(sql).toContain("fulfillment_source = 'inventory_reserved'");
    expect(sql).toContain('initial_quantity = public.inventory_reservations.initial_quantity + EXCLUDED.initial_quantity');
  });

  it('constrains seller reservations to the seller own order', () => {
    expect(sql).toContain("private.current_app_role() = 'seller'");
    expect(sql).toContain("COALESCE(p_order->>'seller_id', '')");
  });

  it('does not seed from the client-derived location_stock mapping', () => {
    expect(sql).not.toContain('location_stock');
  });

  it('protects inventory traceability when a product identity is retired', () => {
    expect(sql).toContain('CREATE TRIGGER inventory_guard_product_delete');
    expect(sql).toContain('inventory_events event_row WHERE event_row.product_sku = p_product_sku');
    expect(sql).toContain('ON UPDATE CASCADE ON DELETE CASCADE NOT VALID');
  });

  it('reports every required legacy reconciliation risk before cutover', () => {
    expect(sql).toContain("'negative_opening_balance'");
    expect(sql).toContain("'product_size_total_mismatch'");
    expect(sql).toContain("'duplicate_location_rows'");
    expect(sql).toContain("'unknown_warehouse'");
    expect(sql).toContain("'legacy_movement_inconsistency'");
    expect(sql).toContain('p_target_warehouse_id uuid DEFAULT NULL');
  });

  it('enforces nonnegative availability and deterministic row locking', () => {
    expect(sql).toContain('reserved <= on_hand');
    expect(sql).toContain('ORDER BY warehouse_id');
    expect(sql).toContain('FOR UPDATE');
    expect(sql).not.toContain('ON CONFLICT (idempotency_key)');
  });

  it('hardens the applied schema and retries reservation backfill safely', () => {
    expect(hardeningSql).toContain('VALIDATE CONSTRAINT inventory_balances_nonnegative_check');
    expect(hardeningSql).toContain('CREATE TRIGGER inventory_events_immutable_guard');
    expect(hardeningSql).toContain('inventory_balances_warehouse_idx');
    expect(hardeningSql).toContain('cutover-order-reservation-retry');
    expect(hardeningSql).toContain(
      'REVOKE ALL ON FUNCTION private.consume_inventory_reservation_for_shipment()',
    );
    expect(hardeningSql).toContain(
      'REVOKE ALL ON FUNCTION private.restore_inventory_reservation_for_shipment()',
    );
  });

  it('records the administrator-approved initial zero inventory atomically', () => {
    expect(initialZeroInventorySql).toContain('LOCK TABLE public.inventory_balances');
    expect(initialZeroInventorySql).toContain("'initial-zero-inventory:balances'");
    expect(initialZeroInventorySql).toContain("'initial-zero-inventory:reconciliation'");
    expect(initialZeroInventorySql).toContain("stock_by_size = '{}'::jsonb");
    expect(initialZeroInventorySql).toContain("sample_stock_by_size = '{}'::jsonb");
    expect(initialZeroInventorySql).toContain("SET on_hand = 0");
    expect(initialZeroInventorySql).toContain("state = 'released'");
  });

  it('defines the locked-down atomic multi-location posting RPC', () => {
    expect(smartPostingSql).toContain('FUNCTION public.post_inventory_entries_v1');
    expect(smartPostingSql).toContain("private.assert_inventory_role(ARRAY['admin'])");
    expect(smartPostingSql).toContain('pg_advisory_xact_lock');
    expect(smartPostingSql).toContain('inventory_command_results');
    expect(smartPostingSql).toContain('ORDER BY balance.product_sku, balance.variant_suffix, balance.size_info, balance.warehouse_id');
    expect(smartPostingSql).toContain('FOR UPDATE OF balance');
    expect(smartPostingSql).toContain("'stock_count'");
    expect(smartPostingSql).toContain("'manual_stock_increase'");
    expect(smartPostingSql).toContain('private.sync_legacy_inventory_projection(v_sku)');
    expect(smartPostingSql).toContain('REVOKE ALL ON FUNCTION public.post_inventory_entries_v1(text, jsonb, text, text) FROM PUBLIC, anon;');
    expect(smartPostingSql).toContain('GRANT EXECUTE ON FUNCTION public.post_inventory_entries_v1(text, jsonb, text, text) TO authenticated, service_role;');
  });

  it('normalizes inventory sizes without modifying existing balances', () => {
    expect(smartPostingSql).toContain('FUNCTION private.normalize_inventory_size');
    expect(smartPostingSql).toContain("RETURN v_number_text || 'cm'");
    expect(smartPostingSql).not.toMatch(/UPDATE public\.inventory_balances[\s\S]*SET on_hand = 0/);
    expect(smartPostingSql).not.toContain('location_stock');
  });

  it('cancels eligible movements through immutable atomic reversal entries', () => {
    expect(movementReversalSql).toContain('FUNCTION public.reverse_inventory_event_v1');
    expect(movementReversalSql).toContain("private.assert_inventory_role(ARRAY['admin'])");
    expect(movementReversalSql).toContain("'movement_reversal'");
    expect(movementReversalSql).toContain('reversal_of');
    expect(movementReversalSql).toContain('inventory-transfer-reversal:');
    expect(movementReversalSql).toContain('FOR UPDATE OF balance');
    expect(movementReversalSql).toContain('private.sync_legacy_inventory_projection(v_sku)');
    expect(movementReversalSql).toContain(
      'REVOKE ALL ON FUNCTION public.reverse_inventory_event_v1(uuid, text, text) FROM PUBLIC, anon;',
    );
    expect(movementReversalSql).not.toMatch(/DELETE\s+FROM\s+public\.inventory_events/i);
  });

  it('defines server-backed, administrator-only inventory count sessions', () => {
    [
      'inventory_count_sessions',
      'inventory_count_batches',
      'inventory_count_targets',
      'inventory_count_entries',
    ].forEach((table) => {
      expect(countSessionSql).toContain(`CREATE TABLE public.${table}`);
      expect(countSessionSql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
    });
    [
      'start_inventory_count_session_v1',
      'get_inventory_count_session_v1',
      'search_inventory_count_targets_v1',
      'get_inventory_count_target_v1',
      'post_inventory_count_batch_v1',
      'complete_inventory_count_session_v1',
      'abandon_inventory_count_session_v1',
    ].forEach((rpc) => {
      expect(countSessionSql).toContain(`FUNCTION public.${rpc}`);
      expect(countSessionSql).toMatch(new RegExp(`FUNCTION public\\.${rpc}[\\s\\S]*?SECURITY DEFINER`));
    });
    expect(countSessionSql).toContain("private.assert_inventory_role(ARRAY['admin'])");
    expect(countSessionSql).toContain('FROM PUBLIC, anon;');
    expect(countSessionSql).not.toMatch(/GRANT (INSERT|UPDATE|DELETE).*authenticated/i);
  });

  it('posts bounded count-session batches through the canonical atomic inventory command', () => {
    expect(countSessionSql).toContain('v_target_count NOT BETWEEN 1 AND 200');
    expect(countSessionSql).toContain('jsonb_array_length(p_lines) NOT BETWEEN 1 AND 500');
    expect(countSessionSql).toContain('public.post_inventory_entries_v1(');
    expect(countSessionSql).toContain("'count'");
    expect(countSessionSql).toContain('inventory_count_entries');
    expect(countSessionSql).toContain('source_event_id');
    expect(countSessionSql).toContain('παραλείφθηκε υφιστάμενο μέγεθος ή θέση με υπόλοιπο');
  });

  it('covers every count-session foreign-key lookup used by batch posting and cleanup', () => {
    expect(countSessionIndexesSql).toContain(
      'inventory_count_targets_batch_session_idx',
    );
    expect(countSessionIndexesSql).toContain(
      'inventory_count_entries_batch_session_idx',
    );
    expect(countSessionIndexesSql).toContain(
      'inventory_count_entries_target_session_idx',
    );
    expect(countSessionIndexesSql).toContain(
      'inventory_count_entries_warehouse_idx',
    );
  });

  it('separates editable warehouse presentation from protected operational roles', () => {
    expect(flexibleWarehousesSql).toContain('ADD COLUMN IF NOT EXISTS category text');
    expect(flexibleWarehousesSql).toContain('warehouses_system_role_check');
    expect(flexibleWarehousesSql).toContain("THEN is_system IS TRUE AND type = 'Central'");
    expect(flexibleWarehousesSql).toContain("THEN is_system IS TRUE AND type = 'Showroom'");
    expect(flexibleWarehousesSql).toContain("is_system IS NOT TRUE AND type <> 'Central'");
    expect(flexibleWarehousesSql).toContain('warehouses_name_normalized_unique_idx');
    expect(flexibleWarehousesSql).toContain('REVOKE ALL ON TABLE public.warehouses FROM anon');
  });

  it('subtracts modern and legacy shipments from canonical inventory demand', () => {
    expect(shipmentAwareDemandSql).toContain('VIEW public.inventory_order_demand_v');
    expect(shipmentAwareDemandSql).toContain('WITH (security_invoker = true)');
    expect(shipmentAwareDemandSql).toContain('stable_line_identity');
    expect(shipmentAwareDemandSql).toContain(
      'COALESCE(line.product_sku, shipment_item.sku)',
    );
    expect(shipmentAwareDemandSql).toContain(
      "COALESCE(shipment_item.line_id::text, '') <> ''",
    );
    expect(shipmentAwareDemandSql).toContain('shipped_by_identity');
    expect(shipmentAwareDemandSql).toContain('reserved_by_identity');
    expect(shipmentAwareDemandSql).toMatch(
      /ordered\.ordered_quantity\s+- COALESCE\(shipped\.shipped_quantity, 0\)\s+- COALESCE\(reserved\.reserved_quantity, 0\)/,
    );
    expect(shipmentAwareDemandSql).toContain("'Partially Delivered'");
    expect(shipmentAwareDemandSql).not.toMatch(
      /order_row\.status IN \([\s\S]*?'Delivered'/,
    );
  });

  it('keeps shipment-aware demand visible before the first physical balance', () => {
    expect(shipmentAwareDemandSql).toContain('identity_universe');
    expect(shipmentAwareDemandSql).toContain(
      "'00000000-0000-0000-0000-000000000001'::uuid",
    );
    expect(shipmentAwareDemandSql).toContain('COALESCE(balance.on_hand, 0)');
    expect(shipmentAwareDemandSql).toContain(
      'open_order_quantity',
    );
    expect(shipmentAwareDemandSql).toContain(
      'shipped_quantity',
    );
    expect(shipmentAwareDemandSql).toContain(
      'remaining_order_quantity',
    );
    expect(shipmentAwareDemandSql).toContain(
      'allocated_quantity',
    );
    expect(shipmentAwareDemandSql).toContain(
      'REVOKE ALL ON public.inventory_order_demand_v FROM PUBLIC, anon',
    );
    expect(shipmentAwareDemandSql).toContain(
      'GRANT SELECT ON public.inventory_order_demand_v TO authenticated, service_role',
    );
  });
});
