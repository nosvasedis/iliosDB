import { describe, expect, it } from 'vitest';
import {
    selectExpiredBackupKeys,
    shouldRunScheduledBackup,
    verifyAdminAccess,
    rewriteRestoredIds,
    selectUnreferencedImageKeys,
} from '../../worker/worker.js';

describe('automatic backup schedule and retention', () => {
    it('runs once at 02:00 Europe/Athens', () => {
        const instant = new Date('2026-07-09T23:00:00.000Z');
        expect(shouldRunScheduledBackup(instant, [])).toBe(true);
        expect(shouldRunScheduledBackup(instant, ['backups/daily/2026-07-10.json.enc'])).toBe(false);
        expect(shouldRunScheduledBackup(new Date('2026-07-09T20:00:00.000Z'), [])).toBe(false);
    });

    it('expires daily snapshots beyond 30 and monthly snapshots beyond 12', () => {
        const daily = Array.from({ length: 32 }, (_, index) => `backups/daily/2026-06-${String(index + 1).padStart(2, '0')}.json.enc`);
        const monthly = Array.from({ length: 14 }, (_, index) => `backups/monthly/2025-${String(index + 1).padStart(2, '0')}.json.enc`);
        const expired = selectExpiredBackupKeys([...daily, ...monthly]);
        expect(expired.filter((key) => key.includes('/daily/'))).toHaveLength(2);
        expect(expired.filter((key) => key.includes('/monthly/'))).toHaveLength(2);
    });

    it('removes only image blobs no retained snapshot references', () => {
        expect(selectUnreferencedImageKeys(
            ['image-blobs/a', 'image-blobs/b', 'image-blobs/c'],
            new Set(['image-blobs/b']),
        )).toEqual(['image-blobs/a', 'image-blobs/c']);
    });
});

describe('Worker admin authorization', () => {
    it('validates the bearer token and approved admin profile', async () => {
        const fetchFn = async (url: string) => {
            if (url.includes('/auth/v1/user')) {
                return new Response(JSON.stringify({ id: 'u1' }), { status: 200 });
            }
            return new Response(JSON.stringify([{ role: 'admin', is_approved: true }]), { status: 200 });
        };
        const result = await verifyAdminAccess(
            new Request('https://worker.test/admin/backups', {
                headers: { Authorization: 'Bearer valid-user-jwt' },
            }),
            { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service' },
            fetchFn as typeof fetch,
        );
        expect(result.ok).toBe(true);
        expect(result.userId).toBe('u1');
    });

    it('rejects a valid user who is not an approved admin', async () => {
        const fetchFn = async (url: string) => {
            if (url.includes('/auth/v1/user')) {
                return new Response(JSON.stringify({ id: 'u2' }), { status: 200 });
            }
            return new Response(JSON.stringify([{ role: 'seller', is_approved: true }]), { status: 200 });
        };
        const result = await verifyAdminAccess(
            new Request('https://worker.test/admin/backups', {
                headers: { Authorization: 'Bearer user-jwt' },
            }),
            { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service' },
            fetchFn as typeof fetch,
        );
        expect(result.ok).toBe(false);
        expect(result.status).toBe(403);
    });
});

describe('Auth identity remapping', () => {
    it('rewrites exact restored user ids recursively without changing other text', () => {
        const result = rewriteRestoredIds({
            profiles: [{ id: 'old-id', notes: 'mentions old-id but is not equal' }],
            orders: [{ seller_id: 'old-id' }],
        }, new Map([['old-id', 'new-id']]));
        expect(result.profiles[0]).toEqual({ id: 'new-id', notes: 'mentions old-id but is not equal' });
        expect(result.orders[0].seller_id).toBe('new-id');
    });
});
