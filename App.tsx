
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
  FolderKanban,
  Printer,
  ShoppingCart,
  Factory,
  Users,
  Sparkles
} from 'lucide-react';
import { APP_LOGO, APP_ICON_ONLY } from './constants';
import { api, isConfigured } from './lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Product, ProductVariant } from './types';
import { UIProvider } from './components/UIProvider';
import { AuthProvider, useAuth } from './components/AuthContext';
import AuthScreen, { PendingApprovalScreen } from './components/AuthScreen';
import SetupScreen from './components/SetupScreen';

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
import BatchPrintPage from './components/BatchPrintPage';
import OrdersPage from './components/OrdersPage';
import ProductionPage from './components/ProductionPage';
import CustomersPage from './components/CustomersPage';
import AiStudio from './components/AiStudio';

type Page = 'dashboard' | 'inventory' | 'new-product' | 'pricing' | 'settings' | 'materials' | 'molds' | 'collections' | 'batch-print' | 'orders' | 'production' | 'customers' | 'ai-studio';

// --- AUTH GUARD COMPONENT ---
function AuthGuard({ children }: { children?: React.ReactNode }) {
    const { session, loading, profile, signOut } = useAuth();

    if (loading) {
        return (
            <div className="h-screen w-full flex items-center justify-center bg-slate-50">
                <Loader2 size={40} className="animate-spin text-amber-500" />
            </div>
        );
    }

    if (!session) {
        return <AuthScreen />;
    }

    // Check approval status
    if (profile && !profile.is_approved) {
        return <PendingApprovalScreen onLogout={signOut} />;
    }

    return <>{children}</>;
}

function AppContent() {
  const [activePage, setActivePage] = useState<Page>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [printItems, setPrintItems] = useState<{product: Product, variant?: ProductVariant, quantity: number}[]>([]);
  const { signOut, profile } = useAuth();
  
  // --- React Query Data Fetching ---
  // Only runs if AuthGuard passes
  const { data: settings, isLoading: loadingSettings } = useQuery({ queryKey: ['settings'], queryFn: api.getSettings });
  const { data: materials, isLoading: loadingMaterials } = useQuery({ queryKey: ['materials'], queryFn: api.getMaterials });
  const { data: molds, isLoading: loadingMolds } = useQuery({ queryKey: ['molds'], queryFn: api.getMolds });
  const { data: products, isLoading: loadingProducts } = useQuery({ queryKey: ['products'], queryFn: api.getProducts });
  const { data: collections, isLoading: loadingCollections } = useQuery({ queryKey: ['collections'], queryFn: api.getCollections });

  const isLoading = loadingSettings || loadingMaterials || loadingMolds || loadingProducts || loadingCollections;

  // Print effect
  useEffect(() => {
    if (printItems.length > 0) {
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
      <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-50 text-slate-500 font-sans">
        <Loader2 size={48} className="animate-spin mb-4 text-amber-500" />
        <p className="font-medium text-lg tracking-tight">Φόρτωση ERP...</p>
      </div>
    );
  }

  // Safe fallback
  if (!settings || !products || !materials || !molds || !collections) return null;
  
  const flattenedPrintItems = printItems.flatMap(item => 
      Array.from({ length: item.quantity }, () => ({ product: item.product, variant: item.variant }))
  );

  return (
    <>
      {/* Print View */}
      <div className="print-view">
        <div className="print-area">
          {flattenedPrintItems.map((item, index) => (
            <BarcodeView 
              key={`${item.product.sku}-${item.variant?.suffix || 'master'}-${index}`}
              product={item.product} 
              variant={item.variant}
              width={settings.barcode_width_mm}
              height={settings.barcode_height_mm}
            />
          ))}
        </div>
      </div>
      
      {/* Main Application Container */}
      <div id="app-container" className="flex h-screen overflow-hidden text-slate-800 bg-slate-50 font-sans selection:bg-amber-100">
        {/* Mobile Overlay */}
        {isSidebarOpen && (
          <div 
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 md:hidden animate-in fade-in duration-200"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside 
          className={`
            fixed inset-y-0 left-0 z-40 bg-slate-900 text-white transition-all duration-500 ease-[cubic-bezier(0.25,0.8,0.25,1)] shadow-2xl flex flex-col
            ${isSidebarOpen ? 'translate-x-0 w-72' : '-translate-x-full md:translate-x-0'}
            ${isCollapsed ? 'md:w-20' : 'md:w-72'}
            border-r border-slate-800
          `}
        >
          {/* Sidebar Header */}
          <div className={`p-6 flex items-center ${isCollapsed ? 'justify-center' : 'justify-center'} h-24 relative bg-slate-950/30`}>
            {!isCollapsed ? (
              <div className="flex items-center justify-center w-full px-2 h-full animate-in fade-in duration-300">
                <img 
                  src={APP_LOGO} 
                  alt="Ilios Kosmima" 
                  className="h-16 w-auto object-contain drop-shadow-lg" 
                  onError={(e) => {
                    const target = e.currentTarget;
                    target.style.display = 'none';
                    const parent = target.parentElement;
                    if (parent && !parent.querySelector('.app-title')) {
                      const title = document.createElement('div');
                      title.className = 'app-title text-white font-bold text-center text-xl tracking-wider';
                      title.innerText = 'ILIOS KOSMIMA';
                      parent.appendChild(title);
                    }
                  }}
                />
              </div>
            ) : (
              <div className="w-10 h-10 flex items-center justify-center animate-in zoom-in duration-300">
                <img src={APP_ICON_ONLY} alt="Icon" className="w-full h-full object-contain" />
              </div>
            )}
            
            <button onClick={() => setIsSidebarOpen(false)} className="md:hidden text-slate-400 hover:text-white absolute right-4 top-6 transition-colors">
              <X size={24} />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 py-6 px-3 space-y-1 overflow-y-auto overflow-x-hidden scrollbar-hide">
            {/* User Profile Snippet */}
            <div className={`mb-6 px-2 flex items-center gap-3 ${isCollapsed ? 'justify-center' : ''}`}>
                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-amber-500 to-yellow-500 flex items-center justify-center text-white font-bold shadow-lg">
                    {profile?.full_name?.charAt(0) || 'U'}
                </div>
                {!isCollapsed && (
                    <div className="overflow-hidden">
                        <p className="text-sm font-bold text-white truncate">{profile?.full_name || 'User'}</p>
                        <button onClick={signOut} className="text-xs text-slate-400 hover:text-white transition-colors">Αποσύνδεση</button>
                    </div>
                )}
            </div>

            <NavItem 
              icon={<LayoutDashboard size={22} />} 
              label="Πίνακας Ελέγχου" 
              isActive={activePage === 'dashboard'} 
              isCollapsed={isCollapsed}
              onClick={() => handleNav('dashboard')} 
            />
            
            {/* AI Studio Highlight */}
            <div className="my-2 mx-2">
                <button
                    onClick={() => handleNav('ai-studio')}
                    title={isCollapsed ? 'AI Studio' : ''}
                    className={`
                    w-full flex items-center ${isCollapsed ? 'justify-center' : 'justify-start'} gap-3 px-4 py-3.5 my-0.5 rounded-xl transition-all duration-300 group relative
                    ${activePage === 'ai-studio' 
                        ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-900/30 ring-1 ring-indigo-400' 
                        : 'text-indigo-200 hover:bg-white/5 hover:text-white border border-indigo-500/20 bg-indigo-900/10'}
                    `}
                >
                    <div className={`${activePage === 'ai-studio' ? 'text-white' : 'text-indigo-300 group-hover:text-white transition-colors duration-200'}`}>
                        <Sparkles size={22} className={activePage !== 'ai-studio' ? "animate-pulse" : ""} />
                    </div>
                    {!isCollapsed && <span className="font-bold truncate tracking-wide text-sm">AI Studio</span>}
                    {isCollapsed && (
                    <div className="absolute left-full ml-3 px-3 py-1.5 bg-indigo-900 text-white text-xs font-medium rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 shadow-xl border border-indigo-700 transition-opacity duration-200">
                        AI Studio
                    </div>
                    )}
                </button>
            </div>

            <div className="my-2 border-t border-slate-800/50 mx-2"></div>
            <NavItem 
              icon={<ShoppingCart size={22} />} 
              label="Παραγγελίες" 
              isActive={activePage === 'orders'} 
              isCollapsed={isCollapsed}
              onClick={() => handleNav('orders')} 
            />
            <NavItem 
              icon={<Factory size={22} />} 
              label="Παραγωγή" 
              isActive={activePage === 'production'} 
              isCollapsed={isCollapsed}
              onClick={() => handleNav('production')} 
            />
            <NavItem 
              icon={<Users size={22} />} 
              label="Πελάτες" 
              isActive={activePage === 'customers'} 
              isCollapsed={isCollapsed}
              onClick={() => handleNav('customers')} 
            />
            <div className="my-2 border-t border-slate-800/50 mx-2"></div>
            <NavItem 
              icon={<Warehouse size={22} />} 
              label="Αποθήκη" 
              isActive={activePage === 'inventory'} 
              isCollapsed={isCollapsed}
              onClick={() => handleNav('inventory')} 
            />
            <NavItem 
              icon={<PackagePlus size={22} />} 
              label="Νέο Προϊόν" 
              isActive={activePage === 'new-product'} 
              isCollapsed={isCollapsed}
              onClick={() => handleNav('new-product')} 
            />
             <div className="my-2 border-t border-slate-800/50 mx-2"></div>
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
            <div className="my-2 border-t border-slate-800/50 mx-2"></div>
            <NavItem 
              icon={<DollarSign size={22} />} 
              label="Τιμολόγηση" 
              isActive={activePage === 'pricing'} 
              isCollapsed={isCollapsed}
              onClick={() => handleNav('pricing')} 
            />
            <NavItem 
              icon={<Printer size={22} />} 
              label="Μαζική Εκτύπωση" 
              isActive={activePage === 'batch-print'} 
              isCollapsed={isCollapsed}
              onClick={() => handleNav('batch-print')} 
            />
            <div className="mt-auto pt-6">
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
          <div className="p-4 bg-slate-950/30">
            <button 
              onClick={toggleCollapse}
              className="hidden md:flex w-full items-center justify-center p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
            >
              {isCollapsed ? <ChevronRight size={20} /> : <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider"><ChevronLeft size={16}/> <span>Σύμπτυξη</span></div>}
            </button>
            
            {!isCollapsed && (
                <div className="mt-4 text-xs text-slate-500 text-center font-medium animate-in fade-in duration-500">
                  <p>Silver Price: <span className="text-amber-500">{settings.silver_price_gram}€</span></p>
                  <p className="opacity-50 mt-1">v1.0.0 (Secure)</p>
                </div>
            )}
          </div>
        </aside>

        {/* Main Content */}
        <main className={`flex-1 flex flex-col h-full overflow-hidden transition-all duration-500 ${isCollapsed ? 'md:ml-20' : 'md:ml-72'}`}>
          
          {/* Mobile Header */}
          <header className="md:hidden bg-white/80 backdrop-blur-md p-4 shadow-sm flex items-center justify-between z-30 sticky top-0 border-b border-slate-200/60">
            <button onClick={() => setIsSidebarOpen(true)} className="text-slate-600 p-1 hover:bg-slate-100 rounded-lg">
              <Menu size={24} />
            </button>
            <div className="h-8">
                <img src={APP_LOGO} alt="Ilios" className="h-full w-auto object-contain" />
            </div>
            <div className="w-8"></div>
          </header>

          <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-8 relative scroll-smooth">
            <div className="max-w-[1600px] mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
              {activePage === 'dashboard' && <Dashboard products={products} settings={settings} />}
              {activePage === 'inventory' && <Inventory products={products} materials={materials} setPrintItems={setPrintItems} settings={settings} collections={collections} />}
              {activePage === 'orders' && <OrdersPage products={products} />}
              {activePage === 'production' && <ProductionPage products={products} materials={materials} />}
              {activePage === 'customers' && <CustomersPage />}
              {activePage === 'materials' && <MaterialsPage />}
              {activePage === 'molds' && <MoldsPage />}
              {activePage === 'collections' && <CollectionsPage />}
              {activePage === 'new-product' && <NewProduct products={products} materials={materials} molds={molds} />}
              {activePage === 'pricing' && <PricingManager products={products} settings={settings} materials={materials} />}
              {activePage === 'batch-print' && <BatchPrintPage allProducts={products} setPrintItems={setPrintItems} />}
              {activePage === 'settings' && <SettingsPage />}
              {activePage === 'ai-studio' && <AiStudio />}
            </div>
          </div>
        </main>
      </div>
    </>
  );
}

const NavItem = ({ icon, label, isActive, onClick, isCollapsed }: { icon: React.ReactNode, label: string, isActive: boolean, onClick: () => void, isCollapsed: boolean }) => (
  <button
    onClick={onClick}
    title={isCollapsed ? label : ''}
    className={`
      w-full flex items-center ${isCollapsed ? 'justify-center' : 'justify-start'} gap-3 px-4 py-3.5 my-0.5 rounded-xl transition-all duration-200 group relative
      ${isActive 
        ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-lg shadow-amber-900/20' 
        : 'text-slate-400 hover:bg-slate-800 hover:text-white'}
    `}
  >
    <div className={`${isActive ? 'text-white' : 'text-slate-400 group-hover:text-white transition-colors duration-200'}`}>
      {icon}
    </div>
    {!isCollapsed && <span className="font-medium truncate tracking-wide text-sm">{label}</span>}
    {isCollapsed && (
      <div className="absolute left-full ml-3 px-3 py-1.5 bg-slate-800 text-white text-xs font-medium rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 shadow-xl border border-slate-700 transition-opacity duration-200">
        {label}
      </div>
    )}
  </button>
);

export default function App() {
  if (!isConfigured) {
      return <SetupScreen />;
  }

  return (
    <UIProvider>
      <AuthProvider>
        <AuthGuard>
          <AppContent />
        </AuthGuard>
      </AuthProvider>
    </UIProvider>
  );
}
