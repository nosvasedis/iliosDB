
import React, { useState, useEffect, useRef } from 'react';
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
  MonitorOff,
  CheckCircle,
  CloudOff,
  ScrollText,
  ShieldAlert,
  TrendingUp
} from 'lucide-react';
import { APP_LOGO, APP_ICON_ONLY } from './constants';
import { api, isConfigured, isLocalMode } from './lib/supabase';
import { offlineDb } from './lib/offlineDb';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Product, ProductVariant, GlobalSettings, Order, Material, Mold, Collection, ProductionBatch, RecipeItem, OrderStatus, ProductionStage, Gender, PlatingType, AggregatedData, AggregatedBatch } from './types';
import { useUI } from './components/UIProvider';
import { AuthProvider, useAuth } from './components/AuthContext';
import AuthScreen, { PendingApprovalScreen } from './components/AuthScreen';
import { calculateProductCost, estimateVariantCost } from './utils/pricingEngine';
import { useIsMobile } from './hooks/useIsMobile';
import MobileApp from './MobileApp';
import EmployeeApp from './components/employee/EmployeeApp';
import SellerApp from './components/seller/SellerApp'; // Import Seller App

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
import SetupScreen from './components/SetupScreen';
import PriceListPage from './components/PriceListPage';
import PriceListPrintView, { PriceListPrintData } from './components/PriceListPrintView';
import AnalyticsView, { AnalyticsPrintReport, calculateBusinessStats } from './components/AnalyticsView';


type Page = 'dashboard' | 'registry' | 'inventory' | 'pricing' | 'settings' | 'resources' | 'collections' | 'batch-print' | 'orders' | 'production' | 'customers' | 'ai-studio' | 'pricelist' | 'analytics';

// Visual Sync Indicator Component
const SyncStatusIndicator = ({ pendingItems, isOnline, isSyncing }: { pendingItems: any[], isOnline: boolean, isSyncing: boolean }) => {
    const pendingCount = pendingItems.length;
    if (pendingCount === 0 && !isSyncing && isOnline) return null;

    const translateMethod = (method: string) => {
        switch(method) {
            case 'INSERT': return 'ΕΙΣΑΓΩΓΗ';
            case 'UPDATE': return 'ΕΝΗΜΕΡΩΣΗ';
            case 'DELETE': return 'ΔΙΑΓΡΑΦΗ';
            case 'UPSERT': return 'ΕΝΗΜΕΡΩΣΗ';
            default: return method;
        }
    };

    const tooltipText = pendingItems.length > 0 
        ? pendingItems.slice(0, 10).map((i: any) => `${translateMethod(i.method)}: ${i.table}`).join('\n') + (pendingCount > 10 ? `\n...και ${pendingCount - 10} ακόμα` : '')
        : '';

    return (
        <div title={tooltipText} className="fixed bottom-4 right-4 z-[250] flex flex-col gap-2 pointer-events-none animate-in slide-in-from-bottom-6 fade-in duration-500">
            <div className={`
                pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border backdrop-blur-md min-w-[200px] transition-all
                ${isSyncing ? 'bg-blue-900/90 border-blue-500 text-white' : 
                  (!isOnline ? 'bg-amber-900/90 border-amber-500 text-amber-50' : 'bg-slate-900/90 border-slate-600 text-white')}
            `}>
                <div className="relative">
                    {isSyncing ? (
                        <RefreshCw size={24} className="animate-spin text-blue-400" />
                    ) : (
                        !isOnline ? <CloudOff size={24} className="text-amber-400" /> : <HardDrive size={24} className="text-slate-400" />
                    )}
                    {pendingCount > 0 && (
                        <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white ring-2 ring-slate-900">
                            {pendingCount}
                        </span>
                    )}
                </div>
                <div className="flex flex-col">
                    <span className="text-xs font-black uppercase tracking-wider opacity-70">
                        {isSyncing ? 'ΣΥΓΧΡΟΝΙΣΜΟΣ...' : (!isOnline ? 'ΕΚΤΟΣ ΣΥΝΔΕΣΗΣ' : 'ΕΚΚΡΕΜΕΙ ΣΥΓΧΡΟΝΙΣΜΟΣ')}
                    </span>
                    <span className="font-bold text-sm">
                        {pendingCount === 1 ? '1 αλλαγή σε αναμονή' : `${pendingCount} αλλαγές σε αναμονή`}
                    </span>
                </div>
            </div>
        </div>
    );
};

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
  const isMobile = useIsMobile();
  const [activePage, setActivePage] = useState<Page>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingItems, setPendingItems] = useState<any[]>([]);
  
  const queryClient = useQueryClient();
  const { showToast } = useUI();
  const { signOut, profile } = useAuth();

  const [printItems, setPrintItems] = useState<{product: Product, variant?: ProductVariant, quantity: number, size?: string, format?: 'standard' | 'simple' | 'retail'}[]>([]);
  const [orderToPrint, setOrderToPrint] = useState<Order | null>(null);
  const [batchToPrint, setBatchToPrint] = useState<ProductionBatch | null>(null);
  const [aggregatedPrintData, setAggregatedPrintData] = useState<AggregatedData | null>(null);
  const [preparationPrintData, setPreparationPrintData] = useState<{ batches: ProductionBatch[] } | null>(null);
  const [technicianPrintData, setTechnicianPrintData] = useState<{ batches: ProductionBatch[] } | null>(null);
  const [priceListPrintData, setPriceListPrintData] = useState<PriceListPrintData | null>(null);
  const [analyticsPrintData, setAnalyticsPrintData] = useState<any>(null);

  const [batchPrintSkus, setBatchPrintSkus] = useState('');
  const [resourceTab, setResourceTab] = useState<'materials' | 'molds'>('materials');
  
  const printContainerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Sync logic and event listeners
  useEffect(() => {
    if (isLocalMode) return;
    
    // Function to check queue size
    const checkQueue = async () => {
        const queue = await offlineDb.getQueue();
        setPendingItems(queue);
        return queue.length;
    };

    // Auto-sync function
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

    // Network listeners
    const handleOnline = () => { setIsOnline(true); handleSync(); };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Sync error listener
    const handleSyncError = (e: Event) => {
        const detail = (e as CustomEvent).detail;
        showToast(detail.message || "Σφάλμα συγχρονισμού. Το στοιχείο απορρίφθηκε.", "error");
        checkQueue(); 
    };
    window.addEventListener('ilios-sync-error', handleSyncError);

    const interval = setInterval(checkQueue, 2000);
    if (navigator.onLine) handleSync();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('ilios-sync-error', handleSyncError);
      clearInterval(interval);
    };
  }, []);

  const { data: settings, isLoading: loadingSettings } = useQuery<GlobalSettings>({ queryKey: ['settings'], queryFn: api.getSettings });
  const { data: materials, isLoading: loadingMaterials } = useQuery<Material[]>({ queryKey: ['materials'], queryFn: api.getMaterials });
  const { data: molds, isLoading: loadingMolds } = useQuery<Mold[]>({ queryKey: ['molds'], queryFn: api.getMolds });
  const { data: products, isLoading: loadingProducts } = useQuery<Product[]>({ queryKey: ['products'], queryFn: api.getProducts });
  const { data: collections, isLoading: loadingCollections } = useQuery<Collection[]>({ queryKey: ['collections'], queryFn: api.getCollections });

  // Intelligent Iframe Bridge Printing Effect
  useEffect(() => {
    const shouldPrint = printItems.length > 0 || orderToPrint || batchToPrint || aggregatedPrintData || preparationPrintData || technicianPrintData || priceListPrintData || analyticsPrintData;
    if (shouldPrint) {
      const timer = setTimeout(() => {
        const printContent = printContainerRef.current;
        const iframe = iframeRef.current;
        if (!printContent || !iframe) return;

        const iframeDoc = iframe.contentWindow?.document;
        if (!iframeDoc) return;

        // Determine Filename/Title for "Save as PDF"
        let docTitle = 'Ilios_Print_Job';
        const dateStr = new Date().toISOString().split('T')[0];

        if (priceListPrintData) {
            docTitle = priceListPrintData.title; 
        } else if (analyticsPrintData) {
            docTitle = `Economics_${dateStr}`;
        } else if (orderToPrint) {
            docTitle = `Order_${orderToPrint.id}_${orderToPrint.customer_name}`;
        } else if (batchToPrint) {
            docTitle = `Batch_${batchToPrint.sku}_${batchToPrint.id}`;
        } else if (aggregatedPrintData) {
            if (aggregatedPrintData.orderId) {
                docTitle = `Production_Order_${aggregatedPrintData.orderId}`;
            } else {
                docTitle = `Production_Summary_${dateStr}`;
            }
        } else if (preparationPrintData) {
            docTitle = `Preparation_Sheet_${dateStr}`;
        } else if (technicianPrintData) {
            docTitle = `Technician_Sheet_${dateStr}`;
        } else if (printItems.length > 0) {
            const format = printItems[0].format || 'standard';
            const totalQty = printItems.reduce((acc, item) => acc + item.quantity, 0);
            
            if (printItems.length === 1) {
                const item = printItems[0];
                const sku = item.variant ? item.product.sku + item.variant.suffix : item.product.sku;
                docTitle = `Label_${sku}_${format}`;
            } else {
                const firstSku = printItems[0].product.sku;
                const allSameProduct = printItems.every(i => i.product.sku === firstSku);
                
                if (allSameProduct) {
                     docTitle = `Labels_${firstSku}_Variants_${format}_${totalQty}qty`;
                } else {
                     docTitle = `Labels_Batch_${format}_${totalQty}qty_${dateStr}`;
                }
            }
        }

        // Sanitize for filename safety (replace spaces and special chars with underscores)
        docTitle = docTitle.replace(/[^a-zA-Z0-9\-_]/g, '_').replace(/_+/g, '_');

        const cleanup = () => {
            setPrintItems([]); setOrderToPrint(null); setBatchToPrint(null); 
            setAggregatedPrintData(null); setPreparationPrintData(null); 
            setTechnicianPrintData(null); setPriceListPrintData(null);
            setAnalyticsPrintData(null);
        };

        iframeDoc.open();
        
        let styles = '';
        document.querySelectorAll('style, link[rel="stylesheet"]').forEach(el => {
            styles += el.outerHTML;
        });

        iframeDoc.write(`
          <html>
            <head>
              <title>${docTitle}</title>
              ${styles}
              <style>
                body { background: white !important; margin: 0; padding: 0; }
                .print-view { display: block !important; }
                /* Label Printing Logic */
                .print-area { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: flex-start; }
                .label-container { 
                    page-break-after: always !important; 
                    break-after: page !important;
                    margin: 0 !important;
                    display: flex !important;
                }
                @media print {
                  @page { size: auto; margin: 0; }
                  html, body { height: 100%; margin: 0 !important; padding: 0 !important; }
                  .label-container { display: flex !important; }
                }
                * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
              </style>
            </head>
            <body>
              <div class="print-view">
                ${printContent.innerHTML}
              </div>
              <script>
                window.onload = function() {
                  setTimeout(function() {
                    window.focus();
                    window.print();
                  }, 500);
                };
              </script>
            </body>
          </html>
        `);
        iframeDoc.close();

        const handleAfterPrint = () => {
            cleanup();
            window.removeEventListener('focus', handleAfterPrint);
        };
        window.addEventListener('focus', handleAfterPrint, { once: true });
        setTimeout(cleanup, 5000);

      }, 800); 

      return () => clearTimeout(timer);
    }
  }, [printItems, orderToPrint, batchToPrint, aggregatedPrintData, preparationPrintData, technicianPrintData, priceListPrintData, analyticsPrintData]);

  if (loadingSettings || loadingMaterials || loadingMolds || loadingProducts || loadingCollections) {
    return <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-50 text-slate-500"><Loader2 size={48} className="animate-spin mb-4 text-amber-500" /><p className="font-medium text-lg">Φόρτωση ERP...</p></div>;
  }
  if (!settings || !products || !materials || !molds || !collections) return null;
  
  // ROLE-BASED ROUTING
  // 1. Store Clerk ('user') -> Employee App
  if (profile?.role === 'user') {
      return (
          <>
            <div ref={printContainerRef} className="print-view" aria-hidden="true">
                {printItems.length > 0 && (
                    <div className="print-area">
                    {printItems.flatMap(item => Array.from({ length: item.quantity }, () => ({ product: item.product, variant: item.variant, size: item.size, format: item.format || 'standard' }))).map((item, idx) => (
                        <BarcodeView 
                            key={`${idx}`} 
                            product={item.product} 
                            variant={item.variant} 
                            width={item.format === 'retail' ? (settings.retail_barcode_width_mm || 40) : settings.barcode_width_mm} 
                            height={item.format === 'retail' ? (settings.retail_barcode_height_mm || 20) : settings.barcode_height_mm} 
                            format={item.format} 
                            size={item.size}
                        />
                    ))}
                    </div>
                )}
            </div>
            <iframe 
                ref={iframeRef} 
                id="print-iframe" 
                style={{ position: 'absolute', width: 0, height: 0, border: 'none', visibility: 'hidden' }} 
                title="Print Bridge"
            ></iframe>
            <EmployeeApp setPrintItems={setPrintItems} />
          </>
      );
  }

  // 2. Seller ('seller') -> Seller App (NEW)
  if (profile?.role === 'seller') {
      return <SellerApp />;
  }

  // 3. Admin Logic
  if (profile?.role === 'admin') {
      if (isMobile) {
          return (
              <MobileApp 
                isOnline={isOnline} 
                isSyncing={isSyncing} 
                pendingItemsCount={pendingItems.length}
              />
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

  const handleNav = (page: Page) => {
    setActivePage(page);
    setIsSidebarOpen(false);
  };

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
  };

  const handlePrintAggregated = (batches: ProductionBatch[], orderDetails?: { orderId: string, customerName: string }) => {
      if (!settings || !materials || !products) return;

      let totalSilverWeight = 0;
      let totalSilverCost = 0;
      let totalMaterialsCost = 0;
      let totalInHouseLaborCost = 0;
      let totalImportedLaborCost = 0;
      let totalSubcontractCost = 0;

      const augmentedBatches: AggregatedBatch[] = batches.map(b => {
          const product = products.find(p => p.sku === b.sku);
          if (!product) return { ...b, cost_per_piece: 0, total_cost: 0 };

          const cost = calculateProductCost(product, settings, materials, products);
          const costPerPiece = cost.total;
          const totalCost = costPerPiece * b.quantity;

          const w = product.weight_g + (product.secondary_weight_g || 0);
          totalSilverWeight += (w * b.quantity);
          totalSilverCost += (cost.breakdown.silver * b.quantity);
          totalMaterialsCost += (cost.breakdown.materials * b.quantity);
          
          const labor = cost.breakdown.labor;
          const sub = cost.breakdown.details?.subcontract_cost || 0;

          if (product.production_type === 'Imported') {
             totalImportedLaborCost += (labor * b.quantity);
          } else {
             totalInHouseLaborCost += (labor * b.quantity);
          }
          totalSubcontractCost += (sub * b.quantity);

          return { ...b, cost_per_piece: costPerPiece, total_cost: totalCost, product_details: product };
      });

      const totalProductionCost = augmentedBatches.reduce((sum, b) => sum + b.total_cost, 0);

      setAggregatedPrintData({
          molds: new Map(), 
          materials: new Map(),
          components: new Map(),
          totalSilverWeight,
          batches: augmentedBatches,
          totalProductionCost,
          totalSilverCost,
          totalMaterialsCost,
          totalInHouseLaborCost,
          totalImportedLaborCost,
          totalSubcontractCost,
          orderId: orderDetails?.orderId,
          customerName: orderDetails?.customerName
      });
  };

  const handlePrintPreparation = (batches: ProductionBatch[]) => {
      setPreparationPrintData({ batches });
  };

  const handlePrintTechnician = (batches: ProductionBatch[]) => {
      setTechnicianPrintData({ batches });
  };
  
  const handlePrintOrderAnalytics = (order: Order) => {
      if (!products || !materials) return;
      const stats = calculateBusinessStats([order], products, materials);
      if (stats) {
        setAnalyticsPrintData({ ...stats, title: `Οικονομική Ανάλυση Παραγγελίας #${order.id}` });
      }
  };

  // DESKTOP RENDERING (ADMIN)
  // This part runs only if role is 'admin' and !isMobile, or if isLocalMode is true
  const handleLogout = () => { localStorage.removeItem('ILIOS_LOCAL_MODE'); signOut(); };

  return (
    <>
      <SyncStatusIndicator pendingItems={pendingItems} isOnline={isOnline} isSyncing={isSyncing} />

      <div ref={printContainerRef} className="print-view" aria-hidden="true">
        {orderToPrint && <OrderInvoiceView order={orderToPrint} />}
        {batchToPrint && <ProductionWorkerView batch={batchToPrint} allMolds={molds} allProducts={products} allMaterials={materials} />}
        {aggregatedPrintData && <AggregatedProductionView data={aggregatedPrintData} settings={settings} />}
        {preparationPrintData && <PreparationView batches={preparationPrintData.batches} allMaterials={materials} allProducts={products} allMolds={molds} />}
        {technicianPrintData && <TechnicianView batches={technicianPrintData.batches} />}
        {priceListPrintData && <PriceListPrintView data={priceListPrintData} />}
        {analyticsPrintData && <AnalyticsPrintReport stats={analyticsPrintData} title={analyticsPrintData.title} />}
        {printItems.length > 0 && (
            <div className="print-area">
            {printItems.flatMap(item => Array.from({ length: item.quantity }, () => ({ product: item.product, variant: item.variant, size: item.size, format: item.format || 'standard' }))).map((item, idx) => (
                <BarcodeView 
                    key={`${idx}`} 
                    product={item.product} 
                    variant={item.variant} 
                    width={item.format === 'retail' ? (settings.retail_barcode_width_mm || 40) : settings.barcode_width_mm} 
                    height={item.format === 'retail' ? (settings.retail_barcode_height_mm || 20) : settings.barcode_height_mm} 
                    format={item.format} 
                    size={item.size}
                />
            ))}
            </div>
        )}
      </div>

      <iframe 
        ref={iframeRef} 
        id="print-iframe" 
        style={{ position: 'absolute', width: 0, height: 0, border: 'none', visibility: 'hidden' }} 
        title="Print Bridge"
      ></iframe>

      <div id="app-container" className="flex h-screen overflow-hidden text-[#060b00] bg-slate-50 font-sans">
        {isSidebarOpen && <div className="fixed inset-0 bg-[#060b00]/60 backdrop-blur-sm z-40 md:hidden animate-in fade-in" onClick={() => setIsSidebarOpen(false)} />}
        <aside className={`fixed inset-y-0 left-0 z-40 bg-[#060b00] text-white transition-all duration-500 shadow-2xl flex flex-col ${isSidebarOpen ? 'translate-x-0 w-72' : '-translate-x-full md:translate-x-0'} ${isCollapsed ? 'md:w-20' : 'md:w-72'} border-r border-white/5`}>
          <div className={`p-6 flex items-center justify-center h-24 relative bg-black/20`}>
            {!isCollapsed ? <img src={APP_LOGO} alt="Ilios" className="h-16 w-auto object-contain drop-shadow-lg" /> : <img src={APP_ICON_ONLY} alt="Icon" className="w-10 h-10 object-contain" />}
            <button onClick={() => setIsSidebarOpen(false)} className="md:hidden text-slate-400 hover:text-white absolute right-4 top-6"><X size={24} /></button>
          </div>
          <div className={`px-4 py-2 flex items-center gap-3 ${isCollapsed ? 'justify-center' : 'justify-start'}`}>
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${isLocalMode ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : isOnline ? (isSyncing || pendingItems.length > 0 ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20') : 'bg-rose-500/10 text-rose-400 border-rose-500/20'}`}>
                {isLocalMode ? <><HardDrive size={12}/> {!isCollapsed && 'ΤΟΠΙΚΗ ΒΑΣΗ'}</> : isSyncing ? <><RefreshCw size={12} className="animate-spin"/> {!isCollapsed && 'ΣΥΓΧΡΟΝΙΣΜΟΣ'}</> : pendingItems.length > 0 ? <><RefreshCw size={12} /> {!isCollapsed && `${pendingItems.length} ΕΚΚΡΕΜΕΙ`}</> : isOnline ? <><Cloud size={12} className="animate-pulse"/> {!isCollapsed && 'ΣΥΝΔΕΔΕΜΕΝΟ'}</> : <><HardDrive size={12}/> {!isCollapsed && 'ΕΚΤΟΣ ΣΥΝΔΕΣΗΣ'}</>}
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
                <NavItem icon={<Users size={22} />} label="Πελάτες & Προμ." isActive={activePage === 'customers'} isCollapsed={isCollapsed} onClick={() => handleNav('customers')} />
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
            <NavItem icon={<ScrollText size={22} />} label="Τιμοκατάλογος" isActive={activePage === 'pricelist'} isCollapsed={isCollapsed} onClick={() => handleNav('pricelist')} />
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
            {!isCollapsed && <div className="mt-4 text-[10px] text-slate-500 text-center font-medium"><p>Τιμή Ασημιού: <span className="text-amber-500">{settings.silver_price_gram.toFixed(3)}€</span></p><p className="opacity-50 mt-1">v1.2</p></div>}
          </div>
        </aside>
        <main className={`flex-1 flex flex-col h-full overflow-hidden transition-all duration-500 ${isCollapsed ? 'md:ml-20' : 'md:ml-72'}`}>
          <header className="md:hidden bg-white/80 backdrop-blur-md p-4 shadow-sm flex items-center justify-between z-30 sticky top-0 border-b border-slate-200">
            <button onClick={() => setIsSidebarOpen(true)} className="text-slate-600 p-1 hover:bg-slate-100 rounded-lg"><Menu size={24} /></button>
            <div className="h-8"><img src={APP_LOGO} alt="Ilios" className="h-full w-auto object-contain" /></div>
            <div className={`w-2 h-2 rounded-full ${isLocalMode ? 'bg-amber-500' : isOnline ? (pendingItems.length > 0 ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500') : 'bg-rose-500 animate-pulse'}`} />
          </header>
          <div className="flex-1 overflow-y-auto p-4 md:p-8 relative scroll-smooth">
            <div className="max-w-[1600px] mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
              {activePage === 'dashboard' && <Dashboard products={products} settings={settings} onNavigate={handleNav} />}
              {activePage === 'registry' && <ProductRegistry setPrintItems={setPrintItems} />}
              {activePage === 'inventory' && <Inventory products={products} setPrintItems={setPrintItems} settings={settings} collections={collections} molds={molds} />}
              {activePage === 'orders' && <OrdersPage products={products} onPrintOrder={setOrderToPrint} materials={materials} onPrintAggregated={handlePrintAggregated} onPrintPreparation={handlePrintPreparation} onPrintTechnician={handlePrintTechnician} onPrintLabels={setPrintItems} onPrintAnalytics={handlePrintOrderAnalytics} />}
              {activePage === 'production' && <ProductionPage products={products} materials={materials} molds={molds} onPrintBatch={setBatchToPrint} onPrintAggregated={handlePrintAggregated} onPrintPreparation={handlePrintPreparation} onPrintTechnician={handlePrintTechnician} />}
              {activePage === 'customers' && <CustomersPage onPrintOrder={setOrderToPrint} />}
              {activePage === 'analytics' && <AnalyticsView products={products} onBack={() => handleNav('dashboard')} />}
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
              {activePage === 'collections' && <CollectionsPage products={products} onPrint={(data) => setPriceListPrintData(data)} />}
              {activePage === 'pricing' && <PricingManager products={products} settings={settings} materials={materials} />}
              {activePage === 'batch-print' && <BatchPrintPage allProducts={products} setPrintItems={setPrintItems} skusText={batchPrintSkus} setSkusText={setBatchPrintSkus} />}
              {activePage === 'settings' && <SettingsPage />}
              {activePage === 'ai-studio' && <AiStudio />}
              {activePage === 'pricelist' && <PriceListPage products={products} collections={collections} onPrint={(data) => setPriceListPrintData(data)} />}
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
