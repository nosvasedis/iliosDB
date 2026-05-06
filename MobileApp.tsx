import React, { Suspense, useState } from 'react';
import { Loader2 } from 'lucide-react';
import MobileLayout from './components/mobile/MobileLayout';
import { PrintManager } from './components/PrintManager';
import { lazyWithChunkRecovery } from './lib/chunkLoadRecovery';
import { buildAggregatedPrintData } from './features/printing';
import { buildPartialOrderFromBatches } from './features/orders';
import { calculateBusinessStats } from './utils/businessAnalytics';
import type { MobileAdminPage } from './surfaces/pageIds';
import {
  AggregatedData,
  AssemblyPrintData,
  Offer,
  Order,
  OrderShipment,
  OrderShipmentItem,
  Product,
  ProductVariant,
  ProductionBatch,
  StageBatchPrintData,
  SupplierOrder,
} from './types';
import { useMaterials } from './hooks/api/useMaterials';
import { useMolds } from './hooks/api/useMolds';
import { useProducts } from './hooks/api/useProducts';
import { useSettings } from './hooks/api/useSettings';
import { useWarehouses } from './hooks/api/useWarehouses';
import { PriceListPrintData } from './components/PriceListPrintView';

const lazyMobilePage = <T extends React.ComponentType<any>>(factory: () => Promise<{ default: T }>) =>
  lazyWithChunkRecovery(factory, import.meta.url);

const MobileDashboard = lazyMobilePage(() => import('./components/mobile/MobileDashboard'));
const MobileMenu = lazyMobilePage(() => import('./components/mobile/MobileMenu'));
const MobileOrders = lazyMobilePage(() => import('./components/mobile/MobileOrders'));
const MobileOrderBuilder = lazyMobilePage(() => import('./components/mobile/MobileOrderBuilder'));
const MobileProduction = lazyMobilePage(() => import('./components/mobile/MobileProduction'));
const MobileInventory = lazyMobilePage(() => import('./components/mobile/MobileInventory'));
const MobileProductDetails = lazyMobilePage(() => import('./components/mobile/MobileProductDetails'));
const MobileResources = lazyMobilePage(() => import('./components/mobile/MobileResources'));
const MobileCustomers = lazyMobilePage(() => import('./components/mobile/MobileCustomers'));
const MobileRegistry = lazyMobilePage(() => import('./components/mobile/MobileRegistry'));
const MobileAiStudio = lazyMobilePage(() => import('./components/mobile/MobileAiStudio'));
const MobileSettings = lazyMobilePage(() => import('./components/mobile/MobileSettings'));
const MobilePricing = lazyMobilePage(() => import('./components/mobile/MobilePricing'));
const MobileBatchPrint = lazyMobilePage(() => import('./components/mobile/MobileBatchPrint'));
const MobileCollections = lazyMobilePage(() => import('./components/mobile/MobileCollections'));
const MobilePriceList = lazyMobilePage(() => import('./components/mobile/MobilePriceList'));
const MobileOffers = lazyMobilePage(() => import('./components/mobile/MobileOffers'));
const MobileDeliveries = lazyMobilePage(() => import('./components/mobile/MobileDeliveries'));
const MobileAnalytics = lazyMobilePage(() => import('./components/mobile/MobileAnalytics'));
const MobileSellers = lazyMobilePage(() => import('./components/mobile/MobileSellersPage'));

interface MobileAppProps {
  isOnline?: boolean;
  isSyncing?: boolean;
  pendingItemsCount?: number;
}

const MobileContentLoader = () => (
  <div className="min-h-[240px] w-full flex items-center justify-center bg-slate-50">
    <Loader2 size={28} className="animate-spin text-emerald-600" />
  </div>
);

export default function MobileApp({ isOnline = true, isSyncing = false, pendingItemsCount = 0 }: MobileAppProps) {
  const [activePage, setActivePage] = useState<MobileAdminPage>('dashboard');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [pendingDeliveryOrderId, setPendingDeliveryOrderId] = useState<string | null>(null);
  const handleNavigate = (page: string) => setActivePage(page as MobileAdminPage);

  const [priceListPrintData, setPriceListPrintData] = useState<PriceListPrintData | null>(null);
  const [orderToPrint, setOrderToPrint] = useState<Order | null>(null);
  const [remainingOrderToPrint, setRemainingOrderToPrint] = useState<Order | null>(null);
  const [shipmentToPrint, setShipmentToPrint] = useState<{ order: Order; shipment: OrderShipment; shipmentItems: OrderShipmentItem[] } | null>(null);
  const [shipmentsToPrint, setShipmentsToPrint] = useState<Array<{ order: Order; shipment: OrderShipment; shipmentItems: OrderShipmentItem[] }> | null>(null);
  const [offerToPrint, setOfferToPrint] = useState<Offer | null>(null);
  const [aggregatedPrintData, setAggregatedPrintData] = useState<AggregatedData | null>(null);
  const [preparationPrintData, setPreparationPrintData] = useState<{ batches: ProductionBatch[] } | null>(null);
  const [technicianPrintData, setTechnicianPrintData] = useState<{ batches: ProductionBatch[] } | null>(null);
  const [assemblyPrintData, setAssemblyPrintData] = useState<AssemblyPrintData | null>(null);
  const [analyticsPrintData, setAnalyticsPrintData] = useState<any | null>(null);
  const [orderAnalyticsData, setOrderAnalyticsData] = useState<{ stats: any; order: Order } | null>(null);
  const [photoCatalogPrintData, setPhotoCatalogPrintData] = useState<Product[] | null>(null);
  const [stageBatchPrintData, setStageBatchPrintData] = useState<StageBatchPrintData | null>(null);
  const [printItems, setPrintItems] = useState<{ product: Product; variant?: ProductVariant; quantity: number; size?: string; format?: 'standard' | 'simple' | 'retail' }[]>([]);
  const [supplierOrderToPrint, setSupplierOrderToPrint] = useState<SupplierOrder | null>(null);

  const { data: settings } = useSettings();
  const { data: products } = useProducts();
  const { data: warehouses } = useWarehouses();
  const { data: materials } = useMaterials();
  const { data: molds } = useMolds();

  const handlePrintAggregated = (batches: ProductionBatch[], orderDetails?: { orderId: string; customerName: string }) => {
    const aggregatedData = buildAggregatedPrintData(batches, products, materials, settings, {
      orderId: orderDetails?.orderId,
      customerName: orderDetails?.customerName,
    });
    if (aggregatedData) setAggregatedPrintData(aggregatedData);
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
    const stats = calculateBusinessStats([order], products, materials, settings);
    if (stats) {
      setOrderAnalyticsData({ stats, order });
    }
  };

  if (!settings || !products || !warehouses || !materials || !molds) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-slate-50">
        <Loader2 size={32} className="animate-spin text-emerald-600" />
      </div>
    );
  }

  const handleEditOrder = (order: Order) => {
    setEditingOrder(order);
    setActivePage('order-builder');
  };

  const handleCreateOrder = () => {
    setEditingOrder(null);
    setActivePage('order-builder');
  };

  const pageRegistry: Record<MobileAdminPage, React.ReactNode> = {
    dashboard: <MobileDashboard products={products} settings={settings} onNavigate={handleNavigate} />,
    orders: (
      <MobileOrders
        onCreate={handleCreateOrder}
        onEdit={handleEditOrder}
        onPrint={setOrderToPrint}
        onPrintRemainingOrder={setRemainingOrderToPrint}
        onPrintShipment={setShipmentToPrint}
        onPrintLabels={setPrintItems}
        onPrintAggregated={handlePrintAggregated}
        onPrintPreparation={handlePrintPreparation}
        onPrintTechnician={handlePrintTechnician}
        onPrintAnalytics={handlePrintOrderAnalytics}
        onPrintPartialOrder={(order, selectedBatches) => {
          setOrderToPrint(buildPartialOrderFromBatches(order, selectedBatches));
        }}
        products={products}
        onOpenDeliveries={(order) => {
          setPendingDeliveryOrderId(order.id);
          setActivePage('deliveries');
        }}
      />
    ),
    'order-builder': <MobileOrderBuilder onBack={() => { setActivePage('orders'); setEditingOrder(null); }} initialOrder={editingOrder} products={products} />,
    deliveries: <MobileDeliveries pendingOrderId={pendingDeliveryOrderId} onConsumePendingOrderId={() => setPendingDeliveryOrderId(null)} onOpenOrder={() => setActivePage('orders')} />,
    production: (
      <MobileProduction
        allProducts={products}
        onPrintAggregated={handlePrintAggregated}
        onPrintPreparation={handlePrintPreparation}
        onPrintTechnician={handlePrintTechnician}
        onPrintAssembly={handlePrintAssembly}
        onPrintStageBatches={handlePrintStageBatches}
        onPrintLabels={setPrintItems}
      />
    ),
    inventory: <MobileInventory products={products} onProductSelect={setSelectedProduct} />,
    menu: <MobileMenu onNavigate={handleNavigate} activePage={activePage} />,
    registry: <MobileRegistry products={products} onProductSelect={setSelectedProduct} />,
    'ai-studio': <MobileAiStudio />,
    settings: <MobileSettings />,
    resources: <MobileResources />,
    customers: <MobileCustomers mode="customers" />,
    suppliers: <MobileCustomers mode="suppliers" onPrintSupplierOrder={setSupplierOrderToPrint} />,
    pricing: <MobilePricing />,
    'batch-print': <MobileBatchPrint onPrintLabels={setPrintItems} onPrintPhotoCatalog={setPhotoCatalogPrintData} />,
    collections: <MobileCollections />,
    pricelist: <MobilePriceList onPrint={setPriceListPrintData} />,
    offers: <MobileOffers onPrintOffer={setOfferToPrint} />,
    analytics: <MobileAnalytics products={products} onPrint={(data) => setAnalyticsPrintData({ ...data, title: 'Οικονομική Ανάλυση' })} />,
    sellers: <MobileSellers />,
  };

  return (
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
        orderAnalyticsData={orderAnalyticsData}
        photoCatalogPrintData={photoCatalogPrintData}
        stageBatchPrintData={stageBatchPrintData}
        setPrintItems={setPrintItems as (items: []) => void}
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
        setOrderAnalyticsData={setOrderAnalyticsData}
        setPhotoCatalogPrintData={setPhotoCatalogPrintData}
        setStageBatchPrintData={setStageBatchPrintData}
      />

      <MobileLayout
        activePage={activePage}
        onNavigate={(page) => setActivePage(page)}
        isOnline={isOnline}
        isSyncing={isSyncing}
        pendingCount={pendingItemsCount}
      >
        <Suspense fallback={<MobileContentLoader />}>
          {pageRegistry[activePage]}
        </Suspense>
      </MobileLayout>

      {selectedProduct && (
        <Suspense fallback={<MobileContentLoader />}>
          <MobileProductDetails
            product={selectedProduct}
            onClose={() => setSelectedProduct(null)}
            warehouses={warehouses}
            setPrintItems={setPrintItems}
          />
        </Suspense>
      )}
    </>
  );
}
