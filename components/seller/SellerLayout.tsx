import { formatNumber } from '../../utils/numberFormat';

import React, { useEffect, useState } from 'react';
import { BookOpen, CloudOff, LayoutDashboard, LogOut, Menu, Plus, RefreshCw, ShoppingCart, Upload, X } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { APP_ICON_ONLY, APP_LOGO } from '../../constants';
import { useOfflineSync } from '../../hooks/useOfflineSync';
import { isLocalMode } from '../../lib/supabase';
import { renderNavIcon, sellerNavSections } from '../../surfaces/navConfig';
import type { SellerPage } from '../../surfaces/pageIds';
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
import { useSellerViewport } from './sellerViewport';

interface Props {
  children?: React.ReactNode;
  activePage: SellerPage;
  onNavigate: (page: SellerPage) => void;
  onCreateOrder: () => void;
}

const COLLAPSE_STORAGE_KEY = 'ilios-seller-sidebar-collapsed';

const readCollapsed = () => {
  try {
    const stored = window.localStorage.getItem(COLLAPSE_STORAGE_KEY);
    if (stored != null) return stored === '1';
  } catch { /* storage unavailable */ }
  return prefersCollapsedDesktopSidebar(window.innerWidth);
};

// ─── Sync banner (offline / pending changes) ─────────────────────────────────
type SyncState = ReturnType<typeof useOfflineSync>;

function SyncBanner({ sync }: { sync: SyncState }) {
  const { isOnline, pendingCount, syncStatus, triggerSync } = sync;
  if (isOnline && pendingCount === 0 && syncStatus !== 'error') return null;
  return (
    <div className={`flex shrink-0 items-center justify-between gap-2 px-3 py-1.5 text-[11px] font-bold text-white
      ${!isOnline ? 'bg-rose-600' : syncStatus === 'error' ? 'bg-rose-600' : 'bg-amber-500'}`}
    >
      <span className="flex min-w-0 items-center gap-2">
        {!isOnline ? <CloudOff size={13} /> : syncStatus === 'syncing' ? <RefreshCw size={13} className="animate-spin" /> : <Upload size={13} />}
        <span className="truncate">
          {!isOnline ? 'Εκτός σύνδεσης — οι αλλαγές αποθηκεύονται τοπικά' : syncStatus === 'syncing' ? 'Συγχρονισμός…' : syncStatus === 'error' ? 'Σφάλμα συγχρονισμού' : `Εκκρεμούν ${formatNumber(pendingCount)} αλλαγές`}
        </span>
      </span>
      {isOnline && syncStatus !== 'syncing' && pendingCount > 0 && (
        <button type="button" onClick={triggerSync} className="shrink-0 rounded-full bg-white/20 px-2.5 py-0.5 text-[10px] uppercase tracking-wider hover:bg-white/30">
          Συγχρονισμός
        </button>
      )}
    </div>
  );
}

// ─── Desktop / tablet / landscape: the ERP sidebar ───────────────────────────
function SellerSidebar({ activePage, onNavigate, onCreateOrder, canCollapse, sync }: Omit<Props, 'children'> & { canCollapse: boolean; sync: SyncState }) {
  const { signOut, profile } = useAuth();
  const { isOnline, pendingCount, syncStatus } = sync;
  const [isCollapsed, setIsCollapsed] = useState(readCollapsed);
  const railMode = !canCollapse || isCollapsed;

  const toggle = () => {
    setIsCollapsed((current) => {
      const next = !current;
      try { window.localStorage.setItem(COLLAPSE_STORAGE_KEY, next ? '1' : '0'); } catch { /* storage unavailable */ }
      return next;
    });
  };

  const newOrderButton = (
    <button
      type="button"
      onClick={onCreateOrder}
      aria-label="Νέα παραγγελία"
      className={`group relative mb-1 flex w-full items-center rounded-xl bg-gradient-to-r from-amber-300 to-amber-400 font-bold text-[#060b00] shadow-[0_8px_24px_-10px_rgba(251,191,36,0.6)] transition-transform hover:-translate-y-px active:translate-y-0 ${
        railMode ? 'h-10 justify-center' : 'h-10 gap-2.5 px-3 text-[13px]'
      } ${activePage === 'order-builder' ? 'ring-2 ring-amber-200/70 ring-offset-2 ring-offset-[#070c02]' : ''}`}
    >
      <Plus size={18} strokeWidth={2.75} />
      {!railMode && <span>Νέα παραγγελία</span>}
    </button>
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
        {railMode ? <SidebarHoverTooltip label="Νέα παραγγελία">{newOrderButton}</SidebarHoverTooltip> : newOrderButton}
        {sellerNavSections.map((section, sectionIndex) => (
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
              />
            ))}
          </div>
        ))}
      </nav>
      <div className="shrink-0 border-t border-white/[0.06] bg-black/10 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2">
        <SidebarLogoutButton name={profile?.full_name || undefined} railMode={railMode} onLogout={() => signOut()} />
        {canCollapse ? (
          <SidebarFooterMeta
            railMode={railMode}
            isCollapsed={isCollapsed}
            onToggle={toggle}
            status={
              <SidebarConnectionBadge
                railMode={railMode}
                isLocalMode={isLocalMode}
                isOnline={isOnline}
                isSyncing={syncStatus === 'syncing'}
                pendingCount={pendingCount}
              />
            }
          />
        ) : (
          <div className="mt-1.5 border-t border-white/[0.05] pt-1.5">
            <SidebarConnectionBadge railMode isLocalMode={isLocalMode} isOnline={isOnline} isSyncing={syncStatus === 'syncing'} pendingCount={pendingCount} />
          </div>
        )}
      </div>
    </aside>
  );
}

// ─── Phone portrait: bottom bar + menu sheet ─────────────────────────────────
const BAR_ITEMS: Array<{ id: SellerPage; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'dashboard', label: 'Αρχική', icon: LayoutDashboard },
  { id: 'catalog', label: 'Κατάλογος', icon: BookOpen },
  { id: 'orders', label: 'Παραγγελίες', icon: ShoppingCart },
];
const BAR_IDS = new Set<SellerPage>([...BAR_ITEMS.map((i) => i.id), 'order-builder']);

const BarButton = ({ icon: Icon, label, active, onClick }: { icon: React.ElementType; label: string; active: boolean; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    aria-current={active ? 'page' : undefined}
    className={`relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 pb-1 pt-1.5 transition-colors ${active ? 'text-[#060b00]' : 'text-slate-400 active:text-slate-600'}`}
  >
    {active && <span className="absolute top-0 h-[3px] w-7 rounded-b-full bg-amber-400" />}
    <span className={`flex h-7 w-11 items-center justify-center rounded-full transition-colors ${active ? 'bg-amber-100' : ''}`}>
      <Icon size={20} strokeWidth={active ? 2.5 : 2} />
    </span>
    <span className={`w-full truncate px-0.5 text-center text-[10px] leading-tight ${active ? 'font-bold' : 'font-semibold'}`}>{label}</span>
  </button>
);

function MobileMenuSheet({ activePage, onNavigate, onClose }: { activePage: SellerPage; onNavigate: (p: SellerPage) => void; onClose: () => void }) {
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
            <span className="block truncate text-[15px] font-bold text-[#060b00]">{profile?.full_name || 'Πλασιέ'}</span>
            <span className="block text-[11px] font-semibold text-slate-500">Χώρος πλασιέ</span>
          </span>
          <button type="button" onClick={onClose} aria-label="Κλείσιμο" className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="max-h-[60dvh] space-y-3 overflow-y-auto px-3 pb-2 pt-1">
          {sellerNavSections.map((section) => (
            <div key={section.title}>
              <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">{section.title}</p>
              <div className="grid grid-cols-3 gap-2">
                {section.items.map((item) => {
                  const active = activePage === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => { onNavigate(item.id); onClose(); }}
                      className={`flex min-h-[4.5rem] flex-col items-center justify-center gap-1.5 rounded-2xl border px-1 text-center transition-colors active:scale-[0.97] ${
                        active ? 'border-[#060b00] bg-[#060b00] text-amber-300' : 'border-slate-200 bg-slate-50 text-slate-700'
                      }`}
                    >
                      {renderNavIcon(item.icon, 20, active ? 2.5 : 2)}
                      <span className={`w-full truncate text-[11px] font-bold ${active ? 'text-white' : ''}`}>{item.label}</span>
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

function MobileBottomBar({ activePage, onNavigate, onCreateOrder }: Omit<Props, 'children'>) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuActive = !BAR_IDS.has(activePage);
  const closeMenu = React.useCallback(() => setMenuOpen(false), []);

  return (
    <>
      <nav className="relative z-40 shrink-0 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]" aria-label="Κύρια πλοήγηση">
        <div className="mx-auto flex h-[3.75rem] max-w-lg items-stretch px-1">
          <BarButton {...BAR_ITEMS[0]} active={activePage === 'dashboard'} onClick={() => onNavigate('dashboard')} />
          <BarButton {...BAR_ITEMS[1]} active={activePage === 'catalog'} onClick={() => onNavigate('catalog')} />
          <div className="flex min-w-[3.75rem] flex-1 items-start justify-center">
            <button
              type="button"
              onClick={onCreateOrder}
              aria-label="Νέα παραγγελία"
              className="-mt-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#1c2812] via-[#0b1204] to-[#060b00] text-amber-300 shadow-lg shadow-[#060b00]/30 ring-4 ring-slate-50 active:scale-95"
            >
              <Plus size={26} strokeWidth={2.75} />
            </button>
          </div>
          <BarButton {...BAR_ITEMS[2]} active={activePage === 'orders'} onClick={() => onNavigate('orders')} />
          <BarButton icon={Menu} label="Μενού" active={menuActive || menuOpen} onClick={() => setMenuOpen(true)} />
        </div>
      </nav>
      {menuOpen && <MobileMenuSheet activePage={activePage} onNavigate={onNavigate} onClose={closeMenu} />}
    </>
  );
}

export default function SellerLayout({ children, activePage, onNavigate, onCreateOrder }: Props) {
  const { isDesktop, hasRail } = useSellerViewport();
  // One instance only: the hook polls the queue and auto-syncs on reconnect.
  const sync = useOfflineSync();
  const isBuilder = activePage === 'order-builder';

  if (hasRail) {
    return (
      <div className="flex h-[100dvh] overflow-hidden bg-slate-50 font-sans text-[#060b00]">
        <SellerSidebar activePage={activePage} onNavigate={onNavigate} onCreateOrder={onCreateOrder} canCollapse={isDesktop} sync={sync} />
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <SyncBanner sync={sync} />
          <div className={`min-h-0 flex-1 ${isDesktop ? 'p-4 xl:p-6 2xl:p-8' : 'p-0'}`}>
            <div className="mx-auto h-full w-full max-w-[1600px]">{children}</div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-slate-50 text-[#060b00]">
      <SyncBanner sync={sync} />
      <main className="relative min-h-0 flex-1 overflow-hidden">{children}</main>
      {!isBuilder && <MobileBottomBar activePage={activePage} onNavigate={onNavigate} onCreateOrder={onCreateOrder} />}
    </div>
  );
}
