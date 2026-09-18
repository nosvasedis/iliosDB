import React from 'react';
import { ChevronLeft, ChevronRight, HardDrive, RefreshCw } from 'lucide-react';
import {
  APP_VERSION_LABEL,
  resolveSidebarConnection,
  type SidebarConnectionInput,
} from '../../features/layout/sidebarChrome';

export function sidebarAsideClass(isCollapsed: boolean, isMobileOpen = false): string {
  return [
    'fixed inset-y-0 left-0 z-40 flex flex-col overflow-visible border-r border-amber-400/10',
    'bg-gradient-to-b from-[#121a0c] via-[#060b00] to-[#030501] text-white',
    'shadow-[12px_0_40px_rgba(6,11,0,0.38)] transition-[width,transform] duration-300 ease-out',
    isMobileOpen ? 'translate-x-0 w-64' : '-translate-x-full md:translate-x-0',
    isCollapsed ? 'md:w-[4.25rem]' : 'md:w-64',
  ].join(' ');
}

export function sidebarMainClass(isCollapsed: boolean): string {
  return [
    'flex h-full flex-1 flex-col overflow-hidden transition-[margin] duration-300 ease-out',
    isCollapsed ? 'md:ml-[4.25rem]' : 'md:ml-[4.25rem] 2xl:ml-64',
  ].join(' ');
}

export function SidebarOverlayScrim({
  visible,
  onDismiss,
}: {
  visible: boolean;
  onDismiss: () => void;
}) {
  if (!visible) return null;
  return (
    <button
      type="button"
      aria-label="Σύμπτυξη μενού"
      onClick={onDismiss}
      className="fixed inset-0 z-[35] hidden bg-[#060b00]/40 backdrop-blur-[2px] md:block 2xl:hidden"
    />
  );
}

export function SidebarConnectionBadge(input: SidebarConnectionInput) {
  const status = resolveSidebarConnection(input);
  const tone =
    status.kind === 'online'
      ? 'border-emerald-400/35 bg-emerald-400/10 text-emerald-300'
      : status.kind === 'offline'
        ? 'border-rose-400/40 bg-rose-400/10 text-rose-300'
        : 'border-amber-400/40 bg-amber-400/10 text-amber-300';

  return (
    <span
      role="status"
      title={status.label}
      aria-label={status.label}
      className={`relative inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${tone}`}
    >
      {status.kind === 'syncing' ? (
        <RefreshCw size={11} strokeWidth={2.5} className="animate-spin" />
      ) : status.kind === 'pending' ? (
        <span className="text-[9px] font-black leading-none">
          {input.pendingCount > 9 ? '9+' : input.pendingCount}
        </span>
      ) : status.kind === 'local' || status.kind === 'offline' ? (
        <HardDrive size={11} strokeWidth={2.4} />
      ) : (
        <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.85)] animate-pulse" />
      )}
    </span>
  );
}

export function SidebarCollapseButton({
  isCollapsed,
  onToggle,
}: {
  isCollapsed: boolean;
  onToggle: () => void;
}) {
  const label = isCollapsed ? 'Ανάπτυξη μενού' : 'Σύμπτυξη μενού';
  return (
    <button
      type="button"
      onClick={onToggle}
      title={label}
      aria-label={label}
      aria-expanded={!isCollapsed}
      className="absolute top-[3.15rem] -right-3 z-50 hidden h-7 w-7 items-center justify-center rounded-full border border-amber-400/45 bg-[#0d1408] text-amber-300 shadow-[0_8px_20px_rgba(6,11,0,0.45)] transition-all duration-200 hover:scale-105 hover:border-amber-300 hover:bg-amber-400 hover:text-[#060b00] md:flex"
    >
      {isCollapsed ? <ChevronRight size={14} strokeWidth={2.6} /> : <ChevronLeft size={14} strokeWidth={2.6} />}
    </button>
  );
}

export function SidebarNavButton({
  icon,
  label,
  isActive,
  onClick,
  isCollapsed,
  badge,
}: {
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  onClick: () => void;
  isCollapsed: boolean;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={`
        group relative my-0.5 flex w-full items-center rounded-xl transition-all duration-200
        ${isCollapsed ? 'justify-center px-0 py-2' : 'justify-start gap-3 px-3 py-2'}
        ${isActive
          ? 'bg-gradient-to-r from-amber-400/18 via-amber-400/8 to-transparent text-white shadow-[inset_2px_0_0_0_#fbbf24]'
          : 'text-slate-400 hover:bg-white/[0.06] hover:text-white'}
      `}
    >
      <span className={`shrink-0 ${isActive ? 'text-amber-300' : 'text-slate-400 group-hover:text-amber-200'}`}>
        {icon}
      </span>
      {!isCollapsed && (
        <span className={`truncate text-[13px] tracking-wide ${isActive ? 'font-semibold text-white' : 'font-medium'}`}>
          {label}
        </span>
      )}
      {!!badge && badge > 0 && !isCollapsed && (
        <span className={`ml-auto flex h-5 min-w-[1.15rem] items-center justify-center rounded-full px-1.5 text-[10px] font-black ${isActive ? 'bg-amber-400/20 text-amber-100' : 'bg-amber-400 text-[#060b00]'}`}>
          {badge > 99 ? '99+' : badge}
        </span>
      )}
      {!!badge && badge > 0 && isCollapsed && (
        <span className="absolute -top-0.5 right-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-amber-400 px-1 text-[9px] font-black text-[#060b00]">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
      {isCollapsed && (
        <span className="pointer-events-none absolute left-full z-50 ml-3 whitespace-nowrap rounded-lg border border-amber-400/15 bg-[#0b1206] px-3 py-1.5 text-xs font-medium text-white opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100">
          {label}
        </span>
      )}
    </button>
  );
}

export function SidebarVersionMark({ compact = false }: { compact?: boolean }) {
  return (
    <p
      title={APP_VERSION_LABEL}
      className={`select-none text-center font-medium tracking-[0.14em] text-slate-500 ${compact ? 'text-[9px] leading-tight' : 'text-[10px]'}`}
    >
      {compact ? (
        <>
          <span className="block tracking-[0.18em]">ILIOSERP</span>
          <span className="mt-0.5 block text-amber-400/70">v1.0</span>
        </>
      ) : (
        APP_VERSION_LABEL
      )}
    </p>
  );
}
