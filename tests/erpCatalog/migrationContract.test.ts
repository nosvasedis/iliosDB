import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('ERP catalogue migration contract', () => {
  const sql = readFileSync(
    resolve(__dirname, '../../supabase/migrations/20260807071717_erp_catalog_sku_sync.sql'),
    'utf8',
  );

  it('sets replica identity full and defines get_erp_products_by_skus', () => {
    expect(sql).toContain('replica identity full');
    expect(sql).toContain('create or replace function public.get_erp_products_by_skus(p_skus text[])');
    expect(sql).toContain('security invoker');
    expect(sql).toContain('grant execute on function public.get_erp_products_by_skus(text[]) to authenticated');
    expect(sql).toContain('accepts at most 100 SKUs');
  });
});
