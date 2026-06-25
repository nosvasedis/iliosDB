import React, { memo } from 'react';
import { HelpCircle } from 'lucide-react';

type Variant = 'default' | 'light' | 'dark';

const ICON_CLASS: Record<Variant, string> = {
  default: 'text-slate-300 hover:text-slate-500',
  light: 'text-white/50 hover:text-white/80',
  dark: 'text-emerald-300/50 hover:text-emerald-200/80',
};

function DashboardTermHint({ text, variant = 'default' }: { text: string; variant?: Variant }) {
  return (
    <span
      className="group/hint relative inline-flex shrink-0 align-middle"
      title={text}
      aria-label={text}
    >
      <HelpCircle
        size={12}
        className={`cursor-help transition-colors ${ICON_CLASS[variant]}`}
        aria-hidden
      />
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 z-50 hidden w-52 -translate-x-1/2 rounded-lg bg-slate-800 px-2.5 py-2 text-[10px] font-medium leading-snug text-white shadow-lg group-hover/hint:block group-focus-within/hint:block"
      >
        {text}
      </span>
    </span>
  );
}

export default memo(DashboardTermHint);
