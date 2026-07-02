
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
import type { SellerPage } from '../../surfaces/pageIds';
import { productKeys, productsRepository } from '../../features/products';
import IliosLoader from '../ui/IliosLoader';

export default function SellerApp() {
  const [activePage, setActivePage] = useState<SellerPage>('dashboard');
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const handleNavigate = (page: string) => setActivePage(page as SellerPage);
  const needsFullProducts = activePage === 'order-builder' || activePage === 'collections';
  const { data: products, isLoading: productsLoading } = useQuery({
    queryKey: productKeys.all,
    queryFn: productsRepository.getProducts,
    enabled: needsFullProducts,
  });

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

  const loadingView = <IliosLoader variant="section" className="h-full min-h-full bg-slate-50" />;

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
