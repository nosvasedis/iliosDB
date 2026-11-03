import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { customerPhones, splitCustomerPhone, withCustomerPhones } from '../../features/customers/customerPhones';

const cases = [
  ['6912345678', 'GR', '6912345678', '', ''],
  ['2101234567 / 6912345678 (Μαρία)', 'GR', '6912345678 (Μαρία)', '2101234567', ''],
  ['+30 691 234 5678, 0030 2101234567', 'GR', '+30 691 234 5678', '0030 2101234567', ''],
  ['6912345678 / 6998765432', 'GR', '6912345678 / 6998765432', '', ''],
  ['\t 2101234567', 'GR', '', '2101234567', ''],
  ['691234567', 'GR', '', '', '691234567'],
  ['21012345678', 'GR', '', '', '21012345678'],
  ['2013888036', 'US', '', '', '2013888036'],
  ['+35799699023', 'CY', '', '', '+35799699023'],
  ['', 'GR', '', '', ''],
];

describe('customer mobile / landline split', () => {
  it.each(cases)('preserves and classifies %s', (phone, country, mobile_phone, landline_phone, phone_unclassified) => {
    expect(splitCustomerPhone(phone, country)).toEqual({ mobile_phone, landline_phone, phone_unclassified });
  });
  it('allows explicit clears and retains unknown numbers during edits', () => {
    const next = withCustomerPhones({ phone: '6912345678 / invalid' }, { mobile_phone: '' });
    expect(customerPhones(next)).toEqual({ mobile_phone: '', landline_phone: '', phone_unclassified: 'invalid' });
    expect(next.phone).toBe('invalid');
  });
});

it('backfills without losing original text, and synchronizes old and new database clients', async () => {
  const db = new PGlite();
  try {
    await db.exec('CREATE SCHEMA private; CREATE TABLE customers(id int primary key, phone text, country text);');
    for (const [id, row] of cases.entries()) await db.query('INSERT INTO customers VALUES ($1,$2,$3)', [id, row[0], row[1]]);
    await db.exec(readFileSync(new URL('../../supabase/migrations/20261015083228_customer_mobile_landline.sql', import.meta.url), 'utf8'));
    const { rows } = await db.query<any>('SELECT * FROM customers ORDER BY id');
    rows.forEach((row, i) => {
      expect(row.phone).toBe(cases[i][0]);
      expect(row.mobile_phone).toBe(cases[i][2]);
      expect(row.landline_phone).toBe(cases[i][3]);
      expect(row.phone_unclassified).toBe(cases[i][4]);
    });
    await db.exec("UPDATE customers SET mobile_phone='',landline_phone='2105555555' WHERE id=0");
    expect((await db.query<any>('SELECT phone FROM customers WHERE id=0')).rows[0].phone).toBe('2105555555');
    await db.exec("UPDATE customers SET phone='6999999999' WHERE id=0");
    expect((await db.query<any>('SELECT mobile_phone,landline_phone FROM customers WHERE id=0')).rows[0]).toEqual({ mobile_phone: '6999999999', landline_phone: '' });
    await db.exec("INSERT INTO customers(id,country,mobile_phone,landline_phone) VALUES (99,'GR','6912345678','2101234567')");
    expect((await db.query<any>('SELECT phone FROM customers WHERE id=99')).rows[0].phone).toBe('6912345678 / 2101234567');
  } finally { await db.close(); }
}, 60000);
