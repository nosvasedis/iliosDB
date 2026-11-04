import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let db: PGlite;
const can = async (role: string, fn: string) =>
    (await db.query<{ ok: boolean }>('SELECT has_function_privilege($1, $2, \'execute\') ok', [role, fn])).rows[0].ok;

describe('public RPC lockdown', () => {
    beforeAll(async () => {
        db = new PGlite();
        await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
          GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
          CREATE TABLE orders(id text PRIMARY KEY, status text);
          CREATE TABLE audit(note text);
          GRANT SELECT, UPDATE ON orders TO authenticated;
          INSERT INTO orders VALUES('O1','Pending');
          CREATE FUNCTION sync_order_batches(p_order_id text) RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ SELECT 1 $$;
          CREATE FUNCTION handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN RETURN new; END $$;
          CREATE FUNCTION sync_delivery_state_from_order() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN INSERT INTO audit VALUES(new.status); RETURN new; END $$;
          CREATE TRIGGER trg AFTER UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION sync_delivery_state_from_order();
          CREATE FUNCTION has_inspection_exit_pin() RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$ SELECT true $$;
          CREATE FUNCTION set_inspection_exit_pin(pin text) RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ SELECT 1 $$;
          CREATE FUNCTION verify_inspection_exit_pin(pin text) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$ SELECT true $$;
          GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;`);
        await db.exec(readFileSync('supabase/migrations/20261104120000_lock_down_public_rpcs.sql', 'utf8'));
    }, 60000);
    afterAll(async () => { await db?.close(); });

    it('closes every exposed function to anonymous callers', async () => {
        for (const fn of ['sync_order_batches(text)', 'handle_new_user()', 'sync_delivery_state_from_order()', 'has_inspection_exit_pin()', 'set_inspection_exit_pin(text)', 'verify_inspection_exit_pin(text)']) {
            expect(await can('anon', fn)).toBe(false);
        }
    });

    it('keeps the inspection PIN available to signed-in users but not the batch rebuild', async () => {
        for (const fn of ['has_inspection_exit_pin()', 'set_inspection_exit_pin(text)', 'verify_inspection_exit_pin(text)']) expect(await can('authenticated', fn)).toBe(true);
        expect(await can('authenticated', 'sync_order_batches(text)')).toBe(false);
    });

    it('still fires triggers for users who cannot call the trigger function', async () => {
        expect(await can('authenticated', 'sync_delivery_state_from_order()')).toBe(false);
        await db.exec(`SET ROLE authenticated; UPDATE orders SET status='Delivered' WHERE id='O1'; RESET ROLE;`);
        expect((await db.query('SELECT * FROM audit')).rows).toEqual([{ note: 'Delivered' }]);
    });
});
