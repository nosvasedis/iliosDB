
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
import { Loader2 } from 'lucide-react';
import type { SellerPage } from '../../surfaces/pageIds';
import { productKeys, productsRepository } from '../../features/products';

export default function SellerApp() {
  const [activePage, setActivePage] = useState<SellerPage>('dashboard');
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const handleNavigate = (page: string) => setActivePage(page as SellerPage);
  
  const { data: products, isLoading: productsLoading } = useQuery({ queryKey: productKeys.all, queryFn: productsRepository.getProducts });

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

  const loadingView = (
    <div className="h-full flex items-center justify-center bg-slate-50">
      <Loader2 size={32} className="animate-spin text-emerald-600" />
    </div>
  );

  const pageRegistry: Record<SellerPage, React.ReactNode> = {
    dashboard: <SellerDashboard onNavigate={handleNavigate} onCreateOrder={handleCreateOrder} />,
    orders: <SellerOrders onCreate={handleCreateOrder} onEdit={handleEditOrder} />,
    'order-builder': productsLoading || !products ? loadingView : (
      <div className="bg-white h-full">
        <MobileOrderBuilder
          onBack={handleOrderBack}
          initialOrder={editingOrder}
          products={products}
          attachSeller={true}
        />
      </div>
    ),
    catalog: <SellerCatalog />,
    collections: productsLoading || !products ? loadingView : <SellerCollections products={products} />,
    customers: <SellerCustomers />,
  };

  return (
    <SellerLayout activePage={activePage} onNavigate={(page) => setActivePage(page)}>
      {pageRegistry[activePage]}
    </SellerLayout>
  );
}
