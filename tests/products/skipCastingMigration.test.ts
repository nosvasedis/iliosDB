import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';

const migrationPath = fileURLToPath(new URL(
  '../../supabase/migrations/20260922120000_add_product_skip_casting.sql',
  import.meta.url,
));

describe('skip_casting migration', () => {
  const sql = readFileSync(migrationPath, 'utf8');

  it('adds a non-null boolean column with false default', () => {
    expect(sql).toMatch(/products\s+add column if not exists skip_casting boolean not null default false/i);
  });

  it('backfills assembly products that were created without casting weight', () => {
    expect(sql).toMatch(/set skip_casting = true/i);
    expect(sql).toMatch(/coalesce\(weight_g,\s*0\)\s*=\s*0/i);
    expect(sql).toMatch(/coalesce\(secondary_weight_g,\s*0\)\s*=\s*0/i);
    expect(sql).toMatch(/is_component\s*=\s*false/i);
  });

  it('applies locally and backfills zero-weight non-component products', async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        create table public.products (
          sku text primary key,
          weight_g numeric,
          secondary_weight_g numeric,
          is_component boolean not null default false
        );
        insert into public.products (sku, weight_g, secondary_weight_g, is_component) values
          ('ASM1', 0, 0, false),
          ('CAST1', 2.4, 0, false),
          ('STX1', 0, 0, true),
          ('SEC1', 0, 1.2, false);
      `);
      await db.exec(sql);

      const { rows } = await db.query<{ sku: string; skip_casting: boolean }>(
        'select sku, skip_casting from public.products order by sku',
      );
      expect(rows).toEqual([
        { sku: 'ASM1', skip_casting: true },
        { sku: 'CAST1', skip_casting: false },
        { sku: 'SEC1', skip_casting: false },
        { sku: 'STX1', skip_casting: false },
      ]);
    } finally {
      await db.close();
    }
  }, 20_000);
});
