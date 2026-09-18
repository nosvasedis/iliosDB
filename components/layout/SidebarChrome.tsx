import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronsLeft, ChevronsRight, Cloud, CloudOff, HardDrive, RefreshCw } from 'lucide-react';
import {
  APP_VERSION_LABEL,
  SIDEBAR_HIDDEN_SCROLL_CLASS,
  resolveSidebarConnection,
  type SidebarConnectionInput,
} from '../../features/layout/sidebarChrome';

export { SIDEBAR_HIDDEN_SCROLL_CLASS };

export function sidebarAsideClass(isCollapsed: boolean, isMobileOpen = false): string {
  return [
    'fixed inset-y-0 left-0 z-40 flex flex-col overflow-hidden border-r border-amber-400/10',
    'bg-gradient-to-b from-[#121a0c] via-[#060b00] to-[#030501] text-white',
    'shadow-[12px_0_40px_rgba(6,11,0,0.38)] transition-[width,transform] duration-300 ease-out',
    isMobileOpen ? 'translate-x-0 w-64' : '-translate-x-full md:translate-x-0',
    isCollapsed ? 'md:w-[4.25rem]' : 'md:w-64',
  ].join(' ');
}

export function sidebarMainClass(isCollapsed: boolean): string {
  return [
    'flex h-full min-w-0 flex-1 flex-col overflow-hidden transition-[margin] duration-300 ease-out',
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

export function SidebarHoverTooltip({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const triggerRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<number>();
  const showTimer = useRef<number>();
  const tooltipId = useId();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const clearTimers = () => {
    window.clearTimeout(showTimer.current);
    window.clearTimeout(hideTimer.current);
  };

  const place = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPos({ top: rect.top + rect.height / 2, left: rect.right + 10 });
    setOpen(true);
  };

  const show = () => {
    clearTimers();
    showTimer.current = window.setTimeout(place, 220);
  };

  const hide = () => {
    clearTimers();
    hideTimer.current = window.setTimeout(() => setOpen(false), 80);
  };

  useEffect(() => () => clearTimers(), []);

  return (
    <div
      ref={triggerRef}
      className="w-full"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {open && typeof document !== 'undefined'
        ? createPortal(
            <div
              id={tooltipId}
              role="tooltip"
              className="pointer-events-none fixed z-[80] -translate-y-1/2 rounded-md border border-amber-400/20 bg-[#10180b] px-2.5 py-1.5 text-[11px] font-medium tracking-wide text-amber-50 shadow-[0_10px_28px_rgba(6,11,0,0.45)]"
              style={{ top: pos.top, left: pos.left }}
            >
              <span className="absolute left-0 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 border-b border-l border-amber-400/20 bg-[#10180b]" />
              {label}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

export function SidebarConnectionBadge(input: SidebarConnectionInput) {
  const status = resolveSidebarConnection(input);
  const tone =
    status.kind === 'online'
      ? 'text-emerald-300/90'
      : status.kind === 'offline'
        ? 'text-rose-300'
        : 'text-amber-300';

  const icon =
    status.kind === 'syncing' ? (
      <RefreshCw size={13} strokeWidth={2.2} className="animate-spin" />
    ) : status.kind === 'pending' ? (
      <span className="text-[9px] font-black leading-none">{input.pendingCount > 9 ? '9+' : input.pendingCount}</span>
    ) : status.kind === 'offline' ? (
      <CloudOff size={13} strokeWidth={2.2} />
    ) : status.kind === 'local' ? (
      <HardDrive size={13} strokeWidth={2.2} />
    ) : (
      <Cloud size={13} strokeWidth={2.2} />
    );

  return (
    <SidebarHoverTooltip label={status.label}>
      <span
        role="status"
        aria-label={status.label}
        className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${tone}`}
      >
        {icon}
      </span>
    </SidebarHoverTooltip>
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
    <SidebarHoverTooltip label={label}>
      <button
        type="button"
        onClick={onToggle}
        aria-label={label}
        aria-expanded={!isCollapsed}
        className={`flex h-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/[0.07] hover:text-amber-200 ${isCollapsed ? 'w-full' : 'w-8'}`}
      >
        {isCollapsed ? <ChevronsRight size={16} strokeWidth={2} /> : <ChevronsLeft size={16} strokeWidth={2} />}
      </button>
    </SidebarHoverTooltip>
  );
}

export function SidebarSectionLabel({ title, collapsed, first = false }: { title: string; collapsed: boolean; first?: boolean }) {
  if (collapsed) {
    return first ? null : <div className="mx-2 my-1.5 h-px bg-white/[0.08]" aria-hidden="true" />;
  }
  return (
    <p className={`px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-200/40 ${first ? 'pt-1.5' : 'pt-3'}`}>
      {title}
    </p>
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
  const button = (
    <button
      type="button"
      onClick={onClick}
      className={`
        relative flex w-full items-center rounded-lg transition-colors duration-150
        ${isCollapsed ? 'h-9 justify-center px-0' : 'h-9 justify-start gap-2.5 px-2.5'}
        ${isActive
          ? 'bg-white/[0.08] text-white shadow-[inset_2px_0_0_0_#fbbf24]'
          : 'text-slate-400 hover:bg-white/[0.05] hover:text-white'}
      `}
    >
      <span className={`shrink-0 ${isActive ? 'text-amber-300' : 'text-slate-400'}`}>
        {icon}
      </span>
      {!isCollapsed && (
        <span className={`min-w-0 truncate text-[13px] tracking-wide ${isActive ? 'font-semibold text-white' : 'font-medium'}`}>
          {label}
        </span>
      )}
      {!!badge && badge > 0 && !isCollapsed && (
        <span className={`ml-auto flex h-5 min-w-[1.15rem] items-center justify-center rounded-full px-1.5 text-[10px] font-black ${isActive ? 'bg-amber-400/20 text-amber-100' : 'bg-amber-400 text-[#060b00]'}`}>
          {badge > 99 ? '99+' : badge}
        </span>
      )}
      {!!badge && badge > 0 && isCollapsed && (
        <span className="absolute right-1 top-1 flex h-3.5 min-w-[0.85rem] items-center justify-center rounded-full bg-amber-400 px-1 text-[8px] font-black text-[#060b00]">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  );

  return isCollapsed ? <SidebarHoverTooltip label={label}>{button}</SidebarHoverTooltip> : button;
}

export function SidebarVersionMark({ compact = false }: { compact?: boolean }) {
  const mark = (
    <p className={`select-none text-center font-medium text-slate-500 ${compact ? 'text-[10px] tracking-wide' : 'text-[10px] tracking-[0.12em]'}`}>
      {compact ? 'v1.0' : APP_VERSION_LABEL}
    </p>
  );
  return compact ? <SidebarHoverTooltip label={APP_VERSION_LABEL}>{mark}</SidebarHoverTooltip> : mark;
}
