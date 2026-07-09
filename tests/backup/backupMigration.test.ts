import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
    new URL('../../supabase/migrations/20260709104336_backup_restore_v4.sql', import.meta.url),
    'utf8',
);

describe('backup restore database migration', () => {
    it('keeps restore staging private and service-role only', () => {
        expect(migration).toContain('create schema if not exists private');
        expect(migration).toMatch(/revoke all on function public\.backup_/i);
        expect(migration).toMatch(/grant execute on function public\.backup_.* to service_role/i);
        expect(migration).not.toMatch(/grant .* to anon/i);
    });

    it('provides schema inventory, staging, verification, and one transactional apply function', () => {
        expect(migration).toContain('public.backup_schema_inventory');
        expect(migration).toContain('public.backup_stage_restore');
        expect(migration).toContain('public.backup_apply_restore');
        expect(migration).toContain('private.backup_restore_sessions');
        expect(migration).toContain('private.backup_restore_tables');
    });

    it('uses exact payload keys and ignores only dated historical repair tables', () => {
        expect(migration).toContain("tables.table_name !~ '_backup_[0-9]{8}$'");
        expect(migration).toMatch(/column_name in \(\s*select distinct key[\s\S]*jsonb_object_keys\(element\)/);
        expect(migration).not.toContain("position(format('%I', column_name) in v_columns)");
    });
});
