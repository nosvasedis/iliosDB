import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const approved = '10000000-0000-4000-8000-000000000001';
const pending = '10000000-0000-4000-8000-000000000002';
const seller = '10000000-0000-4000-8000-000000000003';
let db: PGlite;

const as = (role: 'anon' | 'authenticated', uid = '') =>
    db.exec(`RESET ROLE; SELECT set_config('test.uid','${uid}',false); SET ROLE ${role};`);
const count = async (table: string) => (await db.query<{ n: number }>(`SELECT count(*)::int n FROM ${table}`)).rows[0].n;

describe('approved-only table access', () => {
    beforeAll(async () => {
        db = new PGlite();
        await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
          CREATE SCHEMA auth; CREATE SCHEMA private;
          CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('test.uid',true),'')::uuid $$;
          GRANT USAGE ON SCHEMA public, auth, private TO anon, authenticated, service_role;
          CREATE TABLE profiles(id uuid PRIMARY KEY, role text DEFAULT 'user', is_approved boolean);
          INSERT INTO profiles VALUES('${approved}','user',true),('${pending}','user',false),('${seller}','seller',true);
          CREATE TABLE orders(id text PRIMARY KEY); INSERT INTO orders VALUES('O1');
          CREATE TABLE inventory_balances(id int PRIMARY KEY); INSERT INTO inventory_balances VALUES(1);
          CREATE TABLE product_stock(id int PRIMARY KEY); INSERT INTO product_stock VALUES(1);
          CREATE TABLE audit_logs(id int PRIMARY KEY); INSERT INTO audit_logs VALUES(1);
          CREATE TABLE warehouses(id int PRIMARY KEY); INSERT INTO warehouses VALUES(1);
          ALTER TABLE profiles ENABLE ROW LEVEL SECURITY; ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
          ALTER TABLE inventory_balances ENABLE ROW LEVEL SECURITY; ALTER TABLE product_stock ENABLE ROW LEVEL SECURITY;
          ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY; ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;
          CREATE POLICY "Enable read access for all users" ON orders FOR SELECT USING (true);
          CREATE POLICY "Enable delete access for all users" ON orders FOR DELETE USING (true);
          CREATE POLICY "Authenticated users can read profiles" ON profiles FOR SELECT USING (true);
          CREATE POLICY "Users can read own profile" ON profiles FOR SELECT USING ((SELECT auth.uid()) = id);
          CREATE POLICY inventory_balances_read_authenticated ON inventory_balances FOR SELECT TO authenticated USING (true);
          CREATE POLICY open_stock ON product_stock FOR ALL USING (true);
          CREATE POLICY open_audit ON audit_logs FOR ALL USING (true);
          CREATE POLICY warehouses_read_authenticated ON warehouses FOR SELECT TO authenticated USING (true);
          GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
          CREATE FUNCTION private.current_app_role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT 'x' $$;
          CREATE FUNCTION private.assert_inventory_role(p_allowed text[]) RETURNS void LANGUAGE sql AS $$ SELECT 1 $$;
          GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA private TO authenticated;
          CREATE FUNCTION order_item_total_qty(items jsonb) RETURNS integer LANGUAGE sql IMMUTABLE AS $$ SELECT 1 $$;
          CREATE FUNCTION order_line_identity_key(a text, b text, c text, d text, e text, f text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT '' $$;
          CREATE FUNCTION move_inhouse_batches_from_awaiting_to_waxing(target_sku text) RETURNS integer LANGUAGE sql AS $$ SELECT 1 $$;
          CREATE FUNCTION trg_products_auto_move_inhouse_batches() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN new; END $$;`);
        await db.exec(readFileSync('supabase/migrations/20261104130000_require_approved_access.sql', 'utf8'));
    }, 60000);
    afterAll(async () => { await db?.close(); });

    it('refuses anonymous callers outright', async () => {
        await as('anon');
        await expect(db.query('SELECT * FROM orders')).rejects.toThrow(/permission denied/);
        await expect(db.exec('DELETE FROM orders')).rejects.toThrow(/permission denied/);
    });

    it('shows a self-registered, unapproved account nothing but its own profile', async () => {
        await as('authenticated', pending);
        expect(await count('orders')).toBe(0);
        expect(await count('inventory_balances')).toBe(0);
        expect(await count('product_stock')).toBe(0);
        expect(await count('audit_logs')).toBe(0);
        expect((await db.query<{ id: string }>('SELECT id FROM profiles')).rows).toEqual([{ id: pending }]);
        await db.exec('DELETE FROM orders');
        await as('authenticated', approved);
        expect(await count('orders')).toBe(1);
    });

    it('rejects unapproved accounts in the shared role checks', async () => {
        await as('authenticated', pending);
        expect((await db.query<{ r: string | null }>('SELECT private.current_app_role() r')).rows[0].r).toBeNull();
        await expect(db.query(`SELECT private.assert_inventory_role(ARRAY['admin','user'])`)).rejects.toThrow('δικαίωμα');
        await as('authenticated', approved);
        await db.query(`SELECT private.assert_inventory_role(ARRAY['admin','user'])`);
    });

    it('keeps approved access, and read-only tables stay read-only', async () => {
        await as('authenticated', approved);
        expect(await count('orders')).toBe(1);
        expect(await count('profiles')).toBe(3);
        expect(await count('product_stock')).toBe(1);
        expect(await count('inventory_balances')).toBe(1);
        await db.exec('UPDATE inventory_balances SET id = 2');
        expect((await db.query<{ id: number }>('SELECT id FROM inventory_balances')).rows).toEqual([{ id: 1 }]);
    });

    it('keeps sellers out of product_stock, as before', async () => {
        await as('authenticated', seller);
        expect(await count('product_stock')).toBe(0);
    });
});
