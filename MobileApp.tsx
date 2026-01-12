
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
import { useQuery } from '@tanstack/react-query';
import { api } from './lib/supabase';
import { Loader2 } from 'lucide-react';
import { Product, Order } from './types';

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
  const printContainerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: api.getSettings });
  const { data: products } = useQuery({ queryKey: ['products'], queryFn: api.getProducts });
  const { data: warehouses } = useQuery({ queryKey: ['warehouses'], queryFn: api.getWarehouses });

  // PRINTING EFFECT
  useEffect(() => {
    if (priceListPrintData) {
      const timer = setTimeout(() => {
        const printContent = printContainerRef.current;
        const iframe = iframeRef.current;
        if (!printContent || !iframe) return;

        const iframeDoc = iframe.contentWindow?.document;
        if (!iframeDoc) return;

        const docTitle = priceListPrintData.title.replace(/[^a-zA-Z0-9\-_]/g, '_');

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

        const handleAfterPrint = () => {
            setPriceListPrintData(null);
            window.removeEventListener('focus', handleAfterPrint);
        };
        window.addEventListener('focus', handleAfterPrint, { once: true });
        // Fallback cleanup
        setTimeout(() => setPriceListPrintData(null), 5000);

      }, 500);

      return () => clearTimeout(timer);
    }
  }, [priceListPrintData]);

  if (!settings || !products || !warehouses) {
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
    case 'orders': content = <MobileOrders onCreate={handleCreateOrder} onEdit={handleEditOrder} />; break;
    case 'order-builder': content = <MobileOrderBuilder onBack={() => { setActivePage('orders'); setEditingOrder(null); }} initialOrder={editingOrder} products={products} />; break;
    case 'production': content = <MobileProduction />; break;
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
    
    default: content = <MobileDashboard products={products} settings={settings} onNavigate={setActivePage} />;
  }

  return (
    <>
        {/* Hidden Print Container */}
        <div ref={printContainerRef} className="print-view" aria-hidden="true" style={{ display: 'none' }}>
            {priceListPrintData && <PriceListPrintView data={priceListPrintData} />}
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
            />
        )}
    </>
  );
}