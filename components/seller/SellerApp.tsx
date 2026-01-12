
import React, { useState } from 'react';
import SellerLayout from './SellerLayout';
import SellerDashboard from './SellerDashboard';
import SellerOrders from './SellerOrders';
import SellerCatalog from './SellerCatalog';
import SellerCollections from './SellerCollections';
import SellerCustomers from './SellerCustomers';
import MobileOrderBuilder from '../mobile/MobileOrderBuilder';
import { Product, Order } from '../../types';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/supabase';
import { Loader2 } from 'lucide-react';

export default function SellerApp() {
  const [activePage, setActivePage] = useState('dashboard');
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  
  const { data: products, isLoading } = useQuery({ queryKey: ['products'], queryFn: api.getProducts });

  if (isLoading || !products) {
      return (
          <div className="h-screen w-full flex items-center justify-center bg-slate-50">
              <Loader2 size={32} className="animate-spin text-emerald-600"/>
          </div>
      );
  }

  const handleCreateOrder = () => {
      setEditingOrder(null);
      setActivePage('order-builder');
  };

  const handleEditOrder = (order: Order) => {
      setEditingOrder(order);
      setActivePage('order-builder');
  };

  const handleOrderBack = () => {
      setEditingOrder(null);
      setActivePage('orders');
  };

  let content: React.ReactNode = null;
  switch (activePage) {
    case 'dashboard':
      content = <SellerDashboard onNavigate={setActivePage} onCreateOrder={handleCreateOrder} />;
      break;
    case 'orders':
      content = <SellerOrders onCreate={handleCreateOrder} onEdit={handleEditOrder} />;
      break;
    case 'order-builder':
      content = (
        <div className="bg-white h-full">
            <MobileOrderBuilder 
                onBack={handleOrderBack} 
                initialOrder={editingOrder} 
                products={products} 
            />
        </div>
      );
      break;
    case 'catalog':
      content = <SellerCatalog products={products} />;
      break;
    case 'collections':
      content = <SellerCollections products={products} />;
      break;
    case 'customers':
      content = <SellerCustomers />;
      break;
    default:
      content = <SellerDashboard onNavigate={setActivePage} onCreateOrder={handleCreateOrder} />;
  }

  return (
    <SellerLayout activePage={activePage} onNavigate={setActivePage}>
      {content}
    </SellerLayout>
  );
}