import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../lib/supabase';
import { offlineDb } from '../lib/offlineDb';

export type SyncStatus = 'online' | 'offline' | 'syncing' | 'pending' | 'error';

interface OfflineSyncState {
    isOnline: boolean;
    pendingCount: number;
    syncStatus: SyncStatus;
    lastSyncedAt: Date | null;
    triggerSync: () => Promise<void>;
}

export function useOfflineSync(): OfflineSyncState {
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [pendingCount, setPendingCount] = useState(0);
    const [syncStatus, setSyncStatus] = useState<SyncStatus>(navigator.onLine ? 'online' : 'offline');
    const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
    const isSyncing = useRef(false);

    // Poll pending queue count every 5s
    const refreshPendingCount = useCallback(async () => {
        try {
            const count = await offlineDb.getQueueCount();
            setPendingCount(count);
            if (!isSyncing.current) {
                if (!navigator.onLine) setSyncStatus('offline');
                else if (count > 0) setSyncStatus('pending');
                else setSyncStatus('online');
            }
        } catch { /* ignore */ }
    }, []);

    const triggerSync = useCallback(async () => {
        if (isSyncing.current || !navigator.onLine) return;
        isSyncing.current = true;
        setSyncStatus('syncing');
        try {
            const synced = await api.syncOfflineData();
            await refreshPendingCount();
            if (synced > 0) setLastSyncedAt(new Date());
        } catch {
            setSyncStatus('error');
        } finally {
            isSyncing.current = false;
        }
    }, [refreshPendingCount]);

    // Online / offline events
    useEffect(() => {
        const handleOnline = () => {
            setIsOnline(true);
            setSyncStatus('syncing');
            // Small delay so the network is truly ready
            setTimeout(() => triggerSync(), 1500);
        };
        const handleOffline = () => {
            setIsOnline(false);
            setSyncStatus('offline');
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, [triggerSync]);

    // Listen for sync-error events dispatched by syncOfflineData
    useEffect(() => {
        const handleSyncError = () => setSyncStatus('error');
        window.addEventListener('ilios-sync-error', handleSyncError);
        return () => window.removeEventListener('ilios-sync-error', handleSyncError);
    }, []);

    // Poll queue count
    useEffect(() => {
        refreshPendingCount();
        const interval = setInterval(refreshPendingCount, 5000);
        return () => clearInterval(interval);
    }, [refreshPendingCount]);

    // On mount: if online and queue has items, sync immediately
    useEffect(() => {
        if (navigator.onLine) {
            offlineDb.getQueueCount().then(count => {
                if (count > 0) triggerSync();
            });
        }
    }, [triggerSync]);

    return { isOnline, pendingCount, syncStatus, lastSyncedAt, triggerSync };
}
