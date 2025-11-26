import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  PackagePlus, 
  Warehouse, 
  DollarSign, 
  Settings as SettingsIcon,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Gem,
  MapPin,
  FolderKanban
} from 'lucide-react';
import { APP_LOGO, APP_ICON_ONLY } from './constants';
import { api } from './lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Product, ProductVariant } from './types';

// Pages
import Dashboard from './components/Dashboard';
import Inventory from './components/Inventory';
import NewProduct from './components/NewProduct';
import PricingManager from './components/PricingManager';
import SettingsPage from './components/SettingsPage';
import MaterialsPage from './components/MaterialsPage';
import MoldsPage from './components/MoldsPage';
import CollectionsPage from './components/CollectionsPage';
import BarcodeView from './components/BarcodeView';

type Page = 'dashboard' | 'inventory' | 'new-product' | 'pricing' | 'settings' | 'materials' | 'molds' | 'collections';

export default function App() {
  const [activePage, setActivePage] = useState<Page>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [printItems, setPrintItems] = useState<{product: Product, variant?: ProductVariant}[]>([]);
  const queryClient = useQueryClient();

  // --- React Query Data Fetching ---
  const { data: settings, isLoading: loadingSettings } = useQuery({ queryKey: ['settings'], queryFn: api.getSettings });
  const { data: materials, isLoading: loadingMaterials } = useQuery({ queryKey: ['materials'], queryFn: api.getMaterials });
  const { data: molds, isLoading: loadingMolds } = useQuery({ queryKey: ['molds'], queryFn: api.getMolds });
  const { data: products, isLoading: loadingProducts } = useQuery({ queryKey: ['products'], queryFn: api.getProducts });
  const { data: collections, isLoading: loadingCollections } = useQuery({ queryKey: ['collections'], queryFn: api.getCollections });


  const isLoading = loadingSettings || loadingMaterials || loadingMolds || loadingProducts || loadingCollections;

  // Print effect
  useEffect(() => {
    if (printItems.length > 0) {
      // Allow react to render the print view before dialog opens
      const timer = setTimeout(() => {
        window.print();
        setPrintItems([]);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [printItems]);

  const handleNav = (page: Page) => {
    setActivePage(page);
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
  };

  if (isLoading) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-50 text-slate-500">
        <Loader2 size={48} className="animate-spin mb-4 text-amber-500" />
        <p className="font-medium">Φόρτωση Δεδομένων...</p>
      </div>
    );
  }

  // Safe fallback
  if (!settings || !products || !materials || !molds || !collections) return null;

  return (
    <div className="flex h-screen overflow-hidden text-slate-800 bg-slate-100">
      
      {/* Print View (Hidden by default) */}
      <div className="print-view">
        <div className="print-area">
          {printItems.map((item, index) => (
            <BarcodeView 
              key={index} 
              product={item.product} 
              variant={item.variant}
              width={settings.barcode_width_mm}
              height={settings.barcode_height_mm}
            />
          ))}
        </div>
      </div>
      
      {/* Mobile Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside 
        className={`
          fixed inset-y-0 left-0 z-40 bg-slate-900 text-white transition-all duration-300 ease-in-out shadow-xl flex flex-col
          ${isSidebarOpen ? 'translate-x-0 w-64' : '-translate-x-full md:translate-x-0'}
          ${isCollapsed ? 'md:w-20' : 'md:w-64'}
        `}
      >
        <div className={`p-4 flex items-center ${isCollapsed ? 'justify-center' : 'justify-center'} border-b border-slate-700 h-24 relative`}>
          {!isCollapsed ? (
            <div className="flex items-center justify-center w-full px-2 h-full">
              <img 
                src={APP_LOGO} 
                alt="Ilios Kosmima" 
                className="h-14 w-auto object-contain" 
                onError={(e) => {
                  const target = e.currentTarget;
                  target.style.display = 'none';
                  const parent = target.parentElement;
                  if (parent && !parent.querySelector('.app-title')) {
                     const title = document.createElement('div');
                     title.className = 'app-title text-white font-bold text-center';
                     title.innerText = 'ILIOS KOSMIMA';
                     parent.appendChild(title);
                  }
                }}
              />
            </div>
          ) : (
            <div className="w-10 h-10 flex items-center justify-center">
               <img src={APP_ICON_ONLY} alt="Icon" className="w-full h-full object-contain" />
            </div>
          )}
          
          <button onClick={() => setIsSidebarOpen(false)} className="md:hidden text-slate-400 hover:text-white absolute right-4 top-4">
            <X size={24} />
          </button>
        </div>

        <nav className="flex-1 py-6 px-2 space-y-2 overflow-y-auto overflow-x-hidden">
          <NavItem 
            icon={<LayoutDashboard size={22} />} 
            label="Πίνακας Ελέγχου" 
            isActive={activePage === 'dashboard'} 
            isCollapsed={isCollapsed}
            onClick={() => handleNav('dashboard')} 
          />
          <NavItem 
            icon={<Warehouse size={22} />} 
            label="Αποθήκη / Προϊόντα" 
            isActive={activePage === 'inventory'} 
            isCollapsed={isCollapsed}
            onClick={() => handleNav('inventory')} 
          />
          <NavItem 
            icon={<Gem size={22} />} 
            label="Υλικά" 
            isActive={activePage === 'materials'} 
            isCollapsed={isCollapsed}
            onClick={() => handleNav('materials')} 
          />
          <NavItem 
            icon={<MapPin size={22} />} 
            label="Λάστιχα" 
            isActive={activePage === 'molds'} 
            isCollapsed={isCollapsed}
            onClick={() => handleNav('molds')} 
          />
           <NavItem 
            icon={<FolderKanban size={22} />} 
            label="Συλλογές" 
            isActive={activePage === 'collections'} 
            isCollapsed={isCollapsed}
            onClick={() => handleNav('collections')} 
          />
          <NavItem 
            icon={<PackagePlus size={22} />} 
            label="Νέο Προϊόν" 
            isActive={activePage === 'new-product'} 
            isCollapsed={isCollapsed}
            onClick={() => handleNav('new-product')} 
          />
          <NavItem 
            icon={<DollarSign size={22} />} 
            label="Τιμολόγηση" 
            isActive={activePage === 'pricing'} 
            isCollapsed={isCollapsed}
            onClick={() => handleNav('pricing')} 
          />
          <div className="pt-4 mt-4 border-t border-slate-700">
            <NavItem 
              icon={<SettingsIcon size={22} />} 
              label="Ρυθμίσεις" 
              isActive={activePage === 'settings'} 
              isCollapsed={isCollapsed}
              onClick={() => handleNav('settings')} 
            />
          </div>
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-slate-700 bg-slate-900">
           <button 
             onClick={toggleCollapse}
             className="hidden md:flex w-full items-center justify-center p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
           >
             {isCollapsed ? <ChevronRight size={20} /> : <div className="flex items-center gap-2 text-sm"><ChevronLeft size={16}/> <span>Σύμπτυξη</span></div>}
           </button>
           
           {!isCollapsed && (
              <div className="mt-4 text-xs text-slate-500 text-center">
                <p>Ag925: <span className="text-amber-500">{settings.silver_price_gram}€</span></p>
                <p>v1.4.0</p>
              </div>
           )}
        </div>
      </aside>

      {/* Main Content */}
      <main className={`flex-1 flex flex-col h-full overflow-hidden transition-all duration-300 ${isCollapsed ? 'md:ml-20' : 'md:ml-64'}`}>
        
        {/* Mobile Header */}
        <header className="md:hidden bg-white p-4 shadow-sm flex items-center justify-between z-30 sticky top-0">
           <button onClick={() => setIsSidebarOpen(true)} className="text-slate-600">
             <Menu size={24} />
           </button>
           <div className="h-8">
              <img src={APP_LOGO} alt="Ilios Kosmima" className="h-full w-auto object-contain" />
           </div>
           <div className="w-6"></div>
        </header>

        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-8 relative">
          <div className="max-w-7xl mx-auto">
            {activePage === 'dashboard' && <Dashboard products={products} settings={settings} />}
            {activePage === 'inventory' && <Inventory products={products} materials={materials} setPrintItems={setPrintItems} settings={settings} collections={collections} />}
            {activePage === 'materials' && <MaterialsPage />}
            {activePage === 'molds' && <MoldsPage />}
            {activePage === 'collections' && <CollectionsPage />}
            {activePage === 'new-product' && <NewProduct products={products} materials={materials} molds={molds} />}
            {activePage === 'pricing' && <PricingManager products={products} settings={settings} materials={materials} />}
            {activePage === 'settings' && <SettingsPage />}
          </div>
        </div>
      </main>
    </div>
  );
}

const NavItem = ({ icon, label, isActive, onClick, isCollapsed }: { icon: React.ReactNode, label: string, isActive: boolean, onClick: () => void, isCollapsed: boolean }) => (
  <button
    onClick={onClick}
    title={isCollapsed ? label : ''}
    className={`
      w-full flex items-center ${isCollapsed ? 'justify-center' : 'justify-start'} gap-3 px-3 py-3 rounded-lg transition-all duration-200 group relative
      ${isActive ? 'bg-amber-500 text-white shadow-md' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}
    `}
  >
    <div className={`${isActive ? 'text-white' : 'text-slate-400 group-hover:text-white'}`}>
      {icon}
    </div>
    {!isCollapsed && <span className="font-medium truncate">{label}</span>}
    {isCollapsed && (
      <div className="absolute left-full ml-2 px-2 py-1 bg-slate-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 shadow-xl">
        {label}
      </div>
    )}
  </button>
);