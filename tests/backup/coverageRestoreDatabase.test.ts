import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ALL_BACKUP_TABLE_NAMES, resolveTableDependencies } from '../../lib/backupConfig';

const migration = '20261030120001_backup_count_and_pricing_coverage.sql';
const read = (name: string) => readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8');
let db: PGlite;
const counts = ['inventory_count_sessions', 'inventory_count_batches', 'inventory_count_targets', 'inventory_count_entries'];
const covered = [...counts, 'pricing_recalculation_runs'];

describe('backup coverage and restoration of count sessions and pricing history', () => {
    beforeAll(async () => {
        db = new PGlite();
        await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
          CREATE TABLE inventory_count_sessions(id integer PRIMARY KEY);
          CREATE TABLE inventory_count_batches(id integer PRIMARY KEY, session_id integer REFERENCES inventory_count_sessions ON DELETE RESTRICT);
          CREATE TABLE inventory_count_targets(id integer PRIMARY KEY, batch_id integer REFERENCES inventory_count_batches ON DELETE RESTRICT);
          CREATE TABLE inventory_count_entries(id integer PRIMARY KEY, target_id integer REFERENCES inventory_count_targets ON DELETE RESTRICT);
          CREATE TABLE pricing_recalculation_runs(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, before_values jsonb, after_values jsonb);
        `);
        await db.exec(read('20260709104336_backup_restore_v4.sql'));
        // Match the private restore implementation behind the current SBZ wrapper.
        await db.exec('ALTER FUNCTION public.backup_apply_restore(uuid) SET SCHEMA private; ALTER FUNCTION private.backup_apply_restore(uuid) RENAME TO backup_apply_restore_pre_sbz;');
        await db.exec(read(migration));
    }, 60000);
    afterAll(async () => { await db?.close(); });

    it('keeps the app, Worker and database registries identical with all five active tables', async () => {
        const latestRegistryMigration = readdirSync(new URL('../../supabase/migrations/', import.meta.url)).filter((name) => name.endsWith('.sql')).sort().reverse()
            .find((name) => /create or replace function private\.backup_allowed_tables\(\)/i.test(read(name)));
        // A later migration must not silently replace the expanded allowlist.
        const finalRegistry = read(latestRegistryMigration!).split(/create or replace function private\.backup_allowed_tables\(\)/i)[1].split('::text[]')[0];
        expect([...finalRegistry.matchAll(/'([a-z][a-z_]+)'/g)].map((match) => match[1])).toEqual(ALL_BACKUP_TABLE_NAMES);
        const sql = await db.query<{ tables: string[] }>('SELECT private.backup_allowed_tables() tables');
        expect(sql.rows[0].tables).toEqual(ALL_BACKUP_TABLE_NAMES);
        const source = readFileSync(new URL('../../worker/worker.js', import.meta.url), 'utf8');
        const workerTables = [...source.split('const BACKUP_TABLES = [')[1].split('];')[0].matchAll(/'([^']+)'/g)].map((m) => m[1]);
        expect(workerTables).toEqual(ALL_BACKUP_TABLE_NAMES);
        expect(ALL_BACKUP_TABLE_NAMES).toEqual(expect.arrayContaining(covered));
        const dependencies = resolveTableDependencies(['inventory_count_entries']);
        expect(dependencies).toEqual(expect.arrayContaining([...counts, 'inventory_events', 'warehouses', 'products']));
    });

    it('restores populated FK chains, original identity IDs and sequence state', async () => {
        await db.exec(`INSERT INTO inventory_count_sessions VALUES(1); INSERT INTO inventory_count_batches VALUES(1,1);
          INSERT INTO inventory_count_targets VALUES(1,1); INSERT INTO inventory_count_entries VALUES(1,1);
          INSERT INTO pricing_recalculation_runs(before_values,after_values) VALUES('{}','{}');`);
        const tables = {
            inventory_count_sessions: [{ id: 2 }], inventory_count_batches: [{ id: 2, session_id: 2 }],
            inventory_count_targets: [{ id: 2, batch_id: 2 }], inventory_count_entries: [{ id: 2, target_id: 2 }],
            pricing_recalculation_runs: [{ id: 70, before_values: { price: 10 }, after_values: { price: 12 } }],
        };
        const session = await db.query<{ id: string }>("SELECT public.backup_stage_restore('{}',$1,'replace-selected',$2) id", [tables, covered]);
        const result = await db.query<{ result: { verified: boolean } }>('SELECT private.backup_apply_restore_pre_sbz($1) result', [session.rows[0].id]);
        expect(result.rows[0].result.verified).toBe(true);
        for (const table of covered) expect((await db.query(`SELECT * FROM ${table}`)).rows).toEqual(tables[table as keyof typeof tables]);
        const next = await db.query<{ id: number }>("INSERT INTO pricing_recalculation_runs(before_values,after_values) VALUES('{}','{}') RETURNING id");
        expect(next.rows[0].id).toBe(71);
    });

    it('clears count children before parents when restoring empty tables', async () => {
        const tables = Object.fromEntries(counts.map((table) => [table, []]));
        const session = await db.query<{ id: string }>("SELECT public.backup_stage_restore('{}',$1,'replace-selected',$2) id", [tables, counts]);
        await db.query('SELECT private.backup_apply_restore_pre_sbz($1)', [session.rows[0].id]);
        for (const table of counts) expect((await db.query(`SELECT * FROM ${table}`)).rows).toEqual([]);
    });

    it('rolls back all earlier writes if a restored child has a broken foreign key', async () => {
        const tables = { inventory_count_sessions: [{ id: 9 }], inventory_count_batches: [{ id: 9, session_id: 999 }] };
        const session = await db.query<{ id: string }>("SELECT public.backup_stage_restore('{}',$1,'replace-selected',$2) id", [tables, Object.keys(tables)]);
        await expect(db.query('SELECT private.backup_apply_restore_pre_sbz($1)', [session.rows[0].id])).rejects.toThrow();
        expect((await db.query('SELECT * FROM inventory_count_sessions')).rows).toEqual([]);
        expect((await db.query<{ status: string }>('SELECT status FROM private.backup_restore_sessions WHERE id=$1', [session.rows[0].id])).rows[0].status).toBe('staged');
    });
});
