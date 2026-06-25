import React, { memo } from 'react';
import { ArrowUpRight, type LucideIcon } from 'lucide-react';
import { MosaicSpinner } from './dashboardMiniCharts';

export type MosaicAccent =
  | 'emerald'
  | 'amber'
  | 'violet'
  | 'sky'
  | 'slate'
  | 'dark'
  | 'blue'
  | 'rose'
  | 'indigo';

export type MosaicPaneSize = 'sm' | 'md' | 'lg' | 'chart' | 'list';

export const MOSAIC_BODY_MIN_HEIGHT: Record<MosaicPaneSize, string> = {
  sm: 'min-h-[5.5rem]',
  md: 'min-h-[8.5rem]',
  lg: 'min-h-[10.5rem]',
  chart: 'min-h-[11.5rem]',
  list: 'min-h-[13rem]',
};

const ACCENT_STYLES: Record<MosaicAccent, { strip: string; icon: string; bg: string; dark?: boolean }> = {
  emerald: { strip: 'bg-emerald-500', icon: 'text-emerald-600', bg: 'bg-white' },
  amber: { strip: 'bg-amber-500', icon: 'text-amber-600', bg: 'bg-white' },
  violet: { strip: 'bg-violet-500', icon: 'text-violet-600', bg: 'bg-white' },
  sky: { strip: 'bg-sky-500', icon: 'text-sky-600', bg: 'bg-white' },
  slate: { strip: 'bg-slate-400', icon: 'text-slate-600', bg: 'bg-white' },
  dark: { strip: 'bg-emerald-400', icon: 'text-emerald-300', bg: 'bg-gradient-to-br from-[#060b00] to-emerald-950', dark: true },
  blue: { strip: 'bg-blue-500', icon: 'text-blue-600', bg: 'bg-white' },
  rose: { strip: 'bg-rose-500', icon: 'text-rose-600', bg: 'bg-white' },
  indigo: { strip: 'bg-indigo-500', icon: 'text-indigo-600', bg: 'bg-white' },
};

interface Props {
  title: string;
  icon: LucideIcon;
  accent?: MosaicAccent;
  size?: MosaicPaneSize;
  /** Responsive grid placement — must sum to 12 per row on lg+ */
  layoutClass: string;
  onNavigate?: () => void;
  headerExtra?: React.ReactNode;
  isLoading?: boolean;
  children: React.ReactNode;
  className?: string;
}

function DashboardMosaicPane({
  title,
  icon: Icon,
  accent = 'slate',
  size = 'md',
  layoutClass,
  onNavigate,
  headerExtra,
  isLoading = false,
  children,
  className = '',
}: Props) {
  const styles = ACCENT_STYLES[accent];
  const isDark = styles.dark;

  const Wrapper = onNavigate ? 'button' : 'div';
  const wrapperProps = onNavigate
    ? { type: 'button' as const, onClick: onNavigate }
    : {};

  return (
    <Wrapper
      {...wrapperProps}
      className={`
        group relative flex h-full flex-col overflow-hidden rounded-2xl border text-left
        [contain:layout_paint]
        ${layoutClass}
        ${isDark ? 'border-emerald-800/40 text-white shadow-sm' : 'border-slate-200/90 shadow-sm'}
        ${styles.bg}
        ${onNavigate ? 'cursor-pointer hover:border-slate-300' : ''}
        ${className}
      `}
    >
      <div className={`absolute left-0 right-0 top-0 h-0.5 ${styles.strip}`} />

      <div className="relative flex shrink-0 items-start justify-between gap-2 px-4 pt-3.5 pb-1">
        <div className="flex min-w-0 items-center gap-2">
          <div
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
              isDark ? 'bg-white/10' : 'bg-slate-50 ring-1 ring-slate-100'
            }`}
          >
            <Icon size={14} className={styles.icon} />
          </div>
          <h3
            className={`truncate text-[11px] font-black uppercase tracking-wide ${
              isDark ? 'text-emerald-100/90' : 'text-slate-600'
            }`}
          >
            {title}
          </h3>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {headerExtra}
          {onNavigate && (
            <ArrowUpRight
              size={14}
              className={`opacity-40 ${isDark ? 'text-emerald-200' : 'text-slate-400'}`}
            />
          )}
        </div>
      </div>

      <div
        className={`relative flex w-full flex-1 flex-col px-4 pb-4 pt-1 ${MOSAIC_BODY_MIN_HEIGHT[size]} ${
          isDark ? 'text-white' : ''
        }`}
      >
        {isLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <MosaicSpinner dark={isDark} />
          </div>
        ) : (
          children
        )}
      </div>
    </Wrapper>
  );
}

export default memo(DashboardMosaicPane);

/** Asymmetrical responsive spans — each row sums to 12 on lg/xl */
export const MOSAIC_LAYOUT = {
  materials: 'col-span-1 sm:col-span-2 lg:col-span-4 xl:col-span-3',
  production: 'col-span-1 sm:col-span-1 lg:col-span-3 xl:col-span-3',
  delivery: 'col-span-1 sm:col-span-1 lg:col-span-3 xl:col-span-4',
  readyOrders: 'col-span-1 sm:col-span-2 lg:col-span-2 xl:col-span-2',
  orderEconomics: 'col-span-1 sm:col-span-2 lg:col-span-4 xl:col-span-3',
  discountVat: 'col-span-1 sm:col-span-1 lg:col-span-3 xl:col-span-3',
  backlog: 'col-span-1 sm:col-span-1 lg:col-span-3 xl:col-span-3',
  offers: 'col-span-1 sm:col-span-2 lg:col-span-2 xl:col-span-3',
  documents: 'col-span-1 sm:col-span-2 lg:col-span-3 xl:col-span-2',
  category: 'col-span-1 sm:col-span-2 lg:col-span-9 xl:col-span-10',
  collection: 'col-span-1 sm:col-span-2 lg:col-span-5 xl:col-span-6',
  variants: 'col-span-1 sm:col-span-2 lg:col-span-7 xl:col-span-6',
  gender: 'col-span-1 sm:col-span-1 lg:col-span-4 xl:col-span-3',
  finish: 'col-span-1 sm:col-span-1 lg:col-span-3 xl:col-span-3',
  customers: 'col-span-1 sm:col-span-2 lg:col-span-5 xl:col-span-6',
  inventoryRisk: 'col-span-1 sm:col-span-2 lg:col-span-7 xl:col-span-5',
  demandPressure: 'col-span-1 sm:col-span-2 lg:col-span-5 xl:col-span-7',
} as const;
