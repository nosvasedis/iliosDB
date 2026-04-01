import { useCallback, useEffect, useRef, useState } from 'react';
import { api, isLocalMode } from '../lib/supabase';
import { offlineDb } from '../lib/offlineDb';
import { SyncOfflineResult } from '../types';

export interface UseConnectivityStatusOptions {
  pollIntervalMs?: number;
  onSyncCompleted?: (result: SyncOfflineResult) => void | Promise<void>;
}

export interface ConnectivityStatus {
  isOnline: boolean;
  isSyncing: boolean;
  pendingItems: any[];
  pendingCount: number;
  refreshQueue: () => Promise<any[]>;
  triggerSync: () => Promise<void>;
}

const getInitialOnlineState = () => (typeof navigator !== 'undefined' ? navigator.onLine : true);

/**
 * Mirrors the connectivity and sync concerns that currently live in the main app shell.
 * The hook is intentionally UI-agnostic so desktop, mobile, and future shells can share it.
 */
export function useConnectivityStatus(options: UseConnectivityStatusOptions = {}): ConnectivityStatus {
  const { pollIntervalMs = 2000, onSyncCompleted } = options;
  const [isOnline, setIsOnline] = useState(getInitialOnlineState());
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingItems, setPendingItems] = useState<any[]>([]);
  const syncingRef = useRef(false);

  const refreshQueue = useCallback(async () => {
    if (isLocalMode) {
      setPendingItems([]);
      return [];
    }
    const queue = await offlineDb.getQueue();
    setPendingItems(queue);
    return queue;
  }, []);

  const triggerSync = useCallback(async () => {
    if (isLocalMode || syncingRef.current || !getInitialOnlineState()) return;
    syncingRef.current = true;
    setIsSyncing(true);
    try {
      await refreshQueue();
      const result = await api.syncOfflineData();
      if (onSyncCompleted) {
        await onSyncCompleted(result);
      }
      await refreshQueue();
    } finally {
      syncingRef.current = false;
      setIsSyncing(false);
    }
  }, [onSyncCompleted, refreshQueue]);

  useEffect(() => {
    if (isLocalMode) {
      setIsOnline(true);
      setPendingItems([]);
      return;
    }

    const handleOnline = () => {
      setIsOnline(true);
      void triggerSync();
    };

    const handleOffline = () => setIsOnline(false);
    const handleSyncError = () => {
      void refreshQueue();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('ilios-sync-error', handleSyncError as EventListener);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('ilios-sync-error', handleSyncError as EventListener);
    };
  }, [refreshQueue, triggerSync]);

  useEffect(() => {
    if (isLocalMode) return;
    void refreshQueue();
    const interval = window.setInterval(() => {
      void refreshQueue();
    }, pollIntervalMs);
    return () => window.clearInterval(interval);
  }, [pollIntervalMs, refreshQueue]);

  useEffect(() => {
    if (isLocalMode || !getInitialOnlineState()) return;
    void triggerSync();
  }, [triggerSync]);

  return {
    isOnline,
    isSyncing,
    pendingItems,
    pendingCount: pendingItems.length,
    refreshQueue,
    triggerSync,
  };
}
