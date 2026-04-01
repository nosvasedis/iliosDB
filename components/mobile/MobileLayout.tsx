
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

export default function MobileLayout({ children, activePage, onNavigate, isOnline = true, isSyncing = false, pendingCount = 0 }: MobileLayoutProps) {
  const showStatus = !isOnline || isSyncing || pendingCount > 0;

  return (
    <div className="flex flex-col h-screen bg-slate-50 text-[#060b00] overflow-hidden">

      {/* Smart Connectivity Status Bar */}
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

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto pb-24 scroll-smooth overscroll-none">
        {children}
      </main>

      {/* Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-xl border-t border-slate-200 pb-safe z-50 shadow-[0_-8px_30px_rgb(0,0,0,0.04)] print:hidden">
        <div className="flex justify-around items-center h-16 px-0.5">
          {mobileAdminNavItems.map((item) => {
            const isActive =
              activePage === item.id ||
              (item.id === 'menu' && !mobileAdminNavItems.some(ni => ni.id !== 'menu' && ni.id === activePage));
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`flex flex-col items-center justify-center w-full h-full relative transition-all duration-300 ${isActive ? 'text-emerald-600' : 'text-slate-400 hover:text-slate-500'}`}
              >
                <div className={`p-1.5 rounded-xl mb-0.5 transition-all duration-500 ${isActive ? 'bg-emerald-50 scale-110 shadow-sm shadow-emerald-100/50' : 'opacity-80'}`}>
                  {renderNavIcon(item.icon, 18, isActive ? 2.5 : 2)}
                </div>
                <span className={`text-[8.5px] font-bold truncate w-full text-center px-0.5 tracking-tight transition-all duration-300 ${isActive ? 'opacity-100' : 'opacity-70'}`}>
                  {item.label}
                </span>

                {/* Active Indicator Dot */}
                {isActive && (
                  <div className="absolute bottom-1 w-1 h-1 bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.6)] animate-in fade-in zoom-in duration-500" />
                )}
              </button>
            );
          })}
        </div>
      </nav>

    </div>
  );
}
