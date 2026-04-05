import React, { Suspense, useState, useEffect } from 'react';
import {
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Gem,
  MapPin,
  LogOut,
  Cloud,
  HardDrive,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import { APP_LOGO, APP_ICON_ONLY } from './constants';
import { isConfigured, isLocalMode } from './lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import { Product, Order, ProductionBatch, AssemblyPrintData, StageBatchPrintData } from './types';
import { UIProvider, useUI } from './components/UIProvider';
import { AuthProvider, useAuth } from './components/AuthContext';

// API Hooks
import { useProducts } from './hooks/api/useProducts';
import { useMaterials } from './hooks/api/useMaterials';
import { useMolds } from './hooks/api/useMolds';
import { useSettings } from './hooks/api/useSettings';
import { useCollections } from './hooks/api/useCollections';

import AuthScreen, { PendingApprovalScreen } from './components/AuthScreen';
import { calculateBusinessStats } from './utils/businessAnalytics';
import { useIsMobile } from './hooks/useIsMobile';
import { PrintManager } from './components/PrintManager';
import { SyncStatusIndicator } from './components/SyncStatusIndicator';
import { lazyWithChunkRecovery } from './lib/chunkLoadRecovery';

import SetupScreen from './components/SetupScreen';
import { PrintProvider, usePrint } from './components/PrintContext';
import { useDeliveryNavBadge } from './hooks/api/useOrderDeliveryPlans';
import { buildPartialOrderFromBatches } from './features/orders';
import { useConnectivityStatus } from './app-shell/useConnectivityStatus';
import { buildAggregatedPrintData } from './features/printing';
import { adminFooterNavItems, adminNavSections, adminQuickActionNavItems, renderNavIcon } from './surfaces/navConfig';
import type { AdminPage } from './surfaces/pageIds';

const lazyPage = <T extends React.ComponentType<any>>(factory: () => Promise<{ default: T }>) =>
  lazyWithChunkRecovery(factory, import.meta.url);

const MobileApp = lazyPage(() => import('./MobileApp'));
const EmployeeApp = lazyPage(() => import('./components/employee/EmployeeApp'));
const SellerApp = lazyPage(() => import('./components/seller/SellerApp'));
const Dashboard = lazyPage(() => import('./components/Dashboard'));
const Inventory = lazyPage(() => import('./components/Inventory'));
const ProductRegistry = lazyPage(() => import('./components/ProductRegistry'));
const PricingManager = lazyPage(() => import('./components/PricingManager'));
const SettingsPage = lazyPage(() => import('./components/SettingsPage'));
const MaterialsPage = lazyPage(() => import('./components/MaterialsPage'));
const MoldsPage = lazyPage(() => import('./components/MoldsPage'));
const CollectionsPage = lazyPage(() => import('./components/CollectionsPage'));
const BatchPrintPage = lazyPage(() => import('./components/BatchPrintPage'));
const OrdersPage = lazyPage(() => import('./components/OrdersPage'));
const ProductionPage = lazyPage(() => import('./components/ProductionPage'));
const CustomersPage = lazyPage(() => import('./components/CustomersPage'));
const SuppliersPage = lazyPage(() => import('./components/SuppliersPage'));
const AiStudio = lazyPage(() => import('./components/AiStudio'));
const PriceListPage = lazyPage(() => import('./components/PriceListPage'));
const AnalyticsView = lazyPage(() => import('./components/AnalyticsView'));
const OffersPage = lazyPage(() => import('./components/OffersPage'));
const DeliveriesPage = lazyPage(() => import('./components/DeliveriesPage'));


const ContentLoader = () => (
  <div className="min-h-[320px] w-full flex flex-col items-center justify-center text-slate-500">
    <Loader2 size={36} className="animate-spin mb-3 text-amber-500" />
    <p className="font-medium">Φόρτωση ενότητας...</p>
  </div>
);

function AuthGuard({ children }: { children?: React.ReactNode }) {
  const { session, loading, profile, signOut, refreshProfile } = useAuth();

  if (isLocalMode) return <>{children}</>;

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-slate-50">
        <Loader2 size={40} className="animate-spin text-amber-500" />
      </div>
    );
  }

  if (!session) return <AuthScreen />;

  // SECURITY FIX: Ensure profile exists before granting access
  if (!profile) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-50 text-center p-4">
        <div className="bg-red-50 p-6 rounded-3xl border border-red-100 max-w-md w-full">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 text-red-600">
            <ShieldAlert size={32} />
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">Σφάλμα Προφίλ</h2>
          <p className="text-slate-500 mb-6 text-sm">
            Δεν βρέθηκαν πληροφορίες προφίλ για το λογαριασμό σας. Παρακαλώ προσπαθήστε ξανά ή επικοινωνήστε με τον διαχειριστή.
          </p>
          <div className="flex gap-2 justify-center">
            <button onClick={refreshProfile} className="bg-red-600 text-white px-6 py-2 rounded-xl font-bold hover:bg-red-700 transition-colors text-sm shadow-md">
              Ανανέωση
            </button>
            <button onClick={signOut} className="bg-white border border-slate-200 text-slate-700 px-6 py-2 rounded-xl font-bold hover:bg-slate-50 transition-colors text-sm">
              Αποσύνδεση
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!profile.is_approved) return <PendingApprovalScreen onLogout={signOut} />;

  return <>{children}</>;
}

const NavItem = ({ icon, label, isActive, onClick, isCollapsed, badge }: { icon: React.ReactNode, label: string, isActive: boolean, onClick: () => void, isCollapsed: boolean, badge?: number }) => (
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
    {!!badge && badge > 0 && (
      <span className={`ml-auto min-w-[1.4rem] h-6 px-1.5 rounded-full text-[10px] font-black flex items-center justify-center ${isActive ? 'bg-white/20 text-white' : 'bg-amber-500 text-white'}`}>
        {badge > 99 ? '99+' : badge}
      </span>
    )}
    {isCollapsed && (
      <div className="absolute left-full ml-3 px-3 py-1.5 bg-[#060b00] text-white text-xs font-medium rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 shadow-xl border border-white/10 transition-opacity duration-200">
        {label}
      </div>
    )}
  </button>
);

function AppContent() {
  const isMobile = useIsMobile();
  const [activePage, setActivePage] = useState<AdminPage>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const queryClient = useQueryClient();
  const { showToast } = useUI();
  const { signOut, profile } = useAuth();
  const { badgeCount: deliveryBadgeCount } = useDeliveryNavBadge();

  const {
    setPrintItems, setOrderToPrint, setRemainingOrderToPrint, setShipmentToPrint, setOfferToPrint,
    setAggregatedPrintData, setPreparationPrintData,
    setTechnicianPrintData, setAssemblyPrintData, setPriceListPrintData, setAnalyticsPrintData,
    setOrderAnalyticsData, setSupplierOrderToPrint, setStageBatchPrintData,
    printItems, orderToPrint, remainingOrderToPrint, shipmentToPrint, offerToPrint, aggregatedPrintData, preparationPrintData, technicianPrintData, assemblyPrintData, priceListPrintData, analyticsPrintData, orderAnalyticsData, supplierOrderToPrint, stageBatchPrintData
  } = usePrint() || {}; // Handled gracefully if error

  const {
    isOnline,
    isSyncing,
    pendingItems,
    pendingCount,
    refreshQueue,
  } = useConnectivityStatus({
    onSyncCompleted: async (result) => {
      if (result.syncedCount > 0 && result.remainingCount === 0) {
        showToast(`Συγχρονίστηκαν ${result.syncedCount} αλλαγές!`, 'success');
        await queryClient.invalidateQueries();
      } else if (result.syncedCount > 0 && result.remainingCount > 0) {
        showToast(`Συγχρονίστηκαν ${result.syncedCount} αλλαγές, αλλά ${result.remainingCount} παραμένουν εκκρεμείς.`, 'info');
        await queryClient.invalidateQueries();
      } else if (!result.wasQueueEmpty && result.remainingCount > 0) {
        showToast(`Ο συγχρονισμός ολοκληρώθηκε με εκκρεμότητες. Απομένουν ${result.remainingCount} αλλαγές στην ουρά.`, 'info');
        await queryClient.invalidateQueries();
      }
    },
  });

  const [batchPrintSkus, setBatchPrintSkus] = useState('');
  const [resourceTab, setResourceTab] = useState<'materials' | 'molds'>('materials');
  const [photoCatalogPrintData, setPhotoCatalogPrintData] = useState<Product[] | null>(null);
  const [pendingDeliveryOrderId, setPendingDeliveryOrderId] = useState<string | null>(null);

  useEffect(() => {
    if (isLocalMode) return;

    const handleSyncError = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      showToast(detail.message || 'Σφάλμα συγχρονισμού. Το στοιχείο απορρίφθηκε.', 'error');
      void refreshQueue();
    };
    window.addEventListener('ilios-sync-error', handleSyncError);

    return () => {
      window.removeEventListener('ilios-sync-error', handleSyncError);
    };
  }, [refreshQueue, showToast]);

  const { data: settings, isLoading: loadingSettings } = useSettings();
  const { data: materials, isLoading: loadingMaterials } = useMaterials();
  const { data: molds, isLoading: loadingMolds } = useMolds();
  const { data: products, isLoading: loadingProducts } = useProducts();
  const { data: collections, isLoading: loadingCollections } = useCollections();



  if (loadingSettings || loadingMaterials || loadingMolds || loadingProducts || loadingCollections) {
    return <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-50 text-slate-500"><Loader2 size={48} className="animate-spin mb-4 text-amber-500" /><p className="font-medium text-lg">Φόρτωση ERP...</p></div>;
  }
  if (!settings || !products || !materials || !molds || !collections) return null;

  // ROLE-BASED ROUTING
  // 1. Store Clerk ('user') -> Employee App
  if (profile?.role === 'user') {
    return (
      <Suspense fallback={<div className="h-screen w-full flex items-center justify-center bg-slate-50"><Loader2 size={40} className="animate-spin text-amber-500" /></div>}>
        <>
          <PrintManager
            settings={settings}
            products={products}
            materials={materials}
            molds={molds}
            printItems={printItems}
            orderToPrint={orderToPrint}
            remainingOrderToPrint={remainingOrderToPrint}
            shipmentToPrint={shipmentToPrint}
            offerToPrint={offerToPrint}
            supplierOrderToPrint={supplierOrderToPrint}
            aggregatedPrintData={aggregatedPrintData}
            preparationPrintData={preparationPrintData}
            technicianPrintData={technicianPrintData}
            assemblyPrintData={assemblyPrintData}
            priceListPrintData={priceListPrintData}
            analyticsPrintData={analyticsPrintData}
            orderAnalyticsData={orderAnalyticsData}
            photoCatalogPrintData={photoCatalogPrintData}
            stageBatchPrintData={stageBatchPrintData}
            setPrintItems={setPrintItems}
            setOrderToPrint={setOrderToPrint}
            setRemainingOrderToPrint={setRemainingOrderToPrint}
            setShipmentToPrint={setShipmentToPrint}
            setOfferToPrint={setOfferToPrint}
            setSupplierOrderToPrint={setSupplierOrderToPrint}
            setAggregatedPrintData={setAggregatedPrintData}
            setPreparationPrintData={setPreparationPrintData}
            setTechnicianPrintData={setTechnicianPrintData}
            setAssemblyPrintData={setAssemblyPrintData}
            setPriceListPrintData={setPriceListPrintData}
            setAnalyticsPrintData={setAnalyticsPrintData}
            setOrderAnalyticsData={setOrderAnalyticsData}
            setPhotoCatalogPrintData={setPhotoCatalogPrintData}
            setStageBatchPrintData={setStageBatchPrintData}
          />
          <EmployeeApp setPrintItems={setPrintItems} />
        </>
      </Suspense>
    );
  }

  // 2. Seller ('seller') -> Seller App (NEW)
  if (profile?.role === 'seller') {
    return (
      <Suspense fallback={<div className="h-screen w-full flex items-center justify-center bg-slate-50"><Loader2 size={40} className="animate-spin text-amber-500" /></div>}>
        <SellerApp />
      </Suspense>
    );
  }

  // 3. Admin Logic
  if (profile?.role === 'admin') {
    if (isMobile) {
      return (
        <Suspense fallback={<div className="h-screen w-full flex items-center justify-center bg-slate-50"><Loader2 size={40} className="animate-spin text-amber-500" /></div>}>
          <MobileApp
            isOnline={isOnline}
            isSyncing={isSyncing}
            pendingItemsCount={pendingCount}
          />
        </Suspense>
      );
    }

    // Desktop Admin is handled below
  } else {
    // Fallback for unknown role or error state (should be caught by AuthGuard, but safety first)
    if (!isLocalMode) {
      return (
        <div className="h-screen flex items-center justify-center bg-slate-50">
          <div className="text-center">
            <h2 className="text-xl font-bold text-red-600 mb-2">Μη εξουσιοδοτημένη πρόσβαση</h2>
            <p className="text-slate-500 mb-4">Ο ρόλος σας ({profile?.role}) δεν αναγνωρίζεται.</p>
            <button onClick={() => signOut()} className="underline">Αποσύνδεση</button>
          </div>
        </div>
      );
    }
  }

  const handleNav = (page: AdminPage) => {
    setActivePage(page);
    setIsSidebarOpen(false);
  };

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
  };

  const handlePrintAggregated = (batches: ProductionBatch[], orderDetails?: { orderId: string, customerName: string }) => {
    const aggregatedData = buildAggregatedPrintData(batches, products, materials, settings, {
      splitImportedBatches: true,
      orderId: orderDetails?.orderId,
      customerName: orderDetails?.customerName,
    });
    if (aggregatedData) {
      setAggregatedPrintData(aggregatedData);
    }
  };

  const handlePrintPreparation = (batches: ProductionBatch[]) => {
    setPreparationPrintData({ batches });
  };

  const handlePrintTechnician = (batches: ProductionBatch[]) => {
    setTechnicianPrintData({ batches });
  };

  const handlePrintAssembly = (data: AssemblyPrintData) => {
    setAssemblyPrintData(data);
  };

  const handlePrintStageBatches = (data: StageBatchPrintData) => {
    setStageBatchPrintData(data);
  };

  const handlePrintOrderAnalytics = (order: Order) => {
    if (!products || !materials || !settings) return;

    // Calculate Stats Specifically for this order
    const stats = calculateBusinessStats([order], products, materials, settings);

    if (stats) {
      // Use the specific Order Analytics Component
      setOrderAnalyticsData({ stats, order });
    } else {
      showToast("Δεν ήταν δυνατός ο υπολογισμός των οικονομικών στοιχείων.", "error");
    }
  };

  // DESKTOP RENDERING (ADMIN)
  // This part runs only if role is 'admin' and !isMobile, or if isLocalMode is true
  const handleLogout = () => { localStorage.removeItem('ILIOS_LOCAL_MODE'); signOut(); };
  const hiddenInLocalMode = new Set<AdminPage>(['deliveries', 'orders', 'offers', 'production', 'customers', 'suppliers']);

  const adminPageRegistry: Record<AdminPage, React.ReactNode> = {
    dashboard: <Dashboard products={products} settings={settings} onNavigate={handleNav} />,
    registry: <ProductRegistry setPrintItems={setPrintItems} />,
    inventory: <Inventory products={products} setPrintItems={setPrintItems} settings={settings} collections={collections} molds={molds} />,
    pricing: <PricingManager products={products} settings={settings} materials={materials} />,
    settings: <SettingsPage />,
    resources: (
      <div className="space-y-6">
        <div className="bg-white p-2 rounded-2xl shadow-sm border border-slate-100 w-fit flex gap-2 mx-auto sm:mx-0 overflow-x-auto">
          <button onClick={() => setResourceTab('materials')} className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2 whitespace-nowrap ${resourceTab === 'materials' ? 'bg-[#060b00] text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}><Gem size={18} /> Υλικά</button>
          <button onClick={() => setResourceTab('molds')} className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2 whitespace-nowrap ${resourceTab === 'molds' ? 'bg-[#060b00] text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}><MapPin size={18} /> Λάστιχα</button>
        </div>
        {resourceTab === 'materials' && <MaterialsPage settings={settings} />}
        {resourceTab === 'molds' && <MoldsPage />}
      </div>
    ),
    collections: <CollectionsPage products={products} onPrint={(data) => setPriceListPrintData(data)} />,
    'batch-print': <BatchPrintPage allProducts={products} allCollections={collections} setPrintItems={setPrintItems} skusText={batchPrintSkus} setSkusText={setBatchPrintSkus} onPrintPhotoCatalog={setPhotoCatalogPrintData} />,
    orders: <OrdersPage products={products} onPrintOrder={setOrderToPrint} onPrintRemainingOrder={setRemainingOrderToPrint} onPrintShipment={setShipmentToPrint} materials={materials} onPrintAggregated={handlePrintAggregated} onPrintPreparation={handlePrintPreparation} onPrintTechnician={handlePrintTechnician} onPrintLabels={setPrintItems} onPrintAnalytics={handlePrintOrderAnalytics} onOpenDeliveries={(order) => {
      setPendingDeliveryOrderId(order.id);
      handleNav('deliveries');
    }} onPrintPartialOrder={(order, batches) => {
      setOrderToPrint(buildPartialOrderFromBatches(order, batches));
    }} />,
    production: <ProductionPage products={products} materials={materials} molds={molds} onPrintAggregated={handlePrintAggregated} onPrintPreparation={handlePrintPreparation} onPrintTechnician={handlePrintTechnician} onPrintAssembly={handlePrintAssembly} onPrintLabels={setPrintItems} onPrintStageBatches={handlePrintStageBatches} />,
    customers: <CustomersPage onPrintOrder={setOrderToPrint} />,
    suppliers: <SuppliersPage />,
    'ai-studio': <AiStudio />,
    pricelist: <PriceListPage products={products} collections={collections} onPrint={(data) => setPriceListPrintData(data)} />,
    analytics: <AnalyticsView products={products} onBack={() => handleNav('dashboard')} onPrint={(data) => setAnalyticsPrintData({ ...data, title: 'Οικονομική Ανάλυση' })} />,
    offers: <OffersPage products={products} materials={materials} settings={settings} collections={collections} onPrintOffer={setOfferToPrint} />,
    deliveries: <DeliveriesPage pendingOrderId={pendingDeliveryOrderId} onConsumePendingOrderId={() => setPendingDeliveryOrderId(null)} onOpenOrder={() => handleNav('orders')} />,
  };

  return (
    <>
      <SyncStatusIndicator pendingItems={pendingItems} isOnline={isOnline} isSyncing={isSyncing} />

      <PrintManager
        settings={settings}
        products={products}
        materials={materials}
        molds={molds}
        printItems={printItems}
        orderToPrint={orderToPrint}
        remainingOrderToPrint={remainingOrderToPrint}
        shipmentToPrint={shipmentToPrint}
        offerToPrint={offerToPrint}
        supplierOrderToPrint={supplierOrderToPrint}
        aggregatedPrintData={aggregatedPrintData}
        preparationPrintData={preparationPrintData}
        technicianPrintData={technicianPrintData}
        assemblyPrintData={assemblyPrintData}
        priceListPrintData={priceListPrintData}
        analyticsPrintData={analyticsPrintData}
        orderAnalyticsData={orderAnalyticsData}
        photoCatalogPrintData={photoCatalogPrintData}
        stageBatchPrintData={stageBatchPrintData}
        setPrintItems={setPrintItems}
        setOrderToPrint={setOrderToPrint}
        setRemainingOrderToPrint={setRemainingOrderToPrint}
        setShipmentToPrint={setShipmentToPrint}
        setOfferToPrint={setOfferToPrint}
        setSupplierOrderToPrint={setSupplierOrderToPrint}
        setAggregatedPrintData={setAggregatedPrintData}
        setPreparationPrintData={setPreparationPrintData}
        setTechnicianPrintData={setTechnicianPrintData}
        setAssemblyPrintData={setAssemblyPrintData}
        setPriceListPrintData={setPriceListPrintData}
        setAnalyticsPrintData={setAnalyticsPrintData}
        setOrderAnalyticsData={setOrderAnalyticsData}
        setPhotoCatalogPrintData={setPhotoCatalogPrintData}
        setStageBatchPrintData={setStageBatchPrintData}
      />

      <div id="app-container" className="flex h-screen overflow-hidden text-[#060b00] bg-slate-50 font-sans">
        {isSidebarOpen && <div className="fixed inset-0 bg-[#060b00]/60 backdrop-blur-sm z-40 md:hidden animate-in fade-in" onClick={() => setIsSidebarOpen(false)} />}
        <aside className={`fixed inset-y-0 left-0 z-40 bg-[#060b00] text-white transition-all duration-500 shadow-2xl flex flex-col ${isSidebarOpen ? 'translate-x-0 w-72' : '-translate-x-full md:translate-x-0'} ${isCollapsed ? 'md:w-20' : 'md:w-72'} border-r border-white/5`}>
          <div className={`p-6 flex items-center justify-center h-24 relative bg-black/20`}>
            {!isCollapsed ? <img src={APP_LOGO} alt="Ilios" className="h-16 w-auto object-contain drop-shadow-lg" /> : <img src={APP_ICON_ONLY} alt="Icon" className="w-10 h-10 object-contain" />}
            <button onClick={() => setIsSidebarOpen(false)} className="md:hidden text-slate-400 hover:text-white absolute right-4 top-6"><X size={24} /></button>
          </div>
          <div className={`px-4 py-2 flex items-center gap-3 ${isCollapsed ? 'justify-center' : 'justify-start'}`}>
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${isLocalMode ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : isOnline ? (isSyncing || pendingCount > 0 ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20') : 'bg-rose-500/10 text-rose-400 border-rose-500/20'}`}>
              {isLocalMode ? <><HardDrive size={12} /> {!isCollapsed && 'ΤΟΠΙΚΗ ΒΑΣΗ'}</> : isSyncing ? <><RefreshCw size={12} className="animate-spin" /> {!isCollapsed && 'ΣΥΓΧΡΟΝΙΣΜΟΣ'}</> : pendingCount > 0 ? <><RefreshCw size={12} /> {!isCollapsed && `${pendingCount} ΕΚΚΡΕΜΕΙ`}</> : isOnline ? <><Cloud size={12} className="animate-pulse" /> {!isCollapsed && 'ΣΥΝΔΕΔΕΜΕΝΟ'}</> : <><HardDrive size={12} /> {!isCollapsed && 'ΕΚΤΟΣ ΣΥΝΔΕΣΗΣ'}</>}
            </div>
          </div>
          <nav className="flex-1 py-6 px-3 space-y-1 overflow-y-auto scrollbar-hide">
            {adminNavSections.map((section, sectionIndex) => {
              const visibleItems = section.items.filter((item) => !isLocalMode || !hiddenInLocalMode.has(item.id));
              if (visibleItems.length === 0) return null;
              return (
                <React.Fragment key={`admin-nav-section-${sectionIndex}`}>
                  {sectionIndex > 0 && <div className="my-2 border-t border-white/10 mx-2"></div>}
                  {visibleItems.map((item) => (
                    <NavItem
                      key={item.id}
                      icon={renderNavIcon(item.icon, 22)}
                      label={item.label}
                      isActive={activePage === item.id}
                      isCollapsed={isCollapsed}
                      onClick={() => handleNav(item.id)}
                      badge={item.id === 'deliveries' ? deliveryBadgeCount : undefined}
                    />
                  ))}
                </React.Fragment>
              );
            })}
            <div className="mt-auto pt-6">
              {adminFooterNavItems.map((item) => (
                <NavItem
                  key={item.id}
                  icon={renderNavIcon(item.icon, 22)}
                  label={item.label}
                  isActive={activePage === item.id}
                  isCollapsed={isCollapsed}
                  onClick={() => handleNav(item.id)}
                />
              ))}
              <div className={`mt-4 pt-4 border-t border-white/10 w-full ${isCollapsed ? 'flex flex-col items-center gap-4' : 'px-4 flex items-center justify-between'}`}>
                <button onClick={handleLogout} className="flex-1 flex items-center gap-2 p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg min-w-0">
                  <LogOut size={18} className="shrink-0" />
                  {!isCollapsed && <span className="text-sm font-medium truncate">{profile?.full_name || 'User'}</span>}
                </button>
                {adminQuickActionNavItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleNav(item.id)}
                    title={item.label}
                    className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg shrink-0 ${activePage === item.id ? 'bg-emerald-50 text-white ring-2 ring-emerald-500/20' : 'bg-emerald-900/40 text-emerald-300 hover:bg-emerald-800 hover:text-white'}`}
                  >
                    {renderNavIcon(item.icon, 14, activePage === item.id ? 2.5 : 2)}
                  </button>
                ))}
              </div>
            </div>
          </nav>
          <div className="p-4 bg-black/20">
            <button onClick={toggleCollapse} className="hidden md:flex w-full items-center justify-center p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors">{isCollapsed ? <ChevronRight size={20} /> : <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider"><ChevronLeft size={16} /> <span>Σύμπτυξη</span></div>}</button>
            {!isCollapsed && <div className="mt-4 text-[10px] text-slate-500 text-center font-medium"><p>Τιμή Ασημιού: <span className="text-amber-500">{settings.silver_price_gram.toFixed(3)}€</span></p><p className="opacity-50 mt-1">v1.2</p></div>}
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
              <Suspense fallback={<ContentLoader />}>
              {adminPageRegistry[activePage]}
              </Suspense>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}

export default function App() {
  if (!isConfigured) {
    return (
      <UIProvider>
        <SetupScreen />
      </UIProvider>
    );
  }
  return (
    <AuthProvider>
      <AuthGuard>
        <PrintProvider>
          <AppContent />
        </PrintProvider>
      </AuthGuard>
    </AuthProvider>
  );
}
