
import React, { useState } from 'react';
import { LogOut } from 'lucide-react';
import { APP_LOGO, APP_ICON_ONLY } from '../../constants';
import { useAuth } from '../AuthContext';
import { useDeliveryNavBadge } from '../../hooks/api/useOrderDeliveryPlans';
import { employeeDesktopNavSections, employeeMobileNavItems, renderNavIcon } from '../../surfaces/navConfig';
import type { EmployeePage } from '../../surfaces/pageIds';
import {
  SidebarCollapseButton,
  SidebarHoverTooltip,
  SidebarNavButton,
  SidebarOverlayScrim,
  SidebarSectionLabel,
  SidebarVersionMark,
  SIDEBAR_HIDDEN_SCROLL_CLASS,
  sidebarAsideClass,
  sidebarMainClass,
} from '../layout/SidebarChrome';
import { prefersCollapsedDesktopSidebar } from '../../features/layout/sidebarChrome';

interface Props {
  children?: React.ReactNode;
  activePage: EmployeePage;
  onNavigate: (page: EmployeePage) => void;
}

const MobileNavItem = ({ icon, label, isActive, onClick, badge }: { icon: React.ReactNode, label: string, isActive: boolean, onClick: () => void, badge?: number }) => (
  <button
    onClick={onClick}
    className={`relative flex flex-col items-center justify-center h-full space-y-1 min-w-[72px] px-1 ${
      isActive ? 'text-emerald-600' : 'text-slate-400'
    }`}
  >
    <div className={`p-1 rounded-xl transition-all duration-300 ${isActive ? 'bg-emerald-50 scale-110' : ''}`}>
      {icon}
    </div>
    <span className="text-[9px] font-bold truncate w-full text-center">{label}</span>
    {!!badge && badge > 0 && (
      <span className={`absolute top-1 right-3 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full text-[9px] font-black flex items-center justify-center ${isActive ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-white'}`}>
        {badge > 99 ? '99+' : badge}
      </span>
    )}
  </button>
);

export default function EmployeeLayout({ children, activePage, onNavigate }: Props) {
  const [isCollapsed, setIsCollapsed] = useState(() =>
    typeof window !== 'undefined' ? prefersCollapsedDesktopSidebar(window.innerWidth) : false
  );
  const { signOut, profile } = useAuth();
  const { badgeCount } = useDeliveryNavBadge();

  const handleLogout = () => { 
      localStorage.removeItem('ILIOS_LOCAL_MODE'); 
      signOut(); 
  };

  return (
    <div className="flex h-screen overflow-hidden text-[#060b00] bg-slate-50 font-sans">
        <SidebarOverlayScrim visible={!isCollapsed} onDismiss={() => setIsCollapsed(true)} />
        <aside className={`${sidebarAsideClass(isCollapsed)} hidden md:flex`}>
          <div className={`flex shrink-0 items-center border-b border-white/[0.06] ${isCollapsed ? 'h-14 flex-col justify-center px-1.5 py-2' : 'h-14 justify-between px-3'}`}>
            {!isCollapsed ? <img src={APP_LOGO} alt="Ilios" className="h-9 w-auto object-contain drop-shadow-lg" /> : <img src={APP_ICON_ONLY} alt="Ilios" className="h-8 w-8 object-contain" />}
            <div className={`flex min-w-0 items-center ${isCollapsed ? '' : 'gap-1.5'}`}>
              {!isCollapsed && (
                <span className="truncate text-xs font-medium text-slate-300">{profile?.full_name || 'Κατάστημα'}</span>
              )}
              <SidebarHoverTooltip label="Λειτουργία καταστήματος">
                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-emerald-300" aria-label="Λειτουργία καταστήματος">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                </span>
              </SidebarHoverTooltip>
            </div>
          </div>

          <nav className={`flex flex-1 flex-col px-1.5 py-1 ${SIDEBAR_HIDDEN_SCROLL_CLASS}`}>
            {employeeDesktopNavSections.map((section, sectionIndex) => (
              <div key={section.title}>
                <SidebarSectionLabel title={section.title} collapsed={isCollapsed} first={sectionIndex === 0} />
                {section.items.map((item) => (
                  <SidebarNavButton
                    key={item.id}
                    icon={renderNavIcon(item.icon, 18)}
                    label={item.label}
                    isActive={activePage === item.id}
                    isCollapsed={isCollapsed}
                    onClick={() => onNavigate(item.id)}
                    badge={item.id === 'deliveries' ? badgeCount : undefined}
                  />
                ))}
              </div>
            ))}
          </nav>

          <div className="shrink-0 border-t border-white/[0.06] px-1.5 py-2">
            <SidebarCollapseButton isCollapsed={isCollapsed} onToggle={() => setIsCollapsed((current) => !current)} />
            <SidebarHoverTooltip label="Αποσύνδεση">
              <button
                onClick={handleLogout}
                className={`mt-0.5 flex w-full items-center rounded-lg text-slate-400 transition-colors hover:bg-white/[0.05] hover:text-rose-300 ${isCollapsed ? 'h-9 justify-center' : 'h-9 gap-2.5 px-2.5'}`}
              >
                <LogOut size={16} /> {!isCollapsed && <span className="text-[13px] font-medium">Αποσύνδεση</span>}
              </button>
            </SidebarHoverTooltip>
            <div className="mt-2">
              <SidebarVersionMark compact={isCollapsed} />
            </div>
          </div>
        </aside>

        {/* MOBILE HEADER */}
        <header className="md:hidden fixed top-0 left-0 right-0 bg-white/90 backdrop-blur-md p-4 shadow-sm flex items-center justify-between z-30 border-b border-slate-200 h-16">
            <div className="flex items-center gap-3">
                <img src={APP_ICON_ONLY} alt="Logo" className="w-8 h-8 object-contain" />
                <span className="font-black text-slate-800 text-lg tracking-tight">ILIOS KOSMIMA</span>
            </div>
            <button onClick={handleLogout} className="text-slate-400 hover:text-red-500">
                <LogOut size={20} />
            </button>
        </header>

        {/* MAIN CONTENT */}
        <main className={`${sidebarMainClass(isCollapsed)} pt-16 md:pt-0`}>
          <div className="flex-1 overflow-y-auto p-4 md:p-8 relative scroll-smooth bg-slate-50 pb-24 md:pb-8">
            <div className="max-w-[1600px] mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
                {children}
            </div>
          </div>
        </main>

        {/* MOBILE BOTTOM NAV */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-50 h-20 pb-safe shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] overflow-x-auto scrollbar-hide">
            <div className="flex items-center h-full px-2 w-max mx-auto">
                {employeeMobileNavItems.map((item) => (
                  <MobileNavItem
                    key={item.id}
                    icon={renderNavIcon(item.icon, 22)}
                    label={item.label}
                    isActive={activePage === item.id}
                    onClick={() => onNavigate(item.id)}
                    badge={item.id === 'deliveries' ? badgeCount : undefined}
                  />
                ))}
            </div>
        </nav>
    </div>
  );
}
