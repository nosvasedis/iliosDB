
import React from 'react';
import { LayoutDashboard, ShoppingCart, Factory, Package, Menu } from 'lucide-react';

interface MobileLayoutProps {
  children?: React.ReactNode;
  activePage: string;
  onNavigate: (page: string) => void;
}

export default function MobileLayout({ children, activePage, onNavigate }: MobileLayoutProps) {
  const navItems = [
    { id: 'dashboard', icon: <LayoutDashboard size={20} />, label: 'Αρχική' },
    { id: 'orders', icon: <ShoppingCart size={20} />, label: 'Εντολές' },
    { id: 'production', icon: <Factory size={20} />, label: 'Παραγωγή' },
    { id: 'inventory', icon: <Package size={20} />, label: 'Αποθήκη' },
    { id: 'menu', icon: <Menu size={20} />, label: 'Μενού' },
  ];

  return (
    <div className="flex flex-col h-screen bg-slate-50 text-[#060b00] overflow-hidden">
      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto pb-24 scroll-smooth overscroll-none">
        {children}
      </main>

      {/* Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-lg border-t border-slate-200 pb-safe z-50 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] print:hidden">
        <div className="flex justify-around items-center h-16">
          {navItems.map((item) => {
            const isActive = activePage === item.id || (item.id === 'menu' && !['dashboard', 'orders', 'production', 'inventory'].includes(activePage));
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${
                  isActive ? 'text-emerald-600' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <div className={`p-1 rounded-xl transition-all duration-300 ${isActive ? 'bg-emerald-50 scale-110' : ''}`}>
                  {item.icon}
                </div>
                <span className="text-[10px] font-bold">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
