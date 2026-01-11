
import React from 'react';
import { 
  Settings, 
  Users, 
  Database, 
  LogOut, 
  ChevronRight, 
  Layers, 
  DollarSign, 
  ScanBarcode, 
  Sparkles,
  FolderKanban,
  ScrollText
} from 'lucide-react';
import { APP_LOGO } from '../../constants';
import { useAuth } from '../AuthContext';

interface Props {
  onNavigate: (page: string) => void;
  activePage: string;
}

export default function MobileMenu({ onNavigate, activePage }: Props) {
  const { signOut, profile } = useAuth();

  const handleLogout = () => {
    localStorage.removeItem('ILIOS_LOCAL_MODE');
    signOut();
  };

  const menuItems = [
    { id: 'ai-studio', label: 'AI Studio', icon: Sparkles, color: 'text-purple-500', bg: 'bg-purple-50' },
    { id: 'registry', label: 'Μητρώο Κωδικών', icon: Database, color: 'text-blue-500', bg: 'bg-blue-50' },
    { id: 'collections', label: 'Συλλογές', icon: FolderKanban, color: 'text-pink-500', bg: 'bg-pink-50' },
    { id: 'pricelist', label: 'Τιμοκατάλογος', icon: ScrollText, color: 'text-teal-500', bg: 'bg-teal-50' },
    { id: 'customers', label: 'Πελάτες & Προμ.', icon: Users, color: 'text-orange-500', bg: 'bg-orange-50' },
    { id: 'resources', label: 'Υλικά & Λάστιχα', icon: Layers, color: 'text-indigo-500', bg: 'bg-indigo-50' },
    { id: 'pricing', label: 'Τιμολόγηση', icon: DollarSign, color: 'text-emerald-500', bg: 'bg-emerald-50' },
    { id: 'batch-print', label: 'Εκτυπώσεις', icon: ScanBarcode, color: 'text-slate-500', bg: 'bg-slate-50' },
    { id: 'settings', label: 'Ρυθμίσεις', icon: Settings, color: 'text-slate-600', bg: 'bg-slate-100' },
  ];

  return (
    <div className="p-6 animate-in slide-in-from-bottom-10 duration-300">
      <div className="flex items-center gap-4 mb-8">
        <div className="w-16 h-16 bg-white rounded-full shadow-lg p-2 flex items-center justify-center">
            <img src={APP_LOGO} alt="Ilios" className="w-full h-full object-contain"/>
        </div>
        <div>
            <h2 className="text-xl font-black text-slate-900">{profile?.full_name || 'Χρήστης'}</h2>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Ilios Kosmima ERP</p>
        </div>
      </div>

      <div className="grid gap-3">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`flex items-center justify-between p-4 rounded-2xl border transition-all active:scale-[0.98] ${activePage === item.id ? 'bg-slate-900 text-white border-slate-900 shadow-lg' : 'bg-white border-slate-100 text-slate-700 shadow-sm'}`}
          >
            <div className="flex items-center gap-4">
              <div className={`p-2.5 rounded-xl ${activePage === item.id ? 'bg-white/20 text-white' : `${item.bg} ${item.color}`}`}>
                <item.icon size={20} />
              </div>
              <span className="font-bold text-sm">{item.label}</span>
            </div>
            <ChevronRight size={18} className={activePage === item.id ? 'text-white/50' : 'text-slate-300'} />
          </button>
        ))}
      </div>

      <div className="mt-8 pt-8 border-t border-slate-100">
        <button 
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 p-4 rounded-2xl bg-red-50 text-red-600 font-bold text-sm hover:bg-red-100 transition-colors"
        >
            <LogOut size={18} /> Αποσύνδεση
        </button>
        <p className="text-center text-[10px] text-slate-300 mt-4 font-mono">v1.2.0-mobile</p>
      </div>
    </div>
  );
}
