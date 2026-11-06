import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationPath = fileURLToPath(new URL(
  '../../supabase/migrations/20261106120000_mold_code_update_cascade.sql',
  import.meta.url,
));

describe('mold code rename cascade', () => {
  const sql = readFileSync(migrationPath, 'utf8');

  it('redefines the product_molds foreign key with ON UPDATE CASCADE', () => {
    expect(sql).toMatch(/drop constraint if exists product_molds_mold_code_fkey/i);
    expect(sql).toMatch(/add constraint product_molds_mold_code_fkey/i);
    expect(sql).toMatch(/references public\.molds\(code\)/i);
    expect(sql).toMatch(/on update cascade/i);
    expect(sql).toMatch(/on delete cascade/i);
  });
});
