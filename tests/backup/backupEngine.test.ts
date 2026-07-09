import { describe, expect, it } from 'vitest';
import {
    collectProductImageUrls,
    prepareExportPlan,
    prepareRestorePlan,
    buildBackupEnvelope,
    buildRestoreImpact,
    assertMutationSucceeded,
    mergeRowsByConflict,
} from '../../lib/backupEngine';
import { BACKUP_FORMAT_MARKER, BACKUP_VERSION, getDefaultExportOptions } from '../../lib/backupConfig';

describe('collectProductImageUrls', () => {
    it('skips data URLs and placeholders', () => {
        const map = collectProductImageUrls(
            [
                { image_url: 'data:image/png;base64,abc' },
                { image_url: 'https://picsum.photos/200' },
                { image_url: 'https://cdn.example.com/my-product.jpg' },
            ],
            'https://cdn.example.com',
        );
        expect(map.size).toBe(1);
        expect(map.has('my-product.jpg')).toBe(true);
    });
});

describe('prepareExportPlan', () => {
    it('disables images when products not selected', () => {
        const plan = prepareExportPlan({
            tables: ['customers'],
            includeImages: true,
            includeConfig: false,
            includeConfigSecrets: false,
            includeSyncQueue: false,
            includeLocalExtras: false,
        });
        expect(plan.includeImages).toBe(false);
    });

    it('enables images when products selected', () => {
        const plan = prepareExportPlan({
            tables: ['products'],
            includeImages: true,
            includeConfig: false,
            includeConfigSecrets: false,
            includeSyncQueue: false,
            includeLocalExtras: false,
        });
        expect(plan.includeImages).toBe(true);
    });
});

describe('prepareRestorePlan', () => {
    it('computes partial restore with images flag', () => {
        const backup = {
            _meta: {
                version: BACKUP_VERSION,
                format: BACKUP_FORMAT_MARKER,
                created_at: '',
                table_counts: {},
                image_count: 1,
                failed_images: [],
                total_tables: 1,
                is_local_mode: false,
            },
            tables: { products: [{ sku: 'X' }] },
            _images: { 'x.jpg': 'data:image/jpeg;base64,abc' },
        };
        const plan = prepareRestorePlan(backup, {
            tables: ['products'],
            includeImages: true,
            restoreConfig: false,
            includeSyncQueue: false,
            includeLocalExtras: false,
        });
        expect(plan.includeImages).toBe(true);
        expect(plan.tables).toContain('products');
    });
});

describe('restore impact', () => {
    it('merges dependencies without marking them destructive', () => {
        const impact = buildRestoreImpact(
            ['customers', 'orders'],
            ['orders'],
            'merge',
        );
        expect(impact.applyTables).toEqual(['customers', 'orders']);
        expect(impact.destructiveTables).toEqual([]);
    });

    it('shows dependent child tables affected by selected replacement', () => {
        const impact = buildRestoreImpact(
            ['customers', 'orders', 'order_shipments', 'order_shipment_items'],
            ['orders'],
            'replace-selected',
        );
        expect(impact.destructiveTables).toEqual(expect.arrayContaining([
            'orders',
            'order_shipments',
            'order_shipment_items',
        ]));
    });
});

describe('Supabase mutation results', () => {
    it('throws when a delete response contains an error', () => {
        expect(() => assertMutationSucceeded(
            { error: { message: 'permission denied', code: '42501' } },
            'customers',
            'cleanup',
        )).toThrow(/customers.*permission denied/);
    });

    it('accepts an explicit successful response', () => {
        expect(() => assertMutationSucceeded(
            { error: null },
            'customers',
            'cleanup',
        )).not.toThrow();
    });
});

describe('local merge', () => {
    it('updates matching composite keys and preserves unrelated rows', () => {
        const merged = mergeRowsByConflict(
            [
                { product_sku: 'A', suffix: 'X', stock_qty: 1 },
                { product_sku: 'B', suffix: 'Y', stock_qty: 2 },
            ],
            [{ product_sku: 'A', suffix: 'X', stock_qty: 9 }],
            'product_sku,suffix',
        );
        expect(merged).toEqual([
            { product_sku: 'A', suffix: 'X', stock_qty: 9 },
            { product_sku: 'B', suffix: 'Y', stock_qty: 2 },
        ]);
    });
});

describe('buildBackupEnvelope', () => {
    it('includes export_options in meta', () => {
        const options = getDefaultExportOptions();
        const envelope = buildBackupEnvelope({
            tableData: { products: [] },
            failedTables: [],
            options,
            images: {},
            failedImages: [],
            config: {},
            extras: {},
            syncQueue: [],
            isLocalMode: false,
        });
        expect(envelope._meta.version).toBe(BACKUP_VERSION);
        expect(envelope._meta.export_options).toEqual(options);
    });
});
