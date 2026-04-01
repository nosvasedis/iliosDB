
import React from 'react';
import { LogOut, Package, CloudOff, RefreshCw, Upload } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { APP_ICON_ONLY } from '../../constants';
import { useOfflineSync } from '../../hooks/useOfflineSync';
import { sellerNavItems } from '../../surfaces/navConfig';
import type { SellerPage } from '../../surfaces/pageIds';

interface Props {
  children?: React.ReactNode;
  activePage: SellerPage;
  onNavigate: (page: SellerPage) => void;
}

// ─── Portrait Bottom NavItem ──────────────────────────────────────────────────
const BottomNavItem = ({
  icon: Icon, label, isActive, onClick,
}: {
  icon: React.ElementType; label: string; isActive: boolean; onClick: () => void;
}) => (
  <button
    onClick={onClick}
    className={`flex flex-col items-center justify-center h-full space-y-1 min-w-[72px] px-1 transition-colors ${isActive ? 'text-[#060b00]' : 'text-slate-400'
      }`}
  >
    <div className={`p-1.5 rounded-xl transition-all duration-300 ${isActive ? 'bg-amber-100 scale-110 shadow-sm shadow-amber-200/60' : ''
      }`}>
      <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
    </div>
    <span className={`text-[9px] font-bold truncate w-full text-center ${isActive ? 'text-[#060b00]' : 'text-slate-400'}`}>
      {label}
    </span>
  </button>
);

// ─── Landscape Sidebar NavItem ────────────────────────────────────────────────
const SideNavItem = ({
  icon: Icon, label, isActive, onClick,
}: {
  icon: React.ElementType; label: string; isActive: boolean; onClick: () => void;
}) => (
  <button
    onClick={onClick}
    className={`w-full flex flex-col items-center justify-center py-3 px-1 rounded-2xl transition-all duration-300 gap-1 ${isActive
      ? 'bg-amber-100 text-[#060b00] shadow-sm'
      : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'
      }`}
  >
    <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
    <span className={`text-[8px] font-bold leading-none text-center w-full truncate ${isActive ? 'text-[#060b00]' : 'text-slate-400'}`}>
      {label}
    </span>
  </button>
);

export default function SellerLayout({ children, activePage, onNavigate }: Props) {
  const { signOut } = useAuth();
  const { isOnline, pendingCount, syncStatus, triggerSync } = useOfflineSync();

  return (
    <div className="flex flex-col h-screen bg-slate-50 text-[#060b00] overflow-hidden
                    landscape:flex-row">

      {/* ── LANDSCAPE: Left Sidebar ───────────────────────────────────── */}
      <aside className="hidden landscape:flex landscape:flex-col landscape:w-[72px] landscape:h-screen
                        landscape:bg-white landscape:border-r landscape:border-slate-200
                        landscape:shadow-[2px_0_8px_rgba(0,0,0,0.04)] landscape:z-40 landscape:shrink-0">

        {/* Logo */}
        <div className="flex items-center justify-center py-4 px-2 border-b border-slate-100">
          <div className="w-10 h-10 bg-[#060b00] rounded-full flex items-center justify-center shadow-lg border-2 border-amber-400 overflow-hidden">
            <img src={APP_ICON_ONLY} alt="Logo" className="w-6 h-6 object-contain" />
          </div>
        </div>

        {/* Nav items */}
        <div className="flex flex-col gap-1 p-2">
          {sellerNavItems.map(item => (
            <SideNavItem
              key={item.id}
              icon={item.icon}
              label={item.label}
              isActive={activePage === item.id}
              onClick={() => onNavigate(item.id)}
            />
          ))}
        </div>

        {/* New Order FAB */}
        <div className="p-2">
          <button
            onClick={() => onNavigate('order-builder')}
            className="w-full flex flex-col items-center justify-center py-3 bg-[#060b00] rounded-2xl text-amber-400 shadow-lg active:scale-95 transition-transform gap-1"
          >
            <Package size={20} />
            <span className="text-[7px] font-black text-amber-400 leading-none">Νέα</span>
          </button>
        </div>

        {/* Sign out - pushed to bottom */}
        <div className="p-2 border-t border-slate-100 mt-auto mb-1">
          <button
            onClick={() => signOut()}
            className="w-full flex items-center justify-center py-2 text-slate-300 hover:text-red-400 transition-colors rounded-xl hover:bg-red-50"
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      {/* ── PORTRAIT: Top Header ──────────────────────────────────────── */}
      <header className="landscape:hidden bg-white border-b border-slate-200 px-4 flex justify-between items-center
                         shadow-sm z-30 shrink-0 relative h-16"
        style={{ background: 'linear-gradient(135deg, #ffffff 60%, #fffdf5 100%)' }}
      >
        <div className="font-black text-base text-[#060b00] tracking-tight w-1/3 leading-tight">
          <div>ILIOS</div>
          <div className="text-[9px] font-bold text-amber-500 tracking-widest -mt-0.5">KOSMIMA</div>
        </div>

        {/* Centered Logo */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="w-10 h-10 bg-[#060b00] rounded-full flex items-center justify-center shadow-lg border-2 border-amber-400 overflow-hidden">
            <img src={APP_ICON_ONLY} alt="Logo" className="w-6 h-6 object-contain" />
          </div>
        </div>

        <div className="w-1/3 flex justify-end">
          <button onClick={() => signOut()} className="text-slate-300 hover:text-red-400 transition-colors p-2">
            <LogOut size={20} />
          </button>
        </div>
      </header>

      {/* ── Main Content ─────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto pb-24 scroll-smooth overscroll-none relative bg-slate-50
                       landscape:pb-4 flex flex-col">
        {/* Offline / Sync Banner */}
        {(!isOnline || pendingCount > 0) && (
          <div className={`shrink-0 flex items-center justify-between px-4 py-2 text-xs font-bold text-white shadow-md z-40 transition-colors
            ${!isOnline ? 'bg-red-500' : syncStatus === 'error' ? 'bg-rose-600' : 'bg-amber-500'}
          `}>
            <div className="flex items-center gap-2">
              {!isOnline ? <CloudOff size={14} /> : syncStatus === 'syncing' ? <RefreshCw size={14} className="animate-spin" /> : <Upload size={14} />}
              <span>
                {!isOnline ? 'Είστε εκτός σύνδεσης' : syncStatus === 'syncing' ? 'Συγχρονισμός...' : syncStatus === 'error' ? 'Σφάλμα συγχρονισμού' : `Εκκρεμούν ${pendingCount} αλλαγές`}
              </span>
            </div>
            {isOnline && syncStatus !== 'syncing' && (
              <button
                onClick={triggerSync}
                className="px-3 py-1 bg-white/20 hover:bg-white/30 rounded-full active:scale-95 transition-all text-[10px] uppercase tracking-wider"
              >
                Συγχρονισμος
              </button>
            )}
          </div>
        )}

        <div className="flex-1 relative">
          {children}
        </div>
      </main>

      {/* ── PORTRAIT: Bottom Navigation Bar ──────────────────────────── */}
      <nav className="landscape:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-lg border-t border-slate-200
                      pb-safe z-50 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] h-20">
        <div className="flex justify-around items-center h-full px-2">
          {sellerNavItems.map(item => (
            <BottomNavItem
              key={item.id}
              icon={item.icon}
              label={item.label}
              isActive={activePage === item.id}
              onClick={() => onNavigate(item.id)}
            />
          ))}

          {/* Center FAB */}
          <div className="relative -top-6 order-2">
            <button
              onClick={() => onNavigate('order-builder')}
              className="w-14 h-14 bg-[#060b00] rounded-full text-white shadow-xl shadow-slate-900/30 flex items-center justify-center active:scale-95 transition-transform border-4 border-slate-50"
            >
              <Package size={24} className="text-amber-400" />
            </button>
          </div>
        </div>
      </nav>
    </div>
  );
}
