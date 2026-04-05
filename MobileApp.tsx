
import React, { Suspense, useState, useEffect, useRef } from 'react';
import MobileLayout from './components/mobile/MobileLayout';
import PriceListPrintView, { PriceListPrintData } from './components/PriceListPrintView';
import OrderInvoiceView from './components/OrderInvoiceView';
import ShipmentInvoiceView from './components/ShipmentInvoiceView';
import OfferPrintView from './components/OfferPrintView';
import AggregatedProductionView from './components/AggregatedProductionView';
import PreparationView from './components/PreparationView';
import TechnicianView from './components/TechnicianView';
import BarcodeView from './components/BarcodeView';
import SupplierOrderPrintView from './components/SupplierOrderPrintView';
import { Loader2 } from 'lucide-react';
import { Product, Order, ProductVariant, ProductionBatch, AggregatedData, Offer, SupplierOrder, OrderShipment, OrderShipmentItem } from './types';
import { lazyWithChunkRecovery } from './lib/chunkLoadRecovery';
import { buildAggregatedPrintData, getSafeClientName, getSingleOrderFromBatches, sanitizePrintSegment } from './features/printing';
import type { MobileAdminPage } from './surfaces/pageIds';
import { useMaterials } from './hooks/api/useMaterials';
import { useMolds } from './hooks/api/useMolds';
import { useProducts } from './hooks/api/useProducts';
import { useSettings } from './hooks/api/useSettings';
import { useWarehouses } from './hooks/api/useWarehouses';

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

  // Printing State
  const [priceListPrintData, setPriceListPrintData] = useState<PriceListPrintData | null>(null);
  const [orderToPrint, setOrderToPrint] = useState<Order | null>(null);
  const [remainingOrderToPrint, setRemainingOrderToPrint] = useState<Order | null>(null);
  const [shipmentToPrint, setShipmentToPrint] = useState<{ order: Order; shipment: OrderShipment; shipmentItems: OrderShipmentItem[] } | null>(null);
  const [offerToPrint, setOfferToPrint] = useState<Offer | null>(null);
  const [aggregatedPrintData, setAggregatedPrintData] = useState<AggregatedData | null>(null);
  const [preparationPrintData, setPreparationPrintData] = useState<{ batches: ProductionBatch[] } | null>(null);
  const [technicianPrintData, setTechnicianPrintData] = useState<{ batches: ProductionBatch[] } | null>(null);
  const [printItems, setPrintItems] = useState<{ product: Product, variant?: ProductVariant, quantity: number, size?: string, format?: 'standard' | 'simple' | 'retail' }[]>([]);
  const [supplierOrderToPrint, setSupplierOrderToPrint] = useState<SupplierOrder | null>(null);

  const printContainerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const { data: settings } = useSettings();
  const { data: products } = useProducts();
  const { data: warehouses } = useWarehouses();
  const { data: materials } = useMaterials();
  const { data: molds } = useMolds();

  const handlePrintAggregated = (batches: ProductionBatch[], orderDetails?: { orderId: string, customerName: string }) => {
    const aggregatedData = buildAggregatedPrintData(batches, products, materials, settings, {
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

  // PRINTING EFFECT
  useEffect(() => {
    const shouldPrint = printItems.length > 0 || orderToPrint || remainingOrderToPrint || shipmentToPrint || offerToPrint || aggregatedPrintData || preparationPrintData || technicianPrintData || priceListPrintData || supplierOrderToPrint;

    if (shouldPrint) {
      const timer = setTimeout(() => {
        const printContent = printContainerRef.current;
        const iframe = iframeRef.current;
        if (!printContent || !iframe) return;

        const iframeDoc = iframe.contentWindow?.document;
        if (!iframeDoc) return;

        let docTitle = 'Ilios_Mobile_Print';
        const dateStr = new Date().toISOString().split('T')[0];
        const previousWindowTitle = document.title;
        let titleRestored = false;
        const restoreWindowTitle = () => {
          if (!titleRestored) {
            document.title = previousWindowTitle;
            titleRestored = true;
          }
        };

        if (priceListPrintData) {
          docTitle = priceListPrintData.title;
        } else if (remainingOrderToPrint) {
          const safeName = getSafeClientName(remainingOrderToPrint.customer_name);
          docTitle = `Remaining_Items_${safeName || 'Client'}_${remainingOrderToPrint.id}`;
        } else if (shipmentToPrint) {
          const safeName = getSafeClientName(shipmentToPrint.order.customer_name);
          docTitle = `Shipment_${safeName || 'Client'}_${shipmentToPrint.order.id}_${shipmentToPrint.shipment.shipment_number}`;
        } else if (orderToPrint) {
          const safeName = getSafeClientName(orderToPrint.customer_name);
          docTitle = `Order_${safeName || 'Client'}_${orderToPrint.id}`;
        } else if (offerToPrint) {
          const safeName = getSafeClientName(offerToPrint.customer_name);
          docTitle = `Offer_${safeName || 'Client'}_${offerToPrint.id}`;
        } else if (supplierOrderToPrint) {
          docTitle = `PO_${supplierOrderToPrint.supplier_name.replace(/[\s\W]+/g, '_')}_${supplierOrderToPrint.id.slice(0, 6)}`;
        } else if (aggregatedPrintData) {
          if (aggregatedPrintData.orderId) {
            const safeName = getSafeClientName(aggregatedPrintData.customerName);
            docTitle = `Production_${safeName || 'Order'}_${aggregatedPrintData.orderId}`;
          } else {
            docTitle = `Production_Summary_${dateStr}`;
          }
        } else if (preparationPrintData) {
          const singleOrder = getSingleOrderFromBatches(preparationPrintData.batches);
          if (singleOrder) {
            const safeName = getSafeClientName(singleOrder.customerName);
            docTitle = `Preparation_${safeName || 'Order'}_${singleOrder.orderId}`;
          } else {
            docTitle = `Preparation_Sheet_${dateStr}`;
          }
        } else if (technicianPrintData) {
          const singleOrder = getSingleOrderFromBatches(technicianPrintData.batches);
          if (singleOrder) {
            const safeName = getSafeClientName(singleOrder.customerName);
            docTitle = `Technician_${safeName || 'Order'}_${singleOrder.orderId}`;
          } else {
            docTitle = `Technician_Sheet_${dateStr}`;
          }
        } else if (printItems.length > 0) {
          docTitle = `Labels_Batch_${dateStr}`;
        }
        docTitle = sanitizePrintSegment(docTitle) || 'Ilios_Mobile_Print';
        document.title = docTitle;

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
          setPriceListPrintData(null);
          setOrderToPrint(null);
          setRemainingOrderToPrint(null);
          setShipmentToPrint(null);
          setOfferToPrint(null);
          setAggregatedPrintData(null);
          setPreparationPrintData(null);
          setTechnicianPrintData(null);
          setSupplierOrderToPrint(null);
          setPrintItems([]);
          restoreWindowTitle();
          window.removeEventListener('focus', handleAfterPrint);
        };
        window.addEventListener('focus', handleAfterPrint, { once: true });
        // Fallback cleanup
        setTimeout(handleAfterPrint, 30000);

      }, 500);

      return () => clearTimeout(timer);
    }
  }, [printItems, orderToPrint, remainingOrderToPrint, shipmentToPrint, offerToPrint, aggregatedPrintData, preparationPrintData, technicianPrintData, priceListPrintData, supplierOrderToPrint]);

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
  }

  const pageRegistry: Record<MobileAdminPage, React.ReactNode> = {
    dashboard: <MobileDashboard products={products} settings={settings} onNavigate={handleNavigate} />,
    orders: <MobileOrders onCreate={handleCreateOrder} onEdit={handleEditOrder} onPrint={setOrderToPrint} onPrintRemainingOrder={setRemainingOrderToPrint} onPrintShipment={setShipmentToPrint} onPrintLabels={setPrintItems} products={products} onOpenDeliveries={(order) => { setPendingDeliveryOrderId(order.id); setActivePage('deliveries'); }} />,
    'order-builder': <MobileOrderBuilder onBack={() => { setActivePage('orders'); setEditingOrder(null); }} initialOrder={editingOrder} products={products} />,
    deliveries: <MobileDeliveries pendingOrderId={pendingDeliveryOrderId} onConsumePendingOrderId={() => setPendingDeliveryOrderId(null)} onOpenOrder={() => setActivePage('orders')} />,
    production: <MobileProduction allProducts={products} onPrintAggregated={handlePrintAggregated} onPrintPreparation={handlePrintPreparation} onPrintTechnician={handlePrintTechnician} onPrintLabels={setPrintItems} />,
    inventory: <MobileInventory products={products} onProductSelect={setSelectedProduct} />,
    menu: <MobileMenu onNavigate={handleNavigate} activePage={activePage} />,
    registry: <MobileRegistry products={products} onProductSelect={setSelectedProduct} />,
    'ai-studio': <MobileAiStudio />,
    settings: <MobileSettings />,
    resources: <MobileResources />,
    customers: <MobileCustomers mode="customers" />,
    suppliers: <MobileCustomers mode="suppliers" />,
    pricing: <MobilePricing />,
    'batch-print': <MobileBatchPrint />,
    collections: <MobileCollections />,
    pricelist: <MobilePriceList onPrint={setPriceListPrintData} />,
    offers: <MobileOffers onPrintOffer={setOfferToPrint} />,
  };

  return (
    <>
      {/* Hidden Print Container */}
      <div ref={printContainerRef} className="print-view" aria-hidden="true" style={{ display: 'none' }}>
        {priceListPrintData && <PriceListPrintView data={priceListPrintData} />}
        {orderToPrint && <OrderInvoiceView order={orderToPrint} />}
        {remainingOrderToPrint && <OrderInvoiceView order={remainingOrderToPrint} title="Υπόλοιπα Είδη Παραγγελίας" />}
        {shipmentToPrint && <ShipmentInvoiceView order={shipmentToPrint.order} shipment={shipmentToPrint.shipment} shipmentItems={shipmentToPrint.shipmentItems} products={products} />}
        {offerToPrint && <OfferPrintView offer={offerToPrint} />}
        {supplierOrderToPrint && <SupplierOrderPrintView order={supplierOrderToPrint} products={products} />}
        {aggregatedPrintData && <AggregatedProductionView data={aggregatedPrintData} settings={settings} />}
        {preparationPrintData && <PreparationView batches={preparationPrintData.batches} allMaterials={materials} allProducts={products} allMolds={molds} />}
        {technicianPrintData && <TechnicianView batches={technicianPrintData.batches} />}
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

      {/* Overlay for Product Details */}
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
