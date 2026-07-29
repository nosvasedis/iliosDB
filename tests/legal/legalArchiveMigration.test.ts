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
const archiveTypeAndVirtualShippingMigration = readFileSync(
  new URL('../../supabase/migrations/20260729091831_fix_legal_archive_types_and_virtual_shipping.sql', import.meta.url),
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
const numberingHardeningMigration = readFileSync(
  new URL('../../supabase/migrations/20260729082559_legal_numbering_submission_hardening.sql', import.meta.url),
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

  it('accepts all official archive types while reserving 000 outside the product registry', () => {
    expect(archiveTypeAndVirtualShippingMigration).toMatch(
      /drop constraint if exists legal_documents_aade_document_type_check/i,
    );
    expect(archiveTypeAndVirtualShippingMigration).toContain("'11.1'");
    expect(archiveTypeAndVirtualShippingMigration).toContain("'17.6'");
    expect(archiveTypeAndVirtualShippingMigration).toMatch(
      /add column if not exists legal_only boolean not null default false/i,
    );
    expect(archiveTypeAndVirtualShippingMigration).toMatch(
      /update public\.products[\s\S]*set legal_only = true[\s\S]*upper\(btrim\(sku\)\) = '000'/i,
    );
    expect(archiveTypeAndVirtualShippingMigration).toMatch(
      /products_sku_000_reserved_for_legal_documents_check[\s\S]*legal_only[\s\S]*upper\(btrim\(coalesce\(sku, ''\)\)\) = '000'/i,
    );
    expect(archiveTypeAndVirtualShippingMigration).not.toMatch(
      /delete from public\.(?:legal_document_lines|products)/i,
    );
  });

  it('persists seller matching and whole or partial order allocations', () => {
    expect(archiveRelationshipsMigration).toMatch(/counterpart_seller_id uuid/i);
    expect(archiveRelationshipsMigration).toMatch(/order_link_mode text not null default 'whole'/i);
    expect(archiveRelationshipsMigration).toMatch(/order_line_allocations jsonb not null default '\[\]'/i);
    expect(archiveRelationshipsMigration).toMatch(/check \(order_link_mode in \('whole', 'partial'\)\)/i);
    expect(archiveRelationshipsMigration).toMatch(/jsonb_typeof\(order_line_allocations\) = 'array'/i);
  });

  it('hardens legal numbering with transactional preview, apply, preparation, and monotonic guards', () => {
    expect(numberingHardeningMigration).toMatch(/create or replace function public\.preview_legal_numbering_alignment\(\)/i);
    expect(numberingHardeningMigration).toMatch(/create or replace function public\.apply_legal_numbering_alignment\(/i);
    expect(numberingHardeningMigration).toMatch(/create or replace function public\.prepare_legal_document_submission\(/i);
    expect(numberingHardeningMigration).toMatch(/set next_aa = greatest\([\s\S]*sequence\.next_aa,[\s\S]*proposed_next_aa/i);
    expect(numberingHardeningMigration).toMatch(/if new\.next_aa < old\.next_aa[\s\S]*δεν μπορεί να μειωθεί/i);
    expect(numberingHardeningMigration).toMatch(/old\.next_aa > 1 or v_has_history[\s\S]*δεν μπορεί να μετονομαστεί/i);
    expect(numberingHardeningMigration).toMatch(/tg_op = 'delete'[\s\S]*δεν μπορεί να διαγραφεί/i);
    expect(numberingHardeningMigration).toMatch(/lock table public\.legal_documents in share mode/i);
    expect(numberingHardeningMigration).toMatch(/security invoker[\s\S]*set search_path = ''/i);
    expect(numberingHardeningMigration).toMatch(/revoke execute on function public\.preview_legal_numbering_alignment\(\)[\s\S]*from public, anon/i);
    expect(numberingHardeningMigration).toMatch(/grant execute on function public\.prepare_legal_document_submission\(uuid\)[\s\S]*to authenticated/i);
    expect(numberingHardeningMigration).toMatch(/create or replace function public\.apply_legal_archive_reindex_batch\([\s\S]*jsonb_to_recordset/i);
    expect(numberingHardeningMigration).toMatch(/revoke execute on function public\.apply_legal_archive_reindex_batch\(jsonb, jsonb\)[\s\S]*from public, anon/i);
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

  it('keeps credential-free VAT discovery independent from the official AADE registry', () => {
    expect(archiveWorkspaceSource).toContain('Εύρεση στοιχείων ΑΦΜ');
    expect(archiveWorkspaceSource).toContain('VIES Ευρωπαϊκής Επιτροπής');
    expect(archiveWorkspaceSource).toContain('onLookupOfficialVat');
    expect(archiveWorkspaceSource).toContain('Δημιουργία πελάτη και σύνδεση');
    expect(archiveWorkspaceSource).not.toContain('disabled={!ready || normalizedVat.length !== 9 || loading}');
  });
});
