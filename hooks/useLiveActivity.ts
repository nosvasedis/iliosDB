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
import {
    shouldRemoveRealtimeChannelOnStatus,
    shouldRetryRealtimeChannelOnStatus,
} from './realtimeChannelLifecycle';

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
    | 'order_reverted'
    | 'product_created'
    | 'product_updated'
    | 'product_deleted'
    | 'product_renamed'
    | 'product_variant_created'
    | 'product_variant_updated'
    | 'product_variant_deleted';

export interface LiveActivityPayload {
    type: LiveActivityEventType;
    userName: string;
    // batch events
    sku?: string;
    variantSuffix?: string;
    oldSku?: string;
    newSku?: string;
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
export interface BroadcastEnvelope extends LiveActivityPayload {
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
const RETRY_MS = 3000;

export function appendUniqueLiveActivityNotification(
    notifications: LiveActivityNotification[],
    notification: LiveActivityNotification,
    maxNotifications = MAX_NOTIFICATIONS,
): LiveActivityNotification[] {
    if (notifications.some((existing) => existing.eventId === notification.eventId)) {
        return notifications;
    }
    return [...notifications, notification].slice(-maxNotifications);
}

export function drainLiveActivityQueue(
    queued: BroadcastEnvelope[],
    send: (envelope: BroadcastEnvelope) => void,
): BroadcastEnvelope[] {
    queued.forEach((envelope) => send(envelope));
    return [];
}

interface UseLiveActivityResult {
    notifications: LiveActivityNotification[];
    dismiss: (eventId: string) => void;
    clearAll: () => void;
}

export function useLiveActivity(): UseLiveActivityResult {
    const [notifications, setNotifications] = useState<LiveActivityNotification[]>([]);
    const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
    const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isSubscribedRef = useRef(false);
    const queuedEventsRef = useRef<BroadcastEnvelope[]>([]);
    const expireTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
    const notificationIdsRef = useRef<Set<string>>(new Set());

    const addNotification = useCallback((envelope: BroadcastEnvelope) => {
        if (notificationIdsRef.current.has(envelope.eventId)) return;
        notificationIdsRef.current.add(envelope.eventId);

        const notification: LiveActivityNotification = {
            ...envelope,
            receivedAt: Date.now(),
        };

        setNotifications(prev => appendUniqueLiveActivityNotification(prev, notification));

        // Auto-expire
        const timer = setTimeout(() => {
            setNotifications(prev => prev.filter(n => n.eventId !== notification.eventId));
            expireTimers.current.delete(notification.eventId);
            notificationIdsRef.current.delete(notification.eventId);
        }, EXPIRE_MS);
        expireTimers.current.set(notification.eventId, timer);
    }, []);

    const dismiss = useCallback((eventId: string) => {
        const timer = expireTimers.current.get(eventId);
        if (timer) {
            clearTimeout(timer);
            expireTimers.current.delete(eventId);
        }
        notificationIdsRef.current.delete(eventId);
        setNotifications(prev => prev.filter(n => n.eventId !== eventId));
    }, []);

    const clearAll = useCallback(() => {
        expireTimers.current.forEach(timer => clearTimeout(timer));
        expireTimers.current.clear();
        notificationIdsRef.current.clear();
        setNotifications([]);
    }, []);

    // ── Subscribe to Supabase Broadcast ──────────────────────────────────────
    useEffect(() => {
        if (isLocalMode) return;

        let disposed = false;
        const sendEnvelope = (envelope: BroadcastEnvelope) => {
            if (!channelRef.current || !isSubscribedRef.current) {
                queuedEventsRef.current.push(envelope);
                return;
            }
            void channelRef.current.send({
                type: 'broadcast',
                event: 'activity',
                payload: envelope,
            });
        };

        const subscribe = () => {
            if (disposed) return;
            const channel = supabase
                .channel(CHANNEL_NAME)
                .on('broadcast', { event: 'activity' }, ({ payload }) => {
                    const envelope = payload as BroadcastEnvelope;
                    // Skip own tab's actions
                    if (envelope.senderTabId === SESSION_TAB_ID) return;
                    addNotification(envelope);
                })
                .subscribe((status) => {
                    if (disposed) return;
                    if (status === 'SUBSCRIBED') {
                        isSubscribedRef.current = true;
                        queuedEventsRef.current = drainLiveActivityQueue(queuedEventsRef.current, sendEnvelope);
                    }
                    if (shouldRetryRealtimeChannelOnStatus(status)) {
                        isSubscribedRef.current = false;
                        if (shouldRemoveRealtimeChannelOnStatus(status)) {
                            void supabase.removeChannel(channel);
                        }
                        channelRef.current = null;
                        if (!retryTimerRef.current) {
                            retryTimerRef.current = setTimeout(() => {
                                retryTimerRef.current = null;
                                subscribe();
                            }, RETRY_MS);
                        }
                    }
                });
            channelRef.current = channel;
        };

        subscribe();

        return () => {
            disposed = true;
            isSubscribedRef.current = false;
            if (retryTimerRef.current) {
                clearTimeout(retryTimerRef.current);
                retryTimerRef.current = null;
            }
            if (channelRef.current) {
                void supabase.removeChannel(channelRef.current);
                channelRef.current = null;
            }
        };
    }, [addNotification]);

    // ── Listen for local window events from mutation sites ───────────────────
    useEffect(() => {
        if (isLocalMode) return;

        const sendEnvelope = (envelope: BroadcastEnvelope) => {
            if (!channelRef.current || !isSubscribedRef.current) {
                queuedEventsRef.current.push(envelope);
                return;
            }
            void channelRef.current.send({
                type: 'broadcast',
                event: 'activity',
                payload: envelope,
            });
        };

        const handleWindowEvent = (e: Event) => {
            const payload = (e as CustomEvent<LiveActivityPayload>).detail;
            const envelope: BroadcastEnvelope = {
                ...payload,
                senderTabId: SESSION_TAB_ID,
                eventId: Math.random().toString(36).slice(2, 10),
                timestamp: new Date().toISOString(),
            };
            // Broadcast to other tabs/devices — do NOT add to local state
            sendEnvelope(envelope);
        };

        window.addEventListener('ilios-live-activity', handleWindowEvent);
        return () => window.removeEventListener('ilios-live-activity', handleWindowEvent);
    }, []);

    // Cleanup all expire timers on unmount
    useEffect(() => {
        return () => {
            expireTimers.current.forEach(timer => clearTimeout(timer));
            notificationIdsRef.current.clear();
        };
    }, []);

    return { notifications, dismiss, clearAll };
}
