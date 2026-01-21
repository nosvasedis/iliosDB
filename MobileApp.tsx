
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
import MobileOffers from './components/mobile/MobileOffers';
import PriceListPrintView, { PriceListPrintData } from './components/PriceListPrintView';
import OrderInvoiceView from './components/OrderInvoiceView';
import OfferPrintView from './components/OfferPrintView';
import AggregatedProductionView from './components/AggregatedProductionView';
import PreparationView from './components/PreparationView';
import TechnicianView from './components/TechnicianView';
import BarcodeView from './components/BarcodeView';
import { useQuery } from '@tanstack/react-query';
import { api } from './lib/supabase';
import { Loader2 } from 'lucide-react';
import { Product, Order, ProductVariant, ProductionBatch, AggregatedBatch, AggregatedData, Offer } from './types';
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
  const [offerToPrint, setOfferToPrint] = useState<Offer | null>(null);
  const [batchToPrint, setBatchToPrint] = useState<ProductionBatch | null>(null);
  const [aggregatedPrintData, setAggregatedPrintData] = useState<AggregatedData | null>(null);
  const [preparationPrintData, setPreparationPrintData] = useState<{ batches: ProductionBatch[] } | null>(null);
  const [technicianPrintData, setTechnicianPrintData] = useState<{ batches: ProductionBatch[] } | null>(null);
  const [printItems, setPrintItems] = useState<{product: Product, variant?: ProductVariant, quantity: number, size?: string, format?: 'standard' | 'simple' | 'retail'}[]>([]);

  const printContainerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: api.getSettings });
  const { data: products } = useQuery({ queryKey: ['products'], queryFn: api.getProducts });
  const { data: warehouses } = useQuery({ queryKey: ['warehouses'], queryFn: api.getWarehouses });
  const { data: materials } = useQuery({ queryKey: ['materials'], queryFn: api.getMaterials });
  const { data: molds } = useQuery({ queryKey: ['molds'], queryFn: api.getMolds });

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

  // PRINTING EFFECT
  useEffect(() => {
    const shouldPrint = printItems.length > 0 || orderToPrint || offerToPrint || batchToPrint || aggregatedPrintData || preparationPrintData || technicianPrintData || priceListPrintData;
    
    if (shouldPrint) {
      const timer = setTimeout(() => {
        const printContent = printContainerRef.current;
        const iframe = iframeRef.current;
        if (!printContent || !iframe) return;

        const iframeDoc = iframe.contentWindow?.document;
        if (!iframeDoc) return;

        let docTitle = 'Ilios_Mobile_Print';
        if (priceListPrintData) {
             docTitle = priceListPrintData.title.replace(/[^a-zA-Z0-9\-_]/g, '_');
        } else if (orderToPrint) {
             docTitle = `Order_${orderToPrint.id}`;
        } else if (offerToPrint) {
             docTitle = `Offer_${offerToPrint.id}`;
        } else if (aggregatedPrintData) {
             docTitle = `Production_Summary_${new Date().toISOString().split('T')[0]}`;
        }

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
            setOfferToPrint(null);
            setBatchToPrint(null);
            setAggregatedPrintData(null);
            setPreparationPrintData(null);
            setTechnicianPrintData(null);
            setPrintItems([]);
            window.removeEventListener('focus', handleAfterPrint);
        };
        window.addEventListener('focus', handleAfterPrint, { once: true });
        // Fallback cleanup
        setTimeout(handleAfterPrint, 5000);

      }, 500);

      return () => clearTimeout(timer);
    }
  }, [printItems, orderToPrint, offerToPrint, batchToPrint, aggregatedPrintData, preparationPrintData, technicianPrintData, priceListPrintData]);

  if (!settings || !products || !warehouses || !materials || !molds) {
      return (
          <div className="h-screen w-full flex items-center justify-center bg-slate-50">
              <Loader2 size={32} className="animate-spin text-emerald-600"/>
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

  let content;
  switch (activePage) {
    case 'dashboard': content = <MobileDashboard products={products} settings={settings} onNavigate={setActivePage} />; break;
    case 'orders': content = <MobileOrders onCreate={handleCreateOrder} onEdit={handleEditOrder} onPrint={setOrderToPrint} onPrintLabels={setPrintItems} products={products} />; break;
    case 'order-builder': content = <MobileOrderBuilder onBack={() => { setActivePage('orders'); setEditingOrder(null); }} initialOrder={editingOrder} products={products} />; break;
    case 'production': content = <MobileProduction onPrintAggregated={handlePrintAggregated} onPrintPreparation={handlePrintPreparation} onPrintTechnician={handlePrintTechnician} />; break;
    case 'inventory': content = <MobileInventory products={products} onProductSelect={setSelectedProduct} />; break;
    case 'menu': content = <MobileMenu onNavigate={setActivePage} activePage={activePage} />; break;
    
    // Sub-menu items
    case 'registry': content = <MobileRegistry products={products} onProductSelect={setSelectedProduct} />; break;
    case 'ai-studio': content = <MobileAiStudio />; break;
    case 'settings': content = <MobileSettings />; break;
    case 'resources': content = <MobileResources />; break;
    case 'customers': content = <MobileCustomers />; break;
    case 'pricing': content = <MobilePricing />; break;
    case 'batch-print': content = <MobileBatchPrint />; break;
    case 'collections': content = <MobileCollections />; break;
    case 'pricelist': content = <MobilePriceList onPrint={setPriceListPrintData} />; break;
    case 'offers': content = <MobileOffers onPrintOffer={setOfferToPrint} />; break;
    
    default: content = <MobileDashboard products={products} settings={settings} onNavigate={setActivePage} />;
  }

  return (
    <>
        {/* Hidden Print Container */}
        <div ref={printContainerRef} className="print-view" aria-hidden="true" style={{ display: 'none' }}>
            {priceListPrintData && <PriceListPrintView data={priceListPrintData} />}
            {orderToPrint && <OrderInvoiceView order={orderToPrint} />}
            {offerToPrint && <OfferPrintView offer={offerToPrint} />}
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
            onNavigate={setActivePage}
            isOnline={isOnline}
            isSyncing={isSyncing}
            pendingCount={pendingItemsCount}
        >
            {content}
        </MobileLayout>
        
        {/* Overlay for Product Details */}
        {selectedProduct && (
            <MobileProductDetails 
                product={selectedProduct} 
                onClose={() => setSelectedProduct(null)} 
                warehouses={warehouses}
                setPrintItems={setPrintItems}
            />
        )}
    </>
  );
}
