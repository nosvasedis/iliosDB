
import React from 'react';
import { LayoutDashboard, ShoppingCart, BookOpen, Users, LogOut, Package, FolderKanban } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { APP_ICON_ONLY } from '../../constants';

interface Props {
  children?: React.ReactNode;
  activePage: string;
  onNavigate: (page: string) => void;
}

const NavItem = ({ icon, label, isActive, onClick }: { icon: React.ReactNode, label: string, isActive: boolean, onClick: () => void }) => (
  <button
    onClick={onClick}
    className={`flex flex-col items-center justify-center h-full space-y-1 min-w-[72px] px-1 ${
      isActive ? 'text-[#060b00]' : 'text-slate-400'
    }`}
  >
    <div className={`p-1.5 rounded-xl transition-all duration-300 ${isActive ? 'bg-amber-100 scale-110 shadow-sm' : ''}`}>
      {icon}
    </div>
    <span className={`text-[9px] font-bold truncate w-full text-center ${isActive ? 'text-[#060b00]' : 'text-slate-400'}`}>{label}</span>
  </button>
);

export default function SellerLayout({ children, activePage, onNavigate }: Props) {
  const { signOut } = useAuth();

  return (
    <div className="flex flex-col h-screen bg-slate-50 text-[#060b00] overflow-hidden">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex justify-between items-center shadow-sm z-30 shrink-0 relative h-16">
          <div className="font-black text-lg text-[#060b00] tracking-tight w-1/3">ILIOS KOSMIMA</div>
          
          {/* Centered Logo Button */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <div className="w-10 h-10 bg-[#060b00] rounded-full flex items-center justify-center shadow-lg border-2 border-amber-400 overflow-hidden">
                  <img src={APP_ICON_ONLY} alt="Logo" className="w-6 h-6 object-contain" />
              </div>
          </div>

          <div className="w-1/3 flex justify-end">
              <button onClick={() => signOut()} className="text-slate-400 hover:text-red-500 transition-colors p-2">
                  <LogOut size={20}/>
              </button>
          </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto pb-24 scroll-smooth overscroll-none relative bg-slate-50">
        {children}
      </main>

      {/* Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-lg border-t border-slate-200 pb-safe z-50 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] h-20">
        <div className="flex justify-around items-center h-full px-2">
            <NavItem icon={<LayoutDashboard size={24} />} label="Αρχική" isActive={activePage === 'dashboard'} onClick={() => onNavigate('dashboard')} />
            <NavItem icon={<BookOpen size={24} />} label="Κατάλογος" isActive={activePage === 'catalog'} onClick={() => onNavigate('catalog')} />
            
            <div className="relative -top-6">
                <button 
                    onClick={() => onNavigate('order-builder')}
                    className="w-14 h-14 bg-[#060b00] rounded-full text-white shadow-lg shadow-emerald-900/20 flex items-center justify-center active:scale-95 transition-transform border-4 border-slate-50"
                >
                    <Package size={24} className="text-amber-400" />
                </button>
            </div>
            
            <NavItem icon={<FolderKanban size={24} />} label="Συλλογές" isActive={activePage === 'collections'} onClick={() => onNavigate('collections')} />
            <NavItem icon={<ShoppingCart size={24} />} label="Εντολές" isActive={activePage === 'orders'} onClick={() => onNavigate('orders')} />
        </div>
      </nav>
    </div>
  );
}
