import React from 'react';
import { Wrench } from 'lucide-react';

interface Props {
  compact?: boolean;
  className?: string;
  /** Optional repair code shown after the marker (production / finder). */
  code?: string | null;
}

/** Restrained blue outlined marker used across production, customer cards, and Επισκευές. */
export default function RepairBadge({ compact = false, className = '', code }: Props) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50/70 font-black uppercase tracking-wide text-blue-700 ${
        compact ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px]'
      } ${className}`.trim()}
    >
      <Wrench size={compact ? 9 : 11} strokeWidth={2.5} />
      {code ? `Επισκευή · ${code}` : 'Επισκευή'}
    </span>
  );
}
