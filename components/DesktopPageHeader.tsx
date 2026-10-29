import React from 'react';
import type { LucideIcon } from 'lucide-react';

export interface DesktopPageHeaderProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  iconSize?: number;
  /** e.g. back button — sits before the brand icon */
  leading?: React.ReactNode;
  /** Right / secondary row (search, tabs, production finder, etc.) */
  tail?: React.ReactNode;
  /**
   * Wrapper for `tail`. Default: end-aligned actions.
   * Use `flex w-full min-w-0 flex-1 flex-col gap-3 lg:flex-row lg:items-center lg:gap-4` for Παραγωγή-style toolbars.
   */
  tailClassName?: string;
  /** Second row inside the same card (border-top), e.g. μητρώο search row */
  below?: React.ReactNode;
  /** Override spacing for `below` (default: `mt-4 border-t border-slate-100 pt-4`). */
  belowClassName?: string;
  padding?: 'compact' | 'comfortable';
  /** Override rounded corner (e.g. rounded-[2rem]) */
  roundedClassName?: string;
  className?: string;
  /**
   * Decorative layer rendered behind the content (clipped to the card, non-interactive).
   * Defaults to the shared glow + dot-grid + accent-line treatment; pass `false` for a plain card.
   */
  backdrop?: React.ReactNode | false;
}

// lg:flex-1 (basis 0) lets the title keep its natural width; a 100% basis made the title shrink and truncate while free space remained.
const DEFAULT_TAIL =
  'flex w-full flex-wrap items-center gap-3 lg:ml-auto lg:max-w-none lg:flex-1 lg:justify-end';

/** Shared header decoration: soft emerald/amber glows, a fading dot grid and a thin accent line. */
export const DEFAULT_HEADER_BACKDROP = (
  <>
    <div className="absolute -right-24 -top-28 h-72 w-72 rounded-full bg-emerald-200/35 blur-3xl" />
    <div className="absolute -top-20 right-1/3 h-56 w-56 rounded-full bg-amber-100/50 blur-3xl" />
    <div className="absolute inset-0 opacity-[0.35] [background-image:radial-gradient(rgba(15,23,42,0.07)_1px,transparent_1px)] [background-size:18px_18px] [mask-image:linear-gradient(to_bottom,black,transparent_70%)]" />
    <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-emerald-400 via-teal-400 to-amber-300" />
  </>
);

type HeaderPrimaryButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: LucideIcon;
  /** `blue` is used where a page already colour-codes a mode (e.g. LSTX molds). */
  tone?: 'dark' | 'blue';
};

/** Main header action ("Νέο …"), matching the Μητρώο Κωδικών look: dark gradient, icon tile, hover sweep. */
export function HeaderPrimaryButton({ icon: ActionIcon, tone = 'dark', className = '', children, type = 'button', ...rest }: HeaderPrimaryButtonProps) {
  const surface = tone === 'blue'
    ? 'bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 shadow-blue-900/25 hover:shadow-blue-900/30'
    : 'bg-gradient-to-br from-[#1c2812] via-[#0b1204] to-[#060b00] shadow-[#060b00]/25 hover:shadow-emerald-900/25';
  const tile = tone === 'blue' ? 'from-sky-300 to-blue-400' : 'from-emerald-400 to-teal-500';
  return (
    <button
      type={type}
      className={`group relative flex h-11 shrink-0 items-center justify-center gap-2 overflow-hidden rounded-xl pl-1.5 pr-4 text-sm font-bold text-white shadow-lg ring-1 ring-inset ring-white/10 transition-all hover:-translate-y-px hover:shadow-xl active:translate-y-0 disabled:pointer-events-none disabled:opacity-50 ${surface} ${className}`}
      {...rest}
    >
      <span className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white/15 to-transparent transition-transform duration-700 group-hover:translate-x-[300%]" />
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br text-white shadow-inner shadow-white/20 ${tile}`}>
        <ActionIcon size={18} strokeWidth={2.75} />
      </span>
      {children}
    </button>
  );
}

const DesktopPageHeader = React.forwardRef<HTMLDivElement, DesktopPageHeaderProps>(function DesktopPageHeader(
  {
    icon: Icon,
    title,
    subtitle,
    iconSize = 20,
    leading,
    tail,
    tailClassName,
    below,
    belowClassName,
    padding = 'comfortable',
    roundedClassName = 'rounded-3xl',
    className = '',
    backdrop,
  },
  ref
) {
  const p = padding === 'compact' ? 'p-4' : 'p-5 md:p-6';
  const decoration = backdrop === false ? null : (backdrop ?? DEFAULT_HEADER_BACKDROP);

  return (
    <div
      ref={ref}
      className={`relative isolate shrink-0 border border-slate-100 bg-white shadow-sm ${roundedClassName} ${p} ${className}`}
    >
      {/* Clipped on its own layer so dropdowns/popovers in the header are never cut off. */}
      {decoration ? <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-[inherit]" aria-hidden>{decoration}</div> : null}
      <div
        className={`flex flex-col gap-4 ${tail ? 'lg:flex-row lg:items-center lg:justify-between lg:gap-4' : ''}`}
      >
        <div className="flex min-w-0 items-start gap-3">
          {leading}
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#1c2812] via-[#0b1204] to-[#060b00] text-white shadow-md shadow-[#060b00]/15 ring-1 ring-inset ring-white/10">
            <Icon size={iconSize} strokeWidth={2.25} />
          </div>
          <div className="min-w-0 pt-0.5">
            <h1 className="truncate text-xl font-bold tracking-tight text-[#060b00]">{title}</h1>
            {subtitle ? <p className="mt-0.5 text-sm font-medium text-slate-500">{subtitle}</p> : null}
          </div>
        </div>
        {tail != null ? <div className={tailClassName ?? DEFAULT_TAIL}>{tail}</div> : null}
      </div>
      {below ? <div className={belowClassName ?? 'mt-4 border-t border-slate-100 pt-4'}>{below}</div> : null}
    </div>
  );
});

export default DesktopPageHeader;
