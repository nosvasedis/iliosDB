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
  LogOut
} from 'lucide-react';
import { APP_LOGO, APP_ICON_ONLY } from './constants';
import { api, isConfigured } from './lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { Product, ProductVariant, GlobalSettings, Order, Material, Mold, Collection, ProductionBatch, RecipeItem } from './types';
import { UIProvider } from './components/UIProvider';
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


type Page = 'dashboard' | 'registry' | 'inventory' | 'pricing' | 'settings' | 'resources' | 'collections' | 'batch-print' | 'orders' | 'production' | 'customers' | 'ai-studio';

// Updated Interfaces for Aggregated Data
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
  
  // Printing State
  const [printItems, setPrintItems] = useState<{product: Product, variant?: ProductVariant, quantity: number, format?: 'standard' | 'simple'}[]>([]);
  const [orderToPrint, setOrderToPrint] = useState<Order | null>(null);
  const [batchToPrint, setBatchToPrint] = useState<ProductionBatch | null>(null);
  const [aggregatedPrintData, setAggregatedPrintData] = useState<AggregatedData | null>(null);


  // Batch Print state (lifted for persistence)
  const [batchPrintSkus, setBatchPrintSkus] = useState('');

  const { signOut, profile } = useAuth();

  // Resource Page Tab State
  const [resourceTab, setResourceTab] = useState<'materials' | 'molds'>('materials');
  
  // --- React Query Data Fetching ---
  const { data: settings, isLoading: loadingSettings } = useQuery<GlobalSettings>({ queryKey: ['settings'], queryFn: api.getSettings });
  const { data: materials, isLoading: loadingMaterials } = useQuery<Material[]>({ queryKey: ['materials'], queryFn: api.getMaterials });
  const { data: molds, isLoading: loadingMolds } = useQuery<Mold[]>({ queryKey: ['molds'], queryFn: api.getMolds });
  const { data: products, isLoading: loadingProducts } = useQuery<Product[]>({ queryKey: ['products'], queryFn: api.getProducts });
  const { data: collections, isLoading: loadingCollections } = useQuery<Collection[]>({ queryKey: ['collections'], queryFn: api.getCollections });

  const isLoading = loadingSettings || loadingMaterials || loadingMolds || loadingProducts || loadingCollections;

  useEffect(() => {
    const shouldPrint = printItems.length > 0 || orderToPrint || batchToPrint || aggregatedPrintData;
    if (shouldPrint) {
      const originalTitle = document.title;
      let newTitle = "Ilios_Kosmima_ERP_Εκτύπωση";
      const today = new Date().toISOString().split('T')[0];

      const sanitize = (name: string) => name.replace(/[^a-zA-Z0-9-Α-Ωα-ω\s]/g, '_').replace(/\s+/g, '_');

      const handleAfterPrint = () => {
        document.title = originalTitle;
        setPrintItems([]);
        setOrderToPrint(null);
        setBatchToPrint(null);
        setAggregatedPrintData(null);
        window.removeEventListener('afterprint', handleAfterPrint);
      };
      
      window.addEventListener('afterprint', handleAfterPrint);

      if (orderToPrint) {
        newTitle = `ΠΑΡΑΓΓΕΛΙΑ_${orderToPrint.id}_${sanitize(orderToPrint.customer_name)}`;
      } else if (batchToPrint) {
        newTitle = `ΕΝΤΟΛΗ_${batchToPrint.sku}${batchToPrint.variant_suffix || ''}_${batchToPrint.id.substring(0, 8)}`;
      } else if (aggregatedPrintData) {
        if (aggregatedPrintData.orderId && aggregatedPrintData.customerName) {
          newTitle = `ΠΑΡΑΓΩΓΗ_ΠΑΡΑΓΓΕΛΙΑ_${aggregatedPrintData.orderId}_${sanitize(aggregatedPrintData.customerName)}`;
        } else {
          newTitle = `ΣΥΓΚΕΝΤΡΩΤΙΚΗ_ΠΑΡΑΓΩΓΗ_${today}`;
        }
      } else if (printItems.length > 0) {
        const totalLabels = printItems.reduce((acc, item) => acc + item.quantity, 0);
        newTitle = `ΕΤΙΚΕΤΕΣ_${totalLabels}_τεμ_${today}`;
      }
      
      document.title = newTitle;

      const timer = setTimeout(() => {
        window.print();
        // Fallback for browsers that don't support 'afterprint' event
        if (!('onafterprint' in window)) {
             setTimeout(handleAfterPrint, 1000);
        }
      }, 500);
      
      return () => {
          clearTimeout(timer);
          window.removeEventListener('afterprint', handleAfterPrint);
          document.title = originalTitle;
      };
    }
  }, [printItems, orderToPrint, batchToPrint, aggregatedPrintData]);

  const handleNav = (page: Page) => {
    setActivePage(page);
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
  };
  
const handlePrintAggregated = (batchesToPrint: ProductionBatch[], orderDetails?: { orderId: string, customerName: string }) => {
    if (!molds || !materials || !products || !settings) return;
    
    // Initialize aggregators
    const aggregatedMolds: AggregatedData['molds'] = new Map();
    const aggregatedMaterials: AggregatedData['materials'] = new Map();
    const aggregatedComponents: AggregatedData['components'] = new Map();
    let totalSilverWeight = 0;
    let totalProductionCost = 0;
    let totalSilverCost = 0;
    let totalMaterialsCost = 0;
    let totalInHouseLaborCost = 0;
    let totalImportedLaborCost = 0;
    let totalSubcontractCost = 0;

    const batchesWithCost: AggregatedBatch[] = [];

    for (const batch of batchesToPrint) {
        const product = batch.product_details;
        if (!product) continue;

        const batchQuantity = batch.quantity;
        const fullSku = product.sku + (batch.variant_suffix || '');
        
        // --- COST CALCULATION ---
        let costResult;
        if (batch.variant_suffix) {
            costResult = estimateVariantCost(product, batch.variant_suffix, settings, materials, products);
        } else {
            costResult = calculateProductCost(product, settings, materials, products);
        }
        
        const costPerPiece = costResult.total;
        const totalBatchCost = costPerPiece * batchQuantity;
        
        batchesWithCost.push({ ...batch, cost_per_piece: costPerPiece, total_cost: totalBatchCost });

        // --- AGGREGATE TOTALS ---
        totalProductionCost += totalBatchCost;
        if (costResult.breakdown) {
            totalSilverCost += (costResult.breakdown.silver || 0) * batchQuantity;
            totalMaterialsCost += (costResult.breakdown.materials || 0) * batchQuantity;
            
            if (product.production_type === 'Imported') {
                totalImportedLaborCost += (costResult.breakdown.labor || 0) * batchQuantity;
            } else {
                totalInHouseLaborCost += (costResult.breakdown.labor || 0) * batchQuantity;
            }

            if (costResult.breakdown.details) {
                totalSubcontractCost += (costResult.breakdown.details.subcontract_cost || 0) * batchQuantity;
            }
        }

        totalSilverWeight += batchQuantity * product.weight_g;

        // Molds
        for (const pm of product.molds) {
            const moldDetails = molds.find(m => m.code === pm.code);
            if (!moldDetails) continue;

            if (!aggregatedMolds.has(pm.code)) {
                aggregatedMolds.set(pm.code, { ...moldDetails, usedIn: new Set() });
            }
            aggregatedMolds.get(pm.code)!.usedIn.add(fullSku);
        }

        // Recipe
        for (const recipeItem of product.recipe) {
            const requiredQuantity = batchQuantity * recipeItem.quantity;

            if (recipeItem.type === 'raw') {
                const materialDetails = materials.find(m => m.id === recipeItem.id);
                if (!materialDetails) continue;
                
                const itemTotalCost = requiredQuantity * materialDetails.cost_per_unit;

                if (aggregatedMaterials.has(materialDetails.id)) {
                    const existing = aggregatedMaterials.get(materialDetails.id)!;
                    existing.totalQuantity += requiredQuantity;
                    existing.totalCost += itemTotalCost;
                    existing.usedIn.set(fullSku, (existing.usedIn.get(fullSku) || 0) + requiredQuantity);
                } else {
                    aggregatedMaterials.set(materialDetails.id, {
                        name: materialDetails.name,
                        unit: materialDetails.unit,
                        totalQuantity: requiredQuantity,
                        totalCost: itemTotalCost,
                        usedIn: new Map([[fullSku, requiredQuantity]])
                    });
                }
            } else if (recipeItem.type === 'component') {
                const componentDetails = products.find(p => p.sku === recipeItem.sku);
                if (!componentDetails) continue;
                
                const itemTotalCost = requiredQuantity * componentDetails.active_price;

                if (aggregatedComponents.has(recipeItem.sku)) {
                    const existing = aggregatedComponents.get(recipeItem.sku)!;
                    existing.totalQuantity += requiredQuantity;
                    existing.totalCost += itemTotalCost;
                    existing.usedIn.set(fullSku, (existing.usedIn.get(fullSku) || 0) + requiredQuantity);
                } else {
                    aggregatedComponents.set(recipeItem.sku, {
                        sku: recipeItem.sku,
                        totalQuantity: requiredQuantity,
                        totalCost: itemTotalCost,
                        usedIn: new Map([[fullSku, requiredQuantity]])
                    });
                }
            }
        }
    }
    
    setAggregatedPrintData({
        molds: aggregatedMolds,
        materials: aggregatedMaterials,
        components: aggregatedComponents,
        totalSilverWeight: totalSilverWeight,
        batches: batchesWithCost,
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



  if (isLoading) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-50 text-slate-500 font-sans">
        <Loader2 size={48} className="animate-spin mb-4 text-amber-500" />
        <p className="font-medium text-lg tracking-tight">Φόρτωση ERP...</p>
      </div>
    );
  }

  if (!settings || !products || !materials || !molds || !collections) return null;
  
  const flattenedPrintItems = printItems.flatMap(item => 
      Array.from({ length: item.quantity }, () => ({ product: item.product, variant: item.variant, format: item.format }))
  );

  return (
    <>
      <div className="print-view">
        {orderToPrint && <OrderInvoiceView order={orderToPrint} />}
        {batchToPrint && (
            <ProductionWorkerView 
                batch={batchToPrint}
                allMolds={molds}
                allProducts={products}
                allMaterials={materials}
            />
        )}
        {aggregatedPrintData && <AggregatedProductionView data={aggregatedPrintData} settings={settings} />}
        
        {printItems.length > 0 && (
            <div className="print-area">
            {flattenedPrintItems.map((item, index) => (
                <BarcodeView 
                key={`${item.product.sku}-${item.variant?.suffix || 'master'}-${index}`}
                product={item.product} 
                variant={item.variant}
                width={settings.barcode_width_mm}
                height={settings.barcode_height_mm}
                format={item.format}
                />
            ))}
            </div>
        )}
      </div>
      
      <div id="app-container" className="flex h-screen overflow-hidden text-[#060b00] bg-slate-50 font-sans selection:bg-amber-100">
        {/* Mobile Overlay */}
        {isSidebarOpen && (
          <div 
            className="fixed inset-0 bg-[#060b00]/60 backdrop-blur-sm z-40 md:hidden animate-in fade-in duration-200"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside 
          className={`
            fixed inset-y-0 left-0 z-40 bg-[#060b00] text-white transition-all duration-500 ease-[cubic-bezier(0.25,0.8,0.25,1)] shadow-2xl flex flex-col
            ${isSidebarOpen ? 'translate-x-0 w-72' : '-translate-x-full md:translate-x-0'}
            ${isCollapsed ? 'md:w-20' : 'md:w-72'}
            border-r border-white/5
          `}
        >
          {/* Sidebar Header */}
          <div className={`p-6 flex items-center ${isCollapsed ? 'justify-center' : 'justify-center'} h-24 relative bg-black/20`}>
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
            
            <NavItem 
              icon={<LayoutDashboard size={22} />} 
              label="Πίνακας Ελέγχου" 
              isActive={activePage === 'dashboard'} 
              isCollapsed={isCollapsed}
              onClick={() => handleNav('dashboard')} 
            />
            
            <div className="my-2 mx-2">
                <button
                    onClick={() => handleNav('ai-studio')}
                    title={isCollapsed ? 'AI Studio' : ''}
                    className={`
                    w-full flex items-center ${isCollapsed ? 'justify-center' : 'justify-start'} gap-3 px-4 py-3.5 my-0.5 rounded-xl transition-all duration-300 group relative
                    ${activePage === 'ai-studio' 
                        ? 'bg-gradient-to-r from-[#060b00] to-emerald-900 text-white shadow-lg shadow-black/30 ring-1 ring-emerald-800' 
                        : 'text-emerald-200 hover:bg-white/5 hover:text-white border border-emerald-900/30 bg-[#0a1200]/50'}
                    `}
                >
                    <div className={`${activePage === 'ai-studio' ? 'text-white' : 'text-emerald-300 group-hover:text-white transition-colors duration-200'}`}>
                        <Sparkles size={22} className={activePage !== 'ai-studio' ? "animate-pulse" : ""} />
                    </div>
                    {!isCollapsed && <span className="font-bold truncate tracking-wide text-sm">AI Studio</span>}
                    {isCollapsed && (
                    <div className="absolute left-full ml-3 px-3 py-1.5 bg-[#060b00] text-white text-xs font-medium rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 shadow-xl border border-white/10 transition-opacity duration-200">
                        AI Studio
                    </div>
                    )}
                </button>
            </div>

            <div className="my-2 border-t border-white/10 mx-2"></div>
            
            <NavItem 
              icon={<Database size={22} />} 
              label="Μητρώο Κωδικών" 
              isActive={activePage === 'registry'} 
              isCollapsed={isCollapsed}
              onClick={() => handleNav('registry')} 
            />
            
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
              label="Πελάτες & Προμηθευτές" 
              isActive={activePage === 'customers'} 
              isCollapsed={isCollapsed}
              onClick={() => handleNav('customers')} 
            />
            
            <div className="my-2 border-t border-white/10 mx-2"></div>
            
            <NavItem 
              icon={<Warehouse size={22} />} 
              label="Αποθήκη & Στοκ" 
              isActive={activePage === 'inventory'} 
              isCollapsed={isCollapsed}
              onClick={() => handleNav('inventory')} 
            />
            
             <div className="my-2 border-t border-white/10 mx-2"></div>
            <NavItem 
              icon={<Layers size={22} />} 
              label="Υλικά & Λάστιχα" 
              isActive={activePage === 'resources'} 
              isCollapsed={isCollapsed}
              onClick={() => handleNav('resources')} 
            />
            <NavItem 
              icon={<FolderKanban size={22} />} 
              label="Συλλογές" 
              isActive={activePage === 'collections'} 
              isCollapsed={isCollapsed}
              onClick={() => handleNav('collections')} 
            />
            <div className="my-2 border-t border-white/10 mx-2"></div>
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
              
              {/* User Indicator */}
              <div className={`mt-4 pt-4 border-t border-white/10 ${isCollapsed ? 'flex justify-center px-2' : 'px-4'}`}>
                  {!isCollapsed ? (
                      <div className="flex items-center justify-between w-full">
                          <span className="text-sm font-medium text-white truncate">{profile?.full_name || 'User'}</span>
                          <button 
                              onClick={signOut} 
                              className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                              title="Αποσύνδεση"
                          >
                              <LogOut size={18} />
                          </button>
                      </div>
                  ) : (
                      <button 
                          onClick={signOut}
                          className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                          title="Αποσύνδεση"
                      >
                          <LogOut size={20} />
                      </button>
                  )}
              </div>
            </div>
          </nav>

          {/* Footer */}
          <div className="p-4 bg-black/20">
            <button 
              onClick={toggleCollapse}
              className="hidden md:flex w-full items-center justify-center p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
            >
              {isCollapsed ? <ChevronRight size={20} /> : <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider"><ChevronLeft size={16}/> <span>Σύμπτυξη</span></div>}
            </button>
            
            {!isCollapsed && (
                <div className="mt-4 text-xs text-slate-500 text-center font-medium animate-in fade-in duration-500">
                  <p>Τιμή Ασημιού: <span className="text-amber-500">{settings.silver_price_gram.toFixed(3).replace('.', ',')}€</span></p>
                  <p className="opacity-50 mt-1">v0.0.5-b (Beta)</p>
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
              {activePage === 'registry' && <ProductRegistry setPrintItems={setPrintItems} />}
              {activePage === 'inventory' && <Inventory products={products} setPrintItems={setPrintItems} settings={settings} collections={collections} molds={molds} />}
              {activePage === 'orders' && <OrdersPage products={products} onPrintOrder={setOrderToPrint} materials={materials} onPrintAggregated={handlePrintAggregated} />}
              {activePage === 'production' && <ProductionPage products={products} materials={materials} molds={molds} onPrintBatch={setBatchToPrint} onPrintAggregated={handlePrintAggregated} />}
              {activePage === 'customers' && <CustomersPage onPrintOrder={setOrderToPrint} />}
              
              {activePage === 'resources' && (
                <div className="space-y-6">
                    <div className="bg-white p-2 rounded-2xl shadow-sm border border-slate-100 w-fit flex gap-2 mx-auto sm:mx-0 overflow-x-auto">
                        <button onClick={() => setResourceTab('materials')} className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2 whitespace-nowrap ${resourceTab === 'materials' ? 'bg-[#060b00] text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}>
                            <Gem size={18} /> Υλικά
                        </button>
                        <button onClick={() => setResourceTab('molds')} className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2 whitespace-nowrap ${resourceTab === 'molds' ? 'bg-amber-500 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}>
                            <MapPin size={18} /> Λάστιχα
                        </button>
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