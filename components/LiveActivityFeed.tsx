/**
 * LiveActivityFeed — real-time "who did what" notification cards.
 *
 * Design notes:
 *  - Positioned bottom-left to not overlap the right-side SyncStatusIndicator.
 *  - Enter: slides in from the left with a spring-like cubic-bezier ease, fades
 *    in and scales up slightly — all via inline style transitions (no animation
 *    library required, no tailwindcss-animate plugin needed).
 *  - Exit: slides back left with ease-in, fades out; the surrounding height
 *    wrapper collapses via CSS grid-template-rows to avoid layout jumps.
 *  - Progress bar: pure CSS transition from 100%→0% over 7 seconds; no setInterval.
 *  - Color palette matches the app's `#060b00` dark glass aesthetic with
 *    jewel-tone accent colors per event category.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    X, ArrowRight, Layers, PauseCircle, PlayCircle,
    Truck, RotateCcw, ShoppingCart, Edit2, Send,
    CheckCircle, GitBranch,
} from 'lucide-react';
import type { LiveActivityNotification, LiveActivityEventType } from '../hooks/useLiveActivity';

// ── Constants ────────────────────────────────────────────────────────────────
const EXPIRE_MS = 7000;
const EXIT_MS   = 300; // exit animation + height collapse duration

// ── Stage labels ─────────────────────────────────────────────────────────────
const STAGE_LABELS: Record<string, string> = {
    'Waxing':              'Κέρωμα',
    'Casting':             'Χύτευση',
    'Setting':             'Setting',
    'Polishing':           'Στίλβωση',
    'Assembly':            'Μοντάρισμα',
    'Labeling':            'Ετικέτα',
    'Ready':               'Έτοιμα',
    'Αναμονή Παραλαβής':  'Αν. Παραλαβής',
};
const stageLbl = (s?: string) => (s ? (STAGE_LABELS[s] ?? s) : '');

// ── Event metadata ────────────────────────────────────────────────────────────
// color: hex accent used for border-left, icon fill, progress bar, glow shadow
// label: short uppercase category tag shown above the main text
interface EventMeta { icon: React.ReactNode; color: string; label: string; }

function getMeta(type: LiveActivityEventType): EventMeta {
    const sz = 13;
    switch (type) {
        case 'batch_moved':
            return { color: '#8b5cf6', label: 'ΠΑΡΑΓΩΓΗ',   icon: <ArrowRight size={sz} /> };
        case 'batch_split':
            return { color: '#8b5cf6', label: 'ΠΑΡΑΓΩΓΗ',   icon: <GitBranch size={sz} /> };
        case 'batch_bulk_moved':
            return { color: '#6366f1', label: 'ΠΑΡΑΓΩΓΗ',   icon: <Layers size={sz} /> };
        case 'batch_labeling_complete':
            return { color: '#6366f1', label: 'ΠΑΡΑΓΩΓΗ',   icon: <CheckCircle size={sz} /> };
        case 'batch_hold_on':
            return { color: '#f59e0b', label: 'ΑΝΑΜΟΝΗ',    icon: <PauseCircle size={sz} /> };
        case 'batch_hold_off':
            return { color: '#10b981', label: 'ΠΑΡΑΓΩΓΗ',   icon: <PlayCircle size={sz} /> };
        case 'batch_dispatched':
            return { color: '#0ea5e9', label: 'ΑΠΟΣΤΟΛΗ',   icon: <Truck size={sz} /> };
        case 'batch_recalled':
            return { color: '#f97316', label: 'ΕΠΙΣΤΡΟΦΗ',  icon: <RotateCcw size={sz} /> };
        case 'order_created':
            return { color: '#14b8a6', label: 'ΠΑΡΑΓΓΕΛΙΑ', icon: <ShoppingCart size={sz} /> };
        case 'order_updated':
            return { color: '#06b6d4', label: 'ΠΑΡΑΓΓΕΛΙΑ', icon: <Edit2 size={sz} /> };
        case 'order_sent_to_production':
            return { color: '#a78bfa', label: 'ΠΑΡΑΓΓΕΛΙΑ', icon: <Send size={sz} /> };
        case 'order_reverted':
            return { color: '#64748b', label: 'ΠΑΡΑΓΓΕΛΙΑ', icon: <RotateCcw size={sz} /> };
        default:
            return { color: '#64748b', label: 'ΕΝΕΡΓΕΙΑ',   icon: <CheckCircle size={sz} /> };
    }
}

// ── Action text ───────────────────────────────────────────────────────────────
function getActionText(n: LiveActivityNotification): { line1: string; line2?: string } {
    const firstName = (n.userName || 'Κάποιος').split(' ')[0];
    const sku   = n.sku ?? '';
    const qty   = n.qty ? `${n.qty}×` : '';
    const to    = stageLbl(n.toStage);
    const from  = stageLbl(n.fromStage);
    const count = n.count ?? 0;

    switch (n.type) {
        case 'batch_moved':
            return {
                line1: `${firstName} μετακίνησε ${[qty, sku].filter(Boolean).join(' ')}`.trim(),
                line2: from ? `${from} → ${to}` : `→ ${to}`,
            };
        case 'batch_split':
            return {
                line1: `${firstName} χώρισε ${[qty, sku].filter(Boolean).join(' ')}`.trim(),
                line2: `→ ${to}`,
            };
        case 'batch_bulk_moved':
            return { line1: `${firstName} μετακίνησε ${count} παρτίδες`, line2: `→ ${to}` };
        case 'batch_labeling_complete':
            return { line1: `${firstName} ολοκλήρωσε ${count} ετικέτες`, line2: '→ Έτοιμα' };
        case 'batch_hold_on':
            return { line1: `${firstName} σε αναμονή: ${sku}`, line2: n.reason || undefined };
        case 'batch_hold_off':
            return { line1: `${firstName} αποδέσμευσε: ${sku}` };
        case 'batch_dispatched':
            return {
                line1: `${firstName} απέστειλε ${count} παρτίδ${count === 1 ? 'α' : 'ες'}`,
                line2: 'στον Τεχνίτη',
            };
        case 'batch_recalled':
            return {
                line1: `${firstName} επέστρεψε ${count} παρτίδ${count === 1 ? 'α' : 'ες'}`,
                line2: 'Αναμονή Αποστολής',
            };
        case 'order_created':
            return { line1: `${firstName} νέα παραγγελία`, line2: n.customerName };
        case 'order_updated':
            return { line1: `${firstName} επεξεργάστηκε παραγγελία`, line2: n.customerName };
        case 'order_sent_to_production':
            return { line1: `${firstName} → Παραγωγή`, line2: n.customerName };
        case 'order_reverted':
            return { line1: `${firstName} επαναφορά παραγγελίας`, line2: n.customerName };
        default:
            return { line1: `${firstName} έκανε αλλαγή` };
    }
}

// ── User avatar ───────────────────────────────────────────────────────────────
// Deterministic color from name hash — matches jewel-tone palette
const AVATAR_PALETTE = [
    '#7c3aed', '#0d9488', '#2563eb', '#d97706',
    '#059669', '#db2777', '#0284c7', '#ea580c',
];
function avatarBg(name: string): string {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
    return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length];
}
function initials(name: string): string {
    return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?';
}

// ── Relative time ──────────────────────────────────────────────────────────────
function useRelativeTime(ts: number): string {
    const [label, setLabel] = useState('μόλις τώρα');
    useEffect(() => {
        const tick = () => {
            const s = Math.floor((Date.now() - ts) / 1000);
            setLabel(s < 5 ? 'μόλις τώρα' : `${s}δ πριν`);
        };
        tick();
        const id = setInterval(tick, 5000);
        return () => clearInterval(id);
    }, [ts]);
    return label;
}

// ── Draining progress bar ─────────────────────────────────────────────────────
// Uses a single CSS `width` transition (100% → 0%) started after the first
// paint via double-RAF. No setInterval, perfectly GPU-smooth.
function ProgressBar({ color }: { color: string }) {
    const [started, setStarted] = useState(false);
    useEffect(() => {
        let raf2: number;
        const raf1 = requestAnimationFrame(() => {
            raf2 = requestAnimationFrame(() => setStarted(true));
        });
        return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); };
    }, []);
    return (
        <div
            className="absolute bottom-0 left-0 right-0 overflow-hidden"
            style={{ height: 2 }}
        >
            <div
                style={{
                    height: '100%',
                    width: started ? '0%' : '100%',
                    backgroundColor: color,
                    opacity: 0.55,
                    transition: started ? `width ${EXPIRE_MS}ms linear` : 'none',
                }}
            />
        </div>
    );
}

// ── Single card ────────────────────────────────────────────────────────────────
// Enter: translates from left + fades in + scales up (spring cubic-bezier)
// Exit:  translates back left + fades out + scales down (ease-in)
// Height collapse handled by the wrapper grid trick in the feed.
interface CardProps {
    notification: LiveActivityNotification & { isExiting: boolean };
    onDismiss: (id: string) => void;
}

function ActivityCard({ notification: n, onDismiss }: CardProps) {
    const [entered, setEntered] = useState(false);
    const meta           = getMeta(n.type);
    const { line1, line2 } = getActionText(n);
    const timeLabel      = useRelativeTime(n.receivedAt);
    const firstName      = (n.userName || '').split(' ')[0];

    // Trigger enter on next paint so the initial invisible state is painted first
    useEffect(() => {
        const raf = requestAnimationFrame(() => setEntered(true));
        return () => cancelAnimationFrame(raf);
    }, []);

    const visible = entered && !n.isExiting;

    return (
        // Outer: handles opacity + translate + scale (enter/exit)
        <div
            style={{
                opacity:   visible ? 1 : 0,
                transform: visible
                    ? 'translateX(0px) scale(1)'
                    : n.isExiting
                    ? 'translateX(-18px) scale(0.94)'
                    : 'translateX(-14px) scale(0.96)',
                transition: n.isExiting
                    ? `opacity ${EXIT_MS}ms ease-in, transform ${EXIT_MS}ms ease-in`
                    : 'opacity 380ms cubic-bezier(0.16,1,0.3,1), transform 380ms cubic-bezier(0.16,1,0.3,1)',
            }}
        >
            {/* Card shell — dark glass matching the app's #060b00 sidebar palette */}
            <div
                className="relative flex items-center gap-2.5 rounded-2xl overflow-hidden"
                style={{
                    minWidth: 272,
                    maxWidth: 340,
                    paddingLeft:  14,
                    paddingRight: 10,
                    paddingTop:   10,
                    paddingBottom: 12,
                    // Dark base: the same hue as the app's #060b00 sidebar, with glass effect
                    background: 'rgba(5,9,0,0.92)',
                    backdropFilter: 'blur(20px) saturate(180%)',
                    WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    // Coloured left stripe
                    borderLeft: `3px solid ${meta.color}`,
                    // Soft drop shadow with a hint of the accent colour
                    boxShadow: `0 8px 28px rgba(0,0,0,0.55), 0 1px 0 rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.04)`,
                    borderRadius: 14,
                }}
            >
                {/* Category icon bubble */}
                <div
                    className="flex-shrink-0 flex items-center justify-center rounded-lg"
                    style={{
                        width: 28, height: 28,
                        backgroundColor: `${meta.color}1a`, // 10% opacity tint
                        color: meta.color,
                    }}
                >
                    {meta.icon}
                </div>

                {/* Text block */}
                <div className="flex-1 min-w-0">
                    {/* Row 1: category label  +  time */}
                    <div className="flex items-center justify-between mb-[3px]">
                        <span
                            className="text-[9px] font-black uppercase tracking-widest"
                            style={{ color: meta.color }}
                        >
                            {meta.label}
                        </span>
                        <span className="text-[9px] font-medium text-white/30 ml-2 shrink-0">
                            {timeLabel}
                        </span>
                    </div>

                    {/* Row 2: avatar  +  main text */}
                    <div className="flex items-center gap-1.5 min-w-0">
                        {/* User initials badge */}
                        <span
                            className="inline-flex items-center justify-center rounded-full text-white font-black flex-shrink-0"
                            style={{
                                width: 17, height: 17, fontSize: 8,
                                backgroundColor: avatarBg(n.userName),
                                letterSpacing: '-0.01em',
                            }}
                        >
                            {initials(n.userName)}
                        </span>
                        {/* Line 1 text */}
                        <span className="text-[12px] font-semibold text-white/90 truncate leading-tight">
                            {line1}
                        </span>
                    </div>

                    {/* Row 3: secondary detail */}
                    {line2 && (
                        <p
                            className="text-[11px] text-white/45 truncate leading-tight mt-[2px]"
                            style={{ paddingLeft: 21 }} // align under the name text
                        >
                            {line2}
                        </p>
                    )}
                </div>

                {/* Dismiss × */}
                <button
                    onClick={() => onDismiss(n.eventId)}
                    className="flex-shrink-0 self-start mt-[1px] rounded-md p-0.5 text-white/25 hover:text-white/70 hover:bg-white/8 transition-colors"
                    aria-label="Κλείσιμο"
                    style={{ lineHeight: 0 }}
                >
                    <X size={11} />
                </button>

                {/* Draining progress bar */}
                <ProgressBar color={meta.color} />
            </div>
        </div>
    );
}

// ── Feed container ─────────────────────────────────────────────────────────────
// Keeps a local `displayItems` list so exiting notifications remain in the DOM
// long enough for their exit animation to complete, then are truly removed.
// The height wrapper uses the CSS grid-template-rows trick to collapse cleanly.

type DisplayItem = LiveActivityNotification & { isExiting: boolean };

interface LiveActivityFeedProps {
    notifications: LiveActivityNotification[];
    onDismiss: (id: string) => void;
}

export const LiveActivityFeed: React.FC<LiveActivityFeedProps> = ({ notifications, onDismiss }) => {
    const [displayItems, setDisplayItems] = useState<DisplayItem[]>([]);
    // Per-item removal timers — keyed by eventId
    const removeTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

    // Sync incoming notifications into local displayItems
    useEffect(() => {
        setDisplayItems(prev => {
            const incomingIds = new Set(notifications.map(n => n.eventId));
            const prevMap     = new Map(prev.map(i => [i.eventId, i]));

            // Mark items that disappeared from notifications as exiting
            const next = prev.map(item =>
                !incomingIds.has(item.eventId) && !item.isExiting
                    ? (() => {
                          // Schedule removal after exit animation
                          if (!removeTimers.current.has(item.eventId)) {
                              const t = setTimeout(() => {
                                  setDisplayItems(d => d.filter(di => di.eventId !== item.eventId));
                                  removeTimers.current.delete(item.eventId);
                              }, EXIT_MS + 60);
                              removeTimers.current.set(item.eventId, t);
                          }
                          return { ...item, isExiting: true };
                      })()
                    : item
            );

            // Append brand-new notifications
            const added: DisplayItem[] = notifications
                .filter(n => !prevMap.has(n.eventId))
                .map(n => ({ ...n, isExiting: false }));

            return [...next, ...added];
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [notifications]);

    // Clean up pending timers on unmount
    useEffect(() => {
        const timers = removeTimers.current;
        return () => timers.forEach(t => clearTimeout(t));
    }, []);

    const handleDismiss = useCallback((eventId: string) => {
        // Immediately mark as exiting locally — the hook's dismiss will remove
        // it from the notifications prop, which will also trigger marking it
        // exiting via the effect above, but we want instant visual feedback.
        setDisplayItems(prev =>
            prev.map(i => i.eventId === eventId ? { ...i, isExiting: true } : i)
        );
        if (!removeTimers.current.has(eventId)) {
            const t = setTimeout(() => {
                setDisplayItems(d => d.filter(di => di.eventId !== eventId));
                removeTimers.current.delete(eventId);
            }, EXIT_MS + 60);
            removeTimers.current.set(eventId, t);
        }
        onDismiss(eventId);
    }, [onDismiss]);

    if (displayItems.length === 0) return null;

    return (
        <div
            className="fixed bottom-4 left-4 z-[250] flex flex-col pointer-events-none print:hidden"
            style={{ gap: 0 }} // gaps handled inside each height-wrapper
        >
            {displayItems.map(item => (
                // Height-collapse wrapper: CSS grid trick so stacked cards don't
                // jump when a card exits — the space smoothly collapses away.
                <div
                    key={item.eventId}
                    className="pointer-events-auto"
                    style={{
                        display: 'grid',
                        gridTemplateRows: item.isExiting ? '0fr' : '1fr',
                        transition: `grid-template-rows ${EXIT_MS}ms ease-in`,
                    }}
                >
                    <div style={{ overflow: 'hidden', minHeight: 0 }}>
                        {/* Bottom padding provides the visual gap between stacked cards */}
                        <div style={{ paddingBottom: 8 }}>
                            <ActivityCard notification={item} onDismiss={handleDismiss} />
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
};
