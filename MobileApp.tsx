
import React, { useState, useEffect, useRef } from 'react';
import MobileLayout from './components/mobile/MobileLayout';
import MobileDashboard from './components/mobile/MobileDashboard';
import MobileMenu from './components/mobile/MobileMenu';
import MobileOrders from './components/mobile/MobileOrders';
import MobileOrderBuilder from './components/mobile/MobileOrderBuilder';
import MobileProduction from './components/mobile/MobileProduction';
import MobileInventory from './components/mobile/MobileInventory';
import MobileProductDetails from './components/mobile/MobileProductDetails';
import MobileResources from './components/mobile/MobileResources';
import MobileCustomers from './components/mobile/MobileCustomers';
import MobileRegistry from './components/mobile/MobileRegistry';
import MobileAiStudio from './components/mobile/MobileAiStudio';
import MobileSettings from './components/mobile/MobileSettings';
import MobilePricing from './components/mobile/MobilePricing';
import MobileBatchPrint from './components/mobile/MobileBatchPrint';
import MobileCollections from './components/mobile/MobileCollections';
import MobilePriceList from './components/mobile/MobilePriceList';
import PriceListPrintView, { PriceListPrintData } from './components/PriceListPrintView';
import OrderInvoiceView from './components/OrderInvoiceView';
import AggregatedProductionView from './components/AggregatedProductionView';
import PreparationView from './components/PreparationView';
import TechnicianView from './components/TechnicianView';
import ProductionWorkerView from './components/ProductionWorkerView';
import { useQuery } from '@tanstack/react-query';
import { api } from './lib/supabase';
import { Loader2 } from 'lucide-react';
import { Product, Order, ProductionBatch, AggregatedData, AggregatedBatch } from './types';
import { calculateProductCost } from './utils/pricingEngine';

interface MobileAppProps {
    isOnline?: boolean;
    isSyncing?: boolean;
    pendingItemsCount?: number;
}

export default function MobileApp({ isOnline = true, isSyncing = false, pendingItemsCount = 0 }: MobileAppProps) {
  const [activePage, setActivePage] = useState('dashboard');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  
  // Printing State
  const [priceListPrintData, setPriceListPrintData] = useState<PriceListPrintData | null>(null);
  const [orderToPrint, setOrderToPrint] = useState<Order | null>(null);
  const [batchToPrint, setBatchToPrint] = useState<ProductionBatch | null>(null);
  const [aggregatedPrintData, setAggregatedPrintData] = useState<AggregatedData | null>(null);
  const [preparationPrintData, setPreparationPrintData] = useState<{ batches: ProductionBatch[] } | null>(null);
  const [technicianPrintData, setTechnicianPrintData] = useState<{ batches: ProductionBatch[] } | null>(null);
  
  const printContainerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: api.getSettings });
  const { data: products } = useQuery({ queryKey: ['products'], queryFn: api.getProducts });
  const { data: warehouses } = useQuery({ queryKey: ['warehouses'], queryFn: api.getWarehouses });
  const { data: materials } = useQuery({ queryKey: ['materials'], queryFn: api.getMaterials });
  const { data: molds } = useQuery({ queryKey: ['molds'], queryFn: api.getMolds });

  // PRINTING EFFECT
  useEffect(() => {
    const shouldPrint = priceListPrintData || orderToPrint || batchToPrint || aggregatedPrintData || preparationPrintData || technicianPrintData;
    
    if (shouldPrint) {
      const timer = setTimeout(() => {
        const printContent = printContainerRef.current;
        const iframe = iframeRef.current;
        if (!printContent || !iframe) return;

        const iframeDoc = iframe.contentWindow?.document;
        if (!iframeDoc) return;

        let docTitle = 'Document';
        if (priceListPrintData) docTitle = priceListPrintData.title.replace(/[^a-zA-Z0-9\-_]/g, '_');
        else if (orderToPrint) docTitle = `Order_${orderToPrint.id}`;
        else if (batchToPrint) docTitle = `Batch_${batchToPrint.sku}_${batchToPrint.id}`;
        else if (aggregatedPrintData) docTitle = `Production_Summary`;

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
                @media print {
                  @page { size: auto; margin: 0; }
                  html, body { height: 100%; margin: 0 !important; padding: 0 !important; }
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

        const cleanup = () => {
            setPriceListPrintData(null);
            setOrderToPrint(null);
            setBatchToPrint(null);
            setAggregatedPrintData(null);
            setPreparationPrintData(null);
            setTechnicianPrintData(null);
        };

        const handleAfterPrint = () => {
            cleanup();
            window.removeEventListener('focus', handleAfterPrint);
        };
        window.addEventListener('focus', handleAfterPrint, { once: true });
        setTimeout(cleanup, 5000);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [priceListPrintData, orderToPrint, batchToPrint, aggregatedPrintData, preparationPrintData, technicianPrintData]);

  if (!settings || !products || !warehouses) {
      return (
          <div className="h-screen w-full flex items-center justify-center bg-slate-50">
              <Loader2 size={32} className="animate-spin text-emerald-600"/>
          </div>
      );
  }

  const handlePrintAggregated = (batches: ProductionBatch[], orderDetails?: { orderId: string, customerName: string }) => {
      if (!settings || !materials || !products) return;
      let totalSilverWeight = 0, totalSilverCost = 0, totalMaterialsCost = 0, totalInHouseLaborCost = 0, totalImportedLaborCost = 0, totalSubcontractCost = 0;

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
          if (product.production_type === 'Imported') totalImportedLaborCost += (labor * b.quantity);
          else totalInHouseLaborCost += (labor * b.quantity);
          totalSubcontractCost += (sub * b.quantity);
          return { ...b, cost_per_piece: costPerPiece, total_cost: totalCost, product_details: product };
      });

      setAggregatedPrintData({
          molds: new Map(), materials: new Map(), components: new Map(),
          totalSilverWeight, batches: augmentedBatches,
          totalProductionCost: augmentedBatches.reduce((sum, b) => sum + b.total_cost, 0),
          totalSilverCost, totalMaterialsCost, totalInHouseLaborCost, totalImportedLaborCost, totalSubcontractCost,
          orderId: orderDetails?.orderId, customerName: orderDetails?.customerName
      });
  };

  const handleEditOrder = (order: Order) => {
      setEditingOrder(order);
      setActivePage('order-builder');
  };

  const handleCreateOrder = () => {
      setEditingOrder(null);
      setActivePage('order-builder');
  }

  let content;
  switch (activePage) {
    case 'dashboard': content = <MobileDashboard products={products} settings={settings} onNavigate={setActivePage} />; break;
    case 'orders': content = <MobileOrders onCreate={handleCreateOrder} onEdit={handleEditOrder} onPrint={setOrderToPrint} products={products} materials={materials || []} onPrintAggregated={handlePrintAggregated} onPrintPreparation={(b) => setPreparationPrintData({batches: b})} onPrintTechnician={(b) => setTechnicianPrintData({batches: b})} />; break;
    case 'order-builder': content = <MobileOrderBuilder onBack={() => { setActivePage('orders'); setEditingOrder(null); }} initialOrder={editingOrder} products={products} />; break;
    case 'production': content = <MobileProduction onPrintBatch={setBatchToPrint} onPrintAggregated={handlePrintAggregated} onPrintPreparation={(b) => setPreparationPrintData({batches: b})} onPrintTechnician={(b) => setTechnicianPrintData({batches: b})} />; break;
    case 'inventory': content = <MobileInventory products={products} onProductSelect={setSelectedProduct} />; break;
    case 'menu': content = <MobileMenu onNavigate={setActivePage} activePage={activePage} />; break;
    case 'registry': content = <MobileRegistry products={products} onProductSelect={setSelectedProduct} />; break;
    case 'ai-studio': content = <MobileAiStudio />; break;
    case 'settings': content = <MobileSettings />; break;
    case 'resources': content = <MobileResources />; break;
    case 'customers': content = <MobileCustomers />; break;
    case 'pricing': content = <MobilePricing />; break;
    case 'batch-print': content = <MobileBatchPrint />; break;
    case 'collections': content = <MobileCollections />; break;
    case 'pricelist': content = <MobilePriceList onPrint={setPriceListPrintData} />; break;
    default: content = <MobileDashboard products={products} settings={settings} onNavigate={setActivePage} />;
  }

  return (
    <>
        <div ref={printContainerRef} className="print-view" aria-hidden="true" style={{ display: 'none' }}>
            {priceListPrintData && <PriceListPrintView data={priceListPrintData} />}
            {orderToPrint && <OrderInvoiceView order={orderToPrint} />}
            {batchToPrint && molds && products && materials && <ProductionWorkerView batch={batchToPrint} allMolds={molds} allProducts={products} allMaterials={materials} />}
            {aggregatedPrintData && settings && <AggregatedProductionView data={aggregatedPrintData} settings={settings} />}
            {preparationPrintData && materials && products && molds && <PreparationView batches={preparationPrintData.batches} allMaterials={materials} allProducts={products} allMolds={molds} />}
            {technicianPrintData && <TechnicianView batches={technicianPrintData.batches} />}
        </div>
        <iframe ref={iframeRef} style={{ position: 'absolute', width: 0, height: 0, border: 'none', visibility: 'hidden' }} title="Print Bridge"></iframe>
        <MobileLayout activePage={activePage} onNavigate={setActivePage} isOnline={isOnline} isSyncing={isSyncing} pendingCount={pendingItemsCount}>{content}</MobileLayout>
        {selectedProduct && <MobileProductDetails product={selectedProduct} onClose={() => setSelectedProduct(null)} warehouses={warehouses}/>}
    </>
  );
}
