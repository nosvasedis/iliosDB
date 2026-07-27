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
  new URL('../../supabase/migrations/20260727110027_legal_archive_intelligence.sql', import.meta.url),
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
});
