
import React, { useState } from 'react';
import MobileLayout from './components/mobile/MobileLayout';
import MobileDashboard from './components/mobile/MobileDashboard';
import MobileMenu from './components/mobile/MobileMenu';
import MobileOrders from './components/mobile/MobileOrders';
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
import { useQuery } from '@tanstack/react-query';
import { api } from './lib/supabase';
import { Loader2 } from 'lucide-react';
import { Product } from './types';

export default function MobileApp() {
  const [activePage, setActivePage] = useState('dashboard');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: api.getSettings });
  const { data: products } = useQuery({ queryKey: ['products'], queryFn: api.getProducts });
  const { data: warehouses } = useQuery({ queryKey: ['warehouses'], queryFn: api.getWarehouses });

  if (!settings || !products || !warehouses) {
      return (
          <div className="h-screen w-full flex items-center justify-center bg-slate-50">
              <Loader2 size={32} className="animate-spin text-emerald-600"/>
          </div>
      );
  }

  let content;
  switch (activePage) {
    case 'dashboard': content = <MobileDashboard products={products} settings={settings} onNavigate={setActivePage} />; break;
    case 'orders': content = <MobileOrders />; break;
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
    
    default: content = <MobileDashboard products={products} settings={settings} onNavigate={setActivePage} />;
  }

  return (
    <>
        <MobileLayout activePage={activePage} onNavigate={setActivePage}>
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
