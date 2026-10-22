import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  hint?: React.ReactNode;
  action?: React.ReactNode;
  /** `card` draws the dashed frame; `plain` sits inside an existing card. */
  variant?: 'card' | 'plain';
  /** `compact` fits inside list panels and side columns. */
  size?: 'default' | 'compact';
  className?: string;
}

/** Shared "nothing here" block so every page shows empty/no-results the same way. */
export default function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
  variant = 'card',
  size = 'default',
  className = '',
}: EmptyStateProps) {
  const compact = size === 'compact';
  const frame = variant === 'card'
    ? 'rounded-3xl border-2 border-dashed border-slate-200 bg-white/60'
    : '';

  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? 'px-4 py-8' : 'px-6 py-14'} ${frame} ${className}`}>
      <div className={`flex items-center justify-center border border-slate-100 bg-white text-slate-300 shadow-sm ${compact ? 'mb-3 h-11 w-11 rounded-xl' : 'mb-4 h-14 w-14 rounded-2xl'}`}>
        <Icon size={compact ? 20 : 24} />
      </div>
      <p className="text-sm font-black text-slate-600">{title}</p>
      {hint ? <p className="mt-1 max-w-md text-xs font-medium text-slate-400">{hint}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
