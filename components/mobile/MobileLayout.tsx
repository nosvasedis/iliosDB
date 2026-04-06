
import React, { useEffect, useRef } from 'react';
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
  const activeBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    activeBtnRef.current?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [activePage]);

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

      <main className="flex-1 overflow-y-auto pb-[calc(5.25rem+env(safe-area-inset-bottom,0px))] scroll-smooth overscroll-none">
        {children}
      </main>

      <nav
        className="fixed bottom-0 left-0 right-0 z-50 print:hidden border-t border-slate-200/80 bg-white/90 backdrop-blur-2xl shadow-[0_-12px_40px_-12px_rgba(15,23,42,0.12)]"
        aria-label="Κύρια πλοήγηση"
      >
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-6 bg-gradient-to-r from-white via-white/95 to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-6 bg-gradient-to-l from-white via-white/95 to-transparent" />

        <div
          className="flex overflow-x-auto overflow-y-hidden gap-1.5 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden snap-x snap-mandatory"
        >
          {mobileAdminNavItems.map((item) => {
            const isActive = isBarNavActive(item.id, activePage);
            return (
              <button
                key={item.id}
                ref={isActive ? activeBtnRef : undefined}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={`
                  flex shrink-0 snap-center flex-col items-center justify-center gap-0.5 rounded-2xl px-3 py-2 min-w-[4.25rem] max-w-[5.5rem] transition-all duration-300 outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/80 focus-visible:ring-offset-2
                  ${isActive
                    ? 'bg-gradient-to-b from-emerald-50 to-teal-50/90 text-emerald-800 shadow-[0_4px_14px_-4px_rgba(16,185,129,0.35)] ring-1 ring-emerald-200/70'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50/90 active:scale-[0.97]'}
                `}
              >
                <span
                  className={`
                    flex h-9 w-9 items-center justify-center rounded-xl transition-transform duration-300
                    ${isActive ? 'scale-105 text-emerald-700' : 'text-slate-400'}
                  `}
                >
                  {renderNavIcon(item.icon, 20, isActive ? 2.5 : 2)}
                </span>
                <span
                  className={`text-[9px] font-bold leading-tight text-center tracking-tight line-clamp-2 w-full ${isActive ? 'text-emerald-900' : 'text-slate-500'}`}
                >
                  {item.label}
                </span>
                {isActive && (
                  <span className="h-1 w-1 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.7)]" />
                )}
              </button>
            );
          })}
        </div>
      </nav>

    </div>
  );
}
