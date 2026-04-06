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
  padding?: 'compact' | 'comfortable';
  /** Override rounded corner (e.g. rounded-[2rem]) */
  roundedClassName?: string;
  className?: string;
}

const DEFAULT_TAIL =
  'flex w-full flex-wrap items-center gap-3 lg:ml-auto lg:max-w-none lg:justify-end';

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
    padding = 'comfortable',
    roundedClassName = 'rounded-3xl',
    className = '',
  },
  ref
) {
  const p = padding === 'compact' ? 'p-4' : 'p-5 md:p-6';

  return (
    <div
      ref={ref}
      className={`shrink-0 border border-slate-100 bg-white shadow-sm ${roundedClassName} ${p} ${className}`}
    >
      <div
        className={`flex flex-col gap-4 ${tail ? 'lg:flex-row lg:items-center lg:justify-between lg:gap-4' : ''}`}
      >
        <div className="flex min-w-0 items-start gap-3">
          {leading}
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#060b00] text-white">
            <Icon size={iconSize} strokeWidth={2.25} />
          </div>
          <div className="min-w-0 pt-0.5">
            <h1 className="text-xl font-bold tracking-tight text-[#060b00]">{title}</h1>
            {subtitle ? <p className="mt-0.5 text-sm font-medium text-slate-500">{subtitle}</p> : null}
          </div>
        </div>
        {tail != null ? <div className={tailClassName ?? DEFAULT_TAIL}>{tail}</div> : null}
      </div>
      {below ? <div className="mt-4 border-t border-slate-100 pt-4">{below}</div> : null}
    </div>
  );
});

export default DesktopPageHeader;
