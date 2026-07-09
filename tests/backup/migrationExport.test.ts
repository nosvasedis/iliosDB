import { describe, expect, it } from 'vitest';
import {
    buildCanonicalMigration,
    buildMigrationCsvFiles,
    buildPrismaCsvFiles,
    validateCanonicalMigration,
} from '../../lib/migrationExport';

describe('canonical migration export', () => {
    it('normalizes nested order and BOM rows into child entities', () => {
        const migration = buildCanonicalMigration({
            customers: [{ id: 'c1', full_name: 'Δοκιμή' }],
            products: [{
                sku: 'R-1',
                description: 'Δαχτυλίδι',
                recipe: [{ type: 'raw', id: 'm1', quantity: 2 }],
            }],
            orders: [{
                id: 'o1',
                customer_id: 'c1',
                created_at: '2026-07-09T10:00:00Z',
                items: [{ sku: 'R-1', quantity: 2, price_at_order: 12.5 }],
            }],
        });

        expect(migration.entities.bom_lines).toEqual([
            expect.objectContaining({ product_sku: 'R-1', material_id: 'm1', quantity: 2 }),
        ]);
        expect(migration.entities.order_lines).toEqual([
            expect.objectContaining({ order_id: 'o1', sku: 'R-1', quantity: 2 }),
        ]);
    });

    it('reports duplicates, missing required values, and broken references', () => {
        const migration = buildCanonicalMigration({
            customers: [
                { id: 'c1', full_name: 'Α' },
                { id: 'c1', full_name: '' },
            ],
            products: [{ sku: 'A1' }],
            orders: [{ id: 'o1', customer_id: 'missing', items: [{ sku: 'missing', quantity: 1 }] }],
        });
        const report = validateCanonicalMigration(migration);
        expect(report.valid).toBe(false);
        expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
            'duplicate_key',
            'required_value',
            'broken_reference',
        ]));
    });

    it('uses declared stable columns and keeps optional fields from later rows', () => {
        const migration = buildCanonicalMigration({
            customers: [
                { id: 'c1', full_name: 'Α' },
                { id: 'c2', full_name: 'Β', email: 'b@example.test' },
            ],
        });
        const files = buildMigrationCsvFiles(migration);
        const csv = files['customers.csv'];

        expect(csv.startsWith('\uFEFF')).toBe(true);
        expect(csv.split('\r\n')[0]).toContain('email');
        expect(csv).toContain('b@example.test');
    });

    it('quotes Greek text, delimiters, quotes, and newlines correctly', () => {
        const migration = buildCanonicalMigration({
            customers: [{
                id: 'c1',
                full_name: 'Αφοί \"Ήλιος\", ΟΕ',
                notes: 'Γραμμή 1\nΓραμμή 2',
            }],
        });
        const csv = buildMigrationCsvFiles(migration)['customers.csv'];

        expect(csv).toContain('"Αφοί ""Ήλιος"", ΟΕ"');
        expect(csv).toContain('"Γραμμή 1\nΓραμμή 2"');
    });
});

describe('PRISMA Win preset', () => {
    it('emits semicolon-delimited customer, item, stock, and price files', () => {
        const migration = buildCanonicalMigration({
            customers: [{ id: 'c1', full_name: 'Πελάτης' }],
            products: [{ sku: 'A1', description: 'Μενταγιόν', selling_price: 12.5 }],
            product_stock: [{ product_sku: 'A1', warehouse_id: 'w1', quantity: 3 }],
        });
        const files = buildPrismaCsvFiles(migration);

        expect(Object.keys(files)).toEqual(expect.arrayContaining([
            'prisma_customers.csv',
            'prisma_items.csv',
            'prisma_stock.csv',
            'prisma_prices.csv',
        ]));
        expect(files['prisma_prices.csv'].split('\r\n')[0]).toContain(';');
        expect(files['prisma_prices.csv']).toContain('12,5');
    });
});
