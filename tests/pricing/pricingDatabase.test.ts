import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import { buildCatalogueRepricing, type PricingCatalogSnapshot } from '../../utils/catalogRepricing';

const actor = '30000000-0000-4000-8000-000000000001';
let db: PGlite;
const snapshot = async () => (await db.query<{ data: PricingCatalogSnapshot }>('select public.pricing_catalog_snapshot_v1() data')).rows[0].data;
const apply = (fingerprint: string, rows: any[], replaceManualSelling = false) => db.query('select public.apply_pricing_recalculation_v2($1, $2, $3) data', [fingerprint, rows, replaceManualSelling]);

describe('pricing PostgreSQL transaction and policy validation', () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT ''${actor}''::uuid';
      CREATE TABLE profiles(id uuid PRIMARY KEY, role text, is_approved boolean);
      INSERT INTO profiles VALUES ('${actor}', 'admin', true);
      CREATE TABLE global_settings(id integer PRIMARY KEY, silver_price_gram numeric);
      CREATE TABLE products(sku text PRIMARY KEY, weight_g numeric, secondary_weight_g numeric, gender text DEFAULT 'Women', production_type text DEFAULT 'InHouse', plating_type text DEFAULT 'None', is_component boolean DEFAULT false, skip_casting boolean DEFAULT false,
        active_price numeric, draft_price numeric, selling_price numeric, selling_price_manual_override boolean DEFAULT false,
        labor_casting numeric DEFAULT 0, labor_casting_manual_override boolean DEFAULT false,
        labor_technician numeric DEFAULT 0, labor_technician_manual_override boolean DEFAULT false,
        labor_plating_x numeric DEFAULT 0, labor_plating_x_manual_override boolean DEFAULT false,
        labor_plating_d numeric DEFAULT 0, labor_plating_d_manual_override boolean DEFAULT false);
      CREATE TABLE product_variants(product_sku text REFERENCES products, suffix text, active_price numeric, selling_price numeric, selling_price_manual_override boolean DEFAULT false, PRIMARY KEY(product_sku,suffix));
      CREATE TABLE recipes(id integer PRIMARY KEY, parent_sku text, type text, material_id text, component_sku text, quantity numeric);
      CREATE TABLE materials(id text PRIMARY KEY, cost_per_unit numeric);
      CREATE TABLE orders(id integer PRIMARY KEY, price_at_order numeric);
      GRANT USAGE ON SCHEMA public, auth TO authenticated, service_role;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
    `);
    await db.exec(readFileSync(new URL('../../supabase/migrations/20260930193005_configurable_pricing_rules.sql', import.meta.url), 'utf8'));
    await db.exec(readFileSync(new URL('../../supabase/migrations/20260930201149_protect_pricing_policy_edits.sql', import.meta.url), 'utf8'));
    await db.exec(readFileSync(new URL('../../supabase/migrations/20260930202430_explicit_manual_price_replacement.sql', import.meta.url), 'utf8'));
  }, 60000);
  beforeEach(async () => {
    await db.exec(`RESET ROLE; DELETE FROM pricing_recalculation_runs; DELETE FROM product_variants; DELETE FROM products; DELETE FROM global_settings; DELETE FROM recipes; DELETE FROM materials; DELETE FROM orders;
      UPDATE profiles SET role='admin', is_approved=true;
      INSERT INTO global_settings(id,silver_price_gram) VALUES(1,1);
      INSERT INTO products(sku,weight_g,active_price,draft_price,selling_price,labor_casting,labor_technician) VALUES('RN1',10,16.5,16.5,43,1.5,5);
      INSERT INTO product_variants VALUES('RN1','',16.5,43,false), ('RN1','X',16.5,70,true);
      INSERT INTO orders VALUES(1,43);`);
  });
  afterAll(async () => { await db?.close(); });
  it('updates the master and every variant atomically, stores exact recovery values and leaves orders alone', async () => {
    const s = await snapshot(); const plan = buildCatalogueRepricing(s);
    const result = await apply(s.fingerprint, plan.rows.map(({ sku, suffix, values }) => ({ sku, suffix, values })));
    expect((result.rows[0] as any).data).toMatchObject({ masters: 1, variants: 2 });
    const updated = await snapshot();
    expect(Number(updated.products[0].labor_casting)).toBe(2);
    expect(Number(updated.products[0].selling_price)).toBe(44);
    expect(Number(updated.variants.find(v => v.suffix === '')?.selling_price)).toBe(44);
    expect(Number(updated.variants.find(v => v.suffix === 'X')?.selling_price)).toBe(70);
    const recovery = (await db.query<any>('select before_values from pricing_recalculation_runs')).rows[0].before_values;
    expect(recovery.find((r: any) => r.suffix === null).values).toMatchObject({ selling_price: 43, labor_casting: 1.5 });
    expect(Number((await db.query<any>('select price_at_order from orders')).rows[0].price_at_order)).toBe(43);
  });
  it('rolls back an earlier valid master update if a later variant targets a manual price', async () => {
    const s = await snapshot();
    await expect(apply(s.fingerprint, [{ sku: 'RN1', suffix: null, values: { selling_price: 44 } }, { sku: 'RN1', suffix: 'X', values: { selling_price: 90 } }])).rejects.toThrow('χειροκίνητη');
    expect(Number((await snapshot()).products[0].selling_price)).toBe(43);
    expect((await db.query<any>('select count(*) n from pricing_recalculation_runs')).rows[0].n).toBe(0);
  });
  it('explicitly replaces master and variant manual selling prices, clears flags and saves both for recovery', async () => {
    await db.exec(`UPDATE products SET selling_price_manual_override=true, labor_casting_manual_override=true`);
    const s = await snapshot();
    const plan = buildCatalogueRepricing(s, { replaceManualSelling: true });
    await db.exec('SET ROLE authenticated');
    try { await apply(s.fingerprint, plan.rows.map(({ sku, suffix, values }) => ({ sku, suffix, values })), true); }
    finally { await db.exec('RESET ROLE'); }
    const updated = await snapshot();
    expect(updated.products[0].selling_price_manual_override).toBe(false);
    expect(Number(updated.products[0].selling_price)).toBe(43);
    expect(Number(updated.products[0].labor_casting)).toBe(1.5);
    expect(updated.products[0].labor_casting_manual_override).toBe(true);
    expect(updated.variants.find(v => v.suffix === 'X')?.selling_price_manual_override).toBe(false);
    expect(Number(updated.variants.find(v => v.suffix === 'X')?.selling_price)).toBe(43);
    const recovery = (await db.query<any>('select before_values,after_values from pricing_recalculation_runs')).rows[0];
    expect(recovery.before_values.find((r: any) => r.suffix === null).values).toMatchObject({ selling_price: 43, selling_price_manual_override: true });
    expect(recovery.before_values.find((r: any) => r.suffix === 'X').values).toMatchObject({ selling_price: 70, selling_price_manual_override: true });
    expect(recovery.after_values.find((r: any) => r.suffix === 'X').values).toMatchObject({ selling_price: 43, selling_price_manual_override: false });
  });
  it('does not bypass manual labor protection when replacing manual selling prices', async () => {
    await db.exec('UPDATE products SET labor_casting_manual_override=true');
    const s = await snapshot();
    await expect(apply(s.fingerprint, [{ sku: 'RN1', suffix: 'X', values: { selling_price: 44 } }, { sku: 'RN1', suffix: null, values: { labor_casting: 2 } }], true)).rejects.toThrow('χειροκίνητη');
    expect(Number((await snapshot()).variants.find(v => v.suffix === 'X')?.selling_price)).toBe(70);
    expect((await db.query<any>('select count(*) n from pricing_recalculation_runs')).rows[0].n).toBe(0);
  });
  it('requires explicit replacement and never accepts caller-written override flags', async () => {
    const s = await snapshot();
    await expect(db.query('select public.apply_pricing_recalculation_v2($1,$2) data', [s.fingerprint, [{ sku: 'RN1', suffix: 'X', values: { selling_price: 44 } }]])).rejects.toThrow('χειροκίνητη');
    await expect(apply(s.fingerprint, [{ sku: 'RN1', suffix: 'X', values: { selling_price: 44, selling_price_manual_override: false } }], true)).rejects.toThrow();
    await expect(db.query('select public.apply_pricing_recalculation_v2($1,$2,null)', [s.fingerprint, [{ sku: 'RN1', suffix: 'X', values: { selling_price: 44 } }]])).rejects.toThrow('explicit');
  });
  it('rejects stale previews after a concurrent settings or recipe change', async () => {
    const s = await snapshot();
    await db.exec(`UPDATE global_settings SET pricing_rules='{"casting_rate":0.3}'`);
    await expect(apply(s.fingerprint, [{ sku: 'RN1', suffix: null, values: { selling_price: 44 } }])).rejects.toThrow('δεδομένα άλλαξαν');
    const fresh = await snapshot();
    await db.exec(`INSERT INTO recipes VALUES(1,'RN1','component',null,'RN1',1)`);
    await expect(apply(fresh.fingerprint, [{ sku: 'RN1', suffix: null, values: { selling_price: 44 } }])).rejects.toThrow('δεδομένα άλλαξαν');
  });
  it('rejects duplicates, unknown fields, invalid values and service rows', async () => {
    const s = await snapshot();
    for (const rows of [
      [{ sku: 'RN1', suffix: null, values: { stock_qty: 5 } }],
      [{ sku: 'RN1', suffix: null, values: { selling_price: -1 } }],
      [{ sku: 'RN1', suffix: null, values: { selling_price: 44 } }, { sku: 'RN1', suffix: null, values: { selling_price: 44 } }],
      [{ sku: '000', suffix: null, values: { selling_price: 44 } }],
    ]) await expect(apply(s.fingerprint, rows)).rejects.toThrow();
    expect(Number((await snapshot()).products[0].selling_price)).toBe(43);
  });
  it('validates policy at the database boundary, including explicit zero rates', async () => {
    for (const rules of [{ casting_rate: -1 }, { casting_rate: '0.2' }, { technician_threshold_1: 5 }, { technician_threshold_3: 4 }, { retail_multiplier: 0 }, { price_rounding_step: 0.015 }, { unknown: 7 }]) {
      await expect(db.query('UPDATE global_settings SET pricing_rules=$1', [rules])).rejects.toThrow();
    }
    await db.query('UPDATE global_settings SET pricing_rules=$1', [{ casting_rate: 0, plating_rate: 0 }]);
    expect((await snapshot()).settings.pricing_rules).toEqual({ casting_rate: 0, plating_rate: 0 });
  });
  it('rejects a non-admin even when its table privileges would allow updates', async () => {
    await db.exec("UPDATE profiles SET role='user'; SET ROLE authenticated;");
    try {
      await expect(snapshot()).rejects.toThrow('διαχειριστής');
      await expect(apply('unused', [{ sku: 'RN1', suffix: 'X', values: { selling_price: 44 } }], true)).rejects.toThrow('διαχειριστής');
    } finally { await db.exec('RESET ROLE;'); }
  });
  it('protects the pricing policy even when legacy general-settings policies allow writes', async () => {
    await db.exec("UPDATE profiles SET role='user'; SET ROLE authenticated;");
    try {
      await expect(db.exec(`UPDATE global_settings SET pricing_rules='{"casting_rate":0.9}'`)).rejects.toThrow('διαχειριστής');
      await expect(db.exec('UPDATE global_settings SET silver_price_gram=2')).resolves.toBeDefined();
    } finally { await db.exec('RESET ROLE;'); }
    await db.exec("UPDATE profiles SET role='admin'; SET ROLE authenticated;");
    try { await db.exec(`UPDATE global_settings SET pricing_rules='{"casting_rate":0.3}'`); } finally { await db.exec('RESET ROLE;'); }
    expect((await snapshot()).settings.pricing_rules.casting_rate).toBe(0.3);
  });
  it('allows an approved admin through invoker permissions and enforces recovery-table RLS', async () => {
    await db.exec('SET ROLE authenticated;');
    try {
      const s = await snapshot();
      await apply(s.fingerprint, [{ sku: 'RN1', suffix: null, values: { selling_price: 44 } }]);
      expect((await db.query<any>('select count(*) n from pricing_recalculation_runs')).rows[0].n).toBe(1);
    } finally { await db.exec('RESET ROLE;'); }
    await db.exec("UPDATE profiles SET role='user'; SET ROLE authenticated;");
    try { expect((await db.query<any>('select count(*) n from pricing_recalculation_runs')).rows[0].n).toBe(0); } finally { await db.exec('RESET ROLE;'); }
  });
});
