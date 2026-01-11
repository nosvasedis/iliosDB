
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
import { useQuery } from '@tanstack/react-query';
import { api } from './lib/supabase';
import { Loader2 } from 'lucide-react';
import { Product } from './types';

// Placeholder components for phases 5
const MobilePlaceholder = ({ title }: { title: string }) => (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center text-slate-400">
        <Loader2 className="mb-4 animate-spin" size={32}/>
        <h2 className="text-lg font-bold text-slate-600">{title}</h2>
        <p className="text-sm">Mobile version coming soon.</p>
    </div>
);

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
    case 'dashboard': content = <MobileDashboard products={products} settings={settings} />; break;
    case 'orders': content = <MobileOrders />; break;
    case 'production': content = <MobileProduction />; break;
    case 'inventory': content = <MobileInventory products={products} onProductSelect={setSelectedProduct} />; break;
    case 'menu': content = <MobileMenu onNavigate={setActivePage} activePage={activePage} />; break;
    
    // Sub-menu items
    case 'resources': content = <MobileResources />; break;
    case 'customers': content = <MobileCustomers />; break;
    
    // Remaining placeholders
    case 'registry': content = <MobilePlaceholder title="Registry" />; break;
    case 'pricing': content = <MobilePlaceholder title="Pricing" />; break;
    case 'batch-print': content = <MobilePlaceholder title="Print" />; break;
    case 'settings': content = <MobilePlaceholder title="Settings" />; break;
    case 'ai-studio': content = <MobilePlaceholder title="AI Studio" />; break;
    
    default: content = <MobileDashboard products={products} settings={settings} />;
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
