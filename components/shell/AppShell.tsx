import { formatNumber } from '../../utils/numberFormat';

import React, { useCallback, useEffect, useState } from 'react';
import { CloudOff, LogOut, Menu, Plus, RefreshCw, Upload, X } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { APP_ICON_ONLY, APP_LOGO } from '../../constants';
import { isLocalMode } from '../../lib/supabase';
import { renderNavIcon, type NavSection, type SurfaceNavItem } from '../../surfaces/navConfig';
import { prefersCollapsedDesktopSidebar } from '../../features/layout/sidebarChrome';
import {
  SIDEBAR_HIDDEN_SCROLL_CLASS,
  SidebarBackdrop,
  SidebarBrand,
  SidebarConnectionBadge,
  SidebarFooterMeta,
  SidebarHoverTooltip,
  SidebarLogoutButton,
  SidebarNavButton,
  SidebarSectionLabel,
} from '../layout/SidebarChrome';
import { useViewport } from './viewport';

export interface ShellConnectivity {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  triggerSync: () => void | Promise<void>;
}

export interface ShellPrimaryAction {
  label: string;
  onClick: () => void;
  isActive?: boolean;
}

export interface AppShellProps<P extends string> {
  children?: React.ReactNode;
  activePage: P;
  onNavigate: (page: P) => void;
  sections: NavSection<P>[];
  /** Phone bottom bar: two slots left of the primary button, one right of it, then "Μενού". */
  barItems: readonly [SurfaceNavItem<P>, SurfaceNavItem<P>, SurfaceNavItem<P>];
  primaryAction: ShellPrimaryAction;
  /** Small label under the user's name in the phone menu (e.g. "Χώρος πλασιέ"). */
  workspaceLabel: string;
  connectivity: ShellConnectivity;
  badges?: Partial<Record<P, number>>;
  /** Full-screen flows (order builder) hide the phone bottom bar. */
  hideBottomBar?: boolean;
  /** Remembers the desktop sidebar's collapsed state per surface. */
  storageKey: string;
}

const readCollapsed = (storageKey: string) => {
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (stored != null) return stored === '1';
  } catch { /* storage unavailable */ }
  return prefersCollapsedDesktopSidebar(window.innerWidth);
};

const badgeText = (count: number) => (count > 99 ? '99+' : formatNumber(count));

// ─── Sync banner (offline / pending changes) ─────────────────────────────────
function SyncBanner({ connectivity }: { connectivity: ShellConnectivity }) {
  const { isOnline, isSyncing, pendingCount, triggerSync } = connectivity;
  if (isLocalMode || (isOnline && pendingCount === 0 && !isSyncing)) return null;
  return (
    <div className={`flex shrink-0 items-center justify-between gap-2 px-3 py-1.5 text-[11px] font-bold text-white ${!isOnline ? 'bg-rose-600' : 'bg-amber-500'}`}>
      <span className="flex min-w-0 items-center gap-2">
        {!isOnline ? <CloudOff size={13} /> : isSyncing ? <RefreshCw size={13} className="animate-spin" /> : <Upload size={13} />}
        <span className="truncate">
          {!isOnline ? 'Εκτός σύνδεσης — οι αλλαγές αποθηκεύονται τοπικά' : isSyncing ? 'Συγχρονισμός…' : `Εκκρεμούν ${formatNumber(pendingCount)} αλλαγές`}
        </span>
      </span>
      {isOnline && !isSyncing && pendingCount > 0 && (
        <button type="button" onClick={() => void triggerSync()} className="shrink-0 rounded-full bg-white/20 px-2.5 py-0.5 text-[10px] uppercase tracking-wider hover:bg-white/30">
          Συγχρονισμός
        </button>
      )}
    </div>
  );
}

// ─── Desktop / tablet / landscape: the ERP sidebar ───────────────────────────
function ShellSidebar<P extends string>({
  activePage, onNavigate, sections, primaryAction, connectivity, badges, canCollapse, storageKey,
}: Omit<AppShellProps<P>, 'children' | 'barItems' | 'workspaceLabel' | 'hideBottomBar'> & { canCollapse: boolean }) {
  const { signOut, profile } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(() => readCollapsed(storageKey));
  const railMode = !canCollapse || isCollapsed;

  const toggle = () => {
    setIsCollapsed((current) => {
      const next = !current;
      try { window.localStorage.setItem(storageKey, next ? '1' : '0'); } catch { /* storage unavailable */ }
      return next;
    });
  };

  const primaryButton = (
    <button
      type="button"
      onClick={primaryAction.onClick}
      aria-label={primaryAction.label}
      className={`relative mb-1 flex w-full items-center rounded-xl bg-gradient-to-r from-amber-300 to-amber-400 font-bold text-[#060b00] shadow-[0_8px_24px_-10px_rgba(251,191,36,0.6)] transition-transform hover:-translate-y-px active:translate-y-0 ${
        railMode ? 'h-10 justify-center' : 'h-10 gap-2.5 px-3 text-[13px]'
      } ${primaryAction.isActive ? 'ring-2 ring-amber-200/70 ring-offset-2 ring-offset-[#070c02]' : ''}`}
    >
      <Plus size={18} strokeWidth={2.75} />
      {!railMode && <span className="truncate">{primaryAction.label}</span>}
    </button>
  );

  const status = (
    <SidebarConnectionBadge
      railMode={railMode}
      isLocalMode={isLocalMode}
      isOnline={connectivity.isOnline}
      isSyncing={connectivity.isSyncing}
      pendingCount={connectivity.pendingCount}
    />
  );

  return (
    <aside
      className={`relative isolate z-30 flex h-full shrink-0 flex-col overflow-hidden border-r border-amber-200/[0.07] bg-[#070c02] text-white shadow-[1px_0_0_rgba(251,191,36,0.04),16px_0_48px_rgba(6,11,0,0.32)] transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
        railMode ? 'w-[4.25rem]' : 'w-64'
      }`}
      aria-label="Κύρια πλοήγηση"
    >
      <SidebarBackdrop />
      <SidebarBrand logoSrc={APP_LOGO} iconSrc={APP_ICON_ONLY} railMode={railMode} />
      <nav className={`flex flex-1 flex-col px-2 py-2 ${SIDEBAR_HIDDEN_SCROLL_CLASS}`}>
        {railMode ? <SidebarHoverTooltip label={primaryAction.label}>{primaryButton}</SidebarHoverTooltip> : primaryButton}
        {sections.map((section, sectionIndex) => (
          <div key={section.title} role="group" aria-label={section.title}>
            <SidebarSectionLabel title={section.title} collapsed={railMode} first={sectionIndex === 0} />
            {section.items.map((item) => (
              <SidebarNavButton
                key={item.id}
                icon={renderNavIcon(item.icon, 18)}
                label={item.label}
                isActive={activePage === item.id}
                isCollapsed={railMode}
                onClick={() => onNavigate(item.id)}
                badge={badges?.[item.id]}
              />
            ))}
          </div>
        ))}
      </nav>
      <div className="shrink-0 border-t border-white/[0.06] bg-black/10 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2">
        <SidebarLogoutButton name={profile?.full_name || undefined} railMode={railMode} onLogout={() => signOut()} />
        {canCollapse ? (
          <SidebarFooterMeta railMode={railMode} isCollapsed={isCollapsed} onToggle={toggle} status={status} />
        ) : (
          <div className="mt-1.5 border-t border-white/[0.05] pt-1.5">{status}</div>
        )}
      </div>
    </aside>
  );
}

// ─── Phone portrait: bottom bar + menu sheet ─────────────────────────────────
const BarButton = ({ icon: Icon, label, active, badge, onClick }: { icon: React.ElementType; label: string; active: boolean; badge?: number; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    aria-current={active ? 'page' : undefined}
    className={`relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 pb-1 pt-1.5 transition-colors ${active ? 'text-[#060b00]' : 'text-slate-400 active:text-slate-600'}`}
  >
    {active && <span className="absolute top-0 h-[3px] w-7 rounded-b-full bg-amber-400" />}
    <span className={`relative flex h-7 w-11 items-center justify-center rounded-full transition-colors ${active ? 'bg-amber-100' : ''}`}>
      <Icon size={20} strokeWidth={active ? 2.5 : 2} />
      {!!badge && badge > 0 && (
        <span className="absolute -top-1 right-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-black text-white ring-2 ring-white">
          {badgeText(badge)}
        </span>
      )}
    </span>
    <span className={`w-full truncate px-0.5 text-center text-[10px] leading-tight ${active ? 'font-bold' : 'font-semibold'}`}>{label}</span>
  </button>
);

function MobileMenuSheet<P extends string>({ activePage, onNavigate, onClose, sections, badges, workspaceLabel }: {
  activePage: P; onNavigate: (p: P) => void; onClose: () => void; sections: NavSection<P>[]; badges?: Partial<Record<P, number>>; workspaceLabel: string;
}) {
  const { signOut, profile } = useAuth();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-end" role="dialog" aria-modal="true" aria-label="Μενού">
      <button type="button" aria-label="Κλείσιμο" onClick={onClose} className="absolute inset-0 bg-[#060b00]/45" />
      <div className="relative w-full rounded-t-3xl bg-white pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-2xl">
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-slate-200" />
        <div className="flex items-center gap-3 px-4 pb-2 pt-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#060b00]">
            <img src={APP_ICON_ONLY} alt="" className="h-6 w-6 object-contain" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-bold text-[#060b00]">{profile?.full_name || 'Χρήστης'}</span>
            <span className="block text-[11px] font-semibold text-slate-500">{workspaceLabel}</span>
          </span>
          <button type="button" onClick={onClose} aria-label="Κλείσιμο" className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="max-h-[60dvh] space-y-3 overflow-y-auto px-3 pb-2 pt-1">
          {sections.map((section) => (
            <div key={section.title}>
              <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">{section.title}</p>
              <div className="grid grid-cols-3 gap-2">
                {section.items.map((item) => {
                  const active = activePage === item.id;
                  const badge = badges?.[item.id];
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => { onNavigate(item.id); onClose(); }}
                      className={`relative flex min-h-[4.5rem] flex-col items-center justify-center gap-1.5 rounded-2xl border px-1 text-center transition-colors active:scale-[0.97] ${
                        active ? 'border-[#060b00] bg-[#060b00] text-amber-300' : 'border-slate-200 bg-slate-50 text-slate-700'
                      }`}
                    >
                      {renderNavIcon(item.icon, 20, active ? 2.5 : 2)}
                      <span className={`w-full truncate text-[11px] font-bold ${active ? 'text-white' : ''}`}>{item.label}</span>
                      {!!badge && badge > 0 && (
                        <span className="absolute right-1.5 top-1.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-black text-white">{badgeText(badge)}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="px-3 pt-2">
          <button
            type="button"
            onClick={() => signOut()}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 text-[13px] font-bold text-rose-600"
          >
            <LogOut size={16} /> Αποσύνδεση
          </button>
        </div>
      </div>
    </div>
  );
}

function MobileBottomBar<P extends string>({ activePage, onNavigate, barItems, primaryAction, sections, badges, workspaceLabel }: Pick<AppShellProps<P>, 'activePage' | 'onNavigate' | 'barItems' | 'primaryAction' | 'sections' | 'badges' | 'workspaceLabel'>) {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const barIds = new Set<P>(barItems.map((i) => i.id));
  const menuActive = !primaryAction.isActive && !barIds.has(activePage);
  // Surface badges of pages that live in the menu on the menu button itself.
  const menuBadge = sections.flatMap((s) => s.items).filter((i) => !barIds.has(i.id)).reduce((sum, i) => sum + (badges?.[i.id] || 0), 0);

  const renderItem = (item: SurfaceNavItem<P>) => (
    <BarButton
      key={item.id}
      icon={item.icon}
      label={item.label}
      active={!primaryAction.isActive && activePage === item.id}
      badge={badges?.[item.id]}
      onClick={() => onNavigate(item.id)}
    />
  );

  return (
    <>
      <nav className="relative z-40 shrink-0 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]" aria-label="Κύρια πλοήγηση">
        <div className="mx-auto flex h-[3.75rem] max-w-lg items-stretch px-1">
          {renderItem(barItems[0])}
          {renderItem(barItems[1])}
          <div className="flex min-w-[3.75rem] flex-1 items-start justify-center">
            <button
              type="button"
              onClick={primaryAction.onClick}
              aria-label={primaryAction.label}
              className="-mt-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#1c2812] via-[#0b1204] to-[#060b00] text-amber-300 shadow-lg shadow-[#060b00]/30 ring-4 ring-slate-50 active:scale-95"
            >
              <Plus size={26} strokeWidth={2.75} />
            </button>
          </div>
          {renderItem(barItems[2])}
          <BarButton icon={Menu} label="Μενού" active={menuActive || menuOpen} badge={menuBadge} onClick={() => setMenuOpen(true)} />
        </div>
      </nav>
      {menuOpen && (
        <MobileMenuSheet activePage={activePage} onNavigate={onNavigate} onClose={closeMenu} sections={sections} badges={badges} workspaceLabel={workspaceLabel} />
      )}
    </>
  );
}

/**
 * Shell shared by the seller and store apps: the ERP's dark sidebar on desktop/tablets/landscape,
 * a five-slot bottom bar with a menu sheet on phones. Each page owns its own scroll area.
 */
export default function AppShell<P extends string>(props: AppShellProps<P>) {
  const { children, connectivity, hideBottomBar } = props;
  const { isDesktop, hasRail } = useViewport();

  if (hasRail) {
    return (
      <div className="flex h-[100dvh] overflow-hidden bg-slate-50 font-sans text-[#060b00]">
        <ShellSidebar
          activePage={props.activePage}
          onNavigate={props.onNavigate}
          sections={props.sections}
          primaryAction={props.primaryAction}
          connectivity={connectivity}
          badges={props.badges}
          storageKey={props.storageKey}
          canCollapse={isDesktop}
        />
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <SyncBanner connectivity={connectivity} />
          <div className={`min-h-0 flex-1 ${isDesktop ? 'p-4 xl:p-6 2xl:p-8' : 'p-0'}`}>
            <div className="mx-auto h-full w-full max-w-[1600px]">{children}</div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-slate-50 text-[#060b00]">
      <SyncBanner connectivity={connectivity} />
      <main className="relative min-h-0 flex-1 overflow-hidden">{children}</main>
      {!hideBottomBar && (
        <MobileBottomBar
          activePage={props.activePage}
          onNavigate={props.onNavigate}
          barItems={props.barItems}
          primaryAction={props.primaryAction}
          sections={props.sections}
          badges={props.badges}
          workspaceLabel={props.workspaceLabel}
        />
      )}
    </div>
  );
}
