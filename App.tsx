
import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
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
  Sparkles,
  Database,
  Layers,
  LogOut,
  Wifi,
  WifiOff,
  Cloud,
  HardDrive,
  RefreshCw,
  AlertTriangle,
  MonitorOff
} from 'lucide-react';
import { APP_LOGO, APP_ICON_ONLY } from './constants';
import { api, isConfigured, isLocalMode } from './lib/supabase';
import { offlineDb } from './lib/offlineDb';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Product, ProductVariant, GlobalSettings, Order, Material, Mold, Collection, ProductionBatch, RecipeItem, OrderStatus, ProductionStage, Gender, PlatingType } from './types';
import { useUI } from './components/UIProvider';
import { AuthProvider, useAuth } from './components/AuthContext';
import AuthScreen, { PendingApprovalScreen } from './components/AuthScreen';
import SetupScreen from './components/SetupScreen';
import { calculateProductCost, estimateVariantCost } from './utils/pricingEngine';

// Pages
import Dashboard from './components/Dashboard';
import Inventory from './components/Inventory';
import ProductRegistry from './components/ProductRegistry'; 
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
import OrderInvoiceView from './components/OrderInvoiceView';
import ProductionWorkerView from './components/ProductionWorkerView';
import AggregatedProductionView from './components/AggregatedProductionView';
import PreparationView from './components/PreparationView';
import TechnicianView from './components/TechnicianView';


type Page = 'dashboard' | 'registry' | 'inventory' | 'pricing' | 'settings' | 'resources' | 'collections' | 'batch-print' | 'orders' | 'production' | 'customers' | 'ai-studio';

export interface AggregatedBatch extends ProductionBatch {
    cost_per_piece: number;
    total_cost: number;
}
export interface AggregatedData {
  molds: Map<string, { code: string; location: string; description: string; usedIn: Set<string> }>;
  materials: Map<string, { name: string; unit: string; totalQuantity: number; totalCost: number; usedIn: Map<string, number> }>;
  components: Map<string, { sku: string; totalQuantity: number; totalCost: number; usedIn: Map<string, number> }>;
  totalSilverWeight: number;
  batches: AggregatedBatch[];
  totalProductionCost: number;
  totalSilverCost: number;
  totalMaterialsCost: number;
  totalInHouseLaborCost: number;
  totalImportedLaborCost: number;
  totalSubcontractCost: number;
  orderId?: string;
  customerName?: string;
}

function AuthGuard({ children }: { children?: React.ReactNode }) {
    const { session, loading, profile, signOut } = useAuth();

    if (isLocalMode) return <>{children}</>;

    if (loading) {
        return (
            <div className="h-screen w-full flex items-center justify-center bg-slate-50">
                <Loader2 size={40} className="animate-spin text-amber-500" />
            </div>
        );
    }

    if (!session) return <AuthScreen />;
    if (profile && !profile.is_approved) return <PendingApprovalScreen onLogout={signOut} />;

    return <>{children}</>;
}

const NavItem = ({ icon, label, isActive, onClick, isCollapsed }: { icon: React.ReactNode, label: string, isActive: boolean, onClick: () => void, isCollapsed: boolean }) => (
  <button
    onClick={onClick}
    title={isCollapsed ? label : ''}
    className={`
      w-full flex items-center ${isCollapsed ? 'justify-center' : 'justify-start'} gap-3 px-4 py-3.5 my-0.5 rounded-xl transition-all duration-200 group relative
      ${isActive 
        ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-lg shadow-amber-900/20' 
        : 'text-slate-400 hover:bg-white/10 hover:text-white'}
    `}
  >
    <div className={`${isActive ? 'text-white' : 'text-slate-400 group-hover:text-white transition-colors duration-200'}`}>
      {icon}
    </div>
    {!isCollapsed && <span className="font-medium truncate tracking-wide text-sm">{label}</span>}
    {isCollapsed && (
      <div className="absolute left-full ml-3 px-3 py-1.5 bg-[#060b00] text-white text-xs font-medium rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 shadow-xl border border-white/10 transition-opacity duration-200">
        {label}
      </div>
    )}
  </button>
);

function AppContent() {
  const [activePage, setActivePage] = useState<Page>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  
  const queryClient = useQueryClient();
  const { showToast } = useUI();
  const { signOut, profile } = useAuth();

  const [printItems, setPrintItems] = useState<{product: Product, variant?: ProductVariant, quantity: number, format?: 'standard' | 'simple'}[]>([]);
  const [orderToPrint, setOrderToPrint] = useState<Order | null>(null);
  const [batchToPrint, setBatchToPrint] = useState<ProductionBatch | null>(null);
  const [aggregatedPrintData, setAggregatedPrintData] = useState<AggregatedData | null>(null);
  const [preparationPrintData, setPreparationPrintData] = useState<{ batches: ProductionBatch[] } | null>(null);
  const [technicianPrintData, setTechnicianPrintData] = useState<{ batches: ProductionBatch[] } | null>(null);
  const [batchPrintSkus, setBatchPrintSkus] = useState('');
  const [resourceTab, setResourceTab] = useState<'materials' | 'molds'>('materials');
  
  useEffect(() => {
    if (isLocalMode) return;
    const checkQueue = async () => {
        const count = await offlineDb.getQueueCount();
        setPendingCount(count);
        return count;
    };
    const handleSync = async () => {
        const count = await checkQueue();
        if (count === 0) return;
        setIsSyncing(true);
        try {
            const synced = await api.syncOfflineData();
            if (synced > 0) {
                showToast(`Συγχρονίστηκαν ${synced} αλλαγές!`, "success");
                queryClient.invalidateQueries();
            }
            await checkQueue();
        } catch (e) {
            console.error("Auto-Sync Failed:", e);
        } finally {
            setIsSyncing(false);
        }
    };
    const handleOnline = () => { setIsOnline(true); handleSync(); };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    const interval = setInterval(checkQueue, 3000);
    if (navigator.onLine) handleSync();
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);

  const { data: settings, isLoading: loadingSettings } = useQuery<GlobalSettings>({ queryKey: ['settings'], queryFn: api.getSettings });
  const { data: materials, isLoading: loadingMaterials } = useQuery<Material[]>({ queryKey: ['materials'], queryFn: api.getMaterials });
  const { data: molds, isLoading: loadingMolds } = useQuery<Mold[]>({ queryKey: ['molds'], queryFn: api.getMolds });
  const { data: products, isLoading: loadingProducts } = useQuery<Product[]>({ queryKey: ['products'], queryFn: api.getProducts });
  const { data: collections, isLoading: loadingCollections } = useQuery<Collection[]>({ queryKey: ['collections'], queryFn: api.getCollections });

  useEffect(() => {
    const shouldPrint = printItems.length > 0 || orderToPrint || batchToPrint || aggregatedPrintData || preparationPrintData || technicianPrintData;
    if (shouldPrint) {
      const originalTitle = document.title;
      const handleAfterPrint = () => {
        document.title = originalTitle;
        setPrintItems([]); setOrderToPrint(null); setBatchToPrint(null); setAggregatedPrintData(null); setPreparationPrintData(null); setTechnicianPrintData(null);
        window.removeEventListener('afterprint', handleAfterPrint);
      };
      window.addEventListener('afterprint', handleAfterPrint);
      setTimeout(() => {
        window.print();
        if (!('onafterprint' in window)) setTimeout(handleAfterPrint, 1000);
      }, 500);
      return () => window.removeEventListener('afterprint', handleAfterPrint);
    }
  }, [printItems, orderToPrint, batchToPrint, aggregatedPrintData, preparationPrintData, technicianPrintData]);

  const handleNav = (page: Page) => { setActivePage(page); if (window.innerWidth < 768) setIsSidebarOpen(false); };
  const toggleCollapse = () => setIsCollapsed(!isCollapsed);
  
  const handlePrintPreparation = (batchesToPrint: ProductionBatch[]) => { setPreparationPrintData({ batches: batchesToPrint }); };
  const handlePrintTechnician = (batchesToPrint: ProductionBatch[]) => { setTechnicianPrintData({ batches: batchesToPrint }); };
  const handlePrintAggregated = (batchesToPrint: ProductionBatch[], orderDetails?: { orderId: string, customerName: string }) => {
    if (!molds || !materials || !products || !settings) return;
    const aggregatedMolds: AggregatedData['molds'] = new Map();
    const aggregatedMaterials: AggregatedData['materials'] = new Map();
    const aggregatedComponents: AggregatedData['components'] = new Map();
    let totalSilverWeight = 0, totalProductionCost = 0, totalSilverCost = 0, totalMaterialsCost = 0, totalInHouseLaborCost = 0, totalImportedLaborCost = 0, totalSubcontractCost = 0;
    const batchesWithCost: AggregatedBatch[] = [];

    for (const batch of batchesToPrint) {
        const product = batch.product_details;
        if (!product) continue;
        const costResult = batch.variant_suffix ? estimateVariantCost(product, batch.variant_suffix, settings, materials, products) : calculateProductCost(product, settings, materials, products);
        const costPerPiece = costResult.total;
        const totalBatchCost = costPerPiece * batch.quantity;
        batchesWithCost.push({ ...batch, cost_per_piece: costPerPiece, total_cost: totalBatchCost });
        totalProductionCost += totalBatchCost;
        if (costResult.breakdown) {
            totalSilverCost += (costResult.breakdown.silver || 0) * batch.quantity;
            totalMaterialsCost += (costResult.breakdown.materials || 0) * batch.quantity;
            if (product.production_type === 'Imported') totalImportedLaborCost += (costResult.breakdown.labor || 0) * batch.quantity;
            else totalInHouseLaborCost += (costResult.breakdown.labor || 0) * batch.quantity;
            if (costResult.breakdown.details) totalSubcontractCost += (costResult.breakdown.details.subcontract_cost || 0) * batch.quantity;
        }
        totalSilverWeight += batch.quantity * product.weight_g;
        for (const pm of product.molds) {
            const moldDetails = molds.find(m => m.code === pm.code);
            if (moldDetails) {
                if (!aggregatedMolds.has(pm.code)) aggregatedMolds.set(pm.code, { ...moldDetails, usedIn: new Set() });
                aggregatedMolds.get(pm.code)!.usedIn.add(product.sku + (batch.variant_suffix || ''));
            }
        }
        for (const r of product.recipe) {
            const qty = batch.quantity * r.quantity;
            if (r.type === 'raw') {
                const mat = materials.find(m => m.id === r.id);
                if (mat) {
                    if (!aggregatedMaterials.has(mat.id)) aggregatedMaterials.set(mat.id, { name: mat.name, unit: mat.unit, totalQuantity: 0, totalCost: 0, usedIn: new Map() });
                    const entry = aggregatedMaterials.get(mat.id)!;
                    entry.totalQuantity += qty; entry.totalCost += qty * mat.cost_per_unit;
                    entry.usedIn.set(product.sku + (batch.variant_suffix || ''), (entry.usedIn.get(product.sku + (batch.variant_suffix || '')) || 0) + qty);
                }
            } else if (r.type === 'component') {
                const comp = products.find(p => p.sku === r.sku);
                if (comp) {
                    if (!aggregatedComponents.has(r.sku)) aggregatedComponents.set(r.sku, { sku: r.sku, totalQuantity: 0, totalCost: 0, usedIn: new Map() });
                    const entry = aggregatedComponents.get(r.sku)!;
                    entry.totalQuantity += qty; entry.totalCost += qty * comp.active_price;
                    // @FIX: Error in file App.tsx on line 263: Property 'get' does not exist on type '{ sku: string; totalQuantity: number; totalCost: number; usedIn: Map<string, number>; }'. Fixed by using entry.usedIn.get
                    entry.usedIn.set(product.sku + (batch.variant_suffix || ''), (entry.usedIn.get(product.sku + (batch.variant_suffix || '')) || 0) + qty);
                }
            }
        }
    }
    setAggregatedPrintData({ molds: aggregatedMolds, materials: aggregatedMaterials, components: aggregatedComponents, totalSilverWeight, batches: batchesWithCost, totalProductionCost, totalSilverCost, totalMaterialsCost, totalInHouseLaborCost, totalImportedLaborCost, totalSubcontractCost, orderId: orderDetails?.orderId, customerName: orderDetails?.customerName });
  };

  if (loadingSettings || loadingMaterials || loadingMolds || loadingProducts || loadingCollections) {
    return <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-50 text-slate-500"><Loader2 size={48} className="animate-spin mb-4 text-amber-500" /><p className="font-medium text-lg">Φόρτωση ERP...</p></div>;
  }
  if (!settings || !products || !materials || !molds || !collections) return null;
  
  const handleLogout = () => { localStorage.removeItem('ILIOS_LOCAL_MODE'); signOut(); };

  return (
    <>
      <div className="print-view">
        {orderToPrint && <OrderInvoiceView order={orderToPrint} />}
        {batchToPrint && <ProductionWorkerView batch={batchToPrint} allMolds={molds} allProducts={products} allMaterials={materials} />}
        {aggregatedPrintData && <AggregatedProductionView data={aggregatedPrintData} settings={settings} />}
        {preparationPrintData && <PreparationView batches={preparationPrintData.batches} allMaterials={materials} allProducts={products} allMolds={molds} />}
        {technicianPrintData && <TechnicianView batches={technicianPrintData.batches} />}
        {printItems.length > 0 && (
            <div className="print-area">
            {printItems.flatMap(item => Array.from({ length: item.quantity }, () => ({ product: item.product, variant: item.variant, format: item.format }))).map((item, idx) => (
                <BarcodeView key={`${idx}`} product={item.product} variant={item.variant} width={settings.barcode_width_mm} height={settings.barcode_height_mm} format={item.format} />
            ))}
            </div>
        )}
      </div>
      <div id="app-container" className="flex h-screen overflow-hidden text-[#060b00] bg-slate-50 font-sans">
        {isSidebarOpen && <div className="fixed inset-0 bg-[#060b00]/60 backdrop-blur-sm z-40 md:hidden animate-in fade-in" onClick={() => setIsSidebarOpen(false)} />}
        <aside className={`fixed inset-y-0 left-0 z-40 bg-[#060b00] text-white transition-all duration-500 shadow-2xl flex flex-col ${isSidebarOpen ? 'translate-x-0 w-72' : '-translate-x-full md:translate-x-0'} ${isCollapsed ? 'md:w-20' : 'md:w-72'} border-r border-white/5`}>
          <div className={`p-6 flex items-center justify-center h-24 relative bg-black/20`}>
            {!isCollapsed ? <img src={APP_LOGO} alt="Ilios" className="h-16 w-auto object-contain drop-shadow-lg" /> : <img src={APP_ICON_ONLY} alt="Icon" className="w-10 h-10 object-contain" />}
            <button onClick={() => setIsSidebarOpen(false)} className="md:hidden text-slate-400 hover:text-white absolute right-4 top-6"><X size={24} /></button>
          </div>
          <div className={`px-4 py-2 flex items-center gap-3 ${isCollapsed ? 'justify-center' : 'justify-start'}`}>
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${isLocalMode ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : isOnline ? (isSyncing || pendingCount > 0 ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20') : 'bg-rose-500/10 text-rose-400 border-rose-500/20'}`}>
                {isLocalMode ? <><HardDrive size={12}/> {!isCollapsed && 'LOCAL DB'}</> : isSyncing ? <><RefreshCw size={12} className="animate-spin"/> {!isCollapsed && 'SYNC'}</> : pendingCount > 0 ? <><RefreshCw size={12} /> {!isCollapsed && `${pendingCount} PENDING`}</> : isOnline ? <><Cloud size={12} className="animate-pulse"/> {!isCollapsed && 'CLOUD'}</> : <><HardDrive size={12}/> {!isCollapsed && 'OFFLINE'}</>}
              </div>
          </div>
          <nav className="flex-1 py-6 px-3 space-y-1 overflow-y-auto scrollbar-hide">
            <NavItem icon={<LayoutDashboard size={22} />} label="Πίνακας Ελέγχου" isActive={activePage === 'dashboard'} isCollapsed={isCollapsed} onClick={() => handleNav('dashboard')} />
            <div className="my-2 mx-2">
                <button onClick={() => handleNav('ai-studio')} className={`w-full flex items-center ${isCollapsed ? 'justify-center' : 'justify-start'} gap-3 px-4 py-3.5 my-0.5 rounded-xl transition-all duration-300 group relative ${activePage === 'ai-studio' ? 'bg-gradient-to-r from-[#060b00] to-emerald-900 text-white shadow-lg ring-1 ring-emerald-800' : 'text-emerald-200 hover:bg-white/5 hover:text-white border border-emerald-900/30 bg-[#0a1200]/50'}`}>
                    <div className={`${activePage === 'ai-studio' ? 'text-white' : 'text-emerald-300 group-hover:text-white'}`}><Sparkles size={22} className={activePage !== 'ai-studio' ? "animate-pulse" : ""} /></div>
                    {!isCollapsed && <span className="font-bold truncate text-sm">AI Studio</span>}
                </button>
            </div>
            <div className="my-2 border-t border-white/10 mx-2"></div>
            <NavItem icon={<Database size={22} />} label="Μητρώο Κωδικών" isActive={activePage === 'registry'} isCollapsed={isCollapsed} onClick={() => handleNav('registry')} />
            {!isLocalMode && (
                <>
                <NavItem icon={<ShoppingCart size={22} />} label="Παραγγελίες" isActive={activePage === 'orders'} isCollapsed={isCollapsed} onClick={() => handleNav('orders')} />
                <NavItem icon={<Factory size={22} />} label="Παραγωγή" isActive={activePage === 'production'} isCollapsed={isCollapsed} onClick={() => handleNav('production')} />
                <NavItem icon={<Users size={22} />} label="Πελάτες & Προμηθευτές" isActive={activePage === 'customers'} isCollapsed={isCollapsed} onClick={() => handleNav('customers')} />
                </>
            )}
            <div className="my-2 border-t border-white/10 mx-2"></div>
            <NavItem icon={<Warehouse size={22} />} label="Αποθήκη & Στοκ" isActive={activePage === 'inventory'} isCollapsed={isCollapsed} onClick={() => handleNav('inventory')} />
            <div className="my-2 border-t border-white/10 mx-2"></div>
            <NavItem icon={<Layers size={22} />} label="Υλικά & Λάστιχα" isActive={activePage === 'resources'} isCollapsed={isCollapsed} onClick={() => handleNav('resources')} />
            <NavItem icon={<FolderKanban size={22} />} label="Συλλογές" isActive={activePage === 'collections'} isCollapsed={isCollapsed} onClick={() => handleNav('collections')} />
            <div className="my-2 border-t border-white/10 mx-2"></div>
            <NavItem icon={<DollarSign size={22} />} label="Τιμολόγηση" isActive={activePage === 'pricing'} isCollapsed={isCollapsed} onClick={() => handleNav('pricing')} />
            <NavItem icon={<Printer size={22} />} label="Μαζική Εκτύπωση" isActive={activePage === 'batch-print'} isCollapsed={isCollapsed} onClick={() => handleNav('batch-print')} />
            <div className="mt-auto pt-6">
              <NavItem icon={<SettingsIcon size={22} />} label="Ρυθμίσεις" isActive={activePage === 'settings'} isCollapsed={isCollapsed} onClick={() => handleNav('settings')} />
              <div className={`mt-4 pt-4 border-t border-white/10 ${isCollapsed ? 'flex justify-center' : 'px-4'}`}>
                  <button onClick={handleLogout} className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg flex items-center gap-2">
                      <LogOut size={18} /> {!isCollapsed && <span className="text-sm font-medium">{profile?.full_name || 'User'}</span>}
                  </button>
              </div>
            </div>
          </nav>
          <div className="p-4 bg-black/20">
            <button onClick={toggleCollapse} className="hidden md:flex w-full items-center justify-center p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors">{isCollapsed ? <ChevronRight size={20} /> : <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider"><ChevronLeft size={16}/> <span>Σύμπτυξη</span></div>}</button>
            {!isCollapsed && <div className="mt-4 text-[10px] text-slate-500 text-center font-medium"><p>Τιμή Ασημιού: <span className="text-amber-500">{settings.silver_price_gram.toFixed(3)}€</span></p><p className="opacity-50 mt-1">v1.1</p></div>}
          </div>
        </aside>
        <main className={`flex-1 flex flex-col h-full overflow-hidden transition-all duration-500 ${isCollapsed ? 'md:ml-20' : 'md:ml-72'}`}>
          <header className="md:hidden bg-white/80 backdrop-blur-md p-4 shadow-sm flex items-center justify-between z-30 sticky top-0 border-b border-slate-200">
            <button onClick={() => setIsSidebarOpen(true)} className="text-slate-600 p-1 hover:bg-slate-100 rounded-lg"><Menu size={24} /></button>
            <div className="h-8"><img src={APP_LOGO} alt="Ilios" className="h-full w-auto object-contain" /></div>
            <div className={`w-2 h-2 rounded-full ${isLocalMode ? 'bg-amber-500' : isOnline ? (pendingCount > 0 ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500') : 'bg-rose-500 animate-pulse'}`} />
          </header>
          <div className="flex-1 overflow-y-auto p-4 md:p-8 relative scroll-smooth">
            <div className="max-w-[1600px] mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
              {activePage === 'dashboard' && <Dashboard products={products} settings={settings} />}
              {activePage === 'registry' && <ProductRegistry setPrintItems={setPrintItems} />}
              {activePage === 'inventory' && <Inventory products={products} setPrintItems={setPrintItems} settings={settings} collections={collections} molds={molds} />}
              {activePage === 'orders' && <OrdersPage products={products} onPrintOrder={setOrderToPrint} materials={materials} onPrintAggregated={handlePrintAggregated} onPrintPreparation={handlePrintPreparation} onPrintTechnician={handlePrintTechnician} />}
              {activePage === 'production' && <ProductionPage products={products} materials={materials} molds={molds} onPrintBatch={setBatchToPrint} onPrintAggregated={handlePrintAggregated} onPrintPreparation={handlePrintPreparation} onPrintTechnician={handlePrintTechnician} />}
              {activePage === 'customers' && <CustomersPage onPrintOrder={setOrderToPrint} />}
              {activePage === 'resources' && (
                <div className="space-y-6">
                    <div className="bg-white p-2 rounded-2xl shadow-sm border border-slate-100 w-fit flex gap-2 mx-auto sm:mx-0 overflow-x-auto">
                        <button onClick={() => setResourceTab('materials')} className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2 whitespace-nowrap ${resourceTab === 'materials' ? 'bg-[#060b00] text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}><Gem size={18} /> Υλικά</button>
                        <button onClick={() => setResourceTab('molds')} className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2 whitespace-nowrap ${resourceTab === 'molds' ? 'bg-amber-50 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}><MapPin size={18} /> Λάστιχα</button>
                    </div>
                    {resourceTab === 'materials' && <MaterialsPage settings={settings} />}
                    {resourceTab === 'molds' && <MoldsPage />}
                </div>
              )}
              {activePage === 'collections' && <CollectionsPage />}
              {activePage === 'pricing' && <PricingManager products={products} settings={settings} materials={materials} />}
              {activePage === 'batch-print' && <BatchPrintPage allProducts={products} setPrintItems={setPrintItems} skusText={batchPrintSkus} setSkusText={setBatchPrintSkus} />}
              {activePage === 'settings' && <SettingsPage />}
              {activePage === 'ai-studio' && <AiStudio />}
            </div>
          </div>
        </main>
      </div>
    </>
  );
}

export default function App() {
  if (!isConfigured) return <SetupScreen />;
  return (
    <AuthProvider>
      <AuthGuard>
        <AppContent />
      </AuthGuard>
    </AuthProvider>
  );
}
