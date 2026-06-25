import React from 'react';
import { ArrowUpRight, type LucideIcon } from 'lucide-react';

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

const ACCENT_STYLES: Record<MosaicAccent, { strip: string; icon: string; dark?: boolean }> = {
  emerald: { strip: 'bg-emerald-500', icon: 'text-emerald-600' },
  amber: { strip: 'bg-amber-500', icon: 'text-amber-600' },
  violet: { strip: 'bg-violet-500', icon: 'text-violet-600' },
  sky: { strip: 'bg-sky-500', icon: 'text-sky-600' },
  slate: { strip: 'bg-slate-400', icon: 'text-slate-600' },
  dark: { strip: 'bg-emerald-400', icon: 'text-emerald-300', dark: true },
  blue: { strip: 'bg-blue-500', icon: 'text-blue-600' },
  rose: { strip: 'bg-rose-500', icon: 'text-rose-600' },
  indigo: { strip: 'bg-indigo-500', icon: 'text-indigo-600' },
};

const COL_SPAN: Record<number, string> = {
  4: 'lg:col-span-4',
  6: 'lg:col-span-6',
  8: 'lg:col-span-8',
  12: 'lg:col-span-12',
};

interface Props {
  title: string;
  icon: LucideIcon;
  accent?: MosaicAccent;
  colSpan?: 4 | 6 | 8 | 12;
  rowSpan?: 1 | 2;
  onNavigate?: () => void;
  headerExtra?: React.ReactNode;
  animationDelay?: number;
  children: React.ReactNode;
  className?: string;
}

export default function DashboardMosaicPane({
  title,
  icon: Icon,
  accent = 'slate',
  colSpan = 4,
  rowSpan = 1,
  onNavigate,
  headerExtra,
  animationDelay = 0,
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
        group relative flex flex-col overflow-hidden rounded-2xl border text-left
        animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-both
        ${COL_SPAN[colSpan] ?? 'lg:col-span-4'}
        ${rowSpan === 2 ? 'lg:row-span-2' : ''}
        ${isDark
          ? 'border-emerald-900/30 bg-gradient-to-br from-[#060b00] to-emerald-900 text-white shadow-sm hover:shadow-md'
          : 'border-slate-100 bg-white shadow-sm hover:border-slate-200 hover:shadow-md'
        }
        transition-all
        ${onNavigate ? 'cursor-pointer' : ''}
        ${className}
      `}
      style={{ animationDelay: `${animationDelay}ms` }}
    >
      <div className={`absolute left-0 right-0 top-0 h-1 ${styles.strip}`} />

      <div className={`relative flex items-start justify-between gap-2 px-4 pt-4 pb-2 ${isDark ? '' : ''}`}>
        <div className="flex min-w-0 items-center gap-2">
          <div
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
              isDark ? 'bg-white/10' : 'bg-slate-50'
            }`}
          >
            <Icon size={14} className={styles.icon} />
          </div>
          <h3
            className={`truncate text-xs font-black uppercase tracking-wide ${
              isDark ? 'text-emerald-100/90' : 'text-slate-700'
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
              className={`opacity-0 transition-all group-hover:opacity-60 ${
                isDark ? 'text-emerald-200' : 'text-slate-400'
              }`}
            />
          )}
        </div>
      </div>

      <div className={`flex-1 px-4 pb-4 ${isDark ? 'text-white' : ''}`}>{children}</div>
    </Wrapper>
  );
}
