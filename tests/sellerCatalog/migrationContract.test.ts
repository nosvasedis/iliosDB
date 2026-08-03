import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('seller catalogue RPC migration', () => {
  const sql = readFileSync(
    resolve(process.cwd(), 'supabase/migrations/20260803094433_seller_catalog_read_model_v1.sql'),
    'utf8',
  ).toLowerCase();

  it('is additive, invoker-scoped, versioned, and explicitly granted', () => {
    expect(sql).toContain('get_seller_catalog_v1(p_skus text[] default null)');
    expect(sql).toContain('stable');
    expect(sql).toContain('security invoker');
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("profile.role in ('seller', 'admin')");
    expect(sql).toContain('cardinality(p_skus) > 100');
    expect(sql).toContain('revoke all on function public.get_seller_catalog_v1(text[]) from public');
    expect(sql).toContain('revoke all on function public.get_seller_catalog_v1(text[]) from anon');
    expect(sql).toContain('grant execute on function public.get_seller_catalog_v1(text[]) to authenticated');
    expect(sql).not.toContain('security definer');
    expect(sql).not.toContain('create materialized view');
    expect(sql).not.toContain('create trigger');
  });
});
