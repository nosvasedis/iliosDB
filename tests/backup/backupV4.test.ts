import { describe, expect, it } from 'vitest';
import {
    BACKUP_FORMAT_MARKER,
    BACKUP_VERSION,
    BackupEnvelope,
    getDefaultExportOptions,
    validateBackup,
} from '../../lib/backupConfig';
import {
    buildBackupV4,
    migrateBackupToV4,
    verifyBackupV4,
} from '../../lib/backupV4';

describe('backup v4 manifest', () => {
    it('records empty, exported, and failed tables separately', async () => {
        const backup = await buildBackupV4({
            tables: {
                customers: [{ id: 'c1', full_name: 'Αθηνά' }],
                suppliers: [],
            },
            requestedTables: ['customers', 'suppliers', 'products'],
            failedTables: [{ table: 'products', message: 'network unavailable' }],
            options: getDefaultExportOptions(),
            images: {},
            failedImages: [],
            config: {},
            extras: {},
            syncQueue: [],
            authUsers: [],
            isLocalMode: false,
            source: { appVersion: '1.0.0', schemaVersion: '20260709' },
        });

        expect(backup._meta.version).toBe(4);
        expect(backup._manifest.tables.customers.status).toBe('exported');
        expect(backup._manifest.tables.suppliers.status).toBe('empty');
        expect(backup._manifest.tables.products).toMatchObject({
            status: 'failed',
            error: 'network unavailable',
        });
        expect(backup._manifest.complete).toBe(false);
    });

    it('detects table tampering through checksums', async () => {
        const backup = await buildBackupV4({
            tables: { customers: [{ id: 'c1', full_name: 'Αθηνά' }] },
            requestedTables: ['customers'],
            failedTables: [],
            options: getDefaultExportOptions(),
            images: {},
            failedImages: [],
            config: {},
            extras: {},
            syncQueue: [],
            authUsers: [],
            isLocalMode: false,
            source: { appVersion: '1.0.0', schemaVersion: '20260709' },
        });

        backup.tables.customers[0].full_name = 'Tampered';
        const verification = await verifyBackupV4(backup);

        expect(verification.valid).toBe(false);
        expect(verification.errors.some((error) => error.includes('customers'))).toBe(true);
    });
});

describe('legacy migration', () => {
    it('migrates a v3 envelope without treating empty tables as missing', async () => {
        const legacy: BackupEnvelope = {
            _meta: {
                version: 3,
                format: BACKUP_FORMAT_MARKER,
                created_at: '2026-01-01T00:00:00.000Z',
                table_counts: { customers: 0, products: 1 },
                image_count: 0,
                failed_images: [],
                failed_tables: [],
                total_tables: 2,
                is_local_mode: false,
            },
            tables: {
                customers: [],
                products: [{ sku: 'A1' }],
            },
        };

        const migrated = await migrateBackupToV4(legacy);
        expect(migrated._manifest.tables.customers.status).toBe('empty');
        expect(migrated._manifest.tables.products.status).toBe('exported');
        expect(migrated._manifest.complete).toBe(true);
    });

    it('makes v4 the current format and accepts a valid v4 backup', async () => {
        expect(BACKUP_VERSION).toBe(4);
        const backup = await buildBackupV4({
            tables: { products: [{ sku: 'A1' }] },
            requestedTables: ['products'],
            failedTables: [],
            options: getDefaultExportOptions(),
            images: {},
            failedImages: [],
            config: {},
            extras: {},
            syncQueue: [],
            authUsers: [],
            isLocalMode: false,
            source: { appVersion: '1.0.0', schemaVersion: '20260709' },
        });

        expect(validateBackup(backup).valid).toBe(true);
    });
});
