
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
  ScrollText,
  FileBadge,
  Globe,
  CalendarRange,
  LayoutDashboard,
  Package,
  ShoppingCart,
  Factory,
  Menu,
  BarChart3,
  UserCheck,
  type LucideIcon,
} from 'lucide-react';
import { APP_LOGO } from '../../constants';
import { useAuth } from '../AuthContext';
import { useDeliveryNavBadge } from '../../hooks/api/useOrderDeliveryPlans';
import MobileScreenHeader from './MobileScreenHeader';

interface Props {
  onNavigate: (page: string) => void;
  activePage: string;
}

type MenuItem = {
  id: string;
  label: string;
  description?: string;
  icon: LucideIcon;
  color: string;
  bg: string;
  badge?: number;
};

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <div className="mb-3 px-0.5">
        <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">{title}</h3>
        {subtitle && <p className="mt-1 text-xs font-medium text-slate-500">{subtitle}</p>}
      </div>
      <div className="grid grid-cols-2 gap-2.5">{children}</div>
    </section>
  );
}

function MenuTile({
  item,
  activePage,
  onNavigate,
  large,
}: {
  item: MenuItem;
  activePage: string;
  onNavigate: (id: string) => void;
  large?: boolean;
}) {
  const active = activePage === item.id;
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={() => onNavigate(item.id)}
      className={`group relative flex flex-col items-start rounded-2xl border p-4 text-left transition-all active:scale-[0.98] ${
        large ? 'min-h-[5.5rem]' : 'min-h-[4.75rem]'
      } ${
        active
          ? 'border-emerald-500/40 bg-gradient-to-br from-emerald-600 to-teal-700 text-white shadow-lg shadow-emerald-900/20'
          : 'border-slate-100 bg-white text-slate-800 shadow-sm hover:border-slate-200 hover:shadow-md'
      }`}
    >
      <div className="mb-3 flex w-full items-start justify-between gap-2">
        <div
          className={`rounded-xl p-2.5 ${active ? 'bg-white/20 text-white' : `${item.bg} ${item.color}`}`}
        >
          <Icon size={22} strokeWidth={2} />
        </div>
        {'badge' in item && item.badge != null && item.badge > 0 && (
          <span
            className={`min-w-[1.35rem] rounded-full px-1.5 py-0.5 text-center text-[10px] font-black ${
              active ? 'bg-white/25 text-white' : 'bg-amber-500 text-white'
            }`}
          >
            {item.badge > 99 ? '99+' : item.badge}
          </span>
        )}
      </div>
      <span className={`text-sm font-black leading-tight ${active ? 'text-white' : 'text-slate-900'}`}>{item.label}</span>
      {item.description && (
        <span className={`mt-1 line-clamp-2 text-[11px] font-medium leading-snug ${active ? 'text-white/80' : 'text-slate-500'}`}>
          {item.description}
        </span>
      )}
      <ChevronRight
        size={16}
        className={`absolute bottom-3 right-3 opacity-0 transition-opacity group-hover:opacity-100 ${active ? 'text-white/60' : 'text-slate-300'}`}
      />
    </button>
  );
}

function MenuRow({
  item,
  activePage,
  onNavigate,
}: {
  item: MenuItem;
  activePage: string;
  onNavigate: (id: string) => void;
}) {
  const active = activePage === item.id;
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={() => onNavigate(item.id)}
      className={`flex w-full items-center justify-between rounded-2xl border p-4 text-left transition-all active:scale-[0.99] ${
        active ? 'border-slate-800 bg-slate-900 text-white shadow-lg' : 'border-slate-100 bg-white text-slate-800 shadow-sm hover:border-slate-200'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className={`rounded-xl p-2.5 ${active ? 'bg-white/15 text-white' : `${item.bg} ${item.color}`}`}>
          <Icon size={20} strokeWidth={2} />
        </div>
        <span className="font-bold text-sm">{item.label}</span>
      </div>
      <div className="flex items-center gap-2">
        {'badge' in item && item.badge != null && item.badge > 0 && (
          <span className={`min-w-[1.35rem] rounded-full px-1.5 py-0.5 text-center text-[10px] font-black ${active ? 'bg-white/20 text-white' : 'bg-amber-500 text-white'}`}>
            {item.badge > 99 ? '99+' : item.badge}
          </span>
        )}
        <ChevronRight size={18} className={active ? 'text-white/40' : 'text-slate-300'} />
      </div>
    </button>
  );
}

export default function MobileMenu({ onNavigate, activePage }: Props) {
  const { signOut, profile } = useAuth();
  const { badgeCount } = useDeliveryNavBadge();

  const handleLogout = () => {
    localStorage.removeItem('ILIOS_LOCAL_MODE');
    signOut();
  };

  const barShortcuts: MenuItem[] = [
    { id: 'dashboard', label: 'Αρχική', description: 'Πίνακας ελέγχου', icon: LayoutDashboard, color: 'text-slate-700', bg: 'bg-slate-100' },
    { id: 'registry', label: 'Μητρώο', description: 'Κωδικοί & κατάλογος', icon: Database, color: 'text-blue-600', bg: 'bg-blue-50' },
    { id: 'production', label: 'Παραγωγή', description: 'Ροή κατασκευής', icon: Factory, color: 'text-orange-600', bg: 'bg-orange-50' },
    { id: 'orders', label: 'Παραγγελίες', description: 'Πωλήσεις', icon: ShoppingCart, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { id: 'customers', label: 'Πελάτες', description: 'Πελάτες & προμηθευτές', icon: Users, color: 'text-cyan-600', bg: 'bg-cyan-50' },
    { id: 'menu', label: 'Μενού', description: 'Όλες οι σελίδες', icon: Menu, color: 'text-slate-600', bg: 'bg-slate-100' },
  ];

  const startStock: MenuItem[] = [
    { id: 'inventory', label: 'Αποθήκη', description: 'Στοκ & προϊόντα', icon: Package, color: 'text-violet-600', bg: 'bg-violet-50' },
  ];

  const storeOps: MenuItem[] = [
    { id: 'deliveries', label: 'Ημερολόγιο', description: 'Παραδόσεις & πλάνα', icon: CalendarRange, color: 'text-emerald-700', bg: 'bg-emerald-50', badge: badgeCount },
    { id: 'offers', label: 'Προσφορές', description: 'Προσφορές πελατών', icon: FileBadge, color: 'text-amber-600', bg: 'bg-amber-50' },
    { id: 'suppliers', label: 'Προμηθευτές', description: 'Εντολές αγοράς', icon: Globe, color: 'text-purple-600', bg: 'bg-purple-50' },
    { id: 'collections', label: 'Συλλογές', description: 'Οργάνωση καταλόγου', icon: FolderKanban, color: 'text-pink-600', bg: 'bg-pink-50' },
    { id: 'sellers', label: 'Πλασιέ', description: 'Διαχείριση πωλητών', icon: UserCheck, color: 'text-sky-600', bg: 'bg-sky-50' },
  ];

  const catalogPricing: MenuItem[] = [
    { id: 'pricelist', label: 'Τιμοκατάλογος', description: 'Εκτύπωση τιμών', icon: ScrollText, color: 'text-teal-600', bg: 'bg-teal-50' },
    { id: 'resources', label: 'Υλικά & λάστιχα', description: 'Α’ ύλες', icon: Layers, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { id: 'pricing', label: 'Τιμολόγηση', description: 'Κανόνες τιμών', icon: DollarSign, color: 'text-lime-700', bg: 'bg-lime-50' },
    { id: 'batch-print', label: 'Μαζική εκτύπωση', description: 'Barcode & ετικέτες', icon: ScanBarcode, color: 'text-slate-600', bg: 'bg-slate-100' },
  ];

  const toolsAccount: MenuItem[] = [
    { id: 'analytics', label: 'Ανάλυση', description: 'Οικονομικά στοιχεία και τάσεις', icon: BarChart3, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { id: 'ai-studio', label: 'AI Studio', description: 'Βοηθός & εργαλεία', icon: Sparkles, color: 'text-purple-600', bg: 'bg-purple-50' },
    { id: 'settings', label: 'Ρυθμίσεις', description: 'Λογαριασμός & εφαρμογή', icon: Settings, color: 'text-slate-600', bg: 'bg-slate-100' },
  ];

  return (
    <div className="min-h-full animate-in bg-gradient-to-b from-slate-50 to-slate-100/80 pb-28 duration-300 slide-in-from-bottom-4">
      <MobileScreenHeader icon={Menu} title="Μενού" subtitle="Όλες οι λειτουργίες" iconClassName="text-slate-700" />

      <div className="px-4 pt-4">
      <header className="mb-8 flex items-center gap-4 rounded-3xl border border-white/80 bg-white/90 p-5 shadow-sm backdrop-blur-sm">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white p-2 shadow-inner ring-1 ring-slate-100">
          <img src={APP_LOGO} alt="Ilios" className="h-full w-full object-contain" />
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-lg font-black text-slate-900">{profile?.full_name || 'Χρήστης'}</h2>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Ilios Kosmima · πλήρες μενού</p>
        </div>
      </header>

      <Section title="Κάτω μπάρα" subtitle="Οι έξι συντομεύσεις της μπάρας — διαθέσιμες και εδώ.">
        {barShortcuts.map((item) => (
          <MenuTile key={item.id} item={item} activePage={activePage} onNavigate={onNavigate} />
        ))}
      </Section>

      <Section title="Αποθήκη">
        <div className="col-span-2">
          {startStock.map((item) => (
            <MenuTile key={item.id} item={item} activePage={activePage} onNavigate={onNavigate} large />
          ))}
        </div>
      </Section>

      <Section title="Κατάστημα & ροή">
        {storeOps.map((item) => (
          <MenuTile key={item.id} item={item} activePage={activePage} onNavigate={onNavigate} large />
        ))}
      </Section>

      <Section title="Τιμές & υλικά">
        {catalogPricing.map((item) => (
          <MenuTile key={item.id} item={item} activePage={activePage} onNavigate={onNavigate} />
        ))}
      </Section>

      <section className="mb-8 space-y-2.5">
        <div className="mb-3 px-0.5">
          <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Εργαλεία & λογαριασμός</h3>
        </div>
        {toolsAccount.map((item) => (
          <MenuRow key={item.id} item={item} activePage={activePage} onNavigate={onNavigate} />
        ))}
      </section>

      <div className="mt-10 space-y-3 border-t border-slate-200/80 pt-8">
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-red-50 py-4 text-sm font-bold text-red-600 transition-colors hover:bg-red-100"
        >
          <LogOut size={18} /> Αποσύνδεση
        </button>
        <p className="text-center text-[10px] font-mono text-slate-300">v1.2.1-mobile</p>
      </div>
      </div>
    </div>
  );
}
