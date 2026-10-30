import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BACKUP_TABLE_REGISTRY } from '../../lib/backupConfig';

const sql = readFileSync(resolve(__dirname, '../../supabase/migrations/20261030120000_product_link_groups.sql'), 'utf8');
const worker = readFileSync(resolve(__dirname, '../../worker/worker.js'), 'utf8');

describe('product link groups migration', () => {
  it('creates the membership table with RLS, inspection guard, grants and realtime', () => {
    expect(sql).toContain('create table if not exists public.product_link_members');
    expect(sql).toContain('primary key (group_id, product_sku)');
    expect(sql).toContain('alter table public.product_link_members enable row level security');
    expect(sql).toContain('create policy inspection_locked_session_read_guard on public.product_link_members');
    expect(sql).toContain('grant select, insert, update, delete on public.product_link_members to authenticated');
    expect(sql).toContain('alter table public.product_link_members replica identity full');
    expect(sql).toContain('alter publication supabase_realtime add table public.product_link_members');
  });

  it('exposes sets through the ERP and seller catalogue RPCs', () => {
    expect(sql).toContain('create or replace function public.get_erp_products_by_skus(p_skus text[])');
    expect(sql).toContain("'product_link_members', coalesce((");
    expect(sql).toContain('create or replace function public.get_seller_catalog_v1(p_skus text[] default null)');
    expect(sql).toContain("'link_groups', coalesce(links.link_groups, '[]'::jsonb)");
  });

  it('registers the table in every backup allowlist', () => {
    expect(sql).toMatch(/'products',\s*'product_link_members',/);
    expect(worker).toMatch(/'products',\s*'product_link_members',/);
    expect(BACKUP_TABLE_REGISTRY.some((entry) => entry.table === 'product_link_members')).toBe(true);
  });
});
