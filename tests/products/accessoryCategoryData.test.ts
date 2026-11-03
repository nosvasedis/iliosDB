import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const correction = readFileSync(new URL('../../supabase/data/accessory_categories.sql', import.meta.url), 'utf8');
async function database() {
  const db = new PGlite();
  await db.exec(`create table products (sku text primary key, category text, description text, legal_only boolean default false, is_component boolean default false, selling_price numeric, stock_qty integer);
    insert into products values ('KD0155','Έξτρα',null,false,false,12,7), ('KD0255','Έξτρα','Περιγραφή χρήστη',false,false,15,8), ('KOU8','Έξτρα',null,false,false,2,9), ('000','Υπηρεσίες','Μεταφορικά',true,false,6,0), ('001','Επισκευή','Επισκευή Κοσμημάτων',true,false,1,0), ('STX134','Εξάρτημα (STX)','Καδένα 150',false,true,0,3);`);
  return db;
}

describe('bounded accessory data correction', () => {
  it('is idempotent, preserves prices/stock/descriptions and leaves legal-only rows and STX untouched', async () => {
    const db = await database();
    try {
      const before = await db.query(`select * from products where sku in ('000','001','STX134') order by sku`);
      await db.exec(correction);
      await db.exec(correction);
      expect((await db.query(`select * from products where sku in ('000','001','STX134') order by sku`)).rows).toEqual(before.rows);
      expect((await db.query(`select sku,category,description,selling_price,stock_qty from products where sku like 'KD%' or sku='KOU8' order by sku`)).rows).toEqual([
        { sku: 'KD0155', category: 'Καδένα', description: 'Καδένα', selling_price: '12', stock_qty: 7 },
        { sku: 'KD0255', category: 'Καδένα', description: 'Περιγραφή χρήστη', selling_price: '15', stock_qty: 8 },
        { sku: 'KOU8', category: 'Κούμπωμα', description: 'Κούμπωμα', selling_price: '2', stock_qty: 9 },
      ]);
    } finally { await db.close(); }
  }, 30_000);

  it('aborts the entire correction if a target no longer has the expected category', async () => {
    const db = await database();
    try {
      await db.exec(`update products set category='Νέα κατηγορία' where sku='KOU8'`);
      const before = await db.query('select * from products order by sku');
      await expect(db.exec(correction)).rejects.toThrow('Accessory classification changed');
      await db.exec('rollback');
      expect((await db.query('select * from products order by sku')).rows).toEqual(before.rows);
    } finally { await db.close(); }
  }, 30_000);
});
