import React from 'react';
import { HandHeart } from 'lucide-react';

interface Props {
  compact?: boolean;
  className?: string;
  /** Optional consignment code shown after the marker (production / finder). */
  code?: string | null;
}

/** Restrained indigo outlined marker used across orders, production, and Παρακαταθήκες. */
export default function ConsignmentBadge({ compact = false, className = '', code }: Props) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50/70 font-black uppercase tracking-wide text-indigo-700 ${
        compact ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px]'
      } ${className}`.trim()}
    >
      <HandHeart size={compact ? 9 : 11} strokeWidth={2.5} />
      {code ? `Παρακαταθήκη · ${code}` : 'Παρακαταθήκη'}
    </span>
  );
}
