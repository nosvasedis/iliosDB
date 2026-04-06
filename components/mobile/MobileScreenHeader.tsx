import React from 'react';
import type { LucideIcon } from 'lucide-react';

/** Shared surface for top bars (screen headers + toolbars like order builder). */
export const MOBILE_HEADER_SURFACE =
  'shrink-0 border-b border-slate-100/90 bg-slate-50/95 backdrop-blur-md supports-[backdrop-filter]:bg-slate-50/85';

const SAFE_TOP = 'pt-[max(0.5rem,env(safe-area-inset-top,0px))]';

export interface MobileScreenHeaderProps {
  /** Lucide icon for the screen */
  icon?: LucideIcon;
  /** Use when the mark is not a Lucide icon (e.g. app logo) */
  iconElement?: React.ReactNode;
  title: string;
  subtitle?: string;
  iconClassName?: string;
  iconWrapClassName?: string;
  right?: React.ReactNode;
  /** Full-width sticky header (default). */
  sticky?: boolean;
  /**
   * Inside an existing sticky stack (e.g. orders). No outer sticky/border;
   * parent should provide MOBILE_HEADER_SURFACE and horizontal padding.
   */
  embedded?: boolean;
  className?: string;
}

export default function MobileScreenHeader({
  icon: Icon,
  iconElement,
  title,
  subtitle,
  iconClassName = 'text-emerald-700',
  iconWrapClassName = 'border-slate-200/80 bg-white shadow-sm',
  right,
  sticky = true,
  embedded = false,
  className = '',
}: MobileScreenHeaderProps) {
  const mark = iconElement ? (
    <div
      className={`flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border ${iconWrapClassName}`}
      aria-hidden
    >
      {iconElement}
    </div>
  ) : Icon ? (
    <div
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${iconWrapClassName}`}
      aria-hidden
    >
      <Icon size={18} strokeWidth={2.25} className={iconClassName} />
    </div>
  ) : null;

  const inner = (
    <div className={`flex items-center gap-3 ${className}`}>
      {mark}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-base font-bold tracking-tight text-slate-900">{title}</h1>
        {subtitle ? (
          <p className="mt-0.5 line-clamp-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
            {subtitle}
          </p>
        ) : null}
      </div>
      {right ? <div className="flex shrink-0 items-center gap-2">{right}</div> : null}
    </div>
  );

  if (embedded) {
    return inner;
  }

  if (!sticky) {
    return <div className={`px-4 pb-3 ${SAFE_TOP}`}>{inner}</div>;
  }

  return (
    <header className={`sticky top-0 z-10 ${MOBILE_HEADER_SURFACE}`}>
      <div className={`px-4 pb-3 ${SAFE_TOP}`}>{inner}</div>
    </header>
  );
}
