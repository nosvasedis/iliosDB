import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

it('repairs only the shared bucket and rejects future taxpayer data on it', async () => {
  const db = new PGlite();
  const retail = '00000000-0000-0000-0000-000000000003';
  const actual = '16daf819-a981-402f-be14-5fc23586844f';
  try {
    await db.exec(`create table customers (id uuid primary key, vat_number text, profession text, tax_office text);
      insert into customers values ('${retail}', '124471700', 'stale', 'stale'), ('${actual}', '124471700', 'business', 'office');`);
    await db.exec(readFileSync(new URL('../../supabase/migrations/20261015101227_protect_retail_customer_tax_identity.sql', import.meta.url), 'utf8'));
    expect((await db.query('select * from customers where id=$1', [retail])).rows).toEqual([{ id: retail, vat_number: null, profession: null, tax_office: null }]);
    expect((await db.query('select vat_number,profession,tax_office from customers where id=$1', [actual])).rows).toEqual([{ vat_number: '124471700', profession: 'business', tax_office: 'office' }]);
    for (const field of ['vat_number', 'profession', 'tax_office']) {
      await expect(db.query(`update customers set ${field}='invalid' where id=$1`, [retail])).rejects.toThrow('customers_retail_has_no_tax_identity');
    }
    await db.query("update customers set vat_number='' where id=$1", [retail]);
  } finally { await db.close(); }
}, 20000);
