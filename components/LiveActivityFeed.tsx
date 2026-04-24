/**
 * LiveActivityFeed — real-time "who did what" notification cards.
 *
 * Position: fixed bottom-left (mirrors SyncStatusIndicator at bottom-right).
 * Each card auto-dismisses with an animated progress bar and can be manually
 * dismissed. Up to 5 cards are stacked, newest at the bottom.
 */

import React, { useEffect, useState } from 'react';
import {
    X,
    ArrowRight,
    Layers,
    PauseCircle,
    PlayCircle,
    Truck,
    RotateCcw,
    ShoppingCart,
    Edit,
    Send,
    CheckCircle,
} from 'lucide-react';
import type { LiveActivityNotification, LiveActivityEventType } from '../hooks/useLiveActivity';

// ── Stage name lookup ────────────────────────────────────────────────────────
const STAGE_LABELS: Record<string, string> = {
    'Waxing': 'Κέρωμα',
    'Casting': 'Χύτευση',
    'Setting': 'Setting',
    'Polishing': 'Στίλβωση',
    'Assembly': 'Μοντάρισμα',
    'Labeling': 'Ετικέτα',
    'Ready': 'Έτοιμα',
    'Αναμονή Παραλαβής': 'Αναμονή Παραλαβής',
};

const stageLabel = (s?: string) => (s ? (STAGE_LABELS[s] ?? s) : '');

// ── Icon & accent colour per event type ─────────────────────────────────────

interface EventMeta {
    icon: React.ReactNode;
    accent: string; // Tailwind border-l colour class
    bg: string;     // Background tint
}

function getEventMeta(type: LiveActivityEventType): EventMeta {
    switch (type) {
        case 'batch_moved':
        case 'batch_split':
            return {
                icon: <ArrowRight size={16} className="text-violet-400" />,
                accent: 'border-violet-500',
                bg: 'bg-violet-950/60',
            };
        case 'batch_bulk_moved':
        case 'batch_labeling_complete':
            return {
                icon: <Layers size={16} className="text-violet-300" />,
                accent: 'border-violet-400',
                bg: 'bg-violet-950/60',
            };
        case 'batch_hold_on':
            return {
                icon: <PauseCircle size={16} className="text-amber-400" />,
                accent: 'border-amber-500',
                bg: 'bg-amber-950/60',
            };
        case 'batch_hold_off':
            return {
                icon: <PlayCircle size={16} className="text-emerald-400" />,
                accent: 'border-emerald-500',
                bg: 'bg-emerald-950/60',
            };
        case 'batch_dispatched':
            return {
                icon: <Truck size={16} className="text-sky-400" />,
                accent: 'border-sky-500',
                bg: 'bg-sky-950/60',
            };
        case 'batch_recalled':
            return {
                icon: <RotateCcw size={16} className="text-orange-400" />,
                accent: 'border-orange-500',
                bg: 'bg-orange-950/60',
            };
        case 'order_created':
            return {
                icon: <ShoppingCart size={16} className="text-teal-400" />,
                accent: 'border-teal-500',
                bg: 'bg-teal-950/60',
            };
        case 'order_updated':
            return {
                icon: <Edit size={16} className="text-teal-300" />,
                accent: 'border-teal-400',
                bg: 'bg-teal-950/60',
            };
        case 'order_sent_to_production':
            return {
                icon: <Send size={16} className="text-indigo-400" />,
                accent: 'border-indigo-500',
                bg: 'bg-indigo-950/60',
            };
        case 'order_reverted':
            return {
                icon: <RotateCcw size={16} className="text-slate-400" />,
                accent: 'border-slate-500',
                bg: 'bg-slate-800/80',
            };
        default:
            return {
                icon: <CheckCircle size={16} className="text-slate-400" />,
                accent: 'border-slate-500',
                bg: 'bg-slate-800/80',
            };
    }
}

// ── Human-readable action text ───────────────────────────────────────────────

function buildActionText(n: LiveActivityNotification): { primary: string; secondary?: string } {
    const name = n.userName || 'Κάποιος';
    const sku = n.sku ? `${n.sku}` : '';
    const qty = n.qty ? `${n.qty}×` : '';
    const to = stageLabel(n.toStage);
    const from = stageLabel(n.fromStage);
    const count = n.count ?? 0;

    switch (n.type) {
        case 'batch_moved':
            return {
                primary: `${name} μετακίνησε ${qty} ${sku}`.trim(),
                secondary: from ? `${from} → ${to}` : `→ ${to}`,
            };
        case 'batch_split':
            return {
                primary: `${name} χώρισε ${qty} ${sku}`.trim(),
                secondary: `→ ${to}`,
            };
        case 'batch_bulk_moved':
            return {
                primary: `${name} μετακίνησε ${count} παρτίδες`,
                secondary: `→ ${to}`,
            };
        case 'batch_hold_on':
            return {
                primary: `${name} έβαλε σε αναμονή: ${sku}`,
                secondary: n.reason || undefined,
            };
        case 'batch_hold_off':
            return {
                primary: `${name} αποδέσμευσε: ${sku}`,
            };
        case 'batch_dispatched':
            return {
                primary: `${name} απέστειλε ${count} παρτίδ${count === 1 ? 'α' : 'ες'}`,
                secondary: 'στον Τεχνίτη',
            };
        case 'batch_recalled':
            return {
                primary: `${name} επέστρεψε ${count} παρτίδ${count === 1 ? 'α' : 'ες'}`,
                secondary: 'σε Αναμονή Αποστολής',
            };
        case 'batch_labeling_complete':
            return {
                primary: `${name} ολοκλήρωσε ετικέτες`,
                secondary: `${count} παρτίδες → Έτοιμα`,
            };
        case 'order_created':
            return {
                primary: `${name} δημιούργησε παραγγελία`,
                secondary: n.customerName,
            };
        case 'order_updated':
            return {
                primary: `${name} επεξεργάστηκε παραγγελία`,
                secondary: n.customerName,
            };
        case 'order_sent_to_production':
            return {
                primary: `${name} έστειλε στην παραγωγή`,
                secondary: n.customerName,
            };
        case 'order_reverted':
            return {
                primary: `${name} επανέφερε παραγγελία`,
                secondary: n.customerName,
            };
        default:
            return { primary: `${name} έκανε μια αλλαγή` };
    }
}

// ── User avatar (initials + deterministic colour) ────────────────────────────

function hashColor(name: string): string {
    const COLORS = [
        'bg-violet-600', 'bg-sky-600', 'bg-teal-600',
        'bg-rose-600', 'bg-amber-600', 'bg-indigo-600',
        'bg-emerald-600', 'bg-pink-600',
    ];
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
    return COLORS[Math.abs(h) % COLORS.length];
}

function UserAvatar({ name }: { name: string }) {
    const initials = name
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map(w => w[0].toUpperCase())
        .join('');
    return (
        <span
            className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-white text-[10px] font-black shrink-0 ${hashColor(name)}`}
        >
            {initials || '?'}
        </span>
    );
}

// ── Relative timestamp ───────────────────────────────────────────────────────

function useRelativeTime(receivedAt: number): string {
    const [label, setLabel] = useState('μόλις τώρα');

    useEffect(() => {
        const update = () => {
            const secs = Math.floor((Date.now() - receivedAt) / 1000);
            setLabel(secs < 5 ? 'μόλις τώρα' : `${secs}δ πριν`);
        };
        update();
        const id = setInterval(update, 5000);
        return () => clearInterval(id);
    }, [receivedAt]);

    return label;
}

// ── Progress bar ─────────────────────────────────────────────────────────────

const EXPIRE_MS = 7000;

function ProgressBar({ receivedAt, accent }: { receivedAt: number; accent: string }) {
    const [width, setWidth] = useState(100);

    useEffect(() => {
        const start = receivedAt;
        const update = () => {
            const elapsed = Date.now() - start;
            const pct = Math.max(0, 100 - (elapsed / EXPIRE_MS) * 100);
            setWidth(pct);
        };
        update();
        const id = setInterval(update, 50);
        return () => clearInterval(id);
    }, [receivedAt]);

    // derive a plain colour from the accent border class
    const barColor = accent.includes('violet')
        ? 'bg-violet-500'
        : accent.includes('amber')
        ? 'bg-amber-500'
        : accent.includes('emerald')
        ? 'bg-emerald-500'
        : accent.includes('sky')
        ? 'bg-sky-500'
        : accent.includes('orange')
        ? 'bg-orange-500'
        : accent.includes('teal')
        ? 'bg-teal-500'
        : accent.includes('indigo')
        ? 'bg-indigo-500'
        : 'bg-slate-400';

    return (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/10 overflow-hidden rounded-b-xl">
            <div
                className={`h-full ${barColor} transition-none`}
                style={{ width: `${width}%` }}
            />
        </div>
    );
}

// ── Single notification card ─────────────────────────────────────────────────

interface CardProps {
    notification: LiveActivityNotification;
    onDismiss: (id: string) => void;
}

function ActivityCard({ notification: n, onDismiss }: CardProps) {
    const meta = getEventMeta(n.type);
    const { primary, secondary } = buildActionText(n);
    const timeLabel = useRelativeTime(n.receivedAt);

    return (
        <div
            className={`
                relative flex items-start gap-3 px-4 py-3 rounded-xl shadow-2xl border border-white/10
                backdrop-blur-md overflow-hidden min-w-[260px] max-w-[340px]
                border-l-[3px] ${meta.accent} ${meta.bg}
                animate-in slide-in-from-left-6 fade-in duration-300
            `}
        >
            {/* Icon */}
            <div className="mt-0.5 shrink-0">{meta.icon}</div>

            {/* Avatar + text */}
            <div className="flex items-start gap-2 flex-1 min-w-0">
                <UserAvatar name={n.userName} />
                <div className="flex flex-col min-w-0">
                    <span className="text-white text-[13px] font-semibold leading-snug truncate">{primary}</span>
                    {secondary && (
                        <span className="text-white/60 text-[11px] leading-snug truncate">{secondary}</span>
                    )}
                    <span className="text-white/40 text-[10px] mt-0.5">{timeLabel}</span>
                </div>
            </div>

            {/* Dismiss button */}
            <button
                onClick={() => onDismiss(n.eventId)}
                className="shrink-0 mt-0.5 opacity-40 hover:opacity-80 transition-opacity text-white"
                aria-label="Κλείσιμο"
            >
                <X size={13} />
            </button>

            {/* Draining progress bar */}
            <ProgressBar receivedAt={n.receivedAt} accent={meta.accent} />
        </div>
    );
}

// ── Feed container ───────────────────────────────────────────────────────────

interface LiveActivityFeedProps {
    notifications: LiveActivityNotification[];
    onDismiss: (id: string) => void;
}

export const LiveActivityFeed: React.FC<LiveActivityFeedProps> = ({ notifications, onDismiss }) => {
    if (notifications.length === 0) return null;

    return (
        <div className="fixed bottom-4 left-4 z-[250] flex flex-col gap-2 pointer-events-none print:hidden">
            {notifications.map(n => (
                <div key={n.eventId} className="pointer-events-auto">
                    <ActivityCard notification={n} onDismiss={onDismiss} />
                </div>
            ))}
        </div>
    );
};
