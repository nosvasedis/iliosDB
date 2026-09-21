import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';

const migrationPath = fileURLToPath(new URL(
  '../../supabase/migrations/20260921083736_add_invoice_total_weight.sql',
  import.meta.url,
));

describe('invoice total weight migration', () => {
  const sql = readFileSync(migrationPath, 'utf8');

  it('adds both nullable weight columns', () => {
    expect(sql).toMatch(/products\s+add column if not exists invoice_total_weight_g numeric null/i);
    expect(sql).toMatch(/materials\s+add column if not exists unit_weight_g numeric null/i);
  });

  it('rejects non-positive manual totals and negative material weights', () => {
    expect(sql).toMatch(/invoice_total_weight_g is null or invoice_total_weight_g > 0/i);
    expect(sql).toMatch(/unit_weight_g is null or unit_weight_g >= 0/i);
  });

  it('applies locally and enforces both database constraints', async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        create table public.products (sku text primary key);
        create table public.materials (id text primary key);
      `);
      await db.exec(sql);

      await db.exec(`
        insert into public.products (sku, invoice_total_weight_g) values ('A1', 5.5), ('A2', null);
        insert into public.materials (id, unit_weight_g) values ('M1', 0), ('M2', null);
      `);
      await expect(db.exec("insert into public.products (sku, invoice_total_weight_g) values ('BAD', 0)")).rejects.toThrow();
      await expect(db.exec("insert into public.materials (id, unit_weight_g) values ('BAD', -0.1)")).rejects.toThrow();
    } finally {
      await db.close();
    }
  }, 20_000);
});
