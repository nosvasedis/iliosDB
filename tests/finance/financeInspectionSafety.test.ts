import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FINANCE_TABLES } from '../../features/finance/repository';
import { financeKeys } from '../../features/finance/keys';
import {
    INSPECTION_ALLOWED_QUERY_ROOTS,
    INSPECTION_ALLOWED_TABLES,
    INSPECTION_REALTIME_TABLES,
    isInspectionTableAllowed,
} from '../../lib/inspectionAllowedTables';

describe('finance data never reaches an inspection session', () => {
    it('keeps every finance table out of the inspection allowlists', () => {
        FINANCE_TABLES.forEach((table) => {
            expect(isInspectionTableAllowed(table)).toBe(false);
            expect(INSPECTION_ALLOWED_TABLES.has(table)).toBe(false);
            expect((INSPECTION_REALTIME_TABLES as readonly string[]).includes(table)).toBe(false);
        });
        expect(INSPECTION_ALLOWED_QUERY_ROOTS.has(financeKeys.all[0])).toBe(false);
    });

    it('never persists finance queries to localStorage', () => {
        const source = readFileSync('index.tsx', 'utf8');
        const persisted = source.split('PERSISTED_QUERY_ROOT_KEYS = new Set([')[1].split('])')[0];
        expect(persisted).not.toContain(`'${financeKeys.all[0]}'`);
    });

    it('stores no Χ/Τ data on inspection-visible tables', () => {
        const migration = readFileSync('supabase/migrations/20261102120000_finance_module.sql', 'utf8');
        expect(migration).not.toMatch(/alter table public\.(orders|customers|legal_\w+|order_shipments)\b/i);
        FINANCE_TABLES.forEach((table) => expect(migration).toContain(`'${table}'`));
    });
});
