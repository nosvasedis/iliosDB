import React, { Suspense, useState, useEffect } from 'react';
import {
  Menu,
  X,
  LogOut,
  ShieldAlert,
} from 'lucide-react';
import { APP_LOGO, APP_ICON_ONLY } from './constants';
import { isConfigured, isLocalMode } from './lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateAfterOfflineSync } from './lib/syncInvalidation';
import { Product, Order, ProductionBatch, AssemblyPrintData, StageBatchPrintData } from './types';
import { UIProvider, useUI } from './components/UIProvider';
import { AuthProvider, useAuth } from './components/AuthContext';

// API Hooks
import { useProducts } from './hooks/api/useProducts';
import { useMaterials } from './hooks/api/useMaterials';
import { useMolds } from './hooks/api/useMolds';
import { useSettings } from './hooks/api/useSettings';
import { useCollections } from './hooks/api/useCollections';
import { useAllShipmentItems, useAllShipments } from './hooks/api/useOrders';

import AuthScreen, { PendingApprovalScreen } from './components/AuthScreen';
import { calculateBusinessStats } from './utils/businessAnalytics';
import { useIsMobile } from './hooks/useIsMobile';
import { PrintManager } from './components/PrintManager';
import { SyncStatusIndicator } from './components/SyncStatusIndicator';
import { LiveActivityFeed } from './components/LiveActivityFeed';
import { useLiveActivity } from './hooks/useLiveActivity';
import { useRealtimeInvalidation } from './hooks/api/useRealtimeInvalidation';
import { lazyWithChunkRecovery } from './lib/chunkLoadRecovery';

import SetupScreen from './components/SetupScreen';
import { PrintProvider, usePrint } from './components/PrintContext';
import { useDeliveryNavBadge } from './hooks/api/useOrderDeliveryPlans';
import { buildPartialOrderFromBatches } from './features/orders';
import { useConnectivityStatus } from './app-shell/useConnectivityStatus';
import { buildAggregatedPrintData } from './features/printing';
import { adminFooterNavItems, adminNavSections, adminQuickActionNavItems, renderNavIcon } from './surfaces/navConfig';
import type { AdminPage } from './surfaces/pageIds';
import { isInspectionModeActive } from './lib/inspectionMode';
import InspectionModeShell from './components/InspectionModeShell';
import { InspectionModeProvider } from './components/InspectionModeProvider';
import IliosLoader from './components/ui/IliosLoader';
import {
  SidebarCollapseButton,
  SidebarConnectionBadge,
  SidebarNavButton,
  SidebarOverlayScrim,
  SidebarVersionMark,
  sidebarAsideClass,
  sidebarMainClass,
} from './components/layout/SidebarChrome';
import { prefersCollapsedDesktopSidebar } from './features/layout/sidebarChrome';

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
const SellersPage = lazyPage(() => import('./components/SellersPage'));
const AiStudio = lazyPage(() => import('./components/AiStudio'));
const PriceListPage = lazyPage(() => import('./components/PriceListPage'));
const AnalyticsView = lazyPage(() => import('./components/AnalyticsView'));
const OffersPage = lazyPage(() => import('./components/OffersPage'));
const DeliveriesPage = lazyPage(() => import('./components/DeliveriesPage'));
const LegalDocumentsPage = lazyPage(() => import('./components/LegalDocumentsPage'));
const CustomerServiceWorkspace = lazyPage(() => import('./components/CustomerServiceWorkspace'));

const adminLoadingDetails: Record<AdminPage, string> = {
  dashboard: 'Πίνακας ελέγχου',
  registry: 'Μητρώο κωδικών',
  inventory: 'Αποθήκη & στοκ',
  pricing: 'Τιμολόγηση',
  settings: 'Ρυθμίσεις',
  resources: 'Υλικά & λάστιχα',
  collections: 'Συλλογές',
  'batch-print': 'Μαζική εκτύπωση',
  orders: 'Παραγγελίες',
  production: 'Παραγωγή',
  consignments: 'Παρακαταθήκες',
  repairs: 'Επισκευές',
  customers: 'Πελάτες',
  suppliers: 'Προμηθευτές',
  sellers: 'Πλασιέ',
  'ai-studio': 'AI Studio',
  pricelist: 'Τιμοκατάλογος',
  analytics: 'Οικονομικά',
  offers: 'Προσφορές',
  deliveries: 'Ημερολόγιο',
  legal: 'Παραστατικά',
};


function AuthGuard({ children }: { children?: React.ReactNode }) {
  const { session, loading, profile, signOut, refreshProfile } = useAuth();

  if (isLocalMode) return <>{children}</>;

  if (loading) {
    return <IliosLoader variant="screen" detail="Έλεγχος πρόσβασης" />;
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


function AppContent() {
  const { profile } = useAuth();
  const isMobile = useIsMobile();

  if (profile?.role === 'admin' && !isMobile && isInspectionModeActive()) {
    return <InspectionModeShell />;
  }

  return <ErpAppContent />;
}

function ErpAppContent() {
  const isMobile = useIsMobile();
  const [activePage, setActivePage] = useState<AdminPage>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(() =>
    typeof window !== 'undefined' ? prefersCollapsedDesktopSidebar(window.innerWidth) : false
  );

  const queryClient = useQueryClient();
  const { showToast } = useUI();
  const { signOut, profile } = useAuth();
  const { badgeCount: deliveryBadgeCount } = useDeliveryNavBadge();
  const { notifications: liveNotifications, dismiss: dismissLiveNotification } = useLiveActivity();
  useRealtimeInvalidation(profile?.role === 'seller' ? 'seller' : 'erp');

  const {
    setPrintItems, setOrderToPrint, setRemainingOrderToPrint, setShipmentToPrint, setShipmentsToPrint, setOfferToPrint,
    setAggregatedPrintData, setPreparationPrintData,
    setTechnicianPrintData, setAssemblyPrintData, setPriceListPrintData, setAnalyticsPrintData,
    setSkuSalesPrintData,
    setOrderAnalyticsData, setSupplierOrderToPrint, setStageBatchPrintData, setLegalDocumentToPrint, setProformaToPrint,
    printItems, orderToPrint, remainingOrderToPrint, shipmentToPrint, shipmentsToPrint, offerToPrint, aggregatedPrintData, preparationPrintData, technicianPrintData, assemblyPrintData, priceListPrintData, analyticsPrintData, skuSalesPrintData, orderAnalyticsData, supplierOrderToPrint, stageBatchPrintData, legalDocumentToPrint, proformaToPrint
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
        await invalidateAfterOfflineSync(queryClient, result.syncedTables);
      } else if (result.syncedCount > 0 && result.remainingCount > 0) {
        showToast(`Συγχρονίστηκαν ${result.syncedCount} αλλαγές, αλλά ${result.remainingCount} παραμένουν εκκρεμείς.`, 'info');
        await invalidateAfterOfflineSync(queryClient, result.syncedTables);
      } else if (!result.wasQueueEmpty && result.remainingCount > 0) {
        showToast(`Ο συγχρονισμός ολοκληρώθηκε με εκκρεμότητες. Απομένουν ${result.remainingCount} αλλαγές στην ουρά.`, 'info');
        await invalidateAfterOfflineSync(queryClient, result.syncedTables);
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

  const shouldLoadErpData = profile?.role !== 'seller';
  const { data: settings, isLoading: loadingSettings } = useSettings({ enabled: shouldLoadErpData });
  const { data: materials, isLoading: loadingMaterials } = useMaterials({ enabled: shouldLoadErpData });
  const { data: molds, isLoading: loadingMolds } = useMolds({ enabled: shouldLoadErpData });
  const { data: products, isLoading: loadingProducts } = useProducts({ enabled: shouldLoadErpData });
  const { data: collections, isLoading: loadingCollections } = useCollections({ enabled: shouldLoadErpData });
  const { data: allShipments } = useAllShipments({ enabled: shouldLoadErpData });
  const { data: allShipmentItems } = useAllShipmentItems({ enabled: shouldLoadErpData });



  // Seller mode uses its own lightweight catalog queries, so do not block it on
  // the full ERP graph needed by admin/employee screens.
  if (profile?.role === 'seller') {
    return (
      <Suspense fallback={<IliosLoader variant="screen" detail="Άνοιγμα χώρου πλασιέ" />}>
        <SellerApp />
      </Suspense>
    );
  }

  if (loadingSettings || loadingMaterials || loadingMolds || loadingProducts || loadingCollections) {
    return <IliosLoader variant="screen" detail="Συγχρονισμός δεδομένων" />;
  }
  if (!settings || !products || !materials || !molds || !collections) return null;

  // ROLE-BASED ROUTING
  // 1. Store Clerk ('user') -> Employee App
  if (profile?.role === 'user') {
    return (
      <Suspense fallback={<IliosLoader variant="screen" detail="Άνοιγμα εργαστηρίου" />}>
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
            shipmentsToPrint={shipmentsToPrint}
            offerToPrint={offerToPrint}
            supplierOrderToPrint={supplierOrderToPrint}
            aggregatedPrintData={aggregatedPrintData}
            preparationPrintData={preparationPrintData}
            technicianPrintData={technicianPrintData}
            assemblyPrintData={assemblyPrintData}
            priceListPrintData={priceListPrintData}
            analyticsPrintData={analyticsPrintData}
            skuSalesPrintData={skuSalesPrintData}
            orderAnalyticsData={orderAnalyticsData}
            photoCatalogPrintData={photoCatalogPrintData}
            stageBatchPrintData={stageBatchPrintData}
            legalDocumentToPrint={legalDocumentToPrint}
            proformaToPrint={proformaToPrint}
            setPrintItems={setPrintItems}
            setOrderToPrint={setOrderToPrint}
            setRemainingOrderToPrint={setRemainingOrderToPrint}
            setShipmentToPrint={setShipmentToPrint}
            setShipmentsToPrint={setShipmentsToPrint}
            setOfferToPrint={setOfferToPrint}
            setSupplierOrderToPrint={setSupplierOrderToPrint}
            setAggregatedPrintData={setAggregatedPrintData}
            setPreparationPrintData={setPreparationPrintData}
            setTechnicianPrintData={setTechnicianPrintData}
            setAssemblyPrintData={setAssemblyPrintData}
            setPriceListPrintData={setPriceListPrintData}
            setAnalyticsPrintData={setAnalyticsPrintData}
            setSkuSalesPrintData={setSkuSalesPrintData}
            setOrderAnalyticsData={setOrderAnalyticsData}
            setPhotoCatalogPrintData={setPhotoCatalogPrintData}
            setStageBatchPrintData={setStageBatchPrintData}
            setLegalDocumentToPrint={setLegalDocumentToPrint}
            setProformaToPrint={setProformaToPrint}
          />
          <EmployeeApp setPrintItems={setPrintItems} />
        </>
      </Suspense>
    );
  }

  // 2. Admin Logic
  if (profile?.role === 'admin') {
    if (isMobile) {
      return (
        <Suspense fallback={<IliosLoader variant="screen" detail="Άνοιγμα mobile εργαστηρίου" />}>
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
    setIsCollapsed((current) => !current);
  };
  const railMode = isCollapsed && !isSidebarOpen;

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
    if (!allShipments || !allShipmentItems) {
      showToast('Τα στοιχεία αποστολών φορτώνονται ακόμη. Δοκιμάστε ξανά σε λίγο.', 'info');
      return;
    }

    const orderShipments = allShipments.filter((shipment) => shipment.order_id === order.id);
    const orderShipmentIds = new Set(orderShipments.map((shipment) => shipment.id));
    const orderShipmentItems = allShipmentItems.filter((item) => orderShipmentIds.has(item.shipment_id));
    const stats = calculateBusinessStats([order], products, materials, settings, {
      shipments: orderShipments,
      shipmentItems: orderShipmentItems,
      collections,
      period: { mode: 'all_time' },
    });

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
  const hiddenInLocalMode = new Set<AdminPage>(['deliveries', 'orders', 'offers', 'production', 'consignments', 'repairs', 'customers', 'suppliers', 'legal']);

  const adminPageRegistry: Record<AdminPage, React.ReactNode> = {
    dashboard: <Dashboard products={products} settings={settings} onNavigate={handleNav} />,
    registry: <ProductRegistry setPrintItems={setPrintItems} />,
    inventory: <Inventory products={products} setPrintItems={setPrintItems} settings={settings} collections={collections} molds={molds} />,
    pricing: <PricingManager products={products} settings={settings} materials={materials} />,
    settings: <SettingsPage />,
    resources: (
      <div className="space-y-6">
        {resourceTab === 'materials' && <MaterialsPage settings={settings} resourceTab={resourceTab} onResourceTabChange={setResourceTab} />}
        {resourceTab === 'molds' && <MoldsPage resourceTab={resourceTab} onResourceTabChange={setResourceTab} />}
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
    consignments: <CustomerServiceWorkspace mode="consignments" />,
    repairs: <CustomerServiceWorkspace mode="repairs" />,
    customers: <CustomersPage onPrintOrder={setOrderToPrint} />,
    suppliers: <SuppliersPage />,
    sellers: <SellersPage />,
    'ai-studio': <AiStudio />,
    pricelist: <PriceListPage products={products} collections={collections} onPrint={(data) => setPriceListPrintData(data)} />,
    analytics: <AnalyticsView products={products} onBack={() => handleNav('dashboard')} onPrint={(data) => setAnalyticsPrintData({ ...data, title: 'Οικονομική Ανάλυση' })} />,
    offers: <OffersPage products={products} materials={materials} settings={settings} collections={collections} onPrintOffer={setOfferToPrint} />,
    deliveries: <DeliveriesPage pendingOrderId={pendingDeliveryOrderId} onConsumePendingOrderId={() => setPendingDeliveryOrderId(null)} onOpenOrder={() => handleNav('orders')} />,
    legal: <LegalDocumentsPage products={products} onPrintLegalDocument={setLegalDocumentToPrint} onPrintProforma={setProformaToPrint} />,
  };

  return (
    <>
      <SyncStatusIndicator pendingItems={pendingItems} isOnline={isOnline} isSyncing={isSyncing} />
      <LiveActivityFeed notifications={liveNotifications} onDismiss={dismissLiveNotification} />

      <PrintManager
        settings={settings}
        products={products}
        materials={materials}
        molds={molds}
        printItems={printItems}
        orderToPrint={orderToPrint}
        remainingOrderToPrint={remainingOrderToPrint}
        shipmentToPrint={shipmentToPrint}
        shipmentsToPrint={shipmentsToPrint}
        offerToPrint={offerToPrint}
        supplierOrderToPrint={supplierOrderToPrint}
        aggregatedPrintData={aggregatedPrintData}
        preparationPrintData={preparationPrintData}
        technicianPrintData={technicianPrintData}
        assemblyPrintData={assemblyPrintData}
        priceListPrintData={priceListPrintData}
        analyticsPrintData={analyticsPrintData}
        skuSalesPrintData={skuSalesPrintData}
        orderAnalyticsData={orderAnalyticsData}
        photoCatalogPrintData={photoCatalogPrintData}
        stageBatchPrintData={stageBatchPrintData}
        legalDocumentToPrint={legalDocumentToPrint}
        proformaToPrint={proformaToPrint}
        setPrintItems={setPrintItems}
        setOrderToPrint={setOrderToPrint}
        setRemainingOrderToPrint={setRemainingOrderToPrint}
        setShipmentToPrint={setShipmentToPrint}
        setShipmentsToPrint={setShipmentsToPrint}
        setOfferToPrint={setOfferToPrint}
        setSupplierOrderToPrint={setSupplierOrderToPrint}
        setAggregatedPrintData={setAggregatedPrintData}
        setPreparationPrintData={setPreparationPrintData}
        setTechnicianPrintData={setTechnicianPrintData}
        setAssemblyPrintData={setAssemblyPrintData}
        setPriceListPrintData={setPriceListPrintData}
        setAnalyticsPrintData={setAnalyticsPrintData}
        setSkuSalesPrintData={setSkuSalesPrintData}
        setOrderAnalyticsData={setOrderAnalyticsData}
        setPhotoCatalogPrintData={setPhotoCatalogPrintData}
        setStageBatchPrintData={setStageBatchPrintData}
        setLegalDocumentToPrint={setLegalDocumentToPrint}
        setProformaToPrint={setProformaToPrint}
      />

      <div id="app-container" className="flex h-screen overflow-hidden text-[#060b00] bg-slate-50 font-sans">
        {isSidebarOpen && <div className="fixed inset-0 bg-[#060b00]/60 backdrop-blur-sm z-40 md:hidden animate-in fade-in" onClick={() => setIsSidebarOpen(false)} />}
        <SidebarOverlayScrim visible={!isCollapsed} onDismiss={() => setIsCollapsed(true)} />
        <aside className={sidebarAsideClass(railMode, isSidebarOpen)}>
          <div className={`relative flex items-center justify-center border-b border-white/[0.06] ${railMode ? 'h-[3.75rem] px-2' : 'h-16 px-4'}`}>
            {!railMode ? (
              <img src={APP_LOGO} alt="Ilios" className="h-10 w-auto object-contain drop-shadow-lg" />
            ) : (
              <img src={APP_ICON_ONLY} alt="Ilios" className="h-8 w-8 object-contain" />
            )}
            <div className={`absolute ${railMode ? 'bottom-1.5 right-1.5' : 'right-12 top-1/2 -translate-y-1/2 md:right-3'}`}>
              <SidebarConnectionBadge
                isLocalMode={isLocalMode}
                isOnline={isOnline}
                isSyncing={isSyncing}
                pendingCount={pendingCount}
              />
            </div>
            <button onClick={() => setIsSidebarOpen(false)} className="absolute right-3 top-4 text-slate-400 hover:text-white md:hidden"><X size={20} /></button>
          </div>
          <SidebarCollapseButton isCollapsed={isCollapsed} onToggle={toggleCollapse} />
          <nav className="flex min-h-0 flex-1 flex-col space-y-0.5 overflow-y-auto px-2 py-3 scrollbar-hide">
            {adminNavSections.map((section, sectionIndex) => {
              const visibleItems = section.items.filter((item) => !isLocalMode || !hiddenInLocalMode.has(item.id));
              if (visibleItems.length === 0) return null;
              return (
                <React.Fragment key={`admin-nav-section-${sectionIndex}`}>
                  {sectionIndex > 0 && <div className="mx-2 my-1.5 border-t border-white/[0.07]"></div>}
                  {visibleItems.map((item) => (
                    <SidebarNavButton
                      key={item.id}
                      icon={renderNavIcon(item.icon, 18)}
                      label={item.label}
                      isActive={activePage === item.id}
                      isCollapsed={railMode}
                      onClick={() => handleNav(item.id)}
                      badge={item.id === 'deliveries' ? deliveryBadgeCount : undefined}
                    />
                  ))}
                </React.Fragment>
              );
            })}
            <div className="mt-auto pt-3">
              {adminFooterNavItems.map((item) => (
                <SidebarNavButton
                  key={item.id}
                  icon={renderNavIcon(item.icon, 18)}
                  label={item.label}
                  isActive={activePage === item.id}
                  isCollapsed={railMode}
                  onClick={() => handleNav(item.id)}
                />
              ))}
              <div className={`mt-3 border-t border-white/[0.07] pt-3 ${railMode ? 'flex flex-col items-center gap-2' : 'flex items-center gap-2 px-1'}`}>
                <button
                  onClick={handleLogout}
                  title={profile?.full_name ? `Αποσύνδεση · ${profile.full_name}` : 'Αποσύνδεση'}
                  className={`flex min-w-0 items-center rounded-xl text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-white ${railMode ? 'h-9 w-9 justify-center' : 'flex-1 gap-2 px-2 py-2'}`}
                >
                  <LogOut size={16} className="shrink-0" />
                  {!railMode && <span className="truncate text-[13px] font-medium">{profile?.full_name || 'User'}</span>}
                </button>
                {adminQuickActionNavItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleNav(item.id)}
                    title={item.label}
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all duration-200 ${activePage === item.id ? 'bg-amber-400 text-[#060b00] shadow-[0_0_12px_rgba(251,191,36,0.35)]' : 'bg-white/[0.06] text-amber-300/80 hover:bg-amber-400/20 hover:text-amber-200'}`}
                  >
                    {renderNavIcon(item.icon, 14, activePage === item.id ? 2.5 : 2)}
                  </button>
                ))}
              </div>
            </div>
          </nav>
          <div className={`border-t border-white/[0.06] ${railMode ? 'px-1 py-2.5' : 'px-3 py-2.5'}`}>
            <SidebarVersionMark compact={railMode} />
          </div>
        </aside>
        <main className={sidebarMainClass(isCollapsed)}>
          <header className="md:hidden bg-white/80 backdrop-blur-md p-4 shadow-sm flex items-center justify-between z-30 sticky top-0 border-b border-slate-200">
            <button onClick={() => setIsSidebarOpen(true)} className="text-slate-600 p-1 hover:bg-slate-100 rounded-lg"><Menu size={24} /></button>
            <div className="h-8"><img src={APP_LOGO} alt="Ilios" className="h-full w-auto object-contain" /></div>
            <div className={`w-2 h-2 rounded-full ${isLocalMode ? 'bg-amber-500' : isOnline ? (pendingCount > 0 ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500') : 'bg-rose-500 animate-pulse'}`} />
          </header>
          <div className={`flex-1 p-4 md:p-8 relative scroll-smooth ${activePage === 'production' ? 'min-h-0 overflow-hidden' : 'overflow-y-auto'}`}>
            <div className={`max-w-[1600px] mx-auto ${activePage === 'production' ? 'flex h-full min-h-0 flex-col' : ''}`} key={activePage}>
              <Suspense fallback={<IliosLoader variant="section" detail={adminLoadingDetails[activePage]} />}>
              <div className={`animate-in fade-in slide-in-from-bottom-3 duration-400 ${activePage === 'production' ? 'flex min-h-0 h-full flex-col' : ''}`}>
              {adminPageRegistry[activePage]}
              </div>
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
        <InspectionModeProvider>
          <PrintProvider>
            <AppContent />
          </PrintProvider>
        </InspectionModeProvider>
      </AuthGuard>
    </AuthProvider>
  );
}
