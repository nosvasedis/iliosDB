import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
    ALL_BACKUP_TABLE_NAMES,
    BACKUP_FORMAT_MARKER,
    BACKUP_PRESETS,
    BACKUP_VERSION,
    resolveExportTables,
    resolveRestoreTables,
    resolveTableDependencies,
    validateBackup,
    readLocalExtras,
    writeLocalExtras,
    LOCAL_EXTRA_KEYS,
} from '../../lib/backupConfig';
import { CORE_REALTIME_TABLES } from '../../hooks/api/useRealtimeInvalidation';

describe('resolveTableDependencies', () => {
    it('includes parent tables when selecting orders', () => {
        const resolved = resolveTableDependencies(['orders']);
        expect(resolved).toContain('customers');
        expect(resolved).toContain('orders');
        expect(resolved.indexOf('customers')).toBeLessThan(resolved.indexOf('orders'));
    });

    it('includes product chain for product_variants', () => {
        const resolved = resolveTableDependencies(['product_variants']);
        expect(resolved).toContain('products');
        expect(resolved).toContain('product_variants');
    });

    it('includes shipment parent for order_shipment_items', () => {
        const resolved = resolveTableDependencies(['order_shipment_items']);
        expect(resolved).toContain('orders');
        expect(resolved).toContain('order_shipments');
        expect(resolved).toContain('order_shipment_items');
    });
});

describe('resolveExportTables', () => {
    it('expands dependencies from export options', () => {
        const tables = resolveExportTables({
            tables: ['legal_document_lines'],
            includeImages: false,
            includeConfig: false,
            includeConfigSecrets: false,
            includeSyncQueue: false,
            includeLocalExtras: false,
        });
        expect(tables).toContain('legal_documents');
        expect(tables).toContain('legal_document_lines');
    });
});

describe('validateBackup', () => {
    it('validates V1 flat format', () => {
        const result = validateBackup({
            products: [{ sku: 'A1' }],
            customers: [],
        });
        expect(result.valid).toBe(true);
        expect(result.isEnvelope).toBe(false);
        expect(result.tableCounts.products).toBe(1);
    });

    it('validates V2 envelope', () => {
        const result = validateBackup({
            _meta: {
                version: 2,
                format: BACKUP_FORMAT_MARKER,
                created_at: '2026-01-01T00:00:00.000Z',
                table_counts: { products: 1 },
                image_count: 0,
                failed_images: [],
                total_tables: 1,
                is_local_mode: false,
            },
            tables: { products: [{ sku: 'A1' }] },
        });
        expect(result.valid).toBe(true);
        expect(result.isEnvelope).toBe(true);
        expect(result.version).toBe(2);
    });

    it('validates V3 envelope with export_options', () => {
        const result = validateBackup({
            _meta: {
                version: BACKUP_VERSION,
                format: BACKUP_FORMAT_MARKER,
                created_at: '2026-01-01T00:00:00.000Z',
                table_counts: { products: 2, profiles: 1 },
                image_count: 3,
                failed_images: [],
                failed_tables: [],
                total_tables: 2,
                is_local_mode: false,
                export_options: {
                    tables: ['products', 'profiles'],
                    includeImages: true,
                    includeConfig: false,
                    includeConfigSecrets: false,
                    includeSyncQueue: false,
                    includeLocalExtras: true,
                },
            },
            tables: { products: [{}, {}], profiles: [{}] },
            _extras: { 'orders-tag-color-overrides': { tag: 1 } },
        });
        expect(result.valid).toBe(true);
        expect(result.version).toBe(3);
        expect(result.exportOptions?.tables).toContain('profiles');
        expect(result.hasExtras).toBe(true);
    });

    it('rejects invalid JSON root', () => {
        const result = validateBackup(null);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
    });

    it('warns when profiles missing', () => {
        const result = validateBackup({
            _meta: { version: 3, format: BACKUP_FORMAT_MARKER, created_at: '', table_counts: {}, image_count: 0, failed_images: [], total_tables: 1, is_local_mode: false },
            tables: { products: [{}] },
        });
        expect(result.warnings.some((w) => w.includes('profiles'))).toBe(true);
    });
});

describe('resolveRestoreTables', () => {
    const backup = {
        _meta: {
            version: 3,
            format: BACKUP_FORMAT_MARKER,
            created_at: '',
            table_counts: { orders: 1, customers: 1, products: 0 },
            image_count: 0,
            failed_images: [],
            total_tables: 2,
            is_local_mode: false,
            export_options: {
                tables: ['orders', 'customers'],
                includeImages: false,
                includeConfig: false,
                includeConfigSecrets: false,
                includeSyncQueue: false,
                includeLocalExtras: false,
            },
        },
        tables: {
            orders: [{ id: '1' }],
            customers: [{ id: 'c1' }],
            products: [],
        },
    };

    it('uses explicit restore table selection', () => {
        const tables = resolveRestoreTables(backup, { tables: ['orders'] });
        expect(tables).toContain('customers');
        expect(tables).toContain('orders');
        expect(tables).not.toContain('products');
    });

    it('falls back to export_options from backup meta', () => {
        const tables = resolveRestoreTables(backup);
        expect(tables).toEqual(expect.arrayContaining(['orders', 'customers']));
    });
});

describe('BACKUP_PRESETS', () => {
    it('full preset covers all registry tables', () => {
        const full = BACKUP_PRESETS.find((p) => p.id === 'full')!;
        expect(full.options.tables.length).toBe(ALL_BACKUP_TABLE_NAMES.length);
    });

    it('full preset covers realtime tables and audit_logs', () => {
        const full = BACKUP_PRESETS.find((p) => p.id === 'full')!;
        const set = new Set(full.options.tables);
        for (const t of CORE_REALTIME_TABLES) {
            expect(set.has(t)).toBe(true);
        }
        expect(set.has('audit_logs')).toBe(true);
        expect(set.has('profiles')).toBe(true);
        expect(set.has('tag_color_overrides')).toBe(true);
    });
});

describe('local extras', () => {
    const store: Record<string, string> = {};

    beforeEach(() => {
        vi.stubGlobal('localStorage', {
            getItem: (k: string) => store[k] ?? null,
            setItem: (k: string, v: string) => { store[k] = v; },
            removeItem: (k: string) => { delete store[k]; },
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        Object.keys(store).forEach((k) => delete store[k]);
    });

    it('round-trips localStorage extras', () => {
        const key = LOCAL_EXTRA_KEYS[0];
        localStorage.setItem(key, JSON.stringify({ test: 42 }));
        const extras = readLocalExtras();
        expect(extras[key]).toEqual({ test: 42 });

        localStorage.removeItem(key);
        writeLocalExtras({ [key]: { restored: true } });
        expect(JSON.parse(localStorage.getItem(key)!)).toEqual({ restored: true });
    });
});
