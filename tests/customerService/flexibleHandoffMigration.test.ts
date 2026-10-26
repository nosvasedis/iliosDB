import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261026120000_flexible_consignment_handoff.sql'),
  'utf8',
);

describe('flexible consignment handoff migration', () => {
  it('never blocks handoff on missing warehouse stock', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.handoff_consignment_v1');
    expect(migration).toContain('private.consignment_draw_line_stock');
    expect(migration).toContain("'consignment_direct_in'");
    expect(migration).not.toContain('customer_service_move_stock');
    expect(migration).not.toMatch(/Διαθέσιμα: %s/);
  });

  it('matches sizes flexibly and lands every unit under the line size', () => {
    expect(migration).toContain("(v_size = '' OR size_info = v_size OR size_info = '')");
    expect(migration).toContain('CASE WHEN size_info = v_size THEN 0 WHEN size_info = \'\' THEN 1 ELSE 2 END');
    expect(migration).toMatch(/'consignment_handoff_in', v_sku, v_variant, v_size,/);
  });

  it('only draws available (unreserved) stock and keeps the helper private', () => {
    expect(migration).toContain('on_hand - reserved > 0');
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION private\.consignment_draw_line_stock/);
  });
});
