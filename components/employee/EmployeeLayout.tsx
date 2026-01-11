
import React, { useState } from 'react';
import { 
  LayoutDashboard, 
  ShoppingCart, 
  Database, 
  Users, 
  LogOut, 
  Menu, 
  X,
  ChevronLeft,
  ChevronRight,
  Factory,
  FolderKanban,
  Package
} from 'lucide-react';
import { APP_LOGO, APP_ICON_ONLY } from '../../constants';
import { useAuth } from '../AuthContext';

interface Props {
  children?: React.ReactNode;
  activePage: string;
  onNavigate: (page: string) => void;
}

const NavItem = ({ icon, label, isActive, onClick, isCollapsed }: { icon: React.ReactNode, label: string, isActive: boolean, onClick: () => void, isCollapsed: boolean }) => (
  <button
    onClick={onClick}
    title={isCollapsed ? label : ''}
    className={`
      w-full flex items-center ${isCollapsed ? 'justify-center' : 'justify-start'} gap-3 px-4 py-3.5 my-0.5 rounded-xl transition-all duration-200 group relative
      ${isActive 
        ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/20' 
        : 'text-slate-400 hover:bg-white/10 hover:text-white'}
    `}
  >
    <div className={`${isActive ? 'text-white' : 'text-slate-400 group-hover:text-white transition-colors duration-200'}`}>
      {icon}
    </div>
    {!isCollapsed && <span className="font-medium truncate tracking-wide text-sm">{label}</span>}
  </button>
);

const MobileNavItem = ({ icon, label, isActive, onClick }: { icon: React.ReactNode, label: string, isActive: boolean, onClick: () => void }) => (
  <button
    onClick={onClick}
    className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${
      isActive ? 'text-emerald-600' : 'text-slate-400'
    }`}
  >
    <div className={`p-1 rounded-xl transition-all duration-300 ${isActive ? 'bg-emerald-50 scale-110' : ''}`}>
      {icon}
    </div>
    <span className="text-[10px] font-bold">{label}</span>
  </button>
);

export default function EmployeeLayout({ children, activePage, onNavigate }: Props) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { signOut, profile } = useAuth();

  const handleLogout = () => { 
      localStorage.removeItem('ILIOS_LOCAL_MODE'); 
      signOut(); 
  };

  return (
    <div className="flex h-screen overflow-hidden text-[#060b00] bg-slate-50 font-sans">
        
        {/* DESKTOP SIDEBAR (Hidden on Mobile) */}
        <aside className={`hidden md:flex flex-col fixed inset-y-0 left-0 z-40 bg-[#060b00] text-white transition-all duration-500 shadow-2xl ${isCollapsed ? 'w-20' : 'w-72'} border-r border-white/5`}>
          <div className={`p-6 flex items-center justify-center h-24 relative bg-black/20`}>
            {!isCollapsed ? <img src={APP_LOGO} alt="Ilios" className="h-16 w-auto object-contain drop-shadow-lg" /> : <img src={APP_ICON_ONLY} alt="Icon" className="w-10 h-10 object-contain" />}
          </div>
          
          <div className="px-4 py-4">
              <div className={`bg-emerald-900/30 border border-emerald-500/30 rounded-xl p-3 flex items-center gap-3 ${isCollapsed ? 'justify-center' : ''}`}>
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                  {!isCollapsed && (
                      <div className="flex flex-col">
                          <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Λειτουργία Καταστήματος</span>
                          <span className="text-xs font-bold text-white truncate">{profile?.full_name || 'Πωλητής'}</span>
                      </div>
                  )}
              </div>
          </div>

          <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto scrollbar-hide">
            <NavItem icon={<LayoutDashboard size={22} />} label="Πίνακας Ελέγχου" isActive={activePage === 'dashboard'} isCollapsed={isCollapsed} onClick={() => onNavigate('dashboard')} />
            <NavItem icon={<ShoppingCart size={22} />} label="Παραγγελίες" isActive={activePage === 'orders'} isCollapsed={isCollapsed} onClick={() => onNavigate('orders')} />
            <NavItem icon={<Factory size={22} />} label="Ροή Παραγωγής" isActive={activePage === 'production'} isCollapsed={isCollapsed} onClick={() => onNavigate('production')} />
            <div className="my-2 border-t border-white/10 mx-2"></div>
            <NavItem icon={<FolderKanban size={22} />} label="Συλλογές (Magazine)" isActive={activePage === 'collections'} isCollapsed={isCollapsed} onClick={() => onNavigate('collections')} />
            <NavItem icon={<Package size={22} />} label="Διαχείριση Αποθήκης" isActive={activePage === 'inventory'} isCollapsed={isCollapsed} onClick={() => onNavigate('inventory')} />
            <div className="my-2 border-t border-white/10 mx-2"></div>
            <NavItem icon={<Database size={22} />} label="Προϊόντα & Τιμές" isActive={activePage === 'registry'} isCollapsed={isCollapsed} onClick={() => onNavigate('registry')} />
            <NavItem icon={<Users size={22} />} label="Πελάτες" isActive={activePage === 'customers'} isCollapsed={isCollapsed} onClick={() => onNavigate('customers')} />
            
            <div className="mt-auto pt-6 border-t border-white/10 mt-6">
                <button onClick={handleLogout} className="w-full p-3 text-slate-400 hover:text-red-400 hover:bg-white/5 rounded-xl flex items-center gap-3 transition-colors">
                    <LogOut size={20} /> {!isCollapsed && <span className="font-medium text-sm">Αποσύνδεση</span>}
                </button>
            </div>
          </nav>

          <div className="p-4 bg-black/20">
            <button onClick={() => setIsCollapsed(!isCollapsed)} className="w-full flex items-center justify-center p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
                {isCollapsed ? <ChevronRight size={20} /> : <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider"><ChevronLeft size={16}/> <span>Σύμπτυξη</span></div>}
            </button>
          </div>
        </aside>

        {/* MOBILE HEADER */}
        <header className="md:hidden fixed top-0 left-0 right-0 bg-white/90 backdrop-blur-md p-4 shadow-sm flex items-center justify-between z-30 border-b border-slate-200 h-16">
            <div className="flex items-center gap-3">
                <img src={APP_ICON_ONLY} alt="Logo" className="w-8 h-8 object-contain" />
                <span className="font-black text-slate-800 text-lg">Ilios Store</span>
            </div>
            <button onClick={handleLogout} className="text-slate-400 hover:text-red-500">
                <LogOut size={20} />
            </button>
        </header>

        {/* MAIN CONTENT */}
        <main className={`flex-1 flex flex-col h-full overflow-hidden transition-all duration-500 md:ml-${isCollapsed ? '20' : '72'} pt-16 md:pt-0`}>
          <div className="flex-1 overflow-y-auto p-4 md:p-8 relative scroll-smooth bg-slate-50 pb-24 md:pb-8">
            <div className="max-w-[1600px] mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
                {children}
            </div>
          </div>
        </main>

        {/* MOBILE BOTTOM NAV */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-50 flex justify-around items-center h-20 pb-safe shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
            <MobileNavItem icon={<LayoutDashboard size={22} />} label="Αρχική" isActive={activePage === 'dashboard'} onClick={() => onNavigate('dashboard')} />
            <MobileNavItem icon={<ShoppingCart size={22} />} label="Παραγγελίες" isActive={activePage === 'orders'} onClick={() => onNavigate('orders')} />
            <MobileNavItem icon={<FolderKanban size={22} />} label="Συλλογές" isActive={activePage === 'collections'} onClick={() => onNavigate('collections')} />
            <MobileNavItem icon={<Package size={22} />} label="Αποθήκη" isActive={activePage === 'inventory'} onClick={() => onNavigate('inventory')} />
            <MobileNavItem icon={<Database size={22} />} label="Προϊόντα" isActive={activePage === 'registry'} onClick={() => onNavigate('registry')} />
        </nav>
    </div>
  );
}
