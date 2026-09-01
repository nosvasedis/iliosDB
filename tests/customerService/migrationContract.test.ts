import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const core = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260811090000_customer_service_core.sql'), 'utf8');
const workflows = [
  readFileSync(resolve(process.cwd(), 'supabase/migrations/20260811091500_customer_service_workflows.sql'), 'utf8'),
  readFileSync(resolve(process.cwd(), 'supabase/migrations/20260901093000_update_pending_consignment.sql'), 'utf8'),
].join('\n');

const requiredTables = [
  'consignments', 'consignment_lines', 'consignment_allocations', 'consignment_settlements',
  'consignment_payments', 'consignment_returns', 'consignment_events', 'repair_intakes',
  'repair_items', 'repair_cycles', 'repair_cost_lines', 'repair_charges',
  'repair_attachments', 'repair_events',
];

const requiredRpcs = [
  'create_bulk_consignments_v1', 'handoff_consignment_v1', 'settle_consignment_sale_v1',
  'record_consignment_payment_v1', 'receive_consignment_return_v1', 'route_consignment_return_v1',
  'reverse_consignment_settlement_v1', 'reverse_consignment_return_v1', 'cancel_consignment_v1',
  'create_repair_intake_v1', 'complete_repair_quality_check_v1', 'mark_repair_delivered_v1',
  'record_repair_cost_line_v1', 'set_repair_charge_v1', 'create_repair_attachment_slot_v1',
  'create_consignment_legal_draft_v1', 'create_repair_legal_draft_v1',
  'get_consignment_inventory_reconciliation_v1',
  'update_pending_consignment_v1',
];

describe('συμβόλαιο βάσης Παρακαταθηκών και Επισκευών', () => {
  it('δημιουργεί όλες τις οντότητες και ενεργοποιεί RLS', () => {
    for (const table of requiredTables) {
      expect(core).toMatch(new RegExp(`CREATE TABLE(?: IF NOT EXISTS)? public\\.${table}\\b`, 'i'));
      expect(core).toMatch(new RegExp(`['\"]${table}['\"]`, 'i'));
    }
    expect(core).toContain("EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name)");
  });

  it('προστατεύει τις θέσεις αποθήκης και τα ιδιωτικά αρχεία', () => {
    expect(core).toContain('Παρακαταθήκες Πελατών');
    expect(core).toContain('Έλεγχος Επιστροφών');
    expect(core).toMatch(/repair-attachments[\s\S]+public\s*=\s*false/i);
    expect(core).toContain('workflow_kind');
    expect(core).toContain('repair_item_id');
  });

  it('εκθέτει μόνο τις τεκμηριωμένες ατομικές λειτουργίες', () => {
    for (const rpc of requiredRpcs) {
      expect(workflows).toMatch(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${rpc}\\b`, 'i'));
      expect(workflows).toContain(`public.${rpc}`);
    }
    expect(workflows).toContain('FOR UPDATE');
    expect(workflows).toContain('p_idempotency_key');
    expect(workflows).toContain('customer_service_command_results');
    expect(workflows).toContain('REVOKE ALL ON FUNCTION');
  });

  it('κρατά τα συμβάντα αμετάβλητα και τα παραστατικά πρόχειρα', () => {
    expect(core).toContain('block_customer_service_event_changes');
    expect(core).toContain('Το ιστορικό ενεργειών είναι αμετάβλητο');
    expect(workflows).toMatch(/create_consignment_legal_draft_v1[\s\S]+status[\s\S]+'draft'/i);
    expect(workflows).toMatch(/create_repair_legal_draft_v1[\s\S]+status[\s\S]+'draft'/i);
  });
});
