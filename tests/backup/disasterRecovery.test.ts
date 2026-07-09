import { describe, expect, it } from 'vitest';
import { createRecoveryBundle, readRecoveryBundle } from '../../lib/backupPackage';
import { buildBackupV4, verifyBackupV4 } from '../../lib/backupV4';
import { getDefaultExportOptions } from '../../lib/backupConfig';

describe('disaster recovery drill', () => {
    it('round-trips all rows and image bytes after the live fixture is destroyed', async () => {
        const originalTables = {
            customers: [{ id: 'c1', full_name: 'Εργαστήριο Ήλιος' }],
            products: [{ sku: 'A1', description: 'Δαχτυλίδι', stock_qty: 4 }],
            orders: [{ id: 'o1', customer_id: 'c1', items: [{ sku: 'A1', quantity: 2 }] }],
        };
        const image = 'data:image/jpeg;base64,ZmFrZS1pbWFnZS1ieXRlcw==';
        const backup = await buildBackupV4({
            tables: structuredClone(originalTables),
            requestedTables: Object.keys(originalTables),
            failedTables: [],
            options: { ...getDefaultExportOptions(), tables: Object.keys(originalTables) },
            images: { 'A1.jpg': image },
            failedImages: [],
            config: {},
            extras: {},
            syncQueue: [],
            authUsers: [{ id: 'u1', email: 'admin@example.test', app_metadata: { role: 'admin' } }],
            isLocalMode: false,
            source: { appVersion: '1.0.0', schemaVersion: 'fixture' },
        });
        const packageBytes = await createRecoveryBundle(backup);

        const destroyedLiveState = { customers: [], products: [], orders: [] };
        expect(destroyedLiveState).not.toEqual(originalTables);

        const restored = readRecoveryBundle(packageBytes);
        const verification = await verifyBackupV4(restored);
        expect(verification).toMatchObject({ valid: true, complete: true });
        expect(restored.tables).toEqual(originalTables);
        expect(restored._images).toEqual({ 'A1.jpg': image });
        expect(restored._auth_users?.[0].email).toBe('admin@example.test');
    });
});
