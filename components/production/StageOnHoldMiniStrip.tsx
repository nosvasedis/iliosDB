import React from 'react';

type Props = {
    totalQty: number;
    onHoldQty: number;
    /** Tailwind background class for the non–on-hold share (e.g. bg-orange-400) */
    activeClass: string;
    className?: string;
};

/** Thin proportional bar: stage color vs amber for Σε Αναμονή (matches main progress split). */
export function StageOnHoldMiniStrip({ totalQty, onHoldQty, activeClass, className = '' }: Props) {
    if (totalQty <= 0 || onHoldQty <= 0) return null;
    const activeQty = Math.max(0, totalQty - onHoldQty);
    return (
        <div
            className={`h-1 w-full min-w-[2.5rem] rounded-full overflow-hidden flex bg-slate-900/10 ${className}`}
            title={`Σε Αναμονή: ${onHoldQty} από ${totalQty} τμχ`}
        >
            {activeQty > 0 && (
                <div className={`min-w-0 h-full ${activeClass}`} style={{ flex: `${activeQty} 1 0%` }} />
            )}
            <div className="min-w-0 h-full bg-amber-400" style={{ flex: `${onHoldQty} 1 0%` }} />
        </div>
    );
}
