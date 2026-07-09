import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
    createRecoveryBundle,
    createMigrationBundle,
    decryptBackupPackage,
    encryptBackupPackage,
    readRecoveryBundle,
} from '../../lib/backupPackage';
import { buildBackupV4 } from '../../lib/backupV4';
import { getDefaultExportOptions } from '../../lib/backupConfig';
import { buildCanonicalMigration } from '../../lib/migrationExport';

describe('migration ZIP package', () => {
    it('contains canonical JSON, schemas, dictionaries, validation and CSV files', () => {
        const migration = buildCanonicalMigration({
            customers: [{ id: 'c1', full_name: 'Ελληνικός Πελάτης' }],
        });
        const bundle = createMigrationBundle(migration, { includePrisma: true });
        const files = unzipSync(bundle);

        expect(Object.keys(files)).toEqual(expect.arrayContaining([
            'manifest.json',
            'data.json',
            'schema.json',
            'README_EL.txt',
            'README_EN.txt',
            'validation-report.json',
            'csv/customers.csv',
            'prisma/prisma_customers.csv',
            'prisma/PRISMA_IMPORT_GUIDE_EL.txt',
        ]));
        expect(strFromU8(files['data.json'])).toContain('Ελληνικός Πελάτης');
    });
});

describe('password-encrypted package', () => {
    it('round-trips bytes and rejects the wrong password', async () => {
        const original = new TextEncoder().encode('Ilios ασφαλές backup');
        const encrypted = await encryptBackupPackage(original, 'strong password');

        expect(encrypted.slice(0, 12)).not.toEqual(original.slice(0, 12));
        await expect(decryptBackupPackage(encrypted, 'wrong password')).rejects.toThrow();
        await expect(decryptBackupPackage(encrypted, 'strong password')).resolves.toEqual(original);
    });
});

describe('recovery package', () => {
    it('stores pretty JSON and deduplicated raw images, then reads them back', async () => {
        const dataUrl = 'data:image/png;base64,aGVsbG8=';
        const backup = await buildBackupV4({
            tables: { products: [{ sku: 'A1', image_url: 'https://cdn/a.png' }] },
            requestedTables: ['products'],
            failedTables: [],
            options: getDefaultExportOptions(),
            images: { 'a.png': dataUrl, 'copy.png': dataUrl },
            failedImages: [],
            config: {},
            extras: {},
            syncQueue: [],
            authUsers: [],
            isLocalMode: false,
            source: { appVersion: '1.0.0', schemaVersion: 'test' },
        });

        const bytes = await createRecoveryBundle(backup);
        const files = unzipSync(bytes);
        const imageFiles = Object.keys(files).filter((name) => name.startsWith('images/'));
        expect(imageFiles).toHaveLength(1);
        expect(strFromU8(files['data.json'])).toContain('\n  ');

        const restored = readRecoveryBundle(bytes);
        expect(restored._images).toEqual({ 'a.png': dataUrl, 'copy.png': dataUrl });
    });
});
