
import React from 'react';
import { WifiOff, RefreshCw, CloudOff } from 'lucide-react';
import { mobileAdminNavItems, renderNavIcon } from '../../surfaces/navConfig';
import type { MobileAdminPage } from '../../surfaces/pageIds';

interface MobileLayoutProps {
  children?: React.ReactNode;
  activePage: MobileAdminPage;
  onNavigate: (page: MobileAdminPage) => void;
  isOnline?: boolean;
  isSyncing?: boolean;
  pendingCount?: number;
}

const barPageIds = new Set<MobileAdminPage>(mobileAdminNavItems.map((i) => i.id));

function isBarNavActive(itemId: MobileAdminPage, activePage: MobileAdminPage): boolean {
  if (itemId === 'menu') {
    if (activePage === 'menu') return true;
    if (activePage === 'order-builder') return false;
    return !barPageIds.has(activePage);
  }
  if (itemId === 'orders' && activePage === 'order-builder') return true;
  return activePage === itemId;
}

export default function MobileLayout({ children, activePage, onNavigate, isOnline = true, isSyncing = false, pendingCount = 0 }: MobileLayoutProps) {
  const showStatus = !isOnline || isSyncing || pendingCount > 0;

  return (
    <div className="flex flex-col h-screen bg-slate-50 text-[#060b00] overflow-hidden">

      {showStatus && (
        <div className={`
            w-full px-4 py-2 flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-widest transition-colors duration-300 z-50 shadow-sm
            ${!isOnline ? 'bg-red-500 text-white' :
            isSyncing ? 'bg-blue-600 text-white' :
              'bg-amber-500 text-white'}`}
        >
          {!isOnline ? (
            <><WifiOff size={12} /> Χωρίς Σύνδεση – Τοπική Αποθήκευση</>
          ) : isSyncing ? (
            <><RefreshCw size={12} className="animate-spin" /> Συγχρονισμός Δεδομένων...</>
          ) : (
            <><CloudOff size={12} /> {pendingCount} Εκκρεμείς Αλλαγές</>
          )}
        </div>
      )}

      <main className="flex-1 overflow-y-auto pb-[calc(5rem+env(safe-area-inset-bottom,0px))] scroll-smooth overscroll-none">
        {children}
      </main>

      <nav
        className="fixed bottom-0 left-0 right-0 z-50 print:hidden border-t border-slate-200/90 bg-white/98 shadow-[0_-12px_44px_-16px_rgba(15,23,42,0.14)] backdrop-blur-xl"
        aria-label="Κύρια πλοήγηση"
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-200/40 to-transparent" />
        <div className="mx-auto flex max-w-2xl items-end justify-between gap-0.5 px-1.5 pt-2 pb-[max(0.4rem,env(safe-area-inset-bottom))]">
          {mobileAdminNavItems.map((item) => {
            const isActive = isBarNavActive(item.id, activePage);
            const isMenu = item.id === 'menu';
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={`
                  group flex min-w-0 flex-1 flex-col items-center justify-end gap-0.5 rounded-2xl py-1.5 px-0.5 transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-white
                  ${isActive
                    ? isMenu
                      ? 'bg-gradient-to-b from-slate-100 to-slate-50 text-slate-900 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.95),0_2px_10px_-2px_rgba(15,23,42,0.12)]'
                      : 'bg-gradient-to-b from-emerald-50 to-teal-50/95 text-emerald-900 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.95),0_3px_14px_-3px_rgba(16,185,129,0.28)]'
                    : 'text-slate-500 hover:bg-slate-50/90 active:scale-[0.96]'}
                `}
              >
                <span
                  className={`
                    flex h-7 w-7 items-center justify-center rounded-[10px] transition-all duration-200
                    ${isActive
                      ? isMenu
                        ? 'scale-105 text-slate-800'
                        : 'scale-105 text-emerald-700'
                      : 'text-slate-400 group-hover:text-slate-600'}
                  `}
                >
                  {renderNavIcon(item.icon, isMenu ? 19 : 20, isActive ? 2.5 : 2)}
                </span>
                <span
                  className={`w-full max-w-[3.6rem] truncate px-0.5 text-center text-[8px] font-bold leading-tight tracking-tight sm:text-[8.5px] ${isActive ? (isMenu ? 'text-slate-800' : 'text-emerald-900') : 'text-slate-500'}`}
                >
                  {item.label}
                </span>
                {isActive && (
                  <span
                    className={`mt-0.5 h-[3px] w-5 rounded-full ${isMenu ? 'bg-slate-400/80' : 'bg-emerald-500'}`}
                  />
                )}
              </button>
            );
          })}
        </div>
      </nav>

    </div>
  );
}
