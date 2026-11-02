import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const admin = '30000000-0000-4000-8000-000000000001';
const seller = '30000000-0000-4000-8000-000000000002';
const party = '60000000-0000-4000-8000-000000000001';
let db: PGlite;

const migration = readFileSync('supabase/migrations/20261102120000_finance_module.sql', 'utf8');
const financeDdl = migration.slice(0, migration.indexOf('-- ─── Backup registry'));

async function as(uid: string, locked = false) {
    await db.exec(`RESET ROLE; SELECT set_config('test.uid','${uid}',false); SELECT set_config('test.locked','${locked}',false); SET ROLE authenticated`);
}

describe('finance module database', () => {
    beforeAll(async () => {
        db = new PGlite();
        await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
          CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('test.uid',true),'')::uuid $$;
          CREATE SCHEMA private;
          CREATE FUNCTION private.inspection_session_active() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT coalesce(NULLIF(current_setting('test.locked',true),'')::boolean,false) $$;
          CREATE TABLE profiles(id uuid PRIMARY KEY, role text, is_approved boolean);
          INSERT INTO profiles VALUES('${admin}','admin',true),('${seller}','seller',true);
          CREATE TABLE suppliers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text);
          INSERT INTO suppliers VALUES('${party}','Καρφωτής Α');
          CREATE TABLE customers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), full_name text);
          CREATE TABLE orders(id text PRIMARY KEY);
          CREATE TABLE legal_documents(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
          GRANT USAGE ON SCHEMA public, auth, private TO authenticated, anon, service_role;
        `);
        await db.exec(financeDdl);
    }, 60000);
    afterAll(async () => { await db?.close(); });

    it('seeds an editable category tree with the reference examples', async () => {
        await as(admin);
        const rows = (await db.query<{ name: string }>('SELECT name FROM finance_categories')).rows.map((r) => r.name);
        expect(rows).toEqual(expect.arrayContaining(['Λειτουργικά', 'ΔΕΗ', 'Κινητό Αλέκου', 'Καρφωτής', 'Μέταλλο', 'Εξαρτήματα (STX)', 'Προμήθειες Πλασιέ']));
        await db.exec(`INSERT INTO finance_categories(name) VALUES('Ενοίκιο')`);
    });

    it('hides every finance row from non-admins and during an inspection session', async () => {
        await as(seller);
        expect((await db.query('SELECT * FROM finance_categories')).rows).toEqual([]);
        await expect(db.exec(`INSERT INTO finance_categories(name) VALUES('x')`)).rejects.toThrow();
        await as(admin, true);
        expect((await db.query('SELECT * FROM finance_categories')).rows).toEqual([]);
        await expect(db.exec(`INSERT INTO finance_categories(name) VALUES('x')`)).rejects.toThrow();
    });

    it('derives expense status from payments', async () => {
        await as(admin);
        const category = (await db.query<{ id: string }>(`SELECT id FROM finance_categories WHERE name='ΔΕΗ'`)).rows[0].id;
        const expense = (await db.query<{ id: string; status: string }>(
            `INSERT INTO finance_expenses(category_id, party_id, amount_net, amount_gross) VALUES($1,$2,100,124) RETURNING id, status`,
            [category, party],
        )).rows[0];
        expect(expense.status).toBe('unpaid');
        await db.query(`INSERT INTO finance_expense_payments(expense_id, party_id, amount) VALUES($1,$2,50)`, [expense.id, party]);
        expect((await db.query<any>('SELECT status, paid_amount FROM finance_expenses WHERE id=$1', [expense.id])).rows[0])
            .toEqual({ status: 'partial', paid_amount: '50.00' });
        await db.query(`INSERT INTO finance_expense_payments(expense_id, party_id, amount) VALUES($1,$2,74)`, [expense.id, party]);
        expect((await db.query<any>('SELECT status FROM finance_expenses WHERE id=$1', [expense.id])).rows[0].status).toBe('paid');
        await db.query(`DELETE FROM finance_expense_payments WHERE expense_id=$1 AND amount=74`, [expense.id]);
        expect((await db.query<any>('SELECT status FROM finance_expenses WHERE id=$1', [expense.id])).rows[0].status).toBe('partial');
    });

    it('confirms a worker statement once and stamps its assignments', async () => {
        await as(admin);
        const category = (await db.query<{ id: string }>(`SELECT id FROM finance_categories WHERE name='Καρφωτής'`)).rows[0].id;
        const assignment = (await db.query<{ id: string }>(
            `INSERT INTO production_stage_assignments(batch_id, stage, party_id, quantity) VALUES('B1','Setting',$1,10) RETURNING id`, [party],
        )).rows[0].id;
        const statement = (await db.query<{ id: string }>(
            `INSERT INTO finance_worker_statements(party_id, lines, total) VALUES($1,$2,18) RETURNING id`,
            [party, JSON.stringify([{ assignment_id: assignment, amount: 18 }])],
        )).rows[0].id;
        const first = (await db.query<{ id: string }>('SELECT finance_confirm_worker_statement_v1($1,$2) id', [statement, category])).rows[0].id;
        const second = (await db.query<{ id: string }>('SELECT finance_confirm_worker_statement_v1($1,$2) id', [statement, category])).rows[0].id;
        expect(second).toBe(first);
        expect((await db.query('SELECT * FROM finance_expenses WHERE source_kind=$1', ['worker_statement'])).rows).toHaveLength(1);
        expect((await db.query<any>('SELECT statement_id FROM production_stage_assignments WHERE id=$1', [assignment])).rows[0].statement_id).toBe(statement);
        await as(seller);
        await expect(db.query('SELECT finance_confirm_worker_statement_v1($1,$2)', [statement, category])).rejects.toThrow();
    });
});
