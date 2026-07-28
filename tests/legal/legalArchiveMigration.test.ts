import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ALL_BACKUP_TABLE_NAMES } from '../../lib/backupConfig';
import {
  INSPECTION_ALLOWED_QUERY_ROOTS,
  INSPECTION_ALLOWED_TABLES,
  INSPECTION_REALTIME_TABLES,
} from '../../lib/inspectionAllowedTables';
import { getRealtimeInvalidationDomainsForTable } from '../../lib/queryInvalidation';

const migration = readFileSync(
  new URL('../../supabase/migrations/20260728085650_legal_archive_intelligence.sql', import.meta.url),
  'utf8',
);
const shippingProductMigration = readFileSync(
  new URL('../../supabase/migrations/20260728093002_add_shipping_service_product.sql', import.meta.url),
  'utf8',
);
const archiveRelationshipsMigration = readFileSync(
  new URL('../../supabase/migrations/20260728101952_legal_archive_relationships.sql', import.meta.url),
  'utf8',
);
const archiveWorkspaceSource = readFileSync(
  new URL('../../components/legal/LegalArchiveWorkspace.tsx', import.meta.url),
  'utf8',
);

describe('legal archive database contract', () => {
  it('adds archive links, parse metadata, and the learned alias table additively', () => {
    expect(migration).toMatch(/alter table public\.legal_documents[\s\S]*counterpart_customer_id/i);
    expect(migration).toMatch(/alter table public\.legal_documents[\s\S]*archive_parse_version/i);
    expect(migration).toMatch(/alter table public\.proforma_documents[\s\S]*counterpart_customer_id/i);
    expect(migration).toMatch(/alter table public\.legal_document_lines[\s\S]*source_metadata/i);
    expect(migration).toMatch(/create table if not exists public\.legal_external_item_aliases/i);
    expect(migration).toMatch(/unique \(external_source, normalized_item_code\)/i);
    expect(migration).toMatch(/references public\.products\(sku\)/i);
  });

  it('keeps learned mappings admin-only under RLS while exposing them through the Data API', () => {
    expect(migration).toContain('ALTER TABLE public.legal_external_item_aliases ENABLE ROW LEVEL SECURITY');
    expect(migration).toMatch(/for all[\s\S]*to authenticated[\s\S]*is_legal_module_admin/i);
    expect(migration).toMatch(/grant select, insert, update, delete[\s\S]*to authenticated/i);
    expect(migration).not.toMatch(/grant .* to anon/i);
  });

  it('registers the alias table for backup, offline inspection, and realtime invalidation', () => {
    expect(ALL_BACKUP_TABLE_NAMES).toContain('legal_external_item_aliases');
    expect(INSPECTION_ALLOWED_TABLES.has('legal_external_item_aliases')).toBe(true);
    expect(INSPECTION_ALLOWED_QUERY_ROOTS.has('legal_external_item_aliases')).toBe(true);
    expect(INSPECTION_REALTIME_TABLES).toContain('legal_external_item_aliases');
    expect(getRealtimeInvalidationDomainsForTable('legal_external_item_aliases')).toContain('legal');
  });

  it('seeds Prisma code 000 as the non-stock Μεταφορικά catalog service', () => {
    expect(shippingProductMigration).toMatch(/insert into public\.products/i);
    expect(shippingProductMigration).toContain("'000'");
    expect(shippingProductMigration).toContain("'Μεταφορικά'");
    expect(shippingProductMigration).toContain("'Υπηρεσίες'");
    expect(shippingProductMigration).toMatch(/on conflict \(sku\) do update/i);
  });

  it('persists seller matching and whole or partial order allocations', () => {
    expect(archiveRelationshipsMigration).toMatch(/counterpart_seller_id uuid/i);
    expect(archiveRelationshipsMigration).toMatch(/order_link_mode text not null default 'whole'/i);
    expect(archiveRelationshipsMigration).toMatch(/order_line_allocations jsonb not null default '\[\]'/i);
    expect(archiveRelationshipsMigration).toMatch(/check \(order_link_mode in \('whole', 'partial'\)\)/i);
    expect(archiveRelationshipsMigration).toMatch(/jsonb_typeof\(order_line_allocations\) = 'array'/i);
  });

  it('keeps all archive-facing matching language in end-user Greek', () => {
    [
      'Ποιότητα match',
      'Όλα τα matches',
      'Πλήρη matches',
      'Μερικά matches',
      'Χωρίς match',
      'guessing',
      'μαθημένο alias',
      'χωρίς itemCode',
      'χωρίς SKU',
      'Proforma',
    ].forEach((forbiddenCopy) => {
      expect(archiveWorkspaceSource).not.toContain(`'${forbiddenCopy}'`);
      expect(archiveWorkspaceSource).not.toContain(`>${forbiddenCopy}<`);
    });
  });
});
