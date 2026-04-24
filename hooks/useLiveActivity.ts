/**
 * useLiveActivity — Real-time live collaboration activity feed.
 *
 * Uses Supabase Realtime Broadcast (same free-tier channel as production_batches
 * postgres_changes) to propagate rich activity events across all open tabs/devices.
 *
 * Key design decisions:
 *  - A random SESSION_TAB_ID is generated per module load (per browser tab).
 *    This lets us filter out notifications from the CURRENT tab even when all
 *    tabs are logged in as the same account.
 *  - Mutation sites dispatch a vanilla CustomEvent ('ilios-live-activity') on
 *    window. This hook picks that up, stamps it with SESSION_TAB_ID, and
 *    broadcasts it. Loose coupling — no direct import of this hook in components.
 *  - On receiving a broadcast, we check senderTabId !== SESSION_TAB_ID. If it
 *    matches, we skip (it came from this tab relayed through Supabase).
 *  - Notifications auto-expire after 7 seconds; max 5 are shown at once.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, isLocalMode } from '../lib/supabase';

// ── Per-tab identity ─────────────────────────────────────────────────────────
// Generated once per module load (i.e., per browser tab/page). Not persisted.
const SESSION_TAB_ID = Math.random().toString(36).slice(2, 10);

// ── Event types ──────────────────────────────────────────────────────────────

export type LiveActivityEventType =
    | 'batch_moved'
    | 'batch_split'
    | 'batch_bulk_moved'
    | 'batch_hold_on'
    | 'batch_hold_off'
    | 'batch_dispatched'
    | 'batch_recalled'
    | 'batch_labeling_complete'
    | 'order_created'
    | 'order_updated'
    | 'order_sent_to_production'
    | 'order_reverted';

export interface LiveActivityPayload {
    type: LiveActivityEventType;
    userName: string;
    // batch events
    sku?: string;
    qty?: number;
    fromStage?: string;
    toStage?: string;
    count?: number;
    isOnHold?: boolean;
    reason?: string;
    // order events
    customerName?: string;
    itemCount?: number;
}

/** Internal broadcast envelope — adds routing metadata. */
interface BroadcastEnvelope extends LiveActivityPayload {
    senderTabId: string;
    eventId: string;
    timestamp: string;
}

/** Notification as stored in state — adds local display fields. */
export interface LiveActivityNotification extends BroadcastEnvelope {
    /** ms since epoch, used for progress-bar animation */
    receivedAt: number;
}

// ── Dispatch helper (used by mutation sites) ─────────────────────────────────

/**
 * Dispatch a live activity event from a mutation site.
 * This is a plain function — no React hooks, safe to call anywhere.
 */
export function dispatchLiveActivity(payload: LiveActivityPayload): void {
    window.dispatchEvent(
        new CustomEvent('ilios-live-activity', { detail: payload })
    );
}

// ── Hook ─────────────────────────────────────────────────────────────────────

const CHANNEL_NAME = 'ilios:live-activity';
const MAX_NOTIFICATIONS = 5;
const EXPIRE_MS = 7000;

interface UseLiveActivityResult {
    notifications: LiveActivityNotification[];
    dismiss: (eventId: string) => void;
    clearAll: () => void;
}

export function useLiveActivity(): UseLiveActivityResult {
    const [notifications, setNotifications] = useState<LiveActivityNotification[]>([]);
    const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
    const expireTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

    const addNotification = useCallback((envelope: BroadcastEnvelope) => {
        const notification: LiveActivityNotification = {
            ...envelope,
            receivedAt: Date.now(),
        };

        setNotifications(prev => {
            const next = [...prev, notification];
            // Keep only the last MAX_NOTIFICATIONS
            return next.slice(-MAX_NOTIFICATIONS);
        });

        // Auto-expire
        const timer = setTimeout(() => {
            setNotifications(prev => prev.filter(n => n.eventId !== notification.eventId));
            expireTimers.current.delete(notification.eventId);
        }, EXPIRE_MS);
        expireTimers.current.set(notification.eventId, timer);
    }, []);

    const dismiss = useCallback((eventId: string) => {
        const timer = expireTimers.current.get(eventId);
        if (timer) {
            clearTimeout(timer);
            expireTimers.current.delete(eventId);
        }
        setNotifications(prev => prev.filter(n => n.eventId !== eventId));
    }, []);

    const clearAll = useCallback(() => {
        expireTimers.current.forEach(timer => clearTimeout(timer));
        expireTimers.current.clear();
        setNotifications([]);
    }, []);

    // ── Subscribe to Supabase Broadcast ──────────────────────────────────────
    useEffect(() => {
        if (isLocalMode) return;

        const subscribe = () => {
            const channel = supabase
                .channel(CHANNEL_NAME)
                .on('broadcast', { event: 'activity' }, ({ payload }) => {
                    const envelope = payload as BroadcastEnvelope;
                    // Skip own tab's actions
                    if (envelope.senderTabId === SESSION_TAB_ID) return;
                    addNotification(envelope);
                })
                .subscribe((status) => {
                    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                        void supabase.removeChannel(channel);
                        channelRef.current = null;
                        setTimeout(() => subscribe(), 3000);
                    }
                });
            channelRef.current = channel;
        };

        subscribe();

        return () => {
            if (channelRef.current) {
                void supabase.removeChannel(channelRef.current);
                channelRef.current = null;
            }
        };
    }, [addNotification]);

    // ── Listen for local window events from mutation sites ───────────────────
    useEffect(() => {
        if (isLocalMode) return;

        const handleWindowEvent = (e: Event) => {
            const payload = (e as CustomEvent<LiveActivityPayload>).detail;
            const envelope: BroadcastEnvelope = {
                ...payload,
                senderTabId: SESSION_TAB_ID,
                eventId: Math.random().toString(36).slice(2, 10),
                timestamp: new Date().toISOString(),
            };
            // Broadcast to other tabs/devices — do NOT add to local state
            if (channelRef.current) {
                void channelRef.current.send({
                    type: 'broadcast',
                    event: 'activity',
                    payload: envelope,
                });
            }
        };

        window.addEventListener('ilios-live-activity', handleWindowEvent);
        return () => window.removeEventListener('ilios-live-activity', handleWindowEvent);
    }, []);

    // Cleanup all expire timers on unmount
    useEffect(() => {
        return () => {
            expireTimers.current.forEach(timer => clearTimeout(timer));
        };
    }, []);

    return { notifications, dismiss, clearAll };
}
