import { formatNumber } from '../../utils/numberFormat';
import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronsLeft, ChevronsRight, Cloud, CloudOff, HardDrive, LogOut, RefreshCw, X } from 'lucide-react';
import {
  APP_VERSION_LABEL,
  SIDEBAR_HIDDEN_SCROLL_CLASS,
  resolveSidebarConnection,
  type SidebarConnectionInput,
} from '../../features/layout/sidebarChrome';

export { SIDEBAR_HIDDEN_SCROLL_CLASS };

/** Tighter rows on short desktop screens (13" laptops, split windows), roomier touch rows in the mobile drawer. */
const NAV_ROW_HEIGHT_CLASS = 'h-9 max-md:h-11 md:[@media(max-height:820px)]:h-8';

const FOCUS_RING_CLASS =
  'outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60 focus-visible:ring-offset-1 focus-visible:ring-offset-[#060b00]';

export function sidebarAsideClass(isCollapsed: boolean, isMobileOpen = false): string {
  return [
    'fixed inset-y-0 left-0 z-40 isolate flex flex-col overflow-hidden border-r border-amber-200/[0.07]',
    'bg-[#070c02] text-white',
    'shadow-[1px_0_0_rgba(251,191,36,0.04),16px_0_48px_rgba(6,11,0,0.42)]',
    'transition-[width,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
    isMobileOpen ? 'translate-x-0 w-[min(18rem,86vw)]' : '-translate-x-full md:translate-x-0',
    isCollapsed ? 'md:w-[4.25rem]' : 'md:w-64',
  ].join(' ');
}

export function sidebarMainClass(isCollapsed: boolean): string {
  return [
    'flex h-full min-w-0 flex-1 flex-col overflow-hidden transition-[margin] duration-300 ease-out motion-reduce:transition-none',
    isCollapsed ? 'md:ml-[4.25rem]' : 'md:ml-[4.25rem] 2xl:ml-64',
  ].join(' ');
}

/** Decorative layered glow behind the sidebar content. Render as the first child of the aside. */
export function SidebarBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-[#141d0c] via-[#070c02] to-[#030501]" />
      <div className="absolute -left-24 -top-24 h-64 w-64 rounded-full bg-amber-400/[0.10] blur-3xl" />
      <div className="absolute -bottom-32 -right-24 h-72 w-72 rounded-full bg-emerald-500/[0.06] blur-3xl" />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/25 to-transparent" />
    </div>
  );
}

/**
 * Closes the sidebar (drawer or overlay panel) with Escape while it is open.
 * A component rather than a hook so layouts with early returns can mount it from JSX.
 */
export function SidebarEscapeListener({ active, onEscape }: { active: boolean; onEscape: () => void }) {
  const handlerRef = useRef(onEscape);
  handlerRef.current = onEscape;
  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) handlerRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);
  return null;
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
      className="fixed inset-0 z-[35] hidden bg-[#060b00]/35 backdrop-blur-[2px] animate-in fade-in duration-200 md:block 2xl:hidden"
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
    const top = Math.min(Math.max(rect.top + rect.height / 2, 20), window.innerHeight - 20);
    setPos({ top, left: rect.right + 12 });
    setOpen(true);
  };

  const show = () => {
    clearTimers();
    showTimer.current = window.setTimeout(place, 180);
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
      onClick={hide}
    >
      {children}
      {open && typeof document !== 'undefined'
        ? createPortal(
            <div
              id={tooltipId}
              role="tooltip"
              className="pointer-events-none fixed z-[80] max-w-[16rem] -translate-y-1/2 rounded-lg border border-amber-300/20 bg-[#10180b]/95 px-2.5 py-1.5 text-[11.5px] font-medium leading-snug tracking-wide text-amber-50 shadow-[0_12px_32px_rgba(6,11,0,0.5)] backdrop-blur-md animate-in fade-in slide-in-from-left-1 duration-150"
              style={{ top: pos.top, left: pos.left }}
            >
              <span className="absolute left-0 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 border-b border-l border-amber-300/20 bg-[#10180b]" />
              {label}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

/** Top brand block: the full logo centred and given room when expanded, the mark alone in the rail. */
export function SidebarBrand({
  logoSrc,
  iconSrc,
  railMode,
  onClose,
}: {
  logoSrc: string;
  iconSrc: string;
  railMode: boolean;
  onClose?: () => void;
}) {
  return (
    <div
      className={`relative flex shrink-0 items-center justify-center border-b border-white/[0.06] ${
        railMode ? 'h-16 px-1.5' : 'h-24 px-6 md:[@media(max-height:820px)]:h-20'
      }`}
    >
      {/* Soft halo so the gold logo lifts off the dark panel. */}
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-300/[0.10] blur-2xl ${
          railMode ? 'h-10 w-10' : 'h-16 w-40'
        }`}
      />
      {railMode ? (
        <img src={iconSrc} alt="Ilios Kosmima" className="relative h-9 w-9 object-contain drop-shadow-[0_2px_8px_rgba(251,191,36,0.3)]" />
      ) : (
        <img
          src={logoSrc}
          alt="Ilios Kosmima"
          className="relative mx-auto h-16 w-auto max-w-full object-contain drop-shadow-[0_4px_14px_rgba(0,0,0,0.45)] md:[@media(max-height:820px)]:h-14"
        />
      )}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Κλείσιμο μενού"
          className={`absolute right-2 top-2 inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/[0.07] hover:text-white md:hidden ${FOCUS_RING_CLASS}`}
        >
          <X size={18} />
        </button>
      )}
    </div>
  );
}

export type SidebarStatusTone = 'ok' | 'busy' | 'warn' | 'error';

const STATUS_TONE: Record<SidebarStatusTone, { dot: string; text: string; pulse: boolean }> = {
  ok: { dot: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]', text: 'text-emerald-300/90', pulse: false },
  busy: { dot: 'bg-amber-300 shadow-[0_0_8px_rgba(252,211,77,0.7)]', text: 'text-amber-200/90', pulse: true },
  warn: { dot: 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.7)]', text: 'text-amber-200/90', pulse: false },
  error: { dot: 'bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.7)]', text: 'text-rose-300', pulse: true },
};

/** Quiet status line for the footer: a glowing dot plus a short label; the full explanation lives in the tooltip. */
export function SidebarStatusIndicator({
  tone,
  shortLabel,
  label,
  icon,
  railMode,
}: {
  tone: SidebarStatusTone;
  shortLabel: string;
  label: string;
  icon?: React.ReactNode;
  railMode: boolean;
}) {
  const style = STATUS_TONE[tone];
  const dot = (
    <span className="relative flex h-2 w-2 shrink-0">
      {style.pulse && <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${style.dot}`} />}
      <span className={`relative inline-flex h-2 w-2 rounded-full ${style.dot}`} />
    </span>
  );

  return (
    <SidebarHoverTooltip label={label}>
      <span
        role="status"
        aria-label={label}
        className={`flex min-w-0 select-none items-center ${railMode ? 'h-7 justify-center' : 'h-8 gap-2 px-3'}`}
      >
        {dot}
        {!railMode && (
          <>
            <span className={`truncate text-[11.5px] font-medium ${style.text}`}>{shortLabel}</span>
            {icon && <span className={`shrink-0 opacity-70 ${style.text}`}>{icon}</span>}
          </>
        )}
      </span>
    </SidebarHoverTooltip>
  );
}

export function SidebarConnectionBadge({ railMode, ...input }: SidebarConnectionInput & { railMode: boolean }) {
  const status = resolveSidebarConnection(input);
  const pending = input.pendingCount > 99 ? '99+' : formatNumber(input.pendingCount);
  const view: Record<typeof status.kind, { tone: SidebarStatusTone; shortLabel: string; icon: React.ReactNode }> = {
    online: { tone: 'ok', shortLabel: 'Συνδεδεμένο', icon: <Cloud size={12} strokeWidth={2.2} /> },
    syncing: { tone: 'busy', shortLabel: 'Συγχρονισμός…', icon: <RefreshCw size={12} strokeWidth={2.2} className="animate-spin" /> },
    pending: { tone: 'warn', shortLabel: `${pending} σε αναμονή`, icon: <RefreshCw size={12} strokeWidth={2.2} /> },
    offline: { tone: 'error', shortLabel: 'Εκτός σύνδεσης', icon: <CloudOff size={12} strokeWidth={2.2} /> },
    local: { tone: 'warn', shortLabel: 'Τοπική βάση', icon: <HardDrive size={12} strokeWidth={2.2} /> },
  };
  const { tone, shortLabel, icon } = view[status.kind];
  return <SidebarStatusIndicator tone={tone} shortLabel={shortLabel} label={status.label} icon={icon} railMode={railMode} />;
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
        className={`hidden h-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-white/[0.07] hover:text-amber-200 md:flex ${isCollapsed ? 'w-full' : 'w-8'} ${FOCUS_RING_CLASS}`}
      >
        {isCollapsed ? <ChevronsRight size={16} strokeWidth={2} /> : <ChevronsLeft size={16} strokeWidth={2} />}
      </button>
    </SidebarHoverTooltip>
  );
}

export function SidebarSectionLabel({ title, collapsed, first = false }: { title: string; collapsed: boolean; first?: boolean }) {
  if (collapsed) {
    return first ? null : <div className="mx-3 my-2 h-px bg-gradient-to-r from-transparent via-white/[0.10] to-transparent" aria-hidden="true" />;
  }
  return (
    <div className={`flex items-center gap-2 px-3 pb-1.5 ${first ? 'pt-2' : 'pt-4 md:[@media(max-height:820px)]:pt-3'}`}>
      <p className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-200/45">{title}</p>
      <span aria-hidden="true" className="h-px flex-1 bg-gradient-to-r from-white/[0.08] to-transparent" />
    </div>
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
  const buttonRef = useRef<HTMLButtonElement>(null);
  const hasBadge = !!badge && badge > 0;
  const badgeText = hasBadge ? (badge! > 99 ? '99+' : formatNumber(badge!)) : '';

  // Keep the active destination visible when the nav list scrolls on short screens.
  useEffect(() => {
    if (isActive) buttonRef.current?.scrollIntoView({ block: 'nearest' });
  }, [isActive, isCollapsed]);

  const button = (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      aria-current={isActive ? 'page' : undefined}
      aria-label={isCollapsed ? (hasBadge ? `${label} (${badgeText})` : label) : undefined}
      className={`
        group relative my-px flex w-full items-center rounded-xl transition-[background-color,color,box-shadow] duration-150
        ${NAV_ROW_HEIGHT_CLASS}
        ${isCollapsed ? 'justify-center px-0' : 'justify-start gap-3 px-3'}
        ${isActive
          ? 'bg-gradient-to-r from-amber-400/[0.16] via-amber-400/[0.07] to-white/[0.02] text-white shadow-[inset_0_0_0_1px_rgba(252,211,77,0.12),0_6px_18px_-8px_rgba(251,191,36,0.35)]'
          : 'text-slate-400 hover:bg-white/[0.05] hover:text-slate-100'}
        ${FOCUS_RING_CLASS}
      `}
    >
      {isActive && (
        <span
          aria-hidden="true"
          className="absolute -left-1.5 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-amber-300 shadow-[0_0_10px_rgba(252,211,77,0.7)]"
        />
      )}
      <span
        className={`relative shrink-0 transition-transform duration-150 group-hover:scale-110 motion-reduce:transform-none ${
          isActive ? 'text-amber-300 drop-shadow-[0_0_6px_rgba(252,211,77,0.45)]' : 'text-slate-500 group-hover:text-amber-200/90'
        }`}
      >
        {icon}
        {hasBadge && isCollapsed && (
          <span className="absolute -right-2.5 -top-2 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-amber-400 px-1 text-[8.5px] font-black text-[#060b00] ring-2 ring-[#0b1105]">
            {badgeText}
          </span>
        )}
      </span>
      {!isCollapsed && (
        <span className={`min-w-0 truncate text-[13px] tracking-wide ${isActive ? 'font-semibold' : 'font-medium'}`}>
          {label}
        </span>
      )}
      {hasBadge && !isCollapsed && (
        <span
          className={`ml-auto flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[10px] font-black tabular-nums ${
            isActive ? 'bg-amber-300 text-[#060b00]' : 'bg-amber-400/15 text-amber-200 ring-1 ring-inset ring-amber-300/25'
          }`}
        >
          {badgeText}
        </span>
      )}
    </button>
  );

  return isCollapsed ? <SidebarHoverTooltip label={hasBadge ? `${label} · ${badgeText}` : label}>{button}</SidebarHoverTooltip> : button;
}

/** Sign-out row styled like a nav item, with the signed-in name as a quiet trailing hint. */
export function SidebarLogoutButton({
  name,
  railMode,
  onLogout,
}: {
  name?: string;
  railMode: boolean;
  onLogout: () => void;
}) {
  const label = name ? `Αποσύνδεση · ${name}` : 'Αποσύνδεση';
  const button = (
    <button
      type="button"
      onClick={onLogout}
      aria-label={label}
      className={`group relative my-px flex w-full items-center rounded-xl text-slate-400 transition-colors duration-150 hover:bg-rose-500/[0.10] hover:text-rose-200
        ${NAV_ROW_HEIGHT_CLASS}
        ${railMode ? 'justify-center px-0' : 'justify-start gap-3 px-3'}
        ${FOCUS_RING_CLASS}`}
    >
      <LogOut size={18} strokeWidth={2} className="shrink-0 text-slate-500 transition-colors group-hover:text-rose-300" />
      {!railMode && (
        <>
          <span className="shrink-0 text-[13px] font-medium tracking-wide">Αποσύνδεση</span>
          {name && <span className="ml-auto min-w-0 truncate text-[11px] text-slate-600 group-hover:text-rose-200/60">{name}</span>}
        </>
      )}
    </button>
  );
  return railMode ? <SidebarHoverTooltip label={label}>{button}</SidebarHoverTooltip> : button;
}

export function SidebarVersionMark({ compact = false }: { compact?: boolean }) {
  const mark = (
    <p className={`select-none text-center font-medium text-slate-600 ${compact ? 'text-[10px] tracking-wide' : 'text-[10px] tracking-[0.14em]'}`}>
      {compact ? 'v1.0' : APP_VERSION_LABEL}
    </p>
  );
  return compact ? <SidebarHoverTooltip label={APP_VERSION_LABEL}>{mark}</SidebarHoverTooltip> : mark;
}

/** Footer meta: connection status beside the collapse toggle, version underneath; stacked in the rail. */
export function SidebarFooterMeta({
  railMode,
  isCollapsed,
  onToggle,
  status,
}: {
  railMode: boolean;
  isCollapsed: boolean;
  onToggle: () => void;
  status?: React.ReactNode;
}) {
  if (railMode) {
    return (
      <div className="mt-1.5 flex flex-col items-center gap-1 border-t border-white/[0.05] pt-1.5">
        {status}
        <SidebarCollapseButton isCollapsed={isCollapsed} onToggle={onToggle} />
        <SidebarVersionMark compact />
      </div>
    );
  }
  return (
    <div className="mt-1.5 border-t border-white/[0.05] pt-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">{status}</div>
        <SidebarCollapseButton isCollapsed={isCollapsed} onToggle={onToggle} />
      </div>
      <div className="mt-1">
        <SidebarVersionMark />
      </div>
    </div>
  );
}
